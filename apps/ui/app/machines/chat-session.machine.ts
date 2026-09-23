import { createCallbackLogic, setup, types } from 'xstate';
import type { ActorRefFrom, AnyActorRef, EnqueueObject, EventObject, SystemRegistry } from 'xstate';
import type { CadAgentExecution, MyUIMessage } from '@taucad/chat';
import { eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';
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

const chatSessionActors = {
  /* Replaced by `sessions-store.ts` with the real registration. The default
   * keeps this file free of the transport, the DOM and React, which is what
   * lets the machine's own rows run headless. */
  hostBinding: createCallbackLogic<EventObject, { readonly chatId: string; readonly placement: string }>(
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
};

type ChatSessionEnqueue = EnqueueObject<
  ChatSessionMachineEvent,
  ChatSessionMachineEmitted,
  SystemRegistry,
  typeof chatSessionActors
>;
type ChatSessionPatch = Partial<ChatSessionMachineContext>;
type ChatSessionArgs<EventUnion> = Readonly<{ context: ChatSessionMachineContext; event: EventUnion }>;
type EventOf<EventType extends ChatSessionMachineEvent['type']> = Extract<ChatSessionMachineEvent, { type: EventType }>;

const announce = (context: ChatSessionMachineContext, enq: ChatSessionEnqueue): void => {
  enq.emit({ type: 'statusChanged', chatId: context.chatId });
};

/* The run is over: whatever the transport last said about tools and
 * approvals is no longer true of this chat. */
const clearRunDetail = { pendingApprovalCount: 0, toolsInFlight: 0, toolName: undefined } as const;
const clearTurn = { turn: undefined, outcome: undefined, settlementRetried: false } as const;

const captureRunIdentity = (context: ChatSessionMachineContext, event: EventOf<'runLifecycle'>): ChatSessionPatch => {
  if (event.runId === undefined) {
    return {};
  }
  return event.runId === context.activeRunId
    ? { activeRunId: event.runId }
    : { activeRunId: event.runId, pendingSettlement: undefined, failureReason: undefined };
};

/* Read before the count moves, so the check sees the old count. The `read`
 * region cannot take `toolParts` itself: its transition would pre-empt the
 * root's, and the count would never move. */
const raiseApprovalPending = (
  context: ChatSessionMachineContext,
  requested: boolean,
  enq: ChatSessionEnqueue,
): void => {
  /* The store's second unread trigger (D9): an approval that was not pending a moment ago. */
  if (requested && context.pendingApprovalCount === 0) {
    enq.raise({ type: 'approvalPending' });
  }
};

/* V2: a gesture over a live turn never asks for a second lease. It is held
 * until this turn settles, and the request it interrupts is what makes that
 * happen. */
const holdGesture = ({ context, event }: ChatSessionArgs<EventOf<'requestTurn'>>, enq: ChatSessionEnqueue) => {
  enq.emit({ type: 'stopTurnRequest', chatId: context.chatId });
  announce(context, enq);
  return { context: { pendingGesture: event.gesture } };
};

/* Buffered until `run.lifecycle: completed` for the run this chat presents. */
const bufferSettlement = ({ context, event }: ChatSessionArgs<ChatTurnSettlementObservation>) =>
  event.runId === context.activeRunId ? { context: { pendingSettlement: event } } : undefined;

const failureMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/* Not the actor-failure record: the lease was never released — that is what
 * failed — so the turn is what the retry and any later reconciliation name,
 * and the queued gesture is the person's next message (T3-D6). */
const recordSettlementFailure = (context: ChatSessionMachineContext, error: unknown): ChatSessionPatch => ({
  failureReason: failureMessage(error, context.failureReason ?? 'the turn could not be settled'),
});

/**
 * An adopted run's attestation ends it — and admits a gesture held over it
 * (V2), or the turn the person asked for while the page was catching up stays
 * queued behind a run that has already finished.
 */
const observedSettlement =
  (target: 'done' | 'failed', failureReason?: (event: ChatTurnSettlementObservation) => string) =>
  ({ context, event }: ChatSessionArgs<ChatTurnSettlementObservation>, enq: ChatSessionEnqueue) => {
    if (context.turn !== undefined || event.runId !== context.activeRunId) {
      return undefined;
    }
    announce(context, enq);
    const patch = failureReason === undefined ? {} : { failureReason: failureReason(event) };
    return {
      target: context.pendingGesture === undefined ? target : '#chat-session.run.queued.admitting',
      context: patch,
    };
  };

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
const reconcileSettlementTransition = (
  { context, event }: ChatSessionArgs<EventOf<'reconcileSettlement'>>,
  enq: ChatSessionEnqueue,
) => {
  if (context.turn !== undefined) {
    return undefined;
  }
  announce(context, enq);
  return {
    target: '#chat-session.run.finishing.settling',
    context: { activeRunId: event.runId, outcome: event.outcome },
  };
};

/**
 * Take on a run of this chat that is live somewhere else (V5).
 *
 * Accepted from the states that are holding nothing *and* doing nothing: a
 * chat whose machine is idle, or has reached a terminal row while one of its
 * runs is still in flight elsewhere — navigate away and back mid-run (T3-D10).
 * Not from the states in between. `turn === undefined` alone does not say that:
 * it is true for the whole admission window, because the lease is taken before
 * `turn` exists, and true again in the `finishing.settling` a *reconciled*
 * settlement runs in. Handled at the root it was honoured in both, and
 * discovery then stopped the actor that owned the work — the admission of a
 * gesture `#bindSessionOwner` had flushed one statement earlier, or the only
 * settlement an adopted run will ever get.
 */
const adoptRunTransition = ({ context, event }: ChatSessionArgs<EventOf<'adoptRun'>>, enq: ChatSessionEnqueue) => {
  if (context.turn !== undefined) {
    return undefined;
  }
  announce(context, enq);
  return { target: '#chat-session.run.running.reconnecting', context: { activeRunId: event.runId } };
};

/* The completed run's settlement arrived first: land where it said. */
const pendingSettlementFor = (
  context: ChatSessionMachineContext,
  event: EventOf<'runLifecycle'>,
): ChatTurnSettlementObservation | undefined =>
  event.phase === 'completed' && context.pendingSettlement?.runId === (event.runId ?? context.activeRunId)
    ? context.pendingSettlement
    : undefined;

const runLifecycle = ({ context, event }: ChatSessionArgs<EventOf<'runLifecycle'>>, enq: ChatSessionEnqueue) => {
  const identity = captureRunIdentity(context, event);
  announce(context, enq);
  if (event.phase === 'admitted') {
    /* Our own admission's echo: the transport reporting the run this chat just
     * leased. Re-entering `queued` here would restart the admission that
     * produced it. */
    return context.turn === undefined ? { target: '.queued', context: identity } : { context: identity };
  }
  if (event.phase === 'running') {
    return { target: '.running', context: identity };
  }
  if (event.phase === 'paused') {
    return { target: '.running.waiting.input', context: identity };
  }
  /* V4: every turn that took a lease passes through `finishing`. A failed or
   * cancelled run used to reach its terminal state directly, which is why a
   * refused turn's settlement record was a matter of whether the stream
   * outlived the revision root (F6). */
  if (context.turn !== undefined) {
    return {
      target: '.finishing',
      context: {
        ...identity,
        outcome: event.phase,
        failureReason: event.phase === 'failed' ? event.reason : context.failureReason,
        ...clearRunDetail,
      },
    };
  }
  const settled = pendingSettlementFor(context, event);
  if (settled !== undefined) {
    return settled.type === 'turnFinalizedObserved'
      ? { target: '.done', context: { ...identity, ...clearRunDetail, pendingSettlement: undefined } }
      : {
          target: '.failed',
          context: {
            ...identity,
            failureReason: settled.type === 'turnFailedObserved' ? settled.reason : 'revision conflict',
            ...clearRunDetail,
            pendingSettlement: undefined,
          },
        };
  }
  if (event.phase === 'completed') {
    return { target: '.finishing', context: { ...identity, ...clearRunDetail } };
  }
  if (event.phase === 'failed') {
    return {
      target: '.failed',
      context: { ...identity, failureReason: event.reason, ...clearRunDetail, pendingSettlement: undefined },
    };
  }
  return { target: '.stopped', context: { ...identity, ...clearRunDetail, pendingSettlement: undefined } };
};

/* Where the settled turn lands: a held gesture first, then its outcome. */
const settledTarget = (context: ChatSessionMachineContext): string => {
  if (context.pendingGesture !== undefined) {
    return '#chat-session.run.queued.admitting';
  }
  if (context.outcome === 'cancelled') {
    return '#chat-session.run.stopped';
  }
  return context.outcome === 'failed' ? '#chat-session.run.failed' : '#chat-session.run.done';
};

const settleOnDone = ({ context }: ChatSessionArgs<unknown>, enq: ChatSessionEnqueue) => {
  announce(context, enq);
  return { target: settledTarget(context), context: { ...clearTurn, pendingSettlement: undefined } };
};

/* A tool part in flight is what "running a tool" means; deltas never get here,
 * so `running` with nothing in flight is generating (the table). */
const runningRow = (context: ChatSessionMachineContext): 'approval' | 'tool' | 'generating' => {
  if (context.pendingApprovalCount > 0) {
    return 'approval';
  }
  return context.toolsInFlight > 0 ? 'tool' : 'generating';
};

/**
 * One chat's run, read and revision state.
 *
 * @public
 */
export const chatSessionMachine = setup({
  schemas: {
    context: types<ChatSessionMachineContext>(),
    events: eventSchemas<ChatSessionMachineEvent>(),
    input: types<ChatSessionMachineInput>(),
    emitted: eventSchemas<ChatSessionMachineEmitted>(),
  },
  actors: chatSessionActors,
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
    toolParts: ({ context, event }, enq) => {
      raiseApprovalPending(context, event.approvals > 0, enq);
      announce(context, enq);
      return {
        context: {
          toolsInFlight: event.inFlight,
          pendingApprovalCount: event.approvals,
          toolName: event.toolName ?? context.toolName,
        },
      };
    },
    interruptRecorded: ({ context, event }, enq) => {
      raiseApprovalPending(context, event.state === 'requested', enq);
      announce(context, enq);
      return {
        context: {
          pendingApprovalCount:
            event.count ?? (event.state === 'requested' ? Math.max(context.pendingApprovalCount, 1) : 0),
        },
      };
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
            adoptRun: adoptRunTransition,
          },
        },
        queued: {
          initial: 'observing',
          states: {
            /* A run the transport reported, for a turn this page did not admit
             * — a reload, or another tab's. There is nothing to admit here, and
             * a gesture over it waits for it to settle like any other. */
            observing: {
              on: { requestTurn: holdGesture },
            },
            admitting: {
              invoke: {
                id: 'admitTurn',
                src: 'admitTurn',
                input: ({ context }) => ({ chatId: context.chatId, gesture: context.pendingGesture! }),
                onError: ({ context, event }, enq) => {
                  announce(context, enq);
                  return {
                    target: '#chat-session.run.failed',
                    context: {
                      failureReason: failureMessage(event.error, context.failureReason ?? 'the turn could not start'),
                      turn: undefined,
                      pendingGesture: undefined,
                      outcome: undefined,
                      ...clearRunDetail,
                    },
                  };
                },
              },
              on: {
                turnAdmitted: ({ context, event }, enq) => {
                  enq.emit({ type: 'startTurnRequest', chatId: context.chatId, request: event.turn.request });
                  announce(context, enq);
                  return {
                    target: 'dispatched',
                    context: {
                      turn: event.turn,
                      pendingGesture: undefined,
                      failureReason: undefined,
                      settlementRetried: false,
                      /* A `continue` resumes the run the host already has and
                       * mints none, so its turn carries no run id. Adopting that
                       * `undefined` as the chat's run identity dropped every
                       * host-attested observation and left `settleTurn` with
                       * nothing to name (T3-D7). */
                      activeRunId: event.turn.runId ?? context.activeRunId,
                    },
                  };
                },
              },
            },
            /* The lease is held and the request is out; the transport's own
             * lifecycle takes the run from here. A gesture made in this state
             * is over a live turn exactly as one made in `running` is — the
             * transport reports `running` only once bytes flow. */
            dispatched: {
              on: { requestTurn: holdGesture },
            },
          },
          on: {
            turnFinalizedObserved: bufferSettlement,
            turnFailedObserved: bufferSettlement,
            turnConflictedObserved: bufferSettlement,
          },
        },
        running: {
          initial: 'generating',
          states: {
            generating: {
              always: ({ context }) => {
                const row = runningRow(context);
                if (row === 'approval') {
                  return { target: 'waiting.approval' };
                }
                return row === 'tool' ? { target: 'tool' } : undefined;
              },
            },
            tool: {
              always: ({ context }) => {
                const row = runningRow(context);
                if (row === 'approval') {
                  return { target: 'waiting.approval' };
                }
                return row === 'generating' ? { target: 'generating' } : undefined;
              },
            },
            waiting: {
              initial: 'approval',
              states: {
                approval: {
                  always: ({ context }) => {
                    const row = runningRow(context);
                    if (row === 'tool') {
                      return { target: '#chat-session.run.running.tool' };
                    }
                    return row === 'generating' ? { target: '#chat-session.run.running.generating' } : undefined;
                  },
                },
                input: {},
              },
            },
            reconnecting: {},
          },
          on: {
            turnFinalizedObserved: bufferSettlement,
            turnFailedObserved: bufferSettlement,
            turnConflictedObserved: bufferSettlement,
            requestLifecycle: ({ context, event }, enq) => {
              if (event.phase === 'retrying') {
                return { target: '.reconnecting' };
              }
              if (event.phase === 'stopping') {
                announce(context, enq);
                return { target: 'stopped', context: clearRunDetail };
              }
              /* `invoking` is a request in flight; the `generating` guards route
               * it straight back to a tool or an approval when one is open. */
              return event.phase === 'invoking' ? { target: '.generating' } : undefined;
            },
            durableRunState: ({ event }) => (event.state === 'reattaching' ? { target: '.reconnecting' } : undefined),
            requestTurn: holdGesture,
            interruptRecorded: ({ context, event }, enq) => {
              if (event.state !== 'requested') {
                return undefined;
              }
              raiseApprovalPending(context, true, enq);
              announce(context, enq);
              return {
                target: '.waiting.approval',
                context: { pendingApprovalCount: event.count ?? Math.max(context.pendingApprovalCount, 1) },
              };
            },
          },
        },
        finishing: {
          initial: 'deciding',
          states: {
            deciding: {
              always: ({ context }) => ({ target: context.turn === undefined ? 'observing' : 'settling' }),
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
                onDone: settleOnDone,
                onError: ({ context, event }, enq) => {
                  announce(context, enq);
                  /* One retry, in place: a settlement that rejected left the
                   * lease held and — when the failure cleared the turn — left
                   * nothing that could ever name the run holding it. */
                  return context.settlementRetried
                    ? { target: '#chat-session.run.failed', context: recordSettlementFailure(context, event.error) }
                    : {
                        target: 'settling',
                        reenter: true,
                        context: { settlementRetried: true, ...recordSettlementFailure(context, event.error) },
                      };
                },
              },
            },
            /* A run this page did not admit: its outcome is the host's to
             * attest, and it arrives on the settlement observations below. */
            observing: {},
          },
          on: {
            /* Only for a run this page did not admit. `settleTurn` awaits the
             * same attestation itself, and its `onDone` is the one transition
             * that ends an owned turn. */
            turnFinalizedObserved: observedSettlement('done'),
            turnFailedObserved: observedSettlement('failed', (event) =>
              event.type === 'turnFailedObserved' ? event.reason : 'failed',
            ),
            turnConflictedObserved: observedSettlement('failed', () => 'revision conflict'),
            requestTurn: ({ context, event }, enq) => {
              announce(context, enq);
              return { context: { pendingGesture: event.gesture } };
            },
            reconcileSettlement: reconcileSettlementTransition,
          },
        },
        done: { on: { adoptRun: adoptRunTransition } },
        failed: { on: { reconcileSettlement: reconcileSettlementTransition, adoptRun: adoptRunTransition } },
        stopped: { on: { reconcileSettlement: reconcileSettlementTransition, adoptRun: adoptRunTransition } },
      },
      on: {
        /* The one way a turn starts. Every verb sends this and nothing else;
         * `queued.admitting` is where the lease is taken (V1, V2). A second
         * gesture re-enters the state, which aborts the admission in flight —
         * that actor abandons its own lease and no other (V4). */
        requestTurn: ({ context, event }, enq) => {
          announce(context, enq);
          return { target: '.queued.admitting', reenter: true, context: { pendingGesture: event.gesture } };
        },
        runLifecycle,
        /* Reload discovery can substantiate a run for a chat that never left
         * `idle` on this page (`retainDurableRun`). */
        durableRunState: ({ context, event }, enq) => {
          if (event.state !== 'reattaching') {
            return undefined;
          }
          announce(context, enq);
          return { target: '.running.reconnecting' };
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
        close: ({ context }, enq) => {
          announce(context, enq);
          return { target: '.stopped', context: clearRunDetail };
        },
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
            agentConfigChanged: ({ context, event }) =>
              event.placement === context.placement
                ? { context: { placement: event.placement } }
                : { target: 'bound', reenter: true, context: { placement: event.placement } },
          },
        },
      },
    },
    read: {
      initial: 'read',
      states: {
        read: {
          on: {
            /* P57: a run that *failed* while the person was elsewhere is as
             * unseen as one that finished. The architecture's project row is
             * red for "a run failed and is unread", which this is what makes
             * reachable. */
            runLifecycle: ({ context, event }, enq) => {
              if (event.phase !== 'completed' && event.phase !== 'failed') {
                return undefined;
              }
              announce(context, enq);
              return { target: 'unread' };
            },
            unreadRestored: ({ context }, enq) => {
              announce(context, enq);
              return { target: 'unread' };
            },
            approvalPending: ({ context }, enq) => {
              announce(context, enq);
              return { target: 'unread' };
            },
          },
        },
        unread: {
          on: {
            viewed: ({ context }, enq) => {
              announce(context, enq);
              return { target: 'read' };
            },
          },
        },
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
            turnFinalized: ({ context, event }, enq) => {
              announce(context, enq);
              return { target: event.branch === 'main' ? '.onMain' : '.onBranch', context: { branch: event.branch } };
            },
          },
        },
        tree: {
          initial: 'clean',
          states: { clean: {}, dirty: {} },
          on: {
            dirtyChanged: ({ context, event }, enq) => {
              announce(context, enq);
              return { target: event.dirty ? '.dirty' : '.clean' };
            },
          },
        },
        sync: {
          initial: 'synced',
          states: { synced: {}, pending: {}, conflicted: {} },
          on: {
            syncState: ({ context, event }, enq) => {
              announce(context, enq);
              return { target: `.${event.state}` };
            },
          },
        },
      },
    },
  },
});
