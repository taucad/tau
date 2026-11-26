/**
 * ChatSessionStore
 *
 * Vanilla, dual-lifetime store that owns the long-lived per-chat objects:
 * the chat's log projection and session actor, the `chatPersistenceMachine` actor, and the
 * `draftMachine` actor. React components subscribe but never own — every
 * lifetime survives subtree unmount/remount cycles, eliminating the class of
 * "headless component reuse" races that plagued the prior `<ChatInstance>`
 * design (load wipes in-flight messages, persist dropped while loading,
 * draft state leaking across chats, cross-chat persist mis-targeting).
 *
 * Lifetime ownership:
 * - `acquire(chatId, projectId)` / `release(chatId)` track React views only; the
 *   caller names the chat's project (PV-S4).
 * - An active run retains the session independently of a view, so navigation
 *   cannot release a run this session dispatched.
 * - A session is disposed only when its final view and active run are both
 *   released.
 *
 * Subscriptions:
 * - `subscribeMembership` wakes on first acquire / final release per chatId.
 * - `subscribeChat(chatId, listener)` wakes on the underlying `Chat`'s
 *   messages/status/error callbacks (mirrored via the `~register*Callback`
 *   APIs) — scoped per chatId so a token streaming into chat A never wakes
 *   subscribers bound to chat B.
 *
 * Dependencies are given at construction (A2): the app runtime passes the
 * project library's ports, and the record client and watch through the
 * library's file facade, which notifies when the root worker is replaced.
 * `setDependencies` swaps them at once.
 */

import type { ChatStatus } from 'ai';
import { Topic } from '@taucad/events';
import { ObservationService } from '@taucad/fs-client/observation-service';
import type { ObservationRead, ObservationWatch } from '@taucad/fs-client/observation-service';
import type { WatchEvent } from '@taucad/filesystem';
import { createActor, createAsyncLogic, waitFor } from 'xstate';
import type { Actor, ActorOptions, AnyActorLogic } from 'xstate';
import type { CadAgentExecution, Chat as ChatEntity, MyUIMessage, TauAgentHostId } from '@taucad/chat';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import { chatRecordsPath } from '@taucad/revisions';
import { getErrno } from '@taucad/utils/error';
import { ownerWaitOf, sendHostCommand } from '#chat-clients/_internal/host-command.js';
import type { CommandRefusal } from '#chat-clients/_internal/host-command.js';
import { isUnownedChatObservation } from '@taucad/ui-core/lib/chat-observation-guard';
import { isWorkerCodeLoadFailure } from '@taucad/ui-core/lib/worker-factory';
import { loadCode } from '@taucad/ui-core/lib/code-loading';
import type { MachineActors } from '@taucad/ui-core/lib/xstate.lib';
import { waitUnlessGone } from '@taucad/ui-core/lib/xstate.lib';
import { daemonPlacementOf } from '#lib/agent-host-placement.js';
import { chatReadReporter } from '#lib/chat-read-reporting.js';
import { chatSessionMachine } from '#machines/chat-session.machine.js';
import type {
  ChatRequest,
  ChatSessionActorRef,
  ChatSyncState,
  ChatTurnGesture,
} from '#machines/chat-session.machine.js';
import type { ProjectSessionActorRef } from '#machines/project-session.machine.js';
import { chatPersistenceMachine } from '@taucad/chat-ui/hooks/chat-persistence.machine';
import { buildDraftMessage, draftMachine } from '@taucad/chat-ui/hooks/draft.machine';
import {
  createComposerRecordActor,
  draftHydrationOf,
  draftPersistenceFor,
  flushRecord,
  stopWhenWritesSettle,
} from '@taucad/chat-ui/hooks/composer-record';
import type { ComposerRecordRef } from '@taucad/chat-ui/hooks/composer-record';
import { composerRecordPaths, createComposerRecordStore } from '@taucad/chat-ui/db/composer-record-store';
import { readChatPlacementsShared, writeChatPlacement } from '@taucad/chat-ui/db/chat-placements';
import type { ComposerRecord, ComposerRecordClient } from '@taucad/chat-ui/db/composer-record-store';
import {
  chatPlacementOf,
  isDeviceRelativeHostId,
  portableExecutionOf,
  withChatPlacement,
} from '@taucad/chat-ui/utils/chat-execution';
import { createChatAttachmentStore } from '@taucad/chat-ui/db/attachment-store';
import { attachmentReferencesOf } from '@taucad/chat-ui/utils/message-attachments';
import type { StoredAttachmentRef } from '@taucad/chat-ui/utils/attachment.utils';
import type { DraftAttachmentBytes } from '#components/comments/prepare-annotated-send.js';
import { deferredRecordStore, referencedAttachments, removeRecord } from '#services/chat-session-store-composer.js';
import type { ComposerBinding, UnreadRecord } from '#services/chat-session-store-composer.js';
import { resizeImageActor } from '#hooks/attachment-image.actor.js';
import { clearLedger } from '@taucad/chat-ui/services/rpc-ledger';
import { parseErrorForPersistence } from '@taucad/chat-ui/utils/error.utils';
import { buildEditedUserMessage, composeDraftText } from '#utils/chat.utils.js';
import { hostAttachment } from '#chat-clients/_internal/host-attachment.js';
import type { AgentHostClient } from '#services/agent-host-client.js';
import { chatTurnAdmission, chatTurnAdmit, clearChatTurnServices } from '#chat-clients/_internal/chat-host-binding.js';
import type { CommitCancelledDraftRestoreInput } from '@taucad/project-library/types/chat-storage.types';
import { ENV } from '#environment.config.js';
import { subscribeRunElsewhere } from '#hooks/run-elsewhere-clock.js';
import { autoResumePlanOf, autoResumeStillAnswers } from '#utils/run-auto-resume-plan.js';
import type { AutoResumePlan } from '#utils/run-auto-resume-plan.js';
import {
  canAutoResumeModelPending,
  lookUpModelAttempt,
  nextProviderUnavailableRetry,
  nextRateLimitRetry,
  recordModelPendingAutoResume,
  recordProviderUnavailableAutoResume,
  recordRateLimitAutoResume,
} from '@taucad/chat-ui/utils/run-auto-resume';
import {
  chatProjectionLogic,
  selectAttentionRow,
  selectCaughtUp,
  selectCurrentRun,
  selectOpenInterrupts,
  selectRunFailure,
  selectRunElsewhereAwaitsPull,
  selectRunPhase,
  selectTranscript,
  selectTranscriptSource,
  selectToolsInFlight,
  isRetractedRun,
} from '#machines/chat-projection.logic.js';
import type {
  ChatProjection,
  ChatProjectionReadAnswer,
  TranscriptProjection,
  ChatRunPhase as ProjectedRunPhase,
} from '#machines/chat-projection.logic.js';
import { chatPulledAtFileName, pulledQuietOf, runHeartbeatMilliseconds, segmentDeviceIdOf } from '@taucad/agent-host';
import type { AgentLiveEvent, RowKey } from '@taucad/agent-host';
import type { HostCommand } from '@taucad/agent-host/wire';
import type { OwnSegmentSource, OwnSegmentVerdict } from '#services/chat-own-segment-source.js';
import { buildTurnGroups } from '#routes/w.$workspace.$project/chat-turn-groups.js';
import {
  composerTraysOf,
  readRememberedComposerTrays,
  writeRememberedComposerTrays,
} from '@taucad/chat-ui/services/chat-composer-trays';
import type { ComposerTray } from '@taucad/chat-ui/services/chat-composer-trays';
import { createChatMessageQueueStore, chatMessageQueuePath } from '@taucad/chat-ui/db/chat-message-queue-store';
import type {
  ChatMessageQueueIntent,
  ChatMessageQueueRecord,
  ChatMessageQueueStore,
  QueuedChatMessage,
  QueuedStartCommand,
  QueueLock,
} from '@taucad/chat-ui/db/chat-message-queue-store';
import { createChatMessageQueueActor } from '@taucad/chat-ui/machines/chat-message-queue.machine';
import { isAfterRunUnseen, selectDepartingSend, selectOutboxGate } from '#services/outbox-gate.js';
import type { OutboxGate, OutboxReadiness } from '#services/outbox-gate.js';
import type { ChatMessageQueueActor, QueueAdvanceResult } from '@taucad/chat-ui/machines/chat-message-queue.machine';
import { commandInvocation } from '@taucad/chat-ui/utils/at-reference.utils';
import { logFacts, presentationErrorFacts } from '#services/chat-presentation-diagnostics.js';
import { selectVisibleChatStatus } from '#services/chat-visible-status.js';

/** Retries of a transiently failed watch or transcript before it is latched as failed, per run. */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Closures the store needs from the project manager. Stored in a single
 * object so `setDependencies` is one atomic swap (no torn reads if a render
 * mid-acquire updates one closure at a time).
 */
/**
 * Whether the person can see the page: visible and focused. A host with no
 * document (a test, a daemon) counts as active. The one attention predicate
 * the store and the focused-chat hook share (R3).
 *
 * @returns `true` when the document is visible and focused, or absent.
 */
export const isDocumentActive = (): boolean =>
  typeof document === 'undefined' || (document.visibilityState === 'visible' && document.hasFocus());

/**
 * What asked a chat's run to stop. The host records a cancel as `USER_STOPPED` when the turn was kept, and as
 * `TURN_WITHDRAWN` when the person's own Stop took back a turn not kept yet; the origin is logged beside the cancel's
 * command id, the one way to tell which gesture a ledger's stop row came from.
 *
 * @public
 */
export type StopOrigin = 'stop-button' | 'stop-shortcut' | 'close-chat' | 'new-turn' | 'project-close';

/* Renderer console reaches the desktop log, where it lines up with the ledger's cancel row by command id. */
const logStop = (command: HostCommand, origin: StopOrigin | undefined): void => {
  logFacts('info', '[ChatSessionStore] host cancel', {
    ...command.payload,
    commandId: command.commandId,
    ...(origin === undefined ? {} : { origin }),
  });
};

export type ChatSessionDeps = {
  getChat: (chatId: string, projectId?: string) => Promise<ChatEntity | undefined>;
  patchChat: <K extends keyof ChatEntity>(
    chatId: string,
    key: K,
    value: ChatEntity[K],
  ) => Promise<ChatEntity | undefined>;
  touchChatRecency: (chatId: string, requestedAt: number) => Promise<ChatEntity | undefined>;
  consumeChatStartupRequest: (chatId: string, requestId: string) => Promise<ChatEntity | undefined>;
  commitCancelledDraftRestore: (
    chatId: string,
    input: CommitCancelledDraftRestoreInput,
  ) => Promise<ChatEntity | undefined>;
  /**
   * The worker filesystem client. It reaches the Home workspace's
   * `/.tau/composers` records and each project's `.tau/chats` attachments from
   * any route (D1, D13).
   */
  client: ComposerRecordClient & SegmentStatClient;
  /**
   * The device-relative placement a chat record written before placement moved to the device still names (XD2), when
   * `accept` holds for it: this device adopts it into its own placements record. The chat record keeps it (no device
   * can prove the host is its own) until a write of the chat's execution supersedes it.
   */
  adoptLegacyChatPlacement?:
    | ((
        chatId: string,
        projectId: string | undefined,
        accept: (hostId: TauAgentHostId) => Promise<boolean>,
      ) => Promise<TauAgentHostId | undefined>)
    | undefined;
  /** Whether a device-relative placement names a host this device can reach now. Absent: none can. */
  isPlacementOnThisDevice?: ((hostId: TauAgentHostId) => Promise<boolean>) | undefined;
  /**
   * {@link ChatSessionDeps.isPlacementOnThisDevice} as far as it is known without waiting: `undefined` while it would
   * have to ask the network. A chat's load then holds the placement and applies it once the answer comes. Absent: the
   * load waits for the answer.
   */
  isPlacementOnThisDeviceNow?: ((hostId: TauAgentHostId) => boolean | undefined) | undefined;
  /**
   * Hear when what this tab can reach may have changed (a loopback daemon handed to it later), so a held placement is
   * checked again. Returns an unsubscribe.
   */
  onPlacementReachabilityChanged?: ((listener: () => void) => () => void) | undefined;
  queueLock?: QueueLock;
  /**
   * Ask a project's revisions to pull its remote now (XD3, round 18): another device's run on one of its chats awaits
   * a pull to show whether it stayed quiet. Answers whether this device can pull the chat at all, as the placement's
   * pull answers it (round 27): `false` where it was refused `CHAT_NOT_SHARED`. Absent: nothing is asked, and the run
   * holds until a pull happens anyway.
   */
  pullRemote?: ((projectId: string, chatId: string) => Promise<boolean>) | undefined;
  /** Acknowledged observation through the root owning the chat records. */
  watchRecordFile?: (
    path: string,
    listener: (event: WatchEvent) => void,
    options?: { recursive?: boolean },
  ) => ObservationWatch;
};

/** This device's placement for a chat when this tab can reach it now, else `undefined`: local placement (XD2). */
const reachablePlacement = async (
  deps: Pick<ChatSessionDeps, 'isPlacementOnThisDevice'>,
  placement: TauAgentHostId | undefined,
): Promise<TauAgentHostId | undefined> => {
  if (placement === undefined) {
    return undefined;
  }
  const reachable = await deps.isPlacementOnThisDevice?.(placement).catch(() => false);
  return reachable === true ? placement : undefined;
};

/** A chat row with this device's placement put back on its execution. */
const placeChat = (chat: ChatEntity, placement: TauAgentHostId | undefined): ChatEntity => {
  const activeExecution = withChatPlacement(chat.activeExecution, placement);
  return activeExecution === chat.activeExecution ? chat : { ...chat, activeExecution };
};

export type ChatSession = {
  readonly chatId: string;
  readonly persistenceActorRef: Actor<typeof chatPersistenceMachine>;
  readonly draftActorRef: Actor<typeof draftMachine>;
  /**
   * This chat's composer record on this device (D2): draft, edits, tool choice,
   * mode and this device's placement for the chat (XD2). A surface mounts
   * `useComposerRecordToasts` on it.
   */
  readonly composerRecordRef: ComposerRecordRef;
  readonly messageQueueRef: ChatMessageQueueActor;
  /**
   * The displayed transcript: the fold of the chat's log, with the accepted gesture and the unsent seed (T2). While a
   * D-UI-10 announcement is pending it is the transcript last announced, so a reader woken by another topic (the
   * projection's) sees it change at most every 50 ms.
   */
  readonly messages: readonly MyUIMessage[];
  /**
   * The transcript's load state (I21): `loaded` with the turns it shows, `empty` only once its load has settled with
   * none, and `loading` until then. Read it with {@link selectChatTranscript}.
   */
  readonly transcript: ChatTranscriptState;
  /**
   * The composer trays this chat showed when it was last open on this device, known before its transcript loads,
   * and the trays its transcript has once it has settled (U10). The lane reserves their height from it.
   */
  readonly rememberedComposerTrays: readonly ComposerTray[];
  /**
   * This chat's state in the agent-state vocabulary (D32, S45).
   *
   * The store keeps the chat's projection and its persistence; the
   * machine is the one derivation of what the person is told — every row of
   * the architecture's agent-state table is one of its states. The sidebar
   * (W20) and the Agents pane read this, never the flags behind it.
   */
  /* A root the store creates at acquire and stops at dispose (PV-S5, L3 D10): never swapped, so a view that
   * subscribed once stays subscribed to the chat's machine. */
  readonly stateActorRef: ChatSessionActorRef;
};

/** A transcript's load state (I21): empty is not loading. */
export type ChatTranscriptState = 'loading' | 'loaded' | 'empty';

/**
 * The transcript state a view reads for a chat: a chat with no session is still loading.
 *
 * @param session - The chat's session, if it is acquired.
 * @returns Its transcript's load state.
 */
export const selectChatTranscript = (session: ChatSession | undefined): ChatTranscriptState =>
  session?.transcript ?? 'loading';

type MessagePresentation = {
  readonly messagesById: ReadonlyMap<string, MyUIMessage>;
  readonly order: readonly string[];
  readonly groups: ReturnType<typeof buildTurnGroups>;
  readonly agentInvocations: string;
};

export type CachedMessagePresentation = MessagePresentation & {
  /** The transcript this index was built from; the fold keeps a message's identity while it is unchanged. */
  readonly messages: readonly MyUIMessage[];
};

/** A gesture the host accepted (`durable`) before the page folded its run's first row (T2, accepted gesture). */
type AcceptedGesture = Readonly<{
  runId: string;
  request: Extract<ChatRequest, { kind: 'send' | 'edit' | 'regenerate' }>;
}>;

/**
 * Show an accepted gesture the log does not hold yet, as a pure step over the folded transcript: a send appends its
 * message, an edit truncates at its message and replaces it, a regenerate truncates after the last user message.
 *
 * @param messages - The folded transcript.
 * @param request - The accepted gesture.
 * @returns The transcript with the gesture applied.
 */
const applyAcceptedGesture = (
  messages: readonly MyUIMessage[],
  request: AcceptedGesture['request'],
): readonly MyUIMessage[] => {
  switch (request.kind) {
    case 'send': {
      return messages.some((message) => message.id === request.message.id) ? messages : [...messages, request.message];
    }
    case 'edit': {
      const index = messages.findIndex((message) => message.id === request.messageId);
      return index === -1 ? messages : [...messages.slice(0, index), editedMessage(messages[index]!, request)];
    }
    case 'regenerate': {
      return messages.slice(0, messages.findLastIndex((message) => message.role === 'user') + 1);
    }
  }
};

const noViews: ChatProjection['views'] = Object.freeze({});
const noMessages: readonly MyUIMessage[] = Object.freeze([]);
const invocationsByMessage = new WeakMap<MyUIMessage, ReadonlySet<string>>();

/**
 * Index a displayed transcript for its renderers, keeping the previous index's order and invocations while they are
 * equal. Keyed on the transcript's identity: the fold returns a new transcript whenever a message changes.
 *
 * @param messages - The displayed transcript.
 * @param cached - The index of the previous transcript.
 * @returns The index of this one.
 * @internal
 */
export const presentMessages = (
  messages: readonly MyUIMessage[],
  cached?: CachedMessagePresentation,
): CachedMessagePresentation => {
  if (cached?.messages === messages) {
    return cached;
  }
  const order = messages.map((message) => message.id);
  const invocations = new Set<string>();
  for (const message of messages) {
    let own = invocationsByMessage.get(message);
    if (own === undefined) {
      own = invocationsOf([message]);
      invocationsByMessage.set(message, own);
    }
    for (const invocation of own) {
      invocations.add(invocation);
    }
  }
  const agentInvocations = [...invocations].join('\n');
  return {
    messages,
    messagesById: new Map(messages.map((message) => [message.id, message])),
    order:
      cached !== undefined && cached.order.length === order.length && cached.order.every((id, at) => id === order[at])
        ? cached.order
        : order,
    groups: buildTurnGroups(messages),
    agentInvocations: cached?.agentInvocations === agentInvocations ? cached.agentInvocations : agentInvocations,
  };
};

export type ChatHistoricalUsage = Readonly<{
  operationIds: readonly string[];
  lastActivityAt: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  parts: number;
}>;

const emptyHistoricalUsage: ChatHistoricalUsage = {
  operationIds: [],
  lastActivityAt: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  parts: 0,
};

const inactiveProjectionLimit = 4;
const inactiveProjectionWeightLimit = 16 * 1024 * 1024;
/** Milliseconds between chat message notifications while a stream writes (D-UI-10). */
const chatMessagesThrottle = 50;
/** How long a hidden document waits to publish live-only changes, which no animation frame would publish. */
const hiddenLiveInterval = 1000;
/** One frame's wait where there are no animation frames at all (a test document, a server render). */
const frameInterval = 16;

/** The next animation frame while the document is visible; a timer while it is hidden or has no frames. */
const nextFrame = (callback: () => void): (() => void) => {
  const hidden = (globalThis.document as Document | undefined)?.visibilityState === 'hidden';
  if (hidden || typeof requestAnimationFrame === 'undefined') {
    const timer = setTimeout(callback, hidden ? hiddenLiveInterval : frameInterval);
    return () => {
      clearTimeout(timer);
    };
  }
  const handle = requestAnimationFrame(callback);
  return () => {
    cancelAnimationFrame(handle);
  };
};

/** Whether a projection snapshot differs from the last published one only in its live preview. */
const changesOnlyLive = (previous: ChatProjection, next: ChatProjection): boolean => {
  if (previous.live === next.live) {
    return false;
  }
  for (const key of Object.keys(next) as Array<keyof ChatProjection>) {
    if (key !== 'live' && previous[key] !== next[key]) {
      return false;
    }
  }
  for (const key of Object.keys(previous) as Array<keyof ChatProjection>) {
    if (key !== 'live' && !(key in next)) {
      return false;
    }
  }
  return true;
};
/** How often, and from how long a first wait, a taken-back request asks the outbox again before the person is told. */
const takeBackRetries = 3;
const takeBackRetryDelay = 250;
/** A send the host refused with an owner wait is sent again after 250 ms, doubling to 30 s (RH-R17, PERF-5). */
const hostWaitFirstDelay = 250;
const hostWaitLongestDelay = 30_000;

/** Approximate retained representation weight, bounded at retirement rather than during streaming. */
const projectionWeight = (projection: ChatProjection): number => {
  const pending: unknown[] = [projection];
  const seen = new Set<unknown>();
  let weight = 0;
  while (pending.length > 0 && weight <= inactiveProjectionWeightLimit) {
    const value = pending.pop();
    if (typeof value === 'string') {
      weight += value.length * 2;
    } else if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        continue;
      }
      seen.add(value);
      weight += 32;
      const record = value as Record<string, unknown>;
      for (const key in record) {
        if (Object.hasOwn(record, key)) {
          weight += key.length * 2 + 8;
          if (weight > inactiveProjectionWeightLimit) {
            break;
          }
          pending.push(record[key]);
        }
      }
    } else {
      weight += 8;
    }
  }
  return weight;
};

const usageOf = (messages: readonly MyUIMessage[]): ChatHistoricalUsage => {
  if (messages.length === 0) {
    return emptyHistoricalUsage;
  }
  const ids = new Set<string>();
  let lastActivityAt = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let parts = 0;
  for (const message of messages) {
    lastActivityAt = Math.max(lastActivityAt, message.metadata?.createdAt ?? 0);
    for (const part of message.parts) {
      if (part.type === 'data-usage') {
        parts++;
        inputTokens += part.data.inputTokens;
        outputTokens += part.data.outputTokens;
        cacheReadTokens += part.data.cacheReadTokens;
        cacheWriteTokens += part.data.cacheWriteTokens;
        if (part.data.operationId !== undefined) {
          ids.add(part.data.operationId);
        }
      }
    }
  }
  return {
    operationIds: [...ids].sort(),
    lastActivityAt,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    parts,
  };
};

const emptyMessagePresentation: MessagePresentation = {
  messagesById: new Map(),
  order: Object.freeze([]),
  groups: buildTurnGroups([]),
  agentInvocations: '',
};

const invocationsOf = (messages: readonly MyUIMessage[]): Set<string> => {
  const invocations = new Set<string>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'data-acp-session') {
        for (const command of part.data.commands) {
          invocations.add(commandInvocation(command.name));
        }
      }
    }
  }
  return invocations;
};

// ---------------------------------------------------------------------------
// Module-scoped singletons / helpers
// ---------------------------------------------------------------------------

const missingClient = async (): Promise<never> => {
  throw new Error('ChatSessionStore: client not provided');
};

/**
 * The user message being edited, rebuilt by the one builder. It keeps the
 * original's id and metadata, refreshes `createdAt` and `status` and re-derives
 * its references from the edited text; the turn's agent config travels in
 * `body.agent`, never in message metadata.
 */
function editedMessage(original: MyUIMessage, request: Extract<ChatRequest, { kind: 'edit' }>): MyUIMessage {
  return buildEditedUserMessage(original, {
    text: request.content,
    ...(request.attachments === undefined ? {} : { attachments: request.attachments }),
    ...(request.references === undefined ? {} : { references: request.references }),
    ...(request.annotations === undefined ? {} : { annotations: request.annotations }),
  });
}

// ---------------------------------------------------------------------------
// ChatSessionStore
// ---------------------------------------------------------------------------

/**
 * The transcript's load state (I21). Turns shown are `loaded`, so the first turns and `loaded` arrive in one snapshot
 * (U19). With none, it is `empty` only once its load has settled, which latches: a materialization of the log applied
 * or failed, the host refused the read for good, or this tab created the chat empty. A lost read is retried, so it
 * stays `loading` (U7).
 */
const transcriptOf = (session: Pick<InternalSession, 'messages' | 'transcriptSettled'>): ChatTranscriptState => {
  if (session.messages.length > 0) {
    return 'loaded';
  }
  return session.transcriptSettled ? 'empty' : 'loading';
};

type InternalSession = ChatSession & {
  readonly messageQueueStore: ChatMessageQueueStore;
  readonly messageQueueObservation: ObservationService<void>;
  /**
   * The outbox entry leaving for a turn of its own: nothing runs ahead of it, so the thread shows it as sent and the
   * queue strip leaves it out ({@link selectDepartingSend}).
   */
  departing: QueuedChatMessage | undefined;
  /** The transcript with {@link InternalSession.departing} appended, kept while neither changes. */
  departingView:
    | Readonly<{ base: readonly MyUIMessage[]; message: MyUIMessage; messages: readonly MyUIMessage[] }>
    | undefined;
  /** The outbox's record as this page last read it: the gate reads its handover receipt. */
  outboxRecord: ChatMessageQueueRecord | undefined;
  /**
   * A departing send the host accepted. The accepted gesture shows it until the log has its run; it is still
   * *departing* (the cue reads it as starting, and it cannot be edited) only until the log has its request (`logged`),
   * and a Stop aims at its run until that run ends.
   */
  handedOff: Readonly<{ message: MyUIMessage; runId: string; logged?: true }> | undefined;
  dispatchTask: Promise<void> | undefined;
  /** The chat's machine as the root this store started; `stateActorRef` is the same actor. */
  readonly chatRoot: Actor<typeof chatSessionMachine>;
  /** React/view consumers currently observing this session. */
  viewRefcount: number;
  /** Non-view ownership held while one logical run is active. */
  runHeld: boolean;
  /** Original durable startup id; a later Start may supersede it with another id. */
  seedRequestId: string | undefined;
  /** The durable startup user row, kept until the host log includes it. */
  seedMessage: MyUIMessage | undefined;
  /** Only an applied foreign read after hydration may authorize seed dispatch. */
  seedRemoteReadVersion: number | undefined;
  /** A fresh check found no local log bytes, whose empty host read otherwise parks. */
  seedLocalLogEmpty: boolean;
  /** A composer pick held while an own run is unsettled (HA-I7); the queue waits for it, not for the settlement. */
  deferredPick?: symbol | undefined;
  seedLocalLogCheck: Promise<Uint8Array<ArrayBuffer>> | undefined;
  /** The retained session owns one lease on the shared local/foreign log observation. */
  observationRelease: (() => void) | undefined;
  /** Durable seed waiting for the focused admission and project connector to publish. */
  pendingSeedGesture: ChatTurnGesture | undefined;
  /** The one command being dispatched, and the run this session holds while it is open. */
  activeCommand: HostCommand | undefined;
  commandAbort: AbortController | undefined;
  watchedRunId: string | undefined;
  /** The attempt a dispatched Resume continues: its run awaits a later one, or this one running again. */
  resumedAttempt: number | undefined;
  /**
   * The displayed source (T2): this device's views and overlay as of the last projection caught up with its read
   * answered, and other devices' views as of their last completed scan. Each advances on its own authority.
   */
  displayedOwn: ChatProjection | undefined;
  displayedRemote: ChatProjection['remote'];
  /** The fold of the displayed source, and the transcript shown from it with the gesture and seed. */
  displayedFold: readonly MyUIMessage[];
  displayedMessages: Readonly<{
    fold: readonly MyUIMessage[];
    gesture: AcceptedGesture | undefined;
    seed: MyUIMessage | undefined;
    messages: readonly MyUIMessage[];
  }>;
  acceptedGesture: AcceptedGesture | undefined;
  /** The transcript last announced, the one subscribers last heard, and the D-UI-10 throttle that announces the next. */
  announcedMessages: readonly MyUIMessage[];
  publishedMessages: readonly MyUIMessage[];
  announceTimer: ReturnType<typeof setTimeout> | undefined;
  announcePending: boolean;
  /** The log's transcript shown with authority (or its read failed) for this session: an empty one is settled (I21). */
  transcriptSettled: boolean;
  /** An empty transcript applied while the scan of other devices' history was pending; it settles once that scan has. */
  transcriptAwaitsForeignScan: boolean;
  /** {@link ChatSession.rememberedComposerTrays}: this device's memory until the transcript settles. */
  composerTrays: readonly ComposerTray[];
  commandInFlight: boolean;
  /** The Stop this page is carrying out, until nothing is left to wait for ({@link PendingStop}). */
  stop: PendingStop | undefined;
  /** The gate the outbox last waited on, for its diagnostic (logged once per change). */
  queueHold: string | undefined;
  /** A storage invalidation waits for host settlement. */
  refreshDeferred: boolean;
  /**
   * The run this page asked its host to take back (`cancel.withdraw`). Its request comes back to this composer when the
   * log shows the host took it back (`TURN_WITHDRAWN`), however the Stop itself settled meanwhile: the keyed cancel may
   * land after this page let go of it.
   */
  takeBackRunId: string | undefined;
  /** The stopped or refused send being offered back to the composer: it is no longer queued, so the strip omits it. */
  offering: string | undefined;
  /** The prepared send the host last refused with an owner wait, sent again by its key once its backoff runs out. */
  hostWait: HostWait | undefined;
  /** The live run this page saw before it had model text, so its first text can be timed (T10). */
  presentationWatch: string | undefined;
  /** The newest live run whose first model text this page has timed, or found already showing (T10). */
  presentedRunId: string | undefined;
  status: ChatStatus;
  /** The project this chat belongs to, from its caller (PV-S4, L3 D9); never from focus. */
  readonly projectId: string;
  /** The chat machine's turn emits, subscribed once when its root is created. */
  turnSubscriptions: Array<{ unsubscribe: () => void }>;
  /** Read the chat's waits now (`#bindChatWaits`); bound with the root. */
  offerChatWaits: () => void;
  /**
   * The chat's record store and project. Known at acquire (PV-S4); a reacquired chat's I/O waits only for its released
   * predecessor's drain (D7).
   */
  composer: Promise<ComposerBinding>;
  /** Composer work that must reach the record before its actor stops (a cancelled-draft restore). */
  composerWork: Set<Promise<unknown>>;
  /** Cleanups for the per-chat subscriptions wired up at session creation. */
  dispose: () => void;
};

export type ChatSessionLivenessSnapshot = Readonly<{
  projects: Readonly<Record<string, readonly string[]>>;
  chats: Readonly<
    Record<
      string,
      Readonly<{
        projectId: string | undefined;
        status: ChatStatus;
        phase: ProjectedRunPhase;
        machineState: unknown;
        activeRunId: string | undefined;
      }>
    >
  >;
}>;

type ChatSessionLivenessDebugGlobal = typeof globalThis & {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- fixed debug bridge read by browser E2E.
  __TAU_CHAT_SESSION_LIVENESS__?: () => ChatSessionLivenessSnapshot;
};

/**
 * The text a message puts in — or took out of — the composer.
 *
 * The draft's own `loadMessage` keeps the first text part and nothing else, so
 * this is the same string on the way back (I5).
 */
const composedText = (message: MyUIMessage): string => message.parts.find((part) => part.type === 'text')?.text ?? '';

