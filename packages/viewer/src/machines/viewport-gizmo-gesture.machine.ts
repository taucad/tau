/**
 * The view cube's gesture: one per mounted view cube, run by graphics as its `viewportGizmo` child.
 *
 * ```text
 * viewportGizmoGesture: idle ──gizmoPressed──▶ pressed ──after(idleStart)──▶ idle
 *                       pressed ──gizmoTurned──▶ turning ──gizmoReleased──▶ idle
 *                       pressed ──gizmoReleased──▶ idle
 * tags: pressed, turning → interactionLocked
 * context: environment, upDirection
 * ```
 *
 * - **idle**: no press on the cube is held. A turn reported here (a face click's animation, or a drag that began after
 *   the idle-start window) moves the camera, which the adapter reports to it, and locks nothing.
 * - **pressed**: the cube took a press and nothing has turned yet. The canvas's controls are disabled and do not step
 *   (`interactionLocked`), and the model's hover stands aside. A press that has not turned the camera by the end of the
 *   idle-start window is given back.
 * - **turning**: the press is dragging the camera. It stays locked until the cube reports the release.
 *
 * The DOM adapter, a callback actor invoked here as `adapter`, owns everything a host holds: the `ViewportGizmo`, its
 * listeners, its render subscription, the plane picker it draws, the controls it disables and the camera it reports
 * poses to. It reports what the cube did; this machine decides whether that holds the lock and answers with a
 * {@link ViewportGizmoCommand}. Nothing here touches the DOM, Three or another actor (charter D4).
 *
 * Theme, accent, contrast and up axis changes arrive from graphics as events and restyle the cube in place, so the
 * cube is built once per adapter start (charter D1, the `gizmo.create` load span).
 *
 * Timeout table (xstate-policy MC-R16):
 *
 * | Constant                                | Class         | Edge               |
 * | --------------------------------------- | ------------- | ------------------ |
 * | `viewportGizmoIdleStartMilliseconds`    | idle window   | `pressed` to `idle` |
 *
 * @module
 */

import { createCallbackLogic, setup, types } from 'xstate';
import type { ActorRefFrom, CallbackActorLogic, EnqueueObject, SnapshotFrom, SystemRegistry } from 'xstate';
import { eventSchemas } from '#machines/machine-schemas.js';
import { describeFault } from '#machines/machine-fault.js';

/**
 * How long a press on the view cube may hold the lock without turning the camera, in milliseconds (handoff report R7:
 * today's value).
 *
 * @public
 */
export const viewportGizmoIdleStartMilliseconds = 0;

/**
 * The parts of the viewer environment the view cube is painted from.
 *
 * @public
 */
export type ViewportGizmoEnvironment = Readonly<{
  colorScheme: 'light' | 'dark';
  isHighContrast: boolean;
  accentColor: string;
}>;

/**
 * The world up axis the view cube orients its faces, drags and face clicks around.
 *
 * @public
 */
export type ViewportGizmoUpAxis = 'x' | 'y' | 'z';

/**
 * What the view cube is painted and oriented from.
 *
 * @public
 */
export type ViewportGizmoAppearance = Readonly<{
  environment: ViewportGizmoEnvironment;
  upDirection: ViewportGizmoUpAxis;
}>;

/**
 * The environment a view cube is painted from before the viewer reports its own (the viewer's default environment).
 *
 * @public
 */
export const viewportGizmoDefaultEnvironment: ViewportGizmoEnvironment = {
  colorScheme: 'light',
  isHighContrast: false,
  accentColor: '#00987c',
};

/**
 * Commands the gesture sends its DOM adapter.
 *
 * @public
 */
export type ViewportGizmoCommand =
  /** A press took the lock: disable the controls and set the model's hover aside. */
  | { type: 'lockTaken' }
  /** The held press turned the camera: the model's pointer gesture moved. */
  | { type: 'lockedTurn' }
  /** The lock is given back: restore the controls and the model's hover. */
  | { type: 'lockReleased' }
  /** Repaint or reorient the cube in place. */
  | ({ type: 'appearanceChanged' } & ViewportGizmoAppearance);

/**
 * Events the gesture's DOM adapter sends back: what the cube did.
 *
 * @public
 */
export type ViewportGizmoAdapterEvent =
  /** The cube took a press (its `start`). */
  | { type: 'gizmoPressed' }
  /** The cube turned the camera (its `change`): a drag step or a face click's animation frame. */
  | { type: 'gizmoTurned' }
  /** The cube's press or animation ended (its `end`). */
  | { type: 'gizmoReleased' };

