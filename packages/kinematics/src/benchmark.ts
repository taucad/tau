/* v8 ignore file -- measurement script for the `benchmark` target; excluded from coverage. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { evaluatePose, solvePose } from '@taucad/kinematics';
import type { Mechanism, SolvePoseOutcome } from '@taucad/kinematics';
import type { SpatialVector } from '@taucad/spatial';
import { linearChain, sixAxisArm } from '#testing/mechanisms.js';

const warmRepetitions = 30;
const coldRepetitions = 5;
const warmUpRepetitions = 10;
/** Charter gate for interactive drag: p95 warm solve computation. Milliseconds. */
const solveGate = 4;
const outputFile = path.resolve(import.meta.dirname, '../../../out/reports/benchmarks/kinematics/benchmark.json');
/** The six-axis arm's shoulder pivot and its full reach from there. Millimetres. */
const shoulder: SpatialVector = [0, 0, 100];
const fullReach = 680;

type Summary = Readonly<{
  samples: number;
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
}>;

/**
 * Nearest-rank percentiles of durations.
 *
 * @param durations - Measured durations in milliseconds.
 * @returns Summary statistics in milliseconds.
 */
const summarize = (durations: readonly number[]): Summary => {
  const sorted = durations.toSorted((left, right) => left - right);
  const rank = (percentile: number): number => sorted[Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)]!;
  return {
    samples: sorted.length,
    min: sorted[0]!,
    p50: rank(50),
    p95: rank(95),
    p99: rank(99),
    max: sorted.at(-1)!,
    mean: sorted.reduce((total, value) => total + value, 0) / sorted.length,
  };
};

/**
 * Time one call.
 *
 * @param run - Work to measure.
 * @returns The result and the elapsed milliseconds.
 */
const timed = <T>(run: () => T): Readonly<{ result: T; elapsed: number }> => {
  const start = performance.now();
  const result = run();
  return { result, elapsed: performance.now() - start };
};

const measure = (run: () => unknown): number => timed(run).elapsed;

const chainCoordinates = (count: number): Readonly<Record<string, number>> =>
  Object.fromEntries(Array.from({ length: count }, (_, index) => [`joint${index + 1}`, 1]));

const evaluateChain = (count: number): Readonly<{ warm: Summary; cold: Summary }> => {
  const coordinates = chainCoordinates(count);
  // Cold: a fresh mechanism object per run, so admission and compilation are included.
  const cold = Array.from({ length: coldRepetitions }, () => {
    const mechanism = linearChain(count);
    return measure(() => evaluatePose({ mechanism, coordinates }));
  });
  const mechanism = linearChain(count);
  for (let index = 0; index < warmUpRepetitions; index += 1) {
    evaluatePose({ mechanism, coordinates });
  }
  const warm = Array.from({ length: warmRepetitions }, () => measure(() => evaluatePose({ mechanism, coordinates })));
  return { warm: summarize(warm), cold: summarize(cold) };
};

/**
 * Deterministic reachable flange targets from forward kinematics of spread joint angles.
 *
 * @param mechanism - The six-axis arm.
 * @param count - Number of targets.
 * @returns Flange-face target points.
 */
const armTargets = (mechanism: Mechanism, count: number): readonly SpatialVector[] =>
  Array.from({ length: count }, (_, index) => {
    const phase = (index + 1) / count;
    const outcome = evaluatePose({
      mechanism,
      coordinates: {
        baseYaw: 120 * Math.sin(7 * phase),
        shoulder: 50 * Math.sin(5 * phase),
        elbow: -60 * Math.cos(3 * phase),
        wristPitch: 40 * phase,
      },
    });
    if (outcome.status !== 'posed') {
      throw new Error('benchmark target is not posable');
    }
    const flange = outcome.pose.linkTransforms['flange']!;
    const flangePoint = (row: number): number => flange[row]! * 380 + flange[8 + row]! * 400 + flange[12 + row]!;
    return [flangePoint(0), flangePoint(1), flangePoint(2)];
  });

