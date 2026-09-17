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
 * - `acquire(chatId)` / `release(chatId)` track React views only.
 * - `startRun(chatId)` owns the session independently while a request is
 *   active, so navigation cannot stop its transport or persistence actor.
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
import type { ChatStatus } from 'ai';
import { Topic } from '@taucad/events';
import { z } from 'zod';
import { createActor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { CadAgentExecution, Chat as ChatEntity, MyUIMessage } from '@taucad/chat';
import { isAnyToolPart } from '@taucad/chat';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import type { ChatSessionActorRef } from '#machines/chat-session.machine.js';
import type { ProjectSessionActorRef } from '#machines/project-session.machine.js';
import { chatPersistenceMachine } from '#hooks/chat-persistence.machine.js';
import type { ChatRequest } from '#hooks/chat-persistence.machine.js';
import { buildDraftMessage, draftMachine } from '#hooks/draft.machine.js';
import { createComposerRecordActor, draftHydrationOf, draftPersistenceFor } from '#hooks/composer-record.js';
import type { ComposerRecordRef } from '#hooks/composer-record.js';
import { composerRecordPaths, createComposerRecordStore } from '#db/composer-record-store.js';
import type { ComposerRecordClient } from '#db/composer-record-store.js';
import { createChatAttachmentStore } from '#db/attachment-store.js';
import type { AttachmentReference } from '#utils/attachment.utils.js';
import {
  deferredRecordStore,
  referencedAttachments,
  removeRecord,
  stopWhenWritesSettle,
} from '#services/chat-session-store-composer.js';
import type { ComposerBinding, UnreadRecord } from '#services/chat-session-store-composer.js';
import { resizeImageActor } from '#hooks/resize-image.actor.js';
import { inspect } from '#machines/inspector.js';
import { clearLedger } from '#services/rpc-ledger.js';
import { parseErrorForPersistence } from '#utils/error.utils.js';
import { buildUserMessage, finalizeInterruptedToolParts, stampMessageCreatedAt } from '#utils/chat.utils.js';
import {
  bindDurableChatRun,
  createChatInstance,
  getBoundDurableChatRunId,
} from '#chat-clients/_internal/shared-chat-transport.js';
import {
  getHostTurnSettlement,
  isBrowserAgentHostPlaced,
  isBrowserAgentHostRunResumable,
  registerAgentHostRunReset,
  requestBrowserAgentHostResume,
  subscribeHostTurnSettlements,
} from '#chat-clients/_internal/browser-agent-host-transport.js';
import type { HostTurnSettlement } from '#chat-clients/_internal/browser-agent-host-transport.js';
import type { CommitCancelledDraftRestoreInput } from '#types/storage.types.js';
import { ENV } from '#environment.config.js';

const admissionEnvelopeSchema = z.strictObject({
  version: z.literal(1),
  idempotencyKey: z.string().min(1),
});

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

export type ChatSessionDeps = {
  getChat: (chatId: string) => Promise<ChatEntity | undefined>;
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
};

export type ChatSession = {
  readonly chatId: string;
  readonly chat: Chat<MyUIMessage>;
  readonly persistenceActorRef: ActorRefFrom<typeof chatPersistenceMachine>;
  readonly draftActorRef: ActorRefFrom<typeof draftMachine>;
  /**
   * This chat's composer record on this device (D2): draft, edits, tool choice
   * and mode. A surface mounts `useComposerRecordToasts` on it.
   */
  readonly composerRecordRef: ComposerRecordRef;
  /**
   * This chat's state in the agent-state vocabulary (D32, S45).
   *
   * The store keeps the AI SDK `Chat`, its transport and its persistence; the
   * machine is the one derivation of what the person is told — every row of
   * the architecture's agent-state table is one of its states. The sidebar
   * (W20) and the Agents pane read this, never the flags behind it.
   */
  /* Not readonly: the owner changes when a project session opens or closes. */
  stateActorRef: ChatSessionActorRef | undefined;
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

/**
 * Slices the message tail so a subsequent `chat.regenerate(...)` re-runs
 * the assistant turn after the retried message. Model overrides (e.g. "Try
 * with a different model") travel via `request.body.agent.execution` composed
 * by `useCadChatClient.retry`, not by mutating persisted metadata.
 */
function buildRetryMessages(
  messages: MyUIMessage[],
  request: Extract<ChatRequest, { kind: 'retry' }>,
): MyUIMessage[] | undefined {
  const messageIndex = messages.findIndex((m) => m.id === request.messageId);
  if (messageIndex === -1) {
    return undefined;
  }
  return messages.slice(0, messageIndex);
}

function buildDraftFromUserMessage(message: MyUIMessage): MyUIMessage {
  return {
    id: 'draft',
    role: 'user',
    parts: message.parts.filter((part) => part.type === 'text' || part.type === 'file'),
    metadata: {
      createdAt: Date.now(),
      status: 'pending',
    },
  };
}

function buildPendingTailDraftRestore(messages: readonly MyUIMessage[]):
  | {
      userMessage: MyUIMessage;
      truncatedMessages: MyUIMessage[];
    }
  | undefined {
  const last = messages.at(-1);
  if (last?.role === 'user' && last.metadata?.status === 'pending') {
    return {
      userMessage: last,
      truncatedMessages: messages.slice(0, -1),
    };
  }

  if (last?.role !== 'assistant' || last.parts.length > 0) {
    return undefined;
  }

  const userMessage = messages.at(-2);
  if (userMessage?.role !== 'user' || userMessage.metadata?.status !== 'pending') {
    return undefined;
  }

  return {
    userMessage,
    truncatedMessages: messages.slice(0, -2),
  };
}

function countPersistMilestones(message: MyUIMessage): number {
  let count = 0;
  for (const part of message.parts) {
    if (isAnyToolPart(part) && (part.state === 'output-available' || part.state === 'output-error')) {
      count += 1;
      continue;
    }

    if (part.type === 'text' && 'state' in part && part.state === 'done') {
      count += 1;
      continue;
    }

    if (part.type === 'reasoning' && 'state' in part && part.state === 'done') {
      count += 1;
    }
  }

  return count;
}

/**
 * The whole tool picture of one chat, in one pass.
 *
 * The `chat-session` machine takes tool state batched per transport event
 * (F8) — one frame for a fifty-part turn, never one per delta — so this is
 * what the store hands it.
 *
 * @param messages - The chat's transcript.
 * @returns How many tool parts are running and how many wait for approval.
 */
function countToolParts(messages: readonly MyUIMessage[]): { inFlight: number; approvals: number; toolName?: string } {
  let inFlight = 0;
  let approvals = 0;
  let toolName: string | undefined;
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isAnyToolPart(part)) {
        continue;
      }
      if (part.state === 'approval-requested') {
        approvals += 1;
      } else if (part.state === 'input-streaming' || part.state === 'input-available') {
        inFlight += 1;
        toolName = part.type === 'dynamic-tool' ? part.toolName : part.type.replace(/^tool-/u, '');
      }
    }
  }
  return { inFlight, approvals, ...(toolName === undefined ? {} : { toolName }) };
}

function hasPendingApproval(messages: readonly MyUIMessage[]): boolean {
  return messages.some((message) =>
    message.parts.some((part) => isAnyToolPart(part) && part.state === 'approval-requested'),
  );
}

// ---------------------------------------------------------------------------
// ChatSessionStore
// ---------------------------------------------------------------------------

/**
 * Composes one per-request wire body, admitting the chat's durable workspace on
 * the way. Owned by the profile-scoped chat client; called by the store only for
 * dispatches that carry no body of their own.
 *
 * @param execution - Compose the turn from this execution instead of the one
 * the client's React tree currently holds. The seeded first turn passes the
 * execution of the row it just consumed, which the tree has not hydrated yet.
 * @public
 */
export type LatestAgentBodyFactory = (execution?: CadAgentExecution) => Promise<Readonly<Record<string, unknown>>>;

