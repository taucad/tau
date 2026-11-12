/**
 * Measure's pointer decision: whether a release places a point, cancels the current measurement, waits on the targets
 * under it, or does nothing.
 *
 * ```text
 * measureInput: idle → pressed → idle
 * context: pointerId, pointerDownHadTarget, discardGesture
 * ```
 *
 * - **idle**: no measuring press is held.
 * - **pressed**: a left or right primary press is held. A camera move while it is held (`cameraMoved`), or a press that
 *   went down while the camera was moving, discards it.
 *
 * Each release answers with exactly one emitted decision, {@link MeasureInputEmitted}, which the measure session listens
 * to; nothing polls a result slot. A pointer cancel or a window blur drops the
 * press silently.
 *
 * Every fact here is ephemeral: derived from the pointer and never persisted or seeded.
 *
 * @module
 */

import { setup, types } from 'xstate';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import { eventSchemas } from '#machines/machine-schemas.js';
import { describeFault } from '#machines/machine-fault.js';

/**
 * The held press.
 *
 * @public
 */
// oxlint-disable-next-line typescript/consistent-type-definitions -- an interface, so declarations reference it by name
export interface MeasureInputContext {
  /** The first defect this actor caught at its root (MC-R12), the likeliest cause of any after it; it keeps its state and answers every event. */
  fault?: string;
  pointerId: number | undefined;
  pointerDownHadTarget: boolean;
  discardGesture: boolean;
}

/**
 * Events accepted by the measure input, every one from the measure session.
 *
 * @public
 */
export type MeasureInputEvent =
  | {
      type: 'pointerDown';
      button: number;
      hasTarget: boolean;
      cameraMoving: boolean;
      pointerId?: number;
      isPrimary?: boolean;
    }
  | {
      type: 'pointerUp';
      button: number;
      hasTarget: boolean;
      hasCurrentStart: boolean;
      isZeroLength: boolean;
      hasActiveSnapTarget: boolean;
      /**
       * The release stayed where it went down, outside any camera drag or click guard, over targets still being
       * prepared and with no snap target yet: a left click of the held press then waits on them (`deferred`).
       */
      awaitingTargets?: boolean;
      pointerId?: number;
    }
  | { type: 'cameraMoved' }
  | { type: 'pointerCancel'; pointerId?: number }
  | { type: 'blur' };

/**
 * The decision a release reaches: place the point, cancel the current measurement, do nothing, or wait
 * on the targets under it and decide again once they are ready.
 *
 * @public
 */
export type MeasureInputEmitted =
  | { type: 'accepted' }
  | { type: 'cancelled' }
  | { type: 'ignored' }
  | { type: 'deferred' };

/**
 * Every decision type, in the union's order.
 *
 * @public
 */
export const measureInputDecisions = ['accepted', 'cancelled', 'ignored', 'deferred'] as const satisfies ReadonlyArray<
  MeasureInputEmitted['type']
>;

type PointerDown = Extract<MeasureInputEvent, { type: 'pointerDown' }>;
type PointerUp = Extract<MeasureInputEvent, { type: 'pointerUp' }>;

const released: MeasureInputContext = { pointerId: undefined, pointerDownHadTarget: false, discardGesture: false };

/** Only a left or right primary press measures; a middle press, a second pointer or a pen barrel button does not. */
const isMeasuringPress = (event: PointerDown): boolean =>
  (event.button === 0 || event.button === 2) && event.isPrimary !== false;

const pressOf = (event: PointerDown): MeasureInputContext => ({
  pointerId: event.pointerId,
  pointerDownHadTarget: event.hasTarget,
  discardGesture: event.cameraMoving,
});

/** The decision for a release of the held press. */
const decide = (context: MeasureInputContext, event: PointerUp): MeasureInputEmitted['type'] => {
  if (context.pointerId !== undefined && event.pointerId !== context.pointerId) {
    return 'ignored';
  }
  if (event.button === 2) {
    return !context.discardGesture && event.hasCurrentStart ? 'cancelled' : 'ignored';
  }
  if (event.button !== 0 || context.discardGesture) {
    return 'ignored';
  }
  if (event.awaitingTargets === true) {
    return 'deferred';
  }
  if (!context.pointerDownHadTarget && !event.hasActiveSnapTarget) {
    return 'ignored';
  }
  if (!event.hasTarget && !event.hasActiveSnapTarget) {
    return 'ignored';
  }
  return event.isZeroLength ? 'ignored' : 'accepted';
};

const measureInputMachineDefinition = setup({
  schemas: {
    context: types<MeasureInputContext>(),
    events: eventSchemas<MeasureInputEvent>(),
    emitted: eventSchemas<MeasureInputEmitted>(),
  },
}).createMachine({
  id: 'measureInput',
  // A defect (an effect that threw, a failed child, a send to no child) is recorded, never fatal (MC-R12). The first
  // is kept: the root cause matters more than the defects it sets off.
  onError: ({ context, event }) => ({ context: { fault: context.fault ?? describeFault(event.error) } }),
  context: released,
  initial: 'idle',
  states: {
    idle: {
      on: {
        pointerDown: ({ event }) => (isMeasuringPress(event) ? { target: 'pressed', context: pressOf(event) } : {}),
        // No press is held: a release decides nothing.
        pointerUp: (_args, enq) => {
          enq.emit({ type: 'ignored' });
          return {};
        },
        // No press is held: a camera move, a pointer cancel or a blur has nothing to drop.
        cameraMoved: () => ({}),
        pointerCancel: () => ({}),
        blur: () => ({}),
      },
    },
    pressed: {
      on: {
        // A newer measuring press replaces the held one; any other press leaves it held.
        pointerDown: ({ event }) => (isMeasuringPress(event) ? { context: pressOf(event) } : {}),
        pointerUp: ({ context, event }, enq) => {
          enq.emit({ type: decide(context, event) });
          return { target: 'idle', context: released };
        },
        cameraMoved: () => ({ context: { discardGesture: true } }),
        pointerCancel: ({ context, event }) =>
          context.pointerId === undefined || context.pointerId === event.pointerId
            ? { target: 'idle', context: released }
            : {},
        blur: () => ({ target: 'idle', context: released }),
      },
    },
  },
});

/**
 * The `[state, eventType]` pairs {@link measureInputMachine} leaves unanswered (MC-R17): none, since the session sends
 * every event in either state.
 *
 * @public
 */
export const measureInputIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [];

/**
 * Every {@link MeasureInputEvent} type, in the union's order.
 *
 * @public
 */
export const measureInputEventTypes = [
  'pointerDown',
  'pointerUp',
  'cameraMoved',
  'pointerCancel',
  'blur',
] as const satisfies ReadonlyArray<MeasureInputEvent['type']>;

type MeasureInputMachineDefinition = typeof measureInputMachineDefinition;

/**
 * The type of {@link measureInputMachine}, named so declarations reference it rather than inline it.
 *
 * @public
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
export interface MeasureInputMachine extends MeasureInputMachineDefinition {}

/**
 * Measure's pointer decision.
 *
 * @public
 */
export const measureInputMachine: MeasureInputMachine = measureInputMachineDefinition;

/**
 * A running measure input.
 *
 * @public
 */
export type MeasureInputRef = ActorRefFrom<MeasureInputMachine>;

/**
 * A measure input's snapshot.
 *
 * @public
 */
export type MeasureInputSnapshot = SnapshotFrom<MeasureInputMachine>;
