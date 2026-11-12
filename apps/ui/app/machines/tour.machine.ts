/**
 * The product tour's engine: five tips in a fixed order, each shown beside the control it explains only while its
 * condition holds.
 *
 * The rules, all of them here:
 *
 * 1. Fixed order. The tip shown is the first tip not yet seen, and only when its condition holds. A later tip never
 *    appears while an earlier one is unseen.
 * 2. Otherwise wait. If that tip's condition does not hold, nothing is shown.
 * 3. Real actions count. A real action marks its tip seen whenever the guided tour is running, whether or not that tip
 *    is the one showing.
 * 4. Next performs nothing: it marks the current tip seen. Back shows the previous tip again for this session; what is
 *    stored as seen does not shrink.
 * 5. One tip can be passed over. Parameters is marked seen when the agent is idle and the model has no parameters.
 * 6. A tip never waits on its target being visible (the anchors fall back; that is the host's part).
 * 7. No timeouts. The only timer is Look around's one-second rest, so it does not vanish mid-drag.
 *
 * What is stored about the guided tour only grows (`seen` gains tips, `ended` is set once); the machine emits each
 * addition for the host to write and never reads storage itself. Pausing belongs to the device. A replay, started from
 * Help or the command palette, lives in this actor's memory: it steps through all five tips with Next whatever the
 * project holds and stores nothing. The tip on screen is derived from context with {@link selectTourTip}.
 */

import { createActor, setup, types } from 'xstate';
import type { Actor, ActorOptions, AnyActorLogic } from 'xstate';
import { tourStepIds } from '@taucad/preferences';
import type { TourEnding, TourStepId } from '@taucad/preferences';
import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';

/** How a tour runs: the first, guided run, or a replay asked for from Help or the command palette. @public */
export type TourMode = 'guided' | 'replay';

/** How the project was reached: an empty project, or a prompt already sent (from Home). @public */
export type TourArrival = 'empty' | 'prompt';

/** How a tip came to be seen. @public */
export type TourSeenBy = 'action' | 'next' | 'passedOver';

/**
 * What the editor says about the project on screen. The host reports each fact as it changes.
 *
 * @public
 */
export type TourFacts = Readonly<{
  /** A message has been sent in the chat open in the project's chat lane. */
  messageSent: boolean;
  /** A model is on screen in a viewer. */
  modelOnScreen: boolean;
  /** An agent turn is running in that chat. */
  turnRunning: boolean;
  /** The model on screen has parameters. */
  hasParameters: boolean;
  /** The transcript holds an activity row whose families include a test run. */
  hasTestRun: boolean;
}>;

/** The guided tour as stored: tips seen and how it ended. @public */
export type StoredTour = Readonly<{ seen: readonly TourStepId[]; ended?: TourEnding }>;

/** Input accepted when creating the tour actor. @public */
export type TourMachineInput = Readonly<{
  stored: StoredTour;
  /** Setup's tour switch, or a newcomer's first project, asked for a guided tour. */
  wanted: boolean;
  /** This device paused the guided tour. */
  paused: boolean;
  /** Start a replay straight away (Help chose "Take the tour" before the tour was loaded). */
  replay?: boolean;
}>;

/** Serializable state owned by the tour machine. @public */
export type TourMachineContext = Readonly<{
  stored: StoredTour;
  wanted: boolean;
  paused: boolean;
  facts: TourFacts;
  /** Set by the first report of the facts: whether a message had already been sent. */
  arrival: TourArrival | undefined;
  /** The tips a replay has stepped through. Present only during a replay. */
  replaySeen: readonly TourStepId[] | undefined;
  /** A tip shown again after Back, for this session only. */
  reviewing: TourStepId | undefined;
  /** The tip last announced as shown, so each appearance is announced once. */
  shown: TourStepId | undefined;
  /** A fault no transition modelled; the tour keeps answering. */
  fault?: string;
}>;

/** Events accepted by the tour machine. @public */
export type TourMachineEvent =
  | Readonly<{ type: 'factsChanged'; facts: Partial<TourFacts> }>
  | Readonly<{ type: 'actionDone'; step: TourStepId }>
  | Readonly<{ type: 'cameraMoved' }>
  | Readonly<{ type: 'cameraRested' }>
  | Readonly<{ type: 'next' }>
  | Readonly<{ type: 'back' }>
  | Readonly<{ type: 'pause' }>
  | Readonly<{ type: 'resume' }>
  | Readonly<{ type: 'skip' }>
  | Readonly<{ type: 'replayStarted' }>
  | Readonly<{ type: 'replayClosed' }>
  | Readonly<{ type: 'storedChanged'; stored: StoredTour; wanted: boolean; paused: boolean }>;

