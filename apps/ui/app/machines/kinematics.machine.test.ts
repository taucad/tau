import { createActor, createAsyncLogic } from 'xstate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as KinematicsModule from '@taucad/kinematics';
import type { Mechanism, SampleAnimationInput, SolvePoseInput, SolvePoseOutcome } from '@taucad/kinematics';
import { graphicsMachine } from '#machines/graphics.machine.js';
import * as machineModule from '#machines/kinematics.machine.js';
import {
  describeKinematicsHover,
  getKinematicsDragNotice,
  getKinematicsUnitState,
  isGroundedKinematicsLink,
  kinematicsMachine,
  sweepAnimationId,
} from '#machines/kinematics.machine.js';

// The real package does the maths (L1 owns its tests); only the solver is scripted, and the
// sampler is spied to observe the driver sweep.
const kinematics = vi.hoisted(() => ({
  solvePose: vi.fn<(input: SolvePoseInput) => SolvePoseOutcome>(),
  sampleAnimation: vi.fn<(input: SampleAnimationInput) => Readonly<Record<string, number>>>(),
}));

vi.mock('@taucad/kinematics', async (importOriginal) => {
  const actual = await importOriginal<typeof KinematicsModule>();
  kinematics.sampleAnimation.mockImplementation(actual.sampleAnimation);
  return { ...actual, sampleAnimation: kinematics.sampleAnimation, solvePose: kinematics.solvePose };
});

const unitId = 'file:main.ts';
const origin = [0, 0, 0] as const;
const axis = [0, 0, 1] as const;

const mechanism: Mechanism = {
  schemaVersion: 1,
  units: { length: 'mm', angle: 'deg' },
  root: 'base',
  links: {
    base: { components: ['component:base'] },
    sun: { components: ['component:sun'] },
    carrier: { components: ['component:carrier'] },
    arm: { components: ['component:arm'] },
  },
  joints: {
    sun: { type: 'revolute', parent: 'base', child: 'sun', origin, axis },
    carrier: { type: 'revolute', parent: 'base', child: 'carrier', origin, axis },
    arm: { type: 'revolute', parent: 'base', child: 'arm', origin, axis, limits: { lower: -45, upper: 90 } },
  },
  couplings: [{ driver: 'sun', follower: 'carrier', ratio: 0.25 }],
  animations: [
    {
      id: 'four-sun-turns',
      duration: 2,
      keyframes: [
        { time: 0, coordinates: { sun: 0 } },
        { time: 2, coordinates: { sun: 1440 } },
      ],
    },
  ],
};

const solved = (coordinates: Record<string, number>): Extract<SolvePoseOutcome, { status: 'solved' }> => ({
  status: 'solved',
  pose: { linkTransforms: {}, coordinates },
  iterations: 3,
  residual: 0,
});

function startLoaded(loaded: Mechanism = mechanism) {
  const actor = createActor(kinematicsMachine, { input: {} }).start();
  actor.send({ type: 'loadMechanism', unitId, mechanism: loaded });
  const unit = () => getKinematicsUnitState(actor.getSnapshot().context, unitId);
  return { actor, unit };
}

