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
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor, ActorOptions, AnyActorLogic } from 'xstate';
import type { CadAgentExecution, Chat as ChatEntity, MyUIMessage } from '@taucad/chat';
import { isAnyToolPart } from '@taucad/chat';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
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
import { buildUserMessage, finalizeInterruptedToolParts, stampMessageCreatedAt } from '#utils/chat.utils.js';
import {
  bindDurableChatRun,
  createChatInstance,
  getBoundDurableChatRunId,
} from '#chat-clients/_internal/shared-chat-transport.js';
import {
  BrowserPlacementChatTransport,
  cancelBrowserAgentHostRun,
  getBrowserAgentHostRun,
  getHostTurnSettlement,
  isBrowserAgentHostPlaced,
  registerAgentHostRunReset,
  requestBrowserAgentHostResume,
  subscribeChatLogAnswers,
  subscribeHostTurnSettlements,
} from '#chat-clients/_internal/browser-agent-host-transport.js';
import type { HostTurnSettlement } from '#chat-clients/_internal/browser-agent-host-transport.js';
import { hostAttachment } from '#chat-clients/_internal/host-attachment.js';
import type { AgentHostClient } from '#services/agent-host-client.js';
import {
  chatHostBinding,
  chatTurnAdmission,
  chatTurnSettlement,
  clearChatTurnServices,
} from '#chat-clients/_internal/chat-host-binding.js';
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
  selectToolsInFlight,
} from '#machines/chat-projection.logic.js';
import type { ChatProjection, ChatRunPhase as ProjectedRunPhase } from '#machines/chat-projection.logic.js';
import type { RowKey } from '@taucad/agent-host';

/** Run states a browser-placed run never leaves. */
const terminalBrowserRunStates = new Set(['completed', 'failed', 'cancelled']);

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
  readonly persistenceActorRef: Actor<typeof chatPersistenceMachine>;
  readonly draftActorRef: Actor<typeof draftMachine>;
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
  /* A root the store creates at acquire and stops at dispose (PV-S5, L3 D10): never swapped, so a view that
   * subscribed once stays subscribed to the chat's machine. */
  readonly stateActorRef: ChatSessionActorRef;
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
  /** Exact server-authoritative run selected by project reload discovery. */
  durableRunId: string | undefined;
  durableRunState: 'reattaching' | 'active' | 'terminal' | undefined;
  /** Host this session has already reattached to; see `reattachHostChat`. */
  reattachedHostId: string | undefined;
  /** Host a reattach named while the chat was still loading; see `reattachHostChat`. */
  pendingReattachHostId: string | undefined;
  /**
   * This load dispatched the chat's seeded first turn, so the host stream is
   * this page's own and there is nothing to reattach to; see
   * {@link ChatSessionStore.reattachHostChat}.
   */
  seededDispatch: boolean;
  /** Immutable wire body for the active logical run, including admission. */
  activeRunBody: Readonly<Record<string, unknown>> | undefined;
  status: ChatStatus;
  /** The project this chat belongs to, from its caller (PV-S4, L3 D9); never from focus. */
  readonly projectId: string;
  /** Where this chat's next turn runs, as its turn host last said. */
  placement: string | undefined;
  /** The chat machine's turn emits, subscribed once when its root is created. */
  turnSubscriptions: Array<{ unsubscribe: () => void }>;
  /** The request facts last handed to `stateActorRef`, so nothing is sent twice; PV-S10 and PV-S12 retire them. */
  lastState: {
    durable?: string;
    lifecycle?: string;
  };
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
        pendingSettlement: unknown;
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
export type ChatRevisionFacts = Readonly<{ dirty: boolean; sync: ChatSyncState; branch?: string }>;

type ObservedChat = {
  projectId: string;
  refs: number;
  attachment?: Actor<typeof hostAttachment>;
  retry?: ReturnType<typeof setTimeout>;
  attempts: number;
};

