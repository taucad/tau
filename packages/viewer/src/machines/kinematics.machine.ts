/**
 * The kinematics actor: one per view, spawned by the graphics actor. It holds each unit's mechanism and evaluates its
 * pose for coordinate edits, animation playback and part drags, and it owns the viewer's part-drag gesture.
 *
 * ```text
 * kinematics: idle → pressed → dragging (steady ⇄ coalescing) → idle ; dragging → cancelled → idle
 * context: unitsById, revision, gesture?, dragAdapter?
 * ```
 *
 * - **idle**: no press holds the viewer. `pressPart` claims a mouse or pen press on a movable part of an armed unit
 *   and starts its DOM adapter, the callback logic the press carries. The adapter holds the camera, the scene root,
 *   the drag plane and the DOM elements in its closure (none of them enters context), suspends the camera controls
 *   while it runs and reports the pointer as `movePointer`, `releasePointer`, `losePointer` and `interruptGesture`.
 * - **pressed**: the press has not travelled {@link kinematicsDragThresholdPx} yet, so a release is still a click.
 * - **dragging**: the press became a drag of the grabbed link. Pointer targets coalesce for
 *   {@link kinematicsDragMoveWindow} on the injected clock before one solve; a release solves the waiting target
 *   first, so the pose ends where the pointer did.
 * - **cancelled**: Escape restored the pre-drag pose; the press holds the camera until its release.
 *
 * A drag that ends (kept on release, or restored on cancel) emits `poseSettled` once, so a listener can re-measure the
 * unit's bounds after the pose stops moving. Every fact here is ephemeral and memory-only: it is derived from the
 * presented mechanism and the pointer, and never persisted or seeded.
 *
 * @module
 */
import { createCallbackLogic, setup, types } from 'xstate';
import type { ActorRefFrom, CallbackActorLogic, EnqueueObject, SystemRegistry } from 'xstate';
import {
  evaluatePose,
  findLinkByComponent,
  listDegreesOfFreedom,
  sampleAnimation,
  solvePose,
} from '@taucad/kinematics';
import type { Animation, DegreeOfFreedom, Issue, Mechanism, Pose } from '@taucad/kinematics';
import type { SpatialMatrix, SpatialVector } from '@taucad/spatial';
import { eventSchemas } from '#machines/machine-schemas.js';

/**
 * `play` with this id sweeps every driver between its limits instead of an authored animation.
 * While it runs, `playback.animationId` is `undefined`.
 * @public
 */
export const sweepAnimationId = '@sweep';

/**
 * Seconds for one lower-to-upper pass of the driver sweep.
 *
 * @public
 */
export const sweepDurationSeconds = 6;

/**
 * Playback state of a unit's kinematic animation or driver sweep.
 *
 * @public
 */
export type KinematicsPlayback = Readonly<{
  status: 'stopped' | 'playing' | 'paused';
  /** The selected authored animation; `undefined` selects the driver sweep. */
  animationId: string | undefined;
  /** Seconds into the animation. */
  time: number;
  speed: number;
}>;

/**
 * A part drag in progress: the grabbed link and point, the pointer target and whether the solver reached it.
 *
 * @public
 */
export type KinematicsDrag = Readonly<{
  componentId: string;
  link: string;
  /** The grabbed point rigidly attached to `link` at its as-built reference pose. */
  localPoint: SpatialVector;
  target: SpatialVector;
  status: 'solved' | 'blocked';
  reason?: 'limit' | 'unreachable' | 'singular' | 'budget';
  /** Driver coordinates before the drag; `dragCancel` restores them. */
  startCoordinates: Readonly<Record<string, number>>;
}>;

/**
 * A drag's blocked reason that the pane and the viewer report to the user.
 *
 * @public
 */
export type KinematicsDragNotice = Exclude<NonNullable<KinematicsDrag['reason']>, 'unreachable'>;

/**
 * The blocked reason worth reporting while dragging, or `undefined` when there is nothing to say.
 *
 * `unreachable` is left out: a pointer target on the camera-facing plane is rarely exactly reachable, so
 * the solver projects it onto the mechanism's motion (a gear follows the nearest point of its circle) and
 * the part visibly stopping already says it. Limits, singular poses and an exhausted solver are reported.
 * @public
 */
export const getKinematicsDragNotice = (drag: KinematicsDrag | undefined): KinematicsDragNotice | undefined =>
  drag?.status === 'blocked' && drag.reason !== undefined && drag.reason !== 'unreachable' ? drag.reason : undefined;

/**
 * A link is grounded when every joint on its path to the root is fixed: it can never move, so a
 * press on it keeps orbiting the camera and never starts a drag.
 * @public
 */
export function isGroundedKinematicsLink(mechanism: Mechanism, linkId: string): boolean {
  const jointByChild = new Map(Object.values(mechanism.joints).map((joint) => [joint.child, joint]));
  let current = linkId;
  while (current !== mechanism.root) {
    const joint = jointByChild.get(current);
    if (joint?.type !== 'fixed') {
      return false;
    }
    current = joint.parent;
  }
  return true;
}

const dragNoticeLabels: Record<KinematicsDragNotice, string> = {
  limit: 'At a joint limit',
  singular: 'Singular pose',
  budget: 'Solver stopped early',
};

/**
 * The kinematics line the viewer's hover label adds under a part's name while the Kinematics pane arms
 * drags: why a drag of that part is blocked, that it is grounded, or the joint that moves it.
 * @public
 */