type InternalSession = ChatSession & {
  /** React/view consumers currently observing this session. */
  viewRefcount: number;
  /** Non-view ownership held while one logical run is active. */
  runHeld: boolean;
  /** Exact server-authoritative run selected by project reload discovery. */
  durableRunId: string | undefined;
  durableRunState: 'reattaching' | 'active' | 'terminal' | undefined;
  /** Host this session has already reattached to; see `reattachHostChat`. */
  reattachedHostId: string | undefined;
  /**
   * This load dispatched the chat's seeded first turn, so the host stream is
   * this page's own and there is nothing to reattach to; see
   * {@link ChatSessionStore.reattachHostChat}.
   */
  seededDispatch: boolean;
  /** Immutable wire body for the active logical run, including admission. */
  activeRunBody: Readonly<Record<string, unknown>> | undefined;
  status: ChatStatus;
  /**
   * How the active profile-scoped chat client composes a per-request body for
   * this chat. Published via {@link ChatSessionStore.setLatestAgentBody} from
   * `useCadChatClient`. The `dispatchRequest` listener calls it when a request
   * enters the persistence machine without an explicit `body` (the
   * startup-request hydration regenerate in `loadChatActor`), so the seeded turn
   * admits the same workspace an explicit submit would — a stored snapshot
   * could name a workspace that a later `prepare` had already discarded.
   */
  latestAgentBody: LatestAgentBodyFactory | undefined;
  /** Bodyless startup/continue dispatches waiting for the profile client to publish its body factory. */
  latestAgentBodyWaiters: Set<(compose: LatestAgentBodyFactory | undefined) => void>;
  /** The project this chat belongs to; its session owns the run accounting. */
  projectId: string | undefined;
  /** What was last handed to `stateActorRef`, so nothing is sent twice. */
  lastState: {
    phase?: ChatRunPhase;
    inFlight: number;
    approvals: number;
    toolName?: string;
    durable?: string;
    lifecycle?: string;
  };
  /**
   * The chat's record store and project, once its project is known. The record
   * actor exists from the first frame; its I/O waits for this (D7).
   */
  composer: Promise<ComposerBinding | undefined>;
  /** Settle {@link InternalSession.composer}; only the first call counts. */
  bindComposer: (projectId: string | undefined) => void;
  /** Composer work that must reach the record before its actor stops (a cancelled-draft restore). */
  composerWork: Set<Promise<unknown>>;
  /** Cleanups for the per-chat subscriptions wired up at session creation. */
  dispose: () => void;
};

/** The run phases the store reports, the SDK's plus the person's own stop. */
type ChatRunPhase = 'admitted' | 'running' | 'completed' | 'failed' | 'cancelled';

export type ChatSessionLivenessSnapshot = Readonly<{
  projects: Readonly<Record<string, readonly string[]>>;
  chats: Readonly<
    Record<
      string,
      Readonly<{
        projectId: string | undefined;
        status: ChatStatus;
        phase: ChatRunPhase | undefined;
        machineState: unknown;
        activeRunId: string | undefined;
        pendingSettlement: unknown;
      }>
    >
  >;
}>;

type ChatSessionLivenessDebugGlobal = typeof globalThis & {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- fixed debug bridge read by browser E2E.
  __TAU_CHAT_SESSION_LIVENESS__?: () => ChatSessionLivenessSnapshot;
};

const runPhaseOf = (status: ChatStatus): Exclude<ChatRunPhase, 'cancelled'> | undefined => {
  switch (status) {
    case 'submitted': {
      return 'admitted';
    }
    case 'streaming': {
      return 'running';
    }
    case 'error': {
      return 'failed';
    }
    default: {
      return undefined;
    }
  }
};

export class ChatSessionStore {
  readonly #sessions = new Map<string, InternalSession>();
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
  #settlementUnsubscribe: (() => void) | undefined;
  /** The project whose chats are being acquired right now. */
  #focusedProjectId: string | undefined;
  /** The chat the person has in front of them (R3); only it counts as attended. */
  #focusedChatId: string | undefined;
  readonly #membershipTopic = new Topic<void>({ name: 'ChatSessionStore.membership' });
  readonly #chatTopics = new Map<string, Topic<void>>();
  readonly #statusTopics = new Map<string, Topic<void>>();
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

