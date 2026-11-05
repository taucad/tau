/**
 * Span-path overhead gate (T11), lean harness.
 *
 * The statistic is the one `src/framework/runtime-tracer.bench.test.ts` reads, on the compiled build: the live
 * `RuntimeTracer` and `WorkerTelemetryCollector` from `dist` against the frozen reference, interleaved in one process,
 * the arm that runs first alternating every round (ABBA), each sample the median of five run medians, and the A/B
 * figure corrected by the A/A noise floor of two reference arms.
 *
 * Gates:
 * - The live path above {@link liveCeiling} ns/span always blocks.
 * - A reference arm above {@link referenceCeiling} ns/span always blocks: the harness, not the tracer, is being
 *   measured (the accepted design expects about 250–400 ns/span).
 * - The relative bounds ({@link perSpanBound} ns/span corrected Δ on every shape, {@link ratioBound}× corrected ratio
 *   on chains of at least {@link ratioShapeMinimum} spans) block only with `TAU_SPAN_BENCH_GATE=enforce`.
 *
 * Outside a calibration a breach is re-measured once before it counts.
 */

import { RuntimeTracer } from '#framework/runtime-tracer.js';
import { WorkerTelemetryCollector } from '#framework/worker-telemetry.js';
import type { TelemetryEntry } from '#types/runtime-wire.types.js';
/* oxlint-disable no-restricted-imports -- The frozen reference and the harness stay outside the package build graph. */
import { ReferenceRuntimeTracer, ReferenceWorkerTelemetryCollector } from '../support/reference-span-path.fixture.js';
import { benchEnvironment, distribution, log, median } from './lean-harness.js';
import type { BenchOptions, Distribution } from './lean-harness.js';
/* oxlint-enable no-restricted-imports */

/** Nanoseconds per span the live path may add over the reference, corrected by the A/A noise floor. */
const perSpanBound = 70;
/** The corrected live ÷ reference ratio allowed on the chains long enough for a ratio to be stable. */
const ratioBound = 1.25;
/** Spans per operation from which the ratio gate blocks; shorter chains report it only. */
const ratioShapeMinimum = 15;
/** Nanoseconds per span above which the reference arm is mis-measured. */
const referenceCeiling = 600;
/** Nanoseconds per span the live path may never exceed, calibrated or not. */
const liveCeiling = 2000;

type Attributes = Record<string, string | number | boolean>;
type Tracer = Readonly<{ startSpan: (name: string, attributes?: Attributes) => { end: () => void } }>;
type Shape = Readonly<{ name: string; spans: number; run: (tracer: Tracer) => void }>;
type Arm = Readonly<{ operation: (shape: Shape) => void }>;
type Settings = Readonly<{
  spansPerRound: number;
  rounds: number;
  warmupRounds: number;
  runsPerSample: number;
  samplesPerArm: number;
}>;

const settingsOf = (options: BenchOptions): Settings => {
  if (options.mode === 'quick') {
    return { spansPerRound: 20_500, rounds: 7, warmupRounds: 2, runsPerSample: 5, samplesPerArm: 3 };
  }
  return {
    spansPerRound: 102_500,
    rounds: 15,
    warmupRounds: 4,
    runsPerSample: 5,
    samplesPerArm: options.mode === 'full' ? 10 : options.samples,
  };
};

const resolveDependencies = (tracer: Tracer): void => {
  const dependencies = tracer.startSpan('kernel.resolve-deps');
  tracer.startSpan('deps.discover').end();
  for (let file = 0; file < 3; file++) {
    const read = tracer.startSpan('deps.read');
    tracer.startSpan('fs.read').end();
    read.end();
    tracer.startSpan('deps.hash').end();
  }
  dependencies.end();
};

const wrap = (tracer: Tracer, name: string, inner: () => void): void => {
  const span = tracer.startSpan(name);
  inner();
  span.end();
};

/* The worker's real span sequences per operation, operation root included, without per-span attribute objects; the
 * last shape is the opt-in per-call library tracing mode with its five attributes. */
