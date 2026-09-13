import { assign, emit, enqueueActions, setup } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { projectSessionMachine } from '#machines/project-session.machine.js';
import type { ProjectSessionCloseReason, ProjectSessionState } from '#machines/project-session.machine.js';

/**
 * The client's live set (S44, A35).
 *
 * One app singleton, created with `createActor` in a store module beside the
 * chat store and provided through context — never with `useActorRef`, so
 * Strict Mode cannot double-start every project (A38).
 *
 * It decides every open and every close. Navigation only ever sends `open` and
 * `touch`; nothing in the app closes a project as a side effect of leaving it
 * (I22). The two visible policies — the idle window and the live-project
 * budget — refuse to touch a running, dirty or unpushed project (I24, I25) and
 * say why on the snapshot the sidebar reads.
 */

/** The browser holds at most eight live projects (OQ-W25, operator ruling). */
export const browserLiveProjectBudget = 8;

/** How long quit waits for every session's `closing` before it cuts (F12). */
export const sessionsQuitBoundMilliseconds = 15_000;

/** Why a policy refused to close a project. @public */
export type SessionsCloseRefusal = 'running' | 'dirty' | 'unpushed';

/** What one live project looks like to the registry. @public */
export type SessionsProjectStatus = Readonly<{
  state: ProjectSessionState;
  runs: number;
  dirty: boolean;
  pushed: boolean;
}>;

/** Why a project is no longer live, for the row that shows the reason. @public */
export type SessionsClosedRecord = Readonly<{ reason: ProjectSessionCloseReason; at: number }>;

/** Input accepted when creating the sessionsMachine actor. @public */
export type SessionsMachineInput = Readonly<{
  /** Browser: 8. Desktop is memory-bound, so it passes `Infinity`. */
  budget?: number;
  /** EQ15's liveness idle-close window, handed to every child. */
  idleWindowMilliseconds?: number;
  startBoundMilliseconds?: number;
  closeFlushMilliseconds?: number;
  quitBoundMilliseconds?: number;
  /** The compute placement every session's runtime child is started for. */
  kernelKey?: string;
}>;

/** Serializable state owned by sessionsMachine, plus its child refs. @public */
export type SessionsMachineContext = Readonly<{
  budget: number;
  idleWindowMilliseconds: number;
  startBoundMilliseconds: number;
  closeFlushMilliseconds: number;
  quitBoundMilliseconds: number;
  kernelKey: string | undefined;
  refs: Readonly<Record<string, ActorRefFrom<typeof projectSessionMachine>>>;
  status: Readonly<Record<string, SessionsProjectStatus>>;
  /**
   * Recency as a sequence, not a clock.
   *
   * "Least recently touched" is an order, and an order is what a pure `assign`
   * can produce. A wall clock here would make the budget policy depend on the
   * machine reading the world.
   */
  touchOrder: Readonly<Record<string, number>>;
  sequence: number;
  /** Why each closed project closed; the sidebar shows this as row text. */
  closed: Readonly<Record<string, SessionsClosedRecord>>;
  /** A policy that declined to close a project, and what stopped it (I24/I25). */
  refusals: Readonly<Record<string, SessionsCloseRefusal>>;
}>;

/** Events accepted by sessionsMachine. @public */
export type SessionsMachineEvent =
  | { readonly type: 'open'; readonly projectId: string; readonly reason?: string }
  | { readonly type: 'close'; readonly projectId: string; readonly reason: ProjectSessionCloseReason }
  | { readonly type: 'touch'; readonly projectId: string }
  | { readonly type: 'idleExpired'; readonly projectId: string }
  | {
      readonly type: 'sessionState';
      readonly projectId: string;
      readonly state: ProjectSessionState;
      readonly runs: number;
      readonly dirty: boolean;
      readonly pushed: boolean;
    }
  | { readonly type: 'sessionClosed'; readonly projectId: string; readonly reason: ProjectSessionCloseReason }
  | { readonly type: 'kernelSelectionChanged'; readonly kernelKey: string }
  | { readonly type: 'quit' }
  | { readonly type: 'quitAnyway' };

