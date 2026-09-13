import { assign, emit, enqueueActions, setup } from 'xstate';
import type { ActorRefFrom, AnyActorRef } from 'xstate';

/**
 * One chat's live state (D32, S45).
 *
 * The machine *is* the agent-state vocabulary of the architecture's
 * "Agent states, mapped to what the sidebar says" table: every row is a state
 * here, reached by the source signal named in that row. Nothing derives a
 * second status from flags — `use-agent-projections.ts` and W20's sidebar read
 * these snapshots.
 *
 * It never spawns a `turn.machine`: settlement is requested by sending
 * `prepare` / `turnCompleted` to the project session, which forwards to the
 * worker-side `project-revisions` root (architecture, "Ownership has no
 * cycles").
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
}>;

/** Events accepted by chatSessionMachine. @public */
export type ChatSessionMachineEvent =
  | { readonly type: 'runLifecycle'; readonly phase: ChatRunPhase; readonly reason?: string }
  | { readonly type: 'interruptRecorded'; readonly state: 'requested' | 'resolved'; readonly count?: number }
  | { readonly type: 'toolParts'; readonly inFlight: number; readonly approvals: number; readonly toolName?: string }
  | { readonly type: 'requestLifecycle'; readonly phase: ChatRequestLifecycle }
  | { readonly type: 'durableRunState'; readonly state: ChatDurableRunState }
  | { readonly type: 'viewed' }
  | { readonly type: 'close' }
  | { readonly type: 'turnFinalized'; readonly branch: string }
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
  guards: {
    /* A tool part in flight is what "running a tool" means; deltas never get
     * here, so `running` with nothing in flight is generating (the table). */
    isToolInFlight: ({ context }) => context.toolsInFlight > 0,
    hasApprovals: ({ context }) => context.pendingApprovalCount > 0,
    isApprovalRequested: ({ event }) => event.type === 'interruptRecorded' && event.state === 'requested',
    isRetrying: ({ event }) => event.type === 'requestLifecycle' && event.phase === 'retrying',
    isStopping: ({ event }) => event.type === 'requestLifecycle' && event.phase === 'stopping',
    isReattaching: ({ event }) => event.type === 'durableRunState' && event.state === 'reattaching',
  },
  actions: {
    announce: emit(({ context }) => ({ type: 'statusChanged', chatId: context.chatId }) as const),
    /* The run is over: whatever the transport last said about tools and
     * approvals is no longer true of this chat. */
    clearRunDetail: assign({ pendingApprovalCount: 0, toolsInFlight: 0, toolName: undefined }),
    /* Close cancels the run and releases the lease; the record stays. The
     * project session owns both — this only tells it which chat let go. */
    askProjectToRelease: enqueueActions(({ enqueue, context }) => {
      if (context.parentRef !== undefined) {
        enqueue.sendTo(context.parentRef, { type: 'chatClosed', chatId: context.chatId });
      }
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
  }),
  type: 'parallel',
  on: {
    /* Batched per transport event (F8): one frame carries the whole tool
     * picture, so a fifty-part turn is one transition. */
    toolParts: {
      actions: [
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
        queued: {},
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
                assign({
                  pendingApprovalCount: ({ event, context }) =>
                    event.count ?? Math.max(context.pendingApprovalCount, 1),
                }),
                'announce',
              ],
            },
          },
        },
        done: {},
        failed: {},
        stopped: {},
      },
      on: {
        runLifecycle: [
          { guard: ({ event }) => event.phase === 'admitted', target: '.queued', actions: 'announce' },
          { guard: ({ event }) => event.phase === 'running', target: '.running', actions: 'announce' },
          {
            guard: ({ event }) => event.phase === 'paused',
            target: '.running.waiting.input',
            actions: 'announce',
          },
          {
            guard: ({ event }) => event.phase === 'completed',
            target: '.done',
            actions: ['clearRunDetail', 'announce'],
          },
          {
            guard: ({ event }) => event.phase === 'failed',
            target: '.failed',
            actions: [assign({ failureReason: ({ event }) => event.reason }), 'clearRunDetail', 'announce'],
          },
          {
            guard: ({ event }) => event.phase === 'cancelled',
            target: '.stopped',
            actions: ['clearRunDetail', 'announce'],
          },
        ],
        /* Reload discovery can substantiate a run for a chat that never left
         * `idle` on this page (`retainDurableRun`). */
        durableRunState: { guard: 'isReattaching', target: '.running.reconnecting', actions: 'announce' },
        /* *Close* on a chat cancels its run and releases its lease (A35). */
        close: { target: '.stopped', actions: ['askProjectToRelease', 'clearRunDetail', 'announce'] },
      },
    },
    read: {
      initial: 'read',
      states: {
        read: {
          on: {
            runLifecycle: {
              guard: ({ event }) => event.phase === 'completed',
              target: 'unread',
              actions: 'announce',
            },
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