const libraryCall: Attributes = {
  library: 'replicad',
  scope: 'user-main',
  memberPath: 'drawRectangle',
  operation: 'sketch',
  callType: 'apply',
};
const shapes: readonly Shape[] = [
  {
    name: 'describe',
    spans: 15,
    run(tracer) {
      resolveDependencies(tracer);
      wrap(tracer, 'middleware.wrap(ParameterUnits)', () => {
        wrap(tracer, 'middleware.wrap(ParameterCache)', () => {
          tracer.startSpan('kernel.extract-params').end();
        });
      });
    },
  },
  {
    name: 'evaluate',
    spans: 18,
    run(tracer) {
      resolveDependencies(tracer);
      wrap(tracer, 'middleware.wrap(ParameterFileResolver)', () => {
        wrap(tracer, 'middleware.wrap(GeometryCache)', () => {
          const compute = tracer.startSpan('kernel.compute');
          tracer.startSpan('kernel.bundle').end();
          tracer.startSpan('kernel.execute').end();
          compute.end();
        });
      });
      tracer.startSpan('kernel.compute.reuse').end();
    },
  },
  {
    name: 'render',
    spans: 5,
    run(tracer) {
      wrap(tracer, 'kernel.mesh', () => {
        wrap(tracer, 'middleware.wrap(GeometryCache)', () => {
          wrap(tracer, 'middleware.wrap(GltfEdgeDetection)', () => {
            tracer.startSpan('kernel.mesh-compute').end();
          });
        });
      });
    },
  },
  {
    name: 'export',
    spans: 16,
    run(tracer) {
      tracer.startSpan('kernel.export-reheat').end();
      resolveDependencies(tracer);
      wrap(tracer, 'middleware.wrap(GeometryCache)', () => {
        wrap(tracer, 'middleware.wrap(GltfEdgeDetection)', () => {
          tracer.startSpan('kernel.export-compute').end();
        });
      });
    },
  },
  {
    name: 'flat',
    spans: 41,
    run(tracer) {
      for (let call = 0; call < 40; call++) {
        tracer.startSpan('kernel.compute').end();
      }
    },
  },
  {
    name: 'library per-call',
    spans: 41,
    run(tracer) {
      for (let call = 0; call < 40; call++) {
        tracer.startSpan('replicad.sketch', libraryCall).end();
      }
    },
  },
];

/** Both arms open the same operation root, so the comparison is the span path alone. */
const rootAttributes: Attributes = { 'operation.id': 'render:v1:e1:r1' };

const referenceArm = (): Arm => {
  const collector = new ReferenceWorkerTelemetryCollector(() => undefined);
  const tracer = new ReferenceRuntimeTracer();
  tracer.setEntrySink((entry: TelemetryEntry) => {
    collector.collect(entry);
  });
  return {
    operation(shape) {
      const root = tracer.startSpan('kernel.operation', rootAttributes);
      shape.run(tracer);
      root.end();
      collector.flush();
    },
  };
};

const liveArm = (): Arm => {
  const collector = new WorkerTelemetryCollector(() => undefined);
  const tracer = new RuntimeTracer();
  tracer.setEntrySink(
    (entry) => {
      collector.collect(entry);
    },
    () => {
      collector.noteDropped();
    },
  );
  return {
    operation(shape) {
      const root = tracer.startSpan('kernel.operation', rootAttributes);
      shape.run(tracer);
      root.end();
      collector.flush();
    },
  };
};

type Sample = Readonly<{ a: number; b: number; ratio: number; delta: number }>;

/**
 * The sampler for one group of settings.
 *
 * @param settings - The settings.
 * @returns A function that takes one sample of an arm pair on a shape.
 */
const measure = (settings: Settings): ((pair: readonly [Arm, Arm], shape: Shape) => Sample) => {
  /**
   * Nanoseconds per span of one round.
   *
   * @param arm - The arm.
   * @param shape - The chain.
   * @returns Nanoseconds per span.
   */
  const measureRound = (arm: Arm, shape: Shape): number => {
    const operations = Math.ceil(settings.spansPerRound / shape.spans);
    const start = performance.now();
    for (let operation = 0; operation < operations; operation++) {
      arm.operation(shape);
    }
    return ((performance.now() - start) * 1e6) / (operations * shape.spans);
  };

  /**
   * One ABBA run: the median of each arm's rounds, the first arm leading on even rounds and the second on odd ones.
   *
   * @param pair - The arms.
   * @param shape - The chain.
   * @returns The run's medians.
   */
  const run = (pair: readonly [Arm, Arm], shape: Shape): Sample => {
    const [first, second] = pair;
    const a: number[] = [];
    const b: number[] = [];
    for (let round = 0; round < settings.warmupRounds + settings.rounds; round++) {
      let left: number;
      let right: number;
      if (round % 2 === 0) {
        left = measureRound(first, shape);
        right = measureRound(second, shape);
      } else {
        right = measureRound(second, shape);
        left = measureRound(first, shape);
      }
      if (round >= settings.warmupRounds) {
        a.push(left);
        b.push(right);
      }
    }
    const medianA = median(a);
    const medianB = median(b);
    return { a: medianA, b: medianB, delta: medianB - medianA, ratio: medianB / medianA };
  };

  // One sample: the median of the run medians per arm.
  return (pair: readonly [Arm, Arm], shape: Shape): Sample => {
    const runs = Array.from({ length: settings.runsPerSample }, () => run(pair, shape));
    const a = median(runs.map((result) => result.a));
    const b = median(runs.map((result) => result.b));
    return { a, b, delta: b - a, ratio: b / a };
  };
};

