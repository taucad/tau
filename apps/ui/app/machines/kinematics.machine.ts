import { setup, types } from 'xstate';
import {
  evaluatePose,
  findLinkByComponent,
  listDegreesOfFreedom,
  sampleAnimation,
  solvePose,
} from '@taucad/kinematics';
import type { Animation, DegreeOfFreedom, Issue, Mechanism, Pose } from '@taucad/kinematics';
import type { SpatialMatrix, SpatialVector } from '@taucad/spatial';
import { eventSchemas } from '#lib/xstate.lib.js';

/**
 * `play` with this id sweeps every driver between its limits instead of an authored animation.
 * While it runs, `playback.animationId` is `undefined`.
 */
export const sweepAnimationId = '@sweep';

/** Seconds for one lower-to-upper pass of the driver sweep. */
export const sweepDurationSeconds = 6;

export type KinematicsPlayback = Readonly<{
  status: 'stopped' | 'playing' | 'paused';
  /** The selected authored animation; `undefined` selects the driver sweep. */
  animationId: string | undefined;
  /** Seconds into the animation. */
  time: number;
  speed: number;
}>;

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

/** A drag's blocked reason that the pane and the viewer report to the user. */
export type KinematicsDragNotice = Exclude<NonNullable<KinematicsDrag['reason']>, 'unreachable'>;

/**
 * The blocked reason worth reporting while dragging, or `undefined` when there is nothing to say.
 *
 * `unreachable` is left out: a pointer target on the camera-facing plane is rarely exactly reachable, so
 * the solver projects it onto the mechanism's motion (a gear follows the nearest point of its circle) and
 * the part visibly stopping already says it. Limits, singular poses and an exhausted solver are reported.
 */
export const getKinematicsDragNotice = (drag: KinematicsDrag | undefined): KinematicsDragNotice | undefined =>
  drag?.status === 'blocked' && drag.reason !== undefined && drag.reason !== 'unreachable' ? drag.reason : undefined;

/**
 * A link is grounded when every joint on its path to the root is fixed: it can never move, so a
 * press on it keeps orbiting the camera and never starts a drag.
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
  /** Increments on every pose change; the viewer re-applies link transforms when it changes. */
  revision: number;
}>;

export type KinematicsMachineContext = {
  unitsById: Record<string, KinematicsUnitState>;
  /** Monotonic source of unit revisions, so a cleared and reloaded unit never repeats one. */
  revision: number;
};

/** Input accepted when creating the kinematics actor. */
export type KinematicsMachineInput = Readonly<Record<string, never>>;

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
  | { type: 'setDragEnabled'; unitId: string; enabled: boolean };

const stoppedPlayback: KinematicsPlayback = { status: 'stopped', animationId: undefined, time: 0, speed: 1 };

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
  revision: 0,
});

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

export const kinematicsMachine = setup({
  schemas: {
    context: types<KinematicsMachineContext>(),
    events: eventSchemas<KinematicsMachineEvent>(),
    input: types<KinematicsMachineInput>(),
  },
}).createMachine({
  id: 'kinematics',
  context: { unitsById: {}, revision: 0 },
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
    clearMechanism: ({ context, event }) => {
      const unit = getKinematicsUnitState(context, event.unitId);
      if (unit.mechanism === undefined) {
        return {};
      }
      const cleared = {
        ...emptyUnitState,
        dragEnabled: unit.dragEnabled,
        playback: { ...stoppedPlayback, speed: unit.playback.speed },
      };
      return { context: assignUnit(context, event.unitId, cleared) };
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
      const unit = getKinematicsUnitState(context, event.unitId);
      const link =
        unit.mechanism === undefined
          ? undefined
          : findLinkByComponent({ mechanism: unit.mechanism, componentId: event.componentId });
      // Drags start only while the pane arms them, and a grounded link (the root, or welded to it) never moves.
      if (
        !unit.dragEnabled ||
        unit.mechanism === undefined ||
        link === undefined ||
        isGroundedKinematicsLink(unit.mechanism, link)
      ) {
        return {};
      }
      const linkTransform = unit.pose?.linkTransforms[link];
      const dragging: KinematicsUnitState = {
        ...unit,
        playback: pausedWhilePlaying(unit.playback),
        drag: {
          componentId: event.componentId,
          link,
          localPoint: linkTransform === undefined ? event.point : toLinkLocal(linkTransform, event.point),
          target: event.point,
          status: 'solved',
          startCoordinates: unit.coordinates,
        },
      };
      return { context: assignUnit(context, event.unitId, dragging) };
    },
    dragMove: ({ context, event }) => {
      const unit = getKinematicsUnitState(context, event.unitId);
      const { drag, mechanism } = unit;
      if (drag === undefined || mechanism === undefined) {
        return {};
      }
      const outcome = solvePose({
        mechanism,
        seed: unit.coordinates,
        goals: [{ type: 'point', link: drag.link, localPoint: drag.localPoint, target: event.target }],
      });
      if (outcome.status === 'invalid') {
        const rejected = { ...unit, issues: outcome.issues, drag: { ...drag, target: event.target } };
        return { context: assignUnit(context, event.unitId, rejected) };
      }
      // A blocked solve still applies its best limit-satisfying pose, so the part follows as far as it can.
      const posed = withPose(unit, driverCoordinates(unit.degreesOfFreedom, outcome.pose.coordinates));
      const moved: KinematicsUnitState = {
        ...posed,
        drag: {
          ...drag,
          target: event.target,
          status: outcome.status,
          reason: outcome.status === 'blocked' ? outcome.reason : undefined,
        },
      };
      return { context: assignUnit(context, event.unitId, moved) };
    },
    dragEnd: ({ context, event }) => {
      const unit = getKinematicsUnitState(context, event.unitId);
      if (unit.drag === undefined) {
        return {};
      }
      return { context: assignUnit(context, event.unitId, { ...unit, drag: undefined }) };
    },
    dragCancel: ({ context, event }) => {
      const unit = getKinematicsUnitState(context, event.unitId);
      if (unit.drag === undefined) {
        return {};
      }
      const restored = withPose({ ...unit, drag: undefined }, unit.drag.startCoordinates);
      return { context: assignUnit(context, event.unitId, restored) };
    },
    setDragEnabled: ({ context, event }) => {
      const unit = getKinematicsUnitState(context, event.unitId);
      if (unit.dragEnabled === event.enabled) {
        return {};
      }
      const next = { ...unit, dragEnabled: event.enabled, drag: undefined };
      // Disarming mid-drag cancels the drag exactly like `dragCancel`: the pre-drag drivers come back.
      const armed = unit.drag === undefined ? next : withPose(next, unit.drag.startCoordinates);
      return { context: assignUnit(context, event.unitId, armed) };
    },
  },
});
