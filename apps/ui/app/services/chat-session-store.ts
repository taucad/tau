/**
 * ChatSessionStore
 *
 * Vanilla, dual-lifetime store that owns the long-lived per-chat objects:
 * the AI SDK `Chat` instance, the `chatPersistenceMachine` actor, and the
 * `draftMachine` actor. React components subscribe but never own — every
 * lifetime survives subtree unmount/remount cycles, eliminating the class of
 * "headless component reuse" races that plagued the prior `<ChatInstance>`
 * design (load wipes in-flight messages, persist dropped while loading,
 * draft state leaking across chats, cross-chat persist mis-targeting).
 *
 * Lifetime ownership:
 * - `acquire(chatId, projectId)` / `release(chatId)` track React views only; the
 *   caller names the chat's project (PV-S4).
 * - An active projection watch retains the session independently of a view,
 *   so navigation cannot stop its SDK transcript consumer.
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
 * Dependencies (`setDependencies`) are mirrored on every render of the
 * provider so the store always invokes the latest closures from
 * `useProjectManager()`, held in a ref so effect identity does not churn.
 */

import type { Chat } from '@ai-sdk/react';
import { UIMessageStreamError } from 'ai';
import type { ChatStatus } from 'ai';
import { Topic } from '@taucad/events';
import { ObservationService } from '@taucad/fs-client/observation-service';
import type { ObservationRead, ObservationWatch } from '@taucad/fs-client/observation-service';
import type { WatchEvent } from '@taucad/filesystem';
import { createActor, createAsyncLogic, waitFor } from 'xstate';
import type { Actor, ActorOptions, AnyActorLogic } from 'xstate';
import type { CadAgentExecution, Chat as ChatEntity, MyUIMessage } from '@taucad/chat';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import { chatRecordsPath } from '@taucad/revisions';
import { getErrno } from '@taucad/utils/error';
import { sendHostCommand } from '#chat-clients/_internal/host-command.js';
import type { MachineActors } from '#lib/xstate.lib.js';
import { waitUnlessGone } from '#lib/xstate.lib.js';
import { chatSessionMachine } from '#machines/chat-session.machine.js';
import type {
  ChatRequest,
  ChatSessionActorRef,
  ChatSyncState,
  ChatTurnGesture,
} from '#machines/chat-session.machine.js';
import type { ProjectSessionActorRef } from '#machines/project-session.machine.js';
import { chatPersistenceMachine } from '#hooks/chat-persistence.machine.js';
import { buildDraftMessage, draftMachine } from '#hooks/draft.machine.js';
import {
  createComposerRecordActor,
  draftHydrationOf,
  draftPersistenceFor,
  flushRecord,
  stopWhenWritesSettle,
} from '#hooks/composer-record.js';
import type { ComposerRecordRef } from '#hooks/composer-record.js';
import { composerRecordPaths, createComposerRecordStore } from '#db/composer-record-store.js';
import type { ComposerRecord, ComposerRecordClient } from '#db/composer-record-store.js';
import { createChatAttachmentStore } from '#db/attachment-store.js';
import { attachmentReferenceOf } from '#utils/attachment.utils.js';
import type { StoredAttachmentRef } from '#utils/attachment.utils.js';
import { deferredRecordStore, referencedAttachments, removeRecord } from '#services/chat-session-store-composer.js';
import type { ComposerBinding, UnreadRecord } from '#services/chat-session-store-composer.js';
import { resizeImageActor } from '#hooks/resize-image.actor.js';
import { clearLedger } from '#services/rpc-ledger.js';
import { parseErrorForPersistence } from '#utils/error.utils.js';
import { buildUserMessage } from '#utils/chat.utils.js';
import { createChatInstance } from '#chat-clients/_internal/shared-chat-transport.js';
import { BrowserPlacementChatTransport } from '#chat-clients/_internal/browser-agent-host-transport.js';
import { hostAttachment } from '#chat-clients/_internal/host-attachment.js';
import type { AgentHostClient } from '#services/agent-host-client.js';
import { chatTurnAdmission, chatTurnAdmit, clearChatTurnServices } from '#chat-clients/_internal/chat-host-binding.js';
import type { CommitCancelledDraftRestoreInput } from '#types/storage.types.js';
import { ENV } from '#environment.config.js';
import {
  chatProjectionLogic,
  selectAttentionRow,
  selectCaughtUp,
  selectCurrentRun,
  selectOpenInterrupts,
  selectRunFailure,
  selectRunPhase,
  selectTranscriptSource,
  selectToolsInFlight,
  materializeTranscript,
  chunksSince,
} from '#machines/chat-projection.logic.js';
import type {
  ChatProjection,
  ChatProjectionReadAnswer,
  ChatRunPhase as ProjectedRunPhase,
} from '#machines/chat-projection.logic.js';
import type { RowKey } from '@taucad/agent-host';
import type { HostCommand } from '@taucad/agent-host/wire';
import { sdkWatch } from '#chat-clients/_internal/sdk-watch.js';
import type { SdkWatchInput } from '#chat-clients/_internal/sdk-watch.js';
import { buildTurnGroups } from '#routes/w.$workspace.$project/chat-turn-groups.js';
import { commandInvocation } from '#utils/at-reference.utils.js';

/** Describe a failed SDK frame without exposing tool inputs, outputs, or exception payloads. */
const presentationErrorFacts = (
  error: unknown,
): Readonly<{ errorName: string; chunkId?: string; chunkType?: string }> => ({
  errorName: error instanceof Error ? error.name : 'UnknownError',
  ...(UIMessageStreamError.isInstance(error) ? { chunkId: error.chunkId, chunkType: error.chunkType } : {}),
});

/** Framing can exist even when no assistant content reached the person. */
const nonOutputChunkTypes: ReadonlySet<string> = new Set([
  'start',
  'start-step',
  'finish-step',
  'finish',
  'abort',
  'message-metadata',
  'data-acp-session',
]);

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
 * What asked a chat's run to stop. The host records every renderer cancel as `USER_STOPPED`, so the origin is
 * logged beside the cancel's command id: the one way to tell which gesture a ledger's stop row came from.
 *
 * @public
 */
export type StopOrigin = 'stop-button' | 'stop-shortcut' | 'message-stop' | 'close-chat' | 'new-turn' | 'project-close';

/* Renderer console reaches the desktop log, where it lines up with the ledger's cancel row by command id. */
const logStop = (command: HostCommand, origin: StopOrigin | undefined): void => {
  console.info('[ChatSessionStore] host cancel', { ...command.payload, commandId: command.commandId, origin });
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
  client: ComposerRecordClient;
  /** Acknowledged observation through the root owning the chat records. */
  watchRecordFile?: (
    path: string,
    listener: (event: WatchEvent) => void,
    options?: { recursive?: boolean },
  ) => ObservationWatch;
};