/** One shape's result. */
export type SpanVerdict = Readonly<{
  shape: string;
  spans: number;
  samples: Readonly<{ ab: number; aa: number }>;
  referenceNs: number;
  liveNs: number;
  correctedDeltaNs: number;
  correctedRatio: number;
  /** Per-sample distributions, so a calibration can set or confirm a threshold. */
  distributions: Readonly<{
    referenceNs: Distribution;
    liveNs: Distribution;
    deltaNs: Distribution;
    ratio: Distribution;
    aaDeltaNs: Distribution;
    aaRatio: Distribution;
  }>;
  /** Breaches that always block. */
  blocking: readonly string[];
  /** Breaches of the relative gate, blocking only when it is enforced. */
  relative: readonly string[];
}>;

const measureShape = (shape: Shape, settings: Settings): SpanVerdict => {
  const sample = measure(settings);
  const abPair = [referenceArm(), liveArm()] as const;
  const aaPair = [referenceArm(), referenceArm()] as const;
  const ab: Sample[] = [];
  const aa: Sample[] = [];
  for (let index = 0; index < settings.samplesPerArm; index++) {
    ab.push(sample(abPair, shape));
    aa.push(sample(aaPair, shape));
  }
  const referenceNs = median(ab.map(({ a }) => a));
  const liveNs = median(ab.map(({ b }) => b));
  const correctedDeltaNs = median(ab.map(({ delta }) => delta)) - median(aa.map(({ delta }) => delta));
  const correctedRatio = median(ab.map(({ ratio }) => ratio)) / median(aa.map(({ ratio }) => ratio));
  const blocking: string[] = [];
  const relative: string[] = [];
  if (referenceNs > referenceCeiling) {
    blocking.push(
      `mis-measured: the reference arm reads ${referenceNs.toFixed(1)} ns/span (ceiling ${String(referenceCeiling)})`,
    );
  }
  if (liveNs > liveCeiling) {
    blocking.push(`live ${liveNs.toFixed(1)} ns/span exceeds the absolute ${String(liveCeiling)}`);
  }
  if (correctedDeltaNs > perSpanBound) {
    relative.push(`corrected Δ ${correctedDeltaNs.toFixed(1)} ns/span exceeds +${String(perSpanBound)}`);
  }
  if (shape.spans >= ratioShapeMinimum && correctedRatio > ratioBound) {
    relative.push(`corrected ratio ${correctedRatio.toFixed(3)} exceeds ${String(ratioBound)}`);
  }
  return {
    shape: shape.name,
    spans: shape.spans,
    samples: { ab: ab.length, aa: aa.length },
    referenceNs,
    liveNs,
    correctedDeltaNs,
    correctedRatio,
    distributions: {
      referenceNs: distribution(ab.map(({ a }) => a)),
      liveNs: distribution(ab.map(({ b }) => b)),
      deltaNs: distribution(ab.map(({ delta }) => delta)),
      ratio: distribution(ab.map(({ ratio }) => ratio)),
      aaDeltaNs: distribution(aa.map(({ delta }) => delta)),
      aaRatio: distribution(aa.map(({ ratio }) => ratio)),
    },
    blocking,
    relative,
  };
};

/**
 * Run the span-path gate.
 *
 * @param options - The bench options.
 * @param enforce - Whether the relative gate blocks.
 * @returns The report and whether it passed.
 */
export const runSpanPathBench = (
  options: BenchOptions,
  enforce: boolean,
): Readonly<{ passed: boolean; report: Record<string, unknown> }> => {
  const settings = settingsOf(options);
  const verdicts: SpanVerdict[] = [];
  let passed = true;
  for (const shape of shapes) {
    let verdict = measureShape(shape, settings);
    const breached = (candidate: SpanVerdict): boolean =>
      candidate.blocking.length > 0 || (enforce && candidate.relative.length > 0);
    let remeasured = false;
    if (options.mode !== 'calibrate' && breached(verdict)) {
      verdict = measureShape(shape, settings); // One re-measure before a breach fails
      remeasured = true;
    }
    const failed = breached(verdict);
    passed &&= !failed;
    verdicts.push(verdict);
    log(
      `span bench ${enforce ? 'gate' : 'advisory'} ${failed ? 'FAIL' : 'ok'}${remeasured ? ' (re-measured)' : ''}: ` +
        `${shape.name} (${String(shape.spans)} spans, ${String(verdict.samples.ab)} A/B + ${String(verdict.samples.aa)} A/A samples) ` +
        `reference ${verdict.referenceNs.toFixed(1)} ns/span, live ${verdict.liveNs.toFixed(1)} ns/span, ` +
        `corrected Δ ${verdict.correctedDeltaNs.toFixed(1)} ns/span, ratio ${verdict.correctedRatio.toFixed(3)}` +
        `${[...verdict.blocking, ...verdict.relative].map((breach) => `; ${breach}`).join('')}`,
    );
  }
  return {
    passed,
    report: {
      bench: 'span-path',
      mode: options.mode,
      settings,
      gate: {
        relative: enforce ? 'enforce' : 'advisory',
        perSpanBound,
        ratioBound,
        ratioShapeMinimum,
        referenceCeiling,
        liveCeiling,
      },
      environment: benchEnvironment(),
      passed,
      shapes: verdicts,
    },
  };
};
