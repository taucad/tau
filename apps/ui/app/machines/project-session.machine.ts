import { assign, emit, enqueueActions, fromCallback, not, setup } from 'xstate';
import type { ActorRefFrom, AnyActorRef, EventObject } from 'xstate';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { chatSessionMachine } from '#machines/chat-session.machine.js';
import type { ChatSyncState } from '#machines/chat-session.machine.js';

/**
 * One live project (S44, A35).
 *
 * A project is live iff this actor runs. It owns every project-scoped
 * resource — the nested file-manager actor, the project and editor actors and
 * their geometry units, the agent-host attachment, compute admission and the
 * project's `chat-session` actors — so navigation opens but never closes, and
 * run settlement and host registration outlive a route (I22, I23).
 *
 * The children are **injected**: the store module provides the real logics and
 * a test provides fakes, so this file imports no worker, no DOM and no React
 * (I27 — browser and desktop share the machine with different actors).
 */

/** Why a session is closing. `user` is the verb; the rest are visible policy. @public */
export type ProjectSessionCloseReason = 'user' | 'idle' | 'budget' | 'quit';

/** The four things a project needs before it is usable. @public */
export type ProjectSessionRegion = 'views' | 'runtime' | 'agentHost' | 'compute';

/** What the registry and the sidebar read off a session. @public */
export type ProjectSessionState = 'opening' | 'live' | 'closing' | 'closed' | 'failed';

/** Input accepted when creating a projectSessionMachine actor. @public */
export type ProjectSessionMachineInput = Readonly<{
  projectId: string;
  /** The sessions registry; this session reports its liveness to it. */
  parentRef?: AnyActorRef;
  /** EQ15: the liveness idle-close window, handed down by the registry. */
  idleWindowMilliseconds?: number;
  /** How long a region may take to come up before it counts as failed. */
  startBoundMilliseconds?: number;
  /** The bound on the close flush, the rule W13's `awaitSyncSettled` uses. */
  closeFlushMilliseconds?: number;
}>;

/** State owned by projectSessionMachine, plus its child refs. @public */
export type ProjectSessionMachineContext = Readonly<{
  projectId: string;
  parentRef: AnyActorRef | undefined;
  idleWindowMilliseconds: number;
  startBoundMilliseconds: number;
  closeFlushMilliseconds: number;
  /** Chats with a run in flight. `busy` is `runs.length > 0`. */
  runs: readonly string[];
  /** The live checkout has unsaved changes (A25 — a policy never closes it). */
  dirty: boolean;
  /** Everything this device recorded has been acknowledged by the remote. */
  pushed: boolean;
  /** Only hidden idle sessions are eligible for the idle-close window. */
  visible: boolean;
  /** Refs this device has not had acknowledged — quit's `Backing up n`. */
  pending: number;
  /** What needs the person: approvals and failed runs, for the sidebar count. */
  attention: number;
  /** Regions that did not come up, with the reason the row shows. */
  failures: Readonly<Record<string, string>>;
  closeReason: ProjectSessionCloseReason | undefined;
  /** The last state this session told the registry it was in. */
  reportedState: ProjectSessionState;
  fileManagerRef: AnyActorRef | undefined;
  projectRef: AnyActorRef | undefined;
  agentHostRef: AnyActorRef | undefined;
  computeRef: AnyActorRef | undefined;
  chatRefs: Readonly<Record<string, ActorRefFrom<typeof chatSessionMachine>>>;
}>;

/** Events accepted by projectSessionMachine. @public */
export type ProjectSessionMachineEvent =
  | { readonly type: 'close'; readonly reason: ProjectSessionCloseReason }
  | { readonly type: 'confirmClose' }
  | { readonly type: 'cancelClose' }
  | { readonly type: 'childReady'; readonly region: ProjectSessionRegion }
  | { readonly type: 'childFailed'; readonly region: ProjectSessionRegion; readonly reason: string }
  | { readonly type: 'runStarted'; readonly chatId: string }
  | { readonly type: 'runSettled'; readonly chatId: string }
  | { readonly type: 'chatClosed'; readonly chatId: string }
  | { readonly type: 'activity' }
  | { readonly type: 'visibilityChanged'; readonly visible: boolean }
  | { readonly type: 'openChat'; readonly chatId: string }
  | { readonly type: 'attention'; readonly count: number }
  | {
      readonly type: 'revisionState';
      readonly dirty: boolean;
      readonly pushed: boolean;
      readonly sync?: ChatSyncState;
      /** The branch the live checkout is on; `revision.line`'s producer (R11). */
      readonly branch?: string;
      /** `sync.pendingCount`, for the quit overlay's `Backing up n`. */
      readonly pendingCount?: number;
    };