export type ChatSession = {
  readonly chatId: string;
  readonly chat: Chat<MyUIMessage>;
  readonly persistenceActorRef: Actor<typeof chatPersistenceMachine>;
  readonly draftActorRef: Actor<typeof draftMachine>;
  /**
   * This chat's composer record on this device (D2): draft, edits, tool choice
   * and mode. A surface mounts `useComposerRecordToasts` on it.
   */
  readonly composerRecordRef: ComposerRecordRef;
  /** Coherent visible transcript; the SDK array may be reconstructing a cumulative stream. */
  readonly messages: readonly MyUIMessage[];
  /**
   * This chat's state in the agent-state vocabulary (D32, S45).
   *
   * The store keeps the AI SDK `Chat`, its transport and its persistence; the
   * machine is the one derivation of what the person is told — every row of
   * the architecture's agent-state table is one of its states. The sidebar
   * (W20) and the Agents pane read this, never the flags behind it.
   */
  /* A root the store creates at acquire and stops at dispose (PV-S5, L3 D10): never swapped, so a view that
   * subscribed once stays subscribed to the chat's machine. */
  readonly stateActorRef: ChatSessionActorRef;
};

type MessagePresentation = {
  readonly messagesById: ReadonlyMap<string, MyUIMessage>;
  readonly order: readonly string[];
  readonly groups: ReturnType<typeof buildTurnGroups>;
  readonly agentInvocations: string;
};

type CachedMessagePresentation = MessagePresentation & {
  readonly messagesById: Map<string, MyUIMessage>;
  readonly length: number;
  readonly lastId: string | undefined;
  readonly lastRole: MyUIMessage['role'] | undefined;
  readonly prefixInvocations: ReadonlySet<string>;
  readonly lastParts: MyUIMessage['parts'] | undefined;
  readonly lastMessage: MyUIMessage | undefined;
  readonly lastRawMessage: MyUIMessage | undefined;
  readonly firstMessage: MyUIMessage | undefined;
};

/** Compare mutable SDK values against retained snapshots without changing equal renderer parts. */
const equalPartValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true;
  }
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => equalPartValue(value, right[index]))
    );
  }
  const first = left as Record<string, unknown>;
  const second = right as Record<string, unknown>;
  const keys = Object.keys(first);
  return (
    keys.length === Object.keys(second).length &&
    keys.every((key) => Object.hasOwn(second, key) && equalPartValue(first[key], second[key]))
  );
};