describe('kinematicsMachine', () => {
  beforeEach(() => {
    kinematics.solvePose.mockReset();
    kinematics.sampleAnimation.mockClear();
  });

  it('should start headlessly and export exactly one machine value', () => {
    const isMachine = (value: unknown): boolean =>
      typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;
    const actor = createActor(kinematicsMachine, { input: {} }).start();

    expect(getKinematicsUnitState(actor.getSnapshot().context, unitId).mechanism).toBeUndefined();
    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([kinematicsMachine]);
    expect(structuredClone(actor.getSnapshot().context)).toEqual({ unitsById: {}, revision: 0 });

    actor.stop();
  });

  it('should be spawned by each graphics actor and stop with it', () => {
    const graphics = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      { input: {} },
    ).start();
    const { kinematicsRef } = graphics.getSnapshot().context;

    kinematicsRef.send({ type: 'loadMechanism', unitId, mechanism });
    expect(getKinematicsUnitState(kinematicsRef.getSnapshot().context, unitId).mechanism).toBe(mechanism);

    graphics.stop();
    expect(kinematicsRef.getSnapshot().status).toBe('stopped');
  });

  describe('load', () => {
    it('should list degrees of freedom and pose every driver at zero', () => {
      const { unit } = startLoaded();

      expect(unit().degreesOfFreedom.map(({ id, role }) => [id, role])).toEqual([
        ['sun', 'driver'],
        ['carrier', 'follower'],
        ['arm', 'driver'],
      ]);
      expect(unit().coordinates).toEqual({ sun: 0, arm: 0 });
      expect(unit().pose?.coordinates).toEqual({ sun: 0, arm: 0, carrier: 0 });
      expect(unit().playback).toEqual({ status: 'stopped', animationId: 'four-sun-turns', time: 0, speed: 1 });
      expect(unit().revision).toBe(1);
    });

    it('should ignore a repeated load of the same mechanism', () => {
      const { actor, unit } = startLoaded();
      const before = unit();

      actor.send({ type: 'loadMechanism', unitId, mechanism });

      expect(unit()).toBe(before);
    });

    it('should keep surviving driver coordinates when a new mechanism arrives', () => {
      const { actor, unit } = startLoaded();
      actor.send({ type: 'setCoordinate', unitId, id: 'arm', value: 30 });

      actor.send({ type: 'loadMechanism', unitId, mechanism: { ...mechanism } });

      expect(unit().coordinates).toEqual({ sun: 0, arm: 30 });
    });

    it('should keep the drag arming, set before the first load, across reloads and clears', () => {
      const actor = createActor(kinematicsMachine, { input: {} }).start();
      const unit = () => getKinematicsUnitState(actor.getSnapshot().context, unitId);
      expect(unit().dragEnabled).toBe(false);

      actor.send({ type: 'setDragEnabled', unitId, enabled: true });
      expect(unit()).toMatchObject({ dragEnabled: true, mechanism: undefined, revision: 0 });

      actor.send({ type: 'loadMechanism', unitId, mechanism });
      expect(unit()).toMatchObject({ dragEnabled: true, mechanism });
      actor.send({ type: 'loadMechanism', unitId, mechanism: { ...mechanism } });
      expect(unit().dragEnabled).toBe(true);
      actor.send({ type: 'clearMechanism', unitId });
      expect(unit()).toMatchObject({ dragEnabled: true, mechanism: undefined });
    });

    it('should clear the mechanism with a revision that never repeats', () => {
      const { actor, unit } = startLoaded();
      actor.send({ type: 'clearMechanism', unitId });
      const cleared = unit();
      actor.send({ type: 'loadMechanism', unitId, mechanism });

      expect(cleared.mechanism).toBeUndefined();
      expect(cleared.pose).toBeUndefined();
      expect(cleared.revision).toBe(2);
      expect(unit().revision).toBe(3);
    });
  });

  describe('setCoordinate', () => {
    it('should derive followers and bump the revision', () => {
      const { actor, unit } = startLoaded();

      actor.send({ type: 'setCoordinate', unitId, id: 'sun', value: 90 });

      expect(unit().coordinates).toEqual({ sun: 90, arm: 0 });
      expect(unit().pose?.coordinates['carrier']).toBe(22.5);
      expect(unit().revision).toBe(2);
    });

    it('should clamp a driver to its limits and report it at limit', () => {
      const { actor, unit } = startLoaded();

      actor.send({ type: 'setCoordinate', unitId, id: 'arm', value: 120 });

      expect(unit().coordinates['arm']).toBe(90);
      expect(unit().atLimit).toEqual(['arm']);
    });

    it('should keep the last valid pose and record issues for an invalid request', () => {
      const { actor, unit } = startLoaded();
      actor.send({ type: 'setCoordinate', unitId, id: 'sun', value: 40 });
      const { pose, revision } = unit();

      actor.send({ type: 'setCoordinate', unitId, id: 'carrier', value: 10 });

      expect(unit().issues.map(({ code }) => code)).toEqual(['DRIVEN_FOLLOWER']);
      expect(unit().pose).toBe(pose);
      expect(unit().revision).toBe(revision);
    });

    it('should ignore events for a unit without a mechanism', () => {
      const actor = createActor(kinematicsMachine, { input: {} }).start();

      actor.send({ type: 'setCoordinate', unitId, id: 'sun', value: 1 });
      actor.send({ type: 'play', unitId });
      actor.send({ type: 'tick', unitId, elapsed: 1 });
      actor.send({ type: 'reset', unitId });
      actor.send({ type: 'dragStart', unitId, componentId: 'component:arm', point: [0, 0, 0] });

      expect(actor.getSnapshot().context).toEqual({ unitsById: {}, revision: 0 });
    });
  });

  describe('playback', () => {
    it('should play the first authored clip and advance on ticks by elapsed times speed', () => {
      const { actor, unit } = startLoaded();

      actor.send({ type: 'play', unitId });
      actor.send({ type: 'setPlaybackSpeed', unitId, speed: 0.5 });
      actor.send({ type: 'tick', unitId, elapsed: 1 });

      expect(unit().playback).toEqual({ status: 'playing', animationId: 'four-sun-turns', time: 0.5, speed: 0.5 });
      expect(unit().coordinates['sun']).toBe(360);
      expect(unit().pose?.coordinates['carrier']).toBe(90);
    });

    it('should stop a clip without a loop mode at its end', () => {
      const { actor, unit } = startLoaded();

      actor.send({ type: 'play', unitId });
      actor.send({ type: 'tick', unitId, elapsed: 5 });

      expect(unit().playback).toMatchObject({ status: 'stopped', time: 2 });
      expect(unit().coordinates['sun']).toBe(1440);
    });

    it('should ignore ticks while paused and resume from the paused time', () => {
      const { actor, unit } = startLoaded();
      actor.send({ type: 'play', unitId });
      actor.send({ type: 'tick', unitId, elapsed: 0.5 });
      actor.send({ type: 'pause', unitId });
      const paused = unit();

      actor.send({ type: 'tick', unitId, elapsed: 1 });
      expect(unit()).toBe(paused);

      actor.send({ type: 'play', unitId });
      actor.send({ type: 'tick', unitId, elapsed: 0.5 });
      expect(unit().playback).toMatchObject({ status: 'playing', time: 1 });
    });

    it('should seek to a time and pose the clip there', () => {
      const { actor, unit } = startLoaded();

      actor.send({ type: 'seek', unitId, time: 1 });

      expect(unit().playback).toMatchObject({ status: 'paused', time: 1 });
      expect(unit().coordinates['sun']).toBe(720);
    });

    it('should sweep drivers between their limits or one full turn', () => {
      const { actor, unit } = startLoaded();

      actor.send({ type: 'play', unitId, animationId: sweepAnimationId });

      expect(unit().playback).toMatchObject({ status: 'playing', animationId: undefined, time: 0 });
      expect(kinematics.sampleAnimation.mock.lastCall?.[0].animation).toMatchObject({
        duration: 6,
        loop: 'pingPong',
        keyframes: [
          { time: 0, coordinates: { sun: 0, arm: -45 } },
          { time: 6, coordinates: { sun: 360, arm: 90 } },
        ],
      });
      expect(unit().coordinates).toEqual({ sun: 0, arm: -45 });
    });

    it('should have nothing to play for a mechanism without drivers or clips', () => {
      const welded: Mechanism = {
        schemaVersion: 1,
        units: { length: 'mm', angle: 'deg' },
        root: 'base',
        links: { base: { components: ['component:base'] }, bracket: { components: ['component:bracket'] } },
        joints: { weld: { type: 'fixed', parent: 'base', child: 'bracket', origin } },
      };
      const { actor, unit } = startLoaded(welded);
      const before = unit();

      actor.send({ type: 'play', unitId });
      actor.send({ type: 'play', unitId, animationId: sweepAnimationId });
      actor.send({ type: 'tick', unitId, elapsed: 1 });

      expect(unit()).toBe(before);
      expect(unit().playback.status).toBe('stopped');
    });

    it('should ignore an unknown animation and an invalid speed', () => {
      const { actor, unit } = startLoaded();
      const before = unit();

      actor.send({ type: 'play', unitId, animationId: 'missing' });
      actor.send({ type: 'selectAnimation', unitId, animationId: 'missing' });
      actor.send({ type: 'selectAnimation', unitId, animationId: 'four-sun-turns' });
      actor.send({ type: 'setPlaybackSpeed', unitId, speed: 0 });

      expect(unit()).toBe(before);
    });

    it('should select a clip without playing it or moving the pose', () => {
      const { actor, unit } = startLoaded();
      actor.send({ type: 'play', unitId });
      actor.send({ type: 'tick', unitId, elapsed: 0.5 });
      const { pose, revision } = unit();

      actor.send({ type: 'selectAnimation', unitId, animationId: sweepAnimationId });

      expect(unit().playback).toEqual({ status: 'stopped', animationId: undefined, time: 0, speed: 1 });
      expect(unit().pose).toBe(pose);
      expect(unit().revision).toBe(revision);

      actor.send({ type: 'play', unitId });
      expect(unit().playback).toMatchObject({ status: 'playing', animationId: undefined, time: 0 });
    });

    it('should pause playback when a slider moves', () => {
      const { actor, unit } = startLoaded();
      actor.send({ type: 'play', unitId });

      actor.send({ type: 'setCoordinate', unitId, id: 'arm', value: 10 });

      expect(unit().playback.status).toBe('paused');
    });

    it('should reset drivers to the as-built pose and stop playback', () => {
      const { actor, unit } = startLoaded();
      actor.send({ type: 'setCoordinate', unitId, id: 'arm', value: 10 });
      actor.send({ type: 'play', unitId });
      actor.send({ type: 'tick', unitId, elapsed: 1 });

      actor.send({ type: 'reset', unitId });

      expect(unit().coordinates).toEqual({ sun: 0, arm: 0 });
      expect(unit().playback).toMatchObject({ status: 'stopped', time: 0 });
    });
  });

  describe('drag', () => {
    // The Kinematics pane arms drags while it shows the unit.
    const startArmed = (loaded?: Mechanism) => {
      const started = startLoaded(loaded);
      started.actor.send({ type: 'setDragEnabled', unitId, enabled: true });
      return started;
    };
    const startDrag = () => {
      const loaded = startArmed();
      loaded.actor.send({ type: 'setCoordinate', unitId, id: 'arm', value: 10 });
      loaded.actor.send({ type: 'dragStart', unitId, componentId: 'component:arm', point: [15, 2, 3] });
      return loaded;
    };

    it('should record the grabbed point in the link reference frame', () => {
      const { unit } = startDrag();
      const radians = (10 * Math.PI) / 180;
      const [x, y, z] = unit().drag!.localPoint;

      // The arm is posed 10° about +z through the origin, so its reference point is the grab rotated back.
      expect(x).toBeCloseTo(15 * Math.cos(radians) + 2 * Math.sin(radians));
      expect(y).toBeCloseTo(-15 * Math.sin(radians) + 2 * Math.cos(radians));
      expect(z).toBeCloseTo(3);
      expect(unit().drag).toMatchObject({
        componentId: 'component:arm',
        link: 'arm',
        target: [15, 2, 3],
        status: 'solved',
        startCoordinates: { sun: 0, arm: 10 },
      });
    });

    it('should ignore dragStart until the pane arms drags', () => {
      const { actor, unit } = startLoaded();
      actor.send({ type: 'dragStart', unitId, componentId: 'component:arm', point: [15, 2, 3] });
      expect(unit().drag).toBeUndefined();
      const { revision } = unit();

      actor.send({ type: 'setDragEnabled', unitId, enabled: true });
      expect(unit()).toMatchObject({ dragEnabled: true, revision });

      actor.send({ type: 'dragStart', unitId, componentId: 'component:arm', point: [15, 2, 3] });
      expect(unit().drag).toMatchObject({ componentId: 'component:arm', link: 'arm' });
    });

    it('should cancel a drag like dragCancel when the pane disarms drags', () => {
      const { actor, unit } = startDrag();
      kinematics.solvePose.mockReturnValue(solved({ sun: 0, arm: 40, carrier: 0 }));
      actor.send({ type: 'dragMove', unitId, target: [45, 2, 3] });
      expect(unit().coordinates['arm']).toBe(40);
      const { revision } = unit();

      actor.send({ type: 'setDragEnabled', unitId, enabled: false });

      expect(unit()).toMatchObject({ dragEnabled: false, drag: undefined, coordinates: { sun: 0, arm: 10 } });
      expect(unit().pose?.coordinates['arm']).toBe(10);
      expect(unit().revision).toBeGreaterThan(revision);
      actor.send({ type: 'dragStart', unitId, componentId: 'component:arm', point: [15, 2, 3] });
      expect(unit().drag).toBeUndefined();
    });

    it('should not drag a component welded to the root through fixed joints', () => {
      const welded: Mechanism = {
        ...mechanism,
        links: { ...mechanism.links, bracket: { components: ['component:bracket'] } },
        joints: { ...mechanism.joints, weld: { type: 'fixed', parent: 'base', child: 'bracket', origin } },
      };
      const { actor, unit } = startArmed(welded);

      actor.send({ type: 'dragStart', unitId, componentId: 'component:bracket', point: [0, 0, 0] });

      expect(unit().drag).toBeUndefined();
    });

    it('should not drag a grounded or unknown component', () => {
      const { actor, unit } = startArmed();

      actor.send({ type: 'dragStart', unitId, componentId: 'component:base', point: [0, 0, 0] });
      actor.send({ type: 'dragStart', unitId, componentId: 'component:unknown', point: [0, 0, 0] });

      expect(unit().drag).toBeUndefined();
    });

    it('should solve one point goal seeded from the current coordinates', () => {
      const { actor, unit } = startDrag();
      kinematics.solvePose.mockReturnValue(solved({ sun: 0, arm: 40, carrier: 0 }));

      actor.send({ type: 'dragMove', unitId, target: [45, 2, 3] });

      expect(kinematics.solvePose).toHaveBeenCalledWith({
        mechanism,
        seed: { sun: 0, arm: 10 },
        goals: [{ type: 'point', link: 'arm', localPoint: unit().drag!.localPoint, target: [45, 2, 3] }],
      });
      expect(unit().coordinates['arm']).toBe(40);
      expect(unit().drag).toMatchObject({ status: 'solved', target: [45, 2, 3] });
    });

    it('should apply a blocked solve and record its reason', () => {
      const { actor, unit } = startDrag();
      kinematics.solvePose.mockReturnValue({
        ...solved({ sun: 0, arm: 90, carrier: 0 }),
        status: 'blocked',
        reason: 'limit',
      });

      actor.send({ type: 'dragMove', unitId, target: [200, 0, 0] });

      expect(unit().coordinates['arm']).toBe(90);
      expect(unit().drag).toMatchObject({ status: 'blocked', reason: 'limit' });
    });

    it('should keep the pose on drag end and restore it on cancel', () => {
      const { actor, unit } = startDrag();
      kinematics.solvePose.mockReturnValue(solved({ sun: 0, arm: 40, carrier: 0 }));
      actor.send({ type: 'dragMove', unitId, target: [45, 2, 3] });
      actor.send({ type: 'dragEnd', unitId });

      expect(unit().drag).toBeUndefined();
      expect(unit().coordinates['arm']).toBe(40);

      actor.send({ type: 'dragStart', unitId, componentId: 'component:arm', point: [45, 0, 0] });
      actor.send({ type: 'dragMove', unitId, target: [60, 0, 0] });
      kinematics.solvePose.mockReturnValue(solved({ sun: 0, arm: 55, carrier: 0 }));
      actor.send({ type: 'dragMove', unitId, target: [60, 0, 0] });
      actor.send({ type: 'dragCancel', unitId });

      expect(unit().drag).toBeUndefined();
      expect(unit().coordinates['arm']).toBe(40);
    });
  });
});