/** Events the tour machine emits for the host to store and report. @public */
export type TourMachineEmitted =
  | Readonly<{ type: 'started'; mode: TourMode }>
  | Readonly<{ type: 'shown'; mode: TourMode; step: TourStepId }>
  | Readonly<{ type: 'seen'; mode: TourMode; step: TourStepId; by: TourSeenBy }>
  | Readonly<{ type: 'pausedChanged'; paused: boolean; step: TourStepId }>
  | Readonly<{ type: 'ended'; ending: TourEnding; step: TourStepId | undefined }>
  | Readonly<{ type: 'replayEnded'; completed: boolean; step: TourStepId | undefined }>;

/** One tip's definition: data, so the copy, anchors and conditions are read from one table. @public */
export type TourStepDefinition = Readonly<{
  id: TourStepId;
  concept: 'Design' | 'Verify' | 'Build';
  /** Whether the tip may appear during a guided tour. */
  condition: (facts: TourFacts) => boolean;
}>;

const isIdle = (facts: TourFacts): boolean => facts.modelOnScreen && !facts.turnRunning;

/**
 * The five tips in order. "The agent is idle" means a model is on screen and no agent turn is running.
 *
 * @public
 */
export const tourSteps: readonly TourStepDefinition[] = [
  { id: 'ask', concept: 'Design', condition: () => true },
  { id: 'look', concept: 'Design', condition: (facts) => facts.modelOnScreen },
  { id: 'adjust', concept: 'Design', condition: (facts) => facts.modelOnScreen && facts.hasParameters },
  { id: 'verify', concept: 'Verify', condition: isIdle },
  { id: 'build', concept: 'Build', condition: isIdle },
];

/** The facts before the host has reported any. @public */
export const unknownTourFacts: TourFacts = Object.freeze({
  messageSent: false,
  modelOnScreen: false,
  turnRunning: false,
  hasParameters: false,
  hasTestRun: false,
});

/** Look around is seen this long after the camera comes to rest following a move, so it never vanishes mid-drag. */
const lookRestMilliseconds = 1000;

/**
 * The machine's one timer.
 *
 * @public
 */
export const tourTimeouts = [
  {
    state: 'running.settling',
    delay: 'lookRest',
    maximum: lookRestMilliseconds,
    purpose: 'Mark Look around seen once the camera has rested after a move; a new move cancels it',
  },
] as const;

/**
 * The `[state, eventType]` pairs the tour machine takes without a transition, on purpose (MC-R17).
 *
 * @public
 */
export const tourIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  /* No guided tour runs, so actions, the camera, Next, Back, pause, resume, skip and closing a replay mean nothing. */
  ...(['actionDone', 'cameraMoved', 'cameraRested', 'next', 'back', 'pause', 'resume', 'skip', 'replayClosed'] as const)
    .flatMap((type) => [['inactive', type] as const, ['paused', type] as const])
    .filter(([state, type]) => !(state === 'paused' && (type === 'resume' || type === 'skip'))),
  /* Already running. */
  ['running.watching', 'resume'],
  ['running.settling', 'resume'],
  ['running.watching', 'replayClosed'],
  ['running.settling', 'replayClosed'],
  /* A move with no rest pending changes nothing. */
  ['running.watching', 'cameraMoved'],
  /* A replay is stepped with Next: real actions, the camera and pausing do not touch it. */
  ['replay', 'actionDone'],
  ['replay', 'cameraMoved'],
  ['replay', 'cameraRested'],
  ['replay', 'pause'],
  ['replay', 'resume'],
];

const addSeen = (seen: readonly TourStepId[], step: TourStepId): readonly TourStepId[] =>
  seen.includes(step) ? seen : tourStepIds.filter((id) => id === step || seen.includes(id));

const firstUnseen = (seen: readonly TourStepId[]): TourStepId | undefined =>
  tourStepIds.find((id) => !seen.includes(id));

const stepIndex = (step: TourStepId): number => tourStepIds.indexOf(step);

const definition = (step: TourStepId): TourStepDefinition => tourSteps[stepIndex(step)]!;

/**
 * The tip on screen.
 *
 * @public
 */
export type TourTip = Readonly<{
  step: TourStepId;
  /** Zero-based position among the five. */
  index: number;
  mode: TourMode;
  /** Shown again after Back. */
  isReviewing: boolean;
  /** An earlier tip has been seen, so Back has somewhere to go. */
  hasPrevious: boolean;
  /** Next on this tip ends the tour. */
  isLast: boolean;
}>;