/** What the registry tells the app. @public */
export type SessionsMachineEmitted =
  | { readonly type: 'liveSetChanged'; readonly projectIds: readonly string[] }
  | { readonly type: 'budgetRefused'; readonly projectId: string; readonly suggestions: readonly string[] }
  | { readonly type: 'quiesced' };

/** The app's sessions registry actor. @public */
export type SessionsActorRef = ActorRefFrom<typeof sessionsMachine>;

const statusOf = (context: SessionsMachineContext, projectId: string): SessionsProjectStatus | undefined =>
  context.status[projectId];

/** A project a policy may close: no run, clean tree, nothing unpushed. */
const isClosable = (context: SessionsMachineContext, projectId: string): boolean => {
  const status = statusOf(context, projectId);
  return status?.runs === 0 && !status.dirty && status.pushed;
};

/** What stopped a policy from closing this project. */
const refusalFor = (context: SessionsMachineContext, projectId: string): SessionsCloseRefusal | undefined => {
  const status = statusOf(context, projectId);
  if (status === undefined) {
    return undefined;
  }
  if (status.runs > 0) {
    return 'running';
  }
  if (status.dirty) {
    return 'dirty';
  }
  return status.pushed ? undefined : 'unpushed';
};

/**
 * The live projects a person could close to make room, least recently touched
 * first — the list the refusal names (I28).
 *
 * @param context - The registry's state.
 * @returns Closable live project ids, least recently touched first.
 */
export const sessionsCloseSuggestions = (context: SessionsMachineContext): readonly string[] =>
  Object.keys(context.refs)
    .filter((projectId) => isClosable(context, projectId))
    .sort((left, right) => (context.touchOrder[left] ?? 0) - (context.touchOrder[right] ?? 0));

/**
 * The client's live project set: who is open, what closed them, and quit.
 *
 * @public
 */