/**
 * Targets beyond reach in the directions of reachable ones, from 105 % to 200 % of full reach.
 *
 * @param targets - Flange-face points the arm can reach, which give the directions.
 * @returns Points the flange face cannot reach.
 */
const unreachableTargets = (targets: readonly SpatialVector[]): readonly SpatialVector[] =>
  targets.map((target, index): SpatialVector => {
    const [x, y, z] = [target[0] - shoulder[0], target[1] - shoulder[1], target[2] - shoulder[2]];
    const scale = (fullReach * (1.05 + (0.95 * index) / (targets.length - 1))) / Math.hypot(x, y, z);
    return [shoulder[0] + x * scale, shoulder[1] + y * scale, shoulder[2] + z * scale];
  });

type SolveSummary = Readonly<{ warm: Summary; statuses: Readonly<Record<string, number>>; iterations: Summary }>;

const solveTo = (mechanism: Mechanism, target: SpatialVector): SolvePoseOutcome =>
  solvePose({ mechanism, seed: {}, goals: [{ type: 'point', link: 'flange', localPoint: [380, 0, 400], target }] });

const solveWarm = (mechanism: Mechanism, targets: readonly SpatialVector[]): SolveSummary => {
  for (let index = 0; index < warmUpRepetitions; index += 1) {
    solveTo(mechanism, targets[index]!);
  }
  const statuses: Record<string, number> = {};
  const iterations: number[] = [];
  const warm = targets.map((target) => {
    const { result, elapsed } = timed(() => solveTo(mechanism, target));
    const key = result.status === 'blocked' ? `blocked:${result.reason}` : result.status;
    statuses[key] = (statuses[key] ?? 0) + 1;
    iterations.push(result.status === 'invalid' ? 0 : result.iterations);
    return elapsed;
  });
  return { warm: summarize(warm), statuses, iterations: summarize(iterations) };
};

const solveArm = (): SolveSummary & Readonly<{ cold: Summary }> => {
  const cold = Array.from({ length: coldRepetitions }, (_, index) => {
    const mechanism = sixAxisArm();
    const target = armTargets(sixAxisArm(), coldRepetitions)[index]!;
    return measure(() => solveTo(mechanism, target));
  });
  const mechanism = sixAxisArm();
  return { ...solveWarm(mechanism, armTargets(mechanism, warmRepetitions)), cold: summarize(cold) };
};

const evaluate = Object.fromEntries([10, 100, 1000].map((count) => [`chain${count}`, evaluateChain(count)]));
const solve = {
  sixAxisArmPointGoal: solveArm(),
  // Unreachable targets must still end promptly: the solver stops once steps stop removing the residual.
  sixAxisArmUnreachable: solveWarm(sixAxisArm(), unreachableTargets(armTargets(sixAxisArm(), warmRepetitions))),
};
const report = {
  generatedAt: new Date().toISOString(),
  unit: 'milliseconds',
  machine: {
    cpu: cpus()[0]?.model,
    cores: cpus().length,
    platform: platform(),
    release: release(),
    node: process.version,
  },
  repetitions: { warm: warmRepetitions, cold: coldRepetitions, warmUp: warmUpRepetitions },
  evaluatePose: evaluate,
  solvePose: solve,
  gate: {
    metric: 'solvePose.sixAxisArmPointGoal.warm.p95',
    threshold: solveGate,
    value: solve.sixAxisArmPointGoal.warm.p95,
    pass: solve.sixAxisArmPointGoal.warm.p95 <= solveGate,
  },
  unreachableGate: {
    metric: 'solvePose.sixAxisArmUnreachable.warm.p95',
    threshold: solveGate,
    value: solve.sixAxisArmUnreachable.warm.p95,
    pass: solve.sixAxisArmUnreachable.warm.p95 <= solveGate,
  },
};

mkdirSync(path.dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${JSON.stringify(report, undefined, 2)}\n`);
console.log(JSON.stringify(report.gate), JSON.stringify(report.unreachableGate), `\nwrote ${outputFile}`);
