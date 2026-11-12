/*
 * The camera actor: the single owner of a view's pose and of where that pose came from (graphics event-driven state
 * charter, D1 to D4, D9, D15, D20; I1 to I4, I7, I8).
 *
 *   camera (parallel)
 *   ├── input    idle ──pose while held──▶ dragging ──interactionEnded──▶ settling ──after(poseSettle)──▶ idle
 *   │            idle | settling ──pose while released──▶ settling (the settle window restarts)
 *   │            settling ──pose while held──▶ dragging
 *   └── gesture  released ──interactionStarted──▶ held ──interactionEnded──▶ released
 *
 * `input` is the phase `specs/CameraAuthority.tla` models as `cam.input`. `gesture` is whether the person holds the
 * controls. The model's `PoseObserved` is a pose of a held gesture. A pose with no held gesture (damping after a
 * release, a wheel step) is the model's `PoseObserved` followed by `InteractionEnded`, so it can
 * never hold the camera in `dragging`: only a held gesture does, and its `interactionEnded` leaves it.
 *
 * Timeout table (xstate-policy MC-R16):
 *
 * | Constant                       | Class             | Edge                       |
 * | ------------------------------ | ----------------- | -------------------------- |
 * | `cameraPoseSettleMilliseconds` | coalescing window | `input.settling` to `idle` |
 */

import { createActor, createCallbackLogic, matchesState, setup, types } from 'xstate';
import type {
  Actor,
  ActorOptions,
  ActorRefFrom,
  EnqueueObject,
  InspectionEvent,
  SnapshotFrom,
  StateValue,
  SystemRegistry,
} from 'xstate';
import {
  assertFinite,
  assertPositive,
  cameraProjectionForVerticalFieldOfView,
  createCameraView,
  findPerspectiveHandoffVerticalFieldOfView,
  frameCameraBounds,
  normalize,
  resolveCameraUp,
  vector,
} from '#camera-domain.js';
import type { CameraBounds, CameraProjection, CameraVector, CameraView, CameraViewport } from '#camera-domain.js';
import { eventSchemas } from '#machine-schemas.js';

/**
 * Where a camera change came from (charter D2, D20). `input`, `gizmo`, `fov`, `up`, `fit` and `focus` are a person's
 * commands; `framing`, `persisted`, `viewport` and `bounds` are automatic.
 *
 * @public
 */
export type CameraSource =
  | 'input'
  | 'gizmo'
  | 'fit'
  | 'framing'
  | 'persisted'
  | 'focus'
  | 'viewport'
  | 'bounds'
  | 'up'
  | 'fov';

/** The source of the change that produced a revision (charter I1). @public */
export type CameraChange = Readonly<{ source: CameraSource; revision: number }>;

/** A world up axis. @public */
export type CameraUpAxis = 'x' | 'y' | 'z';

/** A direction and its up vector, with no target or span. @public */
export type CameraOrientation = Readonly<{ direction: CameraVector; up: CameraVector }>;

/** A complete camera pose in physical metres. @public */
export type CameraPose = CameraOrientation &
  Readonly<{
    target: CameraVector;
    verticalSpan: number;
    /** Keeps the current perspective zoom when omitted. */
    perspectiveZoom?: number;
  }>;

/** The mapping from the view's physical frame to a renderer's local units. @public */
export type CameraRenderFrame = Readonly<{
  anchorFrameId: string;
  originMeters: CameraVector;
  metersPerRenderUnit: number;
}>;

/** Host clipping policy a driver applies after each bounds-derived synchronization. @public */
export type CameraClipPolicy = Readonly<{
  farPaddingVerticalSpans: number;
  presentationPlane?: Readonly<{
    normal: CameraVector;
    offsetMeters: number;
  }>;
}>;

/** Input accepted by {@link cameraMachine}. @public */
export type CameraMachineInput = Readonly<{
  initialView: CameraView;
  pixelBudget?: number;
  /** Defaults to the identity frame of the view's `frameId`. */
  renderFrame?: CameraRenderFrame;
  clipPolicy?: CameraClipPolicy;
}>;

