import { setup, types } from 'xstate';
import type { ActorRefFrom, EnqueueObject, SystemRegistry } from 'xstate';
import type { CadAgentExecution, MyUIMessage } from '@taucad/chat';
import { eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';
import type { StoredAttachmentRef } from '#utils/attachment.utils.js';
import type { HostCommand } from '@taucad/agent-host/wire';

/**
 * One chat's live state (D32, S45).
 *
 * The machine *is* the agent-state vocabulary of the architecture's
 * "Agent states, mapped to what the sidebar says" table: every row is a state
 * here, reached by the source signal named in that row. Nothing derives a
 * second status from flags — `use-agent-projections.ts` and W20's sidebar read
 * these snapshots.
 *
 * The `run` region owns the chat's turn, as policy §16 requires: `queued`
 * invokes `admitTurn` — which derives the rewind point, waits out host
 * availability, resolves the model and pre-flights credits. The agent host
 * owns the checkout's lease and settlement row (W8 TS-S5, TS-S6). The verbs send
 * `requestTurn` and nothing else; what to dispatch is the admission's answer,
 * emitted as `startTurnRequest` for the request lifecycle to carry out.
 *
 * That ends the deviation this file used to document. A route component
 * owned settlement, a hook mounted once per
 * transcript message owned the host binding and the "one dispatch at a time"
 * guard, and two machines plus that hook each held an admission policy. One
 * owner refuses what the others could only race over: `requestTurn` while a
 * turn is live queues the gesture instead of leasing a second checkout, and
 * a terminal run releases this page's record of its turn before another
 * gesture can be admitted.
 *
 * Revision facets (`turnFinalized`, `dirtyChanged`, `syncState`) still arrive
 * through the project session. The host log owns settlement; this machine
 * only presents its projected run lifecycle.
 */

/** How the chat's run reached the state it is in. @public */
export type ChatRunPhase = 'admitted' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/** The sync facet of the project's revision status, as this chat sees it. @public */
export type ChatSyncState = 'synced' | 'pending' | 'conflicted';

export type ChatRequest = Readonly<{ command?: HostCommand }> &
  (
    | { kind: 'send'; message: MyUIMessage }
    | { kind: 'regenerate' }
    | {
        kind: 'edit';
        messageId: string;
        content: string;
        /** The edit's attachments, already promoted into the chat's directory. */
        attachments?: readonly StoredAttachmentRef[];
      }
    | { kind: 'continue' }
  );

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
  | Readonly<{ kind: 'send'; message: MyUIMessage; attachments?: readonly StoredAttachmentRef[] }>
  | Readonly<{ kind: 'edit'; messageId: string; text: string; attachments?: readonly StoredAttachmentRef[] }>
  | Readonly<{ kind: 'regenerate'; execution?: CadAgentExecution; requestId?: string }>
  /**
   * *Try again* on an error card: resume the stream if the host can still
   * continue it, and re-run the turn if it cannot. Only the admission knows
   * which, so the two are one gesture here.
   */
  | Readonly<{ kind: 'continue' }>;

/** The one turn a chat holds: its run, its lease and what it dispatches. @public */
export type ChatTurn = Readonly<{
  /** The admission idempotency key, shared by the lease and the host request. */
  runId: string | undefined;
  /** The user message the checkout's lease is keyed by. */
  leaseTurnId: string | undefined;
  /** What the request lifecycle must dispatch for this turn. */
  request: ChatRequest;
}>;

/** Input accepted when creating a chatSessionMachine actor; the store creates it as a root (PV-S5, L3 D10). @public */
export type ChatSessionMachineInput = Readonly<{
  chatId: string;
  projectId: string;
}>;

/** Serializable state owned by chatSessionMachine. @public */
export type ChatSessionMachineContext = Readonly<{
  chatId: string;
  projectId: string;
  /** An effect or child failure no transition modelled; the actor keeps answering (MC-R12). */
  fault: string | undefined;
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
  /** The turn this chat holds. One slot, so a chat can only hold one (V1). */
  turn: ChatTurn | undefined;
  /** A gesture made while a turn was live; admitted when that run ends (V2). */
  pendingGesture: ChatTurnGesture | undefined;
}>;

/** Events accepted by chatSessionMachine. @public */
export type ChatSessionMachineEvent =
  | { readonly type: 'runLifecycle'; readonly phase: ChatRunPhase; readonly runId?: string; readonly reason?: string }
  /** The person asked for a turn. The only way a turn is ever started. */
  | { readonly type: 'requestTurn'; readonly gesture: ChatTurnGesture }
  /** `admitTurn`'s answer: the request is composed; the host places it (W8 TS-S5). */
  | { readonly type: 'turnAdmitted'; readonly turn: ChatTurn }
  /** Reload discovery found a durable run for a chat this page never started (V5). */
  | { readonly type: 'adoptRun'; readonly runId: string }
  | { readonly type: 'interruptRecorded'; readonly state: 'requested' | 'resolved'; readonly count?: number }
  | { readonly type: 'toolParts'; readonly inFlight: number; readonly approvals: number; readonly toolName?: string }
  | { readonly type: 'close' }
  | { readonly type: 'turnFinalized'; readonly branch: string }
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
  /* Also replaced by `sessions-store.ts`. The defaults refuse rather than
   * pretend: a chat whose turn host has not published its services cannot
   * admit a turn, and saying so is what puts the reason on the banner. */
  admitTurn: fromSafeAsync<
    { readonly type: 'turnAdmitted'; readonly turn: ChatTurn },
    { readonly chatId: string; readonly gesture: ChatTurnGesture }
  >(async ({ input }) => {
    throw new Error(`This chat (${input.chatId}) has no turn host to admit a turn.`);
  }),
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
const clearTurn = { turn: undefined } as const;

const captureRunIdentity = (context: ChatSessionMachineContext, event: EventOf<'runLifecycle'>): ChatSessionPatch => {
  if (event.runId === undefined) {
    return {};
  }
  return event.runId === context.activeRunId
    ? { activeRunId: event.runId }
    : { activeRunId: event.runId, failureReason: undefined };
};

/* V2: a gesture over a live turn never asks for a second lease. It is held
 * until this turn settles, and the request it interrupts is what makes that
 * happen. */
const holdGesture = ({ context, event }: ChatSessionArgs<EventOf<'requestTurn'>>, enq: ChatSessionEnqueue) => {
  enq.emit({ type: 'stopTurnRequest', chatId: context.chatId });
  announce(context, enq);
  return { context: { pendingGesture: event.gesture } };
};

const failureMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/**
 * Take on a run of this chat that is live somewhere else (V5).
 *
 * Accepted from the states that are holding nothing *and* doing nothing: a
 * chat whose machine is idle, or has reached a terminal row while one of its
 * runs is still in flight elsewhere — navigate away and back mid-run (T3-D10).
 * Not from the states in between. `turn === undefined` alone does not say that:
 * it is true for the whole admission window, because the lease is taken before
 * `turn` exists. Handled at the root it would stop that admission.
 */
const adoptRunTransition = ({ context, event }: ChatSessionArgs<EventOf<'adoptRun'>>, enq: ChatSessionEnqueue) => {
  /* This chat owns a turn; the discovered run is that turn's or stale. */
  if (context.turn !== undefined) {
    return {};
  }
  announce(context, enq);
  return { target: '#chat-session.run.running.generating', context: { activeRunId: event.runId } };
};

/* A tool part in flight is what "running a tool" means; deltas never get here,
 * so `running` with nothing in flight is generating (the table). */
const runningRow = (context: ChatSessionMachineContext): 'approval' | 'tool' | 'generating' => {
  if (context.pendingApprovalCount > 0) {
    return 'approval';
  }
  return context.toolsInFlight > 0 ? 'tool' : 'generating';
};

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
    /* A run pauses on an approval the log recorded just before the pause, or on a question. */
    return {
      target: runningRow(context) === 'approval' ? '.running.waiting.approval' : '.running.waiting.input',
      context: identity,
    };
  }
  const terminal = event.phase === 'completed' ? '.done' : event.phase === 'failed' ? '.failed' : '.stopped';
  return {
    target: context.pendingGesture === undefined ? terminal : '.queued.admitting',
    context: {
      ...identity,
      ...clearTurn,
      ...clearRunDetail,
      ...(event.phase === 'failed' ? { failureReason: event.reason } : {}),
    },
  };
};