/** What a session tells its watchers. @public */
export type ProjectSessionMachineEmitted =
  | { readonly type: 'sessionState'; readonly projectId: string; readonly state: ProjectSessionState }
  | { readonly type: 'attention'; readonly projectId: string; readonly count: number };

/** A live project session actor. @public */
export type ProjectSessionActorRef = ActorRefFrom<typeof projectSessionMachine>;

/** The liveness idle-close window (EQ15, P23 — not D8's 5 min checkpoint cut). */
export const projectSessionIdleWindowMilliseconds = 30 * 60 * 1000;

/** How long a region may take to come up before the session calls it failed. */
export const projectSessionStartBoundMilliseconds = 30_000;

/** The close-flush bound, matching `packages/host`'s `closeFlushMilliseconds`. */
export const projectSessionCloseFlushMilliseconds = 5000;

/*
 * P48: `opening` has no `pulling` state.
 *
 * The open pull's gate lives in `sync.machine` and the Files tree's empty
 * state (P34, amended). A second copy here waited on nothing — the subtree
 * that could answer it only mounts once the registry says the project is
 * live — so `opening` goes straight to `starting`.
 */

/** Cancel every run this session holds, so `closing` flushes what they wrote. */
const cancelRuns = fromSafeAsync<void, { projectId: string; runs: readonly string[] }>(async () => undefined);

/** Flush editor and project producers before revision and record persistence. */
const flushProducers = fromSafeAsync<void, { projectId: string }>(async () => undefined);

/**
 * Flush this project's sync through W13's seam.
 *
 * The store module's implementation sends the port's `close` and waits for
 * `pushSettled` or the durable queue write — it never reimplements
 * `awaitSyncSettled`.
 */
const flushSync = fromSafeAsync<void, { projectId: string; boundMilliseconds: number }>(async () => undefined);

/** Retire the leases this session's turns took on the project's checkouts. */
const releaseLeases = fromSafeAsync<void, { projectId: string }>(async () => undefined);

/** Release the project-scoped agent-host registration after its work drains. */
const releaseAgentHost = fromSafeAsync<void, { projectId: string }>(async () => undefined);

/**
 * The project's children, replaceable per host (I27, A37).
 *
 * The browser gets a file-manager actor over the shared worker and a worker
 * agent-host registration; the desktop gets the same session with a Node-served
 * file manager and the always-on launcher. Same machine, different actors. Each
 * reports `childReady` or `childFailed` to this parent; the defaults here do
 * neither, so an unprovided child fails its region at the start bound rather
 * than pretending to be up.
 */
const fileManager = fromCallback<EventObject, { projectId: string }>(() => undefined);
/* R14: no separate `editor` child. The editor actor lives inside the runtime
 * region's subtree and comes up with it; a second child relaying the same
 * region key made one report mark two children ready and told nobody anything.
 * Add it back when the editor can fail on its own. */
const project = fromCallback<EventObject, { projectId: string }>(() => undefined);
const agentHost = fromCallback<EventObject, { projectId: string }>(() => undefined);
const compute = fromCallback<EventObject, { projectId: string }>(() => undefined);

/** One startup region: up, failed at the bound, or failed by its child. */
const startupRegion = (region: ProjectSessionRegion) =>
  ({
    initial: 'starting',
    states: {
      starting: {
        on: {
          childReady: { guard: { type: 'isRegion', params: { region } }, target: 'ready' },
          childFailed: {
            guard: { type: 'isRegion', params: { region } },
            target: 'failed',
            actions: { type: 'recordFailure', params: { region } },
          },
        },
        after: { startBound: { target: 'failed', actions: { type: 'recordTimeout', params: { region } } } },
      },
      ready: { type: 'final' },
      failed: { type: 'final' },
    },
  }) as const;

/**
 * One project's liveness, from the open pull to the close flush.
 *
 * @public
 */