describe('isGroundedKinematicsLink', () => {
  it('should ground the root and links welded to it, not links behind a moving joint', () => {
    const chain: Mechanism = {
      schemaVersion: 1,
      units: { length: 'm', angle: 'deg' },
      root: 'base',
      links: {
        base: { components: ['component:base'] },
        bracket: { components: ['component:bracket'] },
        arm: { components: ['component:arm'] },
        tool: { components: ['component:tool'] },
      },
      joints: {
        weld: { type: 'fixed', parent: 'base', child: 'bracket', origin: [0, 0, 0] },
        hinge: { type: 'revolute', parent: 'bracket', child: 'arm', origin: [0, 0, 0], axis: [0, 0, 1] },
        flange: { type: 'fixed', parent: 'arm', child: 'tool', origin: [1, 0, 0] },
      },
    };

    expect(isGroundedKinematicsLink(chain, 'base')).toBe(true);
    expect(isGroundedKinematicsLink(chain, 'bracket')).toBe(true);
    expect(isGroundedKinematicsLink(chain, 'arm')).toBe(false);
    expect(isGroundedKinematicsLink(chain, 'tool')).toBe(false);
  });
});

describe('getKinematicsDragNotice', () => {
  const drag = {
    componentId: 'component:arm',
    link: 'arm',
    localPoint: [0, 0, 0],
    target: [0, 0, 0],
    startCoordinates: {},
  } as const;

  it('should report limits, singular poses and an exhausted solver', () => {
    expect(getKinematicsDragNotice({ ...drag, status: 'blocked', reason: 'limit' })).toBe('limit');
    expect(getKinematicsDragNotice({ ...drag, status: 'blocked', reason: 'singular' })).toBe('singular');
    expect(getKinematicsDragNotice({ ...drag, status: 'blocked', reason: 'budget' })).toBe('budget');
  });

  it('should stay quiet for a solved drag, no drag, and the projection of an unreachable target', () => {
    expect(getKinematicsDragNotice({ ...drag, status: 'solved' })).toBeUndefined();
    expect(getKinematicsDragNotice(undefined)).toBeUndefined();
    expect(getKinematicsDragNotice({ ...drag, status: 'blocked', reason: 'unreachable' })).toBeUndefined();
  });
});

