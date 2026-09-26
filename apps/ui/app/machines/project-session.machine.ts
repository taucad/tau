import { createCallbackLogic, setup, types } from 'xstate';
import type { ActorRefFrom, AnyActorRef, EnqueueObject, EventObject, SystemRegistry } from 'xstate';
import { eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';
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
  /** R3: how long hidden and idle before this project's kernels park. */
  parkWindowMilliseconds?: number;
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
  parkWindowMilliseconds: number;
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
  /** The project the person is on, even while the window itself is hidden (V1-7). */
  focused: boolean;
  /** Refs this device has not had acknowledged — quit's `Backing up n`. */
  pending: number;
  /** What needs the person: approvals and failed runs, for the sidebar count. */
  attention: number;
  /** Regions that did not come up, with the reason the row shows. */
  failures: Readonly<Record<string, string>>;
  /** A region ended its start bound failed, which is what refuses the open (R4). */
  openFailed: boolean;
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
  | {
      readonly type: 'visibilityChanged';
      readonly visible: boolean;
      /* R3/V1-7: whether this is the project the person navigated to. `visible`
       * is `focused && the window is on screen`, so a minimised window makes
       * every project hidden; only a project nobody navigated to parks. */
      readonly focused?: boolean;
    }
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
  | { readonly type: 'attention'; readonly projectId: string; readonly count: number }
  /* R3: whether this project's runtime should hold its kernel processes. The
   * session owns the fact (hidden and idle); the project's own route binding is
   * what reaches the cad units, because no actor ref links the two. */
  | { readonly type: 'runtimeParking'; readonly projectId: string; readonly parked: boolean };

/** A live project session actor. @public */
export type ProjectSessionActorRef = ActorRefFrom<typeof projectSessionMachine>;

/** The liveness idle-close window (EQ15, P23 — not D8's 5 min checkpoint cut). */
export const projectSessionIdleWindowMilliseconds = 30 * 60 * 1000;

/**
 * R3: hidden and idle for this long and the project parks its kernels.
 *
 * Short on purpose: it is about process memory, not session state, so it is two
 * minutes rather than the 30 above. Shorter re-forks on every alt-tab between
 * two projects; longer bounds nothing.
 */
export const projectSessionParkWindowMilliseconds = 2 * 60 * 1000;

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
const fileManager = createCallbackLogic<EventObject, { projectId: string }>(() => undefined);
/* R14: no separate `editor` child. The editor actor lives inside the runtime
 * region's subtree and comes up with it; a second child relaying the same
 * region key made one report mark two children ready and told nobody anything.
 * Add it back when the editor can fail on its own. */
const project = createCallbackLogic<EventObject, { projectId: string }>(() => undefined);
const agentHost = createCallbackLogic<EventObject, { projectId: string }>(() => undefined);
const compute = createCallbackLogic<EventObject, { projectId: string }>(() => undefined);

const projectSessionActors = {
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
};

type ProjectSessionEnqueue = EnqueueObject<
  ProjectSessionMachineEvent,
  ProjectSessionMachineEmitted,
  SystemRegistry,
  typeof projectSessionActors
>;
type ProjectSessionPatch = Partial<ProjectSessionMachineContext>;

/* One place a session says where it is: an emit for local watchers and a
 * send to the registry, which owns the live set. */
const reportState = (
  context: ProjectSessionMachineContext,
  enq: ProjectSessionEnqueue,
  state: ProjectSessionState,
): ProjectSessionPatch => {
  const frame = { type: 'sessionState', projectId: context.projectId, state } as const;
  enq.emit(frame);
  if (context.parentRef !== undefined) {
    enq.sendTo(context.parentRef, {
      ...frame,
      runs: context.runs.length,
      dirty: context.dirty,
      pushed: context.pushed,
      pending: context.pending,
    });
  }
  return { reportedState: state };
};

/* The facts moved, not the state. The registry's policy refusal (I24, I25)
 * reads runs/dirty/pushed, so it has to hear this between state changes. */
const reportFacts = (context: ProjectSessionMachineContext, enq: ProjectSessionEnqueue): void => {
  if (context.parentRef === undefined) {
    return;
  }
  enq.sendTo(context.parentRef, {
    type: 'sessionState',
    projectId: context.projectId,
    state: context.reportedState,
    runs: context.runs.length,
    dirty: context.dirty,
    pushed: context.pushed,
    pending: context.pending,
  });
};

/* R3. Resuming a runtime that never parked is a no-op at the cad machine, so
 * the reverse side never has to know whether the grace elapsed. */
const signalRuntime = (context: ProjectSessionMachineContext, enq: ProjectSessionEnqueue, parked: boolean): void => {
  enq.emit({ type: 'runtimeParking', projectId: context.projectId, parked });
};

/* The event names its own region (the startup regions check it), so this
 * records a failure whenever one is reported — at the start bound, or long
 * after (R4: the desktop refuses a kernel utility while the project is
 * live). The session stays where it is; only `failures` moves. */
const recordFailure = (
  context: ProjectSessionMachineContext,
  event: Extract<ProjectSessionMachineEvent, { type: 'childFailed' }>,
): ProjectSessionPatch => ({ failures: { ...context.failures, [event.region]: event.reason } });

const recordCloseFailure = (context: ProjectSessionMachineContext, error: unknown): ProjectSessionPatch => ({
  failures: { ...context.failures, close: error instanceof Error ? error.message : 'failed' },
});

const withoutRun = (context: ProjectSessionMachineContext, chatId: string): readonly string[] =>
  context.runs.filter((id) => id !== chatId);

/* I23: every project-scoped resource dies with the session. */
const stopChildren = (context: ProjectSessionMachineContext, enq: ProjectSessionEnqueue) => {
  for (const ref of [
    context.fileManagerRef,
    context.projectRef,
    context.agentHostRef,
    context.computeRef,
    ...Object.values(context.chatRefs),
  ]) {
    if (ref !== undefined) {
      enq.stop(ref);
    }
  }
  return {
    context: {
      fileManagerRef: undefined,
      projectRef: undefined,
      agentHostRef: undefined,
      computeRef: undefined,
      chatRefs: {},
    },
  };
};

/* A close step that failed leaves the session failed with the reason recorded. */
const closeFailed = ({
  context,
  event,
}: Readonly<{ context: ProjectSessionMachineContext; event: Readonly<{ error: unknown }> }>) => ({
  target: '#project-session.failed',
  context: recordCloseFailure(context, event.error),
});

/** One startup region: up, failed at the bound, or failed by its child. */
const startupRegion = (region: ProjectSessionRegion) =>
  ({
    initial: 'starting',
    states: {
      starting: {
        on: {
          childReady: ({ event }: Readonly<{ event: Extract<ProjectSessionMachineEvent, { type: 'childReady' }> }>) =>
            event.region === region ? { target: 'ready' } : undefined,
          childFailed: ({
            context,
            event,
          }: Readonly<{
            context: ProjectSessionMachineContext;
            event: Extract<ProjectSessionMachineEvent, { type: 'childFailed' }>;
          }>) => (event.region === region ? { target: 'failed', context: recordFailure(context, event) } : undefined),
        },
        after: {
          startBound: {
            target: 'failed',
            context: ({ context }: Readonly<{ context: ProjectSessionMachineContext }>) => ({
              failures: { ...context.failures, [region]: 'timeout' },
            }),
          },
        },
      },
      ready: { type: 'final' },
      /* R4: the admission verdict is a region ending its start bound here, not
       * the `failures` map — a kernel refused while the session is still
       * opening is recorded at the root and is not a reason to refuse the
       * project, whose views, agent host and compute all came up. */
      failed: { type: 'final', entry: () => ({ context: { openFailed: true } }) },
    },
  }) as const;

/**
 * One project's liveness, from the open pull to the close flush.
 *
 * @public
 */
export const projectSessionMachine = setup({
  schemas: {
    context: types<ProjectSessionMachineContext>(),
    events: eventSchemas<ProjectSessionMachineEvent>(),
    input: types<ProjectSessionMachineInput>(),
    emitted: eventSchemas<ProjectSessionMachineEmitted>(),
  },
  actors: projectSessionActors,
  delays: {
    idleWindow: ({ context }) => context.idleWindowMilliseconds,
    parkWindow: ({ context }) => context.parkWindowMilliseconds,
    startBound: ({ context }) => context.startBoundMilliseconds,
  },
  guards: {
    /* Asking is a user verb only: a policy close never reaches a session with a
     * run (the registry refuses it first) and quit asked once, at the app. */
    shouldAsk: (context: ProjectSessionMachineContext) => context.runs.length > 0 && context.closeReason === 'user',
    /* R4: only a session that opened clears a failure. `!== 'failed'` would be
     * true all through `opening`, so a region that timed out and then reported
     * ready before its last sibling finalised would settle `failed` with an
     * empty map and a row saying nothing (V2-9). */
    hasOpened: (context: ProjectSessionMachineContext) => context.reportedState === 'live',
    /* R3: not on screen *and* not the project the person navigated to. Minimising
     * the window must not park what is still in front of them (V1-7). */
    isParkable: (context: ProjectSessionMachineContext) => !context.visible && !context.focused,
  },
}).createMachine({
  id: 'project-session',
  context: ({ input }) => ({
    projectId: input.projectId,
    parentRef: input.parentRef,
    idleWindowMilliseconds: input.idleWindowMilliseconds ?? projectSessionIdleWindowMilliseconds,
    parkWindowMilliseconds: input.parkWindowMilliseconds ?? projectSessionParkWindowMilliseconds,
    startBoundMilliseconds: input.startBoundMilliseconds ?? projectSessionStartBoundMilliseconds,
    closeFlushMilliseconds: input.closeFlushMilliseconds ?? projectSessionCloseFlushMilliseconds,
    runs: [],
    dirty: false,
    pushed: true,
    visible: false,
    focused: false,
    pending: 0,
    attention: 0,
    failures: {},
    openFailed: false,
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
    revisionState: ({ context, event }, enq) => {
      const patch = { dirty: event.dirty, pushed: event.pushed, pending: event.pendingCount ?? context.pending };
      reportFacts({ ...context, ...patch }, enq);
      const sync: ChatSyncState = event.sync ?? (event.pushed ? 'synced' : 'pending');
      for (const ref of Object.values(context.chatRefs)) {
        enq.sendTo(ref, { type: 'dirtyChanged', dirty: event.dirty });
        enq.sendTo(ref, { type: 'syncState', state: sync });
        if (event.branch !== undefined) {
          enq.sendTo(ref, { type: 'turnFinalized', branch: event.branch });
        }
      }
      return { context: patch };
    },
    attention: ({ context, event }, enq) => {
      enq.emit({ type: 'attention', projectId: context.projectId, count: event.count });
      return { context: { attention: event.count } };
    },
    /* One `chat-session` per chat that is live or viewed (D32). */
    openChat: ({ context, event, self }, enq) => {
      if (context.chatRefs[event.chatId] !== undefined) {
        return undefined;
      }
      const ref = enq.spawn('chatSession', {
        id: `chat:${event.chatId}`,
        input: { chatId: event.chatId, projectId: context.projectId, parentRef: self },
      });
      return { context: { chatRefs: { ...context.chatRefs, [event.chatId]: ref } } };
    },
    /*
     * The store's teardown signal, and only ever that (P63).
     *
     * `#disposeIfUnreferenced` sends this when a chat has no view, no run and
     * no durable run left; a person's *Close* does not, because a chat whose
     * machine has been stopped has no row to read `Stopped` from.
     */
    chatClosed: ({ context, event }, enq) => {
      const ref = context.chatRefs[event.chatId];
      if (ref === undefined) {
        return {};
      }
      enq.stop(ref);
      return {
        context: {
          chatRefs: Object.fromEntries(Object.entries(context.chatRefs).filter(([id]) => id !== event.chatId)),
          runs: withoutRun(context, event.chatId),
        },
      };
    },
    close: { target: '.closing', context: ({ event }) => ({ closeReason: event.reason }) },
    /*
     * R4: a region that fails outside its start bound, at the root.
     *
     * A kernel refusal arrives whenever the broker's guard is hit: minutes into
     * `live`, or — the blueprint's own case — milliseconds after the ninth
     * project opens, while the session is still `opening` and its runtime
     * region has *already* reported ready off the manifest load. The startup
     * regions' handlers are nested deeper and still win while a region is
     * `starting`, so admission is unchanged; everywhere else these record the
     * reason the row shows and clear it when the region comes back. No state
     * moves: the project stays live and closable, and everything that is not
     * its kernel still works.
     */
    childFailed: { context: ({ context, event }) => recordFailure(context, event) },
    /* A session that never opened keeps the reason it failed with: `failed` is
     * terminal for admission (the person reopens the project, which is a new
     * session), so a region coming back afterwards must not leave a red row
     * with nothing to say. The region came up after all, so its reason goes: a
     * row that stayed red after a reconnect would outlive the thing it is about. */
    childReady: ({ context, event, guards }) =>
      guards.hasOpened(context)
        ? {
            context: {
              failures: Object.fromEntries(Object.entries(context.failures).filter(([name]) => name !== event.region)),
            },
          }
        : undefined,
    visibilityChanged: {
      context: ({ context, event }) => ({ visible: event.visible, focused: event.focused ?? context.focused }),
    },
  },
  states: {
    opening: {
      entry: ({ context }, enq) => ({ context: reportState(context, enq, 'opening') }),
      initial: 'starting',
      states: {
        starting: {
          entry: ({ context }, enq) => ({
            context: {
              fileManagerRef: enq.spawn('fileManager', { id: 'fileManager', input: { projectId: context.projectId } }),
              projectRef: enq.spawn('project', { id: 'project', input: { projectId: context.projectId } }),
              agentHostRef: enq.spawn('agentHost', { id: 'agentHost', input: { projectId: context.projectId } }),
              computeRef: enq.spawn('compute', { id: 'compute', input: { projectId: context.projectId } }),
            },
          }),
          type: 'parallel',
          onDone: ({ context }) =>
            context.openFailed ? { target: '#project-session.failed' } : { target: '#project-session.live' },
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
      entry: ({ context }, enq) => ({ context: reportState(context, enq, 'live') }),
      initial: 'idle',
      on: {
        runStarted: ({ context, event }, enq) => {
          const runs = context.runs.includes(event.chatId) ? context.runs : [...context.runs, event.chatId];
          reportFacts({ ...context, runs }, enq);
          /* R3: a run needs the kernel back whether or not anyone is looking. */
          signalRuntime(context, enq, false);
          return { target: '.busy', context: { runs } };
        },
        runSettled: ({ context, event }, enq) => {
          const runs = withoutRun(context, event.chatId);
          reportFacts({ ...context, runs }, enq);
          return runs.length === 0 ? { target: '.idle', context: { runs } } : { context: { runs } };
        },
      },
      states: {
        idle: {
          /* A session that comes back live with a run still in flight — a
           * cancelled close, for instance — is busy, not idle. */
          always: ({ context }) => (context.runs.length > 0 ? { target: 'busy' } : undefined),
          /* EQ15: the liveness idle-close window. The session never closes
           * itself — it tells the registry, which applies I24/I25.
           *
           * R6: `reenter` re-arms the window. A refusal is about the facts at
           * the time; the project is still idle afterwards, so it has to be
           * offered again rather than asked once and forgotten. */
          after: {
            /* R3: the kernel processes go, the session stays. Targetless, so the
             * idle window above keeps counting its own 30 minutes; re-entering
             * `idle` (activity, visibility, or that window re-arming) rearms this
             * one, which re-offers a park a rendering unit refused. For a project
             * that just stays hidden the only re-entry is the 30-minute window, so
             * that is the re-offer interval — not "the next idle re-entry" (V1-5).
             * Giving this delay a target would reset EQ15's window, which is the
             * one thing it must not touch. */
            parkWindow: ({ context, guards }, enq) => {
              if (!guards.isParkable(context)) {
                return undefined;
              }
              signalRuntime(context, enq, true);
              return {};
            },
            idleWindow: ({ context }, enq) => {
              if (context.visible) {
                return undefined;
              }
              if (context.parentRef !== undefined) {
                enq.sendTo(context.parentRef, { type: 'idleExpired', projectId: context.projectId });
              }
              return { target: 'idle', reenter: true };
            },
          },
          /* Navigation and focus only, never activity streams (A35). */
          on: {
            /* No resume here: `activity` has no production sender (V1-6). */
            activity: { target: 'idle', reenter: true },
            visibilityChanged: ({ context, event }, enq) => {
              /* Only coming back resumes: a repeated hidden report must not re-fork
               * the kernel of a project nobody is looking at (Q2). Focus counts on
               * its own, so navigating to a project while the window is still hidden
               * has its kernel by the time the window returns. */
              if (event.visible || event.focused === true) {
                signalRuntime(context, enq, false);
              }
              return {
                target: 'idle',
                reenter: true,
                context: { visible: event.visible, focused: event.focused ?? context.focused },
              };
            },
          },
        },
        busy: {},
      },
    },
    closing: {
      entry: ({ context }, enq) => {
        const cleared = {
          ...context,
          failures: Object.fromEntries(Object.entries(context.failures).filter(([name]) => name !== 'close')),
        };
        return { context: { failures: cleared.failures, ...reportState(cleared, enq, 'closing') } };
      },
      initial: 'asking',
      states: {
        asking: {
          always: ({ context, guards }) => (guards.shouldAsk(context) ? undefined : { target: 'cancellingRuns' }),
          on: {
            confirmClose: { target: 'cancellingRuns' },
            cancelClose: { target: '#project-session.live', context: { closeReason: undefined } },
          },
        },
        cancellingRuns: {
          invoke: {
            src: 'cancelRuns',
            input: ({ context }) => ({ projectId: context.projectId, runs: context.runs }),
            onDone: { target: 'flushingProducers' },
            onError: closeFailed,
          },
        },
        /* A producer refusal (unsaved parameter drafts, an uncertain write) leaves every resource
         * intact, so the project stays live with the reason recorded and the close can be retried. */
        flushingProducers: {
          invoke: {
            src: 'flushProducers',
            input: ({ context }) => ({ projectId: context.projectId }),
            onDone: { target: 'flushing' },
            onError: {
              target: '#project-session.live',
              context: ({ context, event }) => ({
                ...recordCloseFailure(context, event.error),
                closeReason: undefined,
              }),
            },
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
            onDone: { target: 'releasing' },
            onError: closeFailed,
          },
        },
        releasing: {
          invoke: {
            src: 'releaseLeases',
            input: ({ context }) => ({ projectId: context.projectId }),
            onDone: { target: 'releasingAgentHost' },
            onError: closeFailed,
          },
        },
        releasingAgentHost: {
          invoke: {
            src: 'releaseAgentHost',
            input: ({ context }) => ({ projectId: context.projectId }),
            onDone: { target: 'stopping' },
            onError: closeFailed,
          },
        },
        stopping: {
          entry: ({ context }, enq) => stopChildren(context, enq),
          always: { target: '#project-session.closed' },
        },
      },
    },
    /*
     * Not a root `final` state: a done actor emits `xstate.done.actor` at its
     * parent, and the registry has already stopped this child by then. The
     * session rests here until the registry lets it go.
     */
    closed: {
      entry: ({ context }, enq) => {
        const patch = reportState(context, enq, 'closed');
        if (context.parentRef !== undefined) {
          enq.sendTo(context.parentRef, {
            type: 'sessionClosed',
            projectId: context.projectId,
            reason: context.closeReason ?? 'user',
          });
        }
        return { context: patch };
      },
    },
    failed: { entry: ({ context }, enq) => ({ context: reportState(context, enq, 'failed') }) },
  },
  exit: ({ context }, enq) => stopChildren(context, enq),
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
