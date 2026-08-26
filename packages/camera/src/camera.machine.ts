import { assign, assertEvent, fromCallback, sendTo, setup } from 'xstate';
import type { SnapshotFrom } from 'xstate';
import { createCameraView, findPerspectiveHandoffVerticalFieldOfView, frameCameraBounds } from '#camera-domain.js';
import type { CameraBounds, CameraProjection, CameraVector, CameraView, CameraViewport } from '#camera-domain.js';

/** Input accepted by {@link cameraMachine}. @public */
export type CameraMachineInput = Readonly<{
  initialView: CameraView;
  pixelBudget?: number;
}>;

/** Serializable state owned by {@link cameraMachine}. @public */
export type CameraMachineContext = Readonly<{
  view: CameraView;
  initialView: CameraView;
  effectiveVerticalFieldOfView: number;
  lastPerspectiveVerticalFieldOfView: number;
  handoffVerticalFieldOfView?: number;
  pixelBudget: number;
  revision: number;
}>;

/** Immutable state sent to a provided camera driver. @public */
export type CameraDriverSnapshot = Readonly<{
  view: CameraView;
  projection: CameraProjection;
  effectiveVerticalFieldOfView: number;
  perspectiveVerticalFieldOfView: number;
  handoffVerticalFieldOfView?: number;
  revision: number;
}>;

/** Input supplied when the camera driver actor starts. @public */
export type CameraDriverInput = Readonly<{
  snapshot: CameraDriverSnapshot;
}>;

/** Commands sent to a provided camera driver. @public */
export type CameraDriverEvent = Readonly<{ type: 'sync'; snapshot: CameraDriverSnapshot }>;

/** Events accepted by {@link cameraMachine}. @public */
export type CameraMachineEvent =
  | Readonly<{ type: 'setVerticalFieldOfView'; verticalFieldOfView: number }>
  | Readonly<{ type: 'setViewport'; viewport: CameraViewport }>
  | Readonly<{ type: 'setBounds'; bounds: CameraBounds }>
  | Readonly<{
      type: 'setView';
      target: CameraVector;
      direction: CameraVector;
      up: CameraVector;
      verticalSpan: number;
    }>
  | Readonly<{ type: 'frame'; bounds?: CameraBounds; margin?: number }>
  | Readonly<{ type: 'saveHome' }>
  | Readonly<{ type: 'reset' }>;