export function describeKinematicsHover(unit: KinematicsUnitState, componentId: string): string | undefined {
  const { mechanism, dragEnabled, drag, degreesOfFreedom } = unit;
  const link = mechanism && dragEnabled ? findLinkByComponent({ mechanism, componentId }) : undefined;
  if (mechanism === undefined || link === undefined) {
    return undefined;
  }
  const notice = drag?.link === link ? getKinematicsDragNotice(drag) : undefined;
  if (notice !== undefined) {
    return dragNoticeLabels[notice];
  }
  if (isGroundedKinematicsLink(mechanism, link)) {
    return 'Grounded · does not move';
  }
  const [jointId, joint] = Object.entries(mechanism.joints).find(([, candidate]) => candidate.child === link) ?? [];
  if (jointId === undefined || joint === undefined) {
    return undefined;
  }
  if (joint.type === 'fixed') {
    return `Moves with ${joint.parent}`;
  }
  const type = joint.type.charAt(0).toUpperCase() + joint.type.slice(1);
  const driver = degreesOfFreedom.find((dof) => dof.jointId === jointId && dof.role === 'follower')?.coupling?.driver;
  return `${type} · ${jointId} · ${driver === undefined ? 'drag to move' : `follows ${driver}`}`;
}

/**
 * The kinematics state of one unit: its mechanism, driver coordinates, solved pose, playback, drag and highlight.
 *
 * @public
 */
export type KinematicsUnitState = Readonly<{
  mechanism: Mechanism | undefined;
  degreesOfFreedom: readonly DegreeOfFreedom[];
  /** Driver coordinates in mechanism units, as applied (clamped to limits). */
  coordinates: Readonly<Record<string, number>>;
  pose: Pose | undefined;
  atLimit: readonly string[];
  issues: readonly Issue[];
  playback: KinematicsPlayback;
  drag: KinematicsDrag | undefined;
  /**
   * Whether a press in the viewer may start a part drag. The Kinematics pane arms it while it shows the unit;
   * `loadMechanism` and `clearMechanism` keep it.
   */
  dragEnabled: boolean;
  /**
   * Components the Kinematics pane points at: a hovered or focused row's parts. The viewer highlights them
   * as it does a hovered part. Changing them never changes `revision`.
   */
  hoveredComponentIds: readonly string[];
  /** Increments on every pose change; the viewer re-applies link transforms when it changes. */
  revision: number;
}>;

/**
 * CSS pixels a press on a movable part travels before it becomes a drag rather than a click.
 *
 * @public
 */
export const kinematicsDragThresholdPx = 4;

/**
 * How long the drag collects pointer targets before it solves once for the latest, on the actor's clock. About one
 * display frame, so a fast pointer costs one solve per frame rather than one per pointer event. Milliseconds.
 *
 * @public
 */
export const kinematicsDragMoveWindow = 16;

/**
 * Commands the kinematics actor sends to the drag adapter it started for a press.
 *
 * @public
 */
export type KinematicsDragAdapterCommand =
  /** The press became a drag: capture the pointer, show the grabbing cursor and hold the viewer's hover on the part. */
  { type: 'dragStarted' };

/**
 * The DOM adapter of one press: callback logic built around the viewer's camera, scene root, drag plane and DOM
 * elements, which stay in its closure. The kinematics actor starts it from `pressPart` and stops it when the press
 * ends; stopping restores the camera controls, the cursor and the pointer capture.
 *
 * @public
 */
export type KinematicsDragAdapterLogic = CallbackActorLogic<KinematicsDragAdapterCommand, undefined>;

/**
 * The press the kinematics actor is following: the part and pointer it claimed and where it started.
 *
 * @public
 */
export type KinematicsGesture = Readonly<{
  unitId: string;
  componentId: string;
  pointerId: number;
  /** The pressed client point, from which the drag threshold is measured. */
  start: Readonly<{ clientX: number; clientY: number }>;
  /** The grabbed surface point in mechanism space at the pose of the press. */
  point: SpatialVector;
  /** The latest pointer target waiting for the coalescing window, in mechanism space. */
  pendingTarget: SpatialVector | undefined;
}>;

/**
 * Context of the kinematics machine: the state of each unit by ID, the revision counter and the press it follows.
 *
 * @public
 */
export type KinematicsMachineContext = {
  unitsById: Record<string, KinematicsUnitState>;
  /** Monotonic source of unit revisions, so a cleared and reloaded unit never repeats one. */
  revision: number;
  /** The claimed press; set outside `idle`. */
  gesture: KinematicsGesture | undefined;
  /** The press's DOM adapter, a child this actor started; set outside `idle`. */
  dragAdapter: ActorRefFrom<KinematicsDragAdapterLogic> | undefined;
};

/**
 * Events the kinematics machine emits.
 *
 * @public
 */
export type KinematicsEmitted = {
  /**
   * A drag of the unit ended and its pose stopped moving: kept where the pointer released it, or restored by a
   * cancel. Emitted once per drag, after the final pose is in context.
   */
  type: 'poseSettled';
  unitId: string;
  /** The unit's pose revision once settled. */
  revision: number;
};

/**
 * Input accepted when creating the kinematics actor.
 *
 * @public
 */
export type KinematicsMachineInput = Readonly<Record<string, never>>;

/**
 * Events accepted by the kinematics machine. Each one names the unit it applies to.
 *
 * @public
 */