export class ChatSessionStore {
  readonly #sessions = new Map<string, InternalSession>();
  readonly #observed = new Map<string, ObservedChat>();
  readonly #projectHostConnectors = new Map<
    string,
    (chatId: string) => Promise<Pick<AgentHostClient, 'read' | 'subscribe' | 'close'>>
  >();
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
  #settlementUnsubscribe: (() => void) | undefined;
  /**
   * Each chat's projection of its log (PV-S7), fed from every stream that reads it. Kept for the store's life, not a
   * view's: a run outlives the view that started it (V5), and its rows keep arriving.
   */
  readonly #projections = new Map<string, Actor<typeof chatProjectionLogic>>();
  /** The chat the person has in front of them (R3); only it counts as attended. */
  #focusedChatId: string | undefined;
  readonly #membershipTopic = new Topic<void>({ name: 'ChatSessionStore.membership' });
  /** Any chat's unread answer may have moved (PV-S8). */
  readonly #unreadTopic = new Topic<void>({ name: 'ChatSessionStore.unread' });
  readonly #chatTopics = new Map<string, Topic<void>>();
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
    /* The chat session's three owned resources, bound to the route's published services: one host registration,
     * one admission and one settlement per chat (policy §16). */
    this.#chatSessionLogic =
      chatSession ??
      chatSessionMachine.provide({
        actors: { hostBinding: chatHostBinding, admitTurn: chatTurnAdmission, settleTurn: chatTurnSettlement },
      });
    this.#rootOptions = rootOptions;
    // ponytail: the store lives as long as the document, so this subscription does too.
    subscribeChatLogAnswers(({ chatId, answer }) => {
      const observed = this.#observed.get(chatId);
      /* An attached chat has exactly one log reader. The old SDK transport's
       * replay tap must not race the projection's owned cursor. */
      if (observed !== undefined && this.#projectHostConnectors.has(observed.projectId)) {
        return;
      }
      this.#projectionOf(chatId).send({ type: 'batch', answer });
    });
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
              pendingSettlement: state.context.pendingSettlement,
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

  /** Observe a listed chat's log without acquiring its SDK transcript or composer. @public */
  public observe(chatId: string, projectId: string): () => void {
    const existing = this.#observed.get(chatId);
    if (existing !== undefined && existing.projectId !== projectId) {
      throw new Error(`Chat ${chatId} is already observed in project ${existing.projectId}.`);
    }
    const observed = existing ?? { projectId, refs: 0, attempts: 0 };
    observed.refs += 1;
    if (existing === undefined) {
      this.#observed.set(chatId, observed);
      this.#projectionOf(chatId);
      this.#startObservedAttachment(chatId, observed);
      this.#notifyMembership();
    }
    return () => {
      observed.refs -= 1;
      if (observed.refs > 0 || this.#observed.get(chatId) !== observed) {
        return;
      }
      this.#stopObservedAttachment(observed);
      this.#observed.delete(chatId);
      this.#notifyMembership();
    };
  }