/**
 * What a message says and carries, comparable whatever order its parts were built in. The text is taken in its composed
 * form, so a draft built from the editor's raw text compares equal to the message sent from it.
 */
const compositionOf = (message: MyUIMessage): string =>
  JSON.stringify([
    composeDraftText(composedText(message)),
    message.parts.flatMap((part) => (part.type === 'file' ? [part.url] : [])),
  ]);

/**
 * Whether the composer still holds exactly what a sent message took out of it.
 *
 * The draft is the editor's raw text and the message is the composed one, so the two are compared in the composed
 * form. Comparing them raw left every draft with a trailing newline or space in the composer after it was queued, where
 * a second Enter sent it again.
 */
const draftIsOf = (draftText: string, message: MyUIMessage): boolean =>
  composeDraftText(draftText) === composedText(message);

/**
 * Park a send after the person's Stop: it leaves only by their Send now. A steer it carried was this send's own way out
 * and is spent, so the gate never reads it as Send now.
 *
 * @param item - The outbox entry.
 * @returns The entry, held.
 */
const parkSend = (item: QueuedChatMessage): QueuedChatMessage => {
  const { steer: _spent, ...rest } = item;
  return { ...rest, held: true };
};

/** A send taken back before any host applied its command: the command is dropped, and a later send mints its own. */
const unprepared = (item: QueuedChatMessage): QueuedChatMessage => {
  const { command: _refused, commandPlacement: _placement, ...rest } = item;
  return rest;
};

/**
 * A prepared send the chat's host refused with an owner wait (PERF-5): nothing was applied, its command stays in the
 * outbox, and it is sent again by the same key once `due`.
 */
type HostWait = Readonly<{
  queueId: string;
  commandId: string;
  runId: string;
  /** Refusals of this command in a row, which set the next backoff. */
  attempt: number;
  /** The backoff ran out, so the outbox may send it again. */
  due: boolean;
  /** What the chat says while the send waits. */
  sentence: string;
  timer: ReturnType<typeof setTimeout>;
}>;

/** What a send that waits for its host reads as: queued, with why and when it goes (PERF-5). */
const hostWaitSentence = (refusal: CommandRefusal): string =>
  refusal.code === 'WRITER_LOCKED' || refusal.code === 'LEADER_VERSION_MISMATCH'
    ? 'Queued. Another tab still has this chat open for writing. Your message is sent when that tab resumes or closes.'
    : 'Queued. Your message is sent as soon as this chat can take it.';

/**
 * A Stop this page is carrying out, from the press until nothing is left to wait for. One value, so letting go of it
 * (`#releaseStop`) clears every part at once and no part outlives the Stop.
 */
type PendingStop = Readonly<{
  /** The gesture that pressed it, logged with the cancel; only the person's own Stop takes a send back. */
  origin: StopOrigin;
  /**
   * The departing send being taken back before the host has it: nothing delivers it while its removal waits for the
   * delivery lock.
   */
  withdrawing: string | undefined;
  /**
   * The run this Stop must end once the log has it: a send taken back, prepared or handed over when Stop was pressed,
   * or the command then in flight. Otherwise the log's current run when the cancel goes out.
   */
  target: string | undefined;
  /** The run whose cancel was sent, so a reattach or a log update never sends it twice. */
  sent: string | undefined;
  /** The cancel command this Stop sent: its answer settles this Stop and never a later one for the same run. */
  cancelId: string | undefined;
}>;

/** The run whose cancel the session's Stop has sent, read afresh: an awaited answer may find the Stop let go. */
const sentCancel = (session: Pick<InternalSession, 'stop'>): string | undefined => session.stop?.cancelId;

/** Whether the composer holds nothing the person wrote, so a returned send may take it. */
const isComposerEmpty = (session: Pick<InternalSession, 'draftActorRef'>): boolean => {
  const draft = session.draftActorRef.getSnapshot().context;
  return draft.draftText === '' && draft.draftAttachments.length === 0;
};

/** Two log rows are the same row (EQ3: no ordering across devices is needed). */
const sameRowKey = (left: RowKey, right: RowKey): boolean =>
  left.leaderEpoch === right.leaderEpoch && left.sequence === right.sequence;

/** A chat machine still showing a run as live: queued, running, or stopped with its turn not yet settled. */
const isLive = (snapshot: ReturnType<ChatSessionActorRef['getSnapshot']>): boolean =>
  snapshot.matches({ run: 'queued' }) ||
  snapshot.matches({ run: 'running' }) ||
  (snapshot.matches({ run: 'stopped' }) && snapshot.context.turn !== undefined);

/**
 * Whether a run's end is this chat's to show: the machine is still showing it live, as the run its turn placed or the
 * run it presents. An idle chat is shown no history, a turn is never ended by an earlier run's row (W0.2), and an end
 * is never shown twice, which would settle a turn twice.
 */
const endsHere = (snapshot: ReturnType<ChatSessionActorRef['getSnapshot']>, runId: string): boolean => {
  const { turn, activeRunId } = snapshot.context;
  return isLive(snapshot) && (turn?.runId === runId || (activeRunId === runId && snapshot.matches({ run: 'running' })));
};

/** The two phases that OPEN a run and keep its project busy (I24); every other phase settles one. */
const opensRun = (phase: ProjectedRunPhase): boolean => phase === 'admitted' || phase === 'running';

/** How long a lost or refused host read may last before HA0 reports what it leaves the person with. Milliseconds. */
export const chatReadLossBoundMilliseconds = 10_000;

/** The longest wait between HA-I5 in-page `attach` sends while a stale own run stays unsettled. Milliseconds. */
const inPageAttachBackoffMilliseconds = 60_000;

/** The connection failures `sendHostCommand` retries; one thrown past its bound leaves a command's effect unknown. */
const peerLossCodes: ReadonlySet<string> = new Set(['PEER_UNRESPONSIVE', 'PEER_GONE', 'PEER_CLOSED', 'CHANNEL_CLOSED']);
const retainsLiveRun = (phase: ProjectedRunPhase): boolean => opensRun(phase) || phase === 'paused';

/* The `revision` region's three facts, as the project's route last reported them. */
const sendRevisionFacts = (ref: ChatSessionActorRef, facts: ChatRevisionFacts): void => {
  ref.send({ type: 'dirtyChanged', dirty: facts.dirty });
  ref.send({ type: 'syncState', state: facts.sync });
  if (facts.branch !== undefined) {
    ref.send({ type: 'turnFinalized', branch: facts.branch });
  }
};

/**
 * How a store creates its chat roots (MC-R4): the chat-session logic, and the clock, inspector and rejected-event
 * hook every root it creates takes. Production passes none; tests pass the harness.
 *
 * @public
 */
export type ChatSessionStoreOptions = Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'> &
  Readonly<{
    chatSession?: typeof chatSessionMachine;
    /**
     * Schedules the frame that publishes live-only projection changes (WP-06 frame clock, `LiveOverlay.tla`
     * `FrameClock`); returns a cancel. Defaults to the next animation frame, or a 1 s timer while the document is hidden.
     */
    frame?: (callback: () => void) => () => void;
    /**
     * The closures the store calls, given at construction (A2): the app runtime passes the project library's ports.
     * Without them the store's defaults throw until `setDependencies`.
     */
    dependencies?: Omit<ChatSessionDeps, 'client' | 'watchRecordFile'>;
    /**
     * The record client and watch the store reads its records through, which change when the root worker is replaced:
     * the store takes the current pair now and on each notice, as a `setDependencies` with a new client does.
     */
    files?: Readonly<{
      get: () => Pick<ChatSessionDeps, 'client' | 'watchRecordFile'> | undefined;
      subscribe: (listener: () => void) => () => void;
    }>;
    /**
     * The project the person is on, as focus says it (A7b): each time focus arrives at a project, its chats are bound
     * to its live session again. Focus never names a chat's project: its caller does (PV-S4, L3 D9).
     */
    focusedProject?: Readonly<{
      get: () => string | undefined;
      subscribe: (listener: () => void) => () => void;
    }>;
    /**
     * Every live project's session, as the registry holds them (A7c): each run reports to the project that ran it (R2),
     * and a session that joins late is told which of its chats already have a run in flight, so `busy` still counts
     * them. The chats' machines are roots this store owns (PV-S5, L3 D10).
     */
    projectSessions?: Readonly<{
      get: () => LiveProjectSessions;
      subscribe: (listener: () => void) => () => void;
    }>;
  }>;

/** The live project sessions by project id, as the sessions registry holds them (A7c). @public */
export type LiveProjectSessions = Readonly<Record<string, ProjectSessionActorRef>>;

/** The revision facts one project's chats show (the project's route reports them). @public */
export type ChatRevisionFacts = Readonly<{
  dirty: boolean;
  sync: ChatSyncState;
  branch?: string;
}>;

/** A connection identity, distinct from an unknown connection or implicit browser placement. */
const connectionPlacement = (placement: { hostId?: string } | undefined): string | undefined =>
  placement === undefined ? undefined : placement.hostId === undefined ? 'browser' : `host:${placement.hostId}`;

type ObservedChat = {
  projectId: string;
  refs: number;
  attachment?: Actor<typeof hostAttachment>;
  /** Placement of that live connection, not the chat's desired execution. */
  placement?: { hostId: ReturnType<typeof daemonPlacementOf> };
  status: 'unknown' | 'attached' | 'lost' | 'refused';
  retry?: ReturnType<typeof setTimeout>;
  /** Armed by a loss that is not a leadership handoff; reports it if it outlasts {@link chatReadLossBoundMilliseconds}. */
  lossReport?: ReturnType<typeof setTimeout>;
  attempts: number;
  /**
   * The agent host's code failed to load past the page's worker bound when this chat's read last met it (FP10). It
   * stays failed for the page's life, so the chat shows it whenever its session can ({@link ChatSessionStore}).
   */
  hostLoadFailure?: unknown;
  /** Whether this device reads the chat's own segment from the file (HA1): decided by the source's first pass. */
  local?: Promise<boolean>;
  /** The own segment source, while the chat is local. */
  source?: OwnSegmentSource;
  /** The source's last pass held the file: read authority that no host loss takes away (HA-I2). */
  ownCurrent?: boolean;
  /** Live (re)subscriptions on a local placement, and the one the settler last sent `attach` for (HA-I5). */
  subscriptions?: number;
  settledFor?: number;
  /** The watch on the chat's own files that wakes the source when another tab or app writes them (HA-I1). */
  ownWatch?: ObservationWatch;
  /** HA-I5's in-page `attach` after a stale span: how many went unanswered, and when the next may go. */
  inPageTries?: number;
  inPageNextAt?: number;
};

/** The run IDs a Close prompt can truthfully promise to stop, and the work it cannot. @public */
export type ProjectClosePlan = Readonly<{
  stoppableRunCount: number;
  stoppableChatIds: readonly string[];
  liveChatIds: readonly string[];
  continuingRuns: ReadonlyArray<
    Readonly<{
      id: string;
      label: string;
      reason: 'other-build' | 'background-window';
    }>
  >;
}>;

type ProjectHostConnector = Readonly<{
  connect: (chatId: string) => Promise<
    Pick<AgentHostClient, 'read' | 'catchUp' | 'subscribe' | 'hostCommand' | 'close'> & {
      placement?: { hostId: ReturnType<typeof daemonPlacementOf> };
    }
  >;
  stoppability?: (chatId: string) => Promise<'stoppable' | 'other-build' | 'background-window'>;
  /** The page showed a live run's model text at `at` (T10); best effort, and only the project's host reports it. */
  presented?: (chatId: string, runId: string, at: number) => Promise<void>;
  /** The account rated an ended run at `at` (T12); best effort, and only the project's host reports it. */
  rated?: (rating: RunRating) => Promise<void>;
}>;

/** The account's rating of one ended run, on the page's clock (T12). @public */
export type RunRating = Readonly<{ chatId: string; runId: string; value: 'positive' | 'negative'; at: number }>;

/** A client that may say when a file last changed on this device (the worker filesystem's metadata-only stat). */
type SegmentStatClient = Readonly<{
  stat?: ((path: string) => Promise<Readonly<{ mtimeMs?: number | undefined }>>) | undefined;
}>;

/**
 * When a segment last changed on this device, its modification time (XD3, round 17): the agent host's reader reads the
 * same file's, so the page and the fence measure another device's run from the one time. None without a stat or a
 * modification time; the run is then measured from when this page first read it.
 */
const receivedAtOf = async (client: SegmentStatClient, path: string): Promise<Readonly<{ receivedAt?: number }>> => {
  const mtimeMs = await client
    .stat?.(path)
    .then((stat) => stat.mtimeMs)
    .catch(() => undefined);
  return mtimeMs === undefined || mtimeMs <= 0 ? {} : { receivedAt: mtimeMs };
};

/* The attempt route, asked with the page's session cookie while a chat waits on a pending model attempt (RA-R1). */
const modelAttemptLookup = createAsyncLogic<'settled' | 'waiting', { readonly attemptId: string }>({
  run: async ({ input, signal }) => {
    const answer = await lookUpModelAttempt({ apiBaseUrl: ENV.TAU_API_URL, attemptId: input.attemptId, signal });
    signal.throwIfAborted();
    return answer;
  },
});

/**
 * Whether an automatic resume's wait may still resume the run, and the ledger entry that spends it: checked again
 * when the wait ends, so a failed attempt is never resumed twice by this page.
 *
 * @param plan - The wait that ended.
 * @param now - The current time, in epoch milliseconds.
 * @returns Whether the run was resumed on the ledger.
 */
const spendAutoResume = (plan: AutoResumePlan, now: number): boolean => {
  const { runId, attempt } = plan;
  switch (plan.kind) {
    case 'rateLimit': {
      if (nextRateLimitRetry(runId, attempt) === undefined) {
        return false;
      }
      recordRateLimitAutoResume(runId, attempt);
      return true;
    }
    case 'providerUnavailable': {
      if (nextProviderUnavailableRetry(runId, attempt) === undefined) {
        return false;
      }
      recordProviderUnavailableAutoResume(runId, attempt);
      return true;
    }
    case 'modelPending': {
      if (!canAutoResumeModelPending(runId, attempt, now)) {
        return false;
      }
      recordModelPendingAutoResume(runId, attempt);
      return true;
    }
  }
};