export type KinematicsMachineEvent =
  | { type: 'loadMechanism'; unitId: string; mechanism: Mechanism }
  | { type: 'clearMechanism'; unitId: string }
  | { type: 'setCoordinate'; unitId: string; id: string; value: number }
  | { type: 'reset'; unitId: string }
  | { type: 'play'; unitId: string; animationId?: string }
  /** Choose the clip `play` runs without starting it; the pose stays where it is. */
  | { type: 'selectAnimation'; unitId: string; animationId: string }
  | { type: 'pause'; unitId: string }
  | { type: 'seek'; unitId: string; time: number }
  | { type: 'setPlaybackSpeed'; unitId: string; speed: number }
  /** `elapsed` is wall-clock seconds since the previous tick; the caller owns the clock. */
  | { type: 'tick'; unitId: string; elapsed: number }
  /** `point` is the grabbed surface point in mechanism space at the current pose; ignored unless `dragEnabled`. */
  | { type: 'dragStart'; unitId: string; componentId: string; point: SpatialVector }
  | { type: 'dragMove'; unitId: string; target: SpatialVector }
  | { type: 'dragEnd'; unitId: string }
  | { type: 'dragCancel'; unitId: string }
  /** Arms or disarms viewer drags for the unit; disarming during a drag cancels it like `dragCancel`. */
  | { type: 'setDragEnabled'; unitId: string; enabled: boolean }
  /** The components a pane row points at; an empty list clears the highlight. */
  | { type: 'setHoveredComponents'; unitId: string; componentIds: readonly string[] }
  /**
   * A primary mouse or pen press on a component in the viewer. Claimed only in `idle`, for a movable link of an armed
   * unit: the actor then starts `adapter` for the press. `point` is the grabbed surface point in mechanism space.
   */
  | {
      type: 'pressPart';
      unitId: string;
      componentId: string;
      pointerId: number;
      clientX: number;
      clientY: number;
      point: SpatialVector;
      adapter: KinematicsDragAdapterLogic;
    }
  /**
   * The pressed pointer moved. `buttons` is the DOM bitmask (bit 0 is the primary button); `target` is the pointer on
   * the drag plane in mechanism space, `undefined` when the pointer ray misses the plane.
   */
  | {
      type: 'movePointer';
      pointerId: number;
      clientX: number;
      clientY: number;
      buttons: number;
      target: SpatialVector | undefined;
    }
  /** The pressed pointer was released: a drag keeps its pose. */
  | { type: 'releasePointer'; pointerId: number }
  /** The browser took the pressed pointer away (cancelled, or capture lost): a drag is cancelled. */
  | { type: 'losePointer'; pointerId: number }
  /** The window lost focus or the tab was hidden, so the release may never arrive: a drag is cancelled. */
  | { type: 'interruptGesture' }
  /** Escape: a drag is cancelled and the press holds the camera until its release. */
  | { type: 'cancelGesture' };

const stoppedPlayback: KinematicsPlayback = { status: 'stopped', animationId: undefined, time: 0, speed: 1 };

const noComponents: readonly string[] = Object.freeze([]);

// Frozen singleton for absent units: `useSelector`'s `Object.is` short-circuits re-renders.
const emptyUnitState: KinematicsUnitState = Object.freeze({
  mechanism: undefined,
  degreesOfFreedom: Object.freeze([]),
  coordinates: Object.freeze({}),
  pose: undefined,
  atLimit: Object.freeze([]),
  issues: Object.freeze([]),
  playback: Object.freeze(stoppedPlayback),
  drag: undefined,
  dragEnabled: false,
  hoveredComponentIds: noComponents,
  revision: 0,
});

/**
 * Read a unit's kinematics state, or a frozen empty state when the unit has none.
 *
 * @param context - The machine context holding every unit's state.
 * @param unitId - The ID of the unit whose state to read.
 * @returns The stored state for `unitId`, or the shared empty state.
 * @public
 */
export function getKinematicsUnitState(context: KinematicsMachineContext, unitId: string): KinematicsUnitState {
  return context.unitsById[unitId] ?? emptyUnitState;
}

const driverCoordinates = (
  degreesOfFreedom: readonly DegreeOfFreedom[],
  coordinates: Readonly<Record<string, number>>,
): Record<string, number> =>
  Object.fromEntries(
    degreesOfFreedom.filter((dof) => dof.role === 'driver').map((dof) => [dof.id, coordinates[dof.id] ?? 0]),
  );

/** Evaluate forward kinematics; an invalid request keeps the last valid pose and records why. */
const withPose = (unit: KinematicsUnitState, coordinates: Readonly<Record<string, number>>): KinematicsUnitState => {
  if (unit.mechanism === undefined) {
    return unit;
  }
  const outcome = evaluatePose({ mechanism: unit.mechanism, coordinates });
  if (outcome.status === 'invalid') {
    return { ...unit, issues: outcome.issues };
  }
  return {
    ...unit,
    coordinates: driverCoordinates(unit.degreesOfFreedom, outcome.pose.coordinates),
    pose: outcome.pose,
    atLimit: outcome.atLimit,
    issues: [],
  };
};

const sweepRange = (dof: DegreeOfFreedom, units: Mechanism['units']): Readonly<{ lower: number; upper: number }> =>
  dof.limits ?? {
    lower: 0,
    // Unbounded angles sweep one full turn; unbounded distances sweep 100 mm.
    upper: dof.kind === 'angle' ? (units.angle === 'deg' ? 360 : 2 * Math.PI) : units.length === 'mm' ? 100 : 0.1,
  };

