import { assign, emit, enqueueActions, fromCallback, setup } from 'xstate';
import type { ActorRefFrom, AnyActorRef, EventObject } from 'xstate';

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
 * It never spawns a `turn.machine`. Settlement is not this machine's verb
 * either: `ProjectChatRunSettlement` at the route still sends `prepare` /
 * `turnCompleted` straight to the worker-side `project-revisions` root, and
 * this machine only *reads* the outcome (`turnFinalizedObserved`,
 * `turnFailedObserved`, `turnConflictedObserved`) through the host-event
 * bridge, while revision facets (`turnFinalized`, `dirtyChanged`, `syncState`)
 * arrive through its project session.
 * Moving the send here would give
 * the chat a second path to the revisions root; the architecture's
 * "Ownership has no cycles" is satisfied either way, and the route already
 * owns the run it settles.
 */

/** How the chat's run reached the state it is in. @public */
export type ChatRunPhase = 'admitted' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/** The persistence machine's request lifecycle, coalesced by the adapter. @public */
export type ChatRequestLifecycle = 'idle' | 'invoking' | 'retrying' | 'stopping';

/** What reload discovery says about this chat's server-authoritative run. @public */
export type ChatDurableRunState = 'reattaching' | 'active' | 'terminal';

/** The sync facet of the project's revision status, as this chat sees it. @public */
export type ChatSyncState = 'synced' | 'pending' | 'conflicted';

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
export type ChatSessionMachineEmitted = { readonly type: 'statusChanged'; readonly chatId: string };

/** A live chat session actor. @public */
export type ChatSessionActorRef = ActorRefFrom<typeof chatSessionMachine>;

/**
 * One chat's run, read and revision state.
 *
 * @public
 */
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
  },
  guards: {
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
        idle: {},
        queued: {
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
          on: {
            turnFinalizedObserved: { guard: 'matchesActiveRun', target: 'done', actions: 'announce' },
            turnFailedObserved: {
              guard: 'matchesActiveRun',
              target: 'failed',
              actions: [assign({ failureReason: ({ event }) => event.reason }), 'announce'],
            },
            turnConflictedObserved: {
              guard: 'matchesActiveRun',
              target: 'failed',
              actions: [assign({ failureReason: 'revision conflict' }), 'announce'],
            },
          },
        },
        done: {},
        failed: {},
        stopped: {},
      },
      on: {
        runLifecycle: [
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