export class ChatSessionStore {
  readonly #sessions = new Map<string, InternalSession>();
  readonly #observed = new Map<string, ObservedChat>();
  readonly #projectHostConnectors = new Map<string, ProjectHostConnector>();
  /** The rating this page gave each run, by chat and run; a run is rated once, as its host reports it. */
  readonly #ratings = new Map<string, RunRating['value']>();
  readonly #remoteReadVersions = new Map<string, number>();
  readonly #remoteReadCompletedVersions = new Map<string, number>();
  /** The scan version that last ended, read or failed: an empty transcript waits for it (I21). */
  readonly #remoteReadEndedVersions = new Map<string, number>();
  /** The scan version that last ended by failing: nothing was read for it. */
  readonly #remoteReadFailedVersions = new Map<string, number>();
  readonly #remoteHistoryPresence = new WeakMap<NonNullable<ChatProjection['remote']>['views'], boolean>();
  readonly #remoteObservations = new Map<string, ObservationService<void>>();
  readonly #projectRunKeys = new Map<string, string>();
  readonly #projectRunVersions = new Map<string, number>();
  readonly #chatSessionLogic: typeof chatSessionMachine;
  readonly #rootOptions: Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'>;
  /** The last revision facts each project reported, replayed to a chat root created after them. */
  readonly #revisionFacts = new Map<string, ChatRevisionFacts>();
  /**
   * Every live project's session, keyed by project (R2).
   *
   * One field would mean a run that settles after the person navigates away
   * reports to whichever project is on screen, and the project that actually
   * ran it stays `busy` forever — never idle-closable, never a budget
   * candidate, *Close* asking for the life of the document.
   */
  readonly #projectSessions = new Map<string, ProjectSessionActorRef>();
  /** One unread record per project (D2, D9), kept for the store's lifetime. */
  readonly #unreadRecords = new Map<string, UnreadRecord>();
  /**
   * A released chat's record actor, still writing. A reacquired session reads
   * its record only after this settles, so it never reads what is about to be
   * overwritten.
   */
  readonly #composerDrains = new Map<string, Promise<void>>();
  /** Live owners pin projections; a bounded inactive cache preserves recent warm navigation. */
  readonly #projections = new Map<string, Actor<typeof chatProjectionLogic>>();
  /** The pending frame of each chat whose projection holds a live-only change not yet published (WP-06). */
  readonly #projectionFrames = new Map<string, () => void>();
  readonly #frame: (callback: () => void) => () => void;
  readonly #inactiveProjections = new Map<
    string,
    { projectId: string; actor: Actor<typeof chatProjectionLogic>; weight: number }
  >();
  readonly #deletedProjections = new WeakSet<Actor<typeof chatProjectionLogic>>();
  /** A read answer, not the projection's initially empty cursor, proves this chat's log was checked. */
  readonly #answeredLogReads = new Set<string>();
  /**
   * Chats whose next connect routes to this build's own host, whatever the record says (HA-I5's stale-run `attach`).
   * Read synchronously by {@link ChatSessionStore.getChatHostSettings}, which the connector calls first.
   */
  readonly #inPageRoute = new Set<string>();
  readonly #inPageAttaching = new Set<string>();
  /** Chats this tab created empty and has not acquired yet: their transcript is settled `empty` at once (I21). */
  readonly #createdEmpty = new Set<string>();
  /** Display eligibility for the existing validated projection; never command or read authority. */
  readonly #validatedDisplays = new WeakMap<
    Actor<typeof chatProjectionLogic>,
    Readonly<{
      views: ChatProjection['views'];
      remote: ChatProjection['remote'];
      resetVersion: number;
      sourceGeneration: string | undefined;
    }>
  >();
  /** The chat the person has in front of them (R3); only it counts as attended. */
  #focusedChatId: string | undefined;
  readonly #membershipTopic = new Topic<void>({ name: 'ChatSessionStore.membership' });
  /** Any chat's unread answer may have moved (PV-S8). */
  readonly #unreadTopic = new Topic<void>({ name: 'ChatSessionStore.unread' });
  readonly #chatTopics = new Map<string, Topic<void>>();
  /** Per-chat listeners told when a stopped send's message is back in the composer. */
  readonly #draftReturnTopics = new Map<string, Topic<void>>();
  readonly #messagePresentations = new Map<string, CachedMessagePresentation>();
  readonly #historicalUsage = new Map<string, Readonly<{ projection: ChatProjection; result: ChatHistoricalUsage }>>();
  #foreignReadsActive = 0;
  readonly #foreignReadWaiters: Array<() => void> = [];
  /** Readers of one chat's projection (PV-S9). */
  readonly #projectionTopics = new Map<string, Topic<void>>();
  #snapshot: readonly string[] = [];
  /**
   * Coalesces membership notifications onto a microtask so an `acquire`/
   * `release` triggered during another component's render (e.g. the React
   * `useChatSession` lazy initializer) never schedules a `setState` on a
   * concurrently-rendering subscriber. Without this, `<ProjectChatRpcBindings>`'s
   * `useSyncExternalStore` would wake mid-render of `<SessionBackedActiveChatProvider>`
   * and React would log the "Cannot update a component while rendering a
   * different component" warning. Snapshot mutation stays synchronous so
   * `getSnapshot` callers always observe the latest membership.
   */
  #membershipNotifyScheduled = false;
  // Default deps throw until construction or `setDependencies` supplies them.
  // Stored as a single object so swaps are atomic (no torn reads).
  #deps: ChatSessionDeps = {
    async getChat() {
      throw new Error('ChatSessionStore: getChat not provided');
    },
    async patchChat() {
      throw new Error('ChatSessionStore: patchChat not provided');
    },
    async touchChatRecency() {
      throw new Error('ChatSessionStore: touchChatRecency not provided');
    },
    async consumeChatStartupRequest() {
      throw new Error('ChatSessionStore: consumeChatStartupRequest not provided');
    },
    async commitCancelledDraftRestore() {
      throw new Error('ChatSessionStore: commitCancelledDraftRestore not provided');
    },
    client: {
      readFile: missingClient,
      writeFile: missingClient,
      exists: missingClient,
      readdir: missingClient,
      unlink: missingClient,
      rmdir: missingClient,
    },
  };

  public constructor(options: ChatSessionStoreOptions = {}) {
    const { chatSession, dependencies, files, focusedProject, frame, projectSessions, ...rootOptions } = options;
    this.#frame = frame ?? nextFrame;
    if (dependencies !== undefined) {
      this.#deps = { ...this.#deps, ...dependencies };
    }
    if (files !== undefined) {
      const current = (): Partial<Pick<ChatSessionDeps, 'client' | 'watchRecordFile'>> => files.get() ?? {};
      this.#deps = { ...this.#deps, ...current() };
      files.subscribe(() => {
        this.setDependencies({ ...this.#deps, ...current() });
      });
    }
    /* One admission per chat; the project-scoped connector owns log attachment. */
    this.#chatSessionLogic =
      chatSession ??
      chatSessionMachine.provide({
        actors: { admitTurn: chatTurnAdmission, lookUpModelAttempt: modelAttemptLookup },
      });
    this.#rootOptions = rootOptions;
    if (projectSessions !== undefined) {
      const follow = (): void => {
        const live = projectSessions.get();
        for (const projectId of this.#projectSessions.keys()) {
          if (live[projectId] === undefined) {
            this.#bindProjectSession(projectId, undefined);
          }
        }
        for (const [projectId, ref] of Object.entries(live)) {
          if (this.#projectSessions.get(projectId) !== ref) {
            this.#bindProjectSession(projectId, ref);
          }
        }
      };
      follow();
      projectSessions.subscribe(follow);
    }
    if (focusedProject !== undefined) {
      let focused = focusedProject.get();
      this.#bindFocusedProject(focused);
      focusedProject.subscribe(() => {
        const next = focusedProject.get();
        if (next !== focused) {
          focused = next;
          this.#bindFocusedProject(next);
        }
      });
    }
    // E2E reads the same owner that drives the sidebar. Keeping this bridge
    // debug-only makes a liveness failure report the store's cache facts
    // and the project actors' run sets instead of guessing from labels.
    if (Reflect.has(globalThis, 'window') && ENV.TAU_DEBUG) {
      (globalThis as ChatSessionLivenessDebugGlobal).__TAU_CHAT_SESSION_LIVENESS__ = () => this.getLivenessSnapshot();
    }
  }

  /** Debug-only projection of the facts that authoritatively drive `busy`. */
  public getLivenessSnapshot(): ChatSessionLivenessSnapshot {
    return {
      projects: Object.fromEntries(
        [...this.#projectSessions].map(([projectId, ref]) => [projectId, [...ref.getSnapshot().context.runs]]),
      ),
      chats: Object.fromEntries(
        [...this.#sessions].map(([chatId, session]) => {
          const state = session.stateActorRef.getSnapshot();
          const projection = this.#projectionContext(chatId);
          return [
            chatId,
            {
              projectId: session.projectId,
              status: session.status,
              phase: projection === undefined ? 'none' : selectRunPhase(projection),
              machineState: state.value,
              activeRunId: state.context.activeRunId,
            },
          ];
        }),
      ),
    };
  }

  /**
   * Update the closures the store invokes on behalf of every session. Safe to
   * call on every render — closures are read through `this.#deps` at call
   * time, so swapping never tears in-flight work.
   */
  /**
   * Ask the chat's project to pull its remote now (XD3, round 18), for another device's run on the chat that awaits a
   * pull (`selectRunElsewhereAwaitsPull`). What the pull brings reaches the projection as any sync does, and so does
   * its answer (round 27): where this device cannot pull the chat, no pull can show the run abandoned, so it no longer
   * holds the chat (`selectRunElsewhere`), as the host's fence reads the same answer. A pull that fails is no evidence
   * that this device cannot pull.
   *
   * @param chatId - The chat.
   * @returns Once the pull has answered.
   */
  public async requestRemotePull(chatId: string): Promise<void> {
    const projectId = this.#sessions.get(chatId)?.projectId ?? this.#observed.get(chatId)?.projectId;
    const pull = this.#deps.pullRemote;
    if (projectId === undefined || pull === undefined) {
      return;
    }
    const pulls = await pull(projectId, chatId).catch(() => true);
    this.#projections.get(chatId)?.send({ type: 'pulls', pulls });
  }

  public setDependencies(deps: ChatSessionDeps): void {
    const replaced = deps.client !== this.#deps.client || deps.watchRecordFile !== this.#deps.watchRecordFile;
    this.#deps = deps;
    if (replaced) {
      for (const [chatId, observation] of this.#remoteObservations) {
        observation.dispose();
        this.#invalidateRemoteRead(chatId);
      }
      this.#remoteObservations.clear();
      // The provider mirrors ports during render; native acquisition happens
      // after that pass and captures the final capability incarnation.
      queueMicrotask(() => {
        for (const [chatId, chat] of this.#observed) {
          this.#startRemoteObservation(chatId, chat.projectId);
        }
        for (const [chatId, chat] of this.#sessions) {
          this.#startRemoteObservation(chatId, chat.projectId);
        }
      });
    }
  }

  /** Observe a listed chat's log without acquiring its SDK transcript or composer. @public */
  public observe(chatId: string, projectId: string): () => void {
    // The registration probe, and a chat this tab already crashed on, is not owned by one project.
    if (isUnownedChatObservation(chatId)) {
      return () => undefined;
    }
    this.#inactiveProjections.delete(chatId);
    const existing = this.#observed.get(chatId);
    if (existing !== undefined && existing.projectId !== projectId) {
      throw new Error(`Chat ${chatId} is already observed in project ${existing.projectId}.`);
    }
    const observed: ObservedChat = existing ?? { projectId, refs: 0, attempts: 0, status: 'unknown' };
    observed.refs += 1;
    if (existing === undefined) {
      this.#observed.set(chatId, observed);
      this.#projectionOf(chatId);
      if (!this.#startRemoteObservation(chatId, projectId)) {
        void this.#refreshRemoteSegmentsSafely(chatId, projectId);
      }
      observed.local = this.#startOwnSource(chatId, observed);
      this.#startObservedAttachment(chatId, observed);
      this.#notifyMembership();
    }
    return () => {
      observed.refs -= 1;
      if (observed.refs > 0 || this.#observed.get(chatId) !== observed) {
        return;
      }
      this.#stopObservedAttachment(chatId, observed);
      this.#stopOwnSource(observed);
      this.#observed.delete(chatId);
      this.#stopRemoteObservationIfUnused(chatId);
      if (!this.#sessions.has(chatId)) {
        this.#historicalUsage.delete(chatId);
      }
      this.#retireProjection(chatId, projectId);
      this.#notifyMembership();
      this.#refreshProjectRuns(projectId);
    };
  }

  /** IDs whose projection is observed for this project, including unopened chats. @public */
  public observedChatIdsOf(projectId: string): readonly string[] {
    return [...this.#observed].filter(([, chat]) => chat.projectId === projectId).map(([chatId]) => chatId);
  }

  /** Refold fetched foreign log files into the one transcript projection; never cache their bytes in chat.json. @public */
  public async refreshRemoteSegments(chatId: string, projectId: string): Promise<void> {
    const observation = this.#remoteObservations.get(chatId);
    if (observation === undefined) {
      await this.#readRemoteSegments(chatId, projectId);
      return;
    }
    observation.invalidate();
    await new Promise<void>((resolve, reject) => {
      let unsubscribe = (): void => undefined;
      const check = (): void => {
        const snapshot = observation.getSnapshot();
        if (snapshot.status === 'ready' || snapshot.status === 'closed') {
          unsubscribe();
          resolve();
        } else if (snapshot.status === 'error') {
          unsubscribe();
          reject(new Error(snapshot.error));
        }
      };
      unsubscribe = observation.subscribe(check);
      check();
    });
  }

  /** Publish the active project's real W6 connector to every listed chat. @public */
  public publishProjectHostConnector(
    projectId: string,
    connect: ProjectHostConnector['connect'],
    extras: Pick<ProjectHostConnector, 'stoppability' | 'presented' | 'rated'> = {},
  ): () => void {
    const connector = { connect, ...extras };
    this.#projectHostConnectors.set(projectId, connector);
    this.#projectRunKeys.delete(projectId);
    this.#refreshProjectRuns(projectId);
    for (const [chatId, observed] of this.#observed) {
      if (observed.projectId !== projectId) {
        continue;
      }
      this.#stopObservedAttachment(chatId, observed);
      this.#projectionTopics.get(chatId)?.emit();
      observed.attempts = 0;
      this.#startObservedAttachment(chatId, observed);
    }
    for (const session of this.#sessions.values()) {
      if (session.projectId === projectId) {
        this.startPendingSeed(session.chatId);
        /* A Stop pressed while no host was attached owes its cancel; one already sent is not sent again. */
        if (
          session.stop !== undefined &&
          session.stop.sent === undefined &&
          session.stop.withdrawing === undefined &&
          !session.commandInFlight
        ) {
          void this.#cancelSessionRun(session);
        }
      }
    }
    return () => {
      if (this.#projectHostConnectors.get(projectId) !== connector) {
        return;
      }
      this.#projectHostConnectors.delete(projectId);
      this.#projectRunKeys.delete(projectId);
      this.#refreshProjectRuns(projectId);
      for (const [chatId, observed] of this.#observed) {
        if (observed.projectId === projectId) {
          this.#stopObservedAttachment(chatId, observed);
        }
      }
      for (const chatId of this.observedChatIdsOf(projectId)) {
        this.#projectionTopics.get(chatId)?.emit();
      }
    };
  }

  /**
   * Resolve a listed chat's execution as this device places it, without acquiring its SDK session.
   *
   * @public
   */
  public async getChatExecution(chatId: string): Promise<CadAgentExecution | undefined> {
    const settings = await this.getChatHostSettings(chatId);
    return settings?.activeExecution;
  }

  /**
   * Read a listed chat's host bootstrap choices without acquiring an SDK session.
   *
   * The execution is the chat record's, with this device's own placement for the chat (its composer record) put
   * back on it, so the read connector observes the host this device runs the chat on.
   *
   * @public
   */
  public async getChatHostSettings(
    chatId: string,
  ): Promise<Pick<ChatEntity, 'activeExecution' | 'activeKernel' | 'kernelPreference'> | undefined> {
    /* Read before any wait: the connector calls this first, synchronously within the settler's connect (HA-I5). */
    const inPage = this.#inPageRoute.has(chatId);
    const session = this.#sessions.get(chatId);
    const projectId = session?.projectId ?? this.#observed.get(chatId)?.projectId;
    const chat = await this.#deps.getChat(chatId, projectId);
    if (chat === undefined) {
      return undefined;
    }
    /* An open session's placement is the newest: its composer record write may not have landed yet. While an own run
     * is unsettled the pick is deferred (HA-I7), so the stored records still name the run's executor. */
    const live = session?.persistenceActorRef.getSnapshot().context;
    const placement = inPage
      ? undefined
      : live?.activeChatId === chatId &&
          !live.isLoadingChat &&
          live.loadError === undefined &&
          !this.#ownRunUnsettled(chatId)
        ? chatPlacementOf(live.activeExecution)
        : await this.#storedPlacement(chat.resourceId, chatId);
    return {
      activeExecution: withChatPlacement(chat.activeExecution, placement),
      activeKernel: chat.activeKernel,
      kernelPreference: chat.kernelPreference,
    };
  }

  /**
   * The ended run that answered a turn, which the account may rate (T12): the turn's last run that ended and whose
   * current attempt appended its end. A live, unread or legacy run that names no turn is not ratable.
   *
   * @param chatId - The chat.
   * @param turnId - The turn's user-message id.
   * @returns The run id, or `undefined`.
   * @public
   */
  public ratableRun(chatId: string, turnId: string): string | undefined {
    const projection = this.#projectionContext(chatId);
    if (projection === undefined || !selectCaughtUp(projection)) {
      return undefined;
    }
    /* The turn's newest run, as a regenerated turn's earlier run stays in the ledger; an open one is not yet rated. */
    const [runId, run] = Object.entries(projection.ledger.runs).findLast(([, entry]) => entry.turnId === turnId) ?? [
      undefined,
      undefined,
    ];
    /* A native pause also ends its attempt, but the run resumes: only an ended lifecycle closes the reply. */
    const ended = run?.lifecycle === 'completed' || run?.lifecycle === 'failed' || run?.lifecycle === 'cancelled';
    return ended && (run.appendState === 'terminal' || run.appendState === 'settled') ? runId : undefined;
  }

  /** The rating this page gave a run, if any. @public */
  public ratingOf(chatId: string, runId: string): RunRating['value'] | undefined {
    return this.#ratings.get(`${chatId}\u0000${runId}`);
  }

  /**
   * Rate an ended run once (T12). The first rating stands, as the host reports only the first; whether it is recorded
   * at all is the host's to decide from the account's feedback grant.
   *
   * @param chatId - The chat.
   * @param runId - The run, from {@link ChatSessionStore.ratableRun}.
   * @param value - The rating.
   * @returns The rating that stands.
   * @public
   */
  public rateRun(chatId: string, runId: string, value: RunRating['value']): RunRating['value'] {
    const key = `${chatId}\u0000${runId}`;
    const standing = this.#ratings.get(key);
    if (standing !== undefined) {
      return standing;
    }
    this.#ratings.set(key, value);
    const projectId = this.#sessions.get(chatId)?.projectId ?? this.#observed.get(chatId)?.projectId;
    const rated = projectId === undefined ? undefined : this.#projectHostConnectors.get(projectId)?.rated;
    void rated?.({ chatId, runId, value, at: Date.now() });
    return value;
  }

  /** Cancel the log's current run, including an unopened listed chat; no SDK session is acquired. @public */
  public async cancelProjectedRun(chatId: string): Promise<'stopped' | 'continuing' | 'absent'> {
    const projection = this.#projectionContext(chatId);
    if (projection === undefined || !selectCaughtUp(projection)) {
      return 'absent';
    }
    const run = selectCurrentRun(projection);
    if (run === undefined || !opensRun(selectRunPhase(projection))) {
      return 'absent';
    }
    if (run.opaque || projection.ledger.newerHistory) {
      return 'continuing';
    }
    const projectId = this.#sessions.get(chatId)?.projectId ?? this.#observed.get(chatId)?.projectId;
    const connector = projectId === undefined ? undefined : this.#projectHostConnectors.get(projectId);
    if (connector === undefined) {
      throw new Error(`Chat ${chatId} has no live host connector.`);
    }
    const command: HostCommand = {
      type: 'cancel',
      commandId: generatePrefixedId(idPrefix.request),
      payload: { chatId, runId: run.runId },
    };
    logStop(command, 'project-close');
    const answer = await this.#sendHostCommand(async () => connector.connect(chatId), command);
    if (answer.status === 'refused') {
      if (
        answer.code === 'LEADER_VERSION_MISMATCH' ||
        answer.code === 'WRITER_LOCKED' ||
        answer.code === 'RUN_UNREADABLE'
      ) {
        return 'continuing';
      }
      throw new Error(`Host cancel refused ${answer.code}: ${answer.message}`);
    }
    return 'stopped';
  }

  /**
   * Add a message to the chat's running Tau turn, which reads it before its next step.
   *
   * Only a native run takes steering; an external agent's turn refuses it.
   *
   * @param chatId - The chat.
   * @param message - The text to add.
   * @returns `true` when the host accepted the message into the running turn.
   * @public
   */
  public async steerProjectedRun(chatId: string, message: string): Promise<boolean> {
    const projection = this.#projectionContext(chatId);
    if (projection === undefined || !selectCaughtUp(projection)) {
      return false;
    }
    const run = selectCurrentRun(projection);
    if (run?.kind !== 'tau' || !opensRun(selectRunPhase(projection))) {
      return false;
    }
    const projectId = this.#sessions.get(chatId)?.projectId ?? this.#observed.get(chatId)?.projectId;
    const connector = projectId === undefined ? undefined : this.#projectHostConnectors.get(projectId);
    if (connector === undefined) {
      return false;
    }
    const answer = await this.#sendHostCommand(async () => connector.connect(chatId), {
      type: 'steer',
      commandId: generatePrefixedId(idPrefix.request),
      payload: { chatId, runId: run.runId, message },
    });
    return answer.status !== 'refused';
  }

  /** Answer only an interrupt the caught-up host log still holds, including after reload. @public */
  public async respondToProjectedApproval(
    chatId: string,
    interruptId: string,
    decision: Readonly<{
      approved: boolean;
      reason?: string;
      optionId?: string;
    }>,
  ): Promise<boolean> {
    const projection = this.#projectionContext(chatId);
    if (projection === undefined || !selectCaughtUp(projection)) {
      return false;
    }
    const run = selectCurrentRun(projection);
    if (run === undefined || selectOpenInterrupts(projection)[interruptId] === undefined) {
      return false;
    }
    const projectId = this.#sessions.get(chatId)?.projectId ?? this.#observed.get(chatId)?.projectId;
    const connector = projectId === undefined ? undefined : this.#projectHostConnectors.get(projectId);
    if (connector === undefined) {
      throw new Error(`Chat ${chatId} has no live host connector.`);
    }
    const answer = await this.#sendHostCommand(async () => connector.connect(chatId), {
      type: 'resolve-interrupt',
      commandId: generatePrefixedId(idPrefix.request),
      payload: {
        chatId,
        runId: run.runId,
        interruptId,
        outcome: decision.approved ? 'approved' : 'denied',
        ...(decision.optionId === undefined ? {} : { optionId: decision.optionId }),
        ...(decision.reason === undefined ? {} : { payload: { reason: decision.reason } }),
      },
    });
    if (answer.status === 'refused') {
      throw new Error(`Host approval refused ${answer.code}: ${answer.message}`);
    }
    if (answer.effect !== 'durable') {
      return false;
    }
    if (decision.approved && run.kind === 'tau') {
      const resumed = await this.#sendHostCommand(async () => connector.connect(chatId), {
        type: 'resume',
        commandId: generatePrefixedId(idPrefix.request),
        payload: { chatId, runId: run.runId },
      });
      if (resumed.status === 'refused' && resumed.code !== 'INTERRUPT_PENDING') {
        throw new Error(`Host resume refused ${resumed.code}: ${resumed.message}`);
      }
    }
    return true;
  }

  /** Classify every observed live run before Close asks, without sending a command or taking a lock. @public */
  public async getProjectClosePlan(projectId: string): Promise<ProjectClosePlan> {
    const version = (this.#projectRunVersions.get(projectId) ?? 0) + 1;
    this.#projectRunVersions.set(projectId, version);
    const connector = this.#projectHostConnectors.get(projectId);
    const entries = await Promise.all(
      this.observedChatIdsOf(projectId).map(async (chatId) => {
        const projection = this.#projectionContext(chatId);
        if (projection === undefined || !selectCaughtUp(projection) || !opensRun(selectRunPhase(projection))) {
          return undefined;
        }
        const run = selectCurrentRun(projection);
        if (run === undefined) {
          return undefined;
        }
        const reason =
          run.opaque || projection.ledger.newerHistory
            ? 'other-build'
            : await connector?.stoppability?.(chatId).catch((): 'background-window' => 'background-window');
        const current = this.#projectionContext(chatId);
        if (
          current === undefined ||
          !selectCaughtUp(current) ||
          !opensRun(selectRunPhase(current)) ||
          selectCurrentRun(current)?.runId !== run.runId
        ) {
          return undefined;
        }
        if (reason === 'stoppable') {
          return { chatId, runId: run.runId, reason };
        }
        const chat = await this.#deps.getChat(chatId, projectId).catch(() => undefined);
        return {
          chatId,
          runId: run.runId,
          reason: reason ?? 'background-window',
          label: chat?.name.length ? chat.name : `Chat ${chatId}`,
        };
      }),
    );
    const live = entries.filter((entry) => entry !== undefined);
    const stoppable = live.filter((entry) => entry.reason === 'stoppable');
    const plan = {
      stoppableRunCount: stoppable.length,
      stoppableChatIds: stoppable.map((entry) => entry.chatId),
      liveChatIds: live.map((entry) => entry.chatId),
      continuingRuns: live.flatMap((entry) =>
        entry.reason === 'stoppable' ? [] : [{ id: entry.runId, label: entry.label, reason: entry.reason }],
      ),
    };
    if (this.#projectRunVersions.get(projectId) === version) {
      this.#publishProjectRunPlan(projectId, plan);
    }
    return plan;
  }

  /** Refresh an idle live transcript from the host projection, never from chat-record metadata. */
  public async refreshFromStorage(chatId: string): Promise<void> {
    const session = this.#sessions.get(chatId);
    if (session === undefined) {
      return;
    }
    const source = this.#projectionContext(chatId);
    if (
      session.status !== 'ready' ||
      session.commandInFlight ||
      (source !== undefined && retainsLiveRun(selectRunPhase(source)))
    ) {
      session.refreshDeferred = true;
      return;
    }
    session.refreshDeferred = false;
    await this.#refreshRemoteSegmentsSafely(chatId, session.projectId);
    if (this.#sessions.get(chatId) !== session) {
      return;
    }
    const projection = this.#projectionContext(chatId);
    if (
      projection !== undefined &&
      selectCaughtUp(projection) &&
      !retainsLiveRun(selectRunPhase(projection)) &&
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- A dispatch can change status while the storage await is pending.
      session.status === 'ready' &&
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- Admission can begin while the storage await is pending.
      !session.commandInFlight
    ) {
      this.#presentTranscript(session, projection);
    }
  }

  /** Record one accepted user action independently of transcript persistence. */
  public async touchChatRecency(chatId: string, requestedAt: number): Promise<ChatEntity | undefined> {
    return this.#deps.touchChatRecency(chatId, requestedAt);
  }

  /**
   * Retain one chat and bind its state actor to its owning live project.
   *
   * @param chatId - Chat to hydrate.
   * @param projectId - The chat's project, from its caller: focus never names it (PV-S4, L3 D9).
   * @returns The retained chat session.
   */
  public acquire(chatId: string, projectId: string): ChatSession {
    this.#inactiveProjections.delete(chatId);
    const observed = this.#observed.get(chatId);
    if (observed !== undefined && observed.projectId !== projectId) {
      throw new Error(`Chat ${chatId} is already observed in project ${observed.projectId}.`);
    }
    const existing = this.#sessions.get(chatId);
    if (existing) {
      if (existing.projectId !== projectId) {
        throw new Error(`Chat ${chatId} is already acquired in project ${existing.projectId}.`);
      }
      existing.viewRefcount += 1;
      existing.offerChatWaits();
      return existing;
    }

    const session = this.#createSession(chatId, projectId);
    this.#sessions.set(chatId, session);
    session.messageQueueRef.start();
    session.observationRelease = this.observe(chatId, projectId);
    // A read the host refused before this session existed answers nothing more: the load has settled (I21).
    if (this.#observed.get(chatId)?.status === 'refused') {
      this.#latchUnreadTranscript(session);
    }
    // A retained sidebar observation may already be caught up and emit no new answer.
    this.#syncProjection(chatId, 'open');
    // Nor will a foreign watch that closed before this session existed: its load may already have settled (I21).
    this.#latchIfForeignScanLost(chatId);
    // The root bound before the session was registered; its first read of the chat's waits is now.
    session.offerChatWaits();
    this.#refreshSnapshot();
    this.#notifyMembership();
    return session;
  }

  public release(chatId: string): void {
    const session = this.#sessions.get(chatId);
    if (!session) {
      return;
    }
    session.viewRefcount -= 1;
    // An unviewed chat resumes nothing on its own: its wait ends unspent, and is offered again on return.
    session.offerChatWaits();
    this.#disposeIfUnreferenced(session);
  }

  /**
   * Prepare a warm view handoff using the existing metadata and projected transcript owners.
   * Cold or incomplete log projections keep their existing loading behavior; a failed read is
   * also a completed handoff, preserving the existing metadata error and transcript warning behavior.
   *
   * @param chatId - An acquired destination chat.
   * @param signal - Cancels a superseded view without retaining its metadata subscription.
   */
  public async preparePresentation(chatId: string, signal: AbortSignal): Promise<void> {
    const session = this.#sessions.get(chatId);
    if (session === undefined) {
      return;
    }
    try {
      await waitFor(session.persistenceActorRef, (snapshot) => !snapshot.context.isLoadingChat, { signal });
    } catch (error) {
      if (!signal.aborted) {
        logFacts('warn', '[ChatSessionStore] handoff metadata could not be prepared', {
          chatId,
          ...presentationErrorFacts(error),
        });
      }
    }
  }

  /**
   * Note a chat this tab has just created with no messages, before it is opened: its transcript is `empty` at once
   * rather than `loading` until its log answers (I21, plan A12). A later log answer with turns still shows them.
   *
   * @param chatId - The new chat.
   * @public
   */
  public noteCreatedEmpty(chatId: string): void {
    const session = this.#sessions.get(chatId);
    if (session === undefined) {
      this.#createdEmpty.add(chatId);
    } else {
      this.#latchTranscriptSettled(session);
    }
  }

  public get(chatId: string): ChatSession | undefined {
    return this.#sessions.get(chatId);
  }

  /**
   * The chat's transcript as the fold has it now, ahead of the throttled `messages` subscribers see (D-UI-10). For a
   * gesture's admission and checks, which must not act on a transcript up to one throttle window old.
   *
   * @param chatId - A chat with a live session.
   * @returns Its folded transcript, or none without a session.
   * @public
   */
  public getCurrentTranscript(chatId: string): readonly MyUIMessage[] {
    const session = this.#sessions.get(chatId);
    return session === undefined ? [] : this.#displayedTranscript(session);
  }

  /** Stable structural and command selections, rebuilt from message identity: any message the fold changed is new. */
  public getMessagePresentation(chatId: string): MessagePresentation {
    const messages = this.#sessions.get(chatId)?.messages;
    if (messages === undefined) {
      return emptyMessagePresentation;
    }
    const cached = this.#messagePresentations.get(chatId);
    const next = presentMessages(messages, cached);
    this.#messagePresentations.set(chatId, next);
    return next;
  }

  public list(): readonly string[] {
    return this.#snapshot;
  }

  public subscribeMembership(listener: () => void): () => void {
    return this.#membershipTopic.subscribe(listener);
  }

  public subscribeChat(chatId: string, listener: () => void): () => void {
    return this.#addPerChatListener({ bucket: this.#chatTopics, namePrefix: 'chat', chatId, listener });
  }

  /**
   * The chat's projection of its log (PV-S9), for a render-safe read through `useSyncExternalStore`.
   *
   * @param chatId - The chat.
   * @returns Its projection, or `undefined` before this page read any of its log.
   * @public
   */
  public getProjection(chatId: string): ChatProjection | undefined {
    return this.#projectionContext(chatId);
  }

  /**
   * Derive exact usage from the merged host log's fold (T3), cached per projected snapshot. The fold is synchronous, so
   * a summary is the log's as of this call; a deleted chat has none.
   */
  public async getHistoricalUsage(chatId: string): Promise<ChatHistoricalUsage> {
    const actor = this.#projections.get(chatId);
    if (actor !== undefined && this.#deletedProjections.has(actor)) {
      throw new Error('Chat usage projection superseded.');
    }
    const projection = this.#projectionContext(chatId);
    if (projection === undefined || !selectCaughtUp(projection)) {
      return usageOf(this.#sessions.get(chatId)?.messages ?? []);
    }
    const cached = this.#historicalUsage.get(chatId);
    if (
      cached !== undefined &&
      cached.projection.views === projection.views &&
      cached.projection.remote?.digest === projection.remote?.digest
    ) {
      return cached.result;
    }
    const result = usageOf(selectTranscript(projection));
    this.#historicalUsage.set(chatId, { projection, result });
    return result;
  }

  /** Fold one host read answer; the attachment and deterministic test readers share this projection ingress. @internal */
  public receiveHostReadAnswer(chatId: string, answer: ChatProjectionReadAnswer): void {
    const currentActor = this.#projections.get(chatId);
    const deleted = currentActor !== undefined && this.#deletedProjections.has(currentActor);
    const cursor = this.#projectionContext(chatId)?.ledger.position.cursor ?? 0;
    if (
      answer.status === 'batch' &&
      !deleted &&
      answer.cursor === cursor &&
      answer.nextCursor === cursor + answer.events.length &&
      answer.endCursor >= answer.nextCursor
    ) {
      this.#answeredLogReads.add(chatId);
      const observed = this.#observed.get(chatId);
      if (observed !== undefined) {
        observed.status = 'attached';
      }
    } else if (answer.status === 'refused') {
      const actor = this.#projections.get(chatId);
      if (actor !== undefined) {
        this.#validatedDisplays.delete(actor);
      }
      this.#answeredLogReads.delete(chatId);
      const session = this.#sessions.get(chatId);
      if (session !== undefined) {
        session.seedLocalLogEmpty = false;
        session.seedLocalLogCheck = undefined;
      }
      const observed = this.#observed.get(chatId);
      if (observed !== undefined) {
        observed.status = answer.reason === 'unreadable' ? 'refused' : 'lost';
      }
      if (answer.reason === 'unreadable' && session !== undefined) {
        // Nothing answers a refused read: its load has settled, and a later reattach does not unsettle it.
        this.#latchUnreadTranscript(session);
        this.#releaseRefusedRun(session);
      }
    }
    this.#foldHostAnswer(chatId, answer);
    this.#latchIfForeignScanLost(chatId);
    // A verified empty batch can leave the reducer unchanged while establishing read authority.
    if (answer.status === 'batch' && answer.events.length === 0) {
      this.#syncProjection(chatId, 'none');
      this.#unreadTopic.emit();
    }
    this.startPendingSeed(chatId);
  }

  /** Fold one live model event as the host attachment does; the ingress for deterministic readers. @internal */
  public receiveHostLiveEvent(chatId: string, event: AgentLiveEvent): void {
    this.#projectionOf(chatId).send({ type: 'live', event });
  }

  /** The current read-only host attachment's verified state, never a run lifecycle. @public */
  public getAttachmentStatus(chatId: string): ObservedChat['status'] {
    return this.#observed.get(chatId)?.status ?? 'unknown';
  }

  /**
   * The host whose log this chat is attached to now: where its runs ran and its refusals came from, whatever the
   * composer is set to since. `undefined` while unattached or attached to this page's own host.
   *
   * @public
   */
  public getAttachedHostId(chatId: string): TauAgentHostId | undefined {
    const observed = this.#observed.get(chatId);
    return observed?.status === 'attached' ? observed.placement?.hostId : undefined;
  }

  /** Exact usage can be read only after both the host log and foreign segments reached this projection. */
  public historicalUsageReady(chatId: string, projectId: string): boolean {
    const projection = this.#projectionContext(chatId);
    return (
      this.#observed.get(chatId)?.projectId === projectId &&
      this.#answeredLogReads.has(chatId) &&
      this.#remoteReadCompletedVersions.get(chatId) === this.#remoteReadVersions.get(chatId) &&
      projection !== undefined &&
      selectCaughtUp(projection)
    );
  }

  /**
   * Wake a reader each time the chat's projection folds a batch.
   *
   * @param chatId - The chat.
   * @param listener - Called on each change.
   * @returns Unsubscribe.
   * @public
   */
  public subscribeProjection(chatId: string, listener: () => void): () => void {
    return this.#addPerChatListener({ bucket: this.#projectionTopics, namePrefix: 'projection', chatId, listener });
  }

  /** Capture the observed terminal run before asynchronous message preparation begins. */
  public captureMessageQueueIntent(chatId: string): ChatMessageQueueIntent {
    const projection = this.#projectionContext(chatId);
    if (projection === undefined || projection.fault !== undefined || !selectCaughtUp(projection)) {
      return {};
    }
    const run = selectCurrentRun(projection);
    return run?.lifecycle === 'cancelled' || run?.lifecycle === 'failed' ? { afterTerminalRunId: run.runId } : {};
  }

  /**
   * Ask this chat's session actor for a turn.
   *
   * Every verb goes through here, and through nothing else: the actor owns the
   * lease, the run id and the settlement, so it is the only thing that can
   * refuse a second turn while one is live (V1, V2). The actor is a root the
   * store created at acquire, so a gesture is taken whatever route effects have
   * run (PV-S5).
   *
   * @param chatId - The chat the person acted on.
   * @param gesture - What they did.
   * @public
   */
  public async requestTurn(chatId: string, gesture: ChatTurnGesture): Promise<void> {
    const session = this.#sessions.get(chatId);
    if (!session) {
      return;
    }
    if (gesture.kind !== 'send') {
      await this.#requestTurn(session, gesture);
      return;
    }
    const { afterTerminalRunId } = gesture.queueIntent ?? this.captureMessageQueueIntent(chatId);
    const execution = gesture.execution ?? (await this.getChatExecution(chatId));
    const item = {
      id: gesture.message.id,
      requestId: gesture.requestId ?? generatePrefixedId(idPrefix.request),
      message: gesture.message,
      ...(afterTerminalRunId === undefined ? {} : { afterTerminalRunId }),
      ...(execution === undefined ? {} : { execution }),
    };
    const record = await session.messageQueueStore.update((current) => {
      if (this.#sessions.get(chatId) !== session || session.messageQueueRef.getSnapshot().status !== 'active') {
        throw new Error('This chat is no longer open. Your message has not been sent.');
      }
      return current.items.some((entry) => entry.id === item.id)
        ? current
        : { ...current, items: [...current.items, item] };
    });
    /* The thread or the strip shows it from the write on, even while a delivery elsewhere holds the outbox. */
    this.#loadOutbox(session, record);
    const draft = session.draftActorRef.getSnapshot().context;
    if (draft.draftText === '' || draftIsOf(draft.draftText, gesture.message)) {
      session.draftActorRef.send({ type: 'clearDraft' });
      try {
        await this.releaseDraftAttachments(chatId);
      } catch (error) {
        console.warn('[ChatSessionStore] draft attachments could not be released', error);
      }
    }
    session.messageQueueRef.send({ type: 'retry' });
  }

  /** Wake the durable outbox after admission or host history becomes available. */
  public refreshMessageQueue(chatId: string): void {
    const actor = this.#sessions.get(chatId)?.messageQueueRef;
    if (actor?.getSnapshot().status === 'active') {
      actor.send({ type: 'refresh' });
    }
    // A newly published admission lets the chat's automatic resume be offered.
    this.#sessions.get(chatId)?.offerChatWaits();
  }

  /** Retry a retained delivery with its original command identity. */
  public retryMessageQueue(chatId: string): void {
    if (this.#deps.watchRecordFile !== undefined) {
      this.#sessions.get(chatId)?.messageQueueObservation.refresh();
    }
    this.#sessions.get(chatId)?.messageQueueRef.send({ type: 'retry' });
  }

  /** Edit or remove an unsent entry under the same lock used by delivery. */
  public async editQueuedMessage(chatId: string, id: string, text: string | undefined): Promise<void> {
    const session = this.#sessions.get(chatId);
    if (session === undefined) {
      return;
    }
    await session.messageQueueStore.exclusive(async () =>
      session.messageQueueStore.change(id, (item) =>
        text === undefined
          ? undefined
          : {
              ...item,
              message: {
                ...item.message,
                parts: [{ type: 'text', text }, ...item.message.parts.filter((part) => part.type !== 'text')],
              },
            },
      ),
    );
    session.messageQueueRef.send({ type: 'retry' });
  }

  /** Move one unsent entry before another, or to the end, preserving its identity. */
  public async moveQueuedMessage(chatId: string, id: string, beforeId: string | undefined): Promise<void> {
    const session = this.#sessions.get(chatId);
    if (session === undefined) {
      return;
    }
    await session.messageQueueStore.move(id, beforeId);
    session.messageQueueRef.send({ type: 'refresh' });
  }

  /** Persist an explicit interruption targeted only at the run the person observed. */
  public async steerQueuedMessage(chatId: string, id: string): Promise<void> {
    const session = this.#sessions.get(chatId);
    const projection = this.#projectionContext(chatId);
    if (session === undefined || projection === undefined || !selectCaughtUp(projection)) {
      throw new Error('Wait for this chat to reconnect before sending.');
    }
    const run = selectCurrentRun(projection);
    await session.messageQueueStore.exclusive(async () =>
      session.messageQueueStore.update((record) => {
        if (record.items.some((entry) => entry.command !== undefined || entry.steer !== undefined)) {
          throw new Error('Wait for the current message to finish sending.');
        }
        return {
          ...record,
          items: record.items.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  steer: {
                    type: 'cancel',
                    commandId: generatePrefixedId(idPrefix.request),
                    payload: {
                      chatId,
                      runId: run?.runId ?? entry.requestId,
                    },
                  },
                }
              : entry,
          ),
        };
      }),
    );
    session.messageQueueRef.send({ type: 'retry' });
  }

  /**
   * Start a loaded seed only after a fresh, caught-up host read and both command dependencies are live.
   *
   * @param chatId - The chat whose durable startup intent was loaded.
   * @public
   */
  public startPendingSeed(chatId: string): void {
    const session = this.#sessions.get(chatId);
    if (session?.pendingSeedGesture === undefined) {
      return;
    }
    const observed = this.#observed.get(chatId);
    if (observed?.status === 'lost' && observed.hostLoadFailure !== undefined) {
      /* The read this seed waits for met an agent host this page can never load, before this session could say so. */
      void this.#showHostLoadFailure(session, observed.hostLoadFailure);
      return;
    }
    const projection = this.#projectionContext(chatId);
    if (
      session.seedRemoteReadVersion !== this.#remoteReadVersions.get(chatId) ||
      projection === undefined ||
      projection.fault !== undefined ||
      this.#observed.get(chatId)?.status === 'refused' ||
      this.#observed.get(chatId)?.status === 'lost' ||
      !selectCaughtUp(projection)
    ) {
      return;
    }
    if (selectTranscriptSource(projection, { withRetracted: true }).some((view) => view.user !== undefined)) {
      const { seedRequestId } = session;
      session.pendingSeedGesture = undefined;
      session.seedRequestId = undefined;
      session.seedMessage = undefined;
      if (seedRequestId !== undefined) {
        void this.#clearAcceptedSeed(chatId, seedRequestId);
      }
      this.#presentTranscript(session, projection);
      return;
    }
    if (chatTurnAdmit(chatId) === undefined || this.#projectHostConnectors.get(session.projectId) === undefined) {
      return;
    }
    if (!this.#answeredLogReads.has(chatId) && !session.seedLocalLogEmpty) {
      const attachment = this.#observed.get(chatId)?.attachment;
      if (attachment !== undefined && session.seedLocalLogCheck === undefined) {
        const path = `/projects/${session.projectId}/${chatRecordsPath(chatId)}/events.jsonl`;
        const check = this.#deps.client.readFile(path);
        session.seedLocalLogCheck = check;
        void this.#finishSeedLocalLogCheck(session, attachment, check);
      }
      return;
    }
    const gesture = session.pendingSeedGesture;
    session.pendingSeedGesture = undefined;
    session.runHeld = true;
    session.stateActorRef.send({ type: 'requestTurn', gesture });
  }

  /**
   * Whether this chat's own turn owner is holding a turn, or taking one.
   *
   * The turn moved to the chat's session actor (policy §16), so the actor is
   * the only authority on it. Readers that used to ask a proxy — the AI SDK's
   * `submitted`/`streaming` status, which stays `ready` for the whole admission
   * window — ask this instead.
   *
   * @param chatId - The chat to ask about.
   * @returns Whether that chat's actor owns a turn right now.
   * @public
   */
  public holdsTurn(chatId: string): boolean {
    const snapshot = this.#sessions.get(chatId)?.stateActorRef.getSnapshot();
    return (
      snapshot !== undefined &&
      (snapshot.context.turn !== undefined || snapshot.matches({ run: { queued: 'admitting' } }))
    );
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Tell one project's chats what its revision status says (the `revision` region of each chat's machine).
   *
   * ponytail: forwarded by the store until PV-S14 replaces it with selects on the revision client.
   *
   * @param projectId - The project whose status moved.
   * @param facts - Its dirty, sync and branch facts.
   * @public
   */
  public setRevisionFacts(projectId: string, facts: ChatRevisionFacts): void {
    this.#revisionFacts.set(projectId, facts);
    for (const session of this.#sessions.values()) {
      if (session.projectId === projectId) {
        sendRevisionFacts(session.stateActorRef, facts);
      }
    }
  }

  /**
   * The chat machines of one project's live chats, for its sidebar row and Agents pane.
   *
   * @param projectId - The project.
   * @returns Each live chat's machine by chat id.
   * @public
   */
  public chatRootsOf(projectId: string): ReadonlyMap<string, ChatSessionActorRef> {
    return new Map(
      [...this.#sessions.values()]
        .filter((session) => session.projectId === projectId)
        .map((session) => [session.chatId, session.stateActorRef]),
    );
  }

  /**
   * Say which chat the person has in front of them (R3). Every sidebar row holds
   * a view of its chat, so a view is not attention: only the focused chat, in an
   * active document, is attended when a turn ends.
   *
   * @param chatId - The focused chat.
   * @public
   */
  public focusChat(chatId: string): void {
    this.#focusedChatId = chatId;
  }

  /**
   * Stop treating a chat as focused, unless another chat has taken focus since.
   *
   * @param chatId - The chat that lost focus.
   * @public
   */
  public blurChat(chatId: string): void {
    if (this.#focusedChatId === chatId) {
      this.#focusedChatId = undefined;
    }
  }

  /**
   * Tell the store the person is looking at a chat, so it is read through its newest attention row (S45, §5.8): the
   * project's record takes that row as the chat's receipt, and a legacy unread mark is cleared (D9).
   *
   * @param chatId - The chat in front of the person.
   * @public
   */
  public markViewed(chatId: string): void {
    const session = this.#sessions.get(chatId);
    if (session !== undefined) {
      this.#writeReceipt(session.projectId, chatId, this.#knownAttention(chatId));
    }
  }

  /**
   * The id of the send the thread shows as leaving for its own turn, which the queue strip leaves out
   * ({@link selectDepartingSend}), until the log has its request. Changes notify {@link ChatSessionStore.subscribeChat}.
   *
   * @param chatId - The chat.
   * @returns The departing message's id, or `undefined` when nothing is leaving.
   * @public
   */
  public departingSendOf(chatId: string): string | undefined {
    const session = this.#sessions.get(chatId);
    const handedOff = session?.handedOff;
    return session?.departing?.id ?? (handedOff?.logged === true ? undefined : handedOff?.message.id);
  }
  /**
   * The id of the send the queue strip leaves out: the departing send ({@link ChatSessionStore.departingSendOf}), or a
   * stopped or refused send on its way back to the composer. Changes notify {@link ChatSessionStore.subscribeChat}.
   *
   * @param chatId - The chat.
   * @returns The entry's id, or `undefined`.
   * @public
   */
  public unqueuedSendOf(chatId: string): string | undefined {
    const session = this.#sessions.get(chatId);
    return this.departingSendOf(chatId) ?? session?.stop?.withdrawing ?? session?.offering;
  }

  /**
   * What the chat says while a send waits for its host (PERF-5): queued, why, and when it goes.
   *
   * @param chatId - The chat.
   * @returns The sentence, or `undefined` when no send waits.
   * @public
   */
  public hostWaitOf(chatId: string): string | undefined {
    return this.#sessions.get(chatId)?.hostWait?.sentence;
  }

  /**
   * Hear each time a stopped send's message is put back in this chat's composer, so the composer can take focus.
   *
   * @param chatId - The chat.
   * @param listener - Called after the composer holds the message again.
   * @returns The unsubscribe.
   * @public
   */
  public subscribeDraftReturned(chatId: string, listener: () => void): () => void {
    return this.#addPerChatListener({ bucket: this.#draftReturnTopics, namePrefix: 'draftReturned', chatId, listener });
  }

  /**
   * Stop this chat's run, through the one dispatcher that owns it (P63).
   *
   * *Stop* in the sidebar and *Stop* in the composer use the same projected run
   * identity and send a keyed host cancel. The host log confirms its outcome;
   * nothing local settles the run.
   *
   * @param chatId - The chat whose run should stop.
   * @param origin - The gesture that asked, logged with the cancel.
   * @public
   */
  public stopRun(chatId: string, origin: StopOrigin): void {
    const session = this.#sessions.get(chatId);
    if (session === undefined) {
      return;
    }
    /* A take-back already under way finishes as it started: a second Stop, or closing the chat, adds nothing to it. */
    if (session.stop?.withdrawing !== undefined) {
      return;
    }
    /* Only the person's own Stop takes a send back; closing a chat or a project, or a new turn, lets it go out. */
    const personal = origin === 'stop-button' || origin === 'stop-shortcut';
    if (personal && !session.commandInFlight && this.#withdrawDepartingSend(session, origin)) {
      return;
    }
    /* A send its host refused with a wait never ran: Stop takes it back between its re-sends. */
    if (personal && !session.commandInFlight && session.hostWait !== undefined) {
      void this.#takeBackWaitingSend(session, origin);
      return;
    }
    /* The run to end: the command awaiting its host answer, or a send prepared or handed over but not yet a live run
     * here. Otherwise the log's current run. */
    const { activeCommand, departing, handedOff } = session;
    const target = session.commandInFlight
      ? activeCommand?.type === 'start' || activeCommand?.type === 'resume'
        ? activeCommand.payload.runId
        : undefined
      : departing?.command === undefined
        ? handedOff?.runId
        : departing.requestId;
    session.stop = {
      origin,
      withdrawing: undefined,
      target: target ?? session.stop?.target,
      sent: session.stop?.sent,
      cancelId: session.stop?.cancelId,
    };
    this.#chatTopics.get(chatId)?.emit();
    if (!session.commandInFlight) {
      void this.#cancelSessionRun(session);
    }
  }

  /**
   * The chat's status (T3): its run phase, else the command this page sent and whose run its log does not hold yet.
   * Subscribers of {@link ChatSessionStore.subscribeChat} hear each change.
   *
   * @param chatId - The chat.
   * @returns `submitted`, `streaming` or `ready`.
   * @public
   */
  public getChatStatus(chatId: string): ChatStatus {
    const session = this.#sessions.get(chatId);
    return selectVisibleChatStatus(this.#projectionContext(chatId), session !== undefined && this.#awaitsRun(session));
  }

  /** A user Stop is awaiting its host-confirmed terminal row. @public */
  public isStopping(chatId: string): boolean {
    return this.#sessions.get(chatId)?.stop !== undefined;
  }

  /**
   * Whether this chat is unread on this device (§5.8, LT01): its log's newest attention row is not the one its read
   * receipt names. A legacy unread mark is a receipt that matches no row. Until this page has read the chat's log,
   * the legacy mark alone answers (D9).
   *
   * @param chatId - A chat with a live session or an observed sidebar row.
   * @returns Whether the chat has something the person has not seen.
   * @public
   */
  public isUnread(chatId: string): boolean {
    const projectId = this.#chatProjectId(chatId);
    const record = projectId === undefined ? undefined : this.#unreadRecords.get(projectId);
    if (record === undefined) {
      return false;
    }
    const projection = this.#projectionContext(chatId);
    if (projection === undefined || !selectCaughtUp(projection) || !this.#hasTranscriptAuthority(chatId, projection)) {
      return record.legacy.has(chatId);
    }
    const attention = selectAttentionRow(projection);
    const receipt = record.readThrough.get(chatId);
    return attention !== undefined && (receipt === undefined || !sameRowKey(receipt, attention));
  }

  /**
   * Whether the project's record still holds this chat's legacy unread mark (D9). Once the chat's log is read, a mark
   * on a log with no attention row no longer makes the chat unread, but the mark stays in the record, and the next page
   * answers from it until that page has read the log. `markViewed` clears it.
   *
   * @param chatId - A chat with a live session or an observed sidebar row.
   * @returns Whether a loaded record marks the chat.
   * @public
   */
  public hasUnreadMark(chatId: string): boolean {
    const projectId = this.#chatProjectId(chatId);
    return projectId !== undefined && this.#unreadRecords.get(projectId)?.legacy.has(chatId) === true;
  }

  /**
   * Wake a reader when any chat's unread answer may have moved: a record loaded, a receipt written, an attention row
   * arrived.
   *
   * @param listener - Called on each change.
   * @returns Unsubscribe.
   * @public
   */
  public subscribeUnread(listener: () => void): () => void {
    return this.#unreadTopic.subscribe(listener);
  }

  /**
   * Stop a chat's live composer record before the chat is deleted (D11).
   *
   * The record actor drains its in-flight write, removes the record, and ends
   * in `removed`, so a patch that arrives later — a debounced keystroke, a
   * restore — is dropped instead of writing the deleted record back. The chat's
   * unread entry is cleared with it. A chat with no live session has no actor to
   * stop; the chat store removes its record file either way.
   *
   * @param chatId - The chat being deleted.
   * @public
   */
  public async removeChat(chatId: string): Promise<void> {
    this.#invalidateDeletedProjection(chatId);
    const deleting = this.#sessions.get(chatId);
    deleting?.messageQueueRef.stop();
    deleting?.commandAbort?.abort();
    // A released chat's record may still be landing its last write; removing under it would bring the file back.
    await this.#composerDrains.get(chatId);
    const session = this.#sessions.get(chatId);
    if (session === undefined) {
      return;
    }
    this.#forgetReceipt(session.projectId, chatId);
    session.messageQueueRef.stop();
    await session.messageQueueStore.remove();
    await removeRecord(session.composerRecordRef);
  }

  /**
   * The actor that owns a project's unread record, for surfacing its write and
   * read failures (G2).
   *
   * @param projectId - The project whose unread record is wanted.
   * @returns The running record actor.
   * @public
   */
  public unreadRecordRef(projectId: string): ComposerRecordRef {
    return this.#unreadRecord(projectId).ref;
  }

  /**
   * Hand every composer's unwritten state to its record and wait until none
   * is on the wire (R9). Drafts flush their debounce first, so the patch they
   * send is the one the record then writes; a record waiting out a retry is
   * written now; a released chat's last write is waited for.
   *
   * @public
   */
  public async flushComposerRecords(): Promise<void> {
    const sessions = [...this.#sessions.values()];
    await Promise.all(
      sessions.map(async (session) => {
        session.draftActorRef.send({ type: 'flushNow' });
        await waitUnlessGone(
          session.draftActorRef,
          (state) => state.matches({ inputSaving: 'idle' }) && state.matches({ editSaving: 'idle' }),
        );
      }),
    );
    await Promise.all([
      ...sessions.map(async (session) => flushRecord(session.composerRecordRef)),
      ...[...this.#unreadRecords.values()].map(async (unread) => flushRecord(unread.ref)),
      ...this.#composerDrains.values(),
    ]);
  }

  /**
   * Stop every live composer record of a project before its records are
   * removed (D11), so a late unread decision or keystroke cannot recreate
   * `unread.json` or a chat record under the deleted project.
   *
   * @param projectId - The project being permanently deleted.
   * @public
   */
  public async removeProject(projectId: string): Promise<void> {
    const chatIds = new Set([
      ...[...this.#inactiveProjections].filter(([, entry]) => entry.projectId === projectId).map(([id]) => id),
      ...[...this.#observed].filter(([, entry]) => entry.projectId === projectId).map(([id]) => id),
      ...[...this.#sessions].filter(([, entry]) => entry.projectId === projectId).map(([id]) => id),
    ]);
    for (const chatId of chatIds) {
      this.#invalidateDeletedProjection(chatId);
      const session = this.#sessions.get(chatId);
      session?.messageQueueRef.stop();
      session?.commandAbort?.abort();
    }
    // Ponytail: waits on every released chat's drain, not only this project's; drains are one write long.
    await Promise.all(this.#composerDrains.values());
    const sessions = [...this.#sessions.values()].filter((session) => session.projectId === projectId);
    await Promise.all([
      ...sessions.map(async (session) => {
        session.messageQueueRef.stop();
        await session.messageQueueStore.remove();
        await removeRecord(session.composerRecordRef);
      }),
      // Kept in the map once removed: a later decision for this project reaches the terminal actor and is dropped.
      removeRecord(this.#unreadRecord(projectId).ref),
    ]);
  }

  /**
   * Copy a draft's attachments into the chat's own directory before they are
   * sent (D18). Resolves only when every blob is durable there.
   *
   * @param chatId - The chat about to send.
   * @param attachments - The draft's attachments, stored beside its record.
   * @throws When any attachment cannot be copied; nothing should be sent then.
   * @public
   */
  public async promoteDraftAttachments(chatId: string, attachments: readonly StoredAttachmentRef[]): Promise<void> {
    if (attachments.length === 0) {
      return;
    }
    const session = this.#sessions.get(chatId);
    if (session === undefined) {
      throw new Error(`ChatSessionStore: cannot send attachments from inactive chat ${chatId}`);
    }
    const { record, chatAttachments } = await session.composer;
    const copies = await Promise.allSettled(
      // `copyTo` skips a blob the chat already holds, so an edit re-referencing a sent attachment moves nothing.
      attachments.map(async (attachment) => record.attachments.copyTo(chatAttachments, attachment)),
    );
    const failure = copies.find((copy) => copy.status === 'rejected');
    if (failure !== undefined) {
      /* Nothing is taken back (PV-R12, L4 D-108): the blobs are content-addressed, so another tab's send may already
       * name what this one copied. ponytail: orphaned blobs live until the chat is deleted; add a sweep over log
       * file-refs and composer records if storage matters. */
      throw failure.reason instanceof Error
        ? failure.reason
        : new Error('Attachment promotion failed.', { cause: failure.reason });
    }
  }

  /**
   * The bytes behind a chat's draft attachments: what a send reads an annotated image from and stores its flattened
   * copy into, beside the draft's record.
   *
   * @param chatId - The chat about to send.
   * @returns The draft's attachment bytes.
   * @throws When the chat has no active session.
   * @public
   */
  public draftAttachmentBytes(chatId: string): DraftAttachmentBytes {
    const session = this.#sessions.get(chatId);
    if (session === undefined) {
      throw new Error(`ChatSessionStore: cannot read attachments of inactive chat ${chatId}`);
    }
    return {
      async read(attachment) {
        const { record, chatAttachments } = await session.composer;
        // An edit's originals were promoted with the message they were sent in, so they live with the chat.
        return (await record.attachments.read(attachment)) ?? chatAttachments.read(attachment);
      },
      async put(bytes, mediaType, filename) {
        const { record } = await session.composer;
        return record.attachments.put(bytes, mediaType, filename);
      },
    };
  }

  /**
   * Unlink the draft-stage bytes nothing in the composer references any more,
   * once a send has cleared the draft (D11, "Send").
   *
   * @param chatId - The chat that just sent.
   * @public
   */
  public async releaseDraftAttachments(chatId: string): Promise<void> {
    const session = this.#sessions.get(chatId);
    if (session === undefined) {
      return;
    }
    const binding = await session.composer;
    await binding.record.attachments.retainOnly(referencedAttachments(session.draftActorRef.getSnapshot().context));
  }

  /** Bind the focused project's chats to its live session again, as focus arrives there (A7b). */
  #bindFocusedProject(projectId: string | undefined): void {
    if (projectId === undefined) {
      return;
    }
    this.#bindProjectSession(projectId, this.#projectSessions.get(projectId));
  }

  /* Bind one live project's session as the registry reports it, or forget it when it closes (A7c). */
  #bindProjectSession(projectId: string, ref: ProjectSessionActorRef | undefined): void {
    if (ref === undefined) {
      this.#projectSessions.delete(projectId);
    } else {
      this.#projectSessions.set(projectId, ref);
      this.#projectRunKeys.delete(projectId);
      this.#refreshProjectRuns(projectId);
    }
  }

  async #readForeignSegment(path: string, client = this.#deps.client): Promise<Uint8Array<ArrayBuffer>> {
    if (this.#foreignReadsActive < 4) {
      this.#foreignReadsActive++;
    } else {
      await new Promise<void>((resolve) => {
        this.#foreignReadWaiters.push(resolve);
      });
    }
    try {
      return await client.readFile(path);
    } finally {
      const next = this.#foreignReadWaiters.shift();
      if (next === undefined) {
        this.#foreignReadsActive--;
      } else {
        next();
      }
    }
  }

  /** Pin a prepared message before transmission so a lost acknowledgement cannot replay on another host. */
  async #connectQueuedCommand(
    session: InternalSession,
    connector: ProjectHostConnector,
    { queueId, signal }: { queueId: string; signal: AbortSignal },
  ): ReturnType<ProjectHostConnector['connect']> {
    const client = await connector.connect(session.chatId);
    try {
      signal.throwIfAborted();
      const destination = connectionPlacement(client.placement);
      await session.messageQueueStore.update((record) => {
        const item = record.items.find((entry) => entry.id === queueId);
        if (item?.command === undefined) {
          throw new Error('Queued message is no longer awaiting delivery.');
        }
        if (item.commandPlacement !== undefined && item.commandPlacement !== destination) {
          throw new Error(
            'This message may already have been sent on another host. Return to its original host to confirm delivery.',
          );
        }
        if (destination === undefined || item.commandPlacement === destination) {
          return record;
        }
        return {
          ...record,
          items: record.items.map((entry) =>
            entry.id === queueId ? { ...entry, commandPlacement: destination } : entry,
          ),
        };
      });
      signal.throwIfAborted();
      return client;
    } catch (error) {
      await client.close();
      throw error;
    }
  }

  /** One serial outbox advancement; the session machine still owns turn admission. */
  async #advanceMessageQueue(
    session: InternalSession,
    signal: AbortSignal,
    canDeliver: boolean,
  ): Promise<QueueAdvanceResult> {
    return session.messageQueueStore.exclusive(async () => {
      let record = await session.messageQueueStore.read();
      signal.throwIfAborted();
      const projection = this.#projectionContext(session.chatId);
      if (projection === undefined || projection.fault !== undefined || !selectCaughtUp(projection)) {
        this.#loadOutbox(session, record, false);
        return this.#holdQueue(session, record.items, 'log-not-caught-up');
      }
      const observation = this.#observed.get(session.chatId);
      const placement = observation?.status === 'attached' ? observation.placement : undefined;
      const observedPlacement = connectionPlacement(placement);
      for (const entry of record.items) {
        if (entry.command !== undefined && projection.ledger.applied[entry.command.commandId] !== undefined) {
          // oxlint-disable-next-line no-await-in-loop -- each acknowledgement reads the preceding durable queue state.
          record = await session.messageQueueStore.acknowledge(entry.id, entry.command.commandId, observedPlacement);
        }
      }
      /* Loaded after the acknowledgements, so a command the log already applied is never drawn twice. */
      this.#loadOutbox(session, record, false);
      const connector = this.#projectHostConnectors.get(session.projectId);
      const gate = this.#outboxGate(session, record, {
        deliverable: canDeliver,
        host: connector !== undefined,
        turnHost: chatTurnAdmit(session.chatId) !== undefined,
        commandInFlight: session.commandInFlight,
        admitting: this.#isAdmittingTurn(session),
        chatLoading: session.persistenceActorRef.getSnapshot().context.isLoadingChat,
        hostWaiting: session.hostWait !== undefined && !session.hostWait.due,
      });
      /* The gate names why it holds (`no-host` included) before a missing host is read as nothing to do. */
      if (gate.kind === 'hold') {
        return this.#holdQueue(session, record.items, gate.reason);
      }
      /* HA-I7: a pick held for an unsettled own run is applied, writes and mark, before the head may leave (AR5-4). */
      if (session.deferredPick !== undefined) {
        return this.#holdQueue(session, record.items, 'pick-deferred');
      }
      if (gate.kind === 'empty' || connector === undefined) {
        return this.#holdQueue(session, record.items, 'empty');
      }
      const { item } = gate;
      if (gate.kind === 'replay' && item.command !== undefined) {
        session.queueHold = undefined;
        session.messageQueueRef.send({ type: 'loaded', items: record.items, sendingId: item.id });
        let acceptingPlacement: string | undefined;
        const { commandId } = item.command;
        const unknownEffect = (tags: Readonly<Record<string, string>>): void => {
          chatReadReporter.report('outbox.unknown-effect', { chatId: session.chatId, occurrence: commandId, tags });
        };
        try {
          let answer: Awaited<ReturnType<typeof sendHostCommand>>;
          try {
            answer = await this.#sendHostCommand(
              async () => {
                const client = await this.#connectQueuedCommand(session, connector, { queueId: item.id, signal });
                acceptingPlacement = connectionPlacement(client.placement);
                return client;
              },
              item.command,
              { signal },
            );
          } catch (error) {
            /* U21: the connection kept failing past the command's bound, so whether it was applied is unknown. */
            const code = getErrno(error);
            if (code !== undefined && peerLossCodes.has(code)) {
              unknownEffect({ reason: 'peer-lost', code });
            }
            throw error;
          }
          const wait = ownerWaitOf(answer);
          if (wait !== undefined) {
            /* A wait-class refusal holds the item for its host; its effect is not unknown. */
            this.#holdForHost(session, { queueId: item.id, command: item.command, refusal: wait });
            return this.#holdQueue(session, record.items, 'host-wait');
          }
          if (answer.effect === 'unknown') {
            /* U8: the bounded re-send ran out with the effect still unknown. */
            unknownEffect({ reason: 'unknown-effect', code: answer.code });
          } else if (answer.status !== 'refused' && answer.effect !== 'durable') {
            /* U20: applied, but not as a durable row. */
            unknownEffect({ reason: 'not-durable', code: answer.status });
          }
          if (answer.status === 'refused') {
            throw new Error(`Delivery could not be confirmed: ${answer.message}`);
          }
          if (answer.effect !== 'durable') {
            throw new Error('Message saved. The host has not confirmed durable acceptance.');
          }
        } catch (error) {
          /* No run started, so a Stop waiting for this replay's run has nothing to wait for. */
          if (session.stop?.target === item.command.payload.runId) {
            this.#releaseStop(session);
          }
          throw error;
        }
        if (session.departing?.id === item.id) {
          /* Accepted: the thread keeps the request through the accepted gesture until its run folds, as a dispatch
           * does, so it never leaves both the thread and the strip while its turn starts. */
          session.acceptedGesture = {
            runId: item.command.payload.runId,
            request: { kind: 'send', message: item.message, queueId: item.id },
          };
          this.#presentTranscript(session, this.#projectionContext(session.chatId));
        }
        this.#endHostWait(session);
        const after = await session.messageQueueStore.acknowledge(item.id, item.command.commandId, acceptingPlacement);
        this.#handOff(session, { queueId: item.id, message: item.message, runId: item.command.payload.runId });
        this.#loadOutbox(session, after, false);
        return { items: after.items, status: 'changed' };
      }
      if (gate.kind === 'steer' && item.steer !== undefined) {
        signal.throwIfAborted();
        const { steer } = item;
        const answer = await this.#sendHostCommand(async () => connector.connect(session.chatId), steer, { signal });
        if (answer.status === 'refused') {
          throw new Error(`Could not steer: ${answer.message}`);
        }
        return this.#holdQueue(session, record.items, 'steered');
      }
      signal.throwIfAborted();
      session.queueHold = undefined;
      session.messageQueueRef.send({ type: 'loaded', items: record.items, sendingId: item.id });
      session.dispatchTask = undefined;
      await this.#requestTurn(
        session,
        {
          kind: 'send',
          message: item.message,
          queueId: item.id,
          requestId: item.requestId,
          ...(item.execution === undefined ? {} : { execution: item.execution }),
        },
        false,
      );
      if (session.stop?.withdrawing === item.id) {
        /* A Stop during admission took it back: it is held under this lock once this advance lets go. */
        return { items: record.items, status: 'waiting' };
      }
      if (
        this.#currentDispatch(session) === undefined &&
        session.stateActorRef.getSnapshot().matches({ run: 'failed' })
      ) {
        return this.#refuseQueuedSend(session, item);
      }
      await this.#currentDispatch(session);
      const after = await session.messageQueueStore.read();
      this.#loadOutbox(session, after, false);
      if (session.hostWait?.queueId === item.id) {
        return this.#holdQueue(session, after.items, 'host-wait');
      }
      return after.items.some((entry) => entry.id === item.id)
        ? {
            items: after.items,
            status: 'blocked',
            error: 'Message saved, but Tau couldn’t confirm it was delivered. Try again.',
          }
        : { items: after.items, status: 'changed' };
    });
  }

  /**
   * The outbox as this page just read it: the strip's rows and the record the gate reads its receipt from.
   *
   * @param session - The chat.
   * @param record - The outbox as read.
   * @param keepSending - Whether the entry this page is delivering stays marked as sending while it is still queued.
   * Only the advance itself, which decides what is sending, passes `false`.
   */
  #loadOutbox(session: InternalSession, record: ChatMessageQueueRecord, keepSending = true): void {
    session.outboxRecord = record;
    const wait = session.hostWait;
    if (
      wait !== undefined &&
      !record.items.some((entry) => entry.id === wait.queueId && entry.command?.commandId === wait.commandId)
    ) {
      /* Delivered, acknowledged or taken back elsewhere: nothing is left to send again. */
      this.#endHostWait(session);
    }
    const { sendingId } = session.messageQueueRef.getSnapshot().context;
    const sending =
      keepSending && sendingId !== undefined && record.items.some((entry) => entry.id === sendingId)
        ? { sendingId }
        : {};
    session.messageQueueRef.send({ type: 'loaded', items: record.items, ...sending });
  }

  /**
   * The outbox's gate for this chat ({@link selectOutboxGate}).
   *
   * @param session - The chat.
   * @param record - The outbox's record.
   * @param readiness - This page's readiness to deliver, or `undefined` to ask only whether work is ahead of the head.
   * @returns The gate.
   */
  #outboxGate(
    session: InternalSession,
    record: Pick<ChatMessageQueueRecord, 'items' | 'afterRunId' | 'afterPlacement' | 'rebasedPlacement'>,
    readiness: OutboxReadiness | undefined,
  ): OutboxGate {
    const projection = this.#projectionContext(session.chatId);
    const known = projection !== undefined && projection.fault === undefined && selectCaughtUp(projection);
    const caught = known ? projection : undefined;
    const run = caught === undefined ? undefined : selectCurrentRun(caught);
    const observation = this.#observed.get(session.chatId);
    const observedPlacement = connectionPlacement(
      observation?.status === 'attached' ? observation.placement : undefined,
    );
    return selectOutboxGate({
      items: record.items,
      caughtUp: caught !== undefined,
      readiness,
      live: isLive(session.stateActorRef.getSnapshot()),
      run: caught === undefined || run === undefined ? undefined : { runId: run.runId, phase: selectRunPhase(caught) },
      afterRunUnseen: caught !== undefined && isAfterRunUnseen(record, caught.ledger, observedPlacement),
      withdrawing: session.stop?.withdrawing,
    });
  }

  /**
   * The outbox waits: log once per change which gate holds its head, so a queue that waits with nothing visibly
   * running names its reason in the console and in replays.
   */
  #holdQueue(session: InternalSession, items: readonly QueuedChatMessage[], reason: string): QueueAdvanceResult {
    const hold = items.length === 0 ? undefined : reason;
    if (hold !== undefined && hold !== session.queueHold) {
      const projection = this.#projectionContext(session.chatId);
      const run = projection === undefined ? undefined : selectCurrentRun(projection);
      logFacts('info', '[ChatSessionStore] queue held', {
        chatId: session.chatId,
        reason: hold,
        queued: items.length,
        runId: run?.runId,
        phase: projection === undefined ? undefined : selectRunPhase(projection),
        machine: session.stateActorRef.getSnapshot().value,
      });
    }
    session.queueHold = hold;
    return { items, status: 'waiting' };
  }

  /**
   * The host refused a prepared send with an owner wait (PERF-5, RH-R17): its writer is a paused tab, is changing
   * hands, or its host is closing. Nothing was applied, so the outbox keeps the command and sends it again by its key,
   * 250 ms later and doubling to 30 s, for as long as the wait lasts. Meanwhile the chat reads as queued, says why,
   * and offers Stop, which takes the send back ({@link ChatSessionStore.#takeBackWaitingSend}).
   */
  #holdForHost(
    session: InternalSession,
    { queueId, command, refusal }: Readonly<{ queueId: string; command: QueuedStartCommand; refusal: CommandRefusal }>,
  ): void {
    const previous = session.hostWait;
    const attempt = previous?.commandId === command.commandId ? previous.attempt + 1 : 0;
    clearTimeout(previous?.timer);
    const timer = setTimeout(
      () => {
        this.#hostWaitRanOut(session, timer);
      },
      Math.min(hostWaitFirstDelay * 2 ** attempt, hostWaitLongestDelay),
    );
    session.hostWait = {
      queueId,
      commandId: command.commandId,
      runId: command.payload.runId,
      attempt,
      due: false,
      sentence: hostWaitSentence(refusal),
      timer,
    };
    if (previous?.commandId !== command.commandId || previous.sentence !== session.hostWait.sentence) {
      logFacts('info', '[ChatSessionStore] send waits for its host', {
        chatId: session.chatId,
        queueId,
        code: refusal.code,
      });
      this.#chatTopics.get(session.chatId)?.emit();
    }
    this.#refreshStatus(session);
    const { stop } = session;
    if (stop?.target === command.payload.runId && stop.withdrawing === undefined) {
      /* A Stop pressed while the send was out: nothing ran, so the person's own Stop takes it back. */
      if (stop.origin === 'stop-button' || stop.origin === 'stop-shortcut') {
        void this.#takeBackWaitingSend(session, stop.origin);
      } else {
        this.#releaseStop(session);
      }
    }
  }

  /** A waiting send's backoff ran out: the outbox may send it again. */
  #hostWaitRanOut(session: InternalSession, timer: ReturnType<typeof setTimeout>): void {
    const current = session.hostWait;
    if (this.#sessions.get(session.chatId) !== session || current?.timer !== timer) {
      return;
    }
    session.hostWait = { ...current, due: true };
    session.messageQueueRef.send({ type: 'retry' });
  }

  /** The send no longer waits for its host: delivered, acknowledged, taken back or gone. */
  #endHostWait(session: InternalSession): void {
    const wait = session.hostWait;
    if (wait === undefined) {
      return;
    }
    clearTimeout(wait.timer);
    session.hostWait = undefined;
    this.#refreshStatus(session);
    this.#chatTopics.get(session.chatId)?.emit();
  }

  /**
   * An admission refused this send (credits, a model it cannot reach, a missing host), so nothing was sent. The chat's
   * banner says why. A lone send with an empty composer is held and offered back to it, as a refused send always has
   * been (I5), so a retry is the person's own Send and never a second copy of the same request; if the composer takes
   * new text before the offer lands, the composer keeps it and the send stays held. A send the composer cannot take
   * because it already holds new text, or one with others queued behind it, keeps its place, blocked: the queue's
   * order never changes, and the strip offers Retry with the reason, which a held row would not show.
   */
  async #refuseQueuedSend(session: InternalSession, item: QueuedChatMessage): Promise<QueueAdvanceResult> {
    const reason = session.stateActorRef.getSnapshot().context.failureReason;
    if (isComposerEmpty(session)) {
      const after = await session.messageQueueStore.update((record) =>
        record.items.length === 1 && record.items[0]?.id === item.id && record.items[0].command === undefined
          ? { ...record, items: [parkSend(record.items[0])] }
          : record,
      );
      this.#loadOutbox(session, after, false);
      const parked = after.items[0];
      if (after.items.length === 1 && parked?.id === item.id && parked.held === true) {
        void this.#offerToComposer(session, parked);
        return { items: after.items, status: 'waiting' };
      }
    }
    const current = await session.messageQueueStore.read();
    this.#loadOutbox(session, current, false);
    return {
      items: current.items,
      status: 'blocked',
      error: reason === undefined ? 'This message wasn’t sent. Try again.' : `This message wasn’t sent: ${reason}`,
    };
  }

  #currentDispatch(session: InternalSession): Promise<void> | undefined {
    return session.dispatchTask;
  }

  #invalidateRemoteRead(chatId: string): void {
    this.#remoteReadVersions.set(chatId, (this.#remoteReadVersions.get(chatId) ?? 0) + 1);
  }

  #startRemoteObservation(chatId: string, projectId: string): boolean {
    const watch = this.#deps.watchRecordFile;
    if (watch === undefined) {
      return false;
    }
    if (this.#remoteObservations.has(chatId)) {
      return true;
    }
    const relativeDirectory = `${chatRecordsPath(chatId)}/events`;
    const directory = `/projects/${projectId}/${relativeDirectory}`;
    /* The directory itself or one above it, as the watch spells paths (project-relative) or absolutely. */
    const holdsDirectory = (path: string): boolean =>
      path === '' ||
      path === relativeDirectory ||
      relativeDirectory.startsWith(`${path}/`) ||
      path === directory ||
      directory.endsWith(`/${path}`) ||
      directory.startsWith(`${path}/`);
    const observation = new ObservationService<void>({
      resource: directory,
      watch: (invalidate, reset) => {
        let active = true;
        const registration = watch(
          directory,
          (event) => {
            if (!active) {
              return;
            }
            if (event.type === 'reset') {
              const projection = this.#projections.get(chatId);
              if (projection !== undefined) {
                this.#validatedDisplays.delete(projection);
              }
              reset();
              return;
            }
            const paths = event.type === 'rename' ? [event.oldPath, event.newPath] : [event.path];
            // This is the foreign segment directory, not the owned events.jsonl
            // writer or chat.json metadata. A summary, deletion or rename of it or of
            // any ancestor also refolds it, and so does a pull that brought nothing
            // new (XD3, round 18).
            if (
              paths.some(
                (path) =>
                  path.endsWith('.jsonl') ||
                  path.endsWith(`/${chatPulledAtFileName}`) ||
                  path === chatPulledAtFileName ||
                  holdsDirectory(path),
              )
            ) {
              invalidate();
            }
          },
          { recursive: true },
        );
        return {
          ready: registration.ready,
          closed: registration.closed,
          dispose() {
            active = false;
            registration.dispose();
          },
        };
      },
      invalidate: () => {
        this.#invalidateRemoteRead(chatId);
      },
      read: async (fence) => {
        await this.#readRemoteSegments(chatId, projectId, fence);
      },
    });
    this.#remoteObservations.set(chatId, observation);
    observation.subscribe(() => {
      // A disposed observation was replaced or released; its successor's scan is the one an empty transcript waits for.
      if (!observation.isDisposed) {
        this.#resumeTranscriptAfterForeignScan(chatId);
        this.#latchIfForeignScanLost(chatId);
      }
    });
    observation.acquire();
    return true;
  }

  /**
   * Where the scan of the history other devices wrote for a chat stands. Until it has read, an empty local log does not
   * show the chat empty (I21); a scan that failed, or a watch that closed before it read, settles the load without
   * forgetting the trays the device remembers (U10), since nothing was read.
   */
  #foreignScanState(chatId: string): 'pending' | 'read' | 'failed' {
    const version = this.#remoteReadVersions.get(chatId);
    const observation = this.#remoteObservations.get(chatId);
    if (observation !== undefined && !observation.isDisposed) {
      switch (observation.getSnapshot().status) {
        case 'registering':
        case 'pending': {
          return 'pending';
        }
        case 'ready': {
          return 'read';
        }
        // A watch that closed reads nothing more, and closing invalidated its last read: the lane cannot present it.
        case 'error':
        case 'closed': {
          return 'failed';
        }
      }
    }
    if (version === undefined) {
      return 'read';
    }
    if (this.#remoteReadEndedVersions.get(chatId) !== version) {
      return 'pending';
    }
    return this.#remoteReadFailedVersions.get(chatId) === version ? 'failed' : 'read';
  }

  /** Settle an empty transcript that waited for the scan of other devices' history, once that scan has ended. */
  #resumeTranscriptAfterForeignScan(chatId: string): void {
    const session = this.#sessions.get(chatId);
    if (session?.transcriptAwaitsForeignScan !== true) {
      return;
    }
    const scan = this.#foreignScanState(chatId);
    if (scan === 'pending') {
      return;
    }
    const projection = this.#projectionContext(chatId);
    if (scan === 'read') {
      // A log that has not caught up is not settled yet: its catch-up materializes and settles it, unless the host
      // refused the read, and nothing will catch it up.
      if (projection === undefined || !selectCaughtUp(projection)) {
        if (this.#observed.get(chatId)?.status !== 'refused') {
          return;
        }
        session.transcriptAwaitsForeignScan = false;
        this.#latchTranscriptSettled(session);
        return;
      }
      // Present what the scan brought: a new materialization settles the transcript, with or without turns.
      this.#presentTranscript(session, projection);
    }
    session.transcriptAwaitsForeignScan = false;
    this.#latchTranscriptSettled(session);
  }

  /**
   * Settle a chat whose local log has answered while the watch of other devices' history has ended without a read
   * that counts, so the lane cannot present the log. Nothing will until the client is replaced, so the load has settled
   * (I21); nothing was read to forget the trays by (U10).
   */
  #latchIfForeignScanLost(chatId: string): void {
    const session = this.#sessions.get(chatId);
    if (
      session === undefined ||
      session.transcriptSettled ||
      this.#displayedTranscript(session).length > 0 ||
      !this.#answeredLogReads.has(chatId) ||
      this.#foreignScanState(chatId) !== 'failed'
    ) {
      return;
    }
    // A local log the lane can still present settles through its own materialization.
    // A page that is not the log's end is not settled yet; nor is a log the lane can still present.
    const projection = this.#projectionContext(chatId);
    if (projection === undefined || !selectCaughtUp(projection) || this.#hasDisplayAuthority(chatId, projection)) {
      return;
    }
    session.transcriptAwaitsForeignScan = false;
    this.#latchTranscriptSettled(session);
  }

  #stopRemoteObservationIfUnused(chatId: string): void {
    if (this.#observed.has(chatId) || this.#sessions.has(chatId)) {
      return;
    }
    this.#remoteObservations.get(chatId)?.dispose();
    this.#remoteObservations.delete(chatId);
    this.#invalidateRemoteRead(chatId);
  }

  async #refreshRemoteSegmentsSafely(chatId: string, projectId: string): Promise<void> {
    try {
      await this.refreshRemoteSegments(chatId, projectId);
    } catch (error) {
      console.warn('[ChatSessionStore] foreign chat log could not be read', chatId, error);
    }
  }

  /**
   * Recompute which outbox entry the thread shows as sent ({@link selectDepartingSend}) and tell views when it moved.
   * A send a Stop is taking back is never shown again, even while its removal is still being written.
   */
  #refreshDeparting(session: InternalSession): void {
    if (this.#sessions.get(session.chatId) !== session) {
      return;
    }
    const queue = session.messageQueueRef.getSnapshot();
    /* Entries and receipt from one read: every record the strip draws passes through `#loadOutbox` first. */
    const record = session.outboxRecord;
    const shown =
      queue.status === 'active' && record !== undefined
        ? selectDepartingSend({ ...queue.context, items: record.items }, this.#outboxGate(session, record, undefined))
        : undefined;
    if (shown?.id === session.departing?.id && shown?.message === session.departing?.message) {
      return;
    }
    session.departing = shown;
    this.#messagePresentations.delete(session.chatId);
    this.#chatTopics.get(session.chatId)?.emit();
  }

  /**
   * Take back a send the host has not been handed yet (send/queue/stop lifecycle F2).
   *
   * Nothing ran, so nothing is cancelled: the admission is abandoned, the outbox entry is removed under the delivery
   * lock, and only once the removal is confirmed does the message go back to the composer, as if it had never been
   * sent. Until then the Stop stays pressed. If another page delivered the send first, the Stop cancels the run it
   * started instead, so the request is never both sent and back in the composer. A send whose command is already
   * prepared or in flight is not this: it is stopped like any run.
   *
   * @returns `true` when the Stop was this, so no run is cancelled now.
   */
  #withdrawDepartingSend(session: InternalSession, origin: StopOrigin): boolean {
    const { departing } = session;
    if (departing === undefined || departing.command !== undefined || session.stop?.withdrawing !== undefined) {
      return false;
    }
    const snapshot = session.stateActorRef.getSnapshot();
    const held = snapshot.context.pendingGesture;
    const admitting =
      snapshot.matches({ run: { queued: 'admitting' } }) &&
      held?.kind === 'send' &&
      (held.queueId ?? held.message.id) === departing.id;
    /* Past admission the command is being prepared: only a cancel can stop it now. */
    if (!admitting && (isLive(snapshot) || session.commandInFlight)) {
      return false;
    }
    logFacts('info', '[ChatSessionStore] queued send withdrawn', {
      chatId: session.chatId,
      messageId: departing.id,
      origin,
    });
    session.stop = {
      origin,
      withdrawing: departing.id,
      target: departing.requestId,
      sent: undefined,
      cancelId: undefined,
    };
    if (admitting) {
      session.stateActorRef.send({ type: 'withdrawTurn', queueId: departing.id });
    }
    this.#refreshDeparting(session);
    this.#chatTopics.get(session.chatId)?.emit();
    void this.#finishWithdrawal(session, departing);
    return true;
  }

  /**
   * Whether an outbox entry was never handed to a host, so a Stop may take it back. A steered send counts: the gate
   * delivers it only after its steer's run ended. So does a prepared send whose every answer was an owner wait, read
   * under the delivery lock, where no re-send of it is out, while the log holds no run of it (PERF-5).
   */
  #unsent(session: InternalSession, item: QueuedChatMessage, waited: HostWait | undefined): boolean {
    if (item.command === undefined) {
      return true;
    }
    if (waited === undefined) {
      return false;
    }
    return (
      item.command.commandId === waited.commandId &&
      session.hostWait?.commandId === waited.commandId &&
      this.#projectionContext(session.chatId)?.ledger.runs[waited.runId] === undefined
    );
  }

  /** The turn a taken-back waiting send held ends with nothing placed: the chat holds nothing afterwards. */
  #letGoOfWaitingTurn(session: InternalSession, waited: HostWait): void {
    this.#endHostWait(session);
    session.stateActorRef.send({ type: 'withdrawTurn', queueId: waited.queueId });
    if (session.activeCommand?.type === 'start' && session.activeCommand.payload.runId === waited.runId) {
      session.activeCommand = undefined;
      session.watchedRunId = undefined;
    }
    this.#refreshStatus(session);
    this.#scheduleRunReleaseIfTerminal(session);
  }

  /**
   * Take back a send that waits for its host (PERF-5). Every answer so far applied nothing, and under the delivery
   * lock no re-send is out, so the command is dropped and the send is offered to the composer, as a send stopped
   * during admission is ({@link ChatSessionStore.#finishWithdrawal}). The thread and the strip leave it out meanwhile.
   */
  async #takeBackWaitingSend(session: InternalSession, origin: StopOrigin): Promise<void> {
    const wait = session.hostWait;
    const entry = session.outboxRecord?.items.find((item) => item.id === wait?.queueId);
    if (wait === undefined || entry === undefined) {
      this.#releaseStop(session);
      return;
    }
    logFacts('info', '[ChatSessionStore] waiting send withdrawn', {
      chatId: session.chatId,
      messageId: entry.id,
      origin,
    });
    session.stop = { origin, withdrawing: entry.id, target: wait.runId, sent: undefined, cancelId: undefined };
    this.#refreshDeparting(session);
    this.#chatTopics.get(session.chatId)?.emit();
    await this.#finishWithdrawal(session, entry, wait);
  }

  /**
   * Offer a withdrawn send back to the composer. Under the delivery lock, so no page is handing it over meanwhile, it
   * stays at the head of the outbox, held, and so does the work queued behind it: as behind a stopped run, that goes
   * out only with Send now. Then the composer is offered it ({@link ChatSessionStore.#offerToComposer}).
   */
  async #finishWithdrawal(session: InternalSession, departing: QueuedChatMessage, waited?: HostWait): Promise<void> {
    let record: ChatMessageQueueRecord;
    try {
      record = await session.messageQueueStore.exclusive(async () =>
        session.messageQueueStore.update((current) =>
          current.items.some((item) => item.id === departing.id && this.#unsent(session, item, waited))
            ? {
                ...current,
                items: current.items.map((item) =>
                  item.id === departing.id
                    ? parkSend(unprepared(item))
                    : item.command === undefined && item.steer === undefined
                      ? parkSend(item)
                      : item,
                ),
              }
            : current,
        ),
      );
    } catch (error) {
      /* Nothing changed: the Stop did not land, so it is let go and offered again, and the send goes on as it was. */
      console.warn('[ChatSessionStore] a withdrawn send could not be held', session.chatId, error);
      this.#releaseStop(session);
      this.#refreshDeparting(session);
      return;
    }
    if (this.#sessions.get(session.chatId) === session) {
      this.#loadOutbox(session, record);
    }
    const kept = record.items.find((item) => item.id === departing.id);
    if (kept?.held === true && kept.command === undefined) {
      if (waited !== undefined) {
        this.#letGoOfWaitingTurn(session, waited);
      }
      await this.#offerToComposer(session, kept);
      this.#releaseStop(session);
    } else if (kept !== undefined || record.afterRunId === departing.requestId) {
      /* Another page prepared or handed it over first: its run is the one to stop, whenever the log has it. */
      if (session.stop?.withdrawing === departing.id) {
        session.stop = { ...session.stop, withdrawing: undefined };
      }
      void this.#cancelSessionRun(session, departing.requestId);
    } else {
      /* Removed from another page: nothing is left to stop. */
      this.#releaseStop(session);
    }
    if (session.messageQueueRef.getSnapshot().status === 'active') {
      session.messageQueueRef.send({ type: 'refresh' });
    }
  }

  /**
   * The host took back a request this page stopped (`TURN_WITHDRAWN`): its run holds the old identity, so it comes back
   * as a fresh send at the head of the outbox, held, and is then offered to the composer
   * ({@link ChatSessionStore.#offerToComposer}). As with a withdrawal, the person stopped, so every unprepared,
   * unsteered send queued behind it is held until Send now, and a new send goes ahead of them.
   *
   * @param session - The chat.
   * @param message - The request the host took back.
   */
  async #returnTakenBack(session: InternalSession, message: MyUIMessage, attempt = 0): Promise<void> {
    const id = generatePrefixedId(idPrefix.message);
    const entry: QueuedChatMessage = {
      id,
      requestId: generatePrefixedId(idPrefix.request),
      message: { ...message, id },
      held: true,
    };
    try {
      const record = await session.messageQueueStore.update((current) => ({
        ...current,
        items: [
          entry,
          ...current.items.map((item) =>
            item.command === undefined && item.steer === undefined ? parkSend(item) : item,
          ),
        ],
      }));
      if (this.#sessions.get(session.chatId) === session) {
        this.#loadOutbox(session, record);
      }
    } catch (error) {
      /* It cannot be kept: an empty composer takes it directly. One that holds new text keeps it, and the outbox is
       * asked again before the person is told, since the thread no longer shows the request. */
      console.warn('[ChatSessionStore] a taken-back send could not be kept in the outbox', session.chatId, error);
      if (await this.#restoreStoppedDraft(session, message)) {
        this.#draftReturnTopics.get(session.chatId)?.emit();
        return;
      }
      if (attempt < takeBackRetries && this.#sessions.get(session.chatId) === session) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, takeBackRetryDelay * 2 ** attempt);
        });
        await this.#returnTakenBack(session, message, attempt + 1);
        return;
      }
      const text = message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
      session.persistenceActorRef.send({
        type: 'setPersistedError',
        error: parseErrorForPersistence(new Error(`The stopped message could not be saved. It read: ${text}`)),
      });
      return;
    }
    await this.#offerToComposer(session, entry);
  }

  /**
   * Offer a send that did not go out back to the composer, so it is never in no place at all.
   *
   * The send is already held in the outbox, where only the person's Send now moves it. An empty composer takes it, and
   * only then does the outbox let go of it; a composer that took new text meanwhile keeps that text, and the send stays
   * held in the strip. Either way it is in one place, and never lost.
   *
   * @param session - The chat.
   * @param entry - The held outbox entry.
   * @returns Whether the composer took it.
   */
  async #offerToComposer(session: InternalSession, entry: QueuedChatMessage): Promise<boolean> {
    if (this.#sessions.get(session.chatId) !== session) {
      return false;
    }
    session.offering = entry.id;
    this.#chatTopics.get(session.chatId)?.emit();
    const transfer = this.#transferToComposer(session, entry);
    session.composerWork.add(transfer);
    try {
      const taken = await transfer;
      if (taken) {
        this.#draftReturnTopics.get(session.chatId)?.emit();
      }
      return taken;
    } catch (error) {
      console.warn('[ChatSessionStore] a returned send could not reach the composer', session.chatId, error);
      return false;
    } finally {
      session.composerWork.delete(transfer);
      if (session.offering === entry.id) {
        session.offering = undefined;
        this.#chatTopics.get(session.chatId)?.emit();
      }
    }
  }

  /**
   * Move a parked send into the composer. Its bytes are copied first, outside the delivery lock: a copy is idempotent,
   * and a send whose bytes did not all copy stays parked, where the chat's own copies still serve its Send now. Then,
   * under the lock that delivery and Send now take, so no page sends it meanwhile, only a send still parked here comes
   * back, and the outbox lets go of it only once the composer's own record holds it.
   *
   * @returns Whether the composer took it.
   */
  async #transferToComposer(session: InternalSession, entry: QueuedChatMessage): Promise<boolean> {
    if (!(await this.#retainAttachments(session, entry.message))) {
      return false;
    }
    return session.messageQueueStore.exclusive(async () => {
      const current = await session.messageQueueStore.read();
      const parked = current.items.find((item) => item.id === entry.id);
      if (
        parked?.held !== true ||
        parked.command !== undefined ||
        parked.steer !== undefined ||
        this.#sessions.get(session.chatId) !== session ||
        !isComposerEmpty(session)
      ) {
        return false;
      }
      if (!(await this.#writeDraft(session, parked.message))) {
        return false;
      }
      try {
        const record = await session.messageQueueStore.update((current) => ({
          ...current,
          items: current.items.filter((item) => item.id !== entry.id),
        }));
        if (this.#sessions.get(session.chatId) === session) {
          this.#loadOutbox(session, record);
        }
      } catch (error) {
        /* The composer has it, and the outbox still holds it until Send now: the person sees it twice, never zero. */
        console.warn('[ChatSessionStore] a returned send could not leave the outbox', session.chatId, error);
      }
      return true;
    });
  }

  /**
   * The departing send is the host's from here: it has a turn of its own. The log may already have folded its request,
   * or even its end, while the acknowledgement was written, so the handoff is reconciled with it at once.
   */
  #handOff(
    session: InternalSession,
    { queueId, message, runId }: Readonly<{ queueId: string; message: MyUIMessage; runId: string }>,
  ): void {
    if (session.departing?.id !== queueId) {
      return;
    }
    session.handedOff = { message, runId };
    const projection = this.#projectionContext(session.chatId);
    if (projection !== undefined) {
      this.#settleHandedOff(session, projection);
    }
  }

  /**
   * The request the thread showed as departing has a turn of its own from here: once the log has it, its run's rows
   * describe it, and once that run has ended, a Stop no longer aims at it.
   */
  #settleHandedOff(session: InternalSession, projection: ChatProjection): void {
    const { handedOff } = session;
    if (handedOff === undefined) {
      return;
    }
    const lifecycle = projection.ledger.runs[handedOff.runId]?.lifecycle;
    if (lifecycle === 'completed' || lifecycle === 'failed' || lifecycle === 'cancelled') {
      session.handedOff = undefined;
      this.#chatTopics.get(session.chatId)?.emit();
    } else if (handedOff.logged !== true && projection.views[handedOff.runId]?.user !== undefined) {
      /* The log has the request: the run's own rows describe it from here, and it can be edited like any other. */
      session.handedOff = { ...handedOff, logged: true };
      this.#chatTopics.get(session.chatId)?.emit();
    }
  }

  /**
   * Send the Stop's cancel, once and to the right run.
   *
   * @param session - The chat.
   * @param target - A run the Stop must cancel once the log has it (a send prepared or handed over when Stop was
   *   pressed); by default the command this page dispatched, else the log's current run.
   * @param accepted - The host just accepted this page's command for the run, so an ended attempt this page's log
   *   still shows is the one before it (a resume shares its run id), not proof that nothing runs.
   */
  async #cancelSessionRun(session: InternalSession, target?: string, accepted = false): Promise<void> {
    if (session.stop === undefined) {
      return;
    }
    if (target !== undefined) {
      session.stop = { ...session.stop, target };
    }
    const { stop } = session;
    const projected = this.#projectionContext(session.chatId);
    const runId =
      stop.target ??
      (session.activeCommand?.type === 'start' || session.activeCommand?.type === 'resume'
        ? session.activeCommand.payload.runId
        : projected === undefined
          ? undefined
          : selectCurrentRun(projected)?.runId);
    const entry = runId === undefined ? undefined : projected?.ledger.runs[runId];
    const lifecycle = entry?.lifecycle;
    if (
      runId === undefined ||
      (!accepted && (lifecycle === 'completed' || lifecycle === 'failed' || lifecycle === 'cancelled'))
    ) {
      /* Nothing live to cancel: a Stop over a run that already ended must not wait for an end that came before it,
       * nor send a cancel the host can only refuse. */
      this.#releaseStop(session);
      return;
    }
    if (stop.sent === runId) {
      return;
    }
    const connector = this.#projectHostConnectors.get(session.projectId);
    if (connector === undefined || (stop.target !== undefined && entry === undefined)) {
      /* Owed: a live run whose host is not attached yet, or a handed-over send the log has not shown yet. The cancel
       * is sent when the host attaches (`publishProjectHostConnector`) or the run reaches the log (`#syncProjection`).
       * The Stop stays pressed until then. */
      return;
    }
    const command: HostCommand = {
      type: 'cancel',
      commandId: generatePrefixedId(idPrefix.request),
      payload: {
        chatId: session.chatId,
        runId,
        /* The person's own Stop takes the request back when the turn was not kept yet (`TURN_WITHDRAWN`), into an
         * empty composer only: with new text there, the request stays in the thread as an ordinary stop. */
        ...((stop.origin === 'stop-button' || stop.origin === 'stop-shortcut') && isComposerEmpty(session)
          ? { withdraw: true }
          : {}),
      },
    };
    session.stop = { ...stop, sent: runId, cancelId: command.commandId };
    if ('withdraw' in command.payload) {
      session.takeBackRunId = runId;
    }
    logStop(command, stop.origin);
    let failure: Error | undefined;
    try {
      let answer = await this.#sendHostCommand(async () => connector.connect(session.chatId), command);
      if (answer.status === 'refused' && answer.code === 'COMMAND_UNREADABLE' && 'withdraw' in command.payload) {
        if (!this.#ownsLiveAttempt(session, { cancelId: command.commandId, runId, attempt: entry?.attempt })) {
          /* The Stop settled, or its run ended and resumed, while the host refused: the retry is no longer the
           * person's, and it must not stop an attempt nobody asked to stop. */
          return;
        }
        /* A host older than `withdraw` refuses the field and applies nothing: the same cancel without it still stops
         * the run, which then keeps its request in the thread. */
        answer = await this.#sendHostCommand(async () => connector.connect(session.chatId), {
          ...command,
          payload: { chatId: command.payload.chatId, runId: command.payload.runId },
        });
      }
      if (answer.status === 'refused' && answer.code === 'RUN_NOT_LIVE') {
        /* The run ended before the cancel arrived: the Stop has nothing left to do, and nothing went wrong. */
        if (sentCancel(session) === command.commandId) {
          this.#releaseStop(session);
        }
        return;
      }
      if (answer.status === 'refused') {
        failure = new Error(`Host cancel refused ${answer.code}: ${answer.message}`);
      }
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }
    if (failure !== undefined && sentCancel(session) === command.commandId) {
      /* The cancel did not land: let go of the Stop so the composer offers it again, rather than waiting for an end
       * nothing asked for. */
      logFacts('warn', '[ChatSessionStore] stop did not reach the host', {
        chatId: session.chatId,
        runId,
        reason: failure.message,
      });
      session.persistenceActorRef.send({ type: 'setPersistedError', error: parseErrorForPersistence(failure) });
      this.#releaseStop(session);
    }
  }

  /** Whether the cancel `cancelId` is still the pending Stop's, and the attempt it aimed at is still the live one. */
  #ownsLiveAttempt(
    session: InternalSession,
    { cancelId, runId, attempt }: Readonly<{ cancelId: string; runId: string; attempt: number | undefined }>,
  ): boolean {
    if (sentCancel(session) !== cancelId) {
      return false;
    }
    const entry = this.#projectionContext(session.chatId)?.ledger.runs[runId];
    return (
      entry === undefined ||
      ((attempt === undefined || entry.attempt === attempt) &&
        entry.lifecycle !== 'completed' &&
        entry.lifecycle !== 'failed' &&
        entry.lifecycle !== 'cancelled')
    );
  }

  /** A Stop that has nothing left to wait for: the composer leaves `stopping`. */
  #releaseStop(session: InternalSession): void {
    if (session.stop !== undefined) {
      session.stop = undefined;
      this.#chatTopics.get(session.chatId)?.emit();
    }
  }

  async #finishSeedLocalLogCheck(
    session: InternalSession,
    attachment: Actor<typeof hostAttachment>,
    check: Promise<Uint8Array<ArrayBuffer>>,
  ): Promise<void> {
    let empty = false;
    let failure: unknown;
    try {
      const bytes = await check;
      empty = bytes.byteLength === 0;
    } catch (error) {
      const code = getErrno(error);
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        empty = true;
      } else {
        failure = error;
      }
    }
    if (
      session.seedLocalLogCheck !== check ||
      session.pendingSeedGesture === undefined ||
      this.#sessions.get(session.chatId) !== session ||
      this.#observed.get(session.chatId)?.attachment !== attachment
    ) {
      return;
    }
    session.seedLocalLogCheck = undefined;
    if (failure !== undefined) {
      console.warn('[ChatSessionStore] local chat log could not be checked', session.chatId, failure);
      session.persistenceActorRef.send({
        type: 'setPersistedError',
        error: parseErrorForPersistence(
          failure instanceof Error ? failure : new Error('Local chat log could not be checked.', { cause: failure }),
        ),
      });
    }
    if (empty) {
      session.seedLocalLogEmpty = true;
      this.startPendingSeed(session.chatId);
    }
  }

  /**
   * Start reading the chat's own segment from the file (HA1, HA-I1), where this device holds the chat's files and the
   * chat is placed here: the browser and desktop placements, and a device-relative `tau serve` (`origin`, `loopback:`)
   * whose log this device already holds rows of, as one sharing the folder does. A paired computer, a remote daemon
   * or an external agent keeps the host read whatever the folder holds (residual R1).
   *
   * @param chatId - The observed chat.
   * @param observed - Its observation.
   * @returns Whether the chat is local: decided by the source's first pass, which must hold the file (`current`);
   *   any other first verdict stops the source and keeps the host read, so a chat is never left with neither.
   */
  async #startOwnSource(chatId: string, observed: ObservedChat): Promise<boolean> {
    const directory = `/projects/${observed.projectId}/${chatRecordsPath(chatId)}`;
    const { client } = this.#deps;
    const held = async (path: string): Promise<boolean> => {
      try {
        return await client.exists(path);
      } catch {
        return false;
      }
    };
    /* ponytail: a directory of foreign segments alone (no own log, no record) keeps the host read. The foreign scan
     * already reads those segments with no host (HA-I1 holds for every turn they carry), so the own source would add
     * only an empty own segment's authority, which no record vouches for there (HA0 row 18 is green on this path). */
    const [ownLog, record] = await Promise.all([held(`${directory}/events.jsonl`), held(`${directory}/chat.json`)]);
    if (!ownLog && !record) {
      return false;
    }
    let settings: Awaited<ReturnType<ChatSessionStore['getChatHostSettings']>>;
    try {
      settings = await this.getChatHostSettings(chatId);
    } catch {
      settings = undefined;
    }
    const execution = settings?.activeExecution;
    const host = execution === undefined ? undefined : daemonPlacementOf(execution);
    const placedHere =
      execution === undefined ||
      (execution.kind === 'tau' &&
        (host === undefined || host === 'desktop' || (ownLog && isDeviceRelativeHostId(host))));
    if (!placedHere) {
      return false;
    }
    const { createOwnSegmentSource } = await loadCode(async () => import('#services/chat-own-segment-source.js'));
    if (this.#observed.get(chatId) !== observed) {
      return false;
    }
    const first = Promise.withResolvers<boolean>();
    let decided = false;
    observed.source = createOwnSegmentSource({
      chatId,
      directory,
      client: () => this.#deps.client,
      projection: {
        getSnapshot: () => this.#projectionOf(chatId).getSnapshot(),
        send: (event) => {
          this.#projectionOf(chatId).send(event);
        },
      },
      onVerdict: (verdict) => {
        if (!decided) {
          decided = true;
          const local = verdict === 'current' || verdict === 'deleted';
          if (!local) {
            this.#stopOwnSource(observed);
          }
          first.resolve(local);
          if (!local) {
            return;
          }
          /* Another tab or app writing the chat's own files (a shared folder's `tau serve`) wakes the source, as the
           * host's watch of its log woke the host read. The foreign segments have their own watch. */
          observed.ownWatch = this.#deps.watchRecordFile?.(directory, () => {
            observed.source?.wake();
          });
        }
        this.#ownVerdict(chatId, observed, verdict);
      },
      onRewrite: () => {
        chatReadReporter.report('own.rewrite', {
          chatId,
          occurrence: `${chatId}:own:${String(this.#projectionContext(chatId)?.ledger.position.cursor ?? 0)}`,
          tags: { reason: 'shrink' },
        });
      },
      onStaleRun: () => {
        this.#attachInPage(chatId, observed);
      },
    });
    return first.promise;
  }

  #stopOwnSource(observed: ObservedChat): void {
    observed.source?.stop();
    observed.source = undefined;
    observed.ownWatch?.dispose();
    observed.ownWatch = undefined;
  }

  /** What the own source's pass decided (HA-I3a): read authority, the deleted state, or nothing new. */
  #ownVerdict(chatId: string, observed: ObservedChat, verdict: OwnSegmentVerdict): void {
    if (this.#observed.get(chatId) !== observed) {
      return;
    }
    /* `unreadable` keeps the authority it had: a failed read is retried, and the file still holds the chat. */
    if (verdict !== 'unreadable') {
      const wasCurrent = observed.ownCurrent === true;
      observed.ownCurrent = verdict === 'current';
      if (wasCurrent && !observed.ownCurrent) {
        /* A pick waiting on this source's run (HA-I7) waits no longer. */
        this.#projectionTopics.get(chatId)?.emit();
      }
    }
    if (verdict === 'deleted') {
      this.#stopOwnSource(observed);
      this.#invalidateDeletedProjection(chatId);
      return;
    }
    /* `missing` keeps the turns shown (R8's line is HA5's); `unreadable` keeps them and reads again. */
    if (verdict !== 'current') {
      return;
    }
    this.#answeredLogReads.add(chatId);
    if (!this.#ownRunUnsettled(chatId)) {
      observed.inPageTries = undefined;
      observed.inPageNextAt = undefined;
    }
    observed.attachment?.send({ type: 'own-read' });
    this.#syncProjection(chatId, 'none');
    this.#unreadTopic.emit();
    this.#latchIfForeignScanLost(chatId);
    this.startPendingSeed(chatId);
    this.#settle(chatId, observed);
  }

  /**
   * Whether the chat's own segment, read from the file, shows a run that has not settled (HA-I5, HA-I7). A chat this
   * device does not read from the file (a remote host's) never does: its pick is not deferred on a host that may be gone.
   */
  #ownRunUnsettled(chatId: string): boolean {
    const projection = this.#projectionContext(chatId);
    return (
      this.#observed.get(chatId)?.ownCurrent === true &&
      projection !== undefined &&
      selectCaughtUp(projection) &&
      retainsLiveRun(selectRunPhase(projection))
    );
  }

  /** Resolve once the chat's own run has settled; reject when `signal` aborts (a newer pick). */
  async #ownRunSettled(chatId: string, signal: AbortSignal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let unsubscribe = (): void => undefined;
      const check = (): void => {
        if (signal.aborted) {
          unsubscribe();
          reject(signal.reason as Error);
        } else if (!this.#ownRunUnsettled(chatId)) {
          unsubscribe();
          resolve();
        }
      };
      unsubscribe = this.subscribeProjection(chatId, check);
      signal.addEventListener('abort', check, { once: true });
      check();
    });
  }

  /**
   * HA-I5: on open and on every live (re)subscribe, send `attach` once while the own segment shows an unsettled run.
   * It routes as every command does, by the stored records (HA-I7); the host's `checkDriver` decides.
   */
  #settle(chatId: string, observed: ObservedChat): void {
    const subscription = observed.subscriptions ?? 0;
    const connector = this.#projectHostConnectors.get(observed.projectId);
    if (
      subscription === 0 ||
      observed.settledFor === subscription ||
      observed.ownCurrent !== true ||
      connector === undefined ||
      !this.#ownRunUnsettled(chatId)
    ) {
      return;
    }
    observed.settledFor = subscription;
    void this.#sendAttach(chatId, async () => connector.connect(chatId));
  }

  /** Send `attach` for a chat; its answer is the host's to act on, and a failure is the next trigger's to repeat. */
  async #sendAttach(chatId: string, connect: () => ReturnType<ProjectHostConnector['connect']>): Promise<void> {
    try {
      await this.#sendHostCommand(connect, {
        type: 'attach',
        commandId: generatePrefixedId(idPrefix.request),
        payload: { chatId },
      });
    } catch {
      /* HA-I5 sends again on the next open, (re)subscribe or stale poll. */
    }
  }

  /**
   * HA-I5's stale span completed: `attach` on this build's own host, whatever the record says; one at a time. A span
   * that stays complete re-sends on the source's 1 s poll, backing off 1 s doubling to 60 s while the run stays
   * unsettled, until an own read shows it settled.
   */
  #attachInPage(chatId: string, observed: ObservedChat): void {
    const connector = this.#projectHostConnectors.get(observed.projectId);
    const at = performance.now();
    if (
      connector === undefined ||
      this.#inPageAttaching.has(chatId) ||
      (observed.inPageNextAt !== undefined && at < observed.inPageNextAt)
    ) {
      return;
    }
    const tries = (observed.inPageTries ?? 0) + 1;
    observed.inPageTries = tries;
    observed.inPageNextAt = at + Math.min(1000 * 2 ** (tries - 1), inPageAttachBackoffMilliseconds);
    this.#inPageAttaching.add(chatId);
    /* ponytail: the route is a flag the connector's first, synchronous settings read sees; a connector port for the
     * in-page host replaces it if the connector grows one (HA2 owns host-connector.ts). */
    // oxlint-disable-next-line promise-function-async -- the route flag must clear before the connect's first await.
    const connect = (): ReturnType<ProjectHostConnector['connect']> => {
      this.#inPageRoute.add(chatId);
      try {
        return connector.connect(chatId);
      } finally {
        this.#inPageRoute.delete(chatId);
      }
    };
    const attach = async (): Promise<void> => {
      try {
        await this.#sendAttach(chatId, connect);
      } finally {
        this.#inPageAttaching.delete(chatId);
      }
    };
    void attach();
  }

  /** Every command goes through here: an answer whose cursor reaches the fold's end wakes the own source. */
  readonly #sendHostCommand: typeof sendHostCommand = async (connect, command, options) => {
    const answer = await sendHostCommand(connect, command, options);
    const { chatId } = command.payload as { readonly chatId?: string };
    const { cursor } = answer as { readonly cursor?: unknown };
    const projection = chatId === undefined ? undefined : this.#projectionContext(chatId);
    if (
      chatId !== undefined &&
      typeof cursor === 'number' &&
      projection !== undefined &&
      cursor >= projection.ledger.position.cursor
    ) {
      this.#observed.get(chatId)?.source?.wake();
    }
    return answer;
  };

  #stopObservedAttachment(chatId: string, observed: ObservedChat): void {
    clearTimeout(observed.lossReport);
    observed.lossReport = undefined;
    if (observed.ownCurrent !== true) {
      this.#answeredLogReads.delete(chatId);
    }
    const session = this.#sessions.get(chatId);
    if (session !== undefined) {
      session.seedLocalLogEmpty = false;
      session.seedLocalLogCheck = undefined;
    }
    if (observed.retry !== undefined) {
      clearTimeout(observed.retry);
    }
    observed.retry = undefined;
    observed.attachment?.stop();
    observed.attachment = undefined;
    observed.placement = undefined;
    observed.status = 'unknown';
  }

  /**
   * Fold one host read answer, reporting `own.rewrite` when the fold resets the own projection (HA0): the host said
   * the reader is ahead or of another identity, or a version-1 host clamped. Every host read answer reaches the
   * projection here (facts pages fold inside the attachment's capture, which keeps the reset version); a reset the
   * store sends itself does not pass here, so it is not reported.
   *
   * @param chatId - The chat the answer is for.
   * @param answer - The host's read answer.
   */
  #foldHostAnswer(chatId: string, answer: ChatProjectionReadAnswer): void {
    const before = this.#projectionContext(chatId);
    this.#projectionOf(chatId).send({ type: 'batch', answer });
    const after = this.#projectionContext(chatId);
    if (before === undefined || after === undefined || after.resetVersion === before.resetVersion) {
      return;
    }
    const reason =
      answer.status === 'refused'
        ? answer.reason
        : before.ledger.position.sourceGeneration !== undefined &&
            'sourceGeneration' in answer &&
            answer.sourceGeneration !== before.ledger.position.sourceGeneration
          ? 'identity-mismatch'
          : 'clamped';
    chatReadReporter.report('own.rewrite', {
      chatId,
      occurrence: `${chatId}:${String(after.resetVersion)}`,
      tags: { reason },
    });
  }

  /**
   * HA0: report what a lost or refused host read leaves the person with, once the loss has lasted
   * {@link chatReadLossBoundMilliseconds}; the caller passes no leadership handoff (`owner-fenced`). A session that never
   * displayed its own segment is a cold, hidden transcript (once per session); a caught-up own run still open is an
   * unsettled orphan candidate (once per run). Reporting only: nothing here changes what the store does.
   *
   * @param chatId - The chat whose host read was lost or refused.
   * @param observed - Its observation, whose attachment met the loss.
   * @param reason - Why the read ended, as a bounded tag.
   */
  #armLossReport(chatId: string, observed: ObservedChat, reason: string): void {
    if (observed.lossReport !== undefined) {
      return;
    }
    const tags = { reason };
    observed.lossReport = setTimeout(() => {
      observed.lossReport = undefined;
      if (this.#observed.get(chatId) !== observed || (observed.status !== 'lost' && observed.status !== 'refused')) {
        return;
      }
      const session = this.#sessions.get(chatId);
      if (session !== undefined && session.displayedOwn === undefined) {
        chatReadReporter.report('chat.read.cold-hidden', { chatId, occurrence: session, tags });
      }
      const projection = this.#projectionContext(chatId);
      const run =
        projection !== undefined && selectCaughtUp(projection) && opensRun(selectRunPhase(projection))
          ? selectCurrentRun(projection)
          : undefined;
      if (run !== undefined) {
        chatReadReporter.report('run.unsettled.own', { chatId, occurrence: run.runId, tags });
      }
    }, chatReadLossBoundMilliseconds); // Bound: chatReadLossBoundMilliseconds.
  }

  /**
   * FP10: the host this chat reads from cannot load its code in this page, and the page has stopped replacing its
   * worker (the resident worker reports `WORKER_LOAD_FAILED` only past its bound). A held turn waits for that very read
   * (a seed starts only after one, {@link ChatSessionStore.startPendingSeed}), so it would wait unseen whenever the read
   * met the failure before the turn's own command did, or before the chat had loaded and could hold an error. The chat
   * shows the failure as a command's would be shown, once its load is done: its card offers Reload, never Try again.
   *
   * @param session - The chat whose host attachment met the failure.
   * @param error - The failure, with its code.
   */
  async #showHostLoadFailure(session: InternalSession, error: unknown): Promise<void> {
    /* A chat still loading takes no error, and its load sets the chat's own: the failure goes once the load is done. */
    await waitUnlessGone(session.persistenceActorRef, (snapshot) => !snapshot.context.isLoadingChat);
    if (
      this.#sessions.get(session.chatId) !== session ||
      session.persistenceActorRef.getSnapshot().context.persistedError?.code === 'WORKER_LOAD_FAILED'
    ) {
      return;
    }
    const failure =
      error instanceof Error
        ? error
        : Object.assign(new Error('The agent host worker did not load.'), { code: 'WORKER_LOAD_FAILED' });
    session.persistenceActorRef.send({ type: 'setPersistedError', error: parseErrorForPersistence(failure) });
  }

  #startObservedAttachment(chatId: string, observed: ObservedChat): void {
    const connector = this.#projectHostConnectors.get(observed.projectId);
    if (connector === undefined) {
      return;
    }
    const attachment = createActor(hostAttachment, {
      input: {
        chatId,
        local: async () => observed.local ?? false,
        onSubscribed: () => {
          observed.subscriptions = (observed.subscriptions ?? 0) + 1;
          this.#settle(chatId, observed);
        },
        onLive: () => {
          observed.source?.wake();
        },
        connect: async () => {
          const client = await connector.connect(chatId);
          if (observed.attachment === attachment) {
            observed.placement = client.placement;
          }
          return client;
        },
        projection: {
          getSnapshot: () => this.#projectionOf(chatId).getSnapshot(),
          send: (event) => {
            if (event.type === 'batch') {
              this.receiveHostReadAnswer(chatId, event.answer);
            } else {
              this.#projectionOf(chatId).send(event);
            }
          },
        },
        onStatus: (event) => {
          if (observed.attachment !== attachment || this.#deletedProjections.has(this.#projectionOf(chatId))) {
            return;
          }
          if (observed.retry !== undefined) {
            clearTimeout(observed.retry);
            observed.retry = undefined;
          }
          observed.status =
            event.type === 'attachment.attached'
              ? 'attached'
              : event.type === 'attachment.refused'
                ? 'refused'
                : 'lost';
          if (event.type !== 'attachment.attached' && observed.ownCurrent !== true) {
            this.#answeredLogReads.delete(chatId);
          }
          this.#projectionTopics.get(chatId)?.emit();
          if (event.type === 'attachment.attached') {
            clearTimeout(observed.lossReport);
            observed.lossReport = undefined;
            observed.attempts = 0;
            observed.hostLoadFailure = undefined;
            this.#syncProjection(chatId, 'none');
            return;
          }
          const session = this.#sessions.get(chatId);
          if (event.reason !== 'owner-fenced') {
            /* A bounded tag: a refusal's reason, a failure's code, or a fixed sentence; never an error's message. */
            const reason =
              event.type === 'attachment.refused'
                ? `refused:${event.reason ?? 'unknown'}`
                : (getErrno(event.error) ?? (event.error === undefined ? (event.reason ?? 'lost') : 'error'));
            this.#armLossReport(chatId, observed, reason);
          }
          if (event.type === 'attachment.lost' && isWorkerCodeLoadFailure(event.error)) {
            observed.hostLoadFailure = event.error;
            if (session !== undefined) {
              void this.#showHostLoadFailure(session, event.error);
            }
          }
          if (event.type === 'attachment.refused') {
            if (session !== undefined) {
              this.#latchUnreadTranscript(session);
              this.#releaseRefusedRun(session);
            }
            queueMicrotask(() => {
              if (observed.attachment === attachment) {
                attachment.stop();
                observed.attachment = undefined;
              }
            });
            return;
          }
          const retryDelayMilliseconds = Math.min(250 * 2 ** observed.attempts, 30_000);
          observed.attempts += 1;
          queueMicrotask(() => {
            if (observed.attachment !== attachment) {
              return;
            }
            const readerOnly = event.reason === 'owner-fenced';
            if (!readerOnly) {
              attachment.stop();
              observed.attachment = undefined;
            }
            const retry = setTimeout(() => {
              if (observed.retry !== retry) {
                return;
              }
              observed.retry = undefined;
              if (this.#observed.get(chatId) === observed) {
                if (readerOnly) {
                  if (observed.attachment === attachment) {
                    attachment.send({ type: 'retry-read' });
                  }
                } else if (observed.attachment === undefined) {
                  this.#startObservedAttachment(chatId, observed);
                }
              }
            }, retryDelayMilliseconds);
            observed.retry = retry;
          });
        },
      },
      ...this.#rootOptions,
    });
    observed.attachment = attachment;
    attachment.start();
    this.startPendingSeed(chatId);
  }

  /** This project's unread record actor, created and read on first use. */
  /**
   * The body of {@link ChatSessionStore.requestTurn}, by session.
   *
   * @param session - The chat that acted.
   * @param gesture - What the person did.
   */
  async #requestTurn(session: InternalSession, gesture: ChatTurnGesture, settleComposer = true): Promise<void> {
    /* The banner belongs to the request lifecycle, and the gesture is what
     * clears it — the dispatch is an admission away. */
    session.persistenceActorRef.send({ type: 'turnRequested' });
    const owner = session.stateActorRef;
    /* Read before the send: the slot this gesture is about to overwrite. */
    const displaced = owner.getSnapshot().context.pendingGesture;
    owner.send({ type: 'requestTurn', gesture });
    if (owner.getSnapshot().context.pendingGesture !== gesture) {
      /* The chat was disposed under the gesture: its stopped root takes nothing, so the composer keeps the message. */
      if (settleComposer) {
        await this.#settleComposer(session, gesture, displaced);
      }
      return;
    }
    /* S01: the composer stays busy until the turn is admitted or refused, so a
     * send does not look finished while its checkout is still being leased.
     * The owner says when that is; nothing here polls it. A gesture queued
     * behind a live turn never enters `admitting`, and frees the composer at
     * once. */
    const admitting = (): boolean => owner.getSnapshot().matches({ run: { queued: 'admitting' } });
    if (admitting()) {
      await new Promise<void>((resolve) => {
        const settle = (): void => {
          /* Resolved before the unsubscribe it closes over, so an observer
           * called back during `subscribe` itself still settles this promise. */
          resolve();
          subscription.unsubscribe();
        };
        const subscription = owner.subscribe({
          next: () => {
            if (!admitting()) {
              settle();
            }
          },
          /* An actor stopped mid-admission never emits again, and this promise
           * is what the composer's editable lock waits on: without this the
           * editor stayed read-only until reload (T3-D11). */
          complete: settle,
          error: settle,
        });
      });
    }
    if (settleComposer) {
      await this.#settleComposer(session, gesture, displaced);
    }
  }

  /**
   * Say what the composer holds now that this gesture has been answered (I5).
   *
   * One writer, one decision, at the one point where the answer is known — the
   * clear, the restore *and* the release of the draft-stage bytes, because a
   * release decided anywhere else can only race the restore. A `send`'s message
   * is in the transcript only once it dispatches, so until then the composer is
   * its only copy; clearing it at the top of `sendMessage` meant every way a
   * gesture could fail to become a turn — an unbound owner, a displaced
   * one-slot queue, a refused admission — deleted what the person wrote. The
   * chat holds one gesture, so the composer holds the one send that is *not*
   * it: the gesture it displaced (ruling E2), or this gesture back again when
   * nothing took it.
   *
   * @param session - The chat whose composer this is.
   * @param gesture - The gesture just requested.
   * @param displaced - The gesture it replaced in the chat's one slot, if any.
   */
  async #settleComposer(
    session: InternalSession,
    gesture: ChatTurnGesture,
    displaced: ChatTurnGesture | undefined,
  ): Promise<void> {
    /* Only what this gesture took out of the composer is the composer's to
     * clear or write over. A gesture can be answered a long time after it was
     * made — its admission waits for the route to publish one — and by then the
     * person may have typed the next message into the same box. Neither the
     * clear nor a returning message may land on that. */
    const { draftText } = session.draftActorRef.getSnapshot().context;
    if (gesture.kind === 'send' && draftText !== '' && !draftIsOf(draftText, gesture.message)) {
      return;
    }
    /* An `edit` and a `regenerate` rewind to a message the transcript still
     * holds, so nothing the person wrote is lost when one is displaced. */
    const returning = displaced?.kind === 'send' ? displaced.message : undefined;
    if (returning !== undefined) {
      await this.#restoreDraftMessage(session, returning);
      return;
    }
    const held = session.stateActorRef.getSnapshot().context;
    if (gesture.kind === 'send' && held.turn === undefined && held.pendingGesture === undefined) {
      /* Nothing took it: the admission refused it and the chat is holding
       * nothing, where the banner says why and the message comes back rather
       * than vanishing with the turn that never started (I5). */
      await this.#restoreDraftMessage(session, gesture.message);
      return;
    }
    if (gesture.kind === 'send') {
      session.draftActorRef.send({ type: 'clearDraft' });
    }
    /* Nothing was handed back, so the draft-stage bytes this gesture promoted
     * are the composer's to let go of (D11, "Send"). Never fatal to the
     * gesture: an unreleased blob is reclaimed by the next `retainOnly`, and
     * nothing the person sent is affected. */
    try {
      await this.releaseDraftAttachments(session.chatId);
    } catch (error) {
      console.warn('[ChatSessionStore] draft attachments could not be released', error);
    }
  }

  /**
   * Put one send's message back in the composer, bytes included (I5).
   *
   * Its attachments were promoted into the chat's own directory when the
   * gesture was taken, and the draft-stage copies released with the draft — so
   * restoring the message alone gave back chips whose bytes the composer can no
   * longer read or re-send. The chat directory is where they live now, so that
   * is where they are re-retained from.
   *
   * @param session - The chat whose composer this is.
   * @param message - The user message coming back.
   * @param onlyIfEmpty - Do not overwrite text the person entered while a Stop was settling.
   */
  async #restoreDraftMessage(session: InternalSession, message: MyUIMessage, onlyIfEmpty = false): Promise<boolean> {
    if (!(await this.#retainAttachments(session, message))) {
      /* The chips come back either way; the person can re-attach what the
       * composer cannot read. Losing the text as well would be worse. */
      console.warn('[ChatSessionStore] a returned message\u2019s attachments could not be re-retained');
    }
    if (onlyIfEmpty && !isComposerEmpty(session)) {
      return false;
    }
    this.#loadDraft(session, message);
    return true;
  }

  /**
   * Re-retain a returning message's attachments from the chat's directory into the composer's (I5).
   *
   * @returns Whether every one of them is the composer's now.
   */
  async #retainAttachments(session: InternalSession, message: MyUIMessage): Promise<boolean> {
    // The originals of flattened images come back too, so the returned draft can be drawn again.
    const attachments = attachmentReferencesOf(message);
    if (attachments.length === 0) {
      return true;
    }
    try {
      const binding = await session.composer;
      const copies = await Promise.allSettled(
        attachments.map(async (attachment) => {
          if (await binding.record.attachments.has(attachment)) {
            return;
          }
          await binding.chatAttachments.copyTo(binding.record.attachments, attachment);
        }),
      );
      return copies.every((copy) => copy.status === 'fulfilled');
    } catch (error) {
      console.warn('[ChatSessionStore] the composer could not be reached for returned attachments', error);
      return false;
    }
  }

  /**
   * Let go of a restored draft the outbox already holds (PERF-8).
   *
   * A send writes two files: the outbox first, so a reload can never lose it, and then the composer's cleared draft.
   * A reload between the two restores the composer with the very message the strip shows as queued, and the next
   * thing typed is appended to it. The restored draft is let go when an outbox entry composes the same text and
   * attachments and the person has not touched the composer since it was restored. A draft whose send was already
   * delivered is kept: the outbox no longer names it, and the composer keeping a copy loses nothing. So is one equal to
   * a held entry, which may be on its way into the composer ({@link ChatSessionStore.#transferToComposer}): letting
   * the draft go then could lose both copies, where keeping it only shows the message twice.
   *
   * @param session - The chat whose composer was restored.
   * @param draft - The draft its record held.
   */
  async #dropQueuedDraft(session: InternalSession, draft: MyUIMessage): Promise<void> {
    let outbox: ChatMessageQueueRecord;
    try {
      outbox = await session.messageQueueStore.read();
    } catch (error) {
      console.warn('[ChatSessionStore] the outbox could not be read to settle a restored draft', session.chatId, error);
      return;
    }
    const restored = session.draftActorRef.getSnapshot().context;
    const composed = compositionOf(buildDraftMessage(restored.draftText, restored.draftAttachments));
    if (
      this.#sessions.get(session.chatId) !== session ||
      restored.touched.draft ||
      composed !== compositionOf(draft) ||
      !outbox.items.some((entry) => entry.held !== true && compositionOf(entry.message) === composed)
    ) {
      return;
    }
    session.draftActorRef.send({ type: 'clearDraft' });
    try {
      await this.releaseDraftAttachments(session.chatId);
    } catch (error) {
      console.warn('[ChatSessionStore] draft attachments could not be released', error);
    }
  }

  /** Put a message in the composer wholesale: it replaces the draft's text and attachments rather than adding to them. */
  #loadDraft(session: InternalSession, message: MyUIMessage): void {
    session.draftActorRef.send({ type: 'loadDraftFromMessageTransient', draft: message });
    const draft = session.draftActorRef.getSnapshot().context;
    session.composerRecordRef.send({
      type: 'patch',
      fields: { draft: buildDraftMessage(draft.draftText, draft.draftAttachments) },
    });
  }

  /**
   * Put a message in the composer and wait for the composer's record to hold it.
   *
   * @returns Whether the record's write landed; a failed one keeps retrying on its own curve.
   */
  async #writeDraft(session: InternalSession, message: MyUIMessage): Promise<boolean> {
    this.#loadDraft(session, message);
    await flushRecord(session.composerRecordRef);
    const written = session.composerRecordRef.getSnapshot();
    return written.status === 'active' && written.matches({ writes: 'idle' }) && written.context.attempt === 0;
  }

  /**
   * Hold the composer through an asynchronously confirmed empty Stop.
   *
   * @returns Whether the composer took the message; a composer that took new text meanwhile keeps it.
   */
  async #restoreStoppedDraft(session: InternalSession, message: MyUIMessage): Promise<boolean> {
    const restore = this.#restoreDraftMessage(session, message, true);
    session.composerWork.add(restore);
    try {
      return await restore;
    } catch (error) {
      console.warn('[ChatSessionStore] stopped draft could not be restored', session.chatId, error);
      return false;
    } finally {
      session.composerWork.delete(restore);
    }
  }

  /**
   * Carry out what the chat's session actor admitted.
   *
   * The turn is the actor's; the *request* — one host command and its stop —
   * is this store's. This is the one wire between
   * them, so a dispatch can no longer originate anywhere else.
   *
   * @param session - The chat whose actor was just (re)bound.
   */
  #bindTurnEmits(session: InternalSession): void {
    for (const subscription of session.turnSubscriptions) {
      subscription.unsubscribe();
    }
    const { stateActorRef } = session;
    /* The admission is a reference on the session (`#isAdmittingTurn`), and the
     * moment it ends is the only moment that reference is released — a chat
     * whose last view unmounted mid-admission is never asked about again. */
    let admitting = this.#isAdmittingTurn(session);
    session.turnSubscriptions = [
      /* The chat's own waits (audit R5): the machine holds them on the store's clock, the store carries them out. */
      stateActorRef.on('remotePullDue', () => {
        void this.requestRemotePull(session.chatId);
      }),
      ...this.#bindChatWaits(session),
      stateActorRef.on('startTurnRequest', ({ request }) => {
        /* Recency counts a taken gesture: a refused one never gets here (L3 D16, LT08). */
        void this.touchChatRecency(
          session.chatId,
          request.kind === 'send' ? (request.message.metadata?.createdAt ?? Date.now()) : Date.now(),
        );
        session.dispatchTask = this.#dispatchTurn(session, request);
      }),
      stateActorRef.on('stopTurnRequest', () => {
        this.stopRun(session.chatId, 'new-turn');
      }),
      stateActorRef.subscribe(() => {
        const admits = this.#isAdmittingTurn(session);
        if (admitting && !admits) {
          this.#disposeIfUnreferenced(session);
        }
        admitting = admits;
      }),
    ];
  }

  /**
   * Offer the chat's machine what it waits out on its own (audit R5), from the facts the chat's views read: the
   * automatic resume its visible failure allows (`autoResumePlanOf`), and whether another device's run awaits pulls
   * (`selectRunElsewhereAwaitsPull`, re-read at the moments that changes with the clock alone). Nothing here depends on
   * a card or a composer being mounted.
   *
   * @param session - The chat whose root was just bound.
   * @returns The subscriptions, ended with the session.
   */
  #bindChatWaits(session: InternalSession): Array<{ unsubscribe: () => void }> {
    const { chatId, stateActorRef } = session;
    let offered: string | undefined;
    /* The wait this page resumed: its card stays until the failure it answered leaves (`autoResume.resuming`). */
    let resumed: AutoResumePlan | undefined;
    let departed = false;
    let awaitsPull = false;
    const live = (): boolean =>
      this.#sessions.get(chatId) === session && stateActorRef.getSnapshot().status === 'active';
    /* Only a viewed chat that can admit a turn resumes on its own: a resume needs both to land (audit R5). */
    const canResume = (): boolean => session.viewRefcount > 0 && chatTurnAdmit(chatId) !== undefined;
    const offerAutoResume = (): void => {
      if (!live()) {
        return;
      }
      const source = {
        projection: this.getProjection(chatId),
        attachmentStatus: this.getAttachmentStatus(chatId),
        persistedError: session.persistenceActorRef.getSnapshot().context.persistedError,
      };
      const plan = canResume() ? autoResumePlanOf(source, Date.now()) : undefined;
      if (
        plan === undefined &&
        resumed !== undefined &&
        resumed.key === offered &&
        autoResumeStillAnswers(resumed, source)
      ) {
        return;
      }
      resumed = undefined;
      if (plan?.key === offered) {
        return;
      }
      offered = plan?.key;
      stateActorRef.send(plan === undefined ? { type: 'autoResumeWithdrawn' } : { type: 'autoResumeOffered', plan });
    };
    const autoResumeDue = stateActorRef.on('autoResumeDue', ({ plan }) => {
      if (!live() || plan.key !== offered) {
        return;
      }
      if (!canResume() || !spendAutoResume(plan, Date.now())) {
        offered = undefined;
        stateActorRef.send({ type: 'autoResumeWithdrawn' });
        return;
      }
      resumed = plan;
      departed = false;
      /* After this emit settles, so the gesture is admitted rather than queued behind it, and its refusal is heard. */
      queueMicrotask(() => {
        void this.#resumeAutomatically(chatId, endRefusedResume);
      });
    });
    /*
     * A resume refused at admission or at dispatch, or by a gesture held over it, puts the run back in `failed` on the
     * same visible failure: the wait ends, spent, and the card offers Resume again. A resume that reached the host
     * leaves `failed` and waits for its run to report instead.
     */
    const endRefusedResume = (): void => {
      if (
        resumed === undefined ||
        !live() ||
        this.#isAdmittingTurn(session) ||
        !stateActorRef.getSnapshot().matches({ run: 'failed' })
      ) {
        return;
      }
      resumed = undefined;
      offered = undefined;
      stateActorRef.send({ type: 'autoResumeWithdrawn' });
    };
    const watchResume = stateActorRef.subscribe(() => {
      if (resumed === undefined) {
        return;
      }
      if (!stateActorRef.getSnapshot().matches({ run: 'failed' })) {
        departed = true;
      } else if (departed) {
        endRefusedResume();
      }
    });
    const offerPull = (): void => {
      if (!live()) {
        return;
      }
      const projection = this.getProjection(chatId);
      const awaits = projection !== undefined && selectRunElsewhereAwaitsPull(projection, Date.now());
      if (awaits === awaitsPull) {
        return;
      }
      awaitsPull = awaits;
      stateActorRef.send(
        awaits
          ? { type: 'runElsewhereAwaitsPull', heartbeatMilliseconds: runHeartbeatMilliseconds }
          : { type: 'runElsewherePullSettled' },
      );
    };
    const unsubscribeChat = this.subscribeChat(chatId, offerAutoResume);
    const unsubscribeProjection = this.subscribeProjection(chatId, offerAutoResume);
    const persistence = session.persistenceActorRef.subscribe(offerAutoResume);
    const unsubscribePull = subscribeRunElsewhere(this, chatId, offerPull);
    session.offerChatWaits = () => {
      offerAutoResume();
      offerPull();
    };
    return [
      autoResumeDue,
      watchResume,
      { unsubscribe: unsubscribeChat },
      { unsubscribe: unsubscribeProjection },
      persistence,
      { unsubscribe: unsubscribePull },
    ];
  }

  /**
   * Resume a chat whose automatic resume's wait ended, then let its waits hear how the resume settled (audit R5).
   *
   * @param chatId - The chat.
   * @param settled - Called once the resume is admitted, held or refused.
   */
  async #resumeAutomatically(chatId: string, settled: () => void): Promise<void> {
    try {
      await this.requestTurn(chatId, { kind: 'continue' });
    } finally {
      settled();
    }
  }

  /** Dispatch one admitted command; its run reaches the transcript through the projection alone (T3). */
  async #dispatchTurn(session: InternalSession, request: ChatRequest): Promise<void> {
    if (request.queueId !== undefined && session.messageQueueRef.getSnapshot().status !== 'active') {
      return;
    }
    const { command } = request;
    const connector = this.#projectHostConnectors.get(session.projectId);
    if (command === undefined || connector === undefined || (command.type !== 'start' && command.type !== 'resume')) {
      session.persistenceActorRef.send({
        type: 'setPersistedError',
        error: parseErrorForPersistence(new Error('This chat has no admitted host command or live connector.')),
      });
      session.stateActorRef.send({ type: 'runLifecycle', phase: 'failed' });
      return;
    }
    session.runHeld = true;
    session.activeCommand = command;
    session.watchedRunId = command.payload.runId;
    session.resumedAttempt = this.#projectionContext(session.chatId)?.ledger.runs[command.payload.runId]?.attempt;
    session.commandInFlight = true;
    /* A Stop left from an earlier turn ends here; one aimed at this very request is carried out once it is accepted. */
    if (session.stop?.target !== command.payload.runId) {
      this.#releaseStop(session);
    }
    this.#refreshStatus(session);
    session.commandAbort?.abort();
    const abort = new AbortController();
    session.commandAbort = abort;
    /* The host durably accepted the command: from here its run exists, whatever this page fails to do next. */
    let accepted = false;
    try {
      if (request.queueId !== undefined && command.type === 'start') {
        await session.messageQueueStore.update((record) => {
          if (!record.items.some((item) => item.id === request.queueId)) {
            throw new Error('Queued message is no longer available.');
          }
          return {
            ...record,
            items: record.items.map((item) => (item.id === request.queueId ? { ...item, command } : item)),
          };
        });
        abort.signal.throwIfAborted();
      }
      let acceptingPlacement: string | undefined;
      const answer = await this.#sendHostCommand(
        async () => {
          const client =
            request.queueId === undefined
              ? await connector.connect(session.chatId)
              : await this.#connectQueuedCommand(session, connector, {
                  queueId: request.queueId,
                  signal: abort.signal,
                });
          acceptingPlacement = connectionPlacement(client.placement);
          return client;
        },
        command,
        { signal: abort.signal },
      );
      if (session.commandAbort !== abort || abort.signal.aborted) {
        return;
      }
      session.commandInFlight = false;
      this.#refreshStatus(session);
      const wait = ownerWaitOf(answer);
      if (request.queueId !== undefined && command.type === 'start' && wait !== undefined) {
        /* Its command stays in the outbox, which sends it again by its key: the chat holds the turn meanwhile. */
        this.#holdForHost(session, { queueId: request.queueId, command, refusal: wait });
        return;
      }
      if (answer.status === 'refused') {
        throw new Error(`Host ${command.type} refused ${answer.code}: ${answer.message}`);
      }
      if (answer.effect !== 'durable' || this.#sessions.get(session.chatId) !== session) {
        /* No run started, so a Stop deferred to this command has nothing to wait for. */
        this.#releaseStop(session);
        return;
      }
      accepted = true;
      this.#endHostWait(session);
      if (command.type === 'start' && request.kind !== 'continue') {
        session.acceptedGesture = { runId: command.payload.runId, request };
        this.#presentTranscript(session, this.#projectionContext(session.chatId));
      }
      if (request.queueId !== undefined) {
        await session.messageQueueStore.acknowledge(request.queueId, command.commandId, acceptingPlacement);
        if (session.commandAbort !== abort) {
          return;
        }
        abort.signal.throwIfAborted();
        if (request.kind === 'send') {
          this.#handOff(session, { queueId: request.queueId, message: request.message, runId: command.payload.runId });
        }
      }
      const { seedRequestId } = session;
      if (seedRequestId !== undefined && command.type === 'start') {
        session.seedRequestId = undefined;
        session.pendingSeedGesture = undefined;
        if (session.seedMessage?.id !== command.payload.message.id) {
          session.seedMessage = undefined;
          this.#presentTranscript(session, this.#projectionContext(session.chatId));
        }
        void this.#clearAcceptedSeed(session.chatId, seedRequestId);
      }
      // The Stop callback can flip this while the command awaits its host answer.
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- Stop mutates from another callback during the awaited command.
      if (session.stop !== undefined) {
        await this.#cancelSessionRun(session, undefined, true);
        return;
      }
      if (command.type === 'resume') {
        // The accepted command can answer before the follower folds its new running row: its run stays held.
        this.#syncProjection(session.chatId, 'none');
        return;
      }
      if (
        request.kind === 'edit' &&
        !this.#displayedTranscript(session).some((message) => message.id === request.messageId)
      ) {
        throw new Error('That message is no longer in this chat, so it cannot be edited.');
      }
    } catch (error) {
      if (abort.signal.aborted || session.commandAbort !== abort) {
        return;
      }
      session.watchedRunId = undefined;
      session.activeCommand = undefined;
      this.#refreshStatus(session);
      if (session.acceptedGesture?.runId === command.payload.runId) {
        session.acceptedGesture = undefined;
        this.#presentTranscript(session, this.#projectionContext(session.chatId));
      }
      const parsed = parseErrorForPersistence(error instanceof Error ? error : new Error(String(error)));
      session.persistenceActorRef.send({
        type: 'setPersistedError',
        error: {
          ...parsed,
          details: { ...parsed.details, runId: command.payload.runId, commandType: command.type },
          requestId: command.commandId,
        },
      });
      session.stateActorRef.send({
        type: 'runLifecycle',
        phase: 'failed',
        runId: command.payload.runId,
        reason: error instanceof Error ? error.message : String(error),
      });
      if (accepted && session.stop !== undefined) {
        /* The host accepted it and only this page's bookkeeping failed: the run exists, so the Stop still ends it. */
        void this.#cancelSessionRun(session, command.payload.runId, true);
      } else {
        /* The command failed, so a Stop deferred to it has nothing to wait for. */
        this.#releaseStop(session);
      }
    } finally {
      if (session.commandAbort === abort) {
        session.commandInFlight = false;
        session.commandAbort = undefined;
        if (this.#observed.get(session.chatId)?.status === 'refused') {
          /* A command answered after its chat's log read was refused: nothing will fold its run here. */
          this.#releaseRefusedRun(session);
        } else {
          this.#refreshStatus(session);
          this.#scheduleRunReleaseIfTerminal(session);
        }
      }
    }
  }

  /**
   * Wire a new chat root and start it: its turn emits, where its turns run, the project's revision facts, and a
   * run of this chat that outlived its previous view.
   *
   * @param session - The chat whose root was just created.
   */
  #startChatRoot(session: InternalSession): void {
    this.#bindTurnEmits(session);
    session.chatRoot.start();
    session.offerChatWaits();
    const facts = this.#revisionFacts.get(session.projectId);
    if (facts !== undefined) {
      sendRevisionFacts(session.stateActorRef, facts);
    }
    this.#syncProjection(session.chatId, 'open');
  }

  /** The chat's projection, created and started on its first answer. */
  #projectionOf(chatId: string): Actor<typeof chatProjectionLogic> {
    const existing = this.#projections.get(chatId);
    if (existing !== undefined) {
      return existing;
    }
    const projection = createActor(chatProjectionLogic, this.#rootOptions);
    this.#projections.set(chatId, projection);
    /* The run and phase last presented, compared per snapshot: a replay's earlier pages are history and present
     * nothing, so a phase moves only once the projection holds the log to its end. */
    let presented: string | undefined;
    let presentedAttempt: Readonly<{ runId: string; attempt: number }> | undefined;
    let attention: RowKey | undefined;
    let published: ChatProjection | undefined;
    /* The frame clock (WP-06, `LiveOverlay.tla` `FrameClock`): a snapshot that changes only the live preview is
     * published from the next frame, so a burst of port messages handled behind a busy main thread wakes readers once.
     * Any other change publishes at once, with whatever live change was waiting (`DurableAtOnce`, `FrameAtomic`). */
    const publish = (context: ChatProjection): void => {
      const pendingFrame = this.#projectionFrames.get(chatId);
      if (pendingFrame !== undefined) {
        pendingFrame();
        this.#projectionFrames.delete(chatId);
      }
      if (published === context) {
        return;
      }
      if (published !== undefined && published.resetVersion !== context.resetVersion) {
        this.#answeredLogReads.delete(chatId);
        this.#validatedDisplays.delete(projection);
        const session = this.#sessions.get(chatId);
        if (session !== undefined) {
          session.seedLocalLogEmpty = false;
          session.seedLocalLogCheck = undefined;
        }
        const observed = this.#observed.get(chatId);
        if (observed?.status === 'attached') {
          observed.status = 'lost';
        }
      }
      published = context;
      const nextAttention = selectCaughtUp(context) ? selectAttentionRow(context) : attention;
      if (nextAttention !== attention) {
        attention = nextAttention;
        this.#attentionMoved(chatId);
      }
      const run = selectCaughtUp(context) ? selectCurrentRun(context) : undefined;
      const key = run === undefined ? presented : `${run.runId}:${run.lifecycle}`;
      const moved = key !== presented;
      /* A later attempt of the run already presented reopened it, even when its `running` row folded in the same read
       * as its end (a refusal ends a resumed attempt at once): the key alone cannot see a `failed` follow a `failed`. */
      const previousAttempt = presentedAttempt?.runId === run?.runId ? presentedAttempt?.attempt : undefined;
      const reopened =
        previousAttempt !== undefined && (run?.attempt ?? 0) > previousAttempt && !opensRun(selectRunPhase(context));
      presented = key;
      presentedAttempt = run === undefined ? presentedAttempt : { runId: run.runId, attempt: run.attempt };
      this.#syncProjection(chatId, reopened ? 'reopened' : moved ? 'moved' : 'none');
      this.#projectionTopics.get(chatId)?.emit();
    };
    projection.subscribe(({ context }) => {
      if (published === undefined || !changesOnlyLive(published, context)) {
        publish(context);
        return;
      }
      if (this.#projectionFrames.has(chatId)) {
        return;
      }
      /* A scheduler may run the callback before it returns (tests publish at once); nothing is left to cancel then. */
      const frame = { ran: false };
      const cancel = this.#frame(() => {
        frame.ran = true;
        this.#projectionFrames.delete(chatId);
        if (this.#projections.get(chatId) === projection) {
          publish(projection.getSnapshot().context);
        }
      });
      if (!frame.ran) {
        this.#projectionFrames.set(chatId, cancel);
      }
    });
    projection.start();
    return projection;
  }

  #projectionContext(chatId: string): ChatProjection | undefined {
    return this.#projections.get(chatId)?.getSnapshot().context;
  }

  /**
   * Hand the chat's machine and its project what the chat's projection says (G02–G04): tools and approvals counted
   * per row, and the run's phase from its lifecycle rows. Nothing here reads the SDK's status or the transcript.
   *
   * @param chatId - The chat whose projection moved, or whose machine was just created.
   * @param present - `moved`: the current run or its phase changed; `reopened`: a later attempt of the presented run
   * reached a phase that does not open a run, so a dispatched `continue` is shown its reopening first; `open`: a new
   * machine, shown a run still open; `none`: the run did not move.
   */
  #syncProjection(chatId: string, present: 'moved' | 'reopened' | 'open' | 'none'): void {
    const session = this.#sessions.get(chatId);
    const projection = this.#projectionContext(chatId);
    const projectId = session?.projectId ?? this.#observed.get(chatId)?.projectId;
    const actor = this.#projections.get(chatId);
    if (actor !== undefined && projection !== undefined) {
      const retained = this.#validatedDisplays.get(actor);
      if (
        retained !== undefined &&
        (retained.views !== projection.views ||
          retained.remote?.views !== projection.remote?.views ||
          retained.resetVersion !== projection.resetVersion ||
          retained.sourceGeneration !== projection.ledger.position.sourceGeneration)
      ) {
        this.#validatedDisplays.delete(actor);
      }
      if (
        selectCaughtUp(projection) &&
        this.#hasTranscriptAuthority(chatId, projection) &&
        this.#foreignDisplayReady(chatId, projection)
      ) {
        this.#validatedDisplays.set(actor, {
          views: projection.views,
          remote: projection.remote,
          resetVersion: projection.resetVersion,
          sourceGeneration: projection.ledger.position.sourceGeneration,
        });
      }
    }
    if (projectId !== undefined) {
      this.#refreshProjectRuns(projectId);
    }
    if (session === undefined || projection === undefined) {
      return;
    }
    this.#refreshStatus(session);
    if (!retainsLiveRun(selectRunPhase(projection))) {
      this.refreshMessageQueue(chatId);
    }
    this.#refreshDeparting(session);
    this.#presentTranscript(session, projection);
    this.#syncTools(session, projection);
    const run = selectCaughtUp(projection) ? selectCurrentRun(projection) : undefined;
    const phase = selectRunPhase(projection);
    const view = run === undefined ? undefined : projection.views[run.runId];
    if (run !== undefined && view !== undefined && opensRun(phase) && !run.opaque) {
      this.#timePresentation(session, run.runId);
    }
    const takenBack = session.takeBackRunId === undefined ? undefined : projection.ledger.runs[session.takeBackRunId];
    if (
      session.takeBackRunId !== undefined &&
      (takenBack?.lifecycle === 'completed' ||
        takenBack?.lifecycle === 'failed' ||
        takenBack?.lifecycle === 'cancelled')
    ) {
      const stopped = projection.views[session.takeBackRunId];
      session.takeBackRunId = undefined;
      /* This page's Stop took back a turn the agent had not kept: the host recorded it (`TURN_WITHDRAWN`), every page
       * leaves it out of the thread (`isRetractedRun`), and the request goes back to this composer. A host too old to
       * take a turn back stopped it plainly, and the request stays in the thread. */
      if (stopped?.user !== undefined && isRetractedRun(stopped)) {
        void this.#returnTakenBack(session, stopped.user);
      }
    }
    this.#settleHandedOff(session, projection);
    /* The run this Stop waits for has ended. While a command awaits its host answer or a take-back its removal, those
     * decide instead: an ended attempt in this log may be the one before an accepted resume. */
    const aimed =
      session.stop?.target === undefined ? undefined : projection.ledger.runs[session.stop.target]?.lifecycle;
    if (
      session.stop !== undefined &&
      session.stop.withdrawing === undefined &&
      !session.commandInFlight &&
      /* A Stop aimed at a run reads that run's end, even when a later run is already current in this log. */
      (session.stop.target === undefined
        ? run !== undefined && !opensRun(phase) && phase !== 'paused'
        : aimed === 'completed' || aimed === 'failed' || aimed === 'cancelled')
    ) {
      this.#releaseStop(session);
    }
    /* A Stop owed to a handed-over send: its run has reached the log. */
    if (
      session.stop?.target !== undefined &&
      session.stop.sent === undefined &&
      !session.commandInFlight &&
      projection.ledger.runs[session.stop.target] !== undefined
    ) {
      void this.#cancelSessionRun(session);
    }
    if (run !== undefined && present !== 'none' && (present !== 'open' || opensRun(phase) || phase === 'paused')) {
      if (present === 'reopened' && session.stateActorRef.getSnapshot().matches({ run: { queued: 'dispatched' } })) {
        /* A dispatched `continue` names no run, so it waits to see its run open again before an end is its own
         * (`#presentRun`). Show it the reopening its read folded away; otherwise it would wait for good, holding every
         * later gesture. */
        this.#presentRun(session, { runId: run.runId, phase: 'running', reason: undefined });
      }
      this.#presentRun(session, { runId: run.runId, phase, reason: selectRunFailure(projection, run.runId) });
    }
    if (
      session.watchedRunId !== undefined &&
      run !== undefined &&
      (session.watchedRunId !== run.runId || !opensRun(phase)) &&
      !this.#awaitsRun(session)
    ) {
      /* The held run ended, paused (ACP can continue the same attempt after approval) or another run is current. */
      session.watchedRunId = undefined;
      this.#scheduleRunReleaseIfTerminal(session);
    }
    if (
      session.refreshDeferred &&
      selectCaughtUp(projection) &&
      !retainsLiveRun(phase) &&
      session.status === 'ready' &&
      !session.commandInFlight
    ) {
      void this.refreshFromStorage(chatId);
    }
  }

  /**
   * Time when the page first shows a live run's model text (T10): the frame after the displayed transcript first shows
   * text in the run's answer, while the page is visible. This is the UI's clock, kept apart from the API's model-text
   * time; it reads the fold (T3), not any one component, and a run that was already streaming or ended before this
   * page saw it is not timed, so replayed history never counts as shown.
   */
  #timePresentation(session: InternalSession, runId: string): void {
    if (session.presentedRunId === runId) {
      return;
    }
    /* The run's answer is its tail: the segment a steering input opened, else the run's own message. */
    const answerId = this.#projectionContext(session.chatId)?.views[runId]?.segmentId ?? runId;
    const hasText = this.#displayedTranscript(session).some(
      (message) =>
        message.id === answerId &&
        message.role === 'assistant' &&
        message.parts.some((part) => part.type === 'text' && part.text !== ''),
    );
    if (!hasText) {
      session.presentationWatch = runId;
      return;
    }
    session.presentedRunId = runId;
    if (session.presentationWatch !== runId) {
      return;
    }
    const presented = this.#projectHostConnectors.get(session.projectId)?.presented;
    if (presented === undefined || typeof requestAnimationFrame === 'undefined') {
      return;
    }
    requestAnimationFrame(() => {
      if (document.visibilityState === 'visible') {
        void presented(session.chatId, runId, Date.now());
      }
    });
  }

  /**
   * The displayed transcript (T2, I-1): the fold of the displayed source, plus the accepted gesture the log does not
   * hold yet, plus the unsent seed. Each source advances only on its own authority, so a reset, a reread or a cold
   * read in pages shows the last displayed source until its successor has authority, and no content is compared.
   */
  #displayedTranscript(session: InternalSession): readonly MyUIMessage[] {
    const projection = this.#projectionContext(session.chatId);
    if (projection !== undefined && this.#sessions.get(session.chatId) === session) {
      /* A display validated before a release stays displayable while a fresh capture is held. */
      const validated = this.#hasDisplayAuthority(session.chatId, projection);
      if (selectCaughtUp(projection) && (validated || this.#hasTranscriptAuthority(session.chatId, projection))) {
        session.displayedOwn = projection;
      }
      if (validated || this.#foreignDisplayReady(session.chatId, projection)) {
        session.displayedRemote = projection.remote;
      }
    }
    const own = session.displayedOwn;
    const source: TranscriptProjection = {
      views: own?.views ?? noViews,
      ...(own?.live === undefined ? {} : { live: own.live }),
      ...(session.displayedRemote === undefined ? {} : { remote: session.displayedRemote }),
    };
    const fold = selectTranscript(source, session.displayedFold);
    session.displayedFold = fold;
    const gesture =
      session.acceptedGesture !== undefined && own?.views[session.acceptedGesture.runId] === undefined
        ? session.acceptedGesture
        : undefined;
    const seed = session.seedMessage;
    const shown = session.displayedMessages;
    if (shown.fold === fold && shown.gesture === gesture && shown.seed === seed) {
      return shown.messages;
    }
    let messages = gesture === undefined ? fold : applyAcceptedGesture(fold, gesture.request);
    if (seed !== undefined && !messages.some((message) => message.role === 'user')) {
      messages = [...messages, seed];
    }
    session.displayedMessages = { fold, gesture, seed, messages };
    return messages;
  }

  /**
   * Announce the displayed transcript when it changed, leading and trailing at most every 50 ms (D-UI-10), and settle
   * its load state from authority (I21): once this device's log is caught up with its read answered, or other
   * devices' history is all the chat has.
   */
  #presentTranscript(session: InternalSession, projection: ChatProjection | undefined): void {
    const messages = this.#displayedTranscript(session);
    if (
      session.acceptedGesture !== undefined &&
      session.displayedOwn?.views[session.acceptedGesture.runId] !== undefined
    ) {
      session.acceptedGesture = undefined;
    }
    if (
      projection !== undefined &&
      session.displayedOwn === projection &&
      this.#hasDisplayAuthority(session.chatId, projection)
    ) {
      /* The seed is the startup request's until the current log holds a user turn (T3): the fold of the projection
       * with authority says, never one kept from before a reset. */
      if (session.seedMessage !== undefined && session.displayedFold.some((message) => message.role === 'user')) {
        session.seedMessage = undefined;
      }
      this.#settleTranscript(session, messages);
    }
    if (messages === session.announcedMessages) {
      return;
    }
    session.announcedMessages = messages;
    this.#announce(session);
  }

  /** Wake the chat's subscribers, leading and trailing at most every 50 ms (D-UI-10). */
  #announce(session: InternalSession): void {
    if (session.announceTimer !== undefined) {
      session.announcePending = true;
      return;
    }
    session.publishedMessages = session.announcedMessages;
    this.#chatTopics.get(session.chatId)?.emit();
    session.announceTimer = setTimeout(() => {
      session.announceTimer = undefined;
      if (session.announcePending) {
        session.announcePending = false;
        this.#announce(session);
      }
    }, chatMessagesThrottle);
  }

  /** Initial empty cursors prove nothing; foreign history requires its completed authoritative scan. */
  #hasTranscriptAuthority(chatId: string, projection: ChatProjection): boolean {
    const actor = this.#projections.get(chatId);
    if (actor !== undefined && this.#deletedProjections.has(actor)) {
      return false;
    }
    if (this.#answeredLogReads.has(chatId)) {
      return true;
    }
    const views = projection.remote?.views;
    if (
      views === undefined ||
      !this.#remoteReadCompletedVersions.has(chatId) ||
      this.#remoteReadCompletedVersions.get(chatId) !== this.#remoteReadVersions.get(chatId)
    ) {
      return false;
    }
    let present = this.#remoteHistoryPresence.get(views);
    if (present === undefined) {
      present = Object.keys(views).length > 0;
      this.#remoteHistoryPresence.set(views, present);
    }
    return present;
  }

  /** Local proof cannot certify foreign views while their current authoritative scan is pending. */
  #foreignDisplayReady(chatId: string, projection: ChatProjection): boolean {
    const completed = this.#remoteReadCompletedVersions.get(chatId);
    return (
      projection.remote === undefined || (completed !== undefined && completed === this.#remoteReadVersions.get(chatId))
    );
  }

  /** Retain validated presentation during private refresh without authorizing current operations. */
  #hasDisplayAuthority(chatId: string, projection: ChatProjection): boolean {
    const actor = this.#projections.get(chatId);
    const current = actor?.getSnapshot().context;
    if (
      actor === undefined ||
      this.#deletedProjections.has(actor) ||
      current === undefined ||
      current.views !== projection.views ||
      current.remote?.views !== projection.remote?.views ||
      current.resetVersion !== projection.resetVersion ||
      current.ledger.position.sourceGeneration !== projection.ledger.position.sourceGeneration
    ) {
      return false;
    }
    if (this.#hasTranscriptAuthority(chatId, current) && this.#foreignDisplayReady(chatId, current)) {
      return true;
    }
    const retained = this.#validatedDisplays.get(actor);
    return (
      retained !== undefined &&
      selectCaughtUp(current) &&
      retained.views === current.views &&
      retained.remote?.views === current.remote?.views &&
      retained.resetVersion === current.resetVersion &&
      retained.sourceGeneration === current.ledger.position.sourceGeneration
    );
  }

  /**
   * Mark the transcript settled and remember its trays (I21, U10). Views read both in the snapshot that carries the
   * applied turns, so a change that leaves the turns as they were still notifies.
   */
  #settleTranscript(session: InternalSession, messages: readonly MyUIMessage[]): void {
    // Trays are remembered only from the whole chat: other devices' history read, and this device's log answered.
    if (this.#foreignScanState(session.chatId) !== 'read' || !this.#answeredLogReads.has(session.chatId)) {
      if (messages.length === 0) {
        this.#latchUnreadTranscript(session);
      } else {
        // Turns show, yet part of the chat is unread: the trays it may hold are not forgotten (U10).
        session.transcriptAwaitsForeignScan = false;
        this.#latchTranscriptSettled(session);
      }
      return;
    }
    session.transcriptAwaitsForeignScan = false;
    const trays = composerTraysOf(messages);
    const changed =
      !session.transcriptSettled ||
      trays.length !== session.composerTrays.length ||
      trays.some((tray, index) => tray !== session.composerTrays[index]);
    if (!changed) {
      return;
    }
    session.transcriptSettled = true;
    session.composerTrays = trays;
    writeRememberedComposerTrays(session.chatId, trays);
    this.#chatTopics.get(session.chatId)?.emit();
  }

  /**
   * Settle a transcript whose read failed or was refused, unless the scan of other devices' history may still bring
   * turns: then it waits for that scan (I21). The device keeps what it remembers of the trays.
   */
  #latchUnreadTranscript(session: InternalSession): void {
    if (this.#displayedTranscript(session).length === 0 && this.#foreignScanState(session.chatId) === 'pending') {
      session.transcriptAwaitsForeignScan = true;
      return;
    }
    session.transcriptAwaitsForeignScan = false;
    this.#latchTranscriptSettled(session);
  }

  /** Settle the transcript without a read to remember trays from (I21). */
  #latchTranscriptSettled(session: InternalSession): void {
    if (session.transcriptSettled) {
      return;
    }
    session.transcriptSettled = true;
    this.#chatTopics.get(session.chatId)?.emit();
  }

  async #clearAcceptedSeed(chatId: string, requestId: string): Promise<void> {
    try {
      await this.#deps.consumeChatStartupRequest(chatId, requestId);
    } catch (error) {
      console.warn('[ChatSessionStore] accepted seed intent could not be cleared', chatId, error);
    }
  }

  /** The machine's tool and approval counts, compared with its own so nothing is sent twice (G03, G04). */
  #syncTools(session: InternalSession, projection: ChatProjection): void {
    const tools = selectToolsInFlight(projection);
    const approvals = Object.keys(selectOpenInterrupts(projection)).length;
    const { context } = session.stateActorRef.getSnapshot();
    if (
      tools.count === context.toolsInFlight &&
      approvals === context.pendingApprovalCount &&
      (tools.toolName === undefined || tools.toolName === context.toolName)
    ) {
      return;
    }
    session.stateActorRef.send({
      type: 'toolParts',
      inFlight: tools.count,
      approvals,
      ...(tools.toolName === undefined ? {} : { toolName: tools.toolName }),
    });
  }

  /** Refresh one project's run snapshot only when its projected run identities or classifications moved. */
  #refreshProjectRuns(projectId: string): void {
    const owner = this.#projectSessions.get(projectId);
    if (owner === undefined) {
      return;
    }
    const key = this.observedChatIdsOf(projectId)
      .map((chatId) => {
        const projection = this.#projectionContext(chatId);
        const run = projection === undefined || !selectCaughtUp(projection) ? undefined : selectCurrentRun(projection);
        return [chatId, run?.runId, run?.lifecycle, run?.opaque, projection?.ledger.newerHistory].join(':');
      })
      .join('|');
    if (this.#projectRunKeys.get(projectId) === key) {
      return;
    }
    this.#projectRunKeys.set(projectId, key);
    const liveChatIds = this.observedChatIdsOf(projectId).filter((chatId) => {
      const projection = this.#projectionContext(chatId);
      return projection !== undefined && selectCaughtUp(projection) && opensRun(selectRunPhase(projection));
    });
    this.#publishProjectRunPlan(projectId, {
      liveChatIds,
      stoppableChatIds: [],
      stoppableRunCount: 0,
      continuingRuns: [],
    });
    void this.#classifyProjectRuns(projectId);
  }

  async #classifyProjectRuns(projectId: string): Promise<void> {
    try {
      await this.getProjectClosePlan(projectId);
    } catch (error) {
      console.warn('[ChatSessionStore] project run classification failed', projectId, error);
    }
  }

  #publishProjectRunPlan(projectId: string, plan: ProjectClosePlan): void {
    const owner = this.#projectSessions.get(projectId);
    if (owner === undefined) {
      return;
    }
    const { runs } = owner.getSnapshot().context;
    const { stoppableRuns = [] } = owner.getSnapshot().context;
    if (
      runs.length === plan.liveChatIds.length &&
      runs.every((chatId, index) => chatId === plan.liveChatIds[index]) &&
      stoppableRuns.length === plan.stoppableChatIds.length &&
      stoppableRuns.every((chatId, index) => chatId === plan.stoppableChatIds[index])
    ) {
      return;
    }
    owner.send({ type: 'projectedRunsChanged', runs: plan.liveChatIds, stoppableRuns: plan.stoppableChatIds });
  }

  /**
   * Show the chat's machine one run's phase, as its log states it.
   *
   * A run's end reaches the machine only for the run it is presenting or the turn it placed: an idle chat that
   * replays its log is shown no history, and a turn is never ended by an earlier run's row (W0.2). A `continue` names no
   * run, so its run's replayed failure waits until the machine has seen that run open again.
   *
   * @param session - The chat.
   * @param run - The run the log names, its lifecycle, and why it failed when it did.
   */
  #presentRun(
    session: InternalSession,
    {
      runId,
      phase,
      reason,
    }: Readonly<{
      runId: string;
      phase: ProjectedRunPhase;
      reason: string | undefined;
    }>,
  ): void {
    if (phase === 'none') {
      return;
    }
    const snapshot = session.stateActorRef.getSnapshot();
    const { turn } = snapshot.context;
    if (turn?.runId !== undefined && turn.runId !== runId) {
      return;
    }
    if (!opensRun(phase) && phase !== 'paused' && !endsHere(snapshot, runId)) {
      return;
    }
    session.stateActorRef.send({
      type: 'runLifecycle',
      phase,
      runId,
      ...(phase === 'failed' && reason !== undefined ? { reason } : {}),
    });
  }

  /**
   * The project a chat belongs to on this page: its session's, or, for a chat a sidebar row only observes (D-UI-06),
   * its observation's. Unread is answered for both, so a row is never read through a session it does not hold.
   */
  #chatProjectId(chatId: string): string | undefined {
    return this.#sessions.get(chatId)?.projectId ?? this.#observed.get(chatId)?.projectId;
  }

  /** The chat's newest attention row, once this page holds its whole log; `undefined` while it is unknown. */
  #knownAttention(chatId: string): RowKey | undefined {
    const projection = this.#projectionContext(chatId);
    return projection === undefined || !selectCaughtUp(projection) || !this.#hasTranscriptAuthority(chatId, projection)
      ? undefined
      : selectAttentionRow(projection);
  }

  /**
   * An attention row arrived. A chat the person is looking at is read through it at once (R3), so it never shows
   * unread; any other chat's unread answer moved, so its readers wake.
   */
  #attentionMoved(chatId: string): void {
    const session = this.#sessions.get(chatId);
    if (session !== undefined && this.#focusedChatId === chatId && isDocumentActive()) {
      this.#writeReceipt(session.projectId, chatId, this.#knownAttention(chatId));
      return;
    }
    this.#unreadTopic.emit();
  }

  /**
   * Record that the person has seen a chat through `attention`, and clear its legacy mark (§5.8). Writes only what
   * moved; before the record is read, the clear is always written so the read cannot bring the mark back.
   */
  #writeReceipt(projectId: string, chatId: string, attention: RowKey | undefined): void {
    const record = this.#unreadRecord(projectId);
    const receipt = record.readThrough.get(chatId);
    const moves = attention !== undefined && (receipt === undefined || !sameRowKey(receipt, attention));
    const clears = record.legacy.has(chatId) || !record.loaded;
    if (!moves && !clears) {
      return;
    }
    record.legacy.delete(chatId);
    if (moves) {
      record.readThrough.set(chatId, attention);
    }
    if (!record.loaded) {
      record.changedBeforeLoad.add(chatId);
    }
    record.ref.send({
      type: 'patch',
      fields: {
        ...(clears ? { unread: { [chatId]: false } } : {}),
        ...(moves ? { readThrough: { [chatId]: attention } } : {}),
      },
    });
    this.#unreadTopic.emit();
  }

  /** Drop a deleted chat's receipt and mark (D11). */
  #forgetReceipt(projectId: string, chatId: string): void {
    const record = this.#unreadRecord(projectId);
    record.legacy.delete(chatId);
    record.readThrough.delete(chatId);
    if (!record.loaded) {
      record.changedBeforeLoad.add(chatId);
    }
    record.ref.send({ type: 'patch', fields: { unread: { [chatId]: false }, readThrough: { [chatId]: false } } });
    this.#unreadTopic.emit();
  }

  #unreadRecord(projectId: string): UnreadRecord {
    const existing = this.#unreadRecords.get(projectId);
    if (existing) {
      return existing;
    }
    const ref = createComposerRecordActor(
      createComposerRecordStore(this.#deps.client, composerRecordPaths.unread(projectId)),
    );
    const unread: UnreadRecord = {
      ref,
      readThrough: new Map(),
      legacy: new Set(),
      changedBeforeLoad: new Set(),
      loaded: false,
    };
    ref.on('recordLoaded', ({ record }) => {
      unread.loaded = true;
      const stored: Pick<ComposerRecord, 'unread' | 'readThrough'> = record === 'absent' ? {} : record;
      for (const chatId of Object.keys(stored.unread ?? {})) {
        if (!unread.changedBeforeLoad.has(chatId)) {
          unread.legacy.add(chatId);
        }
      }
      for (const [chatId, key] of Object.entries(stored.readThrough ?? {})) {
        if (!unread.changedBeforeLoad.has(chatId)) {
          unread.readThrough.set(chatId, key);
        }
      }
      unread.changedBeforeLoad.clear();
      this.#unreadTopic.emit();
    });
    this.#unreadRecords.set(projectId, unread);
    ref.start();
    return unread;
  }

  /** Hand a binding over only after a released predecessor's writes have landed. */
  async #afterComposerDrain(chatId: string, binding: ComposerBinding): Promise<ComposerBinding> {
    await this.#composerDrains.get(chatId);
    return binding;
  }

  /** Let a released chat's restore and in-flight write land, then stop its record actor. */
  async #drainComposer(session: InternalSession, drained: PromiseWithResolvers<void>): Promise<void> {
    try {
      await Promise.allSettled(session.composerWork);
      await stopWhenWritesSettle(session.composerRecordRef);
    } finally {
      drained.resolve();
      if (this.#composerDrains.get(session.chatId) === drained.promise) {
        this.#composerDrains.delete(session.chatId);
      }
    }
  }

  #createSession(chatId: string, projectId: string): InternalSession {
    // Defensive alias so actor closures always read through `this.#deps` (the latest provider snapshot).
    const depsRef = (): ChatSessionDeps => this.#deps;

    // oxlint-disable-next-line eslint/prefer-const -- initialised only after the actor/chat callbacks that close over it are constructed.
    let session: InternalSession;
    const displayed = (): readonly MyUIMessage[] => this.#displayedTranscript(session);

    /* The project is the caller's (PV-S4), so the composer binds now; only a released predecessor's drain is awaited. */
    const { client } = depsRef();
    this.#unreadRecord(projectId);
    const composer = this.#afterComposerDrain(chatId, {
      projectId,
      record: createComposerRecordStore(client, composerRecordPaths.chat(projectId, chatId)),
      chatAttachments: createChatAttachmentStore(client, projectId, chatId),
    });
    const recordStore = deferredRecordStore(composer);
    const composerRecordRef = createComposerRecordActor(recordStore);
    const messageQueueStore = createChatMessageQueueStore(
      client,
      chatMessageQueuePath(projectId, chatId),
      depsRef().queueLock,
    );
    const messageQueueObservation = new ObservationService<void>({
      resource: messageQueueStore.path,
      ...(depsRef().watchRecordFile === undefined
        ? {}
        : {
            watch: (invalidate: () => void, reset: () => void) =>
              depsRef().watchRecordFile!(messageQueueStore.path, (event) => {
                if (event.type === 'reset') {
                  reset();
                } else {
                  invalidate();
                }
              }),
          }),
      read: async (fence) => {
        if (fence.isCurrent()) {
          messageQueueRef.send({ type: 'refresh' });
        }
      },
    });
    const messageQueueRef = createChatMessageQueueActor(
      { chatId, projectId },
      {
        advance: async (signal, canDeliver) => this.#advanceMessageQueue(session, signal, canDeliver),
        watch: () => {
          if (depsRef().watchRecordFile === undefined) {
            return () => undefined;
          }
          const lease = messageQueueObservation.acquire();
          const unsubscribe = lease.subscribe(() => {
            const observed = lease.getSnapshot();
            if (observed.status === 'error' || observed.status === 'closed') {
              messageQueueRef.send({
                type: 'watchFailed',
                error: observed.error ?? 'Lost the connection to your queued messages. Try again.',
              });
            }
          });
          return () => {
            unsubscribe();
            lease.release();
          };
        },
      },
      this.#rootOptions,
    );

    const readChatRow = async (id: string): Promise<ChatEntity | undefined> => depsRef().getChat(id, projectId);

    /*
     * XD2: a record written before placement moved to the device can name a device-relative host (`origin`, a
     * `loopback:` daemon). It is relative to a device no tab can prove it is, so it is never removed from the synced
     * record by adopting it: each device that reaches a host of that name adopts it into its own placements record,
     * and the record keeps it until a write of the chat's execution supersedes it. Read from the record
     * the load already read, and asked without the network: only a host known unreachable is declined.
     */
    const legacyPlacementOf = async (storedChat: ChatEntity): Promise<TauAgentHostId | undefined> => {
      const deps = depsRef();
      try {
        return await deps.adoptLegacyChatPlacement?.(storedChat.id, projectId, async (hostId) =>
          deps.isPlacementOnThisDeviceNow === undefined
            ? (await deps.isPlacementOnThisDevice?.(hostId)) === true
            : deps.isPlacementOnThisDeviceNow(hostId) !== false,
        );
      } catch {
        /* Local placement is always reachable: a legacy pin that cannot be read reads as local. */
        return undefined;
      }
    };
    const adoptInto = async (chatId: string, placement: TauAgentHostId): Promise<void> => {
      await writeChatPlacement({ client: depsRef().client, projectId, chatId, placement });
    };
    /* Assigned once the persistence actor exists; the load only calls it after its first await. */
    let settleAfterLoad: (placement: TauAgentHostId, adopting: string | undefined) => Promise<void> = async () =>
      undefined;
    const placementOnOpen = async (
      storedChat: ChatEntity,
    ): Promise<Readonly<{ placement: TauAgentHostId | undefined; adopting: boolean }>> => {
      const placements = await readChatPlacementsShared(depsRef().client, projectId);
      const placement = placements[storedChat.id];
      if (placement !== undefined) {
        return { placement, adopting: false };
      }
      const legacy = await legacyPlacementOf(storedChat);
      return { placement: legacy, adopting: legacy !== undefined };
    };
    /*
     * The placement this tab runs the chat on at load, never waiting on the network. Known reachable: applied (and an
     * adopted legacy host written to this device's placements record). Known unreachable: this device's own placement
     * is held and the chat runs locally; a legacy host is another device's, and the chat simply runs locally. Not
     * known yet (the origin's discovery still out): applied, so admission waits for that host rather than running
     * here, and settled once the answer comes.
     */
    const placementAtLoad = async (
      chatId: string,
      placement: TauAgentHostId | undefined,
      adopting: boolean,
    ): Promise<Readonly<{ applied: TauAgentHostId | undefined; held: TauAgentHostId | undefined }>> => {
      const deps = depsRef();
      if (placement === undefined) {
        return { applied: undefined, held: undefined };
      }
      const known =
        deps.isPlacementOnThisDeviceNow === undefined
          ? (await reachablePlacement(deps, placement)) === placement
          : deps.isPlacementOnThisDeviceNow(placement);
      if (known === undefined) {
        void settleAfterLoad(placement, adopting ? chatId : undefined);
        return { applied: placement, held: undefined };
      }
      if (known) {
        if (adopting) {
          void adoptInto(chatId, placement);
        }
        return { applied: placement, held: undefined };
      }
      return { applied: undefined, held: adopting ? undefined : placement };
    };
    const persistenceActorRef = createActor(
      chatPersistenceMachine.provide({
        actors: {
          loadChatActor: createAsyncLogic({
            run: async ({ input, signal }) => {
              const storedChat = await readChatRow(input.chatId);
              /* The chat record never holds this device's placement (XD2): its placements record does. */
              const opened = storedChat === undefined ? undefined : await placementOnOpen(storedChat);
              /* A placement this tab cannot reach is held, not applied: the chat runs locally and the composer says so.
               * The persistence context holds it from here; it is the one copy. */
              const { applied: reachable, held: heldPlacement } = await placementAtLoad(
                input.chatId,
                opened?.placement,
                opened?.adopting === true,
              );
              signal.throwIfAborted();
              /* The persistence context holds the execution this device runs the chat on (XD2). */
              const loadedChat = storedChat === undefined ? undefined : placeChat(storedChat, reachable);
              if (this.#sessions.get(input.chatId) !== session) {
                return { chat: undefined };
              }

              if (!loadedChat) {
                session.draftActorRef.send({ type: 'initializeFromChat' });

                return { chat: undefined };
              }

              /* The record holds no transcript (P26), only the startup request's pending user row. Whether the log
               * already holds that turn is for a fresh read of the log to say (`startPendingSeed`), never for a fold
               * this session may have shown from an earlier projection (T4). */
              const lastMessage = loadedChat.messages.at(-1);
              const { startupRequest } = loadedChat;
              const isEligibleStartupRequest =
                startupRequest !== undefined &&
                lastMessage?.role === 'user' &&
                lastMessage.id === startupRequest.messageId &&
                lastMessage.metadata?.status === 'pending';
              if (startupRequest && isEligibleStartupRequest) {
                /* A previous session's projection cannot settle this intent:
                 * only a read from the current host generation can. */
                const observed = this.#observed.get(input.chatId);
                if (observed !== undefined) {
                  this.#stopObservedAttachment(input.chatId, observed);
                }
                this.#answeredLogReads.delete(input.chatId);
                session.seedRemoteReadVersion = undefined;
                session.seedLocalLogEmpty = false;
                session.seedLocalLogCheck = undefined;
                /* Nor can a fold this session showed from it: the seed shows alone until the fresh read has authority. */
                session.displayedOwn = undefined;
                session.displayedRemote = undefined;
                this.#projectionOf(input.chatId).send({ type: 'reset' });
                if (observed !== undefined) {
                  this.#startObservedAttachment(input.chatId, observed);
                }
                /* Keep the exact intent until Start is durably accepted. A
                 * reload between this load and host acknowledgement must
                 * resend the same command id and prompt. */
                session.draftActorRef.send({ type: 'initializeFromChat' });
                const seedGesture: ChatTurnGesture = {
                  kind: 'regenerate',
                  execution: loadedChat.activeExecution,
                  requestId: startupRequest.id,
                };
                session.pendingSeedGesture = seedGesture;
                session.seedRequestId = startupRequest.id;
                session.seedMessage = lastMessage;
                this.#presentTranscript(session, this.#projectionContext(input.chatId));
                void this.#refreshRemoteSegmentsSafely(input.chatId, session.projectId);
                this.startPendingSeed(input.chatId);
                return { chat: { ...loadedChat, error: undefined }, heldPlacement };
              }

              session.draftActorRef.send({ type: 'initializeFromChat' });
              return { chat: loadedChat, heldPlacement };
            },
          }),
          persistErrorActor: createAsyncLogic({
            run: async ({ input }) => {
              await depsRef().patchChat(input.chatId, 'error', input.error);
            },
          }),
          clearErrorActor: createAsyncLogic({
            run: async ({ input }) => {
              await depsRef().patchChat(input.chatId, 'error', undefined);
            },
          }),
          /* The chat owns intent; the device owns placement (XD2). `chat.json` takes the portable execution, and a
           * placement that names a host only on this device is this chat's composer record on this device. Every
           * change of where the chat runs comes here, a pick or this tab's reach (round 19): only a pick is written,
           * and every change moves the log observer and marks the queued commands. */
          persistActiveExecutionActor: createAsyncLogic({
            run: async ({ input, signal }) => {
              /* HA-I7: the whole pick waits while an own run is unsettled: both writes, the observer restart and the
               * queue mark, released when the run settles and only then. The queue wakes after all of it (AR5-4). */
              const apply = async (): Promise<void> => {
                /*
                 * Written on every change, never compared with a cached copy: another tab may have changed the record. A
                 * local choice in a tab that could not reach this device's placement leaves it for the tab that can.
                 */
                if (input.persist) {
                  const placement = chatPlacementOf(input.activeExecution);
                  if (placement !== undefined || input.heldPlacement === undefined) {
                    await writeChatPlacement({ client: depsRef().client, projectId, chatId: input.chatId, placement });
                  }
                  /* The chat store writes it portable: a device-relative host never reaches the synced record. */
                  await depsRef().patchChat(input.chatId, 'activeExecution', input.activeExecution);
                }
                signal.throwIfAborted();
                if (this.#sessions.get(input.chatId) !== session) {
                  return;
                }
                // Commands resolve the persisted placement for each turn. Its
                // long-lived log subscription must follow the same host change.
                const observed = this.#observed.get(input.chatId);
                if (
                  observed?.placement !== undefined &&
                  input.activeExecution !== undefined &&
                  observed.placement.hostId === daemonPlacementOf(input.activeExecution)
                ) {
                  return;
                }
                // A destination-specific grant keeps a cancelled switch from
                // releasing the old host's fence. Unknown prepared commands remain
                // blocked even if the initial attachment has not connected yet.
                const destination =
                  observed?.placement === undefined || input.activeExecution === undefined
                    ? undefined
                    : connectionPlacement({ hostId: daemonPlacementOf(input.activeExecution) });
                await session.messageQueueStore.update((record) => {
                  const items = record.items.map((item) =>
                    item.command !== undefined && item.commandPlacement === undefined
                      ? { ...item, commandPlacement: 'unconfirmed' }
                      : item,
                  );
                  if (
                    destination === undefined ||
                    record.afterRunId === undefined ||
                    record.afterPlacement !== undefined ||
                    items.some((item) => item.command !== undefined || item.steer !== undefined)
                  ) {
                    return items.every((item, index) => item === record.items[index]) ? record : { ...record, items };
                  }
                  return { ...record, rebasedPlacement: destination };
                });
                signal.throwIfAborted();
                if (observed !== undefined) {
                  this.#stopObservedAttachment(input.chatId, observed);
                  this.#projectionTopics.get(input.chatId)?.emit();
                  observed.attempts = 0;
                  this.#startObservedAttachment(input.chatId, observed);
                }
              };
              if (!this.#ownRunUnsettled(input.chatId)) {
                await apply();
                return;
              }
              /* This pick's own mark: a newer pick that aborts this one sets its own, which this one must not lift. */
              const pick = Symbol('pick');
              session.deferredPick = pick;
              try {
                await this.#ownRunSettled(input.chatId, signal);
                await apply();
              } finally {
                if (session.deferredPick === pick) {
                  session.deferredPick = undefined;
                  this.refreshMessageQueue(input.chatId);
                }
              }
            },
          }),
          persistActiveKernelActor: createAsyncLogic({
            run: async ({ input }) => {
              await depsRef().patchChat(input.chatId, 'activeKernel', input.activeKernel);
            },
          }),
          persistKernelPreferenceActor: createAsyncLogic({
            run: async ({ input }) => {
              await depsRef().patchChat(input.chatId, 'kernelPreference', input.kernelPreference);
            },
          }),
        } satisfies Partial<MachineActors<typeof chatPersistenceMachine>>,
      }),
      {
        input: {
          activeChatId: chatId,
          resourceId: undefined,
        },
        ...this.#rootOptions,
      },
    );

    const draftActorRef = createActor(
      draftMachine.provide({
        actors: {
          ...draftPersistenceFor(composerRecordRef, recordStore),
          resizeImageActor,
        } satisfies Partial<MachineActors<typeof draftMachine>>,
      }),
      { ...this.#rootOptions, input: {} },
    );
    // Subscribed before the record actor starts, so its read cannot resolve unheard (D7).
    const recordLoadedSubscription = composerRecordRef.on('recordLoaded', ({ record }) => {
      draftActorRef.send({ type: 'hydrateDraft', ...draftHydrationOf(record) });
      if (record !== 'absent' && record.draft !== undefined && record.draft.parts.length > 0) {
        void this.#dropQueuedDraft(session, record.draft);
      }
    });

    persistenceActorRef.start();
    draftActorRef.start();
    composerRecordRef.start();
    /* A held placement becomes this tab's once it can reach it, as when a loopback daemon is handed to it (XD2). */
    const heldNow = (): TauAgentHostId | undefined => persistenceActorRef.getSnapshot().context.heldPlacement;
    /* A placement applied at load before its reach was known: kept (and an adopted legacy host recorded) once the
     * answer says this tab reaches it; otherwise this device's own placement is held and a legacy one let go. */
    settleAfterLoad = async (placement: TauAgentHostId, adopting: string | undefined): Promise<void> => {
      const reachable = (await reachablePlacement(depsRef(), placement)) === placement;
      await waitFor(persistenceActorRef, (snapshot) => !snapshot.context.isLoadingChat).catch(() => undefined);
      /* Either answer applies only while the chat still runs on that placement: a pick made meanwhile wins. */
      const { activeExecution } = persistenceActorRef.getSnapshot().context;
      if (chatPlacementOf(activeExecution) !== placement) {
        return;
      }
      if (reachable) {
        if (adopting !== undefined) {
          await adoptInto(adopting, placement);
        }
        return;
      }
      persistenceActorRef.send({
        type: 'placementUnreachable',
        execution: portableExecutionOf(activeExecution)!,
        ...(adopting === undefined ? { heldPlacement: placement } : {}),
      });
    };
    const applyHeldPlacement = async (held: TauAgentHostId): Promise<void> => {
      if ((await reachablePlacement(depsRef(), held)) !== held || heldNow() !== held) {
        return;
      }
      const placed = withChatPlacement(persistenceActorRef.getSnapshot().context.activeExecution, held);
      if (placed !== undefined) {
        persistenceActorRef.send({ type: 'placementReachable', execution: placed });
      }
    };
    const unsubscribeReachability = depsRef().onPlacementReachabilityChanged?.(() => {
      const held = heldNow();
      if (held !== undefined) {
        void applyHeldPlacement(held);
      }
    });
    /*
     * A reach change heard before a placement was held found nothing to apply: each time one becomes held, it is
     * checked against reach as it is now, so a change during the load or its settling is never lost.
     */
    let lastHeld = heldNow();
    const heldSubscription = persistenceActorRef.subscribe((snapshot) => {
      const held = snapshot.context.heldPlacement;
      if (held !== lastHeld) {
        lastHeld = held;
        if (held !== undefined) {
          void applyHeldPlacement(held);
        }
      }
    });

    // oxlint-disable-next-line eslint/prefer-const -- assigned after the session exists, which its callbacks read.
    let departingSubscriptions: ReadonlyArray<{ unsubscribe: () => void }> = [];
    // oxlint-disable-next-line eslint/prefer-const -- assigned after `session.dispose` captures it so immediate actor emissions cannot observe a partial session.
    let lifecycleSubscription: { unsubscribe: () => void } | undefined;
    let loading: 'before' | 'loading' | 'loaded' = 'before';
    const chatRoot = createActor(this.#chatSessionLogic, { ...this.#rootOptions, input: { chatId, projectId } });
    session = {
      chatId,
      get messages() {
        // ponytail: an idle read refolds, so a change no announcement covers still shows (as before D-UI-10 reads).
        const base = session.announceTimer === undefined ? displayed() : session.publishedMessages;
        /* A send leaving for its own turn is shown until the host accepts it; the accepted gesture shows it after. */
        const message = session.departing?.message;
        if (message === undefined) {
          return base;
        }
        const view = session.departingView;
        if (view?.base === base && view.message === message) {
          return view.messages;
        }
        /* Wherever the transcript already holds it, even behind a later request, it is shown once. */
        const messages = base.some((entry) => entry.id === message.id) ? base : [...base, message];
        session.departingView = { base, message, messages };
        return messages;
      },
      get transcript() {
        return transcriptOf(session);
      },
      get rememberedComposerTrays() {
        return session.composerTrays;
      },
      projectId,
      chatRoot,
      stateActorRef: chatRoot,
      persistenceActorRef,
      draftActorRef,
      composerRecordRef,
      messageQueueRef,
      messageQueueStore,
      messageQueueObservation,
      departing: undefined,
      departingView: undefined,
      outboxRecord: undefined,
      handedOff: undefined,
      dispatchTask: undefined,
      composer,
      composerWork: new Set(),
      viewRefcount: 1,
      runHeld: false,
      seedRequestId: undefined,
      seedMessage: undefined,
      seedRemoteReadVersion: undefined,
      seedLocalLogEmpty: false,
      seedLocalLogCheck: undefined,
      observationRelease: undefined,
      pendingSeedGesture: undefined,
      activeCommand: undefined,
      commandAbort: undefined,
      watchedRunId: undefined,
      resumedAttempt: undefined,
      displayedOwn: undefined,
      displayedRemote: undefined,
      displayedFold: noMessages,
      displayedMessages: { fold: noMessages, gesture: undefined, seed: undefined, messages: noMessages },
      acceptedGesture: undefined,
      announcedMessages: noMessages,
      publishedMessages: noMessages,
      announceTimer: undefined,
      announcePending: false,
      transcriptSettled: this.#createdEmpty.delete(chatId),
      transcriptAwaitsForeignScan: false,
      composerTrays: readRememberedComposerTrays(chatId),
      commandInFlight: false,
      stop: undefined,
      queueHold: undefined,
      refreshDeferred: false,
      takeBackRunId: undefined,
      offering: undefined,
      hostWait: undefined,
      presentationWatch: undefined,
      presentedRunId: undefined,
      status: 'ready',
      turnSubscriptions: [],
      offerChatWaits: () => undefined,
      dispose: () => {
        unsubscribeReachability?.();
        heldSubscription.unsubscribe();
        for (const subscription of departingSubscriptions) {
          subscription.unsubscribe();
        }
        messageQueueRef.stop();
        session.observationRelease?.();
        session.observationRelease = undefined;
        for (const subscription of session.turnSubscriptions) {
          subscription.unsubscribe();
        }
        session.turnSubscriptions = [];
        recordLoadedSubscription.unsubscribe();
        session.commandAbort?.abort();
        clearTimeout(session.hostWait?.timer);
        clearTimeout(session.announceTimer);
        session.announceTimer = undefined;
        lifecycleSubscription?.unsubscribe();
      },
    };

    /* What the thread shows as sent moves with the outbox, the chat's machine and the log (`#refreshDeparting`). */
    departingSubscriptions = [
      messageQueueRef.subscribe(() => {
        this.#refreshDeparting(session);
      }),
      chatRoot.subscribe(() => {
        this.#refreshDeparting(session);
      }),
    ];

    lifecycleSubscription = persistenceActorRef.subscribe((snapshot) => {
      if (loading === 'before' && snapshot.context.isLoadingChat) {
        loading = 'loading';
      } else if (loading === 'loading' && !snapshot.context.isLoadingChat) {
        loading = 'loaded';
        this.#syncProjection(session.chatId, 'open');
      }
    });

    /* The chat's machine is a root this store owns (PV-S5, L3 D10): a chat's fault never reaches its project, and
     * the machine exists before any route effect registers the project session. */
    this.#startChatRoot(session);

    // Kick off chat hydration only after the session record exists. The load
    // actor may dispatch a startup run, whose non-view hold must be able to
    // reference the fully initialised session.
    persistenceActorRef.send({ type: 'setActiveChatId', chatId });

    return session;
  }

  /**
   * A command this page sent that its log does not show as a run yet: in flight, a Start whose run is unfolded, or a
   * Resume whose run has not reopened (a later attempt, or its attempt running again after a native pause).
   */
  #awaitsRun(session: InternalSession): boolean {
    const command = session.activeCommand;
    /* A send waiting for its host reads as on its way, with Stop to take it back. */
    if (session.commandInFlight || session.hostWait !== undefined) {
      return true;
    }
    /* A refused read folds nothing more, so the run a command waits for would never arrive. */
    if (
      (command?.type !== 'start' && command?.type !== 'resume') ||
      this.#observed.get(session.chatId)?.status === 'refused'
    ) {
      return false;
    }
    const run = this.#projectionContext(session.chatId)?.ledger.runs[command.payload.runId];
    if (command.type === 'start') {
      return run === undefined;
    }
    return (
      run !== undefined &&
      run.attempt === session.resumedAttempt &&
      run.lifecycle !== 'admitted' &&
      run.lifecycle !== 'running'
    );
  }

  /** Tell the chat's subscribers when its status moved (T3): the status callback of a stream no longer does. */
  #refreshStatus(session: InternalSession): void {
    const status = this.getChatStatus(session.chatId);
    if (session.status !== status) {
      session.status = status;
      this.#chatTopics.get(session.chatId)?.emit();
    }
  }

  /**
   * Let go of the run a command holds once the chat's log read is refused for good: that log folds nothing more, so
   * the run would never arrive, and the held session could never be disposed (a later reattach must not revive it).
   */
  #releaseRefusedRun(session: InternalSession): void {
    session.watchedRunId = undefined;
    if (!session.commandInFlight) {
      session.activeCommand = undefined;
    }
    this.#refreshStatus(session);
    this.#scheduleRunReleaseIfTerminal(session);
  }

  #scheduleRunReleaseIfTerminal(session: InternalSession): void {
    queueMicrotask(() => {
      if (!session.runHeld || session.watchedRunId !== undefined || session.commandInFlight) {
        return;
      }
      session.runHeld = false;
      session.activeCommand = undefined;
      this.#refreshStatus(session);
      this.#disposeIfUnreferenced(session);
    });
  }

  /**
   * Whether this session's actor is taking a turn right now.
   *
   * An active admission is a reference on the session until its answer lands.
   * A seed still waiting for the focused route is durable on the chat row and
   * holds no session: reacquisition can start it with its original command id.
   *
   * @param session - The chat to ask about.
   * @returns Whether its actor is in `run.queued.admitting`.
   */
  #isAdmittingTurn(session: InternalSession): boolean {
    return session.stateActorRef.getSnapshot().matches({ run: { queued: 'admitting' } });
  }

  #disposeIfUnreferenced(session: InternalSession): void {
    if (
      session.viewRefcount > 0 ||
      session.runHeld ||
      this.#isAdmittingTurn(session) ||
      this.#sessions.get(session.chatId) !== session
    ) {
      return;
    }

    session.dispose();
    session.persistenceActorRef.stop();
    // A debounced keystroke is handed to the record before the draft stops, and the record outlives it until written.
    session.draftActorRef.send({ type: 'flushNow' });
    session.draftActorRef.stop();
    const drained = Promise.withResolvers<void>();
    this.#composerDrains.set(session.chatId, drained.promise);
    void this.#drainComposer(session, drained);
    session.chatRoot.stop();
    this.#sessions.delete(session.chatId);
    this.#stopRemoteObservationIfUnused(session.chatId);
    this.#messagePresentations.delete(session.chatId);
    if (!this.#observed.has(session.chatId)) {
      this.#historicalUsage.delete(session.chatId);
    }
    clearChatTurnServices(session.chatId);
    clearLedger(session.chatId);
    this.#disposeChatTopics(session.chatId);
    this.#retireProjection(session.chatId, session.projectId);
    this.#refreshSnapshot();
    this.#notifyMembership();
  }

  #invalidateDeletedProjection(chatId: string): void {
    const actor = this.#projections.get(chatId);
    if (actor === undefined) {
      return;
    }
    this.#deletedProjections.add(actor);
    const observed = this.#observed.get(chatId);
    if (observed !== undefined) {
      observed.status = 'lost';
    }
    this.#answeredLogReads.delete(chatId);
    this.#validatedDisplays.delete(actor);
    this.#historicalUsage.delete(chatId);
    this.#messagePresentations.delete(chatId);
    if (!this.#sessions.has(chatId) && !this.#observed.has(chatId)) {
      this.#evictProjection(chatId, actor);
    }
  }

  #evictProjection(chatId: string, actor: Actor<typeof chatProjectionLogic>): void {
    if (this.#projections.get(chatId) !== actor) {
      return;
    }
    this.#inactiveProjections.delete(chatId);
    actor.stop();
    this.#projectionFrames.get(chatId)?.();
    this.#projectionFrames.delete(chatId);
    this.#projections.delete(chatId);
    this.#answeredLogReads.delete(chatId);
    this.#validatedDisplays.delete(actor);
    this.#messagePresentations.delete(chatId);
    this.#historicalUsage.delete(chatId);
    this.#stopRemoteObservationIfUnused(chatId);
    this.#remoteReadCompletedVersions.delete(chatId);
    this.#remoteReadEndedVersions.delete(chatId);
    this.#remoteReadFailedVersions.delete(chatId);
  }

  #retireProjection(chatId: string, projectId: string): void {
    if (this.#sessions.has(chatId) || this.#observed.has(chatId)) {
      return;
    }
    const actor = this.#projections.get(chatId);
    if (actor === undefined) {
      return;
    }
    const projection = actor.getSnapshot().context;
    if (this.#deletedProjections.has(actor) || !selectCaughtUp(projection)) {
      this.#evictProjection(chatId, actor);
      return;
    }
    const weight = projectionWeight(projection);
    if (weight > inactiveProjectionWeightLimit) {
      this.#evictProjection(chatId, actor);
      return;
    }
    this.#inactiveProjections.delete(chatId);
    this.#inactiveProjections.set(chatId, { projectId, actor, weight });
    let total = [...this.#inactiveProjections.values()].reduce((sum, entry) => sum + entry.weight, 0);
    while (this.#inactiveProjections.size > inactiveProjectionLimit || total > inactiveProjectionWeightLimit) {
      const oldest = this.#inactiveProjections.entries().next().value;
      if (oldest === undefined) {
        break;
      }
      total -= oldest[1].weight;
      this.#evictProjection(oldest[0], oldest[1].actor);
    }
  }

  #addPerChatListener({
    bucket,
    namePrefix,
    chatId,
    listener,
  }: {
    bucket: Map<string, Topic<void>>;
    namePrefix: string;
    chatId: string;
    listener: () => void;
  }): () => void {
    let topic = bucket.get(chatId);
    if (!topic) {
      topic = new Topic<void>({ name: `ChatSessionStore.${namePrefix}[${chatId}]` });
      bucket.set(chatId, topic);
    }
    const unsubscribe = topic.subscribe(listener);
    return () => {
      unsubscribe();
      if (topic.size === 0 && bucket.get(chatId) === topic) {
        bucket.delete(chatId);
        topic.dispose();
      }
    };
  }

  #disposeChatTopics(chatId: string): void {
    this.#chatTopics.get(chatId)?.dispose();
    this.#chatTopics.delete(chatId);
  }

  #refreshSnapshot(): void {
    this.#snapshot = [...this.#sessions.keys()];
  }

  #notifyMembership(): void {
    if (this.#membershipNotifyScheduled) {
      return;
    }
    this.#membershipNotifyScheduled = true;
    queueMicrotask(() => {
      this.#membershipNotifyScheduled = false;
      this.#membershipTopic.emit();
    });
  }

  /**
   * A project's placements, read once for every chat a pass asks about and read again after any placement write
   * (`readChatPlacementsShared`).
   *
   * @param projectId - The project.
   * @returns Each chat id → its placement on this device.
   */
  async #placementsOf(projectId: string): Promise<Readonly<Record<string, TauAgentHostId>>> {
    return readChatPlacementsShared(this.#deps.client, projectId);
  }

  /** This device's stored placement for a chat, when this tab reaches it (XD2). */
  async #storedPlacement(projectId: string, chatId: string): Promise<TauAgentHostId | undefined> {
    const placements = await this.#placementsOf(projectId);
    return reachablePlacement(this.#deps, placements[chatId]);
  }

  async #readRemoteSegments(chatId: string, projectId: string, fence?: ObservationRead): Promise<void> {
    if (this.#observed.get(chatId)?.projectId !== projectId && this.#sessions.get(chatId)?.projectId !== projectId) {
      return;
    }
    const version = (this.#remoteReadVersions.get(chatId) ?? 0) + 1;
    this.#remoteReadVersions.set(chatId, version);
    let failed = false;
    try {
      await this.#readRemoteSegmentsAt({ chatId, projectId, version, fence });
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      if (this.#remoteReadVersions.get(chatId) === version) {
        this.#remoteReadEndedVersions.set(chatId, version);
        if (failed) {
          this.#remoteReadFailedVersions.set(chatId, version);
        } else {
          this.#remoteReadFailedVersions.delete(chatId);
        }
        this.#resumeTranscriptAfterForeignScan(chatId);
        this.#latchIfForeignScanLost(chatId);
      }
    }
  }

  async #readRemoteSegmentsAt(scan: {
    readonly chatId: string;
    readonly projectId: string;
    readonly version: number;
    readonly fence: ObservationRead | undefined;
  }): Promise<void> {
    const { chatId, projectId, version, fence } = scan;
    const { client } = this.#deps;
    const directory = `/projects/${projectId}/${chatRecordsPath(chatId)}/events`;
    let entries: string[];
    try {
      entries = await client.readdir(directory);
    } catch (error) {
      if (getErrno(error) !== 'ENOENT' && getErrno(error) !== 'ENOTDIR') {
        throw error;
      }
      entries = [];
    }
    /* The device a segment names, as every agent host reads it (`segmentDeviceIdOf`): the run elsewhere is that device. */
    const named = entries.flatMap((name) => {
      const deviceId = segmentDeviceIdOf(name);
      return deviceId === undefined ? [] : [{ name, deviceId }];
    });
    /*
     * This device's record of its pulls of the chat, as the agent host's reader reads it (XD3, rounds 18 and 19): read
     * before the segments, since sync records a pull only once the segments it brought are written, and its quiet
     * counts only for a segment of the very size it names.
     */
    const record = entries.includes(chatPulledAtFileName)
      ? await client.readFile(`${directory}/${chatPulledAtFileName}`).catch(() => undefined)
      : undefined;
    const segments = await Promise.all(
      named.map(async ({ name, deviceId }) => {
        const bytes = await this.#readForeignSegment(`${directory}/${name}`, client);
        const pulledQuiet = pulledQuietOf(record, name, bytes.byteLength);
        return {
          deviceId,
          bytes,
          ...(await receivedAtOf(client, `${directory}/${name}`)),
          ...(pulledQuiet === undefined ? {} : { pulledQuiet }),
        };
      }),
    );
    if (
      this.#remoteReadVersions.get(chatId) === version &&
      this.#deps.client === client &&
      (fence === undefined || fence.isCurrent()) &&
      (this.#observed.get(chatId)?.projectId === projectId || this.#sessions.get(chatId)?.projectId === projectId)
    ) {
      this.#remoteReadCompletedVersions.set(chatId, version);
      const before = this.#projectionContext(chatId);
      this.#projectionOf(chatId).send({ type: 'remote', segments, at: Date.now() });
      // A rescan that finds the same foreign history leaves the reducer unchanged, yet it is what makes the local
      // log displayable again: a turn logged while it was out was held back, and nothing else would present it.
      if (this.#projectionContext(chatId) === before) {
        this.#syncProjection(chatId, 'none');
      }
      const session = this.#sessions.get(chatId);
      if (session?.pendingSeedGesture !== undefined) {
        session.seedRemoteReadVersion = version;
        this.startPendingSeed(chatId);
      }
    }
  }
}
