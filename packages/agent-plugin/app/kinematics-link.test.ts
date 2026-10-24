import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { kinematicsMachine } from '@taucad/viewer/machines/kinematics.machine';
import type { KinematicsMachineEvent } from '@taucad/viewer/machines/kinematics.machine';

import { applyPoseCommand, motionOf } from '#app/kinematics-link.js';

const unitId = 'file:main.ts';

type Mechanism = Extract<KinematicsMachineEvent, { type: 'loadMechanism' }>['mechanism'];

const mechanism: Mechanism = {
  schemaVersion: 1,
  units: { length: 'm', angle: 'deg' },
  root: 'frame',
  links: {
    frame: { components: ['component:Frame'] },
    sun: { components: ['component:Sun'] },
    carrier: { components: ['component:Carrier'] },
  },
  joints: {
    sun: { type: 'revolute', parent: 'frame', child: 'sun', origin: [0, 0, 0], axis: [0, 0, 1] },
    carrier: { type: 'revolute', parent: 'frame', child: 'carrier', origin: [0, 0, 0], axis: [0, 0, 1] },
  },
  couplings: [{ driver: 'sun', follower: 'carrier', ratio: 0.25 }],
  animations: [
    {
      id: 'four-sun-turns',
      duration: 8,
      keyframes: [
        { time: 0, coordinates: { sun: 0 } },
        { time: 8, coordinates: { sun: 1440 } },
      ],
    },
  ],
};

const loaded = () => {
  const actor = createActor(kinematicsMachine, { input: {} }).start();
  actor.send({ type: 'loadMechanism', unitId, mechanism });
  return actor;
};

describe('applyPoseCommand', () => {
  it('should seek a clip to the time the server resolved and report it as view_state reads it', () => {
    const actor = loaded();

    applyPoseCommand(actor, unitId, {
      sequence: 1,
      modelId: 'model-1',
      animation: { id: 'four-sun-turns', action: 'seek', time: 2, speed: 1 },
    });

    expect(motionOf(actor, unitId)).toStrictEqual({
      mechanism: { preserved: true, joints: 2, animations: ['four-sun-turns'] },
      playback: { status: 'paused', animationId: 'four-sun-turns', time: 2, speed: 1 },
      coordinates: { sun: 360, carrier: 90 },
    });
  });

  it('should play from the resolved time at the requested speed, and reset to the as-built pose', () => {
    const actor = loaded();

    applyPoseCommand(actor, unitId, {
      sequence: 1,
      modelId: 'model-1',
      animation: { id: 'four-sun-turns', action: 'play', time: 4, speed: 2 },
    });
    expect(motionOf(actor, unitId)?.playback).toStrictEqual({
      status: 'playing',
      animationId: 'four-sun-turns',
      time: 4,
      speed: 2,
    });

    applyPoseCommand(actor, unitId, {
      sequence: 2,
      modelId: 'model-1',
      animation: { id: 'four-sun-turns', action: 'reset' },
    });
    expect(motionOf(actor, unitId)).toMatchObject({
      playback: { status: 'stopped', time: 0 },
      coordinates: { sun: 0 },
    });
  });

  it('should set driver coordinates, and report no motion for a unit without a mechanism', () => {
    const actor = loaded();

    applyPoseCommand(actor, unitId, { sequence: 1, modelId: 'model-1', coordinates: { sun: 40 } });

    expect(motionOf(actor, unitId)?.coordinates).toStrictEqual({ sun: 40, carrier: 10 });
    expect(motionOf(actor, 'file:other.ts')).toBeUndefined();
  });
});