const createDriverSweep = (
  mechanism: Mechanism,
  degreesOfFreedom: readonly DegreeOfFreedom[],
): Animation | undefined => {
  const drivers = degreesOfFreedom.filter((dof) => dof.role === 'driver');
  // Without a driver the sweep would animate nothing, endlessly: there is nothing to play.
  if (drivers.length === 0) {
    return undefined;
  }
  const keyframe = (time: number, bound: 'lower' | 'upper') => ({
    time,
    coordinates: Object.fromEntries(drivers.map((dof) => [dof.id, sweepRange(dof, mechanism.units)[bound]])),
  });
  return {
    id: sweepAnimationId,
    duration: sweepDurationSeconds,
    loop: 'pingPong',
    keyframes: [keyframe(0, 'lower'), keyframe(sweepDurationSeconds, 'upper')],
  };
};

const resolveAnimation = (
  mechanism: Mechanism,
  degreesOfFreedom: readonly DegreeOfFreedom[],
  animationId: string | undefined,
): Animation | undefined =>
  animationId === undefined
    ? createDriverSweep(mechanism, degreesOfFreedom)
    : mechanism.animations?.find((animation) => animation.id === animationId);

/**
 * The clip `play` runs: the authored animation `animationId` names, or the driver sweep when it is `undefined`.
 *
 * @public
 */
export const getKinematicsAnimation = ({
  mechanism,
  degreesOfFreedom,
  animationId,
}: Readonly<{
  mechanism: Mechanism | undefined;
  degreesOfFreedom: readonly DegreeOfFreedom[];
  animationId: string | undefined;
}>): Animation | undefined =>
  mechanism === undefined ? undefined : resolveAnimation(mechanism, degreesOfFreedom, animationId);

/**
 * Where in one play of the clip `time` falls. Playback time grows without bound; a repeating clip wraps it and a
 * back-and-forth clip reflects it, as `sampleAnimation` does. Seconds.
 * @public
 */
// ponytail: mirrors the private `loopTime` in packages/kinematics/src/pose.ts; export it from the package (with an
// API design guide) if a second consumer needs it.
export const getKinematicsClipTime = ({ duration, loop }: Animation, time: number): number => {
  if (loop === 'repeat') {
    return ((time % duration) + duration) % duration;
  }
  if (loop === 'pingPong') {
    const phase = ((time % (2 * duration)) + 2 * duration) % (2 * duration);
    return phase > duration ? 2 * duration - phase : phase;
  }
  return Math.min(time, duration);
};

/** The `playback.animationId` a picker id selects: the driver sweep is `undefined`. */
const toPlaybackAnimationId = (animationId: string): string | undefined =>
  animationId === sweepAnimationId ? undefined : animationId;

/** Pose the unit at `playback.time`; drivers the animation does not name keep their value. */
const sampleAt = (unit: KinematicsUnitState, playback: KinematicsPlayback): KinematicsUnitState => {
  const animation =
    unit.mechanism === undefined
      ? undefined
      : resolveAnimation(unit.mechanism, unit.degreesOfFreedom, playback.animationId);
  if (unit.mechanism === undefined || animation === undefined) {
    return unit;
  }
  const sampled = sampleAnimation({ animation, time: playback.time });
  return withPose({ ...unit, playback }, { ...unit.coordinates, ...sampled });
};

const pausedWhilePlaying = (playback: KinematicsPlayback): KinematicsPlayback =>
  playback.status === 'playing' ? { ...playback, status: 'paused' } : playback;

/** Map a posed point into the link's reference frame: the inverse rigid transform `Rᵀ(p − t)`. */
const toLinkLocal = (matrix: SpatialMatrix, point: SpatialVector): SpatialVector => {
  const dx = point[0] - matrix[12];
  const dy = point[1] - matrix[13];
  const dz = point[2] - matrix[14];
  return [
    matrix[0] * dx + matrix[1] * dy + matrix[2] * dz,
    matrix[4] * dx + matrix[5] * dy + matrix[6] * dz,
    matrix[8] * dx + matrix[9] * dy + matrix[10] * dz,
  ];
};

function assignUnit(
  context: KinematicsMachineContext,
  unitId: string,
  unit: KinematicsUnitState,
): Partial<KinematicsMachineContext> {
  const previous = getKinematicsUnitState(context, unitId);
  const isPoseChange = unit.pose !== previous.pose || unit.mechanism !== previous.mechanism;
  const revision = isPoseChange ? context.revision + 1 : context.revision;
  return {
    revision,
    unitsById: { ...context.unitsById, [unitId]: isPoseChange ? { ...unit, revision } : unit },
  };
}

/** The adapter slot is filled per press from `pressPart`; nothing starts it from the registry. */
const missingDragAdapter: KinematicsDragAdapterLogic = createCallbackLogic<KinematicsDragAdapterCommand, undefined>(
  () => {
    throw new Error('The kinematics drag adapter starts from pressPart, with the viewer objects it was built around.');
  },
);

const kinematicsActors = { dragAdapter: missingDragAdapter };

type KinematicsEnqueue = EnqueueObject<
  KinematicsMachineEvent,
  KinematicsEmitted,
  SystemRegistry,
  typeof kinematicsActors
>;

type KinematicsPatch = Partial<KinematicsMachineContext>;

