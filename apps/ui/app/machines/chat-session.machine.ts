import { and, assign, emit, enqueueActions, fromCallback, setup } from 'xstate';
import type { ActorRefFrom, AnyActorRef, EventObject } from 'xstate';
import type { CadAgentExecution, MyUIMessage } from '@taucad/chat';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import type { AttachmentReference } from '#utils/attachment.utils.js';

/**
 * One chat's live state (D32, S45).
 *
 * The machine *is* the agent-state vocabulary of the architecture's
 * "Agent states, mapped to what the sidebar says" table: every row is a state
 * here, reached by the source signal named in that row. Nothing derives a
 * second status from flags — `use-agent-projections.ts` and W20's sidebar read
 * these snapshots.
 *
 * The `host` region is this machine's first owned resource: one
 * {@link ChatHostServices} binding per chat, held for the actor's life and
 * re-invoked only when the turn's placement changes, so the chat's agent-host
 * registration can no longer be emptied by a transcript that truncates under
 * it (policy §16 — the chat session owns the agent-host binding).
 *
 * The `run` region owns the chat's turn, as policy §16 requires: `queued`
 * invokes `admitTurn` — which derives the rewind point, waits out host
 * availability, resolves the model, pre-flights credits and takes the
 * checkout's lease — and `finishing` invokes `settleTurn`, which hands the
 * turn's end to the revision root and persists the outcome. The verbs send
 * `requestTurn` and nothing else; what to dispatch is the admission's answer,
 * emitted as `startTurnRequest` for the request lifecycle to carry out.
 *
 * That ends the deviation this file used to document. A route component
 * (`ProjectChatRunSettlement`) owned settlement, a hook mounted once per
 * transcript message owned the host binding and the "one dispatch at a time"
 * guard, and two machines plus that hook each held an admission policy. One
 * owner refuses what the others could only race over: `requestTurn` while a
 * turn is live queues the gesture instead of leasing a second checkout, and
 * every turn that took a lease passes through `finishing` before this chat can
 * take another.
 *
 * Revision facets (`turnFinalized`, `dirtyChanged`, `syncState`) still arrive
 * through the project session, and the host-attested observations
 * (`turnFinalizedObserved`, `turnFailedObserved`, `turnConflictedObserved`)
 * still settle a run this page did not admit — a reload adopts one rather
 * than re-running it.
 */

/** How the chat's run reached the state it is in. @public */
export type ChatRunPhase = 'admitted' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/** The persistence machine's request lifecycle, coalesced by the adapter. @public */
export type ChatRequestLifecycle = 'idle' | 'invoking' | 'retrying' | 'stopping';

/** What reload discovery says about this chat's server-authoritative run. @public */
export type ChatDurableRunState = 'reattaching' | 'active' | 'terminal';

/** The sync facet of the project's revision status, as this chat sees it. @public */
export type ChatSyncState = 'synced' | 'pending' | 'conflicted';

/**
 * Per-request body the chat-client composes from `useCadAgentConfig` and
 * forwards through the persistence machine to the chat-session-store
 * `dispatchRequest` listener. The listener merges this object into the
 * `chat.sendMessage` / `chat.regenerate` call so the wire body always carries
 * an `agent` block — never the cookie-bleed-prone per-message metadata path.
 *
 * Optional because startup-request hydration can still run before the
 * chat-client mounts; `ChatSessionStore` falls back to the latest published
 * agent body when no explicit body is attached.
 *
 * @public
 */
export type ChatRequestBody = Readonly<Record<string, unknown>>;

export type ChatRequest =
  | { kind: 'send'; message: MyUIMessage; body?: ChatRequestBody }
  | {
      kind: 'regenerate';
      body?: ChatRequestBody;
      /**
       * Execution the body must be composed from, when the dispatcher knows it
       * and the React tree does not yet. The seeded first turn is dispatched
       * from inside `loadChatActor`, one statement before the `chatRetrieved`
       * event that assigns {@link ChatPersistenceMachineContext.activeExecution};
       * without this the bodyless dispatch composes from the un-hydrated
       * cookie fallback and runs the chat's `acp` (or host-pinned Tau) turn as
       * a plain browser Tau turn.
       */
      execution?: CadAgentExecution;
    }
  | {
      kind: 'edit';
      messageId: string;
      content: string;
      /** The edit's attachments, already promoted into the chat's directory. */
      attachments?: readonly AttachmentReference[];
      body?: ChatRequestBody;
    }
  | { kind: 'continue'; body?: ChatRequestBody };

