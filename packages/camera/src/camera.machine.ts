import { createCallbackLogic, setup, types } from 'xstate';
import type { ActorRefFrom, EnqueueObject, EventObject, SnapshotFrom, SystemRegistry } from 'xstate';
import {
  cameraProjectionForVerticalFieldOfView,
  createCameraView,
  findPerspectiveHandoffVerticalFieldOfView,
  frameCameraBounds,
} from '#camera-domain.js';
import type { CameraBounds, CameraProjection, CameraVector, CameraView, CameraViewport } from '#camera-domain.js';
import { eventSchemas } from '#machine-schemas.js';

/** Input accepted by {@link cameraMachine}. @public */
export type CameraMachineInput = Readonly<{
  initialView: CameraView;
  pixelBudget?: number;
}>;

/** Serializable state owned by {@link cameraMachine}. */
type CameraMachineContext = Readonly<{
  view: CameraView;
  initialView: CameraView;
  lastPerspectiveVerticalFieldOfView: number;
  handoffVerticalFieldOfView?: number;
  pixelBudget: number;
  revision: number;
}>;

/** Immutable state sent to a provided camera driver. @public */
export type CameraDriverSnapshot = Readonly<{
  view: CameraView;
  projection: CameraProjection;
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

/** Events accepted by {@link cameraMachine}. */
type CameraMachineEvent =
  | Readonly<{ type: 'setVerticalFieldOfView'; verticalFieldOfView: number }>
  | Readonly<{ type: 'setViewport'; viewport: CameraViewport }>
  | Readonly<{ type: 'setBounds'; bounds: CameraBounds }>
  | Readonly<{
      type: 'setView';
      target: CameraVector;
      direction: CameraVector;
      up: CameraVector;
      verticalSpan: number;
      perspectiveZoom?: number;
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

const driverSnapshot = (context: CameraMachineContext): CameraDriverSnapshot => ({
  view: context.view,
  projection: cameraProjectionForVerticalFieldOfView(context.view.requestedVerticalFieldOfView),
  perspectiveVerticalFieldOfView:
    context.view.requestedVerticalFieldOfView > 0
      ? context.view.requestedVerticalFieldOfView
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
  context.view.requestedVerticalFieldOfView === 0 ? handoffForView(context, view) : undefined;

const defaultCameraDriver = createCallbackLogic<CameraDriverEvent, CameraDriverInput>(({ receive }) => {
  receive(() => undefined);
  return () => undefined;
});

type CameraEnqueue = EnqueueObject<
  CameraMachineEvent,
  EventObject,
  SystemRegistry,
  Readonly<{ cameraDriver: typeof defaultCameraDriver }>,
  Readonly<{ cameraDriver?: ActorRefFrom<typeof defaultCameraDriver> }>
>;
type CameraPatch = Partial<CameraMachineContext>;
type CameraEvent<TType extends CameraMachineEvent['type']> = Extract<CameraMachineEvent, Readonly<{ type: TType }>>;

const setVerticalFieldOfView = (
  context: CameraMachineContext,
  event: CameraEvent<'setVerticalFieldOfView'>,
): CameraPatch => {
  const view = createCameraView({ ...context.view, requestedVerticalFieldOfView: event.verticalFieldOfView });
  return {
    view,
    lastPerspectiveVerticalFieldOfView:
      event.verticalFieldOfView > 0 ? event.verticalFieldOfView : context.lastPerspectiveVerticalFieldOfView,
    handoffVerticalFieldOfView: event.verticalFieldOfView === 0 ? handoffForView(context, view) : undefined,
    revision: context.revision + 1,
  };
};

const withView = (context: CameraMachineContext, view: CameraView): CameraPatch => ({
  view,
  handoffVerticalFieldOfView: updateHandoffForView(context, view),
  revision: context.revision + 1,
});

const setViewport = (context: CameraMachineContext, event: CameraEvent<'setViewport'>): CameraPatch =>
  withView(context, createCameraView({ ...context.view, viewport: event.viewport }));

const setBounds = (context: CameraMachineContext, event: CameraEvent<'setBounds'>): CameraPatch =>
  withView(context, createCameraView({ ...context.view, bounds: event.bounds }));

const setView = (context: CameraMachineContext, event: CameraEvent<'setView'>): CameraPatch =>
  withView(
    context,
    createCameraView({
      ...context.view,
      target: event.target,
      direction: event.direction,
      up: event.up,
      verticalSpan: event.verticalSpan,
      perspectiveZoom: event.perspectiveZoom ?? context.view.perspectiveZoom,
    }),
  );

const frameBounds = (context: CameraMachineContext, event: CameraEvent<'frame'>): CameraPatch =>
  withView(
    context,
    frameCameraBounds({
      view: context.view,
      bounds: event.bounds ?? context.view.bounds,
      margin: event.margin,
    }),
  );

const resetView = (context: CameraMachineContext): CameraPatch => {
  const viewportChanged =
    context.initialView.viewport.width !== context.view.viewport.width ||
    context.initialView.viewport.height !== context.view.viewport.height ||
    context.initialView.viewport.pixelRatio !== context.view.viewport.pixelRatio;
  const boundsChanged =
    context.initialView.bounds.min.some((value, index) => value !== context.view.bounds.min[index]) ||
    context.initialView.bounds.max.some((value, index) => value !== context.view.bounds.max[index]);
  const view =
    viewportChanged || boundsChanged
      ? frameCameraBounds({
          view: { ...context.initialView, viewport: context.view.viewport, bounds: context.view.bounds },
          bounds: context.view.bounds,
        })
      : context.initialView;
  return {
    view,
    lastPerspectiveVerticalFieldOfView:
      view.requestedVerticalFieldOfView > 0
        ? view.requestedVerticalFieldOfView
        : context.lastPerspectiveVerticalFieldOfView,
    handoffVerticalFieldOfView: undefined,
    revision: context.revision + 1,
  };
};

/* Apply one view change, then hand the driver the state it produced. */
const syncDriver = (context: CameraMachineContext, patch: CameraPatch, enq: CameraEnqueue) => {
  enq.sendTo('cameraDriver', { type: 'sync', snapshot: driverSnapshot({ ...context, ...patch }) });
  return { context: patch };
};

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
 *   frameId: 'tau:root',
 *   requestedVerticalFieldOfView: 60,
 *   perspectiveZoom: 1,
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
  schemas: {
    context: types<CameraMachineContext>(),
    events: eventSchemas<CameraMachineEvent>(),
    input: types<CameraMachineInput>(),
  },
  actors: {
    cameraDriver: defaultCameraDriver,
  },
}).createMachine({
  id: 'camera',
  context: ({ input }) => {
    const initialView = createCameraView(input.initialView);
    const pixelBudget = assertPositive(input.pixelBudget ?? 0.25, 'pixelBudget');
    return {
      view: initialView,
      initialView,
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
  on: {
    setVerticalFieldOfView: ({ context, event }, enq) =>
      syncDriver(context, setVerticalFieldOfView(context, event), enq),
    setViewport: ({ context, event }, enq) => syncDriver(context, setViewport(context, event), enq),
    setBounds: ({ context, event }, enq) => syncDriver(context, setBounds(context, event), enq),
    setView: ({ context, event }, enq) => syncDriver(context, setView(context, event), enq),
    frame: ({ context, event }, enq) => syncDriver(context, frameBounds(context, event), enq),
    saveHome: { context: ({ context }) => ({ initialView: context.view }) },
    reset: ({ context }, enq) => syncDriver(context, resetView(context), enq),
  },
});

/** Public snapshot type for {@link cameraMachine}. @public */
export type CameraMachineSnapshot = SnapshotFrom<typeof cameraMachine>;

/**
 * Selects the native semantic projection rendered in the current frame.
 *
 * @param snapshot - Current machine snapshot.
 * @returns The active native endpoint projection.
 * @public
 */
export const selectCameraProjection = (snapshot: CameraMachineSnapshot): CameraProjection =>
  cameraProjectionForVerticalFieldOfView(snapshot.context.view.requestedVerticalFieldOfView);

/**
 * Selects the current driver synchronization value.
 *
 * @param snapshot - Current machine snapshot.
 * @returns The immutable driver snapshot.
 * @public
 */
export const selectCameraDriverSnapshot = (snapshot: CameraMachineSnapshot): CameraDriverSnapshot =>
  driverSnapshot(snapshot.context);