  public constructor() {
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
          const state = session.stateActorRef?.getSnapshot();
          return [
            chatId,
            {
              projectId: session.projectId,
              status: session.status,
              phase: session.lastState.phase,
              machineState: state?.value,
              activeRunId: state?.context.activeRunId,
              pendingSettlement: state?.context.pendingSettlement,
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
    this.#deps = deps;
  }

  /** Replace an idle live transcript with the chat log just projected from Git. */
  public async refreshFromStorage(chatId: string): Promise<void> {
    const session = this.#sessions.get(chatId);
    if (session?.status !== 'ready') {
      return;
    }
    const chat = await this.#deps.getChat(chatId);
    const current = this.#sessions.get(chatId);
    if (chat && current === session && current.status === 'ready') {
      current.chat.messages = chat.messages;
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
   * @param projectId - Known owner; defaults to the focused project for existing callers.
   * @returns The retained chat session.
   */
  public acquire(chatId: string, projectId = this.#focusedProjectId): ChatSession {
    const existing = this.#sessions.get(chatId);
    if (existing) {
      existing.viewRefcount += 1;
      return existing;
    }

    const session = this.#createSession(chatId, projectId);
    this.#sessions.set(chatId, session);
    this.#refreshSnapshot();
    this.#notifyMembership();
    return session;
  }

  /**
   * Rehydrate an API-discovered durable run without acquiring a React view.
   * Its non-view hold keeps the session alive while the exact run resumes.
   */
  public retainDurableRun(input: {
    readonly chatId: string;
    readonly runId: string;
    readonly state?: 'active' | 'terminal';
  }): ChatSession {
    bindDurableChatRun(input.chatId, input.runId);
    const existing = this.#sessions.get(input.chatId);
    if (existing) {
      const runChanged = existing.durableRunId !== input.runId;
      const priorState = existing.durableRunState;
      const nextState = !runChanged && priorState === 'terminal' ? 'terminal' : (input.state ?? 'reattaching');
      const shouldResume =
        nextState !== 'terminal' &&
        existing.status === 'ready' &&
        !existing.persistenceActorRef.getSnapshot().context.isLoadingChat &&
        (runChanged || priorState === undefined);
      existing.runHeld = true;
      existing.durableRunId = input.runId;
      existing.durableRunState = nextState;
      this.#statusTopics.get(input.chatId)?.emit();
      if (shouldResume) {
        queueMicrotask(() => {
          if (
            this.#sessions.get(input.chatId) === existing &&
            existing.durableRunId === input.runId &&
            existing.durableRunState !== 'terminal'
          ) {
            void existing.chat.resumeStream();
          }
        });
      }
      return existing;
    }
    const session = this.#createSession(input.chatId, this.#focusedProjectId);
    session.viewRefcount = 0;
    session.runHeld = true;
    session.durableRunId = input.runId;
    session.durableRunState = input.state ?? 'reattaching';
    this.#sessions.set(input.chatId, session);
    this.#refreshSnapshot();
    this.#notifyMembership();
    return session;
  }

  /**
   * Reattach one host-placed chat to its host's durable log.
   *
   * Reload discovery substantiates a run from this browser's *workspace claim*
   * (`ProjectChatRpcBindings` → {@link ChatSessionStore.retainDurableRun}). A
   * chat placed on a daemon writes no claim — the daemon owns its workspace,
   * its files and its tools — so nothing ever retained its run, the load-time
   * resume gate never opened, and a reloaded page rebuilt its transcript from
   * local storage while the daemon finished the turn unattended.
   *
   * The host's log is the authority (PH19) and the transport resolves the run
   * from it, so the trigger here is the *placement*, not a run id. Idempotent
   * per host: the caller is the host registration effect, which re-runs
   * whenever the per-turn agent config changes.
   *
   * A chat whose seeded first turn *this load* dispatched is excluded: that
   * dispatch is already the host stream, and reattaching over it opened a
   * second one — on rung 2, a second relay session, refused by a capacity-1
   * daemon with 409 BUSY before the seeded turn had run at all. `status` alone
   * does not cover it: the registration effect can observe `ready` in the same
   * tick the dispatch is queued.
   *
   * @param input - The chat and the host it is placed on.
   */
  public reattachHostChat(input: { readonly chatId: string; readonly hostId: string }): void {
    const session = this.#sessions.get(input.chatId);
    if (
      !session ||
      session.reattachedHostId === input.hostId ||
      session.seededDispatch ||
      session.status !== 'ready' ||
      session.persistenceActorRef.getSnapshot().context.isLoadingChat
    ) {
      // Marked only when it actually reattaches, so a later registration pass
      // still reattaches a chat that was loading or busy on this one.
      return;
    }
    session.reattachedHostId = input.hostId;
    queueMicrotask(() => {
      if (this.#sessions.get(input.chatId) === session) {
        void session.chat.resumeStream();
      }
    });
  }

  /** Release reload-discovery ownership after project-wide settlement. */
  public releaseDurableRun(input: { readonly chatId: string; readonly runId: string }): void {
    const session = this.#sessions.get(input.chatId);
    if (!session || session.durableRunId !== input.runId) {
      return;
    }
    session.durableRunId = undefined;
    session.durableRunState = undefined;
    this.#disposeIfUnreferenced(session);
  }

  /** Idempotently restore the canonical user row ahead of its durable assistant run. */
  public reconcileDurableUserMessage(input: {
    readonly chatId: string;
    readonly runId: string;
    readonly message: MyUIMessage;
  }): boolean {
    const session = this.#sessions.get(input.chatId);
    if (!session || session.durableRunId !== input.runId || input.message.role !== 'user') {
      return false;
    }
    const existingIndex = session.chat.messages.findIndex((message) => message.id === input.message.id);
    if (existingIndex === -1) {
      const assistantIndex = session.chat.messages.findIndex(
        (message) => message.role === 'assistant' && message.id === input.runId,
      );
      const insertAt = assistantIndex === -1 ? session.chat.messages.length : assistantIndex;
      session.chat.messages = [
        ...session.chat.messages.slice(0, insertAt),
        input.message,
        ...session.chat.messages.slice(insertAt),
      ];
    } else {
      if (session.chat.messages[existingIndex] === input.message) {
        return false;
      }
      session.chat.messages = session.chat.messages.with(existingIndex, input.message);
    }
    session.persistenceActorRef.send({ type: 'queuePersist', messages: session.chat.messages });
    return true;
  }

  public release(chatId: string): void {
    const session = this.#sessions.get(chatId);
    if (!session) {
      return;
    }
    session.viewRefcount -= 1;
    this.#disposeIfUnreferenced(session);
  }

  public get(chatId: string): ChatSession | undefined {
    return this.#sessions.get(chatId);
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

  public getStatus(chatId: string): ChatStatus | undefined {
    return this.#sessions.get(chatId)?.status;
  }

  public getDurableRunState(chatId: string): InternalSession['durableRunState'] {
    return this.#sessions.get(chatId)?.durableRunState;
  }

  public getDurableRunId(chatId: string): string | undefined {
    return this.#sessions.get(chatId)?.durableRunId;
  }

  public subscribeStatus(chatId: string, listener: () => void): () => void {
    return this.#addPerChatListener({ bucket: this.#statusTopics, namePrefix: 'status', chatId, listener });
  }

  /**
   * Publish how the active profile-scoped chat client (`useCadChatClient`
   * today, future name/commit clients tomorrow) composes a per-request body for
   * this chat. The `dispatchRequest` listener inside `#createSession` calls it
   * when a request hits the persistence machine without an explicit `body`
   * (notably the startup-request hydration regenerate — see `loadChatActor`).
   *
   * A factory, not a snapshot: composing at dispatch time is what makes the
   * seeded first turn admit the workspace it is about to write to.
   */
  public setLatestAgentBody(chatId: string, compose: LatestAgentBodyFactory | undefined): void {
    const session = this.#sessions.get(chatId);
    if (!session) {
      return;
    }
    session.latestAgentBody = compose;
    if (!compose) {
      return;
    }
    for (const resolve of session.latestAgentBodyWaiters) {
      resolve(compose);
    }
    session.latestAgentBodyWaiters.clear();
  }

  /**
   * Begin non-view ownership for one logical run and return its immutable,
   * versioned wire body. Repeated calls while the persistence machine
   * preempts or retries a run keep one hold but may replace the active body
   * when a newly admitted user operation supplies its own idempotency key.
   */
  public startRun(chatId: string, body: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    const session = this.#sessions.get(chatId);
    if (!session) {
      throw new Error(`ChatSessionStore: cannot start a run for inactive chat ${chatId}`);
    }

    const { projectId } = body;
    if (typeof projectId === 'string' && this.#projectSessions.has(projectId)) {
      this.#rebindSessionProject(session, projectId);
    }
    const admittedBody = this.#withAdmission(body);
    session.runHeld = true;
    session.activeRunBody = admittedBody;
    return admittedBody;
  }

  /** Release a direct run that failed before AI SDK could emit `onFinish`. */
  public endRun(chatId: string): void {
    const session = this.#sessions.get(chatId);
    if (!session || !session.runHeld) {
      return;
    }
    session.runHeld = false;
    session.activeRunBody = undefined;
    this.#disposeIfUnreferenced(session);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Register one live project's session, or forget it when it closes.
   *
   * Every live project's binding calls this — not only the focused one — so a
   * chat machine exists for every chat of every live project (R2, R12's
   * precondition). The store never creates a `chat-session` actor itself:
   * they are children of their project session (I23).
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
      this.#settlementUnsubscribe ??= subscribeHostTurnSettlements((event) => {
        this.#observeHostTurnSettlement(event);
      });
    }
    for (const session of this.#sessions.values()) {
      if (session.projectId !== projectId) {
        continue;
      }
      if (ref === undefined) {
        session.stateActorRef = undefined;
        continue;
      }
      ref.send({ type: 'openChat', chatId: session.chatId });
      session.stateActorRef = ref.getSnapshot().context.chatRefs[session.chatId];
      session.lastState = { inFlight: 0, approvals: 0 };
      this.#replayPersistedFailure(session);
      this.#replayPersistedSettlement(session);
      this.#syncChatState(session);
      this.#restoreUnread(session);
    }
    if (this.#projectSessions.size === 0) {
      this.#settlementUnsubscribe?.();
      this.#settlementUnsubscribe = undefined;
    }
  }

  /**
   * Say which project's chats are being acquired now.
   *
   * A chat is acquired from inside its own project's route, so the focused
   * project is the chat's project. Sessions created before any project was
   * focused are adopted here rather than left without a machine.
   *
   * @param projectId - The focused project, or `undefined` on leaving.
   * @public
   */
  public setFocusedProject(projectId: string | undefined): void {
    this.#focusedProjectId = projectId;
    if (projectId === undefined) {
      return;
    }
    for (const session of this.#sessions.values()) {
      session.projectId ??= projectId;
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

  /** Tell a chat the person is looking at it, so `unread` clears (S45) — in its machine and its record (D9). @public */
  public markViewed(chatId: string): void {
    const session = this.#sessions.get(chatId);
    session?.stateActorRef?.send({ type: 'viewed' });
    if (session !== undefined) {
      void this.#setUnreadWhenBound(session.composer, chatId, false);
    }
  }

  /**
   * Stop this chat's run, through the one dispatcher that owns it (P63).
   *
   * *Stop* in the sidebar and *Stop* in the composer are the same verb, so
   * they go to the same place: the persistence machine's `stopRequest`, which
   * aborts the request, settles the run and releases its lease. The chat's own
   * machine only records that the person stopped it.
   *
   * @param chatId - The chat whose run should stop.
   * @public
   */
  public stopRun(chatId: string): void {
    this.#sessions.get(chatId)?.persistenceActorRef.send({ type: 'stopRequest' });
  }

  /**
   * Whether this chat is unread on this device, as its project's unread record
   * says (D9). The restore source for the chat's machine.
   *
   * @param chatId - A chat with a live session.
   * @returns `true` once the record, or this store, has marked it unread.
   * @public
   */
  public isUnread(chatId: string): boolean {
    const projectId = this.#sessions.get(chatId)?.projectId;
    return projectId !== undefined && (this.#unreadRecords.get(projectId)?.chats.has(chatId) ?? false);
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
    // A released chat's record may still be landing its last write; removing under it would bring the file back.
    await this.#composerDrains.get(chatId);
    const session = this.#sessions.get(chatId);
    if (session === undefined) {
      return;
    }
    await this.#setUnreadWhenBound(session.composer, chatId, false);
    await removeRecord(session.composerRecordRef);
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
  public async promoteDraftAttachments(chatId: string, attachments: readonly AttachmentReference[]): Promise<void> {
    if (attachments.length === 0) {
      return;
    }
    const session = this.#sessions.get(chatId);
    if (session === undefined) {
      throw new Error(`ChatSessionStore: cannot send attachments from inactive chat ${chatId}`);
    }
    const binding = await session.composer;
    if (binding === undefined) {
      throw new Error(`Chat ${chatId} belongs to no project, so its attachments cannot be sent.`);
    }
    const { record, chatAttachments } = binding;
    const copies = await Promise.allSettled(
      attachments.map(async (attachment) => {
        // A blob the chat already holds is skipped, so an edit re-referencing a sent attachment moves nothing.
        if (await chatAttachments.has(attachment)) {
          return undefined;
        }
        await record.attachments.copyTo(chatAttachments, attachment);
        return attachment;
      }),
    );
    const failure = copies.find((copy) => copy.status === 'rejected');
    if (failure !== undefined) {
      // Nothing was sent, so nothing references what this send copied; the chat ref would otherwise carry it.
      const copied = copies.flatMap((copy) => (copy.status === 'fulfilled' && copy.value ? [copy.value] : []));
      await Promise.allSettled(copied.map(async (attachment) => chatAttachments.remove(attachment)));
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
    await binding?.record.attachments.retainOnly(referencedAttachments(session.draftActorRef.getSnapshot().context));
  }

  /** This project's unread record actor, created and read on first use. */
  #unreadRecord(projectId: string): UnreadRecord {
    const existing = this.#unreadRecords.get(projectId);
    if (existing) {
      return existing;
    }
    const ref = createComposerRecordActor(
      createComposerRecordStore(this.#deps.client, composerRecordPaths.unread(projectId)),
    );
    const unread: UnreadRecord = { ref, chats: new Set(), clearedBeforeLoad: new Set(), loaded: false };
    ref.on('recordLoaded', ({ record }) => {
      unread.loaded = true;
      for (const chatId of Object.keys(record === 'absent' ? {} : (record.unread ?? {}))) {
        if (!unread.clearedBeforeLoad.has(chatId)) {
          unread.chats.add(chatId);
        }
      }
      unread.clearedBeforeLoad.clear();
      for (const session of this.#sessions.values()) {
        if (session.projectId === projectId) {
          this.#restoreUnread(session);
        }
      }
    });
    this.#unreadRecords.set(projectId, unread);
    ref.start();
    return unread;
  }

  /** Tell a bound chat machine what the unread record says (D9); `read` is its default, so only unread is sent. */
  #restoreUnread(session: InternalSession): void {
    if (session.projectId !== undefined && this.#unreadRecords.get(session.projectId)?.chats.has(session.chatId)) {
      session.stateActorRef?.send({ type: 'unreadRestored' });
    }
  }

  /** Record an unread decision once the chat's project is known; a chat with no project has no record. */
  async #setUnreadWhenBound(
    composer: Promise<ComposerBinding | undefined>,
    chatId: string,
    value: boolean,
  ): Promise<void> {
    const binding = await composer;
    if (binding !== undefined) {
      this.#setUnread(binding.projectId, chatId, value);
    }
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

  /** The store's unread decision, written to the one record that holds it (D9). */
  #setUnread(projectId: string, chatId: string, value: boolean): void {
    const unread = this.#unreadRecord(projectId);
    if (unread.chats.has(chatId) === value && (value || unread.loaded)) {
      return;
    }
    if (value) {
      unread.chats.add(chatId);
      unread.clearedBeforeLoad.delete(chatId);
    } else {
      unread.chats.delete(chatId);
      if (!unread.loaded) {
        unread.clearedBeforeLoad.add(chatId);
      }
    }
    unread.ref.send({ type: 'patch', fields: { unread: { [chatId]: value } } });
  }

  /** The project session that owns this chat's run accounting (R2). */
  #sessionOwner(session: InternalSession): ProjectSessionActorRef | undefined {
    return session.projectId === undefined ? undefined : this.#projectSessions.get(session.projectId);
  }

  /** Move one hydrated chat from a provisional focused project to its durable owner. */
  #rebindSessionProject(session: InternalSession, projectId: string): void {
    if (session.projectId === projectId) {
      return;
    }
    const previousOwner = this.#sessionOwner(session);
    if (session.lastState.phase === 'admitted' || session.lastState.phase === 'running') {
      previousOwner?.send({ type: 'runSettled', chatId: session.chatId });
    }
    previousOwner?.send({ type: 'chatClosed', chatId: session.chatId });
    session.projectId = projectId;
    const owner = this.#projectSessions.get(projectId);
    owner?.send({ type: 'openChat', chatId: session.chatId });
    session.stateActorRef = owner?.getSnapshot().context.chatRefs[session.chatId];
    session.lastState = { inFlight: 0, approvals: 0 };
    this.#replayPersistedFailure(session);
    this.#replayPersistedSettlement(session);
    this.#syncChatState(session);
    this.#restoreUnread(session);
  }

  #createSession(chatId: string, projectId: string | undefined): InternalSession {
    // Defensive aliases so closures bound to the AI SDK's internal scheduler
    // always read through `this.#deps` (the latest provider snapshot).
    const depsRef = (): ChatSessionDeps => this.#deps;

    // oxlint-disable-next-line eslint/prefer-const -- initialised only after the actor/chat callbacks that close over it are constructed.
    let session: InternalSession;
    let approvalWasPending = false;

    // `undefined` is a chat with no project: it has nowhere to keep a composer, so its record I/O fails.
    const composer = Promise.withResolvers<ComposerBinding | undefined>();
    let composerBound = false;
    const bindComposer = (owner: string | undefined): void => {
      if (composerBound) {
        return;
      }
      composerBound = true;
      if (owner === undefined) {
        composer.resolve(undefined);
        return;
      }
      const { client } = depsRef();
      this.#unreadRecord(owner);
      const binding: ComposerBinding = {
        projectId: owner,
        record: createComposerRecordStore(client, composerRecordPaths.chat(owner, chatId)),
        chatAttachments: createChatAttachmentStore(client, owner, chatId),
      };
      composer.resolve(this.#afterComposerDrain(chatId, binding));
    };
    const recordStore = deferredRecordStore(composer.promise);
    const composerRecordRef = createComposerRecordActor(recordStore);

    const markUnreadIfUnattended = (): void => {
      if (this.#focusedChatId === chatId && isDocumentActive()) {
        return;
      }
      void this.#setUnreadWhenBound(composer.promise, chatId, true);
    };

    const readChatRow = async (id: string): Promise<ChatEntity | undefined> => {
      try {
        return await depsRef().getChat(id);
      } catch (error) {
        // An unreadable row still has a composer: bind it where the chat was opened, so its writes,
        // promotion and deletion do not wait forever on a binding nothing else will settle.
        bindComposer(session.projectId);
        throw error;
      }
    };

    const persistenceActorRef = createActor(
      chatPersistenceMachine.provide({
        actors: {
          loadChatActor: fromSafeAsync(async ({ input, signal }) => {
            const loadedChat = await readChatRow(input.chatId);
            signal.throwIfAborted();
            if (this.#sessions.get(input.chatId) !== session) {
              return { type: 'chatRetrieved', chat: undefined };
            }

            if (!loadedChat) {
              if (session.durableRunId && session.durableRunState !== 'terminal') {
                queueMicrotask(() => {
                  void session.chat.resumeStream();
                });
              }
              if (session.chat.messages.length === 0) {
                session.chat.messages = [];
              }
              // No row to name the owner: the chat is being created in the project it was acquired from.
              bindComposer(session.projectId);
              session.draftActorRef.send({ type: 'initializeFromChat' });

              return { type: 'chatRetrieved', chat: undefined };
            }

            /* A focus switch renders the next chat before its project binding
             * effect runs, so acquisition can briefly inherit the prior
             * project's focus. The durable row is the first authoritative
             * ownership fact; correct the provisional binding before a seeded
             * or user run can report lifecycle to the wrong project. */
            this.#rebindSessionProject(session, loadedChat.resourceId);
            bindComposer(loadedChat.resourceId);

            // Defensive guard: only seed messages from the loaded chat when
            // the live `Chat` instance has not started accumulating its own
            // (a brand-new chat that's already in-flight). Prevents the
            // classic "load wipes in-flight messages" race.
            if (session.chat.messages.length === 0) {
              session.chat.messages = loadedChat.messages;
            }

            let hydratedChat = loadedChat;
            const lastMessage = session.chat.messages.at(-1);
            const { startupRequest } = loadedChat;
            if (startupRequest) {
              const isEligibleStartupRequest =
                lastMessage?.role === 'user' &&
                lastMessage.id === startupRequest.messageId &&
                lastMessage.metadata?.status === 'pending';
              const consumedChat = await depsRef().consumeChatStartupRequest(input.chatId, startupRequest.id);
              if (consumedChat) {
                hydratedChat = consumedChat;
              }

              if (isEligibleStartupRequest && consumedChat) {
                session.draftActorRef.send({ type: 'initializeFromChat' });
                session.chat.messages = consumedChat.messages;

                /* This dispatch *is* the host stream for the chat's first turn.
                 * Marked before it is sent, because the host registration that
                 * would otherwise reattach lands in the same tick and would open
                 * a second stream — a second relay session on rung 2, which a
                 * capacity-1 daemon refuses. */
                session.seededDispatch = true;
                persistenceActorRef.send({
                  type: 'startRequest',
                  /* The consumed row's execution rides with the dispatch. The
                   * `chatRetrieved` event that assigns it to the machine is
                   * only returned on the next line, and the chat client's
                   * published factory closes over a React snapshot older still
                   * — so without this the chat's own `acp` agent (or its
                   * pinned Tau host/model) is rebuilt from the cookie and the
                   * first turn silently runs somewhere else. */
                  request: { kind: 'regenerate', execution: consumedChat.activeExecution },
                });

                return { type: 'chatRetrieved', chat: { ...consumedChat, error: undefined } };
              }
            }

            const pendingTailRestore = buildPendingTailDraftRestore(session.chat.messages);
            session.draftActorRef.send({ type: 'initializeFromChat' });
            if (pendingTailRestore) {
              session.chat.messages = pendingTailRestore.truncatedMessages;
              await restoreDraft(pendingTailRestore.userMessage);
              const restoredChat = await depsRef().commitCancelledDraftRestore(input.chatId, {
                messages: pendingTailRestore.truncatedMessages,
                clearStartupRequestId: startupRequest?.id,
              });
              const healedChat = restoredChat ?? {
                ...hydratedChat,
                messages: pendingTailRestore.truncatedMessages,
                startupRequest: undefined,
              };

              return { type: 'chatRetrieved', chat: healedChat };
            }

            this.#replayPersistedSettlement(session);
            // Reattach to any admitted queued/running/waiting run after a
            // reload. The host transport replays the whole durable log from
            // cursor 0 — nothing persists a cursor — and drops this
            // transcript's copy of the run it is about to rebuild through the
            // reset registered above, so the replay cannot double any part it
            // already applied.
            if (session.durableRunId && session.durableRunState !== 'terminal') {
              queueMicrotask(() => {
                void session.chat.resumeStream();
              });
            }
            return { type: 'chatRetrieved', chat: hydratedChat };
          }),
          persistMessagesActor: fromSafeAsync(async ({ input }) => {
            await depsRef().patchChat(input.chatId, 'messages', stampMessageCreatedAt(input.messages));
          }),
          persistErrorActor: fromSafeAsync(async ({ input }) => {
            await depsRef().patchChat(input.chatId, 'error', input.error);
          }),
          clearErrorActor: fromSafeAsync(async ({ input }) => {
            await depsRef().patchChat(input.chatId, 'error', undefined);
          }),
          persistActiveExecutionActor: fromSafeAsync(async ({ input }) => {
            await depsRef().patchChat(input.chatId, 'activeExecution', input.activeExecution);
          }),
          persistActiveKernelActor: fromSafeAsync(async ({ input }) => {
            await depsRef().patchChat(input.chatId, 'activeKernel', input.activeKernel);
          }),
        },
      }),
      {
        input: {
          activeChatId: chatId,
          resourceId: undefined,
        },
        inspect,
      },
    );

    const draftActorRef = createActor(
      draftMachine.provide({
        actors: { ...draftPersistenceFor(composerRecordRef, recordStore), resizeImageActor },
      }),
      { input: {}, inspect },
    );
    /**
     * Put a cancelled turn's message back in the composer, durably.
     *
     * The draft shows at once. Its attachments live in the chat's directory, so
     * each is copied back beside the record (idempotent by hash) before the
     * record is told to reference it; bytes that are already gone stay a
     * placeholder (D19) rather than failing the restore.
     */
    const restoreDraft = async (userMessage: MyUIMessage): Promise<void> => {
      const draft = buildDraftFromUserMessage(userMessage);
      draftActorRef.send({ type: 'loadDraftFromMessageTransient', draft });
      const work = persistRestoredDraft();
      session.composerWork.add(work);
      try {
        await work;
      } finally {
        session.composerWork.delete(work);
      }
    };
    const persistRestoredDraft = async (): Promise<void> => {
      const binding = await composer.promise;
      if (binding === undefined) {
        return;
      }
      const restored = draftActorRef.getSnapshot().context;
      await Promise.all(
        restored.draftAttachments.map(async (attachment) => {
          try {
            await binding.chatAttachments.copyTo(binding.record.attachments, attachment);
          } catch (error) {
            console.warn('[ChatSessionStore] a restored attachment is not on this device', error);
          }
        }),
      );
      const current = draftActorRef.getSnapshot().context;
      composerRecordRef.send({
        type: 'patch',
        fields: { draft: buildDraftMessage(current.draftText, current.draftAttachments) },
      });
    };

    // Subscribed before the record actor starts, so its read cannot resolve unheard (D7).
    const recordLoadedSubscription = composerRecordRef.on('recordLoaded', ({ record }) => {
      draftActorRef.send({ type: 'hydrateDraft', ...draftHydrationOf(record) });
    });

    const chat = createChatInstance({
      chatId,
      onFinish: ({ messages, isAbort, isError, isDisconnect }) => {
        const durableRunId = session.durableRunId ?? getBoundDurableChatRunId(chatId);
        if (durableRunId && !isDisconnect) {
          session.durableRunId = durableRunId;
          session.durableRunState = 'terminal';
          this.#statusTopics.get(chatId)?.emit();
        }
        persistenceActorRef.send({ type: 'requestFinished', messages, isAbort, isError, isDisconnect });
        if (!isAbort && !isDisconnect) {
          markUnreadIfUnattended();
        }
        this.#scheduleRunReleaseIfTerminal(session);
      },
      onError(error) {
        persistenceActorRef.send({ type: 'handleError', error });
        persistenceActorRef.send({
          type: 'setPersistedError',
          error: parseErrorForPersistence(error),
        });
      },
    });

    const milestonePersistState = {
      lastPersistedMilestoneIndex: -1,
      lastPersistedMilestonePartCount: 0,
    };

    const resetMilestonePersistTracking = (): void => {
      milestonePersistState.lastPersistedMilestoneIndex = -1;
      milestonePersistState.lastPersistedMilestonePartCount = 0;
    };

    // Translate persistence-actor emits into AI SDK side effects on the
    // store-owned `Chat`. Identical wiring to the prior `<ChatInstance>` —
    // moved outside React so the listeners outlive any subtree mount cycle.
    //
    // The listener body is deferred onto a microtask so that
    // `chat.sendMessage` / `chat.regenerate` / `chatShim.makeRequest` never
    // run nested inside another `Chat.makeRequest`'s `finally` block. AI SDK
    // v6's `makeRequest` clobbers `this.activeResponse = void 0` AFTER its
    // `onFinish` callback returns; a synchronous re-entry from `onFinish` →
    // `requestFinished` → `stopping → invoking` → emit `dispatchRequest`
    // would let the new `makeRequest` assign `this.activeResponse =
    // activeResponse_B` only to have the outer finally null it back out.
    // The new `makeRequest`'s own finally would then access
    // `this.activeResponse.state.message` (no optional chaining in ai@6.0.175)
    // and throw a TypeError that the surrounding try/catch swallows,
    // suppressing `onFinish` and stranding the persistence machine in
    // `invoking`. See docs/research/chat-followup-message-swallow.md.
    //
    // The microtask deferral is strictly local to this listener: the
    // sibling `applyResumedRequest` listener still runs synchronously so
    // its `chat.messages = sanitized` mutation is observable to the deferred
    // `chat.sendMessage(B)` call when it fires on the next tick.
    const dispatchSubscription = persistenceActorRef.on('dispatchRequest', ({ request }) => {
      const availableBody = request.body ? this.startRun(chatId, request.body) : session.activeRunBody;

      queueMicrotask(() => {
        // A bodyless dispatch composes its body *now*, through the chat
        // client's own admission path. It used to reuse a body snapshot the
        // client had published at mount, whose `execution` named a workspace
        // that a later `prepare` had already discarded: the run then executed
        // against a workspace id no claim on disk carried, nothing ever marked
        // the claim admitted, and the turn could never settle.
        const composeBody = async (): Promise<Readonly<Record<string, unknown>> | undefined> => {
          const compose = session.latestAgentBody ?? (await this.#waitForLatestAgentBody(session));
          if (!compose) {
            return undefined;
          }
          try {
            return await compose(request.kind === 'regenerate' ? request.execution : undefined);
          } catch (error) {
            console.error('[ChatSessionStore] durable workspace admission failed for a seeded dispatch', error);
            return undefined;
          }
        };
        const dispatch = async (): Promise<void> => {
          const composed = availableBody ?? (await composeBody());
          if (!composed || this.#sessions.get(chatId) !== session) {
            return;
          }
          const requestBody = availableBody ?? this.startRun(chatId, composed);

          // The chat-client always supplies `request.body` when it dispatches
          // a verb it originated (submit / retry / regenerateTail / stop). Two
          // request kinds are *bodyless* by construction:
          //
          //   - Startup-request hydration regenerate (see `loadChatActor`),
          //     which may fire before any client has attached a body.
          //   - `continue` (manual Try again on a transient-network banner via
          //     `continueChat`, and the persistence machine's transparent
          //     auto-retry in `retrying`), which resumes the in-flight stream
          //     and has no producer that owns the per-turn agent payload.
          //
          // Every wire call must still carry the Tau wire shape's top-level
          // `agent` block (see `chatTurnRequestSchema`), so we fall back to the
          // latest body the chat-client published via `setLatestAgentBody`. This
          // keeps the `agent` invariant true for every transport call, not just
          // the verbs that originated with an explicit body.
          switch (request.kind) {
            case 'send': {
              void chat.sendMessage(request.message, { body: requestBody });
              return;
            }

            case 'regenerate': {
              void chat.regenerate({ body: requestBody });
              return;
            }

            case 'edit': {
              const messageIndex = chat.messages.findIndex((m) => m.id === request.messageId);
              if (messageIndex === -1) {
                return;
              }
              const originalMessage = chat.messages[messageIndex]!;
              chat.messages = [...chat.messages.slice(0, messageIndex), editedMessage(originalMessage, request)];
              void chat.regenerate({ body: requestBody });
              return;
            }

            case 'retry': {
              const next = buildRetryMessages(chat.messages, request);
              if (!next) {
                return;
              }
              chat.messages = next;
              void chat.regenerate({ body: requestBody });
              return;
            }

            // Resume the exact admitted run without slicing chat.messages. The
            // transport decides whether this attaches to a browser-host log or
            // the API's resumable stream.
            //
            // Reattaching otherwise only recovers a run the host is still
            // driving: it replays the log and stops where the run stopped. A
            // turn the gateway refused at admission (rate limit, a dead tool)
            // leaves a terminal run and no live stream, so resuming it replayed
            // the same failure and ended — the banner's Resume looked inert.
            // Dispatch the turn again in that case. Placements that register no
            // browser host keep the resume path, which is the one their
            // transport can answer.
            //
            // A *credit* refusal is the exception, and the reason the request
            // above is explicit: the call never reached the provider, so the
            // host continues that one call from its durable log instead of
            // regenerating — which would rewind the turn and charge a second
            // time for the tool work the customer already paid for.
            case 'continue': {
              // The one-shot request is only ever consumed by a browser-host
              // stream. Setting it on a placement that cannot read it leaves it
              // armed for a later stream this dispatch never asked for.
              if (isBrowserAgentHostPlaced(chatId)) {
                requestBrowserAgentHostResume(chatId);
                if (!isBrowserAgentHostRunResumable(chatId)) {
                  void chat.regenerate({ body: requestBody });
                  return;
                }
              }
              void chat.resumeStream({ body: requestBody });
            }
          }
        };
        void dispatch();
      });
    });

    const stopSubscription = persistenceActorRef.on('dispatchStop', () => {
      void chat.stop();
    });

    const finishedSubscription = persistenceActorRef.on('applyFinishedRequest', ({ messages, cause }) => {
      resetMilestonePersistTracking();
      const sanitized = finalizeInterruptedToolParts(messages, chatId, cause);
      if (sanitized !== messages) {
        chat.messages = sanitized;
      }
      persistenceActorRef.send({ type: 'queuePersist', messages: sanitized });
    });

    const stoppedSubscription = persistenceActorRef.on('applyStoppedRequest', ({ messages, cause }) => {
      resetMilestonePersistTracking();
      let sanitized = finalizeInterruptedToolParts(messages, chatId, cause);

      const last = sanitized.at(-1);
      if (last?.role === 'user' && last.metadata?.status === 'pending') {
        sanitized = sanitized.with(-1, {
          ...last,
          metadata: { ...last.metadata, status: 'cancelled' },
        });
      }

      chat.messages = sanitized;
      persistenceActorRef.send({ type: 'queuePersist', messages: sanitized });
    });

    // Empty-cancel companion to `applyStoppedRequest`: commit the truncated
    // transcript and restored composer draft as one durable chat-row
    // transition. The draft-machine event is intentionally transient; storage
    // durability is owned by `commitCancelledDraftRestore`.
    //
    // `chat-history.tsx` subscribes to the same emit independently to
    // refocus the composer in the next animation frame.
    const restoreSubscription = persistenceActorRef.on(
      'restoreCancelledDraft',
      async ({ userMessage, truncatedMessages }) => {
        resetMilestonePersistTracking();
        chat.messages = truncatedMessages;
        try {
          await restoreDraft(userMessage);
          await depsRef().commitCancelledDraftRestore(chatId, { messages: truncatedMessages });
        } catch (error) {
          const persistenceError =
            error instanceof Error ? error : new Error('Failed to restore cancelled draft', { cause: error });
          persistenceActorRef.send({
            type: 'setPersistedError',
            error: parseErrorForPersistence(persistenceError),
          });
        }
      },
    );

    const resumedSubscription = persistenceActorRef.on('applyResumedRequest', ({ messages, cause }) => {
      resetMilestonePersistTracking();
      const sanitized = finalizeInterruptedToolParts(messages, chatId, cause);
      chat.messages = sanitized;
      persistenceActorRef.send({ type: 'queuePersist', messages: sanitized });
    });

    /*
     * A host reattach replays the whole durable log from cursor 0, because the
     * host may have finished the turn with no client attached. The AI SDK
     * *continues* a trailing assistant message on a resume instead of starting
     * a new one, and it keys tool parts by `toolCallId` and data parts by `id`
     * but keys text and reasoning parts by nothing — so a replay over the
     * transcript this store restored from local persistence merged the tool
     * cards in place and appended a second copy of every text block. Each later
     * turn then froze that doubling into history: the operator's four-run chat
     * rendered its third turn four times and its first turn twice
     * (2026-09-03).
     *
     * The log is the authority (PH19), so the transport hands over the
     * transcript the whole log implies and this store splices it in — every run
     * the log names is replaced, healing whatever earlier reloads left behind.
     * It is called only once the host has answered `attach`, so a chat whose
     * log this host does not hold keeps the transcript it had.
     */
    const unregisterRunReset = registerAgentHostRunReset(chatId, (rebuild) => {
      resetMilestonePersistTracking();
      chat.messages = [...rebuild(chat.messages)];
    });

    // Wire the AI SDK Chat's snapshot callbacks into per-chatId subscriber
    // sets. `~registerMessagesCallback` etc. are public (the `~` prefix is
    // the AI SDK's "internal-but-intended-for-subscribers" marker — see
    // node_modules/@ai-sdk/react/dist/index.d.ts).
    const unregisterMessages = chat['~registerMessagesCallback'](() => {
      const approvalIsPending = hasPendingApproval(chat.messages);
      if (approvalIsPending && !approvalWasPending) {
        markUnreadIfUnattended();
      }
      approvalWasPending = approvalIsPending;

      const lastIndex = chat.messages.length - 1;
      const last = chat.messages[lastIndex];
      if (last?.role === 'assistant') {
        const milestoneCount = countPersistMilestones(last);
        if (
          lastIndex !== milestonePersistState.lastPersistedMilestoneIndex ||
          milestoneCount > milestonePersistState.lastPersistedMilestonePartCount
        ) {
          milestonePersistState.lastPersistedMilestoneIndex = lastIndex;
          milestonePersistState.lastPersistedMilestonePartCount = milestoneCount;
          persistenceActorRef.send({ type: 'queuePersist', messages: chat.messages });
        }
      }

      this.#syncChatState(session);
      this.#chatTopics.get(chatId)?.emit();
    });
    const unregisterStatus = chat['~registerStatusCallback'](() => {
      const next = chat.status;
      if (session.status !== next) {
        session.status = next;
        if (next === 'streaming') {
          persistenceActorRef.send({ type: 'streamResumed' });
        }
        if (session.durableRunId && (next === 'submitted' || next === 'streaming')) {
          session.durableRunState = 'active';
        }
        this.#statusTopics.get(chatId)?.emit();
      }
      this.#syncChatState(session);
      this.#chatTopics.get(chatId)?.emit();
    });
    const unregisterError = chat['~registerErrorCallback'](() => {
      this.#syncChatState(session);
      this.#chatTopics.get(chatId)?.emit();
    });

    /* The chat's state machine is a child of the *project session*, never of
     * this store: every project-scoped resource dies with its session (I23).
     * Absent a live session — the home route has chats too — the store keeps
     * its flags and nothing subscribes to a state row. */
    const owner = projectId === undefined ? undefined : this.#projectSessions.get(projectId);
    owner?.send({ type: 'openChat', chatId });
    const stateActorRef = owner?.getSnapshot().context.chatRefs[chatId];

    persistenceActorRef.start();
    draftActorRef.start();
    composerRecordRef.start();

    // oxlint-disable-next-line eslint/prefer-const -- assigned after `session.dispose` captures it so immediate actor emissions cannot observe a partial session.
    let lifecycleSubscription: { unsubscribe: () => void } | undefined;
    let requestLifecycleWasActive = false;
    session = {
      chatId,
      chat,
      projectId,
      stateActorRef,
      lastState: { inFlight: 0, approvals: 0 },
      persistenceActorRef,
      draftActorRef,
      composerRecordRef,
      composer: composer.promise,
      bindComposer,
      composerWork: new Set(),
      viewRefcount: 1,
      runHeld: false,
      durableRunId: undefined,
      durableRunState: undefined,
      reattachedHostId: undefined,
      seededDispatch: false,
      activeRunBody: undefined,
      status: chat.status,
      latestAgentBody: undefined,
      latestAgentBodyWaiters: new Set(),
      dispose: () => {
        for (const resolve of session.latestAgentBodyWaiters) {
          resolve(undefined);
        }
        session.latestAgentBodyWaiters.clear();
        dispatchSubscription.unsubscribe();
        recordLoadedSubscription.unsubscribe();
        stopSubscription.unsubscribe();
        finishedSubscription.unsubscribe();
        stoppedSubscription.unsubscribe();
        restoreSubscription.unsubscribe();
        resumedSubscription.unsubscribe();
        lifecycleSubscription?.unsubscribe();
        unregisterRunReset();
        unregisterMessages();
        unregisterStatus();
        unregisterError();
      },
    };

    lifecycleSubscription = persistenceActorRef.subscribe((snapshot) => {
      this.#syncChatState(session);
      const idle = snapshot.matches({ requestLifecycle: 'idle' });
      if (!idle) {
        requestLifecycleWasActive = true;
        return;
      }
      if (!requestLifecycleWasActive) {
        return;
      }
      requestLifecycleWasActive = false;
      this.#scheduleRunReleaseIfTerminal(session);
    });

    // Kick off chat hydration only after the session record exists. The load
    // actor may dispatch a startup run, whose non-view hold must be able to
    // reference the fully initialised session.
    persistenceActorRef.send({ type: 'setActiveChatId', chatId });
    this.#restoreUnread(session);

    return session;
  }

  /**
   * Hand the chat's machine what changed, and only what changed.
   *
   * One place reads the store's facts; the machine owns what they mean. Token
   * deltas never get here — the message callback fires per part, and what it
   * sends is a batched count (F8, A38).
   *
   * @param session - The chat whose facts moved.
   */
  #syncChatState(session: InternalSession): void {
    const { lastState, stateActorRef } = session;
    /* Run accounting is not gated on the chat machine: the project session has
     * to know a run started even where no `chat-session` exists yet, because
     * `busy` is what stops a policy closing a project mid-run (I24). */
    const tools = countToolParts(session.chat.messages);
    if (
      tools.inFlight !== lastState.inFlight ||
      tools.approvals !== lastState.approvals ||
      tools.toolName !== lastState.toolName
    ) {
      lastState.inFlight = tools.inFlight;
      lastState.approvals = tools.approvals;
      lastState.toolName = tools.toolName;
      stateActorRef?.send({ type: 'toolParts', ...tools });
    }
    this.#syncRunPhase(session);
    if (session.durableRunState !== lastState.durable) {
      lastState.durable = session.durableRunState;
      if (session.durableRunState !== undefined) {
        stateActorRef?.send({ type: 'durableRunState', state: session.durableRunState });
      }
    }
    const snapshot = session.persistenceActorRef.getSnapshot();
    const lifecycle = (['invoking', 'retrying', 'stopping'] as const).find((phaseName) =>
      snapshot.matches({ requestLifecycle: phaseName }),
    );
    if (lifecycle !== lastState.lifecycle) {
      lastState.lifecycle = lifecycle;
      if (lifecycle !== undefined) {
        stateActorRef?.send({ type: 'requestLifecycle', phase: lifecycle });
      }
    }
  }

  /** Route one host-attested outcome to the chat that owns it. */
  #observeHostTurnSettlement(event: HostTurnSettlement): void {
    const session = this.#sessions.get(event.chatId);
    const stateActorRef = session?.stateActorRef;
    if (
      session !== undefined &&
      stateActorRef !== undefined &&
      typeof stateActorRef.getSnapshot === 'function' &&
      stateActorRef.getSnapshot().matches({ run: 'idle' })
    ) {
      this.#replayPersistedSettlement(session);
      return;
    }
    switch (event.type) {
      case 'turn.finalized': {
        stateActorRef?.send({
          type: 'turnFinalizedObserved',
          runId: event.runId,
          turnId: event.turnId,
          ...(event.branch === undefined ? {} : { branch: event.branch }),
        });
        break;
      }
      case 'turn.failed': {
        stateActorRef?.send({
          type: 'turnFailedObserved',
          runId: event.runId,
          turnId: event.turnId,
          reason: event.reason,
        });
        break;
      }
      case 'turn.conflicted': {
        stateActorRef?.send({ type: 'turnConflictedObserved', runId: event.runId, turnId: event.turnId });
        break;
      }
    }
  }

  /** Restore a terminal machine state from the chat log that supplied its transcript. */
  #replayPersistedSettlement(session: InternalSession): void {
    const event = getHostTurnSettlement(session.chatId);
    const { stateActorRef } = session;
    if (event === undefined || stateActorRef === undefined || !stateActorRef.getSnapshot().matches({ run: 'idle' })) {
      return;
    }
    stateActorRef.send({ type: 'runLifecycle', phase: 'admitted', runId: event.runId });
    switch (event.type) {
      case 'turn.finalized': {
        stateActorRef.send({
          type: 'turnFinalizedObserved',
          runId: event.runId,
          turnId: event.turnId,
          ...(event.branch === undefined ? {} : { branch: event.branch }),
        });
        if (event.branch !== undefined) {
          stateActorRef.send({ type: 'turnFinalized', branch: event.branch });
        }
        break;
      }
      case 'turn.failed': {
        stateActorRef.send({
          type: 'turnFailedObserved',
          runId: event.runId,
          turnId: event.turnId,
          reason: event.reason,
        });
        break;
      }
      case 'turn.conflicted': {
        stateActorRef.send({ type: 'turnConflictedObserved', runId: event.runId, turnId: event.turnId });
        break;
      }
    }
    stateActorRef.send({ type: 'runLifecycle', phase: 'completed', runId: event.runId });
  }

  /**
   * Replay a failure this chat carries from an earlier session (P59, D32).
   *
   * The SDK status of a rehydrated chat is `ready`, so `#syncRunPhase` never
   * reports the failure the record still holds and the chat's machine — the one
   * status source — would say `idle` about a run that failed. This says it once,
   * at bind, and never over a live run. No `runSettled` goes with it: a
   * historical failure is not a run this session admitted.
   *
   * @param session - The chat that just got its machine.
   */
  #replayPersistedFailure(session: InternalSession): void {
    if (session.status === 'streaming' || session.status === 'submitted') {
      return;
    }
    const failure = session.chat.error ?? session.persistenceActorRef.getSnapshot().context.persistedError;
    if (failure === undefined) {
      return;
    }
    session.lastState.phase = 'failed';
    session.stateActorRef?.send({ type: 'runLifecycle', phase: 'failed', reason: failure.message });
  }