/** The link a press on `componentId` would drag: armed, in the mechanism and not grounded; otherwise `undefined`. */
const findDraggableLink = (unit: KinematicsUnitState, componentId: string): string | undefined => {
  const link =
    unit.mechanism === undefined ? undefined : findLinkByComponent({ mechanism: unit.mechanism, componentId });
  // Drags start only while the pane arms them, and a grounded link (the root, or welded to it) never moves.
  return !unit.dragEnabled ||
    unit.mechanism === undefined ||
    link === undefined ||
    isGroundedKinematicsLink(unit.mechanism, link)
    ? undefined
    : link;
};

/** Start dragging the link that owns `componentId` from `point`; `undefined` when the unit cannot drag it. */
const startDrag = (
  context: KinematicsMachineContext,
  { unitId, componentId, point }: Readonly<{ unitId: string; componentId: string; point: SpatialVector }>,
): KinematicsPatch | undefined => {
  const unit = getKinematicsUnitState(context, unitId);
  const link = findDraggableLink(unit, componentId);
  if (link === undefined) {
    return undefined;
  }
  const linkTransform = unit.pose?.linkTransforms[link];
  const dragging: KinematicsUnitState = {
    ...unit,
    playback: pausedWhilePlaying(unit.playback),
    drag: {
      componentId,
      link,
      localPoint: linkTransform === undefined ? point : toLinkLocal(linkTransform, point),
      target: point,
      status: 'solved',
      startCoordinates: unit.coordinates,
    },
  };
  return assignUnit(context, unitId, dragging);
};

/** Solve the unit's drag toward `target`; `{}` when the unit has no drag. */
const moveDrag = (context: KinematicsMachineContext, unitId: string, target: SpatialVector): KinematicsPatch => {
  const unit = getKinematicsUnitState(context, unitId);
  const { drag, mechanism } = unit;
  if (drag === undefined || mechanism === undefined) {
    return {};
  }
  const outcome = solvePose({
    mechanism,
    seed: unit.coordinates,
    goals: [{ type: 'point', link: drag.link, localPoint: drag.localPoint, target }],
  });
  if (outcome.status === 'invalid') {
    return assignUnit(context, unitId, { ...unit, issues: outcome.issues, drag: { ...drag, target } });
  }
  // A blocked solve still applies its best limit-satisfying pose, so the part follows as far as it can.
  const posed = withPose(unit, driverCoordinates(unit.degreesOfFreedom, outcome.pose.coordinates));
  return assignUnit(context, unitId, {
    ...posed,
    drag: {
      ...drag,
      target,
      status: outcome.status,
      reason: outcome.status === 'blocked' ? outcome.reason : undefined,
    },
  });
};

/** Report the settled pose of a unit whose drag just ended, read from the context the ending produced. */
const emitPoseSettled = (next: KinematicsMachineContext, unitId: string, enq: KinematicsEnqueue): void => {
  enq.emit({ type: 'poseSettled', unitId, revision: getKinematicsUnitState(next, unitId).revision });
};

/** End the unit's drag where it is and emit `poseSettled`; `{}` when the unit has no drag. */
const endDrag = (context: KinematicsMachineContext, unitId: string, enq: KinematicsEnqueue): KinematicsPatch => {
  const unit = getKinematicsUnitState(context, unitId);
  if (unit.drag === undefined) {
    return {};
  }
  const patch = assignUnit(context, unitId, { ...unit, drag: undefined });
  emitPoseSettled({ ...context, ...patch }, unitId, enq);
  return patch;
};

/** Cancel the unit's drag, restore its pre-drag drivers and emit `poseSettled`; `{}` when the unit has no drag. */
const cancelDrag = (context: KinematicsMachineContext, unitId: string, enq: KinematicsEnqueue): KinematicsPatch => {
  const unit = getKinematicsUnitState(context, unitId);
  if (unit.drag === undefined) {
    return {};
  }
  const patch = assignUnit(context, unitId, withPose({ ...unit, drag: undefined }, unit.drag.startCoordinates));
  emitPoseSettled({ ...context, ...patch }, unitId, enq);
  return patch;
};

/** Solve the target still waiting for its coalescing window, so the pose reaches where the pointer last was. */
const flushPendingTarget = (context: KinematicsMachineContext): KinematicsMachineContext => {
  const { gesture } = context;
  if (gesture?.pendingTarget === undefined) {
    return context;
  }
  const moved = { ...context, ...moveDrag(context, gesture.unitId, gesture.pendingTarget) };
  return { ...moved, gesture: { ...gesture, pendingTarget: undefined } };
};

/** The press is over: its adapter stops (restoring the camera, cursor and capture) and the actor returns to idle. */
const finishGesture = (context: KinematicsMachineContext, patch: KinematicsPatch, enq: KinematicsEnqueue) => {
  if (context.dragAdapter) {
    enq.stop(context.dragAdapter);
  }
  return { target: '#kinematics.idle', context: { ...patch, gesture: undefined, dragAdapter: undefined } } as const;
};

/** Whether a pointer event belongs to the claimed press; another pointer's events are not this gesture's. */
const isGesturePointer = (context: KinematicsMachineContext, pointerId: number): boolean =>
  context.gesture?.pointerId === pointerId;

/** A move without the primary button (bit 0 of `buttons`): the release happened where the page could not see it. */
const isReleasedMove = (buttons: number): boolean => buttons % 2 === 0;