const tipFor = (context: TourMachineContext, mode: TourMode): TourTip | undefined => {
  const seen = mode === 'replay' ? (context.replaySeen ?? []) : context.stored.seen;
  const next = firstUnseen(seen);
  const step =
    context.reviewing ??
    (next === undefined
      ? undefined
      : mode === 'replay' || definition(next).condition(context.facts)
        ? next
        : undefined);
  if (step === undefined) {
    return undefined;
  }
  const index = stepIndex(step);
  return {
    step,
    index,
    mode,
    isReviewing: context.reviewing !== undefined,
    hasPrevious: tourStepIds.slice(0, index).some((id) => seen.includes(id)),
    isLast: context.reviewing === undefined && seen.length === tourStepIds.length - 1,
  };
};

/**
 * The tip on screen for a snapshot of the tour, or `undefined` while the tour waits, is paused or is not running.
 *
 * @param snapshot - The tour actor's snapshot.
 * @returns The tip, or `undefined`.
 * @public
 */
export const selectTourTip = (snapshot: {
  readonly context: TourMachineContext;
  readonly matches: (state: 'running' | 'replay') => boolean;
}): TourTip | undefined => {
  if (snapshot.matches('replay')) {
    return tipFor(snapshot.context, 'replay');
  }
  return snapshot.matches('running') ? tipFor(snapshot.context, 'guided') : undefined;
};

/**
 * The tip the guided tour would show next, counted from one, for "Resume tour (tip n of 5)".
 *
 * @param stored - The stored tour.
 * @returns Its position, from 1 to 5.
 * @public
 */
export const nextGuidedTipNumber = (stored: StoredTour): number => {
  const next = firstUnseen(stored.seen);
  return next === undefined ? tourStepIds.length : stepIndex(next) + 1;
};

/** The state a guided tour rests in, from what is stored. */
const guidedTarget = (context: Pick<TourMachineContext, 'stored' | 'wanted' | 'paused'>): string =>
  context.stored.ended !== undefined || !context.wanted ? 'inactive' : context.paused ? 'paused' : 'running';

const mergeStored = (current: StoredTour, incoming: StoredTour): StoredTour => {
  const seen = tourStepIds.filter((id) => current.seen.includes(id) || incoming.seen.includes(id));
  const ended =
    current.ended === 'completed' || incoming.ended === 'completed' ? 'completed' : (current.ended ?? incoming.ended);
  return ended === undefined ? { seen } : { seen, ended };
};

type Emit = Readonly<{ emit: (event: TourMachineEmitted) => void }>;

/**
 * One step of the guided tour's derived rules: the arrival, tip 1 on the way it was reached, tip 3 passed over, the
 * end once all five are seen, and the announcement of a newly shown tip. Returns `undefined` when nothing changes, so
 * an eventless transition built on it settles.
 */
const settleGuided = (
  context: TourMachineContext,
  enq: Emit,
): Readonly<{ target?: string; context: Partial<TourMachineContext> }> | undefined => {
  const { facts } = context;
  let { stored } = context;
  const patch: { -readonly [K in keyof TourMachineContext]?: TourMachineContext[K] } = {};
  const markSeen = (step: TourStepId, by: TourSeenBy): void => {
    if (!stored.seen.includes(step)) {
      stored = { ...stored, seen: addSeen(stored.seen, step) };
      enq.emit({ type: 'seen', mode: 'guided', step, by });
    }
  };
  if (context.arrival === 'empty' && facts.messageSent) {
    markSeen('ask', 'action');
  }
  if (context.arrival === 'prompt' && facts.modelOnScreen) {
    markSeen('ask', 'action');
  }
  if (isIdle(facts) && !facts.hasParameters) {
    markSeen('adjust', 'passedOver');
  }
  if (stored !== context.stored) {
    patch.stored = stored;
  }
  if (stored.seen.length === tourStepIds.length) {
    enq.emit({ type: 'ended', ending: 'completed', step: undefined });
    return {
      target: 'inactive',
      context: { ...patch, stored: { ...stored, ended: 'completed' }, reviewing: undefined, shown: undefined },
    };
  }
  const tip = tipFor({ ...context, stored }, 'guided');
  if (tip?.step !== context.shown) {
    patch.shown = tip?.step;
    if (tip !== undefined) {
      if (stored.seen.length === 0 && context.shown === undefined && tip.step === 'ask') {
        enq.emit({ type: 'started', mode: 'guided' });
      }
      enq.emit({ type: 'shown', mode: 'guided', step: tip.step });
    }
  }
  return Object.keys(patch).length === 0 ? undefined : { context: patch };
};