/** Serializable state owned by {@link cameraMachine}. */
type CameraMachineContext = Readonly<{
  view: CameraView;
  lastPerspectiveVerticalFieldOfView: number;
  handoffVerticalFieldOfView?: number;
  pixelBudget: number;
  revision: number;
  lastChange: CameraChange;
  renderFrame: CameraRenderFrame;
  clipPolicy?: CameraClipPolicy;
  /** The first defect the camera caught at its root (MC-R12); the camera keeps its pose and answers every event. */
  fault?: string;
}>;

/** Immutable state sent to a provided camera driver. @public */
export type CameraDriverSnapshot = Readonly<{
  view: CameraView;
  projection: CameraProjection;
  perspectiveVerticalFieldOfView: number;
  handoffVerticalFieldOfView?: number;
  revision: number;
  lastChange: CameraChange;
  renderFrame: CameraRenderFrame;
  clipPolicy?: CameraClipPolicy;
}>;

/** Input supplied when the camera driver actor starts. @public */
export type CameraDriverInput = Readonly<{
  snapshot: CameraDriverSnapshot;
}>;

/** Commands sent to a provided camera driver. @public */
export type CameraDriverEvent = Readonly<{ type: 'sync'; snapshot: CameraDriverSnapshot }>;

/**
 * A persisted record's camera fields, adopted in one change with the source `persisted`. At least one field is
 * present; `pose` and `orientation` exclude each other. An orientation keeps the bounds and re-frames them.
 */
type CameraAdoption = Readonly<{
  requestId: string;
  pose?: CameraPose;
  orientation?: CameraOrientation;
  /** Fractional margin of the re-frame an orientation causes. Defaults to 0.1. */
  margin?: number;
  verticalFieldOfView?: number;
  upDirection?: CameraUpAxis;
}>;

/** The public event alphabet of {@link cameraMachine}. @public */
export type CameraMachineEvent =
  | Readonly<{ type: 'setVerticalFieldOfView'; verticalFieldOfView: number }>
  | Readonly<{ type: 'setViewport'; viewport: CameraViewport }>
  | Readonly<{ type: 'setBounds'; bounds: CameraBounds }>
  | Readonly<{ type: 'setUpDirection'; axis: CameraUpAxis }>
  | Readonly<{ type: 'setRenderFrame'; renderFrame: CameraRenderFrame }>
  | Readonly<{ type: 'setClipPolicy'; clipPolicy: CameraClipPolicy | undefined }>
  | (CameraPose &
      Readonly<{
        type: 'poseObserved';
        source: 'input' | 'gizmo';
        /** Set on a controls update a driver synchronization caused. The camera ignores it (charter I3). */
        echoRevision?: number;
        /** The render frame the pose rebased or rescaled to, taken in the same change so one gesture is one snapshot. */
        renderFrame?: CameraRenderFrame;
      }>)
  | Readonly<{ type: 'interactionStarted' }>
  | Readonly<{ type: 'interactionMoved' }>
  | Readonly<{ type: 'interactionEnded' }>
  | Readonly<{
      type: 'frameGeometry';
      bounds: CameraBounds;
      margin: number;
      orientation?: CameraOrientation;
      source: 'framing' | 'fit';
    }>
  | Readonly<{ type: 'frameBounds'; bounds: CameraBounds; margin: number; source: 'focus' }>
  | (CameraAdoption & Readonly<{ type: 'adoptPersistedPose' }>)
  /** Deprecated framing with the source `framing`; the framing actor (G5) replaces it with `frameGeometry`. */
  | Readonly<{ type: 'frame'; bounds?: CameraBounds; margin?: number }>;

/** Events {@link cameraMachine} emits. @public */
export type CameraMachineEmitted =
  | Readonly<{ type: 'viewChanged'; revision: number; source: CameraSource; verticalSpan: number }>
  | Readonly<{ type: 'adoptionApplied'; requestId: string; revision: number }>
  | Readonly<{ type: 'adoptionDropped'; requestId: string; reason: 'dragging' | 'settling' }>;

/**
 * How long the camera stays `settling` after the last released pose before it is `idle` again, in milliseconds.
 *
 * @public
 */
export const cameraPoseSettleMilliseconds = 250;

/** The `CameraAuthority.tla` action a transition refines (xstate-policy MC-R27), or `Unmodelled` for one the spec does not model. */
type CameraTransitionLabel =
  | 'PoseObserved'
  | 'EchoObserved'
  | 'InteractionEnded'
  | 'SettleElapsed'
  | 'Changed'
  | 'Observe'
  | 'Unmodelled';