  /** IDs whose projection is observed for this project, including unopened chats. @public */
  public observedChatIdsOf(projectId: string): readonly string[] {
    return [...this.#observed].filter(([, chat]) => chat.projectId === projectId).map(([chatId]) => chatId);
  }

  /** Publish the active project's real W6 connector to every listed chat. @public */
  public publishProjectHostConnector(
    projectId: string,
    connector: (chatId: string) => Promise<Pick<AgentHostClient, 'read' | 'subscribe' | 'close'>>,
  ): () => void {
    this.#projectHostConnectors.set(projectId, connector);
    for (const [chatId, observed] of this.#observed) {
      if (observed.projectId !== projectId) {
        continue;
      }
      this.#stopObservedAttachment(observed);
      observed.attempts = 0;
      this.#startObservedAttachment(chatId, observed);
    }
    return () => {
      if (this.#projectHostConnectors.get(projectId) !== connector) {
        return;
      }
      this.#projectHostConnectors.delete(projectId);
      for (const observed of this.#observed.values()) {
        if (observed.projectId === projectId) {
          this.#stopObservedAttachment(observed);
        }
      }
    };
  }

  /** Resolve a listed chat's persisted placement without acquiring its SDK session. @public */
  public async getChatExecution(chatId: string): Promise<CadAgentExecution | undefined> {
    const chat = await this.#deps.getChat(chatId);
    return chat?.activeExecution;
  }

  /** Read a listed chat's host bootstrap choices without acquiring an SDK session. @public */
  public async getChatHostSettings(
    chatId: string,
  ): Promise<Pick<ChatEntity, 'activeExecution' | 'activeKernel'> | undefined> {
    const chat = await this.#deps.getChat(chatId);
    return chat === undefined ? undefined : { activeExecution: chat.activeExecution, activeKernel: chat.activeKernel };
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
   * @param projectId - The chat's project, from its caller: focus never names it (PV-S4, L3 D9).
   * @returns The retained chat session.
   */
  public acquire(chatId: string, projectId: string): ChatSession {
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
    readonly projectId: string;
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
    const session = this.#createSession(input.chatId, input.projectId);
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
   * per host, and there is no second pass: the caller is the host binding,
   * which composes once per placement. A request that lands while the chat's
   * row is still being read is therefore held rather than dropped — the chat's
   * view mounts as soon as it is focused, long before its load settles, and a
   * dropped one left the durable log unattached for the life of the page (I7).
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
    if (!session || session.reattachedHostId === input.hostId || session.seededDispatch) {
      return;
    }
    if (session.persistenceActorRef.getSnapshot().context.isLoadingChat) {
      /* Held, not dropped. @see flushPendingReattach */
      session.pendingReattachHostId = input.hostId;
      return;
    }
    session.pendingReattachHostId = undefined;
    if (session.status !== 'ready') {
      // A chat already running a turn is already attached to its host; this one
      // is genuinely nothing to do, and resuming over it opens a second stream.
      return;
    }
    // Marked only when it actually reattaches.
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

  public getDurableRunState(chatId: string): InternalSession['durableRunState'] {
    return this.#sessions.get(chatId)?.durableRunState;
  }

  public getDurableRunId(chatId: string): string | undefined {
    return this.#sessions.get(chatId)?.durableRunId;
  }

  /**
   * Say where this chat's next turn runs.
   *
   * The chat's session actor owns its agent-host binding and re-invokes it on
   * this and on nothing else; a model or prompt change is read when the client
   * is created, so it must not churn the registration. Published by the chat's
   * one `ChatTurnHost`, and replayed to the machine when a project session
   * spawns it.
   *
   * @param chatId - The chat whose placement moved.
   * @param placement - The daemon host id, or the execution kind for a local one.
   * @public
   */
  public setTurnPlacement(chatId: string, placement: string): void {
    const session = this.#sessions.get(chatId);
    if (!session || session.placement === placement) {
      return;
    }
    session.placement = placement;
    session.stateActorRef.send({ type: 'agentConfigChanged', placement });
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
      this.#settlementUnsubscribe ??= subscribeHostTurnSettlements((event) => {
        this.#observeHostTurnSettlement(event);
      });
      for (const session of this.#sessions.values()) {
        if (session.projectId === projectId) {
          this.#countRun(session);
        }
      }
      for (const chatId of this.observedChatIdsOf(projectId)) {
        this.#countProjectedRun(chatId, projectId);
      }
    }
    if (this.#projectSessions.size === 0) {
      this.#settlementUnsubscribe?.();
      this.#settlementUnsubscribe = undefined;
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
    if (projection === undefined || !selectCaughtUp(projection)) {
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

  #stopObservedAttachment(observed: ObservedChat): void {
    if (observed.retry !== undefined) {
      clearTimeout(observed.retry);
    }
    observed.retry = undefined;
    observed.attachment?.stop();
    observed.attachment = undefined;
  }

  #startObservedAttachment(chatId: string, observed: ObservedChat): void {
    const connector = this.#projectHostConnectors.get(observed.projectId);
    if (connector === undefined) {
      return;
    }
    const attachment = createActor(hostAttachment, {
      input: {
        chatId,
        connect: async () => connector(chatId),
        projection: this.#projectionOf(chatId),
        onStatus: (event) => {
          if (observed.attachment !== attachment) {
            return;
          }
          if (event.type === 'attachment.attached') {
            observed.attempts = 0;
            return;
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
            attachment.stop();
            observed.attachment = undefined;
            observed.retry = setTimeout(() => {
              observed.retry = undefined;
              if (this.#observed.get(chatId) === observed) {
                this.#startObservedAttachment(chatId, observed);
              }
            }, retryDelayMilliseconds);
          });
        },
      },
      ...this.#rootOptions,
    });
    observed.attachment = attachment;
    attachment.start();
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
   */
  async #restoreDraftMessage(session: InternalSession, message: MyUIMessage): Promise<void> {
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
    /* Wholesale: this replaces the displacing send's text and attachments
     * rather than clearing and then restoring over the top of it. */
    session.draftActorRef.send({ type: 'loadDraftFromMessageTransient', draft: message });
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
        session.persistenceActorRef.send({ type: 'startRequest', request });
      }),
      stateActorRef.on('stopTurnRequest', () => {
        session.persistenceActorRef.send({ type: 'preemptRequest' });
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
    /* A run outlives the view that started it (V5). Navigating away and back
     * gives this chat a new actor while its run is still in flight, and an
     * actor that starts `idle` admits a second turn over the live one — which
     * the host refuses, ending the turn on a banner the page caused itself. */
    const live = getBrowserAgentHostRun(session.chatId);
    if (live !== undefined && !terminalBrowserRunStates.has(live.state)) {
      session.stateActorRef.send({ type: 'adoptRun', runId: live.runId });
    }
    /* A chat whose log this page already read shows how its last turn ended from the start. */
    this.#replayPersistedSettlement(session);
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
    projection.subscribe(({ context }) => {
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
    if (projectId !== undefined) {
      this.#countProjectedRun(chatId, projectId);
    }
    if (session === undefined || projection === undefined) {
      return;
    }
    this.#syncTools(session, projection);
    const run = selectCaughtUp(projection) ? selectCurrentRun(projection) : undefined;
    const phase = selectRunPhase(projection);
    if (run === undefined || present === 'none' || (present === 'open' && !opensRun(phase) && phase !== 'paused')) {
      return;
    }
    this.#presentRun(session, { runId: run.runId, phase, reason: selectRunFailure(projection, run.runId) });
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

  /**
   * Keep the chat's project counting its run exactly while the log says the run is open (I24, A35). The project
   * session's own `runs` is the comparison, so the page keeps no copy of what it told it. It reports to the chat's own
   * project, wherever the person is now.
   *
   * @param session - The chat.
   */
  #countRun(session: InternalSession): void {
    this.#countProjectedRun(session.chatId, session.projectId);
  }

  #countProjectedRun(chatId: string, projectId: string): void {
    const owner = this.#projectSessions.get(projectId);
    const projection = this.#projectionContext(chatId);
    if (owner === undefined || projection === undefined || !selectCaughtUp(projection)) {
      return;
    }
    const open = opensRun(selectRunPhase(projection));
    if (open !== owner.getSnapshot().context.runs.includes(chatId)) {
      owner.send({ type: open ? 'runStarted' : 'runSettled', chatId });
    }
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
    { runId, phase, reason }: Readonly<{ runId: string; phase: ProjectedRunPhase; reason: string | undefined }>,
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
   * A request that ended before its run's log did: an admission the host never answered, a reattach to a host that is
   * not there (R1-F1), a stream that broke, a Stop that never reached the host. The log's own terminal row is
   * presented from the projection and has already ended the run, so this speaks only where the log has not.
   *
   * ponytail: the request half of the old SDK status fold; PV-S10's command outcomes replace it.
   *
   * @param session - The chat whose SDK request just ended.
   * @param outcome - How the request ended.
   */
  #reportRequestEnd(session: InternalSession, outcome: 'failed' | 'cancelled' | 'completed'): void {
    const snapshot = session.stateActorRef.getSnapshot();
    const { turn, activeRunId } = snapshot.context;
    const runId = turn?.runId ?? activeRunId;
    const live = runId === undefined ? isLive(snapshot) : endsHere(snapshot, runId);
    const { error } = session.chat;
    if (outcome === 'failed') {
      /* A reattach that fails outright fails the idle chat it was for (R1-F1). */
      if (error === undefined || !(live || snapshot.matches({ run: 'idle' }))) {
        return;
      }
    } else if (turn === undefined || !live) {
      /* Only a turn this page placed ends with its request; a watched run ends when its log says so. */
      return;
    }
    session.stateActorRef.send({
      type: 'runLifecycle',
      phase: outcome,
      ...(runId === undefined ? {} : { runId }),
      ...(outcome === 'failed' && error !== undefined ? { reason: error.message } : {}),
    });
  }

  /** The chat's newest attention row, once this page holds its whole log; `undefined` while it is unknown. */
  #knownAttention(chatId: string): RowKey | undefined {
    const projection = this.#projectionContext(chatId);
    return projection === undefined || !selectCaughtUp(projection) ? undefined : selectAttentionRow(projection);
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

  /** The project session that owns this chat's run accounting (R2). */
  #sessionOwner(session: InternalSession): ProjectSessionActorRef | undefined {
    return this.#projectSessions.get(session.projectId);
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

    const readChatRow = async (id: string): Promise<ChatEntity | undefined> => depsRef().getChat(id);

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
                if (session.durableRunId && session.durableRunState !== 'terminal') {
                  queueMicrotask(() => {
                    void session.chat.resumeStream();
                  });
                }
                if (session.chat.messages.length === 0) {
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
              session.chat.messages = [
                ...loadedChat.messages.filter((message) => !inFlightIds.has(message.id)),
                ...inFlight,
              ];

              const lastMessage = session.chat.messages.at(-1);
              const { startupRequest } = loadedChat;
              if (startupRequest) {
                const isEligibleStartupRequest =
                  lastMessage?.role === 'user' &&
                  lastMessage.id === startupRequest.messageId &&
                  lastMessage.metadata?.status === 'pending';
                /* Eligibility is decided *before* the consume: the seed message
                 * lives only in the chat store's in-memory hold until a host logs
                 * the turn, so a loader that reloaded in between reads
                 * `messages: []` — and consuming there burned the request and
                 * dropped the prompt with no draft restore (F4c). */
                if (isEligibleStartupRequest) {
                  /* The consume is one-shot, so from here the session owns the
                   * request. Home → project navigation remounts the shell under
                   * the sidebar row that is this chat's only view; without a hold
                   * across the await the session was disposed mid-dispatch and
                   * its replacement found the request already gone (F3). The hold
                   * is freed by `#scheduleRunReleaseIfTerminal` once the request
                   * settles — including the compose failure below (F4a). */
                  session.runHeld = true;
                  /* Nothing else can give this hold back: the request was never
                   * started, so the lifecycle release never runs. A rejected
                   * consume — it is a filesystem patch — left the session held
                   * forever, undisposable and undrained (R1-F2). `retainDurableRun`
                   * may have taken its own hold during the await; it is the only
                   * other writer and it always sets `durableRunId` with it, so
                   * that field tells this path's hold from theirs (R1-F5). */
                  const releaseSeedHold = (): void => {
                    if (session.durableRunId === undefined) {
                      session.runHeld = false;
                    }
                    this.#disposeIfUnreferenced(session);
                  };
                  const consumedChat = await depsRef()
                    .consumeChatStartupRequest(input.chatId, startupRequest.id)
                    .catch((error: unknown) => {
                      releaseSeedHold();
                      throw error;
                    });
                  if (consumedChat) {
                    session.draftActorRef.send({ type: 'initializeFromChat' });
                    session.chat.messages = consumedChat.messages;

                    /* This dispatch *is* the host stream for the chat's first turn.
                     * Marked before it is sent, because the host registration that
                     * would otherwise reattach lands in the same tick and would open
                     * a second stream — a second relay session on rung 2, which a
                     * capacity-1 daemon refuses. */
                    session.seededDispatch = true;
                    /* Through the turn's owner, like every other gesture: the
                     * seeded turn takes a lease and must settle it. The consumed
                     * row's execution rides with the gesture, because the
                     * load's answer that assigns it to the machine is
                     * only returned on the next line and the route's own agent
                     * config is a render older still — without it the chat's
                     * `acp` agent (or its pinned Tau host/model) is rebuilt from
                     * the cookie and the first turn silently runs somewhere
                     * else. The admission waits for the route to publish, so
                     * being ahead of it is not a race any more. */
                    const seedGesture: ChatTurnGesture = {
                      kind: 'regenerate',
                      execution: consumedChat.activeExecution,
                      requestId: startupRequest.id,
                    };
                    /* The chat's root exists from acquire, so the seed is taken, never parked (V3a, PV-S5). */
                    session.stateActorRef.send({ type: 'requestTurn', gesture: seedGesture });

                    return { chat: { ...consumedChat, error: undefined } };
                  }
                  releaseSeedHold();
                }
              }

              /* Healing a pending tail into the composer is for a turn *this load*
               * found abandoned in the row. A message the live `Chat` was already
               * carrying belongs to a request in flight right now, and yanking it
               * back into the draft cancels the turn the person just sent. */
              const pendingTailRestore =
                inFlight.length > 0 ? undefined : buildPendingTailDraftRestore(session.chat.messages);
              session.draftActorRef.send({ type: 'initializeFromChat' });
              if (pendingTailRestore) {
                session.chat.messages = pendingTailRestore.truncatedMessages;
                await restoreDraft(pendingTailRestore.userMessage);
                const restoredChat = await depsRef().commitCancelledDraftRestore(input.chatId, {
                  messages: pendingTailRestore.truncatedMessages,
                  clearStartupRequestId: startupRequest?.id,
                });
                const healedChat = restoredChat ?? {
                  ...loadedChat,
                  messages: pendingTailRestore.truncatedMessages,
                  startupRequest: undefined,
                };

                return { chat: healedChat };
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
              return { chat: loadedChat };
            },
          }),
          persistMessagesActor: createAsyncLogic({
            run: async ({ input }) => {
              await depsRef().patchChat(input.chatId, 'messages', stampMessageCreatedAt(input.messages));
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
      const binding = await composer;
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

    const transport = new BrowserPlacementChatTransport<MyUIMessage>();
    const chat = createChatInstance({
      chatId,
      transport,
      onFinish: ({ messages, isAbort, isError, isDisconnect }) => {
        /* The host's run first, this page's memory second. The stream that just
         * ended resolved the run from the chat's durable log, and after a
         * reload that is the *only* source — `durableRunId` is whatever reload
         * discovery retained from a workspace claim, which on a reattached chat
         * names a different run or none at all, so a settlement keyed on it
         * reconciled the wrong run or no run (T2-D4). `#syncRunPhase` already
         * reads the two in this order. */
        const durableRunId = getBoundDurableChatRunId(chatId) ?? session.durableRunId;
        if (durableRunId && !isDisconnect) {
          session.durableRunId = durableRunId;
          session.durableRunState = 'terminal';
          this.#reconcileUnsettledRun(session, { runId: durableRunId, isAbort, isError });
        }
        persistenceActorRef.send({ type: 'requestFinished', messages, isAbort, isError, isDisconnect });
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
      /* The turn's owner composed this body; the only bodyless dispatch left is
       * the persistence machine's own transparent auto-retry, which is a second
       * *request* in the turn already running and reuses its body. */
      const requestBody = request.body ? this.startRun(chatId, request.body) : session.activeRunBody;

      queueMicrotask(() => {
        const dispatch = (): void => {
          if (this.#sessions.get(chatId) !== session) {
            // Replaced: its successor owns the chat, and the request lifecycle
            // went with the actor this session stopped.
            return;
          }
          /* A dispatch that cannot run ends its request. Returning silently
           * left `requestLifecycle` in `invoking` forever with no banner — and,
           * since F3, held the session and the turn's lease with it (F4a). */
          const refuse = (reason: string): void => {
            persistenceActorRef.send({
              type: 'setPersistedError',
              error: parseErrorForPersistence(new Error(reason)),
            });
            persistenceActorRef.send({
              type: 'requestFinished',
              messages: chat.messages,
              isAbort: false,
              isError: true,
              isDisconnect: false,
            });
          };
          /* A continuation composes no body and needs none: `reconnectToStream`
           * never reads one, because the host continues the run from its own
           * durable log. Requiring one refused every *Resume* the person
           * pressed after a run had ended — `activeRunBody` is the live run's
           * and the settlement that ended it cleared it — so the turn was
           * admitted and leased and then silently never dispatched (I1). */
          if (requestBody === undefined && request.kind !== 'continue') {
            refuse('No agent configuration is available for this chat.');
            return;
          }
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
                /* `turnIntentOf` refuses this gesture at admission, so only the
                 * microtask between `turnAdmitted` and this dispatch can lose
                 * the message. Kept as a refusal rather than deleted: the
                 * alternative reads `messages[-1]` and throws inside the
                 * microtask, which is the wedge this branch existed to avoid. */
                refuse('That message is no longer in this chat, so it cannot be edited.');
                return;
              }
              const originalMessage = chat.messages[messageIndex]!;
              chat.messages = [...chat.messages.slice(0, messageIndex), editedMessage(originalMessage, request)];
              void chat.regenerate({ body: requestBody });
              return;
            }

            /* Resume the exact admitted run without slicing chat.messages.
             * Whether this turn could be resumed at all was decided by the
             * chat's admission, which is the only owner that knows; reaching a
             * second verdict here is how one refusal came to be answered with
             * a replay of the same failure. */
            case 'continue': {
              /* The one-shot request is only ever consumed by a browser-host
               * stream. Arming it on a placement that cannot read it leaves it
               * set for a later stream this dispatch never asked for. */
              if (isBrowserAgentHostPlaced(chatId)) {
                requestBrowserAgentHostResume(chatId);
              }
              void chat.resumeStream(requestBody === undefined ? {} : { body: requestBody });
            }
          }
        };
        dispatch();
      });
    });

    const stopSubscription = persistenceActorRef.on('dispatchStop', () => {
      /* The host's `cancel`, not only the SDK's abort: a reattached stream
       * carries no abort signal, so the abort alone detached nothing and the
       * run went on (W0.3, D17). A stream this page admitted is cancelled by
       * its abort too; the host answers the second cancel with nothing. */
      void cancelBrowserAgentHostRun(chatId);
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
        if (next === 'ready' && (session.status === 'submitted' || session.status === 'streaming')) {
          /* The request is over; `stopping` is the last lifecycle it reported when the person stopped it (P63). */
          this.#reportRequestEnd(session, session.lastState.lifecycle === 'stopping' ? 'cancelled' : 'completed');
        }
        session.status = next;
        if (next === 'streaming') {
          persistenceActorRef.send({ type: 'streamResumed' });
        }
        if (session.durableRunId && (next === 'submitted' || next === 'streaming')) {
          session.durableRunState = 'active';
        }
      }
      this.#syncChatState(session);
      this.#chatTopics.get(chatId)?.emit();
    });
    const unregisterError = chat['~registerErrorCallback'](() => {
      if (chat.error !== undefined) {
        this.#reportRequestEnd(session, 'failed');
      }
      this.#syncChatState(session);
      this.#chatTopics.get(chatId)?.emit();
    });

    persistenceActorRef.start();
    draftActorRef.start();
    composerRecordRef.start();

    // oxlint-disable-next-line eslint/prefer-const -- assigned after `session.dispose` captures it so immediate actor emissions cannot observe a partial session.
    let lifecycleSubscription: { unsubscribe: () => void } | undefined;
    let requestLifecycleWasActive = false;
    let loading: 'before' | 'loading' | 'loaded' = 'before';
    const chatRoot = createActor(this.#chatSessionLogic, { ...this.#rootOptions, input: { chatId, projectId } });
    session = {
      chatId,
      chat,
      transport,
      projectId,
      chatRoot,
      stateActorRef: chatRoot,
      lastState: {},
      persistenceActorRef,
      draftActorRef,
      composerRecordRef,
      composer,
      composerWork: new Set(),
      viewRefcount: 1,
      runHeld: false,
      durableRunId: undefined,
      durableRunState: undefined,
      reattachedHostId: undefined,
      pendingReattachHostId: undefined,
      seededDispatch: false,
      activeRunBody: undefined,
      status: chat.status,
      placement: undefined,
      turnSubscriptions: [],
      dispose: () => {
        for (const subscription of session.turnSubscriptions) {
          subscription.unsubscribe();
        }
        session.turnSubscriptions = [];
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
      /* A failure the record still holds from an earlier session is said once, when the load lands (P59). */
      if (loading === 'before' && snapshot.context.isLoadingChat) {
        loading = 'loading';
      } else if (loading === 'loading' && !snapshot.context.isLoadingChat) {
        loading = 'loaded';
        this.#replayPersistedFailure(session);
      }
      this.#syncChatState(session);
      this.#flushPendingReattach(session);
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
   * Hand the chat's machine what changed, and only what changed.
   *
   * One place reads the store's facts; the machine owns what they mean. Token
   * deltas never get here — the message callback fires per part, and what it
   * sends is a batched count (F8, A38).
   *
   * @param session - The chat whose facts moved.
   */
  /**
   * Apply a reattach the chat was still loading for.
   *
   * Driven from the persistence actor's own snapshots, which is where the
   * condition that held the request clears. `reattachHostChat` decides again
   * from scratch: a chat that is still loading simply holds it once more.
   *
   * @param session - The session whose load may have settled.
   */
  #flushPendingReattach(session: InternalSession): void {
    const hostId = session.pendingReattachHostId;
    if (hostId !== undefined) {
      this.reattachHostChat({ chatId: session.chatId, hostId });
    }
  }

  #syncChatState(session: InternalSession): void {
    const { lastState, stateActorRef } = session;
    if (session.durableRunState !== lastState.durable) {
      lastState.durable = session.durableRunState;
      if (session.durableRunState !== undefined) {
        stateActorRef.send({ type: 'durableRunState', state: session.durableRunState });
      }
    }
    const snapshot = session.persistenceActorRef.getSnapshot();
    const lifecycle = (['invoking', 'retrying', 'stopping'] as const).find((phaseName) =>
      snapshot.matches({ requestLifecycle: phaseName }),
    );
    if (lifecycle !== lastState.lifecycle) {
      lastState.lifecycle = lifecycle;
      if (lifecycle !== undefined) {
        stateActorRef.send({ type: 'requestLifecycle', phase: lifecycle });
      }
    }
  }

  /**
   * Tell the chat's session actor about a terminal run its log never settled
   * (C6, V10).
   *
   * The reload case: the tab that ran the turn closed before its host appended
   * the settlement row, so the log holds the run's terminal lifecycle and no
   * settlement. The host's M1 appends it at its next reconciliation (W8 TS-S7);
   * the page writes none, and `finishing` only lets the run's record go. The
   * actor refuses this for a turn it admitted itself, so this only ever reaches
   * an adopted run.
   *
   * @param session - The chat whose run just reached a terminal state.
   * @param outcome - The run the log named and how this page saw it end.
   */
  #reconcileUnsettledRun(
    session: InternalSession,
    outcome: Readonly<{ runId: string; isAbort: boolean; isError: boolean }>,
  ): void {
    if (getHostTurnSettlement(session.chatId)?.runId === outcome.runId) {
      return;
    }
    /* How the *run* ended, not how this document's stream ended. A reattach
     * over an abandoned or already-terminal run closes cleanly — nothing
     * aborted and nothing errored — so reading the SDK's flags settled a run
     * the host had recorded `failed` as though it had completed, and the page
     * would have asked the root to record the dead turn's writes as a
     * revision. The stream's flags still decide for a run this document drove,
     * where the host record is this same stream's. */
    const host = getBrowserAgentHostRun(session.chatId);
    const hostOutcome =
      host?.runId === outcome.runId && (host.state === 'failed' || host.state === 'cancelled') ? host.state : undefined;
    session.stateActorRef.send({
      type: 'reconcileSettlement',
      runId: outcome.runId,
      outcome: hostOutcome ?? (outcome.isAbort ? 'cancelled' : outcome.isError ? 'failed' : 'completed'),
    });
  }

  /** Route one host-attested outcome to the chat that owns it. */
  #observeHostTurnSettlement(event: HostTurnSettlement): void {
    const session = this.#sessions.get(event.chatId);
    if (session === undefined) {
      return;
    }
    const { stateActorRef } = session;
    if (stateActorRef.getSnapshot().matches({ run: 'idle' })) {
      this.#replayPersistedSettlement(session);
      return;
    }
    switch (event.type) {
      case 'turn.finalized': {
        stateActorRef.send({
          type: 'turnFinalizedObserved',
          runId: event.runId,
          turnId: event.turnId,
          ...(event.branch === undefined ? {} : { branch: event.branch }),
        });
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
  }

  /** Restore a terminal machine state from the chat log that supplied its transcript. */
  #replayPersistedSettlement(session: InternalSession): void {
    const event = getHostTurnSettlement(session.chatId);
    const { stateActorRef } = session;
    if (event === undefined || !stateActorRef.getSnapshot().matches({ run: 'idle' })) {
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
   * when the chat's load lands, and never over a live run. No `runSettled` goes with it: a
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
    session.stateActorRef.send({ type: 'runLifecycle', phase: 'failed', reason: failure.message });
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

  /**
   * Whether this session's actor is taking a turn right now.
   *
   * An admission is a reference on the session exactly as `runHeld` is, and it
   * is the one window `runHeld` does not cover: that flag is set by `startRun`
   * at *dispatch*, while the lease is taken by the admission before it. So
   * disposing here stopped the actor and then deleted the turn-service registry
   * the abandoned admission's own release reads, and the checkout stayed leased
   * with nothing left that could retire it (T3-D2). Every later state is
   * already held by `runHeld`, and the wait is bounded, so this reference is
   * released by the admission ending either way.
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
      session.durableRunId !== undefined ||
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
    /* The store owns the chat's root. A run it was still counting stops counting with it. */
    const owner = this.#sessionOwner(session);
    if (owner?.getSnapshot().context.runs.includes(session.chatId) === true) {
      owner.send({ type: 'runSettled', chatId: session.chatId });
    }
    session.chatRoot.stop();
    this.#sessions.delete(session.chatId);
    clearChatTurnServices(session.chatId);
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
}