/** The replay's counterpart of {@link settleGuided}: its end once all five are stepped through, and each new tip. */
const settleReplay = (
  context: TourMachineContext,
  enq: Emit,
): Readonly<{ target?: string; context: Partial<TourMachineContext> }> | undefined => {
  if ((context.replaySeen ?? []).length === tourStepIds.length) {
    enq.emit({ type: 'replayEnded', completed: true, step: undefined });
    return {
      target: guidedTarget(context),
      context: { replaySeen: undefined, reviewing: undefined, shown: undefined },
    };
  }
  const tip = tipFor(context, 'replay');
  if (tip?.step === context.shown) {
    return undefined;
  }
  if (tip !== undefined) {
    enq.emit({ type: 'shown', mode: 'replay', step: tip.step });
  }
  return { context: { shown: tip?.step } };
};

const previousSeen = (context: TourMachineContext, mode: TourMode): TourStepId | undefined => {
  const tip = tipFor(context, mode);
  if (tip === undefined) {
    return undefined;
  }
  const seen = mode === 'replay' ? (context.replaySeen ?? []) : context.stored.seen;
  return tourStepIds
    .slice(0, tip.index)
    .toReversed()
    .find((id) => seen.includes(id));
};

/**
 * The product tour: guided runs, pause, skip, and replays, over facts the editor reports.
 *
 * @public
 */