const upAxes: Readonly<Record<CameraUpAxis, CameraVector>> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const dragSources: ReadonlySet<string> = new Set(['input', 'gizmo']);
const framingSources: ReadonlySet<string> = new Set(['framing', 'fit']);

const sameVector = (left: CameraVector, right: CameraVector): boolean =>
  left[0] === right[0] && left[1] === right[1] && left[2] === right[2];

const renderFrameForView = (renderFrame: CameraRenderFrame, frameId: string): CameraRenderFrame => {
  if (renderFrame.anchorFrameId !== frameId) {
    throw new RangeError(
      `renderFrame.anchorFrameId '${renderFrame.anchorFrameId}' must match camera frameId '${frameId}'.`,
    );
  }
  const metersPerRenderUnit = assertPositive(renderFrame.metersPerRenderUnit, 'renderFrame.metersPerRenderUnit');
  assertPositive(1 / metersPerRenderUnit, '1 / renderFrame.metersPerRenderUnit');
  return {
    anchorFrameId: renderFrame.anchorFrameId,
    originMeters: vector(renderFrame.originMeters, 'renderFrame.originMeters'),
    metersPerRenderUnit,
  };
};

const sameRenderFrame = (left: CameraRenderFrame, right: CameraRenderFrame): boolean =>
  left.anchorFrameId === right.anchorFrameId &&
  left.metersPerRenderUnit === right.metersPerRenderUnit &&
  sameVector(left.originMeters, right.originMeters);

const validClipPolicy = (clipPolicy: CameraClipPolicy): CameraClipPolicy => {
  if (assertFinite(clipPolicy.farPaddingVerticalSpans, 'clipPolicy.farPaddingVerticalSpans') < 0) {
    throw new RangeError('clipPolicy.farPaddingVerticalSpans must not be negative.');
  }
  const plane = clipPolicy.presentationPlane;
  if (plane === undefined) {
    return { farPaddingVerticalSpans: clipPolicy.farPaddingVerticalSpans };
  }
  const normal = vector(plane.normal, 'clipPolicy.presentationPlane.normal');
  normalize(normal, 'clipPolicy.presentationPlane.normal');
  return {
    farPaddingVerticalSpans: clipPolicy.farPaddingVerticalSpans,
    presentationPlane: {
      normal,
      offsetMeters: assertFinite(plane.offsetMeters, 'clipPolicy.presentationPlane.offsetMeters'),
    },
  };
};

const sameClipPolicy = (left: CameraClipPolicy | undefined, right: CameraClipPolicy | undefined): boolean => {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  const leftPlane = left.presentationPlane;
  const rightPlane = right.presentationPlane;
  return (
    left.farPaddingVerticalSpans === right.farPaddingVerticalSpans &&
    (leftPlane === undefined || rightPlane === undefined
      ? leftPlane === rightPlane
      : leftPlane.offsetMeters === rightPlane.offsetMeters && sameVector(leftPlane.normal, rightPlane.normal))
  );
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
  lastChange: context.lastChange,
  renderFrame: context.renderFrame,
  clipPolicy: context.clipPolicy,
});

/*
 * A view zoomed deep into large bounds can leave no positive FOV within the budget (TAU-UI-7). The view itself is
 * valid, so it keeps the last calibrated handoff, or none, rather than refusing the change.
 * Every input here is already validated, so the search's only RangeError is that precision floor.
 */
const handoffForView = (
  context: CameraMachineContext,
  view = context.view,
  maximumVerticalFieldOfView = context.lastPerspectiveVerticalFieldOfView,
): number | undefined => {
  try {
    return findPerspectiveHandoffVerticalFieldOfView({
      view,
      maximumVerticalFieldOfView,
      pixelBudget: context.pixelBudget,
    });
  } catch (error) {
    if (error instanceof RangeError) {
      return context.handoffVerticalFieldOfView;
    }
    throw error;
  }
};

const defaultCameraDriver = createCallbackLogic<CameraDriverEvent, CameraDriverInput>(({ receive }) => {
  receive(() => undefined);
  return () => undefined;
});

