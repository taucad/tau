/**
 * Span-path overhead gate.
 *
 * The live `RuntimeTracer` and `WorkerTelemetryCollector` are measured against frozen copies of the classes as they
 * stood before the operation-root and open-span-stack repairs, in the same process, on the span chains the worker
 * really produces. A round covers a fixed number of spans in every shape, the arm that runs first alternates every
 * round (ABBA) so an order bias cancels, and each sample is the median of five run medians. The same statistic between
 * two reference arms (A/A) measures the noise floor, and the gate reads the A/B figure corrected by it.
 *
 * The relative gate, on every shape: the corrected median cost per span may rise by at most {@link perSpanBound}
 * nanoseconds, and for the chains of at least {@link ratioShapeMinimum} spans the corrected ratio may be at most
 * {@link ratioBound}. A reference arm slower than {@link referenceCeiling} nanoseconds per span means the bench itself
 * is mis-measured (a loaded runner, a transform that inflates the baseline). A breach is re-measured once. The
 * relative gate stays advisory — reported on stderr — until it is calibrated on the runner that enforces it, which
 * then sets `TAU_SPAN_BENCH_GATE=enforce`: on a contended machine its A/A noise floor alone moves by tens of
 * nanoseconds per span. The absolute bound of {@link liveCeiling} nanoseconds per span always blocks. Set
 * `TAU_SPAN_BENCH=full` for the full calibration settings.
 */

import { describe, expect, it } from 'vitest';
import { RuntimeTracer } from '#framework/runtime-tracer.js';
import { WorkerTelemetryCollector } from '#framework/worker-telemetry.js';
import type { TelemetryEntry } from '#types/runtime-wire.types.js';
// oxlint-disable-next-line no-restricted-imports -- The frozen reference stays outside the package build graph.
import {
  ReferenceRuntimeTracer,
  ReferenceWorkerTelemetryCollector,
} from '../../test/support/reference-span-path.fixture.js';

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
const enforceRelativeGate = process.env['TAU_SPAN_BENCH_GATE'] === 'enforce';

const full = process.env['TAU_SPAN_BENCH'] === 'full';
/** Spans per round in every shape, so a short chain is not measured over a sliver of time. */
const spansPerRound = full ? 102_500 : 20_500;
const rounds = full ? 15 : 7;
const warmupRounds = full ? 4 : 2;
const runsPerSample = 5;
const samplesPerArm = full ? 10 : 3;

type Attributes = Record<string, string | number | boolean>;
type Tracer = Readonly<{ startSpan: (name: string, attributes?: Attributes) => { end: () => void } }>;
type Shape = Readonly<{ name: string; spans: number; run: (tracer: Tracer) => void }>;
type Arm = Readonly<{ tracer: Tracer; operation: (shape: Shape) => void }>;

const median = (values: readonly number[]): number => {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)]!;
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