export const tourMachine = setup({
  schemas: {
    context: types<TourMachineContext>(),
    events: eventSchemas<TourMachineEvent>(),
    input: types<TourMachineInput>(),
    emitted: eventSchemas<TourMachineEmitted>(),
  },
  delays: { lookRest: lookRestMilliseconds },
}).createMachine({
  id: 'tour',
  version: '1',
  context: ({ input }) => ({
    stored: input.stored,
    wanted: input.wanted,
    paused: input.paused,
    facts: unknownTourFacts,
    arrival: undefined,
    replaySeen: input.replay === true ? [] : undefined,
    reviewing: undefined,
    shown: undefined,
  }),
  initial: 'inactive',
  /* A fault no transition modelled is recorded and the tour keeps answering (MC-R12). */
  onError: ({ event }) => ({
    context: { fault: event.error instanceof Error ? event.error.message : 'tour fault' },
  }),
  on: {
    /* The facts are kept in every state, so a tour resumed or replayed later starts from what is on screen. */
    factsChanged: ({ context, event }) => {
      const facts = { ...context.facts, ...event.facts };
      return {
        context: {
          facts,
          arrival: context.arrival ?? (facts.messageSent ? 'prompt' : 'empty'),
        },
      };
    },
    replayStarted: (_, enq) => {
      enq.emit({ type: 'started', mode: 'replay' });
      return { target: '.replay', context: { replaySeen: [], reviewing: undefined, shown: undefined } };
    },
  },
  states: {
    /* No guided tour runs. Also the first state: it moves at once to where the input says the tour is. */
    inactive: {
      always: ({ context }, enq) => {
        if (context.replaySeen !== undefined) {
          enq.emit({ type: 'started', mode: 'replay' });
          return { target: 'replay' };
        }
        const target = guidedTarget(context);
        return target === 'inactive' ? undefined : { target };
      },
      on: {
        storedChanged: ({ context, event }) => {
          const next = {
            stored: mergeStored(context.stored, event.stored),
            wanted: event.wanted,
            paused: event.paused,
          };
          return { target: guidedTarget(next), context: next };
        },
      },
    },
    running: {
      initial: 'watching',
      always: ({ context }, enq) => settleGuided(context, enq),
      on: {
        actionDone: ({ context, event }, enq) => {
          if (context.stored.seen.includes(event.step)) {
            return {};
          }
          enq.emit({ type: 'seen', mode: 'guided', step: event.step, by: 'action' });
          return {
            context: {
              stored: { ...context.stored, seen: addSeen(context.stored.seen, event.step) },
              reviewing: context.reviewing === event.step ? undefined : context.reviewing,
            },
          };
        },
        next: ({ context }, enq) => {
          const tip = tipFor(context, 'guided');
          if (tip === undefined) {
            return {};
          }
          if (!context.stored.seen.includes(tip.step)) {
            enq.emit({ type: 'seen', mode: 'guided', step: tip.step, by: 'next' });
          }
          return {
            context: {
              stored: { ...context.stored, seen: addSeen(context.stored.seen, tip.step) },
              reviewing: undefined,
            },
          };
        },
        back: ({ context }) => {
          const previous = previousSeen(context, 'guided');
          /* With nothing earlier seen, Back is answered and changes nothing. */
          return previous === undefined ? {} : { context: { reviewing: previous } };
        },
        pause: ({ context }, enq) => {
          enq.emit({ type: 'pausedChanged', paused: true, step: firstUnseen(context.stored.seen) ?? 'build' });
          return { target: 'paused', context: { paused: true, reviewing: undefined, shown: undefined } };
        },
        skip: ({ context }, enq) => {
          enq.emit({ type: 'ended', ending: 'dismissed', step: tipFor(context, 'guided')?.step });
          return {
            target: 'inactive',
            context: { stored: { ...context.stored, ended: 'dismissed' }, reviewing: undefined, shown: undefined },
          };
        },
        storedChanged: ({ context, event }) => {
          const next = {
            stored: mergeStored(context.stored, event.stored),
            wanted: event.wanted,
            paused: event.paused,
          };
          const target = guidedTarget(next);
          return target === 'running'
            ? { context: next }
            : { target, context: { ...next, reviewing: undefined, shown: undefined } };
        },
      },
      states: {
        watching: {
          on: { cameraRested: { target: 'settling' } },
        },
        settling: {
          after: {
            lookRest: ({ context }, enq) => {
              if (!context.stored.seen.includes('look')) {
                enq.emit({ type: 'seen', mode: 'guided', step: 'look', by: 'action' });
              }
              return {
                target: 'watching',
                context: { stored: { ...context.stored, seen: addSeen(context.stored.seen, 'look') } },
              };
            },
          },
          on: {
            cameraMoved: { target: 'watching' },
            cameraRested: { target: 'settling', reenter: true },
          },
        },
      },
    },
    paused: {
      on: {
        resume: ({ context }, enq) => {
          enq.emit({ type: 'pausedChanged', paused: false, step: firstUnseen(context.stored.seen) ?? 'build' });
          return { target: 'running', context: { paused: false } };
        },
        skip: ({ context }, enq) => {
          enq.emit({ type: 'ended', ending: 'dismissed', step: firstUnseen(context.stored.seen) });
          return { target: 'inactive', context: { stored: { ...context.stored, ended: 'dismissed' } } };
        },
        storedChanged: ({ context, event }) => {
          const next = {
            stored: mergeStored(context.stored, event.stored),
            wanted: event.wanted,
            paused: event.paused,
          };
          return { target: guidedTarget(next), context: next };
        },
      },
    },
    replay: {
      always: ({ context }, enq) => settleReplay(context, enq),
      on: {
        next: ({ context }) => {
          const tip = tipFor(context, 'replay');
          return tip === undefined
            ? {}
            : { context: { replaySeen: addSeen(context.replaySeen ?? [], tip.step), reviewing: undefined } };
        },
        back: ({ context }) => {
          const previous = previousSeen(context, 'replay');
          /* With nothing earlier seen, Back is answered and changes nothing. */
          return previous === undefined ? {} : { context: { reviewing: previous } };
        },
        skip: ({ context }, enq) => {
          enq.emit({ type: 'replayEnded', completed: false, step: tipFor(context, 'replay')?.step });
          return {
            target: guidedTarget(context),
            context: { replaySeen: undefined, reviewing: undefined, shown: undefined },
          };
        },
        replayClosed: ({ context }, enq) => {
          enq.emit({ type: 'replayEnded', completed: false, step: tipFor(context, 'replay')?.step });
          return {
            target: guidedTarget(context),
            context: { replaySeen: undefined, reviewing: undefined, shown: undefined },
          };
        },
        /* What another tab stored is kept for when the replay closes. */
        storedChanged: ({ context, event }) => ({
          context: { stored: mergeStored(context.stored, event.stored), wanted: event.wanted, paused: event.paused },
        }),
      },
    },
  },
});

/**
 * Create an unstarted tour actor (MC-R4). Production passes no options; tests pass a `StepClock` and the harness
 * inspector.
 *
 * @param input - The stored tour, the device's pause and whether a replay starts at once.
 * @param options - `clock`, `inspect` and `onRejectedEvent`, forwarded to `createActor`.
 * @returns The unstarted actor.
 * @public
 */
export const createTourActor = (
  input: TourMachineInput,
  options: Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'> = {},
): Actor<typeof tourMachine> => createActor(tourMachine, { ...options, input });