/**
 * What the person did, as the chat's turn owner receives it.
 *
 * One gesture becomes one run over one lease. The payload is everything the
 * admission needs to compose the turn; the rewind point is derived from the
 * transcript by `turnIntentOf`, never carried here.
 *
 * @public
 */
export type ChatTurnGesture =
  | Readonly<{ kind: 'send'; message: MyUIMessage; attachments?: readonly AttachmentReference[] }>
  | Readonly<{ kind: 'edit'; messageId: string; text: string; attachments?: readonly AttachmentReference[] }>
  | Readonly<{ kind: 'regenerate'; execution?: CadAgentExecution }>
  /**
   * *Try again* on an error card: resume the stream if the host can still
   * continue it, and re-run the turn if it cannot. Only the admission knows
   * which, so the two are one gesture here.
   */
  | Readonly<{ kind: 'continue' }>;

/** How a turn ended, as the request lifecycle reported it. @public */
export type ChatTurnOutcome = 'completed' | 'failed' | 'cancelled';

/** The one turn a chat holds: its run, its lease and what it dispatches. @public */
export type ChatTurn = Readonly<{
  /** The admission idempotency key, shared by the lease and the host request. */
  runId: string | undefined;
  /** The user message the checkout's lease is keyed by. */
  leaseTurnId: string | undefined;
  /** What the request lifecycle must dispatch for this turn. */
  request: ChatRequest;
}>;

/** What `settleTurn` is given — the context's own turn, never an event's. @public */
export type ChatTurnSettlementInput = Readonly<{
  chatId: string;
  runId: string | undefined;
  leaseTurnId: string | undefined;
  outcome: ChatTurnOutcome;
}>;

/** Input accepted when creating a chatSessionMachine actor. @public */
export type ChatSessionMachineInput = Readonly<{
  chatId: string;
  projectId: string;
  /** The project session this chat asks for turn settlement. */
  parentRef?: AnyActorRef;
}>;

/** Serializable state owned by chatSessionMachine. @public */
export type ChatSessionMachineContext = Readonly<{
  chatId: string;
  projectId: string;
  parentRef: AnyActorRef | undefined;
  /** Approvals the transport says are outstanding, batched per event (F8). */
  pendingApprovalCount: number;
  /** Tool parts in flight, batched per transport event — never per delta. */
  toolsInFlight: number;
  /** The tool the row names while `running.tool`. */
  toolName: string | undefined;
  /** Why `failed`, for `Failed · <reason>`. */
  failureReason: string | undefined;
  /** The branch the chat's last settled turn landed on. */
  branch: string | undefined;
  /** The run whose lifecycle this actor currently presents. */
  activeRunId: string | undefined;
  /** A matching host outcome that arrived before `run.lifecycle: completed`. */
  pendingSettlement: ChatTurnSettlementObservation | undefined;
  /** Where this chat's next turn runs; the `host` region re-binds when it moves. */
  placement: string;
  /** The turn this chat holds. One slot, so a chat can only hold one (V1). */
  turn: ChatTurn | undefined;
  /** A gesture made while a turn was live; admitted when that turn settles (V2). */
  pendingGesture: ChatTurnGesture | undefined;
  /** How the live turn ended, read by `settleTurn` and by the state it lands in. */
  outcome: ChatTurnOutcome | undefined;
  /** Whether this turn's settlement has already been retried once (T3-D6). */
  settlementRetried: boolean;
}>;

/** One host-attested outcome, kept correlated through the UI state machine. @public */
export type ChatTurnSettlementObservation =
  | {
      readonly type: 'turnFinalizedObserved';
      readonly runId?: string;
      readonly turnId?: string;
      readonly branch?: string;
    }
  | { readonly type: 'turnFailedObserved'; readonly runId?: string; readonly turnId?: string; readonly reason: string }
  | { readonly type: 'turnConflictedObserved'; readonly runId?: string; readonly turnId?: string };