type CameraEnqueue = EnqueueObject<
  CameraMachineEvent,
  CameraMachineEmitted,
  SystemRegistry,
  Readonly<{ cameraDriver: typeof defaultCameraDriver }>,
  Readonly<{ cameraDriver?: ActorRefFrom<typeof defaultCameraDriver> }>
>;
type CameraPatch = Partial<CameraMachineContext>;
type CameraEvent<EventType extends CameraMachineEvent['type']> = Extract<
  CameraMachineEvent,
  Readonly<{ type: EventType }>
>;

const viewPatch = (context: CameraMachineContext, view: CameraView): CameraPatch => ({
  view,
  handoffVerticalFieldOfView:
    context.view.requestedVerticalFieldOfView === 0 ? handoffForView(context, view) : undefined,
});

const fieldOfViewPatch = (context: CameraMachineContext, verticalFieldOfView: number): CameraPatch => {
  const view = createCameraView({ ...context.view, requestedVerticalFieldOfView: verticalFieldOfView });
  return {
    view,
    lastPerspectiveVerticalFieldOfView:
      verticalFieldOfView > 0 ? verticalFieldOfView : context.lastPerspectiveVerticalFieldOfView,
    handoffVerticalFieldOfView: verticalFieldOfView === 0 ? handoffForView(context, view) : undefined,
  };
};

const upDirectionPatch = (context: CameraMachineContext, axis: CameraUpAxis): CameraPatch => {
  // Own keys only: `constructor` or `__proto__` must not find a prototype member.
  if (typeof axis !== 'string' || !Object.hasOwn(upAxes, axis)) {
    throw new RangeError(`axis must be 'x', 'y' or 'z'.`);
  }
  const up = resolveCameraUp({
    direction: context.view.direction,
    preferredUp: upAxes[axis],
    fallbackUp: context.view.up,
  });
  return viewPatch(context, createCameraView({ ...context.view, up }));
};

const posePatch = (context: CameraMachineContext, pose: CameraPose): CameraPatch =>
  viewPatch(
    context,
    createCameraView({
      ...context.view,
      target: pose.target,
      direction: pose.direction,
      up: pose.up,
      verticalSpan: pose.verticalSpan,
      perspectiveZoom: pose.perspectiveZoom ?? context.view.perspectiveZoom,
    }),
  );

/* Whether a sender gave the field: an untyped one may leave it out or set it to null. */
const given = <Value>(value: Value): value is NonNullable<Value> => value !== undefined && value !== null;

/* A fractional framing margin: a number from 0 to 0.5. */
const assertMargin = (margin: unknown): number => {
  if (typeof margin !== 'number' || !(margin >= 0 && margin <= 0.5)) {
    throw new RangeError('margin must be between 0 and 0.5.');
  }
  return margin;
};

const framePatch = (
  context: CameraMachineContext,
  options: Readonly<{ bounds: CameraBounds; margin: number; orientation?: CameraOrientation }>,
): CameraPatch =>
  viewPatch(
    context,
    frameCameraBounds({
      // A given orientation of any other shape fails the view's own vector checks and is refused.
      view: given(options.orientation)
        ? createCameraView({
            ...context.view,
            direction: options.orientation.direction,
            up: options.orientation.up,
          })
        : context.view,
      bounds: options.bounds,
      margin: assertMargin(options.margin),
    }),
  );

/* Frames `bounds` and keeps the scene bounds, which the clip planes derive from. */
const focusPatch = (context: CameraMachineContext, event: CameraEvent<'frameBounds'>): CameraPatch =>
  viewPatch(
    context,
    createCameraView({
      ...frameCameraBounds({ view: context.view, bounds: event.bounds, margin: assertMargin(event.margin) }),
      bounds: context.view.bounds,
    }),
  );

/*
 * Compose the record's fields in order, each reading the context the one before it produced. A null field is an
 * absent one; a margin that is given is validated even with no orientation to re-frame.
 */
