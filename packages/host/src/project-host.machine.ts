/**
 * `projectHost` (W6 RH-S5): one project host's lifecycle — one actor per root in the desktop utility. It decides
 * which host a renderer connection is served on and when a released host closes, and it refines
 * `specs/AttachGeneration.tla` (I31) with both of W0.11's fixes built in:
 * - **A release names a generation.** A release older than the newest connect served was outrun by a remount and is
 *   answered `stale` (main keeps the generation monotone: `FixMain`). One at or past it closes the host: no connect
 *   outran it, so every holder it names is gone, and a late connect it covers does not revive the host (W6.r1
 *   finding 14).
 * - **A closing host is never adopted.** A connect that arrives while the host closes is held, and served on a fresh
 *   host once the close ends (`FixUtil`).
 * - **A released host drains first.** It keeps serving until the launcher reports its runs ended and settled, so a
 *   remount during the drain is served on the same host and the close never cuts a run short (RH-A20; `draining` is
 *   not in the spec, RH-Q12).
 *
 * The machine is pure (MC-R6): its effects are custom actions the composition provides (`createProjectHostActor`),
 * and every outcome comes back as a public event checked against its incarnation or drain (MC-R18). Context is
 * memory-only (D3): a restarted utility starts with no host and opens one on the first connect.
 */

import { setup, types } from 'xstate';

import {
  closingContextSchema,
  drainingContextSchema,
  projectHostContextSchema,
  projectHostEmittedSchemas,
  projectHostEventSchemas,
  servingContextSchema,
} from '#project-host.schemas.js';
import type { ProjectHostContext, ProjectHostQueued, ProjectHostReleased } from '#project-host.schemas.js';

/** The `AttachGeneration.tla` actions `projectHost`'s transitions refine (MC-R27). */
export type AttachGenerationAction = 'UConnect' | 'URelStart' | 'UCloseDone' | 'UCheck';

/** A transition's label: the spec action it refines, or `Unmodelled` (drain, queueing, quit, open failure, faults). */
export type ProjectHostTransitionLabel = AttachGenerationAction | 'Unmodelled';

/** Arguments of each effect the composition provides. */
export type ProjectHostEffectArgs = Readonly<{
  /** Build the host for this incarnation, then send `opened` or `openFailed`. */
  open: Readonly<{ incarnation: number }>;
  /** Serve the held connection on the current host. */
  serve: Readonly<{ connectionId: string }>;
  /** Close the held connection unserved. */
  refuse: Readonly<{ connectionId: string }>;
  /** Wait until the host's runs ended and settled, then send `quiescent`. */
  drain: Readonly<{ drain: number }>;
  /** Close the current host, then send `closed`. */
  close: Readonly<{ incarnation: number }>;
}>;

/** Input of {@link projectHostMachine}. */
export type ProjectHostInput = Readonly<{ root: string }>;

/**
 * `{ to, meta }` (MC-R27), typed as its transition function.
 * ponytail: alpha.59's `setup` types omit the `{ to, meta }` form the runtime takes (k9); drop the cast when xstate
 * types it.
 *
 * @param tla - The `AttachGeneration.tla` action the transition refines.
 * @param to - The transition function.
 * @returns The transition, carrying its static meta.
 */
const refines = <F>(tla: ProjectHostTransitionLabel, to: F): F =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above.
  ({ meta: { tla }, to }) as unknown as F;

/**
 * One event's modelled and unmodelled branches as two labelled transitions (W7's `branches`, MC-R27): `unmodelled`
 * returns `undefined` (disabled) wherever `modelled` applies, and xstate takes the first enabled transition. Setup
 * types admit no transition arrays, hence the one cast.
 *
 * @param unmodelled - The `Unmodelled` branch, disabled where the modelled one applies.
 * @param modelled - The branch the spec action refines.
 * @returns Both transitions.
 */
const branches = <F>(
  unmodelled: F extends (...args: infer Args) => unknown ? (...args: Args) => unknown : never,
  modelled: F,
): F =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above.
  [unmodelled, modelled] as unknown as F;

/**
 * Events a state takes on purpose without a transition (MC-R17). Every state answers every event; effect outcomes
 * outside the state that asked for them are stale and answered `{}` at the root.
 */
export const projectHostIgnoredEvents = { projectHost: [] } as const satisfies Readonly<
  Record<string, ReadonlyArray<readonly [state: string, eventType: string]>>
>;

const notProvided = (name: keyof ProjectHostEffectArgs): never => {
  throw new Error(`projectHost: the ${name} effect was not provided; createProjectHostActor provides every effect.`);
};

/* The one effect the helpers below take from `enq`. */
type Emits = { emit(event: ProjectHostReleased): void };

const stale = (enq: Emits, requestId: string): void => {
  enq.emit({ type: 'released', requestId, outcome: 'stale', message: null });
};

/* A release is outrun when a connect newer than it was served; one naming no generation is an older main's. */
const outrun = (gen: Extract<ProjectHostQueued, { type: 'release' }>['gen'], served: number): boolean =>
  gen !== null && gen < served;