/** Release a drag: solve the waiting target, keep the pose and end the press. */
const releaseDrag = (context: KinematicsMachineContext, enq: KinematicsEnqueue) => {
  const flushed = flushPendingTarget(context);
  const { gesture } = flushed;
  const patch: KinematicsPatch = {
    unitsById: flushed.unitsById,
    revision: flushed.revision,
    ...(gesture === undefined ? {} : endDrag(flushed, gesture.unitId, enq)),
  };
  return finishGesture(context, patch, enq);
};

/** Cancel a drag whose release will not arrive and end the press. */
const abortDrag = (context: KinematicsMachineContext, enq: KinematicsEnqueue) =>
  finishGesture(context, context.gesture === undefined ? {} : cancelDrag(context, context.gesture.unitId, enq), enq);

/**
 * State machine that holds each unit's mechanism and evaluates its pose for coordinate edits, animation playback and
 * part drags, and follows the viewer's part-drag gesture.
 *
 * @public
 */
export const kinematicsMachine = setup({
  actors: kinematicsActors,
  schemas: {
    context: types<KinematicsMachineContext>(),
    events: eventSchemas<KinematicsMachineEvent>(),
    emitted: eventSchemas<KinematicsEmitted>(),
    input: types<KinematicsMachineInput>(),
    tags: types<'dragging'>(),
  },
}).createMachine({
  id: 'kinematics',
  context: { unitsById: {}, revision: 0, gesture: undefined, dragAdapter: undefined },
  initial: 'idle',
  states: {
    idle: {
      on: {
        pressPart: ({ context, event }, enq) => {
          if (findDraggableLink(getKinematicsUnitState(context, event.unitId), event.componentId) === undefined) {
            // Refused: the press stays with the camera and the click (unarmed, grounded or not in the mechanism).
            return {};
          }
          const dragAdapter = enq.spawn(event.adapter, { id: 'dragAdapter' });
          const gesture: KinematicsGesture = {
            unitId: event.unitId,
            componentId: event.componentId,
            pointerId: event.pointerId,
            start: { clientX: event.clientX, clientY: event.clientY },
            point: event.point,
            pendingTarget: undefined,
          };
          return { target: 'pressed', context: { gesture, dragAdapter } };
        },
      },
    },
    pressed: {
      on: {
        movePointer: ({ context, event }, enq) => {
          const { gesture } = context;
          if (gesture === undefined || !isGesturePointer(context, event.pointerId)) {
            // Another pointer's move: not this press's.
            return {};
          }
          if (isReleasedMove(event.buttons)) {
            return finishGesture(context, {}, enq);
          }
          const travelled = Math.hypot(event.clientX - gesture.start.clientX, event.clientY - gesture.start.clientY);
          if (travelled < kinematicsDragThresholdPx) {
            // Still a click: nothing moves until the press travels the threshold.
            return {};
          }
          const started = startDrag(context, gesture);
          if (started === undefined) {
            // The unit was disarmed or lost the link since the press: hold the press, as a cancelled drag does.
            return { target: 'cancelled' };
          }
          if (context.dragAdapter) {
            enq.sendTo(context.dragAdapter, { type: 'dragStarted' });
          }
          return {
            target: event.target === undefined ? 'dragging' : 'dragging.coalescing',
            context: { ...started, gesture: { ...gesture, pendingTarget: event.target } },
          };
        },
        releasePointer: ({ context, event }, enq) =>
          // Another pointer's release is not this press's.
          isGesturePointer(context, event.pointerId) ? finishGesture(context, {}, enq) : {},
        losePointer: ({ context, event }, enq) =>
          // Another pointer's loss is not this press's.
          isGesturePointer(context, event.pointerId) ? finishGesture(context, {}, enq) : {},
        interruptGesture: ({ context }, enq) => finishGesture(context, {}, enq),
      },
    },
    dragging: {
      tags: ['dragging'],
      initial: 'steady',
      states: {
        steady: {
          on: {
            movePointer: ({ context, event }, enq) => {
              if (!isGesturePointer(context, event.pointerId) || context.gesture === undefined) {
                // Another pointer's move: not this press's.
                return {};
              }
              if (isReleasedMove(event.buttons)) {
                return releaseDrag(context, enq);
              }
              if (event.target === undefined) {
                // The pointer ray misses the drag plane: the part stays where it is.
                return {};
              }
              return {
                target: 'coalescing',
                context: { gesture: { ...context.gesture, pendingTarget: event.target } },
              };
            },
          },
        },
        coalescing: {
          after: {
            [kinematicsDragMoveWindow]: ({ context }) => {
              const flushed = flushPendingTarget(context);
              return {
                target: 'steady',
                context: { unitsById: flushed.unitsById, revision: flushed.revision, gesture: flushed.gesture },
              };
            },
          },
          on: {
            movePointer: ({ context, event }, enq) => {
              if (!isGesturePointer(context, event.pointerId) || context.gesture === undefined) {
                // Another pointer's move: not this press's.
                return {};
              }
              if (isReleasedMove(event.buttons)) {
                return releaseDrag(context, enq);
              }
              if (event.target === undefined) {
                // The pointer ray misses the drag plane: the waiting target stays the latest one.
                return {};
              }
              // The window keeps running: the solve waits for it, then takes this latest target.
              return { context: { gesture: { ...context.gesture, pendingTarget: event.target } } };
            },
          },
        },
      },
      on: {
        releasePointer: ({ context, event }, enq) =>
          // Another pointer's release is not this press's.
          isGesturePointer(context, event.pointerId) ? releaseDrag(context, enq) : {},
        losePointer: ({ context, event }, enq) =>
          // Another pointer's loss is not this press's.
          isGesturePointer(context, event.pointerId) ? abortDrag(context, enq) : {},
        interruptGesture: ({ context }, enq) => abortDrag(context, enq),
        cancelGesture: ({ context }, enq) => {
          const { gesture } = context;
          const patch = gesture === undefined ? {} : cancelDrag(context, gesture.unitId, enq);
          return {
            target: '#kinematics.cancelled',
            context: {
              ...patch,
              gesture: gesture === undefined ? undefined : { ...gesture, pendingTarget: undefined },
            },
          };
        },
      },
    },
    cancelled: {
      on: {
        movePointer: ({ context, event }, enq) =>
          // Moves after a cancel change nothing; only one without the primary button ends the press.
          isGesturePointer(context, event.pointerId) && isReleasedMove(event.buttons)
            ? finishGesture(context, {}, enq)
            : {},
        releasePointer: ({ context, event }, enq) =>
          // Another pointer's release is not this press's.
          isGesturePointer(context, event.pointerId) ? finishGesture(context, {}, enq) : {},
        losePointer: ({ context, event }, enq) =>
          // Another pointer's loss is not this press's.
          isGesturePointer(context, event.pointerId) ? finishGesture(context, {}, enq) : {},
        interruptGesture: ({ context }, enq) => finishGesture(context, {}, enq),
      },
    },
  },
  on: {
    loadMechanism: ({ context, event }) => {
      const unit = getKinematicsUnitState(context, event.unitId);
      if (unit.mechanism === event.mechanism) {
        return {};
      }
      const degreesOfFreedom = listDegreesOfFreedom(event.mechanism);
      // A re-render keeps the pose of drivers that still exist; playback restarts from the first clip.
      const retained = driverCoordinates(degreesOfFreedom, unit.coordinates);
      const loaded = withPose(
        {
          ...emptyUnitState,
          dragEnabled: unit.dragEnabled,
          mechanism: event.mechanism,
          degreesOfFreedom,
          playback: {
            ...stoppedPlayback,
            speed: unit.playback.speed,
            animationId: event.mechanism.animations?.[0]?.id,
          },
        },
        retained,
      );
      return { context: assignUnit(context, event.unitId, loaded) };
    },
    clearMechanism: ({ context, event }, enq) => {
      const unit = getKinematicsUnitState(context, event.unitId);
      if (unit.mechanism === undefined) {
        return {};
      }
      const cleared = {
        ...emptyUnitState,
        dragEnabled: unit.dragEnabled,
        playback: { ...stoppedPlayback, speed: unit.playback.speed },
      };
      const patch = assignUnit(context, event.unitId, cleared);
      // The viewer clears a unit as it unmounts it: a press on that unit ends with it and gives the camera back.
      return context.gesture?.unitId === event.unitId ? finishGesture(context, patch, enq) : { context: patch };
    },
    setCoordinate: ({ context, event }) => {
      const unit = getKinematicsUnitState(context, event.unitId);
      if (unit.mechanism === undefined) {
        return {};
      }
      const posed = withPose(
        { ...unit, playback: pausedWhilePlaying(unit.playback) },
        { ...unit.coordinates, [event.id]: event.value },
      );
      return { context: assignUnit(context, event.unitId, posed) };
    },
    reset: ({ context, event }) => {
      const unit = getKinematicsUnitState(context, event.unitId);
      if (unit.mechanism === undefined) {
        return {};
      }
      const asBuilt = withPose(
        { ...unit, playback: { ...unit.playback, status: 'stopped', time: 0 }, drag: undefined },
        {},
      );
      return { context: assignUnit(context, event.unitId, asBuilt) };
    },
    play: ({ context, event }) => {
      const unit = getKinematicsUnitState(context, event.unitId);
      if (unit.mechanism === undefined) {
        return {};
      }
      const animationId =
        event.animationId === undefined ? unit.playback.animationId : toPlaybackAnimationId(event.animationId);
      if (resolveAnimation(unit.mechanism, unit.degreesOfFreedom, animationId) === undefined) {
        return {};
      }
      const isResume = animationId === unit.playback.animationId && unit.playback.status !== 'stopped';
      if (isResume && unit.playback.status === 'playing') {
        return {};
      }
      const playing = sampleAt(
        { ...unit, drag: undefined },
        { ...unit.playback, animationId, status: 'playing', time: isResume ? unit.playback.time : 0 },
      );
      return { context: assignUnit(context, event.unitId, playing) };
    },
    selectAnimation: ({ context, event }) => {
      const unit = getKinematicsUnitState(context, event.unitId);
      const animationId = toPlaybackAnimationId(event.animationId);
      if (
        unit.mechanism === undefined ||
        animationId === unit.playback.animationId ||
        resolveAnimation(unit.mechanism, unit.degreesOfFreedom, animationId) === undefined
      ) {
        return {};
      }
      // Selecting stops the previous clip; `play {}` then starts the selection from its beginning.
      const selected: KinematicsUnitState = {
        ...unit,
        playback: { ...unit.playback, animationId, status: 'stopped', time: 0 },
      };
      return { context: assignUnit(context, event.unitId, selected) };
    },
    pause: ({ context, event }) => {
      const unit = getKinematicsUnitState(context, event.unitId);
      if (unit.playback.status !== 'playing') {
        return {};
      }
      return { context: assignUnit(context, event.unitId, { ...unit, playback: pausedWhilePlaying(unit.playback) }) };
    },
    seek: ({ context, event }) => {
      const unit = getKinematicsUnitState(context, event.unitId);
      if (unit.mechanism === undefined || !Number.isFinite(event.time)) {
        return {};
      }
      const sought = sampleAt(unit, {
        ...unit.playback,
        status: unit.playback.status === 'stopped' ? 'paused' : unit.playback.status,
        time: Math.max(0, event.time),
      });
      return { context: assignUnit(context, event.unitId, sought) };
    },
    setPlaybackSpeed: ({ context, event }) => {
      const unit = getKinematicsUnitState(context, event.unitId);
      if (!Number.isFinite(event.speed) || event.speed <= 0 || event.speed === unit.playback.speed) {
        return {};
      }
      const playback = { ...unit.playback, speed: event.speed };
      return { context: assignUnit(context, event.unitId, { ...unit, playback }) };
    },
    tick: ({ context, event }) => {
      const unit = getKinematicsUnitState(context, event.unitId);
      if (unit.mechanism === undefined || unit.playback.status !== 'playing' || !(event.elapsed > 0)) {
        return {};
      }
      const animation = resolveAnimation(unit.mechanism, unit.degreesOfFreedom, unit.playback.animationId);
      const time = unit.playback.time + event.elapsed * unit.playback.speed;
      // A clip without a loop mode holds its last frame and stops at its end.
      const hasEnded = animation !== undefined && (animation.loop ?? 'none') === 'none' && time >= animation.duration;
      const ticked = sampleAt(unit, {
        ...unit.playback,
        status: hasEnded ? 'stopped' : 'playing',
        time: hasEnded ? animation.duration : time,
      });
      return { context: assignUnit(context, event.unitId, ticked) };
    },
    dragStart: ({ context, event }) => {
      const started = startDrag(context, event);
      // Ignored unless the pane arms drags and the component is on a movable link.
      return started === undefined ? {} : { context: started };
    },
    dragMove: ({ context, event }) => ({ context: moveDrag(context, event.unitId, event.target) }),
    dragEnd: ({ context, event }, enq) => ({ context: endDrag(context, event.unitId, enq) }),
    dragCancel: ({ context, event }, enq) => ({ context: cancelDrag(context, event.unitId, enq) }),
    setHoveredComponents: ({ context, event }) => {
      const unit = getKinematicsUnitState(context, event.unitId);
      const isSame =
        unit.hoveredComponentIds.length === event.componentIds.length &&
        unit.hoveredComponentIds.every((id, index) => id === event.componentIds[index]);
      if (isSame || (unit.mechanism === undefined && event.componentIds.length > 0)) {
        return {};
      }
      const hoveredComponentIds = event.componentIds.length === 0 ? noComponents : event.componentIds;
      return { context: assignUnit(context, event.unitId, { ...unit, hoveredComponentIds }) };
    },
    setDragEnabled: ({ context, event }, enq) => {
      const unit = getKinematicsUnitState(context, event.unitId);
      if (unit.dragEnabled === event.enabled) {
        return {};
      }
      const next = { ...unit, dragEnabled: event.enabled, drag: undefined };
      // Disarming mid-drag cancels the drag exactly like `dragCancel`: the pre-drag drivers come back. A press in
      // flight holds the camera until its release, as after Escape.
      const armed = unit.drag === undefined ? next : withPose(next, unit.drag.startCoordinates);
      const patch = assignUnit(context, event.unitId, armed);
      if (unit.drag !== undefined) {
        emitPoseSettled({ ...context, ...patch }, event.unitId, enq);
      }
      return { context: patch };
    },
  },
});