const adoptionPatch = (context: CameraMachineContext, adoption: CameraAdoption): CameraPatch => {
  const { pose, orientation, verticalFieldOfView, upDirection, margin } = adoption;
  if (typeof adoption.requestId !== 'string' || adoption.requestId.length === 0) {
    throw new RangeError('requestId must not be empty.');
  }
  if (given(pose) && given(orientation)) {
    throw new RangeError('An adoption carries a pose or orientation, not both.');
  }
  if (![pose, orientation, verticalFieldOfView, upDirection].some((field) => given(field))) {
    throw new RangeError('An adoption carries a camera field.');
  }
  if (given(margin)) {
    assertMargin(margin);
  }
  let patch: CameraPatch = {};
  const compose = (next: (current: CameraMachineContext) => CameraPatch): void => {
    patch = { ...patch, ...next({ ...context, ...patch }) };
  };
  if (given(verticalFieldOfView)) {
    compose((current) => fieldOfViewPatch(current, verticalFieldOfView));
  }
  if (given(upDirection)) {
    compose((current) => upDirectionPatch(current, upDirection));
  }
  if (given(pose)) {
    compose((current) => posePatch(current, pose));
  }
  if (given(orientation)) {
    compose((current) => framePatch(current, { bounds: current.view.bounds, margin: margin ?? 0.1, orientation }));
  }
  return patch;
};

/*
 * The camera domain refuses a payload by throwing a RangeError, and a malformed one (a missing or null field) throws a
 * TypeError where it is read; either way the event is refused, not taken.
 */
const attempt = <Result>(compute: () => Result): Result | undefined => {
  try {
    return compute();
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) {
      return undefined;
    }
    throw error;
  }
};

/* One camera change: one revision, one source (I1), one driver synchronization and one `viewChanged`. */
const commit = (
  context: CameraMachineContext,
  { patch, source }: Readonly<{ patch: CameraPatch; source: CameraSource }>,
  enq: CameraEnqueue,
): CameraPatch => {
  const revision = context.revision + 1;
  const change: CameraPatch = { ...patch, revision, lastChange: { source, revision } };
  enq.sendTo('cameraDriver', { type: 'sync', snapshot: driverSnapshot({ ...context, ...change }) });
  enq.emit({ type: 'viewChanged', revision, source, verticalSpan: (patch.view ?? context.view).verticalSpan });
  return change;
};

/**
 * `{ to, meta }` (xstate-policy MC-R27), typed as its transition function.
 * ponytail: alpha.59's `setup` types omit the `{ to, meta }` form the runtime takes; drop the cast when xstate types it.
 *
 * @param tla - The `CameraAuthority.tla` action the transition refines.
 * @param to - The transition function.
 * @returns The transition, carrying its static meta.
 */
const refines = <Transition>(tla: CameraTransitionLabel, to: Transition): Transition =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above.
  ({ meta: { tla }, to }) as unknown as Transition;

/**
 * Candidate transitions for one event, tried in order; the first that answers is taken.
 * ponytail: alpha.59's `setup` types omit the candidate array the runtime takes; drop the cast when xstate types it.
 *
 * @param candidates - The transitions, most specific first.
 * @returns The candidates, typed as one transition.
 */
const firstOf = <Transition>(...candidates: Transition[]): Transition =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above.
  candidates as unknown as Transition;

type InputState = 'idle' | 'dragging' | 'settling';
type PoseTransition = Readonly<{ target?: InputState; reenter?: boolean; context?: CameraPatch }> | undefined;

/* A controls update a driver synchronization caused: an integer stamp marks one, and it never changes the camera (I3). */
const observeEcho = ({ event }: Readonly<{ event: CameraEvent<'poseObserved'> }>): PoseTransition =>
  Number.isInteger(event.echoRevision) ? {} : undefined;

/*
 * A pose the person made. Held, the gesture is live and the camera is `dragging`. Released, the pose restarts the
 * settle window, so nothing but a held gesture keeps the camera out of `idle` for longer than `poseSettle`.
 */
const observePose = (
  {
    context,
    event,
    value,
  }: Readonly<{ context: CameraMachineContext; event: CameraEvent<'poseObserved'>; value: StateValue }>,
  enq: CameraEnqueue,
): PoseTransition => {
  const { source } = event;
  // A stamp that is not an integer marks no echo and no pose: the payload is refused.
  const patch =
    dragSources.has(source) && event.echoRevision === undefined
      ? attempt(() => ({
          ...posePatch(context, event),
          ...(given(event.renderFrame) && { renderFrame: renderFrameForView(event.renderFrame, context.view.frameId) }),
        }))
      : undefined;
  if (patch === undefined) {
    return undefined;
  }
  const change = commit(context, { patch, source }, enq);
  return matchesState({ gesture: 'held' }, value)
    ? { target: 'dragging', context: change }
    : { target: 'settling', reenter: true, context: change };
};

