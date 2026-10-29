import { afterEach, describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { Mechanism } from '@taucad/kinematics';
import { kinematicsMachine } from '@taucad/viewer/machines/kinematics.machine';
import {
  advanceBenchmarkPlayback,
  finishBenchmarkPlayback,
  prepareBenchmarkPlayback,
  sampleBenchmarkPlayback,
} from '#routes/[__e2e].onshape-render-profile/benchmark-playback.js';

const actors: Array<ReturnType<typeof createActor<typeof kinematicsMachine>>> = [];
const createFixture = (loop: 'repeat' | 'none' = 'repeat') => {
  const mechanism: Mechanism = {
    schemaVersion: 1,
    units: { length: 'm', angle: 'rad' },
    root: 'base',
    links: { base: { components: ['base'] }, arm: { components: ['arm'] } },
    joints: { hinge: { type: 'revolute', parent: 'base', child: 'arm', origin: [0, 0, 0], axis: [0, 0, 1] } },
    animations: [
      {
        id: 'turn',
        duration: 1,
        loop,
        keyframes: [
          { time: 0, coordinates: { hinge: 0 } },
          { time: 1, coordinates: { hinge: 1 } },
        ],
      },
    ],
  };
  const actor = createActor(kinematicsMachine, { input: {} }).start();
  actors.push(actor);
  actor.send({ type: 'loadMechanism', unitId: 'gear', mechanism });
  return actor;
};
afterEach(() => {
  for (const actor of actors) {
    actor.stop();
  }
  actors.length = 0;
});

describe('calibration playback workload', () => {
  it('records actual repeating motion and a fresh start for every run', () => {
    const actor = createFixture();
    actor.send({ type: 'seek', unitId: 'gear', time: 0.5 });
    const measurement = prepareBenchmarkPlayback(actor, true);
    expect(measurement[0]!.start.time).toBe(0);
    for (let index = 0; index < 3; index++) {
      actor.send({ type: 'tick', unitId: 'gear', elapsed: 0.5 });
      sampleBenchmarkPlayback(actor, measurement);
    }
    expect(finishBenchmarkPlayback(actor, measurement, 3)[0]).toMatchObject({
      valid: true,
      playingSampleFrames: 3,
      advancingSampleFrames: 3,
      end: { time: 1.5, status: 'playing' },
    });
    expect(prepareBenchmarkPlayback(actor, true)[0]!.start.time).toBe(0);
  });

  it('rejects stopped clips and non-advancing motion', () => {
    const actor = createFixture('none');
    const measurement = prepareBenchmarkPlayback(actor, true);
    actor.send({ type: 'tick', unitId: 'gear', elapsed: 2 });
    sampleBenchmarkPlayback(actor, measurement);
    expect(finishBenchmarkPlayback(actor, measurement, 1)[0]!.valid).toBe(false);
    const still = prepareBenchmarkPlayback(actor, true);
    sampleBenchmarkPlayback(actor, still);
    expect(finishBenchmarkPlayback(actor, still, 1)[0]!.valid).toBe(false);
  });

  it('should reproduce frame-indexed poses despite different wall-clock ticks', () => {
    const runs = [0.001, 0.1].map((elapsed) => {
      const actor = createFixture();
      const measurement = prepareBenchmarkPlayback(actor, true, 'fixed-step');
      const poses = [];
      for (let frame = 0; frame < 12; frame++) {
        advanceBenchmarkPlayback(actor, measurement, frame);
        actor.send({ type: 'tick', unitId: 'gear', elapsed });
        sampleBenchmarkPlayback(actor, measurement);
        const unit = actor.getSnapshot().context.unitsById['gear']!;
        poses.push({ time: unit.playback.time, coordinates: unit.coordinates });
      }
      expect(finishBenchmarkPlayback(actor, measurement, 12)[0]).toMatchObject({
        valid: true,
        matchedSampleFrames: 12,
        end: { time: 11 / 60, status: 'paused' },
      });
      expect(poses[0]).not.toEqual(poses[11]);
      return poses;
    });
    expect(runs[0]).toEqual(runs[1]);
  });

  it('should reject a fixed-step workload changed before rendering', () => {
    const actor = createFixture();
    const measurement = prepareBenchmarkPlayback(actor, true, 'fixed-step');
    advanceBenchmarkPlayback(actor, measurement, 10);
    actor.send({ type: 'seek', unitId: 'gear', time: 0.8 });
    sampleBenchmarkPlayback(actor, measurement);
    expect(finishBenchmarkPlayback(actor, measurement, 1)[0]!.valid).toBe(false);
  });

  it('keeps orbit-only units paused and reports no motion for absent mechanisms', () => {
    const actor = createFixture();
    prepareBenchmarkPlayback(actor, true);
    expect(prepareBenchmarkPlayback(actor, false)).toEqual([]);
    expect(actor.getSnapshot().context.unitsById['gear']!.playback.status).toBe('paused');
    actor.send({ type: 'clearMechanism', unitId: 'gear' });
    expect(prepareBenchmarkPlayback(actor, true)).toEqual([]);
  });
});
