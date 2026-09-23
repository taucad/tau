import { setup, types } from 'xstate';
import type { ActorRefFrom, EnqueueObject, SystemRegistry } from 'xstate';

import { eventSchemas } from '#lib/xstate.lib.js';
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

/** Why a policy refused to close a project. @public */
export type SessionsCloseRefusal = 'running' | 'dirty' | 'unpushed';

/** What one live project looks like to the registry. @public */
export type SessionsProjectStatus = Readonly<{
  state: ProjectSessionState;
  runs: number;
  dirty: boolean;
  pushed: boolean;
  /** Refs this device has not had acknowledged — quit's `Backing up n`. */
  pending: number;
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
}>;

/** Serializable state owned by sessionsMachine, plus its child refs. @public */
export type SessionsMachineContext = Readonly<{
  budget: number;
  idleWindowMilliseconds: number;
  startBoundMilliseconds: number;
  closeFlushMilliseconds: number;
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
  /**
   * The project a budget close is making room for (P47).
   *
   * The slot only exists once the closing session has flushed and released, so
   * the ninth open is remembered here and resumed on `sessionClosed`.
   */
  pendingOpen: string | undefined;
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
      readonly pending?: number;
    }
  | { readonly type: 'sessionClosed'; readonly projectId: string; readonly reason: ProjectSessionCloseReason }
  | { readonly type: 'cancelPendingOpen' }
  | { readonly type: 'quit' }
  | { readonly type: 'quitAnyway' };

/** What the registry tells the app. @public */
export type SessionsMachineEmitted =
  | { readonly type: 'liveSetChanged'; readonly projectIds: readonly string[] }
  | { readonly type: 'budgetRefused'; readonly projectId: string; readonly suggestions: readonly string[] }
  | { readonly type: 'quiesced'; readonly forced: boolean };

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
 * How many refs the live set still owes the remote — quit's `Backing up n`.
 *
 * @param context - The registry's state.
 * @returns The total pending count across every live project.
 * @public
 */
export const sessionsPendingRevisions = (context: SessionsMachineContext): number =>
  Object.keys(context.refs).reduce((total, projectId) => total + (context.status[projectId]?.pending ?? 0), 0);

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

type SessionsEnqueue = EnqueueObject<
  SessionsMachineEvent,
  SessionsMachineEmitted,
  SystemRegistry,
  Readonly<{ projectSession: typeof projectSessionMachine }>
>;

const announceLiveSet = (liveSessions: SessionsMachineContext['refs'], enq: SessionsEnqueue): void => {
  enq.emit({ type: 'liveSetChanged', projectIds: Object.keys(liveSessions) });
};

const touchProject = (context: SessionsMachineContext, projectId: string): Partial<SessionsMachineContext> => ({
  sequence: context.sequence + 1,
  touchOrder: { ...context.touchOrder, [projectId]: context.sequence + 1 },
});

const withoutKey = <T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> =>
  Object.fromEntries(Object.entries(record).filter(([id]) => id !== key));

/**
 * The client's live project set: who is open, what closed them, and quit.
 *
 * @public
 */