const runStates = {
  idle: 'run.idle',
  observing: 'run.queued.observing',
  dispatched: 'run.queued.dispatched',
  queued: 'run.queued',
  running: 'run.running',
  done: 'run.done',
  failed: 'run.failed',
  stopped: 'run.stopped',
} as const;
const pairs = (states: readonly string[], events: readonly string[]): Array<readonly [string, string]> =>
  states.flatMap((state) => events.map((type) => [state, type] as const));

/**
 * The (state, event) pairs this machine ignores (MC-R17).
 *
 * - `turnAdmitted` outside `queued.admitting`: the answer of an admission a later gesture aborted.
 * - `adoptRun` in the states that hold a turn or a live run.
 *
 * @public
 */
export const chatSessionIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ...pairs(
    [
      runStates.idle,
      runStates.observing,
      runStates.dispatched,
      runStates.running,
      runStates.done,
      runStates.failed,
      runStates.stopped,
    ],
    ['turnAdmitted'],
  ),
  ...pairs([runStates.queued, runStates.running], ['adoptRun']),
];

/**
 * One chat's run, host binding and revision state. Unread is the store's, derived from the chat's log (PV-S8).
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
  version: '1',
  /* A fault no transition modelled is recorded and the chat keeps answering, so a render never throws (MC-R12). */
  onError: ({ event }) => ({ context: { fault: failureMessage(event.error, 'chat-session fault') } }),
  context: ({ input }) => ({
    chatId: input.chatId,
    projectId: input.projectId,
    fault: undefined,
    pendingApprovalCount: 0,
    toolsInFlight: 0,
    toolName: undefined,
    failureReason: undefined,
    branch: undefined,
    activeRunId: undefined,
    turn: undefined,
    pendingGesture: undefined,
  }),
  type: 'parallel',
  on: {
    /* Batched per transport event (F8): one frame carries the whole tool
     * picture, so a fifty-part turn is one transition. */
    toolParts: ({ context, event }, enq) => {
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
                      /* A `continue` resumes the run the host already has and
                       * mints none, so preserve the run's identity (T3-D7). */
                      activeRunId: event.turn.runId ?? context.activeRunId,
                    },
                  };
                },
              },
            },
            /* The request is out and the host holds the lease; the transport's own
             * lifecycle takes the run from here. A gesture made in this state
             * is over a live turn exactly as one made in `running` is — the
             * transport reports `running` only once bytes flow. */
            dispatched: {
              on: { requestTurn: holdGesture },
            },
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
          },
          on: {
            requestTurn: holdGesture,
            interruptRecorded: ({ context, event }, enq) => {
              if (event.state !== 'requested') {
                return undefined;
              }
              announce(context, enq);
              return {
                target: '.waiting.approval',
                context: { pendingApprovalCount: event.count ?? Math.max(context.pendingApprovalCount, 1) },
              };
            },
          },
        },
        done: { on: { adoptRun: adoptRunTransition } },
        failed: { on: { adoptRun: adoptRunTransition } },
        stopped: { on: { adoptRun: adoptRunTransition } },
      },
      on: {
        /* The one way a turn starts. Every verb sends this and nothing else;
         * `queued.admitting` is where the turn is admitted (V1, V2). A second
         * gesture re-enters the state, which aborts the admission in flight —
         * nothing was placed, because the host places only a dispatched turn (V4). */
        requestTurn: ({ context, event }, enq) => {
          announce(context, enq);
          return { target: '.queued.admitting', reenter: true, context: { pendingGesture: event.gesture } };
        },
        runLifecycle,
        /*
         * *Close* on a chat (A35, P63).
         *
         * The cancel belongs to the host command lane; its durable lifecycle
         * comes back here as `runLifecycle{phase:'cancelled'}`. This machine
         * only records that the person stopped, and it stays
         * alive so the row reads `Stopped`: telling the project session to let
         * go would stop this actor and blank the row.
         */
        close: ({ context }, enq) => {
          announce(context, enq);
          return { target: '.stopped', context: clearRunDetail };
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