export const sessionsMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as SessionsMachineContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as SessionsMachineEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as SessionsMachineInput,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as SessionsMachineEmitted,
  },
  actors: { projectSession: projectSessionMachine },
  delays: { quitBound: ({ context }) => context.quitBoundMilliseconds },
  guards: {
    isLive: ({ context, event }) => 'projectId' in event && context.refs[event.projectId] !== undefined,
    hasRoom: ({ context }) => Object.keys(context.refs).length < context.budget,
    canPolicyClose: ({ context, event }) => 'projectId' in event && isClosable(context, event.projectId),
    isQuiet: ({ context }) => Object.keys(context.refs).length === 0,
  },
  actions: {
    announceLiveSet: emit(
      ({ context }) => ({ type: 'liveSetChanged', projectIds: Object.keys(context.refs) }) as const,
    ),
    touchProject: assign({
      sequence: ({ context }) => context.sequence + 1,
      touchOrder: ({ context, event }) =>
        'projectId' in event ? { ...context.touchOrder, [event.projectId]: context.sequence + 1 } : context.touchOrder,
    }),
    spawnSession: assign({
      refs: ({ context, event, spawn, self }) => {
        if (event.type !== 'open') {
          return context.refs;
        }
        return {
          ...context.refs,
          [event.projectId]: spawn('projectSession', {
            id: `session:${event.projectId}`,
            input: {
              projectId: event.projectId,
              parentRef: self,
              idleWindowMilliseconds: context.idleWindowMilliseconds,
              startBoundMilliseconds: context.startBoundMilliseconds,
              closeFlushMilliseconds: context.closeFlushMilliseconds,
              ...(context.kernelKey === undefined ? {} : { kernelKey: context.kernelKey }),
            },
          }),
        };
      },
      closed: ({ context, event }) =>
        event.type === 'open'
          ? Object.fromEntries(Object.entries(context.closed).filter(([id]) => id !== event.projectId))
          : context.closed,
      refusals: ({ context, event }) =>
        event.type === 'open'
          ? Object.fromEntries(Object.entries(context.refusals).filter(([id]) => id !== event.projectId))
          : context.refusals,
    }),
  },
}).createMachine({
  id: 'sessions',
  context: ({ input }) => ({
    budget: input.budget ?? browserLiveProjectBudget,
    idleWindowMilliseconds: input.idleWindowMilliseconds ?? 30 * 60 * 1000,
    startBoundMilliseconds: input.startBoundMilliseconds ?? 30_000,
    closeFlushMilliseconds: input.closeFlushMilliseconds ?? 5000,
    quitBoundMilliseconds: input.quitBoundMilliseconds ?? sessionsQuitBoundMilliseconds,
    kernelKey: input.kernelKey,
    refs: {},
    status: {},
    touchOrder: {},
    sequence: 0,
    closed: {},
    refusals: {},
  }),
  initial: 'ready',
  on: {
    /* A child says where it is; the registry's policies read nothing else. */
    sessionState: {
      actions: assign({
        status: ({ context, event }) => ({
          ...context.status,
          [event.projectId]: {
            state: event.state,
            runs: event.runs,
            dirty: event.dirty,
            pushed: event.pushed,
          },
        }),
      }),
    },
    kernelSelectionChanged: {
      actions: [
        assign({ kernelKey: ({ event }) => event.kernelKey }),
        enqueueActions(({ enqueue, context, event }) => {
          for (const ref of Object.values(context.refs)) {
            enqueue.sendTo(ref, { type: 'kernelSelectionChanged', kernelKey: event.kernelKey });
          }
        }),
      ],
    },
    /* The child finished its own `closing`; only now is the slot free. */
    sessionClosed: {
      actions: [
        enqueueActions(({ enqueue, context, event }) => {
          const ref = context.refs[event.projectId];
          if (ref !== undefined) {
            enqueue.stopChild(ref);
          }
          enqueue.assign({
            refs: Object.fromEntries(Object.entries(context.refs).filter(([id]) => id !== event.projectId)),
            status: Object.fromEntries(Object.entries(context.status).filter(([id]) => id !== event.projectId)),
            closed: { ...context.closed, [event.projectId]: { reason: event.reason, at: context.sequence } },
          });
        }),
        'announceLiveSet',
      ],
    },
  },
  states: {
    ready: {
      on: {
        open: [
          /* Already live: opening is a touch. Navigation never restarts a
           * project, which is why returning is instant (I22). */
          { guard: 'isLive', actions: 'touchProject' },
          { guard: 'hasRoom', actions: ['touchProject', 'spawnSession', 'announceLiveSet'] },
          /* The budget is a guard on `open`, not a region: the ninth open is
           * refused and names what to close (I28). */
          {
            actions: emit(
              ({ context, event }) =>
                ({
                  type: 'budgetRefused',
                  projectId: event.projectId,
                  suggestions: sessionsCloseSuggestions(context),
                }) as const,
            ),
          },
        ],
        touch: { guard: 'isLive', actions: 'touchProject' },
        close: {
          guard: 'isLive',
          actions: enqueueActions(({ enqueue, context, event }) => {
            const ref = context.refs[event.projectId];
            if (ref !== undefined) {
              enqueue.sendTo(ref, { type: 'close', reason: event.reason });
            }
          }),
        },
        /* The idle window is a visible policy, and a visible policy never
         * touches a running, dirty or unpushed project (I24, I25). */
        idleExpired: [
          {
            guard: 'canPolicyClose',
            actions: enqueueActions(({ enqueue, context, event }) => {
              const ref = context.refs[event.projectId];
              if (ref !== undefined) {
                enqueue.sendTo(ref, { type: 'close', reason: 'idle' });
              }
            }),
          },
          {
            actions: assign({
              refusals: ({ context, event }) => {
                const refusal = refusalFor(context, event.projectId);
                return refusal === undefined ? context.refusals : { ...context.refusals, [event.projectId]: refusal };
              },
            }),
          },
        ],
        quit: { target: 'quitting' },
      },
    },
    quitting: {
      /* Every live session runs its own `closing`, flush included (D31). */
      entry: enqueueActions(({ enqueue, context }) => {
        for (const ref of Object.values(context.refs)) {
          enqueue.sendTo(ref, { type: 'close', reason: 'quit' });
        }
      }),
      always: [{ guard: 'isQuiet', target: 'quiesced' }],
      after: { quitBound: 'quiesced' },
      on: { quitAnyway: 'quiesced' },
    },
    quiesced: {
      type: 'final',
      entry: emit({ type: 'quiesced' }),
    },
  },
});