export const projectSessionMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as ProjectSessionMachineContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as ProjectSessionMachineEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as ProjectSessionMachineInput,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as ProjectSessionMachineEmitted,
  },
  actors: {
    cancelRuns,
    flushProducers,
    flushSync,
    releaseLeases,
    releaseAgentHost,
    fileManager,
    project,
    agentHost,
    compute,
    chatSession: chatSessionMachine,
  },
  delays: {
    idleWindow: ({ context }) => context.idleWindowMilliseconds,
    startBound: ({ context }) => context.startBoundMilliseconds,
  },
  guards: {
    /* Asking is a user verb only: a policy close never reaches a session with a
     * run (the registry refuses it first) and quit asked once, at the app. */
    shouldAsk: ({ context }) => context.runs.length > 0 && context.closeReason === 'user',
    hasFailures: ({ context }) => Object.keys(context.failures).length > 0,
    /* One guard, four regions: the event names the region it is about. */
    isRegion: ({ event }, params: { region: ProjectSessionRegion }) =>
      (event.type === 'childReady' || event.type === 'childFailed') && event.region === params.region,
    isLastRun: ({ context, event }) =>
      event.type === 'runSettled' && context.runs.filter((chatId) => chatId !== event.chatId).length === 0,
    isHidden: ({ context }) => !context.visible,
  },
  actions: {
    /* One place a session says where it is: an emit for local watchers and a
     * send to the registry, which owns the live set. */
    reportState: enqueueActions(({ enqueue, context }, params: { state: ProjectSessionState }) => {
      const frame = { type: 'sessionState', projectId: context.projectId, state: params.state } as const;
      enqueue.assign({ reportedState: params.state });
      enqueue.emit(frame);
      if (context.parentRef !== undefined) {
        enqueue.sendTo(context.parentRef, {
          ...frame,
          runs: context.runs.length,
          dirty: context.dirty,
          pushed: context.pushed,
          pending: context.pending,
        });
      }
    }),
    /* The facts moved, not the state. The registry's policy refusal (I24, I25)
     * reads runs/dirty/pushed, so it has to hear this between state changes. */
    reportFacts: enqueueActions(({ enqueue, context }) => {
      if (context.parentRef === undefined) {
        return;
      }
      enqueue.sendTo(context.parentRef, {
        type: 'sessionState',
        projectId: context.projectId,
        state: context.reportedState,
        runs: context.runs.length,
        dirty: context.dirty,
        pushed: context.pushed,
        pending: context.pending,
      });
    }),
    recordFailure: assign({
      failures: ({ context, event }, params: { region: ProjectSessionRegion }) =>
        event.type === 'childFailed' ? { ...context.failures, [params.region]: event.reason } : context.failures,
    }),
    recordTimeout: assign({
      failures: ({ context }, params: { region: ProjectSessionRegion }) => ({
        ...context.failures,
        [params.region]: 'timeout',
      }),
    }),
    clearCloseFailure: assign({
      failures: ({ context }) =>
        Object.fromEntries(Object.entries(context.failures).filter(([name]) => name !== 'close')),
    }),
    recordCloseFailure: assign({
      failures: ({ context, event }) => ({
        ...context.failures,
        close: 'error' in event && event.error instanceof Error ? event.error.message : 'failed',
      }),
    }),
    spawnChildren: assign({
      fileManagerRef: ({ context, spawn }) =>
        spawn('fileManager', { id: 'fileManager', input: { projectId: context.projectId } }),
      projectRef: ({ context, spawn }) => spawn('project', { id: 'project', input: { projectId: context.projectId } }),
      agentHostRef: ({ context, spawn }) =>
        spawn('agentHost', { id: 'agentHost', input: { projectId: context.projectId } }),
      computeRef: ({ context, spawn }) => spawn('compute', { id: 'compute', input: { projectId: context.projectId } }),
    }),
    /* I23: every project-scoped resource dies with the session. */
    stopChildren: enqueueActions(({ enqueue, context }) => {
      for (const ref of [
        context.fileManagerRef,
        context.projectRef,
        context.agentHostRef,
        context.computeRef,
        ...Object.values(context.chatRefs),
      ]) {
        if (ref !== undefined) {
          enqueue.stopChild(ref);
        }
      }
      enqueue.assign({
        fileManagerRef: undefined,
        projectRef: undefined,
        agentHostRef: undefined,
        computeRef: undefined,
        chatRefs: {},
      });
    }),
  },
}).createMachine({
  id: 'project-session',
  context: ({ input }) => ({
    projectId: input.projectId,
    parentRef: input.parentRef,
    idleWindowMilliseconds: input.idleWindowMilliseconds ?? projectSessionIdleWindowMilliseconds,
    startBoundMilliseconds: input.startBoundMilliseconds ?? projectSessionStartBoundMilliseconds,
    closeFlushMilliseconds: input.closeFlushMilliseconds ?? projectSessionCloseFlushMilliseconds,
    runs: [],
    dirty: false,
    pushed: true,
    visible: false,
    pending: 0,
    attention: 0,
    failures: {},
    closeReason: undefined,
    reportedState: 'opening',
    fileManagerRef: undefined,
    projectRef: undefined,
    agentHostRef: undefined,
    computeRef: undefined,
    chatRefs: {},
  }),
  initial: 'opening',
  on: {
    revisionState: {
      actions: [
        assign({
          dirty: ({ event }) => event.dirty,
          pushed: ({ event }) => event.pushed,
          pending: ({ context, event }) => event.pendingCount ?? context.pending,
        }),
        'reportFacts',
        enqueueActions(({ enqueue, context, event }) => {
          const sync: ChatSyncState = event.sync ?? (event.pushed ? 'synced' : 'pending');
          for (const ref of Object.values(context.chatRefs)) {
            enqueue.sendTo(ref, { type: 'dirtyChanged', dirty: event.dirty });
            enqueue.sendTo(ref, { type: 'syncState', state: sync });
            if (event.branch !== undefined) {
              enqueue.sendTo(ref, { type: 'turnFinalized', branch: event.branch });
            }
          }
        }),
      ],
    },
    attention: {
      actions: [
        assign({ attention: ({ event }) => event.count }),
        emit(
          ({ context, event }) => ({ type: 'attention', projectId: context.projectId, count: event.count }) as const,
        ),
      ],
    },
    /* One `chat-session` per chat that is live or viewed (D32). */
    openChat: {
      guard: ({ context, event }) => context.chatRefs[event.chatId] === undefined,
      actions: assign({
        chatRefs: ({ context, event, spawn, self }) => ({
          ...context.chatRefs,
          [event.chatId]: spawn('chatSession', {
            id: `chat:${event.chatId}`,
            input: { chatId: event.chatId, projectId: context.projectId, parentRef: self },
          }),
        }),
      }),
    },
    /*
     * The store's teardown signal, and only ever that (P63).
     *
     * `#disposeIfUnreferenced` sends this when a chat has no view, no run and
     * no durable run left; a person's *Close* does not, because a chat whose
     * machine has been stopped has no row to read `Stopped` from.
     */
    chatClosed: {
      actions: enqueueActions(({ enqueue, context, event }) => {
        const ref = context.chatRefs[event.chatId];
        if (ref === undefined) {
          return;
        }
        enqueue.stopChild(ref);
        enqueue.assign({
          chatRefs: Object.fromEntries(Object.entries(context.chatRefs).filter(([id]) => id !== event.chatId)),
          runs: context.runs.filter((chatId) => chatId !== event.chatId),
        });
      }),
    },
    close: { target: '.closing', actions: assign({ closeReason: ({ event }) => event.reason }) },
    visibilityChanged: { actions: assign({ visible: ({ event }) => event.visible }) },
  },
  states: {
    opening: {
      entry: { type: 'reportState', params: { state: 'opening' } },
      initial: 'starting',
      states: {
        starting: {
          entry: 'spawnChildren',
          type: 'parallel',
          onDone: [{ guard: 'hasFailures', target: '#project-session.failed' }, { target: '#project-session.live' }],
          states: {
            views: startupRegion('views'),
            runtime: startupRegion('runtime'),
            agentHost: startupRegion('agentHost'),
            compute: startupRegion('compute'),
          },
        },
      },
    },
    live: {
      entry: { type: 'reportState', params: { state: 'live' } },
      initial: 'idle',
      on: {
        runStarted: {
          target: '.busy',
          actions: [
            assign({
              runs: ({ context, event }) =>
                context.runs.includes(event.chatId) ? context.runs : [...context.runs, event.chatId],
            }),
            'reportFacts',
          ],
        },
        runSettled: [
          {
            guard: 'isLastRun',
            target: '.idle',
            actions: [
              assign({ runs: ({ context, event }) => context.runs.filter((id) => id !== event.chatId) }),
              'reportFacts',
            ],
          },
          {
            actions: [
              assign({ runs: ({ context, event }) => context.runs.filter((id) => id !== event.chatId) }),
              'reportFacts',
            ],
          },
        ],
      },
      states: {
        idle: {
          /* A session that comes back live with a run still in flight — a
           * cancelled close, for instance — is busy, not idle. */
          always: [{ guard: ({ context }) => context.runs.length > 0, target: 'busy' }],
          /* EQ15: the liveness idle-close window. The session never closes
           * itself — it tells the registry, which applies I24/I25.
           *
           * R6: `reenter` re-arms the window. A refusal is about the facts at
           * the time; the project is still idle afterwards, so it has to be
           * offered again rather than asked once and forgotten. */
          after: {
            idleWindow: {
              guard: 'isHidden',
              target: 'idle',
              reenter: true,
              actions: enqueueActions(({ enqueue, context }) => {
                if (context.parentRef !== undefined) {
                  enqueue.sendTo(context.parentRef, { type: 'idleExpired', projectId: context.projectId });
                }
              }),
            },
          },
          /* Navigation and focus only, never activity streams (A35). */
          on: {
            activity: { target: 'idle', reenter: true },
            visibilityChanged: {
              target: 'idle',
              reenter: true,
              actions: assign({ visible: ({ event }) => event.visible }),
            },
          },
        },
        busy: {},
      },
    },
    closing: {
      entry: ['clearCloseFailure', { type: 'reportState', params: { state: 'closing' } }],
      initial: 'asking',
      states: {
        asking: {
          always: [{ guard: not('shouldAsk'), target: 'cancellingRuns' }],
          on: {
            confirmClose: 'cancellingRuns',
            cancelClose: { target: '#project-session.live', actions: assign({ closeReason: undefined }) },
          },
        },
        cancellingRuns: {
          invoke: {
            src: 'cancelRuns',
            input: ({ context }) => ({ projectId: context.projectId, runs: context.runs }),
            onDone: 'flushingProducers',
            onError: { target: '#project-session.failed', actions: 'recordCloseFailure' },
          },
        },
        flushingProducers: {
          invoke: {
            src: 'flushProducers',
            input: ({ context }) => ({ projectId: context.projectId }),
            onDone: 'flushing',
            onError: { target: '#project-session.failed', actions: 'recordCloseFailure' },
          },
        },
        /* W13's seam, called and never reimplemented: `close` → `pushSettled`
         * or the durable queue write. R15: the bound that applies is W13's
         * `syncQuiesceMilliseconds` inside the worker's `release()`; this
         * passes `closeFlushMilliseconds` so a host whose flush has no bound of
         * its own has one to honour, and imposes none itself. */
        flushing: {
          invoke: {
            src: 'flushSync',
            input: ({ context }) => ({
              projectId: context.projectId,
              boundMilliseconds: context.closeFlushMilliseconds,
            }),
            onDone: 'releasing',
            onError: { target: '#project-session.failed', actions: 'recordCloseFailure' },
          },
        },
        releasing: {
          invoke: {
            src: 'releaseLeases',
            input: ({ context }) => ({ projectId: context.projectId }),
            onDone: 'releasingAgentHost',
            onError: { target: '#project-session.failed', actions: 'recordCloseFailure' },
          },
        },
        releasingAgentHost: {
          invoke: {
            src: 'releaseAgentHost',
            input: ({ context }) => ({ projectId: context.projectId }),
            onDone: 'stopping',
            onError: { target: '#project-session.failed', actions: 'recordCloseFailure' },
          },
        },
        stopping: { entry: 'stopChildren', always: '#project-session.closed' },
      },
    },
    /*
     * Not a root `final` state: a done actor emits `xstate.done.actor.*` at its
     * parent, and the registry has already stopped this child by then. The
     * session rests here until the registry lets it go.
     */
    closed: {
      entry: [
        { type: 'reportState', params: { state: 'closed' } },
        enqueueActions(({ enqueue, context }) => {
          if (context.parentRef !== undefined) {
            enqueue.sendTo(context.parentRef, {
              type: 'sessionClosed',
              projectId: context.projectId,
              reason: context.closeReason ?? 'user',
            });
          }
        }),
      ],
    },
    failed: { entry: { type: 'reportState', params: { state: 'failed' } } },
  },
  exit: 'stopChildren',
});

/** The session's one-line answer for the registry's policies (I24, I25). @public */
export const isProjectSessionClosable = (context: ProjectSessionMachineContext): boolean =>
  context.runs.length === 0 && !context.dirty && context.pushed;

/** Why a policy close was refused, for the row that shows the reason. @public */
export const projectSessionCloseRefusal = (context: ProjectSessionMachineContext): string | undefined => {
  if (context.runs.length > 0) {
    return 'running';
  }
  if (context.dirty) {
    return 'dirty';
  }
  return context.pushed ? undefined : 'unpushed';
};