/**
 * Events accepted by the view cube's gesture.
 *
 * @public
 */
export type ViewportGizmoGestureEvent =
  | ViewportGizmoAdapterEvent
  /** Graphics forwards the viewer environment the cube is painted from. */
  | { type: 'applyStyle'; environment: ViewportGizmoEnvironment }
  /** Graphics forwards the view's world up axis. */
  | { type: 'upDirectionChanged'; upDirection: ViewportGizmoUpAxis };

/**
 * A DOM adapter: callback logic that owns one view cube and the host objects behind it. The cube's owner builds it
 * and graphics provides it as `adapter`; it starts with the appearance the gesture holds.
 *
 * @public
 */
export type ViewportGizmoAdapterLogic = CallbackActorLogic<
  ViewportGizmoCommand,
  ViewportGizmoAppearance,
  ViewportGizmoAdapterEvent
>;

/**
 * The gesture's context: the appearance the cube is painted and oriented from.
 *
 * @public
 */
// oxlint-disable-next-line typescript/consistent-type-definitions -- an interface, so declarations reference it by name
export interface ViewportGizmoGestureContext {
  /** The first defect this actor caught at its root (MC-R12), the likeliest cause of any after it; it keeps its state and answers every event. */
  fault?: string;
  environment: ViewportGizmoEnvironment;
  upDirection: ViewportGizmoUpAxis;
}

/**
 * What graphics starts a gesture with.
 *
 * @public
 */
export type ViewportGizmoGestureInput = Readonly<{
  environment?: ViewportGizmoEnvironment;
  upDirection?: ViewportGizmoUpAxis;
}>;

/** The adapter slot is filled by the view cube; nothing starts it from the registry. */
const missingAdapter: ViewportGizmoAdapterLogic = createCallbackLogic<
  ViewportGizmoCommand,
  ViewportGizmoAppearance,
  ViewportGizmoAdapterEvent
>(() => {
  throw new Error('The view cube adapter is provided by the view cube, with the canvas it draws on.');
});

const viewportGizmoGestureActors = { adapter: missingAdapter };

type ViewportGizmoGestureEnqueue = EnqueueObject<
  ViewportGizmoGestureEvent,
  never,
  SystemRegistry,
  typeof viewportGizmoGestureActors
>;

type ViewportGizmoGestureChildren = Readonly<{ adapter?: ActorRefFrom<ViewportGizmoAdapterLogic> }>;

const command = (
  children: ViewportGizmoGestureChildren,
  enq: ViewportGizmoGestureEnqueue,
  message: ViewportGizmoCommand,
): void => {
  if (children.adapter) {
    enq.sendTo(children.adapter, message);
  }
};

const sameEnvironment = (left: ViewportGizmoEnvironment, right: ViewportGizmoEnvironment): boolean =>
  left.colorScheme === right.colorScheme &&
  left.isHighContrast === right.isHighContrast &&
  left.accentColor === right.accentColor;

/** Takes the lock for a press. */
const takeLock = (
  { children }: Readonly<{ children: ViewportGizmoGestureChildren }>,
  enq: ViewportGizmoGestureEnqueue,
): Readonly<{ target: 'pressed' }> => {
  command(children, enq, { type: 'lockTaken' });
  return { target: 'pressed' };
};

/** Gives the lock back. */
const releaseLock = (
  { children }: Readonly<{ children: ViewportGizmoGestureChildren }>,
  enq: ViewportGizmoGestureEnqueue,
): Readonly<{ target: 'idle' }> => {
  command(children, enq, { type: 'lockReleased' });
  return { target: 'idle' };
};

/** A turn of the held press: the model's pointer gesture moved. */
const lockedTurn = (
  { children }: Readonly<{ children: ViewportGizmoGestureChildren }>,
  enq: ViewportGizmoGestureEnqueue,
): Readonly<{ target: 'turning' }> => {
  command(children, enq, { type: 'lockedTurn' });
  return { target: 'turning' };
};