const adopt = (
  { context, event }: Readonly<{ context: CameraMachineContext; event: CameraEvent<'adoptPersistedPose'> }>,
  enq: CameraEnqueue,
): Readonly<{ context: CameraPatch }> | undefined => {
  const patch = attempt(() => adoptionPatch(context, event));
  if (patch === undefined) {
    return undefined;
  }
  const change = commit(context, { patch, source: 'persisted' }, enq);
  enq.emit({ type: 'adoptionApplied', requestId: event.requestId, revision: context.revision + 1 });
  return { context: change };
};

/* The person's gesture wins: the persisted pose is dropped, never queued (D15, I2). */
const dropAdoption =
  (reason: 'dragging' | 'settling') =>
  (
    { context, event }: Readonly<{ context: CameraMachineContext; event: CameraEvent<'adoptPersistedPose'> }>,
    enq: CameraEnqueue,
  ): Readonly<Record<string, never>> | undefined => {
    if (attempt(() => adoptionPatch(context, event)) === undefined) {
      return undefined;
    }
    enq.emit({ type: 'adoptionDropped', requestId: event.requestId, reason });
    return {};
  };

const observedPose = firstOf(refines('EchoObserved', observeEcho), refines('PoseObserved', observePose));

const cameraMachineDefinition = setup({
  schemas: {
    context: types<CameraMachineContext>(),
    events: eventSchemas<CameraMachineEvent>(),
    emitted: eventSchemas<CameraMachineEmitted>(),
    input: types<CameraMachineInput>(),
    transitionMeta: types<{ tla: CameraTransitionLabel }>(),
  },
  actors: {
    cameraDriver: defaultCameraDriver,
  },
  delays: { poseSettle: cameraPoseSettleMilliseconds },
}).createMachine({
  id: 'camera',
  version: '2',
  // A defect is recorded and the camera stays as it was: the spec models no fault (MC-R12, MC-R27). The first is
  // kept: the root cause matters more than the defects it sets off.
  onError: refines('Unmodelled', ({ context, event }) => ({
    context: {
      fault: context.fault ?? String((event.error as { message?: unknown } | undefined)?.message ?? event.error),
    },
  })),
  context: ({ input }) => {
    const view = createCameraView(input.initialView);
    const pixelBudget = assertPositive(input.pixelBudget ?? 0.25, 'pixelBudget');
    return {
      view,
      lastPerspectiveVerticalFieldOfView:
        view.requestedVerticalFieldOfView > 0 ? view.requestedVerticalFieldOfView : 60,
      pixelBudget,
      revision: 0,
      // The opening pose is the rig's, which no person commanded.
      lastChange: { source: 'framing', revision: 0 },
      renderFrame: renderFrameForView(
        input.renderFrame ?? { anchorFrameId: view.frameId, originMeters: [0, 0, 0], metersPerRenderUnit: 1 },
        view.frameId,
      ),
      clipPolicy: input.clipPolicy === undefined ? undefined : validClipPolicy(input.clipPolicy),
    };
  },
  invoke: {
    id: 'cameraDriver',
    src: 'cameraDriver',
    input: ({ context }) => ({ snapshot: driverSnapshot(context) }),
  },
  type: 'parallel',
  on: {
    setVerticalFieldOfView: refines('Changed', ({ context, event }, enq) => {
      const patch = attempt(() => fieldOfViewPatch(context, event.verticalFieldOfView));
      return patch && { context: commit(context, { patch, source: 'fov' }, enq) };
    }),
    setViewport: refines('Changed', ({ context, event }, enq) => {
      const patch = attempt(() => viewPatch(context, createCameraView({ ...context.view, viewport: event.viewport })));
      return patch && { context: commit(context, { patch, source: 'viewport' }, enq) };
    }),
    setBounds: refines('Changed', ({ context, event }, enq) => {
      const patch = attempt(() => viewPatch(context, createCameraView({ ...context.view, bounds: event.bounds })));
      return patch && { context: commit(context, { patch, source: 'bounds' }, enq) };
    }),
    setUpDirection: refines('Changed', ({ context, event }, enq) => {
      const patch = attempt(() => upDirectionPatch(context, event.axis));
      return patch && { context: commit(context, { patch, source: 'up' }, enq) };
    }),
    frameGeometry: refines('Changed', ({ context, event }, enq) => {
      const patch = framingSources.has(event.source) ? attempt(() => framePatch(context, event)) : undefined;
      return patch && { context: commit(context, { patch, source: event.source }, enq) };
    }),
    frameBounds: refines('Changed', ({ context, event }, enq) => {
      const patch = (event.source as unknown) === 'focus' ? attempt(() => focusPatch(context, event)) : undefined;
      return patch && { context: commit(context, { patch, source: 'focus' }, enq) };
    }),
    frame: refines('Changed', ({ context, event }, enq) => {
      const patch = attempt(() =>
        framePatch(context, { bounds: event.bounds ?? context.view.bounds, margin: event.margin ?? 0.1 }),
      );
      return patch && { context: commit(context, { patch, source: 'framing' }, enq) };
    }),
    // The render frame and the clip policy are how a driver presents the pose, not the pose: no revision, no source,
    // and no spec variable, so the spec does not model them.
    setRenderFrame: refines('Unmodelled', ({ context, event }, enq) => {
      const renderFrame = attempt(() => renderFrameForView(event.renderFrame, context.view.frameId));
      if (renderFrame === undefined) {
        return undefined;
      }
      if (sameRenderFrame(renderFrame, context.renderFrame)) {
        // Idempotent re-delivery: the frame is already this one.
        return {};
      }
      enq.sendTo('cameraDriver', { type: 'sync', snapshot: driverSnapshot({ ...context, renderFrame }) });
      return { context: { renderFrame } };
    }),
    setClipPolicy: refines('Unmodelled', ({ context, event }, enq) => {
      const { clipPolicy: requested } = event;
      const clipPolicy = requested === undefined ? undefined : attempt(() => validClipPolicy(requested));
      if (requested !== undefined && clipPolicy === undefined) {
        return undefined;
      }
      if (sameClipPolicy(clipPolicy, context.clipPolicy)) {
        // Idempotent re-delivery: the policy is already this one.
        return {};
      }
      enq.sendTo('cameraDriver', { type: 'sync', snapshot: driverSnapshot({ ...context, clipPolicy }) });
      return { context: { clipPolicy } };
    }),
  },
  states: {
    input: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            poseObserved: observedPose,
            adoptPersistedPose: refines('Observe', adopt),
          },
        },
        dragging: {
          on: {
            poseObserved: observedPose,
            adoptPersistedPose: refines('Observe', dropAdoption('dragging')),
            interactionEnded: { target: 'settling', meta: { tla: 'InteractionEnded' } },
          },
        },
        settling: {
          after: { poseSettle: { target: 'idle', meta: { tla: 'SettleElapsed' } } },
          on: {
            poseObserved: observedPose,
            adoptPersistedPose: refines('Observe', dropAdoption('settling')),
          },
        },
      },
    },
    gesture: {
      initial: 'released',
      states: {
        // The spec has no gesture variable: whether a gesture is held is the adapter's, not the model's.
        released: { on: { interactionStarted: { target: 'held', meta: { tla: 'Unmodelled' } } } },
        held: { on: { interactionEnded: { target: 'released', meta: { tla: 'Unmodelled' } } } },
      },
    },
  },
});