/* The chains below are the worker's real span sequences per operation, operation root included, without per-span
 * attribute objects; the last shape is the opt-in per-call library tracing mode with its five attributes. */
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
    spans: 6,
    run(tracer) {
      wrap(tracer, 'kernel.mesh', () => {
        wrap(tracer, 'middleware.wrap(GeometryCache)', () => {
          wrap(tracer, 'middleware.wrap(GltfEdgeDetection)', () => {
            wrap(tracer, 'middleware.wrap(DisplaySimplification)', () => {
              tracer.startSpan('kernel.mesh-compute').end();
            });
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
    tracer,
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
    tracer,
    operation(shape) {
      const root = tracer.startSpan('kernel.operation', rootAttributes);
      shape.run(tracer);
      root.end();
      collector.flush();
    },
  };
};

/** Nanoseconds per span of one round. */
const measureRound = (arm: Arm, shape: Shape): number => {
  const operations = Math.ceil(spansPerRound / shape.spans);
  const start = performance.now();
  for (let operation = 0; operation < operations; operation++) {
    arm.operation(shape);
  }
  return ((performance.now() - start) * 1e6) / (operations * shape.spans);
};

type Sample = Readonly<{ a: number; b: number; ratio: number; delta: number }>;

/** One ABBA run: the median of each arm's rounds, the first arm leading on even rounds and the second on odd ones. */
const run = (pair: readonly [Arm, Arm], shape: Shape): Sample => {
  const [first, second] = pair;
  const a: number[] = [];
  const b: number[] = [];
  for (let round = 0; round < warmupRounds + rounds; round++) {
    let left: number;
    let right: number;
    if (round % 2 === 0) {
      left = measureRound(first, shape);
      right = measureRound(second, shape);
    } else {
      right = measureRound(second, shape);
      left = measureRound(first, shape);
    }
    if (round >= warmupRounds) {
      a.push(left);
      b.push(right);
    }
  }
  const medianA = median(a);
  const medianB = median(b);
  return { a: medianA, b: medianB, delta: medianB - medianA, ratio: medianB / medianA };
};

/** One sample: the median of five run medians per arm. */
const sample = (pair: readonly [Arm, Arm], shape: Shape): Sample => {
  const runs = Array.from({ length: runsPerSample }, () => run(pair, shape));
  const a = median(runs.map((result) => result.a));
  const b = median(runs.map((result) => result.b));
  return { a, b, delta: b - a, ratio: b / a };
};

type Verdict = Readonly<{
  shape: string;
  spans: number;
  referenceNs: number;
  liveNs: number;
  correctedDeltaNs: number;
  correctedRatio: number;
  breaches: readonly string[];
}>;

const measureShape = (shape: Shape): Verdict => {
  const abPair = [referenceArm(), liveArm()] as const;
  const aaPair = [referenceArm(), referenceArm()] as const;
  const ab: Sample[] = [];
  const aa: Sample[] = [];
  for (let index = 0; index < samplesPerArm; index++) {
    ab.push(sample(abPair, shape));
    aa.push(sample(aaPair, shape));
  }
  const referenceNs = median(ab.map(({ a }) => a));
  const liveNs = median(ab.map(({ b }) => b));
  const correctedDeltaNs = median(ab.map(({ delta }) => delta)) - median(aa.map(({ delta }) => delta));
  const correctedRatio = median(ab.map(({ ratio }) => ratio)) / median(aa.map(({ ratio }) => ratio));
  const breaches: string[] = [];
  if (referenceNs > referenceCeiling) {
    breaches.push(
      `mis-measured: the reference arm reads ${referenceNs.toFixed(1)} ns/span (ceiling ${String(referenceCeiling)})`,
    );
  }
  if (correctedDeltaNs > perSpanBound) {
    breaches.push(`corrected Δ ${correctedDeltaNs.toFixed(1)} ns/span exceeds +${String(perSpanBound)}`);
  }
  if (shape.spans >= ratioShapeMinimum && correctedRatio > ratioBound) {
    breaches.push(`corrected ratio ${correctedRatio.toFixed(3)} exceeds ${String(ratioBound)}`);
  }
  return { shape: shape.name, spans: shape.spans, referenceNs, liveNs, correctedDeltaNs, correctedRatio, breaches };
};

describe('span path overhead gate', () => {
  it.each(shapes)(
    'should keep the $name chain within the bounds of the frozen reference',
    (shape) => {
      let verdict = measureShape(shape);
      if (verdict.breaches.length > 0) {
        verdict = measureShape(shape); // One re-measure before a breach fails
      }
      process.stderr.write(`span bench ${enforceRelativeGate ? 'gate' : 'advisory'}: ${JSON.stringify(verdict)}\n`);
      expect(verdict.liveNs, JSON.stringify(verdict)).toBeLessThanOrEqual(liveCeiling);
      if (enforceRelativeGate) {
        expect(verdict.breaches, JSON.stringify(verdict)).toEqual([]);
      }
    },
    full ? 600_000 : 120_000,
  );
});