/**
 * The `[state, eventType]` pairs {@link kinematicsMachine} leaves unanswered (MC-R17): pointer reports with no press
 * to follow, a second press while one holds the viewer, and Escape with no drag to cancel.
 *
 * @public
 */
export const kinematicsIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ['idle', 'movePointer'],
  ['idle', 'releasePointer'],
  ['idle', 'losePointer'],
  ['idle', 'interruptGesture'],
  ['idle', 'cancelGesture'],
  ['pressed', 'pressPart'],
  ['pressed', 'cancelGesture'],
  ['dragging.steady', 'pressPart'],
  ['dragging.coalescing', 'pressPart'],
  ['cancelled', 'pressPart'],
  ['cancelled', 'cancelGesture'],
];

/**
 * Every {@link KinematicsMachineEvent} type, in the union's order.
 *
 * @public
 */
export const kinematicsEventTypes = [
  'loadMechanism',
  'clearMechanism',
  'setCoordinate',
  'reset',
  'play',
  'selectAnimation',
  'pause',
  'seek',
  'setPlaybackSpeed',
  'tick',
  'dragStart',
  'dragMove',
  'dragEnd',
  'dragCancel',
  'setDragEnabled',
  'setHoveredComponents',
  'pressPart',
  'movePointer',
  'releasePointer',
  'losePointer',
  'interruptGesture',
  'cancelGesture',
] as const satisfies ReadonlyArray<KinematicsMachineEvent['type']>;

/**
 * Whether the kinematics actor is dragging a part: a press that travelled the threshold and was not cancelled.
 *
 * @param snapshot - The kinematics actor's snapshot.
 * @returns `true` while a drag follows the pointer.
 * @public
 */
export const selectKinematicsDragging = (snapshot: Readonly<{ hasTag: (tag: 'dragging') => boolean }>): boolean =>
  snapshot.hasTag('dragging');