/** Events accepted by chatSessionMachine. @public */
export type ChatSessionMachineEvent =
  | { readonly type: 'runLifecycle'; readonly phase: ChatRunPhase; readonly runId?: string; readonly reason?: string }
  /** The person asked for a turn. The only way a turn is ever started. */
  | { readonly type: 'requestTurn'; readonly gesture: ChatTurnGesture }
  /** `admitTurn`'s answer: the lease is held and the request is composed. */
  | { readonly type: 'turnAdmitted'; readonly turn: ChatTurn }
  /** Reload discovery found a durable run for a chat this page never started (V5). */
  | { readonly type: 'adoptRun'; readonly runId: string }
  /**
   * A terminal run of this chat that the host's log holds no settlement for.
   *
   * The tab that ran it died before the revision root answered, so no
   * attestation is coming and `finishing.observing` would wait forever. The
   * page that adopted the run settles it instead — once; the host refuses a
   * second settlement of a run already settled (V10).
   */
  | { readonly type: 'reconcileSettlement'; readonly runId: string; readonly outcome: ChatTurnOutcome }
  /** The route's live agent selection for this chat; only its placement is state. */
  | { readonly type: 'agentConfigChanged'; readonly placement: string }
  | { readonly type: 'interruptRecorded'; readonly state: 'requested' | 'resolved'; readonly count?: number }
  | { readonly type: 'toolParts'; readonly inFlight: number; readonly approvals: number; readonly toolName?: string }
  | { readonly type: 'requestLifecycle'; readonly phase: ChatRequestLifecycle }
  | { readonly type: 'durableRunState'; readonly state: ChatDurableRunState }
  | { readonly type: 'viewed' }
  /** The project's unread record says this chat is unread on this device (D9). */
  | { readonly type: 'unreadRestored' }
  /** Raised by the machine itself when an approval becomes pending; not sent from outside. */
  | { readonly type: 'approvalPending' }
  | { readonly type: 'close' }
  | { readonly type: 'turnFinalized'; readonly branch: string }
  | ChatTurnSettlementObservation
  | { readonly type: 'dirtyChanged'; readonly dirty: boolean }
  | { readonly type: 'syncState'; readonly state: ChatSyncState };

/** What this chat tells its watchers when anything visible moved. @public */
export type ChatSessionMachineEmitted =
  | { readonly type: 'statusChanged'; readonly chatId: string }
  /** Carry out the admitted turn. The request lifecycle owns the stream, not the turn. */
  | { readonly type: 'startTurnRequest'; readonly chatId: string; readonly request: ChatRequest }
  /** A gesture arrived over a live turn: end its request so the turn can settle. */
  | { readonly type: 'stopTurnRequest'; readonly chatId: string };

/** A live chat session actor. @public */
export type ChatSessionActorRef = ActorRefFrom<typeof chatSessionMachine>;

/**
 * One chat's run, read and revision state.
 *
 * @public
 */
/**
 * Settle a terminal run of this chat that the host's log holds no settlement
 * for (C6, V10).
 *
 * Accepted only where the chat is not mid-turn: a turn this page admitted is
 * already on its way through `finishing.settling`, and the settlement it waits
 * for is the very one this event reports missing. Sent by the store, which
 * reads the log — so a run settled by this transition is not reported again;
 * and a page that asks twice regardless is refused by the host, which is where
 * exactly-once actually lives.
 */
const reconcileSettlementTransition = {
  guard: 'hasNoOwnTurn',
  target: '#chat-session.run.finishing.settling',
  actions: ['adoptSettlementTarget', 'announce'],
} as const;