const viewportGizmoGestureMachineDefinition = setup({
  actors: viewportGizmoGestureActors,
  delays: { idleStart: viewportGizmoIdleStartMilliseconds },
  schemas: {
    context: types<ViewportGizmoGestureContext>(),
    events: eventSchemas<ViewportGizmoGestureEvent>(),
    input: types<ViewportGizmoGestureInput>(),
    tags: types<'interactionLocked'>(),
  },
}).createMachine({
  id: 'viewportGizmoGesture',
  // A defect (an effect that threw, a failed child, a send to no child) is recorded, never fatal (MC-R12). The first
  // is kept: the root cause matters more than the defects it sets off.
  onError: ({ context, event }) => ({ context: { fault: context.fault ?? describeFault(event.error) } }),
  context: ({ input }) => ({
    environment: input.environment ?? viewportGizmoDefaultEnvironment,
    upDirection: input.upDirection ?? 'z',
  }),
  // Stopping the gesture stops its adapter, which gives back the lock it held and disposes the cube.
  invoke: {
    id: 'adapter',
    src: 'adapter',
    input: ({ context }) => ({ environment: context.environment, upDirection: context.upDirection }),
  },
  initial: 'idle',
  states: {
    idle: {
      on: {
        gizmoPressed: (args, enq) => takeLock(args, enq),
      },
    },
    pressed: {
      tags: ['interactionLocked'],
      after: { idleStart: (args, enq) => releaseLock(args, enq) },
      on: {
        gizmoTurned: (args, enq) => lockedTurn(args, enq),
        gizmoReleased: (args, enq) => releaseLock(args, enq),
      },
    },
    turning: {
      tags: ['interactionLocked'],
      on: {
        gizmoTurned: (args, enq) => {
          command(args.children, enq, { type: 'lockedTurn' });
          return {};
        },
        gizmoReleased: (args, enq) => releaseLock(args, enq),
      },
    },
  },
  on: {
    applyStyle: ({ context, event, children }, enq) => {
      if (sameEnvironment(context.environment, event.environment)) {
        // Idempotent re-delivery: the cube is already painted this way.
        return {};
      }
      command(children, enq, {
        type: 'appearanceChanged',
        environment: event.environment,
        upDirection: context.upDirection,
      });
      return { context: { environment: event.environment } };
    },
    upDirectionChanged: ({ context, event, children }, enq) => {
      if (context.upDirection === event.upDirection) {
        // Idempotent re-delivery: the cube already turns about this axis.
        return {};
      }
      command(children, enq, {
        type: 'appearanceChanged',
        environment: context.environment,
        upDirection: event.upDirection,
      });
      return { context: { upDirection: event.upDirection } };
    },
  },
});

/**
 * The `[state, eventType]` pairs {@link viewportGizmoGestureMachine} leaves unanswered (MC-R17).
 *
 * - A turn while idle is a face click's animation or a drag after the idle-start window: the adapter already reported
 *   its pose to the camera, and nothing is locked.
 * - A release while idle ends an animation or a press the idle-start window already gave back.
 * - A second press of a held one is the cube's own re-delivery; the cube takes no press while it animates.
 *
 * @public
 */
export const viewportGizmoGestureIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ['idle', 'gizmoTurned'],
  ['idle', 'gizmoReleased'],
  ['pressed', 'gizmoPressed'],
  ['turning', 'gizmoPressed'],
];

/**
 * Every {@link ViewportGizmoGestureEvent} type, in the union's order.
 *
 * @public
 */
export const viewportGizmoGestureEventTypes = [
  'gizmoPressed',
  'gizmoTurned',
  'gizmoReleased',
  'applyStyle',
  'upDirectionChanged',
] as const satisfies ReadonlyArray<ViewportGizmoGestureEvent['type']>;

type ViewportGizmoGestureMachineDefinition = typeof viewportGizmoGestureMachineDefinition;

/**
 * The type of {@link viewportGizmoGestureMachine}, named so declarations reference it rather than inline it.
 *
 * @public
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
export interface ViewportGizmoGestureMachine extends ViewportGizmoGestureMachineDefinition {}

/**
 * The view cube's gesture.
 *
 * @public
 */
export const viewportGizmoGestureMachine: ViewportGizmoGestureMachine = viewportGizmoGestureMachineDefinition;

/**
 * A running view cube gesture.
 *
 * @public
 */
export type ViewportGizmoGestureRef = ActorRefFrom<ViewportGizmoGestureMachine>;

/**
 * A view cube gesture's snapshot.
 *
 * @public
 */
export type ViewportGizmoGestureSnapshot = SnapshotFrom<ViewportGizmoGestureMachine>;

/**
 * Whether a view cube holds its canvas's interaction lock: the canvas's controls then do not step.
 *
 * @param gesture - The view cube's gesture, if one runs.
 * @returns Whether its state is tagged `interactionLocked`.
 * @public
 */
export const selectViewportGizmoInteractionLocked = (gesture: ViewportGizmoGestureRef | undefined): boolean =>
  gesture?.getSnapshot().hasTag('interactionLocked') ?? false;