/* Answer everything held, when no host will serve it: connects are refused, releases answered as `outcome`. */
const dropQueue = (
  enq: Emits,
  queue: readonly ProjectHostQueued[],
  answer: Readonly<{
    refuse: (connectionId: string) => void;
    outcome: 'stale' | 'failed';
    message: ProjectHostReleased['message'];
  }>,
): void => {
  const { refuse, outcome, message } = answer;
  for (const held of queue) {
    if (held.type === 'connect') {
      refuse(held.connectionId);
    } else {
      enq.emit({ type: 'released', requestId: held.requestId, outcome, message });
    }
  }
};

/**
 * One project host's lifecycle: `opening`, `serving`, `draining`, `closing`, `closed` (W6 RH-S5, I31).
 *
 * @internal
 */
export const projectHostMachine = setup({
  schemas: {
    context: projectHostContextSchema,
    input: types<ProjectHostInput>(),
    events: projectHostEventSchemas,
    emitted: projectHostEmittedSchemas,
    tags: types<'accepting'>(),
    transitionMeta: types<{ tla: ProjectHostTransitionLabel }>(),
  },
  states: {
    opening: {},
    serving: { schemas: { context: servingContextSchema } },
    draining: { schemas: { context: drainingContextSchema } },
    closing: { schemas: { context: closingContextSchema } },
    closed: { type: 'final' },
  },
  actions: {
    open: (_args: ProjectHostEffectArgs['open']): void => notProvided('open'),
    serve: (_args: ProjectHostEffectArgs['serve']): void => notProvided('serve'),
    refuse: (_args: ProjectHostEffectArgs['refuse']): void => notProvided('refuse'),
    drain: (_args: ProjectHostEffectArgs['drain']): void => notProvided('drain'),
    close: (_args: ProjectHostEffectArgs['close']): void => notProvided('close'),
  },
}).createMachine({
  id: 'projectHost',
  version: '2',
  context: ({ input }): ProjectHostContext => ({ root: input.root, incarnation: 1, drains: 0, queue: [], owed: [] }),
  /* A fault answers everything this actor still owes, from root keys only (MC-R26), and ends it; the composition's
   * next connect starts a fresh actor (MC-R12, MC-R24). The composition closes a host the actor left open. */
  onError: refines('Unmodelled', ({ context, actions }, enq) => {
    dropQueue(enq, context.queue, {
      refuse: (connectionId) => {
        enq(actions.refuse, { connectionId });
      },
      outcome: 'failed',
      message: 'projectHost fault',
    });
    for (const requestId of context.owed) {
      enq.emit({ type: 'released', requestId, outcome: 'failed', message: 'projectHost fault' });
    }
    return { target: '.closed', context: { queue: [], owed: [] } };
  }),
  /* Outcomes of an earlier incarnation or drain: stale here (MC-R18). */
  on: {
    opened: refines('Unmodelled', () => ({})),
    openFailed: refines('Unmodelled', () => ({})),
    quiescent: refines('Unmodelled', () => ({})),
    closed: refines('Unmodelled', () => ({})),
  },
  initial: 'opening',
  states: {
    /* The host is being built. Everything that arrives meanwhile is held, in order: in the spec it is still in `msgs`. */
    opening: {
      entry: ({ context, actions }, enq) => {
        enq(actions.open, { incarnation: context.incarnation });
      },
      on: {
        connect: refines('Unmodelled', ({ context, event }) => ({
          context: { queue: [...context.queue, { type: 'connect', gen: event.gen, connectionId: event.connectionId }] },
        })),
        release: refines('Unmodelled', ({ context, event }) => ({
          context: { queue: [...context.queue, { type: 'release', gen: event.gen, requestId: event.requestId }] },
        })),
        shutdown: refines('Unmodelled', ({ context, event }) => ({
          context: { queue: [...context.queue, { type: 'shutdown', requestId: event.requestId }] },
        })),
        /* UConnect's fresh-launcher branch: the held events replay, in order, against the new host. */
        opened: refines('UConnect', ({ context, event }, enq) => {
          if (event.incarnation !== context.incarnation) {
            return {};
          }
          for (const held of context.queue) {
            enq.raise(held);
          }
          return { target: 'serving', context: { queue: [], gen: 0 } };
        }),
        openFailed: refines('Unmodelled', ({ context, event, actions }, enq) => {
          if (event.incarnation !== context.incarnation) {
            return {};
          }
          dropQueue(enq, context.queue, {
            refuse: (connectionId) => {
              enq(actions.refuse, { connectionId });
            },
            outcome: 'failed',
            message: event.message,
          });
          return { target: 'closed', context: { queue: [] } };
        }),
      },
    },
    serving: {
      tags: ['accepting'],
      on: {
        /* UConnect on an open launcher: served on it; the host is attached under the newest generation served. */
        connect: refines('UConnect', ({ context, event, actions }, enq) => {
          enq(actions.serve, { connectionId: event.connectionId });
          return { context: { gen: Math.max(context.gen, event.gen ?? context.gen) } };
        }),
        release: branches(
          /* The drain starts: the spec's URelStart begins the close at once, this host serves on until its runs
           * settle (RH-A20, RH-Q12). It closes the release's generation, which may be newer than any connect served
           * (a retain whose connect never came). */
          refines('Unmodelled', ({ context, event, actions }, enq) => {
            if (outrun(event.gen, context.gen)) {
              return undefined;
            }
            const drain = context.drains + 1;
            enq(actions.drain, { drain });
            return {
              target: 'draining',
              context: { drains: drain, drain, owed: [event.requestId], gen: Math.max(context.gen, event.gen ?? 0) },
            };
          }),
          /* URelStart's stale branch: a remount outran this release, which is answered and ignored. */
          refines('URelStart', ({ event }, enq) => {
            stale(enq, event.requestId);
            return {};
          }),
        ),
        shutdown: refines('Unmodelled', ({ context, event, actions }, enq) => {
          enq(actions.close, { incarnation: context.incarnation });
          return {
            target: 'closing',
            context: { closedGen: context.gen, owed: [event.requestId], shutdown: true },
          };
        }),
      },
    },
    /* Released, still serving until its runs end and settle: the close has not begun. */
    draining: {
      tags: ['accepting'],
      on: {
        /* A connect the release covers (a holder it already released) is served here and closes with the host. A
         * newer one, or one from a main that names none, is a remount: served, and the release it outran answered. */
        connect: refines('Unmodelled', ({ context, event, actions }, enq) => {
          if (event.gen !== null && event.gen <= context.gen) {
            enq(actions.serve, { connectionId: event.connectionId });
            return {};
          }
          /* Answered before the serve: a fault serving it leaves no owed release unanswered (the context has let go). */
          for (const requestId of context.owed) {
            stale(enq, requestId);
          }
          enq(actions.serve, { connectionId: event.connectionId });
          return { target: 'serving', context: { gen: event.gen ?? context.gen, owed: [] } };
        }),
        /* URelStart's stale branch: this host's release is already under way. */
        release: refines('URelStart', ({ event }, enq) => {
          stale(enq, event.requestId);
          return {};
        }),
        shutdown: refines('Unmodelled', ({ context, event, actions }, enq) => {
          enq(actions.close, { incarnation: context.incarnation });
          return {
            target: 'closing',
            context: { closedGen: context.gen, owed: [...context.owed, event.requestId], shutdown: true },
          };
        }),
        /* URelStart's close: the launcher is quiescent, so its close begins and it is never adopted again. */
        quiescent: refines('URelStart', ({ context, event, actions }, enq) => {
          if (event.drain !== context.drain) {
            return {};
          }
          enq(actions.close, { incarnation: context.incarnation });
          return { target: 'closing', context: { closedGen: context.gen, shutdown: false } };
        }),
      },
    },
    /* The host closes. A connect waits for a fresh host (FixUtil); a release of this generation or older is stale. */
    closing: {
      on: {
        connect: refines('Unmodelled', ({ context, event, actions }, enq) => {
          if (context.shutdown) {
            enq(actions.refuse, { connectionId: event.connectionId });
            return {};
          }
          return {
            context: {
              queue: [...context.queue, { type: 'connect', gen: event.gen, connectionId: event.connectionId }],
            },
          };
        }),
        release: branches(
          /* A newer generation belongs to a held connect, so it waits with it: in the spec it is still in `msgs`. */
          refines('Unmodelled', ({ context, event }) => {
            if (event.gen === null || event.gen <= context.closedGen || context.shutdown) {
              return undefined;
            }
            return {
              context: { queue: [...context.queue, { type: 'release', gen: event.gen, requestId: event.requestId }] },
            };
          }),
          /* URelStart after UCheck in the spec: the closed launcher's generation no longer matches. */
          refines('URelStart', ({ event }, enq) => {
            stale(enq, event.requestId);
            return {};
          }),
        ),
        shutdown: refines('Unmodelled', ({ context, event, actions }, enq) => {
          dropQueue(enq, context.queue, {
            refuse: (connectionId) => {
              enq(actions.refuse, { connectionId });
            },
            outcome: 'stale',
            message: null,
          });
          return { context: { queue: [], owed: [...context.owed, event.requestId], shutdown: true } };
        }),
        /* UCloseDone then UCheck, in one step: the launcher is gone, and a held connect opens a fresh one. */
        closed: refines('UCheck', ({ context, event }, enq) => {
          if (event.incarnation !== context.incarnation) {
            return {};
          }
          for (const requestId of context.owed) {
            enq.emit({
              type: 'released',
              requestId,
              outcome: event.message === null ? 'closed' : 'failed',
              message: event.message,
            });
          }
          /* Only a held connect opens a fresh host; releases held without one name no holder left, so they are stale. */
          if (!context.shutdown && context.queue.some((held) => held.type === 'connect')) {
            return { target: 'opening', context: { incarnation: context.incarnation + 1, owed: [] } };
          }
          for (const held of context.queue) {
            if (held.type === 'release') {
              stale(enq, held.requestId);
            }
          }
          return { target: 'closed', context: { queue: [], owed: [] } };
        }),
      },
    },
    closed: { type: 'final' },
  },
});