const assertPositive = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and greater than zero.`);
  }
  return value;
};

const projectionForEffectiveVerticalFieldOfView = (verticalFieldOfView: number): CameraProjection =>
  verticalFieldOfView === 0 ? { kind: 'orthographic' } : { kind: 'perspective', verticalFieldOfView };

const driverSnapshot = (context: CameraMachineContext): CameraDriverSnapshot => ({
  view: context.view,
  projection: projectionForEffectiveVerticalFieldOfView(context.effectiveVerticalFieldOfView),
  effectiveVerticalFieldOfView: context.effectiveVerticalFieldOfView,
  perspectiveVerticalFieldOfView:
    context.effectiveVerticalFieldOfView > 0
      ? context.effectiveVerticalFieldOfView
      : (context.handoffVerticalFieldOfView ?? context.lastPerspectiveVerticalFieldOfView),
  handoffVerticalFieldOfView: context.handoffVerticalFieldOfView,
  revision: context.revision,
});

const handoffForView = (
  context: CameraMachineContext,
  view = context.view,
  maximumVerticalFieldOfView = context.lastPerspectiveVerticalFieldOfView,
) =>
  findPerspectiveHandoffVerticalFieldOfView({
    view,
    maximumVerticalFieldOfView,
    pixelBudget: context.pixelBudget,
  });

const updateHandoffForView = (context: CameraMachineContext, view: CameraView): number | undefined =>
  context.effectiveVerticalFieldOfView === 0 ? handoffForView(context, view) : undefined;

const defaultCameraDriver = fromCallback<CameraDriverEvent, CameraDriverInput>(({ receive }) => {
  receive(() => undefined);
  return () => undefined;
});

/**
 * Headless canonical camera state with a replaceable external driver.
 *
 * @public
 * @example <caption>Drive a headless camera to its orthographic endpoint.</caption>
 * ```typescript
 * import { createActor } from 'xstate';
 * import { createCameraView } from '@taucad/camera';
 * import { cameraMachine } from '@taucad/camera/machine';
 *
 * const initialView = createCameraView({
 *   requestedVerticalFieldOfView: 60,
 *   target: [0, 0, 0],
 *   direction: [1, -1, 0.7],
 *   up: [0, 0, 1],
 *   verticalSpan: 10,
 *   viewport: { width: 1280, height: 720, pixelRatio: 1 },
 *   bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
 * });
 * const actor = createActor(cameraMachine, { input: { initialView } }).start();
 * actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
 * ```
 */
export const cameraMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    context: {} as CameraMachineContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    events: {} as CameraMachineEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    input: {} as CameraMachineInput,
  },
  actors: {
    cameraDriver: defaultCameraDriver,
  },
  guards: {
    isInitialOrthographic: ({ context }) => context.effectiveVerticalFieldOfView === 0,
    requestsOrthographic: ({ event }) => event.type === 'setVerticalFieldOfView' && event.verticalFieldOfView === 0,
    requestsPerspective: ({ event }) => event.type === 'setVerticalFieldOfView' && event.verticalFieldOfView > 0,
    resetIsOrthographic: ({ context }) => context.initialView.requestedVerticalFieldOfView === 0,
  },
  actions: {
    syncDriver: sendTo('cameraDriver', ({ context }) => ({ type: 'sync', snapshot: driverSnapshot(context) })),
    applyPerspectiveVerticalFieldOfView: assign(({ context, event }) => {
      assertEvent(event, 'setVerticalFieldOfView');
      const view = createCameraView({ ...context.view, requestedVerticalFieldOfView: event.verticalFieldOfView });
      return {
        ...context,
        view,
        effectiveVerticalFieldOfView: event.verticalFieldOfView,
        lastPerspectiveVerticalFieldOfView: event.verticalFieldOfView,
        handoffVerticalFieldOfView: undefined,
        revision: context.revision + 1,
      };
    }),
    applyOrthographicProjection: assign(({ context }) => {
      const view = createCameraView({ ...context.view, requestedVerticalFieldOfView: 0 });
      const handoffVerticalFieldOfView = handoffForView(context, view);
      return {
        ...context,
        view,
        effectiveVerticalFieldOfView: 0,
        handoffVerticalFieldOfView,
        revision: context.revision + 1,
      };
    }),
    setViewport: assign(({ context, event }) => {
      assertEvent(event, 'setViewport');
      const view = createCameraView({ ...context.view, viewport: event.viewport });
      return {
        ...context,
        view,
        handoffVerticalFieldOfView: updateHandoffForView(context, view),
        revision: context.revision + 1,
      };
    }),
    setBounds: assign(({ context, event }) => {
      assertEvent(event, 'setBounds');
      const view = createCameraView({ ...context.view, bounds: event.bounds });
      return {
        ...context,
        view,
        handoffVerticalFieldOfView: updateHandoffForView(context, view),
        revision: context.revision + 1,
      };
    }),
    setView: assign(({ context, event }) => {
      assertEvent(event, 'setView');
      const view = createCameraView({
        ...context.view,
        target: event.target,
        direction: event.direction,
        up: event.up,
        verticalSpan: event.verticalSpan,
      });
      return {
        ...context,
        view,
        handoffVerticalFieldOfView: updateHandoffForView(context, view),
        revision: context.revision + 1,
      };
    }),
    frameBounds: assign(({ context, event }) => {
      assertEvent(event, 'frame');
      const view = frameCameraBounds({
        view: context.view,
        bounds: event.bounds ?? context.view.bounds,
        margin: event.margin,
      });
      return {
        ...context,
        view,
        handoffVerticalFieldOfView: updateHandoffForView(context, view),
        revision: context.revision + 1,
      };
    }),
    saveHome: assign(({ context }) => ({
      ...context,
      initialView: context.view,
    })),
    resetView: assign(({ context }) => ({
      ...context,
      view: context.initialView,
      effectiveVerticalFieldOfView: context.initialView.requestedVerticalFieldOfView,
      lastPerspectiveVerticalFieldOfView:
        context.initialView.requestedVerticalFieldOfView > 0
          ? context.initialView.requestedVerticalFieldOfView
          : context.lastPerspectiveVerticalFieldOfView,
      handoffVerticalFieldOfView: undefined,
      revision: context.revision + 1,
    })),
  },
}).createMachine({
  id: 'camera',
  context: ({ input }) => {
    const initialView = createCameraView(input.initialView);
    const pixelBudget = assertPositive(input.pixelBudget ?? 0.25, 'pixelBudget');
    return {
      view: initialView,
      initialView,
      effectiveVerticalFieldOfView: initialView.requestedVerticalFieldOfView,
      lastPerspectiveVerticalFieldOfView:
        initialView.requestedVerticalFieldOfView > 0 ? initialView.requestedVerticalFieldOfView : 60,
      pixelBudget,
      revision: 0,
    };
  },
  invoke: {
    id: 'cameraDriver',
    src: 'cameraDriver',
    input: ({ context }) => ({ snapshot: driverSnapshot(context) }),
  },
  initial: 'initializing',
  on: {
    setViewport: { actions: ['setViewport', 'syncDriver'] },
    setBounds: { actions: ['setBounds', 'syncDriver'] },
    setView: { actions: ['setView', 'syncDriver'] },
    frame: { actions: ['frameBounds', 'syncDriver'] },
    saveHome: { actions: 'saveHome' },
    reset: [
      { guard: 'resetIsOrthographic', target: '.orthographic', actions: ['resetView', 'syncDriver'] },
      { target: '.perspective', actions: ['resetView', 'syncDriver'] },
    ],
  },
  states: {
    initializing: {
      always: [{ guard: 'isInitialOrthographic', target: 'orthographic' }, { target: 'perspective' }],
    },
    perspective: {
      on: {
        setVerticalFieldOfView: [
          {
            guard: 'requestsOrthographic',
            target: 'orthographic',
            actions: ['applyOrthographicProjection', 'syncDriver'],
          },
          { guard: 'requestsPerspective', actions: ['applyPerspectiveVerticalFieldOfView', 'syncDriver'] },
        ],
      },
    },
    orthographic: {
      on: {
        setVerticalFieldOfView: [
          {
            guard: 'requestsPerspective',
            target: 'perspective',
            actions: ['applyPerspectiveVerticalFieldOfView', 'syncDriver'],
          },
          { guard: 'requestsOrthographic' },
        ],
      },
    },
  },
});

/** Public snapshot type for {@link cameraMachine}. @public */
export type CameraMachineSnapshot = SnapshotFrom<typeof cameraMachine>;

/**
 * Selects the canonical requested camera view.
 *
 * @param snapshot - Current machine snapshot.
 * @returns The canonical camera view.
 * @public
 */
export const selectCameraView = (snapshot: CameraMachineSnapshot): CameraView => snapshot.context.view;

/**
 * Selects the native semantic projection rendered in the current frame.
 *
 * @param snapshot - Current machine snapshot.
 * @returns The active native endpoint projection.
 * @public
 */
export const selectCameraProjection = (snapshot: CameraMachineSnapshot): CameraProjection =>
  projectionForEffectiveVerticalFieldOfView(snapshot.context.effectiveVerticalFieldOfView);

/**
 * Selects the current driver synchronization value.
 *
 * @param snapshot - Current machine snapshot.
 * @returns The immutable driver snapshot.
 * @public
 */
export const selectCameraDriverSnapshot = (snapshot: CameraMachineSnapshot): CameraDriverSnapshot =>
  driverSnapshot(snapshot.context);