/**
 * The `[state, eventType]` pairs {@link cameraMachine} declares it ignores (MC-R17).
 *
 * - `interactionMoved` changes nothing in the camera: whether a gesture moved is `input.dragging`.
 * - A second `interactionStarted` of a held gesture and an `interactionEnded` with no held gesture are re-deliveries.
 *
 * @public
 */
export const cameraIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ['*', 'interactionMoved'],
  ['gesture.held', 'interactionStarted'],
  ['gesture.released', 'interactionEnded'],
];

type CameraMachineDefinition = typeof cameraMachineDefinition;

/**
 * The type of {@link cameraMachine}, named so declarations reference it rather than inline it.
 *
 * @public
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
export interface CameraMachine extends CameraMachineDefinition {}

/**
 * Headless canonical camera state with a replaceable external driver.
 *
 * The camera records the source of every change (`context.lastChange`), tracks the person's gesture as states
 * (`input.idle`, `input.dragging`, `input.settling`), and applies a persisted pose only while `input.idle`. A payload
 * the camera domain refuses, such as a non-finite field of view or inverted bounds, is not taken: the snapshot keeps
 * its value and `snapshot.can(event)` answers `false`.
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
export const cameraMachine: CameraMachine = cameraMachineDefinition;

/** The system services a camera actor's composition root forwards (xstate-policy MC-R4). */
type CameraActorSystemOptions = Pick<ActorOptions<CameraMachine>, 'clock' | 'inspect' | 'onRejectedEvent'>;