  /**
   * Move the chat's run phase forward once, telling both owners.
   *
   * @param session - The chat whose run moved.
   */
  #syncRunPhase(session: InternalSession): void {
    const { lastState } = session;
    const settled = session.status === 'ready' && (lastState.phase === 'admitted' || lastState.phase === 'running');
    /* A run the person stopped is cancelled, not completed (P63): the last
     * lifecycle this session saw is `stopping` exactly when *Stop* or the
     * sidebar's *Close* asked for it, and a `completed` here would move the row
     * to `Done` and mark it unread for work nobody finished. */
    const next = settled
      ? lastState.lifecycle === 'stopping'
        ? 'cancelled'
        : 'completed'
      : runPhaseOf(session.status);
    if (next === undefined || next === lastState.phase) {
      return;
    }
    const admission = admissionEnvelopeSchema.safeParse(session.activeRunBody?.['admission']);
    const runId = admission.success
      ? admission.data.idempotencyKey
      : (getBoundDurableChatRunId(session.chatId) ?? session.durableRunId);
    lastState.phase = next;
    /* The session counts runs so *Close* knows to ask (A35, I24). The run
     * reports to the chat's OWN project, wherever the person is now. */
    this.#sessionOwner(session)?.send({
      type: next === 'admitted' || next === 'running' ? 'runStarted' : 'runSettled',
      chatId: session.chatId,
    });
    session.stateActorRef?.send({
      type: 'runLifecycle',
      phase: next,
      ...(runId === undefined ? {} : { runId }),
      ...(next === 'failed' && session.chat.error ? { reason: session.chat.error.message } : {}),
    });
  }

  #withAdmission(body: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    if (admissionEnvelopeSchema.safeParse(body['admission']).success) {
      return body;
    }

    return Object.freeze({
      ...body,
      admission: Object.freeze({
        version: 1,
        idempotencyKey: generatePrefixedId(idPrefix.request),
      }),
    });
  }

  async #waitForLatestAgentBody(session: InternalSession): Promise<LatestAgentBodyFactory | undefined> {
    if (session.latestAgentBody) {
      return session.latestAgentBody;
    }
    return new Promise((resolve) => {
      session.latestAgentBodyWaiters.add(resolve);
    });
  }

  #scheduleRunReleaseIfTerminal(session: InternalSession): void {
    queueMicrotask(() => {
      if (!session.runHeld || !session.persistenceActorRef.getSnapshot().matches({ requestLifecycle: 'idle' })) {
        return;
      }
      session.runHeld = false;
      session.activeRunBody = undefined;
      this.#disposeIfUnreferenced(session);
    });
  }

  #disposeIfUnreferenced(session: InternalSession): void {
    if (
      session.viewRefcount > 0 ||
      session.runHeld ||
      session.durableRunId !== undefined ||
      this.#sessions.get(session.chatId) !== session
    ) {
      return;
    }

    session.dispose();
    session.persistenceActorRef.stop();
    // A debounced keystroke is handed to the record before the draft stops, and the record outlives it until written.
    session.draftActorRef.send({ type: 'flushNow' });
    session.draftActorRef.stop();
    // A chat released before its row loaded still belongs to the project it was opened in; its flush lands there.
    session.bindComposer(session.projectId);
    const drained = Promise.withResolvers<void>();
    this.#composerDrains.set(session.chatId, drained.promise);
    void this.#drainComposer(session, drained);
    /* The session owns the chat machine; asking it to let go is what stops it. */
    this.#sessionOwner(session)?.send({ type: 'chatClosed', chatId: session.chatId });
    this.#sessions.delete(session.chatId);
    clearLedger(session.chatId);
    this.#disposeChatTopics(session.chatId);
    this.#refreshSnapshot();
    this.#notifyMembership();
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
      if (topic.size === 0) {
        bucket.delete(chatId);
        topic.dispose();
      }
    };
  }

  #disposeChatTopics(chatId: string): void {
    for (const bucket of [this.#chatTopics, this.#statusTopics]) {
      const topic = bucket.get(chatId);
      if (topic) {
        topic.dispose();
        bucket.delete(chatId);
      }
    }
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
}