export const sessionsMachine = setup({
  schemas: {
    context: types<SessionsMachineContext>(),
    events: eventSchemas<SessionsMachineEvent>(),
    input: types<SessionsMachineInput>(),
    emitted: eventSchemas<SessionsMachineEmitted>(),
  },
  actors: { projectSession: projectSessionMachine },
  guards: {
    isLive: (context: SessionsMachineContext, projectId: string) => context.refs[projectId] !== undefined,
    hasRoom: (context: SessionsMachineContext) => Object.keys(context.refs).length < context.budget,
    canPolicyClose: (context: SessionsMachineContext, projectId: string) => isClosable(context, projectId),
    isQuiet: (context: SessionsMachineContext) => Object.keys(context.refs).length === 0,
    /* P47: a ninth open makes room by closing the least recently touched idle
     * project. Only when none is idle does the person have to choose. */
    hasIdleToClose: (context: SessionsMachineContext) => sessionsCloseSuggestions(context).length > 0,
  },
}).createMachine({
  id: 'sessions',
  context: ({ input }) => ({
    budget: input.budget ?? browserLiveProjectBudget,
    idleWindowMilliseconds: input.idleWindowMilliseconds ?? 30 * 60 * 1000,
    startBoundMilliseconds: input.startBoundMilliseconds ?? 30_000,
    closeFlushMilliseconds: input.closeFlushMilliseconds ?? 5000,
    refs: {},
    status: {},
    touchOrder: {},
    sequence: 0,
    closed: {},
    refusals: {},
    pendingOpen: undefined,
  }),
  initial: 'ready',
  on: {
    /* A child says where it is; the registry's policies read nothing else. */
    sessionState: {
      context: ({ context, event }) => ({
        status: {
          ...context.status,
          [event.projectId]: {
            state: event.state,
            runs: event.runs,
            dirty: event.dirty,
            pushed: event.pushed,
            pending: event.pending ?? 0,
          },
        },
        /* R6: a refusal is about the facts at the time, not about the project.
         * The run settled, the tree was saved, the push landed — the reason is
         * gone, so the row stops saying it and the next `idleExpired` decides
         * again. */
        refusals:
          context.refusals[event.projectId] !== undefined && event.runs === 0 && !event.dirty && event.pushed
            ? withoutKey(context.refusals, event.projectId)
            : context.refusals,
      }),
    },
    /* The person said *Not now* to the budget: forget the refused open, or the
     * next close would resume something nobody is waiting for any more. */
    cancelPendingOpen: { context: { pendingOpen: undefined } },
    /* The child finished its own `closing`; only now is the slot free. */
    sessionClosed: ({ context, event }, enq) => {
      const ref = context.refs[event.projectId];
      if (ref !== undefined) {
        enq.stop(ref);
      }
      const liveSessions = withoutKey(context.refs, event.projectId);
      const patch = {
        refs: liveSessions,
        status: withoutKey(context.status, event.projectId),
        closed: { ...context.closed, [event.projectId]: { reason: event.reason, at: context.sequence } },
      };
      /* The slot the budget close was making room for is free now (P47). */
      if (context.pendingOpen !== undefined) {
        enq.raise({ type: 'open', projectId: context.pendingOpen });
        announceLiveSet(liveSessions, enq);
        return { context: { ...patch, pendingOpen: undefined } };
      }
      announceLiveSet(liveSessions, enq);
      return { context: patch };
    },
  },
  states: {
    ready: {
      on: {
        open: ({ context, event, guards, self }, enq) => {
          /* Already live: opening is a touch. Navigation never restarts a
           * project, which is why returning is instant (I22). */
          if (guards.isLive(context, event.projectId)) {
            return { context: touchProject(context, event.projectId) };
          }
          if (guards.hasRoom(context)) {
            const ref = enq.spawn('projectSession', {
              id: `session:${event.projectId}`,
              input: {
                projectId: event.projectId,
                parentRef: self,
                idleWindowMilliseconds: context.idleWindowMilliseconds,
                startBoundMilliseconds: context.startBoundMilliseconds,
                closeFlushMilliseconds: context.closeFlushMilliseconds,
              },
            });
            const liveSessions = { ...context.refs, [event.projectId]: ref };
            announceLiveSet(liveSessions, enq);
            return {
              context: {
                ...touchProject(context, event.projectId),
                refs: liveSessions,
                closed: withoutKey(context.closed, event.projectId),
                refusals: withoutKey(context.refusals, event.projectId),
              },
            };
          }
          /* Over budget with something idle: close the least recently touched
           * idle project and say so on its row, then open (P47, AC24). The
           * close is asynchronous — the slot exists after that session's flush
           * and release — so the open is remembered and resumed. */
          if (guards.hasIdleToClose(context)) {
            const [victim] = sessionsCloseSuggestions(context);
            if (victim !== undefined) {
              enq.sendTo(context.refs[victim]!, { type: 'close', reason: 'budget' });
            }
            return { context: { pendingOpen: event.projectId } };
          }
          /* Nothing is idle: the budget refuses and names the candidates, so
           * the person picks (I28). Never a silent drop.
           *
           * The refused open is remembered exactly as a budget close's is (R8):
           * whichever project the person then closes resumes it, so the dialog
           * sends one close and not a close plus a second open that would take
           * the `hasIdleToClose` branch against the still-closing victim. */
          enq.emit({ type: 'budgetRefused', projectId: event.projectId, suggestions: Object.keys(context.refs) });
          return { context: { pendingOpen: event.projectId } };
        },
        touch: ({ context, event, guards }) =>
          guards.isLive(context, event.projectId) ? { context: touchProject(context, event.projectId) } : undefined,
        close: ({ context, event, guards }, enq) => {
          if (!guards.isLive(context, event.projectId)) {
            return undefined;
          }
          const ref = context.refs[event.projectId];
          if (ref !== undefined) {
            enq.sendTo(ref, { type: 'close', reason: event.reason });
          }
          return {};
        },
        /* The idle window is a visible policy, and a visible policy never
         * touches a running, dirty or unpushed project (I24, I25). */
        idleExpired: ({ context, event, guards }, enq) => {
          if (guards.canPolicyClose(context, event.projectId)) {
            const ref = context.refs[event.projectId];
            if (ref !== undefined) {
              enq.sendTo(ref, { type: 'close', reason: 'idle' });
            }
            return {};
          }
          const refusal = refusalFor(context, event.projectId);
          return {
            context: {
              refusals: refusal === undefined ? context.refusals : { ...context.refusals, [event.projectId]: refusal },
            },
          };
        },
        quit: { target: 'quitting' },
      },
    },
    quitting: {
      /* Every live session runs its own `closing`, flush included (D31). */
      entry: ({ context }, enq) => {
        for (const ref of Object.values(context.refs)) {
          enq.sendTo(ref, { type: 'close', reason: 'quit' });
        }
      },
      always: ({ context, guards }) => (guards.isQuiet(context) ? { target: 'quiesced' } : undefined),
      on: { quitAnyway: { target: 'forced' } },
    },
    quiesced: {
      type: 'final',
      entry: (_, enq) => {
        enq.emit({ type: 'quiesced', forced: false });
      },
    },
    forced: {
      type: 'final',
      entry: (_, enq) => {
        enq.emit({ type: 'quiesced', forced: true });
      },
    },
  },
});