/**
 * Options of {@link createCameraActor}.
 *
 * `onRejectedEvent` also receives a public event the camera refused: one whose payload the camera domain does not
 * accept, with the reason `refusedPayload`.
 *
 * @public
 */
export type CameraActorOptions = CameraActorSystemOptions &
  Readonly<{
    input: CameraMachineInput;
    /** The machine to run: {@link cameraMachine}, or a copy with a provided driver. */
    machine?: CameraMachine;
  }>;

/** The reason a refused camera event carries on `onRejectedEvent`. @public */
export const cameraRefusedPayloadReason = 'refusedPayload';

const isLifecycleEvent = (type: string): boolean => /^@?xstate\./u.test(type);

/**
 * Creates the inspector that reports a camera's refused events, for the system that runs it.
 *
 * A refused event takes no transition, so XState reports no dead letter for it. This inspector reports it through
 * `onRejectedEvent` instead, with the reason `refusedPayload`, for every actor of {@link cameraMachine} in the system:
 * the root of {@link createCameraActor}, or a camera spawned as another actor's child. Events on
 * {@link cameraIgnoredEvents} are not refusals. Every inspection event is also forwarded to `inspect`.
 *
 * @param options - The system's inspector and rejection hook.
 * @returns The inspector to pass as the system's `inspect`.
 * @public
 */
export const createCameraRefusalInspector =
  ({ inspect, onRejectedEvent }: CameraActorSystemOptions) =>
  (event: InspectionEvent): void => {
    if (typeof inspect === 'function') {
      inspect(event);
    } else {
      inspect?.next?.(event);
    }
    if (
      onRejectedEvent === undefined ||
      event.type !== '@xstate.transition' ||
      (event.actorRef as Partial<Actor<CameraMachine>>).logic?.id !== 'camera' ||
      event.microsteps.length > 0 ||
      isLifecycleEvent(event.event.type)
    ) {
      return;
    }
    const { snapshot } = event;
    const actorRef = event.actorRef as Actor<CameraMachine>;
    const { type } = event.event;
    if (
      snapshot.status !== 'active' ||
      !('value' in snapshot) ||
      cameraIgnoredEvents.some(
        ([state, eventType]) =>
          eventType === type && (state === '*' || matchesState(state, snapshot.value as StateValue)),
      )
    ) {
      return;
    }
    onRejectedEvent({
      event: event.event,
      targetRef: actorRef,
      targetId: actorRef.id,
      sourceRef: undefined,
      eventOrigin: event.sourceRef === undefined ? 'external' : 'actor',
      reason: cameraRefusedPayloadReason,
      error: new RangeError(type),
    });
  };

/**
 * Creates the camera actor as the root of its own system, reporting refused events through
 * {@link createCameraRefusalInspector}.
 *
 * @param options - The machine input and the system's clock, inspector and rejection hook.
 * @returns The camera actor, not yet started.
 * @public
 */
export const createCameraActor = (options: CameraActorOptions): Actor<CameraMachine> => {
  const { machine = cameraMachine, input, clock, inspect, onRejectedEvent } = options;
  return createActor(machine, {
    input,
    ...(clock === undefined ? {} : { clock }),
    ...(onRejectedEvent === undefined ? {} : { onRejectedEvent }),
    ...(inspect === undefined && onRejectedEvent === undefined
      ? {}
      : { inspect: createCameraRefusalInspector({ inspect, onRejectedEvent }) }),
  });
};

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