const shareMessageParts = (previous: MyUIMessage | undefined, current: MyUIMessage): MyUIMessage => {
  if (previous?.id !== current.id || previous.role !== current.role) {
    return structuredClone(current);
  }
  const parts = current.parts.map((part, index) =>
    equalPartValue(previous.parts[index], part) ? previous.parts[index]! : structuredClone(part),
  );
  const unchanged =
    parts.length === previous.parts.length && parts.every((part, index) => part === previous.parts[index]);
  if (unchanged && equalPartValue(previous.metadata, current.metadata)) {
    return previous;
  }
  return { ...current, metadata: structuredClone(current.metadata), parts: unchanged ? previous.parts : parts };
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

/** Compare a reconstructing SDK prefix without requiring its transient part state to have settled. */
const includesPresentedPrefix = (
  messages: readonly MyUIMessage[],
  prefix: readonly MyUIMessage[],
  offset: number,
): boolean =>
  prefix.every((message, index) => {
    const next = messages[offset + index];
    if (next === message) {
      return true;
    }
    return (
      next?.id === message.id &&
      message.parts.every((part, partIndex) => {
        const candidate = next.parts[partIndex];
        if (candidate?.type !== part.type) {
          return false;
        }
        if (
          (part.type === 'text' || part.type === 'reasoning') &&
          (candidate.type === 'text' || candidate.type === 'reasoning')
        ) {
          return candidate.text.startsWith(part.text);
        }
        return equalPartValue(candidate, part);
      })
    );
  });

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
 * original's id and metadata and refreshes only `createdAt` and `status`; the
 * turn's agent config travels in `body.agent`, never in message metadata.
 */
function editedMessage(original: MyUIMessage, request: Extract<ChatRequest, { kind: 'edit' }>): MyUIMessage {
  const built = buildUserMessage({ text: request.content, attachments: request.attachments });
  return { ...built, id: request.messageId, metadata: { ...original.metadata, ...built.metadata } };
}

// ---------------------------------------------------------------------------
// ChatSessionStore
// ---------------------------------------------------------------------------

type InternalSession = ChatSession & {
  /** One SDK stream slot per chat; an armed watch cannot belong to a different chat. */
  readonly transport: BrowserPlacementChatTransport<MyUIMessage>;
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
  seedLocalLogCheck: Promise<Uint8Array<ArrayBuffer>> | undefined;
  /** The retained session owns one lease on the shared local/foreign log observation. */
  observationRelease: (() => void) | undefined;
  /** Durable seed waiting for the focused admission and project connector to publish. */
  pendingSeedGesture: ChatTurnGesture | undefined;
  /** The one command being dispatched, and the SDK watch following its projected run. */
  activeCommand: HostCommand | undefined;
  commandAbort: AbortController | undefined;
  watch: Actor<typeof sdkWatch> | undefined;
  watchedRunId: string | undefined;
  watchedSegmentId: string | undefined;
  watchedStreamVersion: number | undefined;
  /** Bounded derived presentation retained only while the same source replays its cumulative prefix. */
  presentationHold:
    | Readonly<{
        messages: readonly MyUIMessage[];
        prefixOffset: number;
        prefix: readonly MyUIMessage[];
        runId: string;
        segmentId: string | undefined;
        streamVersion: number;
        sourceGeneration: string | undefined;
      }>
    | undefined;
  materializeVersion: number;
  transcriptMaterialization: Promise<void> | undefined;
  recoveredRunId: string | undefined;
  blockedPresentationRunId: string | undefined;
  recoveringPresentation: boolean;
  failedTranscriptProjection: ChatProjection | undefined;
  transcriptSource: ChatProjection | undefined;
  transcriptSourceVersion: number;
  commandInFlight: boolean;
  stopRequested: boolean;
  /** What asked for the pending stop; logged with the cancel it sends. */
  stopOrigin: StopOrigin | undefined;
  /** A storage invalidation waits for host settlement, independently of SDK reattachment readiness. */
  refreshDeferred: boolean;
  restoredStoppedRunId: string | undefined;
  status: ChatStatus;
  /** The project this chat belongs to, from its caller (PV-S4, L3 D9); never from focus. */
  readonly projectId: string;
  /** The chat machine's turn emits, subscribed once when its root is created. */
  turnSubscriptions: Array<{ unsubscribe: () => void }>;
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
  Readonly<{ chatSession?: typeof chatSessionMachine }>;

/** The revision facts one project's chats show (the project's route reports them). @public */
export type ChatRevisionFacts = Readonly<{
  dirty: boolean;
  sync: ChatSyncState;
  branch?: string;
}>;

type ObservedChat = {
  projectId: string;
  refs: number;
  attachment?: Actor<typeof hostAttachment>;
  status: 'unknown' | 'attached' | 'lost' | 'refused';
  retry?: ReturnType<typeof setTimeout>;
  attempts: number;
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
  connect: (
    chatId: string,
  ) => Promise<Pick<AgentHostClient, 'read' | 'catchUp' | 'subscribe' | 'hostCommand' | 'close'>>;
  stoppability?: (chatId: string) => Promise<'stoppable' | 'other-build' | 'background-window'>;
}>;

export class ChatSessionStore {
  readonly #sessions = new Map<string, InternalSession>();
  readonly #observed = new Map<string, ObservedChat>();
  readonly #projectHostConnectors = new Map<string, ProjectHostConnector>();
  readonly #remoteReadVersions = new Map<string, number>();
  readonly #remoteReadCompletedVersions = new Map<string, number>();
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
  readonly #inactiveProjections = new Map<
    string,
    { projectId: string; actor: Actor<typeof chatProjectionLogic>; weight: number }
  >();
  readonly #deletedProjections = new WeakSet<Actor<typeof chatProjectionLogic>>();
  /** A read answer, not the projection's initially empty cursor, proves this chat's log was checked. */
  readonly #answeredLogReads = new Set<string>();
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
  readonly #messagePresentations = new Map<string, CachedMessagePresentation>();
  readonly #historicalUsage = new Map<
    string,
    {
      projection: ChatProjection;
      pending?: Promise<ChatHistoricalUsage>;
      result?: ChatHistoricalUsage;
    }
  >();
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
  // Default deps throw — `setDependencies` must be called before any acquire.
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
    const { chatSession, ...rootOptions } = options;
    /* One admission per chat; the project-scoped connector owns log attachment. */
    this.#chatSessionLogic =
      chatSession ??
      chatSessionMachine.provide({
        actors: { admitTurn: chatTurnAdmission },
      });
    this.#rootOptions = rootOptions;
    // E2E reads the same owner that drives the sidebar. Keeping this bridge
    // debug-only makes a liveness failure report the store's SDK/cache facts
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
      this.#startObservedAttachment(chatId, observed);
      this.#notifyMembership();
    }
    return () => {
      observed.refs -= 1;
      if (observed.refs > 0 || this.#observed.get(chatId) !== observed) {
        return;
      }
      this.#stopObservedAttachment(chatId, observed);
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
    stoppability?: ProjectHostConnector['stoppability'],
  ): () => void {
    const connector = { connect, stoppability };
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

  /** Resolve a listed chat's persisted placement without acquiring its SDK session. @public */
  public async getChatExecution(chatId: string): Promise<CadAgentExecution | undefined> {
    const projectId = this.#sessions.get(chatId)?.projectId ?? this.#observed.get(chatId)?.projectId;
    const chat = await this.#deps.getChat(chatId, projectId);
    return chat?.activeExecution;
  }

  /** Read a listed chat's host bootstrap choices without acquiring an SDK session. @public */
  public async getChatHostSettings(
    chatId: string,
  ): Promise<Pick<ChatEntity, 'activeExecution' | 'activeKernel'> | undefined> {
    const projectId = this.#sessions.get(chatId)?.projectId ?? this.#observed.get(chatId)?.projectId;
    const chat = await this.#deps.getChat(chatId, projectId);
    return chat === undefined ? undefined : { activeExecution: chat.activeExecution, activeKernel: chat.activeKernel };
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
    const answer = await sendHostCommand(async () => connector.connect(chatId), command);
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
    const answer = await sendHostCommand(async () => connector.connect(chatId), {
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
    const answer = await sendHostCommand(async () => connector.connect(chatId), {
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
      const resumed = await sendHostCommand(async () => connector.connect(chatId), {
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
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- SDK callbacks can mutate status while the storage await is pending.
      session.status === 'ready' &&
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- Admission can begin while the storage await is pending.
      !session.commandInFlight
    ) {
      session.transcriptMaterialization = this.#applyProjectedTranscript(
        session,
        projection,
        ++session.materializeVersion,
      );
      await session.transcriptMaterialization;
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
      return existing;
    }

    const session = this.#createSession(chatId, projectId);
    this.#sessions.set(chatId, session);
    session.observationRelease = this.observe(chatId, projectId);
    // A retained sidebar observation may already be caught up and emit no new answer.
    this.#syncProjection(chatId, 'open');
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
        console.warn('[ChatSessionStore] handoff metadata could not be prepared', { chatId, error });
      }
      return;
    }
    // Observe the existing owner, never start a competing materialization/version producer.
    let pending = session.transcriptMaterialization;
    while (!signal.aborted && this.#sessions.get(chatId) === session && pending !== undefined) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Follow the task that superseded this materialization, never parallel producers.
      await pending;
      if (pending === session.transcriptMaterialization) {
        return;
      }
      pending = session.transcriptMaterialization;
    }
  }

  public get(chatId: string): ChatSession | undefined {
    return this.#sessions.get(chatId);
  }

  /** Replace the SDK transcript after invalidating indexes that may include a changed middle message. */
  public replaceMessages(chatId: string, messages: MyUIMessage[]): void {
    const session = this.#sessions.get(chatId);
    if (session === undefined) {
      return;
    }
    session.presentationHold = undefined;
    this.#messagePresentations.delete(chatId);
    session.chat.messages = messages;
  }

  /** Stable structural and command selections; streaming text only inspects the current tail. */
  public getMessagePresentation(chatId: string): MessagePresentation {
    const messages = this.#sessions.get(chatId)?.messages;
    if (messages === undefined) {
      return emptyMessagePresentation;
    }
    const last = messages.at(-1);
    const cached = this.#messagePresentations.get(chatId);
    if (
      cached?.length === messages.length &&
      cached.lastId === last?.id &&
      cached.lastRole === last?.role &&
      (messages.length === 1 || cached.firstMessage === messages[0])
    ) {
      const selected = last === undefined ? undefined : shareMessageParts(cached.lastMessage, last);
      if (last !== undefined) {
        // The map is an index over the authoritative SDK array, not another transcript.
        cached.messagesById.set(last.id, selected!);
      }
      const agentInvocations =
        cached.lastParts === selected?.parts
          ? cached.agentInvocations
          : [
              ...new Set([...cached.prefixInvocations, ...invocationsOf(selected === undefined ? [] : [selected])]),
            ].join('\n');
      const next = {
        ...cached,
        agentInvocations,
        lastParts: selected?.parts,
        lastMessage: selected,
        lastRawMessage: last,
      };
      this.#messagePresentations.set(chatId, next);
      return next;
    }
    const prefixInvocations = invocationsOf(messages.slice(0, -1));
    const agentInvocations = [
      ...new Set([...prefixInvocations, ...invocationsOf(last === undefined ? [] : [last])]),
    ].join('\n');
    const selected = last === undefined ? undefined : shareMessageParts(undefined, last);
    const next: CachedMessagePresentation = {
      messagesById: new Map(
        messages.map((message) => [
          message.id,
          message === last
            ? selected!
            : message === cached?.lastRawMessage
              ? shareMessageParts(cached.lastMessage, message)
              : message,
        ]),
      ),
      order: messages.map((message) => message.id),
      groups: buildTurnGroups(messages),
      agentInvocations,
      length: messages.length,
      lastId: last?.id,
      lastRole: last?.role,
      prefixInvocations,
      lastParts: selected?.parts,
      lastMessage: selected,
      lastRawMessage: last,
      firstMessage: messages[0],
    };
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

  /** Derive exact usage from the merged host log, cached per projected snapshot. */
  public async getHistoricalUsage(chatId: string): Promise<ChatHistoricalUsage> {
    const actor = this.#projections.get(chatId);
    if (actor !== undefined && this.#deletedProjections.has(actor)) {
      throw new Error('Chat usage projection superseded.');
    }
    const projection = this.#projectionContext(chatId);
    if (projection === undefined || !selectCaughtUp(projection)) {
      return usageOf(this.#sessions.get(chatId)?.chat.messages ?? []);
    }
    const cached = this.#historicalUsage.get(chatId);
    const sameSource = (left: ChatProjection, right: ChatProjection): boolean =>
      left.views === right.views && left.remote?.digest === right.remote?.digest;
    if (cached !== undefined) {
      const unchanged = sameSource(cached.projection, projection);
      if (!unchanged) {
        cached.projection = projection;
        cached.result = undefined;
      }
      if (cached.pending !== undefined) {
        return cached.pending;
      }
      if (unchanged && cached.result !== undefined) {
        return cached.result;
      }
    }
    const entry = cached ?? { projection };
    const pending = (async (): Promise<ChatHistoricalUsage> => {
      for (;;) {
        const target = entry.projection;
        // oxlint-disable-next-line eslint/no-await-in-loop -- One chat's projections serialize; a later snapshot replaces the target after this read.
        const result = usageOf(await materializeTranscript(target));
        if (this.#projections.get(chatId) !== actor || this.#historicalUsage.get(chatId) !== entry) {
          throw new Error('Chat usage projection superseded.');
        }
        const latest = this.#projectionContext(chatId);
        if (latest !== undefined && selectCaughtUp(latest) && !sameSource(target, latest)) {
          entry.projection = latest;
        }
        if (entry.projection === target) {
          entry.result = result;
          entry.pending = undefined;
          return result;
        }
      }
    })();
    entry.pending = pending;
    this.#historicalUsage.set(chatId, entry);
    try {
      return await pending;
    } catch (error) {
      if (this.#historicalUsage.get(chatId) === entry) {
        this.#historicalUsage.delete(chatId);
      }
      throw error;
    }
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
    }
    this.#projectionOf(chatId).send({ type: 'batch', answer });
    // A verified empty batch can leave the reducer unchanged while establishing read authority.
    if (answer.status === 'batch' && answer.events.length === 0) {
      this.#syncProjection(chatId, 'none');
      this.#unreadTopic.emit();
    }
    this.startPendingSeed(chatId);
  }

  /** The current read-only host attachment's verified state, never a run lifecycle. @public */
  public getAttachmentStatus(chatId: string): ObservedChat['status'] {
    return this.#observed.get(chatId)?.status ?? 'unknown';
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
    await this.#requestTurn(session, gesture);
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
    if (selectTranscriptSource(projection).some((view) => view.user !== undefined)) {
      const { seedRequestId } = session;
      const seedMessageId = session.seedMessage?.id;
      session.pendingSeedGesture = undefined;
      session.seedRequestId = undefined;
      session.seedMessage = undefined;
      this.#messagePresentations.delete(session.chatId);
      session.chat.messages = session.chat.messages.filter((message) => message.id !== seedMessageId);
      if (seedRequestId !== undefined) {
        void this.#clearAcceptedSeed(chatId, seedRequestId);
      }
      this.#materializeProjectedTranscript(session, projection);
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
   * Register one live project's session, or forget it when it closes.
   *
   * Every live project's binding calls this, not only the focused one, so a
   * run reports to the project that ran it (R2). The chats' machines are roots
   * this store owns (PV-S5, L3 D10); a session that registers late is told which
   * of its chats already have a run in flight, so `busy` still counts them.
   *
   * @param projectId - The project this session is for.
   * @param ref - The live session, or `undefined` when it closes.
   * @public
   */
  public setProjectSession(projectId: string, ref: ProjectSessionActorRef | undefined): void {
    if (ref === undefined) {
      this.#projectSessions.delete(projectId);
    } else {
      this.#projectSessions.set(projectId, ref);
      this.#projectRunKeys.delete(projectId);
      this.#refreshProjectRuns(projectId);
    }
  }

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
   * Say which project the person is on, so its chats are bound to its live session. Focus never names a chat's
   * project: its caller does (PV-S4, L3 D9).
   *
   * @param projectId - The focused project, or `undefined` on leaving.
   * @public
   */
  public setFocusedProject(projectId: string | undefined): void {
    if (projectId === undefined) {
      return;
    }
    this.setProjectSession(projectId, this.#projectSessions.get(projectId));
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
   * Stop this chat's run, through the one dispatcher that owns it (P63).
   *
   * *Stop* in the sidebar and *Stop* in the composer use the same projected run
   * identity and send a keyed host cancel. The host log confirms its outcome;
   * stopping a local SDK watch alone never settles the run.
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
    session.stopRequested = true;
    session.stopOrigin = origin;
    this.#chatTopics.get(chatId)?.emit();
    session.watch?.stop();
    session.watch = undefined;
    void session.chat.stop();
    if (!session.commandInFlight) {
      void this.#cancelSessionRun(session);
    }
  }

  /** A user Stop is awaiting its host-confirmed terminal row. @public */
  public isStopping(chatId: string): boolean {
    return this.#sessions.get(chatId)?.stopRequested ?? false;
  }

  /**
   * Whether this chat is unread on this device (§5.8, LT01): its log's newest attention row is not the one its read
   * receipt names. A legacy unread mark is a receipt that matches no row. Until this page has read the chat's log,
   * the legacy mark alone answers (D9).
   *
   * @param chatId - A chat with a live session.
   * @returns Whether the chat has something the person has not seen.
   * @public
   */
  public isUnread(chatId: string): boolean {
    const projectId = this.#sessions.get(chatId)?.projectId;
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
    // A released chat's record may still be landing its last write; removing under it would bring the file back.
    await this.#composerDrains.get(chatId);
    const session = this.#sessions.get(chatId);
    if (session === undefined) {
      return;
    }
    this.#forgetReceipt(session.projectId, chatId);
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
    }
    // Ponytail: waits on every released chat's drain, not only this project's; drains are one write long.
    await Promise.all(this.#composerDrains.values());
    const sessions = [...this.#sessions.values()].filter((session) => session.projectId === projectId);
    await Promise.all([
      ...sessions.map(async (session) => removeRecord(session.composerRecordRef)),
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
    const directory = `/projects/${projectId}/${chatRecordsPath(chatId)}/events`;
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
            // writer or chat.json metadata. Ancestor deletion/rename also refolds it.
            if (paths.some((path) => path.endsWith('.jsonl') || directory.endsWith(`/${path}`) || directory === path)) {
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
    observation.acquire();
    return true;
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

  async #cancelSessionRun(session: InternalSession): Promise<void> {
    const projected = this.#projectionContext(session.chatId);
    const runId =
      session.activeCommand?.type === 'start' || session.activeCommand?.type === 'resume'
        ? session.activeCommand.payload.runId
        : projected === undefined
          ? undefined
          : selectCurrentRun(projected)?.runId;
    const connector = this.#projectHostConnectors.get(session.projectId);
    if (runId === undefined || connector === undefined) {
      return;
    }
    const command: HostCommand = {
      type: 'cancel',
      commandId: generatePrefixedId(idPrefix.request),
      payload: { chatId: session.chatId, runId },
    };
    logStop(command, session.stopOrigin);
    const answer = await sendHostCommand(async () => connector.connect(session.chatId), command);
    if (answer.status === 'refused') {
      session.persistenceActorRef.send({
        type: 'setPersistedError',
        error: parseErrorForPersistence(new Error(`Host cancel refused ${answer.code}: ${answer.message}`)),
      });
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

  #stopObservedAttachment(chatId: string, observed: ObservedChat): void {
    this.#answeredLogReads.delete(chatId);
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
    observed.status = 'unknown';
  }

  #startObservedAttachment(chatId: string, observed: ObservedChat): void {
    const connector = this.#projectHostConnectors.get(observed.projectId);
    if (connector === undefined) {
      return;
    }
    const attachment = createActor(hostAttachment, {
      input: {
        chatId,
        connect: async () => connector.connect(chatId),
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
          if (event.type !== 'attachment.attached') {
            this.#answeredLogReads.delete(chatId);
          }
          this.#projectionTopics.get(chatId)?.emit();
          if (event.type === 'attachment.attached') {
            observed.attempts = 0;
            this.#syncProjection(chatId, 'none');
            return;
          }
          const session = this.#sessions.get(chatId);
          if (session?.watchedRunId !== undefined) {
            session.watch?.stop();
            session.watch = undefined;
            session.watchedRunId = undefined;
          }
          if (event.type === 'attachment.refused') {
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
  async #requestTurn(session: InternalSession, gesture: ChatTurnGesture): Promise<void> {
    /* The banner belongs to the request lifecycle, and the gesture is what
     * clears it — the dispatch is an admission away. */
    session.persistenceActorRef.send({ type: 'turnRequested' });
    const owner = session.stateActorRef;
    /* Read before the send: the slot this gesture is about to overwrite. */
    const displaced = owner.getSnapshot().context.pendingGesture;
    owner.send({ type: 'requestTurn', gesture });
    if (owner.getSnapshot().context.pendingGesture !== gesture) {
      /* The chat was disposed under the gesture: its stopped root takes nothing, so the composer keeps the message. */
      await this.#settleComposer(session, gesture, displaced);
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
    await this.#settleComposer(session, gesture, displaced);
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
    if (gesture.kind === 'send' && draftText !== '' && draftText !== composedText(gesture.message)) {
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
  async #restoreDraftMessage(session: InternalSession, message: MyUIMessage, onlyIfEmpty = false): Promise<void> {
    const attachments = message.parts.flatMap((part) =>
      part.type === 'file' ? (attachmentReferenceOf(part) ?? []) : [],
    );
    if (attachments.length > 0) {
      try {
        const binding = await session.composer;
        await Promise.allSettled(
          attachments.map(async (attachment) => {
            if (await binding.record.attachments.has(attachment)) {
              return;
            }
            await binding.chatAttachments.copyTo(binding.record.attachments, attachment);
          }),
        );
      } catch (error) {
        /* The chips come back either way; the person can re-attach what the
         * composer cannot read. Losing the text as well would be worse. */
        console.warn('[ChatSessionStore] a returned message\u2019s attachments could not be re-retained', error);
      }
    }
    if (onlyIfEmpty) {
      const draft = session.draftActorRef.getSnapshot().context;
      if (draft.draftText !== '' || draft.draftAttachments.length > 0) {
        return;
      }
    }
    /* Wholesale: this replaces the displacing send's text and attachments
     * rather than clearing and then restoring over the top of it. */
    session.draftActorRef.send({ type: 'loadDraftFromMessageTransient', draft: message });
    const draft = session.draftActorRef.getSnapshot().context;
    session.composerRecordRef.send({
      type: 'patch',
      fields: { draft: buildDraftMessage(draft.draftText, draft.draftAttachments) },
    });
  }

  /** Hold the composer through an asynchronously confirmed empty Stop. */
  async #restoreStoppedDraft(session: InternalSession, message: MyUIMessage): Promise<void> {
    const restore = this.#restoreDraftMessage(session, message, true);
    session.composerWork.add(restore);
    try {
      await restore;
    } catch (error) {
      console.warn('[ChatSessionStore] stopped draft could not be restored', session.chatId, error);
    } finally {
      session.composerWork.delete(restore);
    }
  }

  /**
   * Carry out what the chat's session actor admitted.
   *
   * The turn is the actor's; the *request* — one AI SDK stream, its retries and
   * its stop — stays the persistence machine's. This is the one wire between
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
      stateActorRef.on('startTurnRequest', ({ request }) => {
        /* Recency counts a taken gesture: a refused one never gets here (L3 D16, LT08). */
        void this.touchChatRecency(
          session.chatId,
          request.kind === 'send' ? (request.message.metadata?.createdAt ?? Date.now()) : Date.now(),
        );
        void this.#dispatchTurn(session, request);
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

  /** Dispatch one admitted command, then let the SDK read only its projected chunks. */
  async #dispatchTurn(session: InternalSession, request: ChatRequest): Promise<void> {
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
    session.recoveredRunId = undefined;
    session.blockedPresentationRunId = undefined;
    session.failedTranscriptProjection = undefined;
    session.activeCommand = command;
    session.watchedRunId = command.payload.runId;
    session.watchedStreamVersion = 0;
    session.commandInFlight = true;
    session.stopRequested = false;
    session.commandAbort?.abort();
    const abort = new AbortController();
    session.commandAbort = abort;
    try {
      const answer = await sendHostCommand(async () => connector.connect(session.chatId), command, {
        signal: abort.signal,
      });
      session.commandInFlight = false;
      if (answer.status === 'refused') {
        throw new Error(`Host ${command.type} refused ${answer.code}: ${answer.message}`);
      }
      if (answer.effect !== 'durable' || this.#sessions.get(session.chatId) !== session || abort.signal.aborted) {
        return;
      }
      const { seedRequestId } = session;
      if (seedRequestId !== undefined && command.type === 'start') {
        session.seedRequestId = undefined;
        session.pendingSeedGesture = undefined;
        if (session.seedMessage?.id !== command.payload.message.id) {
          const seedMessageId = session.seedMessage?.id;
          session.seedMessage = undefined;
          this.#messagePresentations.delete(session.chatId);
          session.chat.messages = session.chat.messages.filter((message) => message.id !== seedMessageId);
        }
        void this.#clearAcceptedSeed(session.chatId, seedRequestId);
      }
      // The Stop callback can flip this while the command awaits its host answer.
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- Stop mutates from another callback during the awaited command.
      if (session.stopRequested) {
        await this.#cancelSessionRun(session);
        return;
      }
      session.watch?.stop();
      if (command.type === 'resume') {
        // The accepted command can answer before the follower folds its new running row.
        // Watching the old terminal attempt would replay its error into the SDK.
        session.watch = undefined;
        session.watchedRunId = undefined;
        this.#syncProjection(session.chatId, 'none');
        return;
      }
      const via =
        request.kind === 'send' && !session.chat.messages.some((message) => message.id === request.message.id)
          ? 'send'
          : request.kind === 'continue'
            ? 'resume'
            : 'regenerate';
      if (request.kind === 'edit') {
        const index = session.chat.messages.findIndex((message) => message.id === request.messageId);
        if (index === -1) {
          throw new Error('That message is no longer in this chat, so it cannot be edited.');
        }
        this.#messagePresentations.delete(session.chatId);
        session.chat.messages = [
          ...session.chat.messages.slice(0, index),
          editedMessage(session.chat.messages[index]!, request),
        ];
      }
      const watchInput: SdkWatchInput = {
        runId: command.payload.runId,
        getProjection: () => this.#projectionContext(session.chatId),
        subscribe: (listener) => this.subscribeProjection(session.chatId, listener),
        transport: session.transport,
        chat: session.chat,
        ...(via === 'send' && request.kind === 'send'
          ? { via, message: request.message }
          : { via: via === 'send' ? 'regenerate' : via }),
      };
      const watch = createActor(sdkWatch, {
        input: watchInput,
        ...this.#rootOptions,
      });
      session.watch = watch;
      watch.start();
    } catch (error) {
      if (abort.signal.aborted) {
        return;
      }
      session.watch?.stop();
      session.watch = undefined;
      session.watchedRunId = undefined;
      session.activeCommand = undefined;
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
    } finally {
      session.commandInFlight = false;
      if (session.commandAbort === abort) {
        session.commandAbort = undefined;
      }
      this.#scheduleRunReleaseIfTerminal(session);
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
    let attention: RowKey | undefined;
    let published: ChatProjection | undefined;
    projection.subscribe(({ context }) => {
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
      presented = key;
      this.#syncProjection(chatId, moved ? 'moved' : 'none');
      this.#projectionTopics.get(chatId)?.emit();
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
   * @param present - `moved`: the current run or its phase changed; `open`: a new machine, shown a run still open;
   * `none`: the run did not move.
   */
  #syncProjection(chatId: string, present: 'moved' | 'open' | 'none'): void {
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
    const hold = session.presentationHold;
    const heldView = hold === undefined ? undefined : projection.views[hold.runId];
    if (
      hold !== undefined &&
      (heldView === undefined ||
        heldView.retired === true ||
        heldView.segmentId !== hold.segmentId ||
        (heldView.streamVersion ?? 0) !== hold.streamVersion ||
        projection.ledger.position.sourceGeneration !== hold.sourceGeneration)
    ) {
      session.presentationHold = undefined;
      this.#messagePresentations.delete(chatId);
    }
    this.#syncTools(session, projection);
    const run = selectCaughtUp(projection) ? selectCurrentRun(projection) : undefined;
    const phase = selectRunPhase(projection);
    const view = run === undefined ? undefined : projection.views[run.runId];
    if (
      session.watchedRunId === run?.runId &&
      (session.watchedSegmentId !== view?.segmentId ||
        (session.watchedStreamVersion ?? 0) !== (view?.streamVersion ?? 0)) &&
      !session.commandInFlight
    ) {
      session.watch?.stop();
      session.watch = undefined;
      session.watchedRunId = undefined;
      session.materializeVersion++;
      void session.chat.stop();
    }
    if (
      run !== undefined &&
      session.watchedRunId !== undefined &&
      session.watchedRunId !== run.runId &&
      !session.commandInFlight
    ) {
      session.watch?.stop();
      session.watch = undefined;
      session.watchedRunId = undefined;
      session.materializeVersion++;
    }
    if (selectCaughtUp(projection)) {
      this.#materializeProjectedTranscript(session, projection);
    }
    if (
      run?.lifecycle === 'cancelled' &&
      run.failure?.code !== 'USER_STOPPED' &&
      session.stopRequested &&
      session.restoredStoppedRunId !== run.runId
    ) {
      session.restoredStoppedRunId = run.runId;
      const view = projection.views[run.runId];
      if (
        view?.user !== undefined &&
        ![...chunksSince(view.chunks)].some((chunk) => !nonOutputChunkTypes.has(chunk.type))
      ) {
        void this.#restoreStoppedDraft(session, view.user);
      }
    }
    if (session.stopRequested && run !== undefined && !opensRun(phase) && phase !== 'paused') {
      session.stopRequested = false;
      this.#chatTopics.get(chatId)?.emit();
    }
    if (
      run !== undefined &&
      opensRun(phase) &&
      view?.user !== undefined &&
      session.watch === undefined &&
      session.watchedRunId === undefined &&
      !session.commandInFlight &&
      !session.stopRequested &&
      !session.persistenceActorRef.getSnapshot().context.isLoadingChat &&
      session.status === 'ready' &&
      !session.recoveringPresentation &&
      session.blockedPresentationRunId !== run.runId
    ) {
      session.transcriptMaterialization = this.#watchProjectedRun(session, projection, run.runId);
    }
    if (run !== undefined && present !== 'none' && (present !== 'open' || opensRun(phase) || phase === 'paused')) {
      this.#presentRun(session, { runId: run.runId, phase, reason: selectRunFailure(projection, run.runId) });
    }
    if (
      session.watchedRunId !== undefined &&
      session.watchedRunId === run?.runId &&
      !opensRun(phase) &&
      phase !== 'paused'
    ) {
      session.watch?.stop();
      session.watch = undefined;
      session.watchedRunId = undefined;
      this.#materializeProjectedTranscript(session, projection);
      this.#scheduleRunReleaseIfTerminal(session);
    }
    if (session.status === 'error') {
      this.#recoverPresentation(session);
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

  /** Reattach a viewed live run through its projection, never through the old host stream. */
  async #watchProjectedRun(session: InternalSession, projection: ChatProjection, runId: string): Promise<void> {
    session.watchedRunId = runId;
    session.watchedSegmentId = projection.views[runId]?.segmentId;
    session.watchedStreamVersion = projection.views[runId]?.streamVersion ?? 0;
    const version = ++session.materializeVersion;
    try {
      const [messages, presentation] = await Promise.all([
        materializeTranscript(projection, runId),
        materializeTranscript(projection),
      ]);
      const current = this.#projectionContext(session.chatId);
      if (
        this.#sessions.get(session.chatId) !== session ||
        session.watchedRunId !== runId ||
        session.materializeVersion !== version ||
        session.status !== 'ready' ||
        current === undefined ||
        !selectCaughtUp(current) ||
        selectCurrentRun(current)?.runId !== runId ||
        !opensRun(selectRunPhase(current))
      ) {
        if (session.watchedRunId === runId && session.materializeVersion === version) {
          session.watchedRunId = undefined;
          if (current !== undefined && selectCaughtUp(current)) {
            this.#materializeProjectedTranscript(session, current);
          }
        }
        return;
      }
      session.presentationHold = {
        messages: this.#retainSeedUntilLogged(session, presentation),
        prefixOffset: messages.length,
        prefix: presentation.slice(messages.length),
        runId,
        segmentId: session.watchedSegmentId,
        streamVersion: session.watchedStreamVersion,
        sourceGeneration: projection.ledger.position.sourceGeneration,
      };
      this.#messagePresentations.delete(session.chatId);
      session.chat.messages = this.#retainSeedUntilLogged(session, messages);
      const watch = createActor(sdkWatch, {
        input: {
          runId,
          getProjection: () => this.#projectionContext(session.chatId),
          subscribe: (listener) => this.subscribeProjection(session.chatId, listener),
          transport: session.transport,
          chat: session.chat,
          via: 'resume',
        },
        ...this.#rootOptions,
      });
      session.watch = watch;
      session.runHeld = true;
      watch.start();
    } catch (error) {
      if (this.#sessions.get(session.chatId) !== session || session.materializeVersion !== version) {
        return;
      }
      if (session.watchedRunId === runId) {
        session.watchedRunId = undefined;
      }
      session.blockedPresentationRunId = runId;
      session.failedTranscriptProjection = projection;
      console.warn('[ChatSessionStore] projected run could not be watched', {
        chatId: session.chatId,
        runId,
        status: session.status,
        cursor: projection.ledger.position.cursor,
        ...presentationErrorFacts(error),
      });
    }
  }

  /** Retire a failed consumer after the SDK has finished its error transition; never execute a host command. */
  #recoverPresentation(session: InternalSession): void {
    const { watch, watchedRunId } = session;
    const current = this.#projectionContext(session.chatId);
    const runId = watchedRunId ?? (current === undefined ? undefined : selectCurrentRun(current)?.runId);
    if (runId === undefined || session.recoveringPresentation) {
      return;
    }
    queueMicrotask(() => {
      const latest = this.#projectionContext(session.chatId);
      if (
        this.#sessions.get(session.chatId) !== session ||
        (latest !== undefined && selectCurrentRun(latest)?.runId !== runId) ||
        session.watch !== watch ||
        session.watchedRunId !== watchedRunId ||
        session.status !== 'error'
      ) {
        return;
      }
      const repeated = session.recoveredRunId === runId;
      session.recoveredRunId = runId;
      session.blockedPresentationRunId = repeated ? runId : undefined;
      session.recoveringPresentation = true;
      session.materializeVersion++;
      watch?.stop();
      session.watch = undefined;
      session.watchedRunId = undefined;
      this.#projections.get(session.chatId)?.send({ type: 'clear-live', runId });
      const projection = this.#projectionContext(session.chatId);
      console.warn('[ChatSessionStore] presentation recovery', {
        chatId: session.chatId,
        runId,
        status: session.status,
        ...presentationErrorFacts(session.chat.error),
        cursor: projection?.ledger.position.cursor,
        mode:
          repeated || projection === undefined || !opensRun(selectRunPhase(projection))
            ? 'durable-only'
            : 'retry-watch',
        phase: projection === undefined ? 'unknown' : selectRunPhase(projection),
      });
      session.chat.clearError();
      session.recoveringPresentation = false;
      this.#syncProjection(session.chatId, 'none');
    });
  }

  /** A startup request is chat-record-owned only while the host log has no user turn. */
  #retainSeedUntilLogged(session: InternalSession, messages: MyUIMessage[]): MyUIMessage[] {
    const seed = session.seedMessage;
    if (seed === undefined) {
      return messages;
    }
    if (messages.some((message) => message.role === 'user')) {
      session.seedMessage = undefined;
      return messages;
    }
    return [...messages, seed];
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

  /** Version async SDK materialization so only the newest caught-up log can replace a ready transcript. */
  #materializeProjectedTranscript(session: InternalSession, projection: ChatProjection): void {
    if (
      !this.#hasDisplayAuthority(session.chatId, projection) ||
      (session.status !== 'ready' && session.status !== 'error') ||
      session.watchedRunId !== undefined ||
      session.recoveringPresentation ||
      (session.failedTranscriptProjection?.views === projection.views &&
        session.failedTranscriptProjection.remote?.views === projection.remote?.views) ||
      (session.transcriptSource?.views === projection.views &&
        session.transcriptSource.remote?.views === projection.remote?.views &&
        session.transcriptSourceVersion === session.materializeVersion)
    ) {
      return;
    }
    const version = ++session.materializeVersion;
    session.transcriptSource = projection;
    session.transcriptSourceVersion = version;
    session.transcriptMaterialization = this.#applyProjectedTranscript(session, projection, version);
  }

  async #applyProjectedTranscript(
    session: InternalSession,
    projection: ChatProjection,
    version: number,
  ): Promise<void> {
    try {
      const messages = await materializeTranscript(projection);
      if (
        this.#sessions.get(session.chatId) === session &&
        this.#hasDisplayAuthority(session.chatId, projection) &&
        (session.status === 'ready' || session.status === 'error') &&
        session.watchedRunId === undefined &&
        session.materializeVersion === version
      ) {
        session.presentationHold = undefined;
        const retained = this.#retainSeedUntilLogged(session, messages);
        const previous = session.chat.messages;
        if (previous.length !== retained.length || retained.some((message, index) => message !== previous[index])) {
          this.#messagePresentations.delete(session.chatId);
          session.chat.messages = retained;
        }
        session.failedTranscriptProjection = undefined;
      }
    } catch (error) {
      if (this.#sessions.get(session.chatId) !== session || session.materializeVersion !== version) {
        return;
      }
      session.failedTranscriptProjection = projection;
      console.warn('[ChatSessionStore] projected transcript could not be materialized', {
        chatId: session.chatId,
        runId: selectCurrentRun(projection)?.runId,
        status: session.status,
        cursor: projection.ledger.position.cursor,
        ...presentationErrorFacts(error),
      });
    }
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
    // Defensive aliases so closures bound to the AI SDK's internal scheduler
    // always read through `this.#deps` (the latest provider snapshot).
    const depsRef = (): ChatSessionDeps => this.#deps;

    // oxlint-disable-next-line eslint/prefer-const -- initialised only after the actor/chat callbacks that close over it are constructed.
    let session: InternalSession;

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

    const readChatRow = async (id: string): Promise<ChatEntity | undefined> => depsRef().getChat(id, projectId);

    const persistenceActorRef = createActor(
      chatPersistenceMachine.provide({
        actors: {
          loadChatActor: createAsyncLogic({
            run: async ({ input, signal }) => {
              const loadedChat = await readChatRow(input.chatId);
              signal.throwIfAborted();
              if (this.#sessions.get(input.chatId) !== session) {
                return { chat: undefined };
              }

              if (!loadedChat) {
                if (session.chat.messages.length === 0) {
                  this.#messagePresentations.delete(session.chatId);
                  session.chat.messages = [];
                }
                session.draftActorRef.send({ type: 'initializeFromChat' });

                return { chat: undefined };
              }

              /* Splice, never replace and never skip. The live `Chat` may already
               * hold messages this load never saw — a brand-new chat that is
               * already in-flight, a host reattach that rebuilt from the log, a
               * reconciled durable user row — and overwriting them is the classic
               * "load wipes in-flight messages" race. But *skipping* the load when
               * they are there loses the other side: a session recreated by the
               * shell's remount starts with an empty `Chat` and reads its history
               * asynchronously, so a submit landing inside that read dropped every
               * earlier turn for good — nothing reads the row twice, and a
               * browser-placed chat has no reattach to rebuild it from the log.
               * Ids are shared with the log's own derivation (P26), so keeping the
               * row's messages this transcript does not already name can only add
               * history, never a second copy of it. */
              const inFlight = session.chat.messages;
              const inFlightIds = new Set(inFlight.map((message) => message.id));
              this.#messagePresentations.delete(session.chatId);
              session.chat.messages = [
                ...loadedChat.messages.filter((message) => !inFlightIds.has(message.id)),
                ...inFlight,
              ];

              const lastMessage = session.chat.messages.at(-1);
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
                void this.#refreshRemoteSegmentsSafely(input.chatId, session.projectId);
                this.startPendingSeed(input.chatId);
                return { chat: { ...loadedChat, error: undefined } };
              }

              session.draftActorRef.send({ type: 'initializeFromChat' });
              return { chat: loadedChat };
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
          persistActiveExecutionActor: createAsyncLogic({
            run: async ({ input }) => {
              await depsRef().patchChat(input.chatId, 'activeExecution', input.activeExecution);
            },
          }),
          persistActiveKernelActor: createAsyncLogic({
            run: async ({ input }) => {
              await depsRef().patchChat(input.chatId, 'activeKernel', input.activeKernel);
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
    });

    const transport = new BrowserPlacementChatTransport<MyUIMessage>();
    const chat = createChatInstance({
      chatId,
      transport,
      /* The SDK closes a view stream; only the projected host log ends a run. */
      onFinish: () => undefined,
      // SDK watch errors are presentation-local. The host log owns durable
      // run failure; a retired stream callback must not rewrite chat.error.
      onError: () => undefined,
    });

    // Wire the AI SDK Chat's snapshot callbacks into per-chatId subscriber
    // sets. `~registerMessagesCallback` etc. are public (the `~` prefix is
    // the AI SDK's "internal-but-intended-for-subscribers" marker — see
    // node_modules/@ai-sdk/react/dist/index.d.ts).
    const unregisterMessages = chat['~registerMessagesCallback'](() => {
      if (
        session.presentationHold !== undefined &&
        includesPresentedPrefix(chat.messages, session.presentationHold.prefix, session.presentationHold.prefixOffset)
      ) {
        session.presentationHold = undefined;
      }
      this.#chatTopics.get(chatId)?.emit();
    });
    const unregisterStatus = chat['~registerStatusCallback'](() => {
      const next = chat.status;
      if (session.status !== next) {
        session.status = next;
        if (next === 'error') {
          this.#recoverPresentation(session);
        }
        if (next === 'ready') {
          const projection = this.#projectionContext(chatId);
          if (projection !== undefined && selectCaughtUp(projection)) {
            this.#syncProjection(chatId, 'none');
          }
        }
      }
      this.#chatTopics.get(chatId)?.emit();
    });
    const unregisterError = chat['~registerErrorCallback'](() => {
      this.#chatTopics.get(chatId)?.emit();
    });

    persistenceActorRef.start();
    draftActorRef.start();
    composerRecordRef.start();

    // oxlint-disable-next-line eslint/prefer-const -- assigned after `session.dispose` captures it so immediate actor emissions cannot observe a partial session.
    let lifecycleSubscription: { unsubscribe: () => void } | undefined;
    let loading: 'before' | 'loading' | 'loaded' = 'before';
    const chatRoot = createActor(this.#chatSessionLogic, { ...this.#rootOptions, input: { chatId, projectId } });
    session = {
      chatId,
      chat,
      get messages() {
        return session.presentationHold?.messages ?? chat.messages;
      },
      transport,
      projectId,
      chatRoot,
      stateActorRef: chatRoot,
      persistenceActorRef,
      draftActorRef,
      composerRecordRef,
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
      watch: undefined,
      watchedRunId: undefined,
      watchedSegmentId: undefined,
      watchedStreamVersion: undefined,
      presentationHold: undefined,
      materializeVersion: 0,
      transcriptMaterialization: undefined,
      recoveredRunId: undefined,
      blockedPresentationRunId: undefined,
      recoveringPresentation: false,
      failedTranscriptProjection: undefined,
      transcriptSource: undefined,
      transcriptSourceVersion: 0,
      commandInFlight: false,
      stopRequested: false,
      stopOrigin: undefined,
      refreshDeferred: false,
      restoredStoppedRunId: undefined,
      status: chat.status,
      turnSubscriptions: [],
      dispose: () => {
        session.presentationHold = undefined;
        session.observationRelease?.();
        session.observationRelease = undefined;
        for (const subscription of session.turnSubscriptions) {
          subscription.unsubscribe();
        }
        session.turnSubscriptions = [];
        recordLoadedSubscription.unsubscribe();
        session.commandAbort?.abort();
        session.watch?.stop();
        lifecycleSubscription?.unsubscribe();
        unregisterMessages();
        unregisterStatus();
        unregisterError();
      },
    };

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

  #scheduleRunReleaseIfTerminal(session: InternalSession): void {
    queueMicrotask(() => {
      if (!session.runHeld || session.watchedRunId !== undefined || session.commandInFlight) {
        return;
      }
      session.runHeld = false;
      session.activeCommand = undefined;
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
    this.#projections.delete(chatId);
    this.#answeredLogReads.delete(chatId);
    this.#validatedDisplays.delete(actor);
    this.#messagePresentations.delete(chatId);
    this.#historicalUsage.delete(chatId);
    this.#stopRemoteObservationIfUnused(chatId);
    this.#remoteReadCompletedVersions.delete(chatId);
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

  async #readRemoteSegments(chatId: string, projectId: string, fence?: ObservationRead): Promise<void> {
    if (this.#observed.get(chatId)?.projectId !== projectId && this.#sessions.get(chatId)?.projectId !== projectId) {
      return;
    }
    const version = (this.#remoteReadVersions.get(chatId) ?? 0) + 1;
    this.#remoteReadVersions.set(chatId, version);
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
    const segments = await Promise.all(
      entries
        .filter((name) => /^[^/]+\.jsonl$/.test(name))
        .map(async (name) => ({
          deviceId: name,
          bytes: await this.#readForeignSegment(`${directory}/${name}`, client),
        })),
    );
    if (
      this.#remoteReadVersions.get(chatId) === version &&
      this.#deps.client === client &&
      (fence === undefined || fence.isCurrent()) &&
      (this.#observed.get(chatId)?.projectId === projectId || this.#sessions.get(chatId)?.projectId === projectId)
    ) {
      this.#remoteReadCompletedVersions.set(chatId, version);
      this.#projectionOf(chatId).send({ type: 'remote', segments });
      const session = this.#sessions.get(chatId);
      if (session?.pendingSeedGesture !== undefined) {
        session.seedRemoteReadVersion = version;
        this.startPendingSeed(chatId);
      }
    }
  }
}