describe('describeKinematicsHover', () => {
  const tooled: Mechanism = {
    ...mechanism,
    links: { ...mechanism.links, tool: { components: ['component:tool'] } },
    joints: { ...mechanism.joints, flange: { type: 'fixed', parent: 'arm', child: 'tool', origin } },
  };
  const loadUnit = (enabled: boolean) => {
    const actor = createActor(kinematicsMachine, { input: {} }).start();
    actor.send({ type: 'loadMechanism', unitId, mechanism: tooled });
    actor.send({ type: 'setDragEnabled', unitId, enabled });
    const unit = getKinematicsUnitState(actor.getSnapshot().context, unitId);
    actor.stop();
    return unit;
  };

  it('should name the joint that moves a part, and its driver for a follower', () => {
    const unit = loadUnit(true);

    expect(describeKinematicsHover(unit, 'component:arm')).toBe('Revolute · arm · drag to move');
    expect(describeKinematicsHover(unit, 'component:carrier')).toBe('Revolute · carrier · follows sun');
    expect(describeKinematicsHover(unit, 'component:tool')).toBe('Moves with arm');
    expect(describeKinematicsHover(unit, 'component:base')).toBe('Grounded · does not move');
  });

  it('should say why a drag of that part is blocked, ignoring an unreachable target', () => {
    const unit = loadUnit(true);
    const drag = {
      componentId: 'component:arm',
      link: 'arm',
      localPoint: [0, 0, 0],
      target: [0, 0, 0],
      startCoordinates: {},
      status: 'blocked',
    } as const;

    expect(describeKinematicsHover({ ...unit, drag: { ...drag, reason: 'limit' } }, 'component:arm')).toBe(
      'At a joint limit',
    );
    expect(describeKinematicsHover({ ...unit, drag: { ...drag, reason: 'singular' } }, 'component:arm')).toBe(
      'Singular pose',
    );
    expect(describeKinematicsHover({ ...unit, drag: { ...drag, reason: 'unreachable' } }, 'component:arm')).toBe(
      'Revolute · arm · drag to move',
    );
    // Another part under the pointer describes itself, not the drag.
    expect(describeKinematicsHover({ ...unit, drag: { ...drag, reason: 'limit' } }, 'component:sun')).toBe(
      'Revolute · sun · drag to move',
    );
  });

  it('should add nothing while the pane is closed or for a component outside the mechanism', () => {
    expect(describeKinematicsHover(loadUnit(false), 'component:arm')).toBeUndefined();
    expect(describeKinematicsHover(loadUnit(true), 'component:unknown')).toBeUndefined();
  });
});
