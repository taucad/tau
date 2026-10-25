import type { KinematicsRef } from '@taucad/viewer/machines/graphics.machine';
import { getKinematicsAnimation } from '@taucad/viewer/machines/kinematics.machine';

export type PlaybackMeasurement = {
  unitId: string;
  timing: 'realtime' | 'fixed-step';
  expectedTime: number;
  matchedSampleFrames: number;
  animation: { id: string; duration: number; loop: string };
  speed: number;
  start: { time: number; revision: number };
  previousTime: number;
  playingSampleFrames: number;
  advancingSampleFrames: number;
};

/** Reset all mechanism units; only playable units enter the motion workload. */
export function prepareBenchmarkPlayback(
  actor: KinematicsRef,
  play: boolean,
  timing: PlaybackMeasurement['timing'] = 'realtime',
): PlaybackMeasurement[] {
  const measurements: PlaybackMeasurement[] = [];
  for (const [unitId, unit] of Object.entries(actor.getSnapshot().context.unitsById)) {
    if (!unit.mechanism) {
      continue;
    }
    actor.send({ type: 'pause', unitId });
    actor.send({ type: 'seek', unitId, time: 0 });
    const animation = getKinematicsAnimation({
      mechanism: unit.mechanism,
      degreesOfFreedom: unit.degreesOfFreedom,
      animationId: unit.playback.animationId,
    });
    if (!play || !animation) {
      continue;
    }
    if (timing === 'realtime') {
      actor.send({ type: 'play', unitId });
    }
    const started = actor.getSnapshot().context.unitsById[unitId]!;
    if (timing === 'fixed-step' || started.playback.status === 'playing') {
      measurements.push({
        unitId,
        timing,
        expectedTime: 0,
        matchedSampleFrames: 0,
        animation: { id: animation.id, duration: animation.duration, loop: animation.loop ?? 'none' },
        speed: started.playback.speed,
        start: { time: started.playback.time, revision: started.revision },
        previousTime: started.playback.time,
        playingSampleFrames: 0,
        advancingSampleFrames: 0,
      });
    }
  }
  return measurements;
}

/** Seek while paused: the production wall-clock callback cannot advance the selected pose. */
export function advanceBenchmarkPlayback(
  actor: KinematicsRef,
  measurements: PlaybackMeasurement[],
  frame: number,
): void {
  for (const measurement of measurements) {
    if (measurement.timing === 'fixed-step') {
      measurement.expectedTime = (frame / 60) * measurement.speed;
      actor.send({ type: 'seek', unitId: measurement.unitId, time: measurement.expectedTime });
    }
  }
}

/** Count actual actor motion after each sampled render, independently of camera motion. */
export function sampleBenchmarkPlayback(actor: KinematicsRef, measurements: PlaybackMeasurement[]): void {
  for (const measurement of measurements) {
    const unit = actor.getSnapshot().context.unitsById[measurement.unitId];
    if (!unit) {
      continue;
    }
    measurement.matchedSampleFrames += Number(
      unit.playback.status === 'paused' && unit.playback.time === measurement.expectedTime,
    );
    measurement.playingSampleFrames += Number(unit.playback.status === 'playing');
    measurement.advancingSampleFrames += Number(unit.playback.time !== measurement.previousTime);
    measurement.previousTime = unit.playback.time;
  }
}

/** Preserve stopped/non-advancing clips as failed workloads, rather than calling them animation FPS. */
export function finishBenchmarkPlayback(
  actor: KinematicsRef,
  measurements: PlaybackMeasurement[],
  frames: number,
): Array<
  Omit<PlaybackMeasurement, 'previousTime'> & {
    end: { time: number; revision: number; status: string } | undefined;
    valid: boolean;
  }
> {
  return measurements.map(({ previousTime: _previousTime, ...measurement }) => {
    const unit = actor.getSnapshot().context.unitsById[measurement.unitId];
    return {
      ...measurement,
      end: unit ? { time: unit.playback.time, revision: unit.revision, status: unit.playback.status } : undefined,
      valid:
        (measurement.timing === 'fixed-step'
          ? measurement.matchedSampleFrames === frames
          : measurement.playingSampleFrames === frames) && measurement.advancingSampleFrames > 0,
    };
  });
}