export const chatSessionMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as ChatSessionMachineContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as ChatSessionMachineEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as ChatSessionMachineInput,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as ChatSessionMachineEmitted,
  },
  actors: {
    /* Replaced by `sessions-store.ts` with the real registration. The default
     * keeps this file free of the transport, the DOM and React, which is what
     * lets the machine's own rows run headless. */
    hostBinding: fromCallback<EventObject, { readonly chatId: string; readonly placement: string }>(
      () => () => undefined,
    ),
    /* Also replaced by `sessions-store.ts`. The defaults refuse rather than
     * pretend: a chat whose turn host has not published its services cannot
     * admit a turn, and saying so is what puts the reason on the banner. */
    admitTurn: fromSafeAsync<
      { readonly type: 'turnAdmitted'; readonly turn: ChatTurn },
      { readonly chatId: string; readonly gesture: ChatTurnGesture }
    >(async ({ input }) => {
      throw new Error(`This chat (${input.chatId}) has no turn host to admit a turn.`);
    }),
    settleTurn: fromSafeAsync<void, ChatTurnSettlementInput>(async () => undefined),
  },
  guards: {
    /* A turn this page admitted. The host-attested observations still settle a
     * run it did not — an adopted one after a reload — so every branch that
     * behaves differently for the two asks this. */
    hasOwnTurn: ({ context }) => context.turn !== undefined,
    hasNoOwnTurn: ({ context }) => context.turn === undefined,
    hasPendingGesture: ({ context }) => context.pendingGesture !== undefined,
    canRetrySettlement: ({ context }) => !context.settlementRetried,
    settledAsFailed: ({ context }) => context.outcome === 'failed',
    settledAsCancelled: ({ context }) => context.outcome === 'cancelled',
    placementChanged: ({ context, event }) =>
      event.type === 'agentConfigChanged' && event.placement !== context.placement,
    /* A tool part in flight is what "running a tool" means; deltas never get
     * here, so `running` with nothing in flight is generating (the table). */
    isToolInFlight: ({ context }) => context.toolsInFlight > 0,
    hasApprovals: ({ context }) => context.pendingApprovalCount > 0,
    isApprovalRequested: ({ event }) => event.type === 'interruptRecorded' && event.state === 'requested',
    isRetrying: ({ event }) => event.type === 'requestLifecycle' && event.phase === 'retrying',
    isStopping: ({ event }) => event.type === 'requestLifecycle' && event.phase === 'stopping',
    isReattaching: ({ event }) => event.type === 'durableRunState' && event.state === 'reattaching',
    matchesActiveRun: ({ context, event }) =>
      (event.type === 'turnFinalizedObserved' ||
        event.type === 'turnFailedObserved' ||
        event.type === 'turnConflictedObserved') &&
      event.runId === context.activeRunId,
    completedWithFinalizedSettlement: ({ context, event }) =>
      event.type === 'runLifecycle' &&
      event.phase === 'completed' &&
      context.pendingSettlement?.type === 'turnFinalizedObserved' &&
      context.pendingSettlement.runId === (event.runId ?? context.activeRunId),
    completedWithFailedSettlement: ({ context, event }) =>
      event.type === 'runLifecycle' &&
      event.phase === 'completed' &&
      context.pendingSettlement?.type === 'turnFailedObserved' &&
      context.pendingSettlement.runId === (event.runId ?? context.activeRunId),
    completedWithConflictedSettlement: ({ context, event }) =>
      event.type === 'runLifecycle' &&
      event.phase === 'completed' &&
      context.pendingSettlement?.type === 'turnConflictedObserved' &&
      context.pendingSettlement.runId === (event.runId ?? context.activeRunId),
  },
  actions: {
    announce: emit(({ context }) => ({ type: 'statusChanged', chatId: context.chatId }) as const),
    /* The run is over: whatever the transport last said about tools and
     * approvals is no longer true of this chat. */
    clearRunDetail: assign({ pendingApprovalCount: 0, toolsInFlight: 0, toolName: undefined }),
    captureRunIdentity: assign(({ context, event }) => {
      if (event.type !== 'runLifecycle' || event.runId === undefined) {
        return {};
      }
      return event.runId === context.activeRunId
        ? { activeRunId: event.runId }
        : { activeRunId: event.runId, pendingSettlement: undefined, failureReason: undefined };
    }),
    bufferSettlement: assign({
      pendingSettlement: ({ event }) =>
        event.type === 'turnFinalizedObserved' ||
        event.type === 'turnFailedObserved' ||
        event.type === 'turnConflictedObserved'
          ? event
          : undefined,
    }),
    clearPendingSettlement: assign({ pendingSettlement: undefined }),
    /* Listed before the count's `assign`, so the check reads the old count. The
     * `read` region cannot take `toolParts` itself: its transition would
     * pre-empt the root's, and the count would never move. */
    raiseApprovalPending: enqueueActions(({ context, event, enqueue }) => {
      /* The store's second unread trigger (D9): an approval that was not pending a moment ago. */
      const requested =
        (event.type === 'toolParts' && event.approvals > 0) ||
        (event.type === 'interruptRecorded' && event.state === 'requested');
      if (requested && context.pendingApprovalCount === 0) {
        enqueue.raise({ type: 'approvalPending' });
      }
    }),
    recordPlacement: assign({
      placement: ({ context, event }) => (event.type === 'agentConfigChanged' ? event.placement : context.placement),
    }),
    recordGesture: assign({
      pendingGesture: ({ context, event }) => (event.type === 'requestTurn' ? event.gesture : context.pendingGesture),
    }),
    adoptTurn: assign(({ context, event }) =>
      event.type === 'turnAdmitted'
        ? {
            turn: event.turn,
            pendingGesture: undefined,
            failureReason: undefined,
            settlementRetried: false,
            /* A `continue` resumes the run the host already has and mints none,
             * so its turn carries no run id. Adopting that `undefined` as the
             * chat's run identity dropped every host-attested observation and
             * left `settleTurn` with nothing to name (T3-D7). */
            activeRunId: event.turn.runId ?? context.activeRunId,
          }
        : { turn: context.turn },
    ),
    clearTurn: assign({ turn: undefined, outcome: undefined, settlementRetried: false }),
    adoptSettlementTarget: assign(({ context, event }) =>
      event.type === 'reconcileSettlement'
        ? { activeRunId: event.runId, outcome: event.outcome }
        : { activeRunId: context.activeRunId },
    ),
    recordOutcome: assign({
      outcome: ({ context, event }) =>
        event.type === 'runLifecycle' && event.phase !== 'admitted' && event.phase !== 'running'
          ? event.phase === 'paused'
            ? context.outcome
            : event.phase
          : context.outcome,
    }),
    recordRunFailure: assign({
      failureReason: ({ context, event }) =>
        event.type === 'runLifecycle' && event.phase === 'failed' ? event.reason : context.failureReason,
    }),
    /* Not `recordActorFailure`: the lease was never released — that is what
     * failed — so the turn is what the retry and any later reconciliation name,
     * and the queued gesture is the person's next message (T3-D6). */
    recordSettlementFailure: assign({
      failureReason: ({ context, event }) => {
        const failure: unknown = 'error' in event ? event.error : undefined;
        return failure instanceof Error ? failure.message : (context.failureReason ?? 'the turn could not be settled');
      },
    }),
    recordSettlementRetry: assign({ settlementRetried: true }),
    recordActorFailure: assign({
      failureReason: ({ context, event }) => {
        const failure: unknown = 'error' in event ? event.error : undefined;
        return failure instanceof Error ? failure.message : (context.failureReason ?? 'the turn could not start');
      },
      turn: undefined,
      pendingGesture: undefined,
      outcome: undefined,
    }),
    dispatchTurn: emit(({ context, event }) => ({
      type: 'startTurnRequest',
      chatId: context.chatId,
      request: event.type === 'turnAdmitted' ? event.turn.request : context.turn!.request,
    })),
    interruptTurn: emit(({ context }) => ({ type: 'stopTurnRequest', chatId: context.chatId })),
    adoptDiscoveredRun: assign({
      activeRunId: ({ context, event }) => (event.type === 'adoptRun' ? event.runId : context.activeRunId),
    }),
    recordPendingFailure: assign({
      failureReason: ({ context }) =>
        context.pendingSettlement?.type === 'turnFailedObserved'
          ? context.pendingSettlement.reason
          : 'revision conflict',
    }),
  },
}).createMachine({
  id: 'chat-session',
  context: ({ input }) => ({
    chatId: input.chatId,
    projectId: input.projectId,
    parentRef: input.parentRef,
    pendingApprovalCount: 0,
    toolsInFlight: 0,
    toolName: undefined,
    failureReason: undefined,
    branch: undefined,
    activeRunId: undefined,
    pendingSettlement: undefined,
    placement: '',
    turn: undefined,
    pendingGesture: undefined,
    outcome: undefined,
    settlementRetried: false,
  }),
  type: 'parallel',
  on: {
    /* Batched per transport event (F8): one frame carries the whole tool
     * picture, so a fifty-part turn is one transition. */
    toolParts: {
      actions: [
        'raiseApprovalPending',
        assign({
          toolsInFlight: ({ event }) => event.inFlight,
          pendingApprovalCount: ({ event }) => event.approvals,
          toolName: ({ event, context }) => event.toolName ?? context.toolName,
        }),
        'announce',
      ],
    },
    interruptRecorded: {
      actions: [
        'raiseApprovalPending',
        assign({
          pendingApprovalCount: ({ event, context }) =>
            event.count ?? (event.state === 'requested' ? Math.max(context.pendingApprovalCount, 1) : 0),
        }),
        'announce',
      ],
    },
  },
  states: {
    run: {
      initial: 'idle',
      states: {
        /* No session, no run. */
        idle: {
          on: {
            reconcileSettlement: reconcileSettlementTransition,
          },
        },
        queued: {
          initial: 'observing',
          states: {
            /* A run the transport reported, for a turn this page did not admit
             * — a reload, or another tab's. There is nothing to admit here, and
             * a gesture over it waits for it to settle like any other. */
            observing: {
              on: { requestTurn: { actions: ['recordGesture', 'interruptTurn', 'announce'] } },
            },
            admitting: {
              invoke: {
                id: 'admitTurn',
                src: 'admitTurn',
                input: ({ context }) => ({ chatId: context.chatId, gesture: context.pendingGesture! }),
                onError: {
                  target: '#chat-session.run.failed',
                  actions: ['recordActorFailure', 'clearRunDetail', 'announce'],
                },
              },
              on: {
                turnAdmitted: { target: 'dispatched', actions: ['adoptTurn', 'dispatchTurn', 'announce'] },
              },
            },
            /* The lease is held and the request is out; the transport's own
             * lifecycle takes the run from here. A gesture made in this state
             * is over a live turn exactly as one made in `running` is — the
             * transport reports `running` only once bytes flow. */
            dispatched: {
              on: { requestTurn: { actions: ['recordGesture', 'interruptTurn', 'announce'] } },
            },
          },
          on: {
            turnFinalizedObserved: { guard: 'matchesActiveRun', actions: 'bufferSettlement' },
            turnFailedObserved: { guard: 'matchesActiveRun', actions: 'bufferSettlement' },
            turnConflictedObserved: { guard: 'matchesActiveRun', actions: 'bufferSettlement' },
          },
        },
        running: {
          initial: 'generating',
          states: {
            generating: {
              always: [
                { guard: 'hasApprovals', target: 'waiting.approval' },
                { guard: 'isToolInFlight', target: 'tool' },
              ],
            },
            tool: {
              always: [
                { guard: 'hasApprovals', target: 'waiting.approval' },
                { guard: ({ context }) => context.toolsInFlight === 0, target: 'generating' },
              ],
            },
            waiting: {
              initial: 'approval',
              states: {
                approval: {
                  always: [
                    {
                      guard: ({ context }) => context.pendingApprovalCount === 0 && context.toolsInFlight > 0,
                      target: '#chat-session.run.running.tool',
                    },
                    {
                      guard: ({ context }) => context.pendingApprovalCount === 0,
                      target: '#chat-session.run.running.generating',
                    },
                  ],
                },
                input: {},
              },
            },
            reconnecting: {},
          },
          on: {
            turnFinalizedObserved: { guard: 'matchesActiveRun', actions: 'bufferSettlement' },
            turnFailedObserved: { guard: 'matchesActiveRun', actions: 'bufferSettlement' },
            turnConflictedObserved: { guard: 'matchesActiveRun', actions: 'bufferSettlement' },
            requestLifecycle: [
              { guard: 'isRetrying', target: '.reconnecting' },
              { guard: 'isStopping', target: 'stopped', actions: ['clearRunDetail', 'announce'] },
              /* `invoking` is a request in flight; the `generating` guards route
               * it straight back to a tool or an approval when one is open. */
              { guard: ({ event }) => event.phase === 'invoking', target: '.generating' },
            ],
            durableRunState: { guard: 'isReattaching', target: '.reconnecting' },
            /* V2: a gesture over a live turn never asks for a second lease. It
             * is held until this turn settles, and the request it interrupts
             * is what makes that happen. */
            requestTurn: { actions: ['recordGesture', 'interruptTurn', 'announce'] },
            interruptRecorded: {
              guard: 'isApprovalRequested',
              target: '.waiting.approval',
              actions: [
                'raiseApprovalPending',
                assign({
                  pendingApprovalCount: ({ event, context }) =>
                    event.count ?? Math.max(context.pendingApprovalCount, 1),
                }),
                'announce',
              ],
            },
          },
        },
        finishing: {
          initial: 'deciding',
          states: {
            deciding: {
              always: [{ guard: 'hasOwnTurn', target: 'settling' }, { target: 'observing' }],
            },
            /* The turn's end, handed to its owner. Never interrupted: a gesture
             * made while this runs is held in `pendingGesture` and admitted
             * from `onDone`, so exactly one settlement is attempted per turn
             * that took a lease (V4, V10). */
            settling: {
              invoke: {
                id: 'settleTurn',
                src: 'settleTurn',
                input: ({ context }) => ({
                  chatId: context.chatId,
                  /* A reconciled run took no lease here, so it has no turn —
                   * the run it settles is the one this chat is holding. */
                  runId: context.turn?.runId ?? context.activeRunId,
                  leaseTurnId: context.turn?.leaseTurnId,
                  outcome: context.outcome ?? 'completed',
                }),
                onDone: [
                  {
                    guard: 'hasPendingGesture',
                    target: '#chat-session.run.queued.admitting',
                    actions: ['clearTurn', 'clearPendingSettlement', 'announce'],
                  },
                  {
                    guard: 'settledAsCancelled',
                    target: '#chat-session.run.stopped',
                    actions: ['clearTurn', 'clearPendingSettlement', 'announce'],
                  },
                  {
                    guard: 'settledAsFailed',
                    target: '#chat-session.run.failed',
                    actions: ['clearTurn', 'clearPendingSettlement', 'announce'],
                  },
                  {
                    target: '#chat-session.run.done',
                    actions: ['clearTurn', 'clearPendingSettlement', 'announce'],
                  },
                ],
                onError: [
                  {
                    /* One retry, in place: a settlement that rejected left the
                     * lease held and — when the failure cleared the turn — left
                     * nothing that could ever name the run holding it. */
                    guard: 'canRetrySettlement',
                    target: 'settling',
                    reenter: true,
                    actions: ['recordSettlementRetry', 'recordSettlementFailure', 'announce'],
                  },
                  {
                    target: '#chat-session.run.failed',
                    actions: ['recordSettlementFailure', 'announce'],
                  },
                ],
              },
            },
            /* A run this page did not admit: its outcome is the host's to
             * attest, and it arrives on the settlement observations below. */
            observing: {},
          },
          on: {
            /* Only for a run this page did not admit. `settleTurn` awaits the
             * same attestation itself, and its `onDone` is the one transition
             * that ends an owned turn.
             *
             * A gesture made over an adopted run is held exactly as one made
             * over an owned turn is (V2), so the attestation that ends the run
             * is also what admits it — otherwise the turn the person asked for
             * while the page was catching up stays queued behind a run that
             * has already finished. */
            turnFinalizedObserved: [
              {
                guard: and(['hasNoOwnTurn', 'matchesActiveRun', 'hasPendingGesture']),
                target: '#chat-session.run.queued.admitting',
                actions: 'announce',
              },
              {
                guard: and(['hasNoOwnTurn', 'matchesActiveRun']),
                target: 'done',
                actions: 'announce',
              },
            ],
            turnFailedObserved: [
              {
                guard: and(['hasNoOwnTurn', 'matchesActiveRun', 'hasPendingGesture']),
                target: '#chat-session.run.queued.admitting',
                actions: [assign({ failureReason: ({ event }) => event.reason }), 'announce'],
              },
              {
                guard: and(['hasNoOwnTurn', 'matchesActiveRun']),
                target: 'failed',
                actions: [assign({ failureReason: ({ event }) => event.reason }), 'announce'],
              },
            ],
            turnConflictedObserved: [
              {
                guard: and(['hasNoOwnTurn', 'matchesActiveRun', 'hasPendingGesture']),
                target: '#chat-session.run.queued.admitting',
                actions: [assign({ failureReason: 'revision conflict' }), 'announce'],
              },
              {
                guard: and(['hasNoOwnTurn', 'matchesActiveRun']),
                target: 'failed',
                actions: [assign({ failureReason: 'revision conflict' }), 'announce'],
              },
            ],
            requestTurn: { actions: ['recordGesture', 'announce'] },
            reconcileSettlement: reconcileSettlementTransition,
          },
        },
        done: {},
        failed: { on: { reconcileSettlement: reconcileSettlementTransition } },
        stopped: { on: { reconcileSettlement: reconcileSettlementTransition } },
      },
      on: {
        /* The one way a turn starts. Every verb sends this and nothing else;
         * `queued.admitting` is where the lease is taken (V1, V2). A second
         * gesture re-enters the state, which aborts the admission in flight —
         * that actor abandons its own lease and no other (V4). */
        requestTurn: {
          target: '.queued.admitting',
          reenter: true,
          actions: ['recordGesture', 'announce'],
        },
        runLifecycle: [
          {
            /* Our own admission's echo: the transport reporting the run this
             * chat just leased. Re-entering `queued` here would restart the
             * admission that produced it. */
            guard: and(['hasOwnTurn', ({ event }) => event.phase === 'admitted']),
            actions: ['captureRunIdentity', 'announce'],
          },
          {
            guard: ({ event }) => event.phase === 'admitted',
            target: '.queued',
            actions: ['captureRunIdentity', 'announce'],
          },
          {
            guard: ({ event }) => event.phase === 'running',
            target: '.running',
            actions: ['captureRunIdentity', 'announce'],
          },
          {
            guard: ({ event }) => event.phase === 'paused',
            target: '.running.waiting.input',
            actions: ['captureRunIdentity', 'announce'],
          },
          {
            /* V4: every turn that took a lease passes through `finishing`.
             * A failed or cancelled run used to reach its terminal state
             * directly, which is why a refused turn's settlement record was a
             * matter of whether the stream outlived the revision root (F6). */
            guard: and(['hasOwnTurn', ({ event }) => event.phase !== 'paused']),
            target: '.finishing',
            actions: ['captureRunIdentity', 'recordOutcome', 'recordRunFailure', 'clearRunDetail', 'announce'],
          },
          {
            guard: 'completedWithFinalizedSettlement',
            target: '.done',
            actions: ['captureRunIdentity', 'clearRunDetail', 'clearPendingSettlement', 'announce'],
          },
          {
            guard: 'completedWithFailedSettlement',
            target: '.failed',
            actions: [
              'captureRunIdentity',
              'recordPendingFailure',
              'clearRunDetail',
              'clearPendingSettlement',
              'announce',
            ],
          },
          {
            guard: 'completedWithConflictedSettlement',
            target: '.failed',
            actions: [
              'captureRunIdentity',
              'recordPendingFailure',
              'clearRunDetail',
              'clearPendingSettlement',
              'announce',
            ],
          },
          {
            guard: ({ event }) => event.phase === 'completed',
            target: '.finishing',
            actions: ['captureRunIdentity', 'clearRunDetail', 'announce'],
          },
          {
            guard: ({ event }) => event.phase === 'failed',
            target: '.failed',
            actions: [
              'captureRunIdentity',
              assign({ failureReason: ({ event }) => event.reason }),
              'clearRunDetail',
              'clearPendingSettlement',
              'announce',
            ],
          },
          {
            guard: ({ event }) => event.phase === 'cancelled',
            target: '.stopped',
            actions: ['captureRunIdentity', 'clearRunDetail', 'clearPendingSettlement', 'announce'],
          },
        ],
        /* Reload discovery can substantiate a run for a chat that never left
         * `idle` on this page (`retainDurableRun`). */
        durableRunState: { guard: 'isReattaching', target: '.running.reconnecting', actions: 'announce' },
        /*
         * V5: discovery substantiates a run only for a chat that is holding
         * nothing — anywhere else it would retire a live turn. The guard is
         * what says that; restricting it to `idle` as well meant a chat whose
         * machine had already reached `done`, `failed` or `stopped` while a run
         * of that chat was still live elsewhere never adopted it, and the next
         * gesture leased a second checkout over the live one (T3-D10).
         */
        adoptRun: {
          guard: 'hasNoOwnTurn',
          target: '.running.reconnecting',
          actions: ['adoptDiscoveredRun', 'announce'],
        },
        /*
         * *Close* on a chat (A35, P63).
         *
         * The cancel belongs to the run's owner — the store dispatches
         * `stopRequest` to the persistence machine, whose settlement comes back
         * here as `runLifecycle{phase:'cancelled'}` and releases the lease with
         * it. This machine only records that the person stopped, and it stays
         * alive so the row reads `Stopped`: telling the project session to let
         * go would stop this actor and blank the row.
         */
        close: { target: '.stopped', actions: ['clearRunDetail', 'announce'] },
      },
    },
    /*
     * The chat's agent-host binding (C1, V6).
     *
     * One invocation for the actor's life, re-entered only when the placement
     * moves — a chat that switches from this browser to a daemon rebinds once,
     * not once per render of every transcript message.
     */
    host: {
      initial: 'bound',
      states: {
        bound: {
          invoke: {
            id: 'hostBinding',
            src: 'hostBinding',
            input: ({ context }) => ({ chatId: context.chatId, placement: context.placement }),
          },
          on: {
            agentConfigChanged: [
              { guard: 'placementChanged', actions: 'recordPlacement', target: 'bound', reenter: true },
              { actions: 'recordPlacement' },
            ],
          },
        },
      },
    },
    read: {
      initial: 'read',
      states: {
        read: {
          on: {
            runLifecycle: {
              /* P57: a run that *failed* while the person was elsewhere is as
               * unseen as one that finished. The architecture's project row is
               * red for "a run failed and is unread", which this is what makes
               * reachable. */
              guard: ({ event }) => event.phase === 'completed' || event.phase === 'failed',
              target: 'unread',
              actions: 'announce',
            },
            unreadRestored: { target: 'unread', actions: 'announce' },
            approvalPending: { target: 'unread', actions: 'announce' },
          },
        },
        unread: { on: { viewed: { target: 'read', actions: 'announce' } } },
      },
    },
    revision: {
      type: 'parallel',
      states: {
        line: {
          initial: 'onMain',
          states: {
            onMain: {},
            onBranch: {},
          },
          on: {
            turnFinalized: [
              {
                guard: ({ event }) => event.branch !== 'main',
                target: '.onBranch',
                actions: [assign({ branch: ({ event }) => event.branch }), 'announce'],
              },
              { target: '.onMain', actions: [assign({ branch: ({ event }) => event.branch }), 'announce'] },
            ],
          },
        },
        tree: {
          initial: 'clean',
          states: { clean: {}, dirty: {} },
          on: {
            dirtyChanged: [
              { guard: ({ event }) => event.dirty, target: '.dirty', actions: 'announce' },
              { target: '.clean', actions: 'announce' },
            ],
          },
        },
        sync: {
          initial: 'synced',
          states: { synced: {}, pending: {}, conflicted: {} },
          on: {
            syncState: [
              { guard: ({ event }) => event.state === 'pending', target: '.pending', actions: 'announce' },
              { guard: ({ event }) => event.state === 'conflicted', target: '.conflicted', actions: 'announce' },
              { target: '.synced', actions: 'announce' },
            ],
          },
        },
      },
    },
  },
});
