/**
 * Operation-facts cost (T11 worker-facts and observation benches), lean harness.
 *
 * The measurements of `src/framework/operation-facts.bench.test.ts`, on the compiled build. Each sample of a shape is
 * the gate's statistic: the p95 of 500 timed batches (100 on the 5,000-leaf sweep). The gate reads the median of the
 * samples — one in quick mode, five in full mode, at least sixty in a calibration.
 *
 * Bounds (p95): the walk ≤ 1,500 ns per span on every shape; `parameterFacts` ≤ 15 µs at 50 leaves and ≤ 100 µs on
 * the truncated 5,000-leaf sweep; ≤ 2 µs per observation including the join; ≤ 100 ns for a kernel's heap hook (T26).
 * They block with `TAU_FACTS_BENCH_GATE=enforce`; ten times each bound always blocks.
 */

import type { ParameterBinding, ParameterManifest } from '@taucad/parameters';
import { ClientOperationObserver } from '#client/runtime-operation-observer.js';
import { parameterFacts, workerFactsFromEntries } from '#framework/operation-facts.js';
import { RuntimeTracer } from '#framework/runtime-tracer.js';
import { WorkerTelemetryCollector } from '#framework/worker-telemetry.js';
import type { TelemetryEntry } from '#types/runtime-wire.types.js';
/* oxlint-disable no-restricted-imports -- The harness stays outside the package build graph. */
import { benchEnvironment, distribution, log, median, percentile } from './lean-harness.js';
import type { BenchOptions, Distribution } from './lean-harness.js';
/* oxlint-enable no-restricted-imports */

const walkBound = 1500;
const parameterBound = 15_000;
const sweepBound = 100_000;
const observationBound = 2000;
const heapHookBound = 100;
const hardFactor = 10;

type Tracer = Pick<RuntimeTracer, 'startSpan'>;

/**
 * Time one call repeatedly, in batches so a sample is well above the clock's resolution.
 *
 * @param run - The call.
 * @param samples - How many batches.
 * @param batch - Calls per batch.
 * @returns Nanoseconds per call of each batch.
 */
const time = (run: () => void, samples: number, batch: number): number[] => {
  for (let warm = 0; warm < 200; warm++) {
    run();
  }
  const timings: number[] = [];
  for (let index = 0; index < samples; index++) {
    const started = performance.now();
    for (let call = 0; call < batch; call++) {
      run();
    }
    timings.push(((performance.now() - started) * 1e6) / batch);
  }
  return timings;
};

const wrap = (tracer: Tracer, name: string, inner: () => void): void => {
  const span = tracer.startSpan(name);
  inner();
  span.end();
};

const resolveDependencies = (tracer: Tracer): void => {
  wrap(tracer, 'kernel.resolve-deps', () => {
    tracer.startSpan('deps.discover').end();
    for (let file = 0; file < 3; file++) {
      wrap(tracer, 'deps.read', () => {
        tracer.startSpan('fs.read').end();
      });
      tracer.startSpan('deps.hash').end();
    }
  });
};

const shapes: ReadonlyArray<Readonly<{ name: string; root: string; run: (tracer: Tracer) => void }>> = [
  {
    name: 'describe',
    root: 'kernel.describe',
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
    root: 'kernel.evaluate',
    run(tracer) {
      resolveDependencies(tracer);
      wrap(tracer, 'middleware.wrap(ParameterFileResolver)', () => {
        wrap(tracer, 'middleware.wrap(GeometryCache)', () => {
          wrap(tracer, 'kernel.compute', () => {
            tracer.startSpan('kernel.bundle').end();
            tracer.startSpan('kernel.execute').end();
          });
        });
      });
      tracer.startSpan('kernel.compute.reuse').end();
    },
  },
  {
    name: 'render',
    root: 'kernel.render',
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
    root: 'kernel.export',
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
    root: 'kernel.evaluate',
    run(tracer) {
      for (let call = 0; call < 40; call++) {
        tracer.startSpan('kernel.compute').end();
      }
    },
  },
  {
    name: 'library per-call',
    root: 'kernel.evaluate',
    run(tracer) {
      for (let call = 0; call < 40; call++) {
        tracer
          .startSpan('replicad.sketch', { library: 'replicad', scope: 'user-main', memberPath: 'drawRectangle' })
          .end();
      }
    },
  },
];

/**
 * Record one operation's slice with the real tracer and collector.
 *
 * @param shape - The chain.
 * @returns The slice and its root's span id.
 */
const record = (
  shape: (typeof shapes)[number],
): Readonly<{ entries: readonly TelemetryEntry[]; rootSpanId: string }> => {
  const collector = new WorkerTelemetryCollector(() => undefined);
  const tracer = new RuntimeTracer();
  tracer.setEntrySink((entry) => {
    collector.collect(entry);
  });
  const mark = collector.beginOperation();
  const root = tracer.startSpan(shape.root, { 'operation.id': 'op' });
  shape.run(tracer);
  root.end();
  const entries = collector.operationEntries(mark, collector.position()) ?? [];
  const rootEntry = entries.find((entry) => entry.name === shape.root && entry.detail?.['operation.id'] === 'op');
  return { entries, rootSpanId: String(rootEntry?.detail?.['spanId']) };
};

/**
 * A binding of the representation the fixture needs; `parameterFacts` reads its unit and representation only.
 *
 * @param pointer - The instance pointer.
 * @param representation - The representation.
 * @returns The binding.
 */
const bindingAt = (pointer: string, representation: ParameterBinding['representation']): ParameterBinding => ({
  parameter: { value: pointer, stability: 'stable' },
  schema: { resource: 'main', pointer },
  representation,
  optional: false,
  nullable: false,
  constraints: {},
});

type Measurement = Readonly<{
  label: string;
  bound: number;
  /** Divides each p95, for a per-span bound. */
  per: number;
  /** Timed batches per sample. */
  batches: number;
  /** Calls per batch. */
  batch: number;
  run: () => void;
  /** Releases what the measurement held, after its last sample. */
  done?: () => void;
}>;

const measurements = (): Measurement[] => {
  const walks = shapes.map((shape): Measurement => {
    const { entries, rootSpanId } = record(shape);
    return {
      label: `walk ${shape.name} (${String(entries.length)} spans) per span`,
      bound: walkBound,
      per: entries.length,
      batches: 500,
      batch: 20,
      run() {
        workerFactsFromEntries(entries, rootSpanId);
      },
    };
  });

  const bindings: Record<string, ParameterBinding> = {};
  const defaults: Record<string, unknown> = {};
  const values: Record<string, unknown> = {};
  for (let index = 0; index < 46; index++) {
    bindings[`/p${String(index)}`] = bindingAt(`/p${String(index)}`, 'binary64');
    defaults[`p${String(index)}`] = index;
    values[`p${String(index)}`] = index % 5 === 0 ? index + 1 : index;
  }
  for (let index = 0; index < 4; index++) {
    bindings[`/s${String(index)}`] = bindingAt(`/s${String(index)}`, 'binary64');
    defaults[`s${String(index)}`] = { b: 1, a: [1, 2] };
    values[`s${String(index)}`] = { a: [1, 2], b: index };
  }
  const fifty: Pick<ParameterManifest, 'bindings' | 'defaults'> = { bindings, defaults };
  const sweep = Array.from({ length: 5000 }, (_, index) => index);
  const sweepManifest: Pick<ParameterManifest, 'bindings' | 'defaults'> = {
    bindings: { '/values/*': bindingAt('/values/*', 'binary64') },
    defaults: { values: sweep },
  };
  const swept = { values: sweep.map((value) => value + 1) };

  const observer = new ClientOperationObserver('web-worker');
  observer.onOperation(() => undefined);
  observer.observe('facts');
  observer.connected({ observation: ['facts'], sent: 'facts', send: () => undefined });
  const facts = { queue: 1, execution: 2, cold: false, reuse: 'computed' } as const;
  const result = { type: 'result', result: { success: true, issues: [] } } as const;
  let sequence = 0;

  // T26 (FR-03): a kernel's `observedHeapBytes` is one property read of its linear memory.
  const memory = new WebAssembly.Memory({ initial: 16 });
  const view = new Uint8Array(memory.buffer);
  const observedHeapBytes = (): number | undefined => view.byteLength;
  let sink = 0;

  return [
    ...walks,
    {
      label: 'parameterFacts 50 leaves',
      bound: parameterBound,
      per: 1,
      batches: 500,
      batch: 20,
      run() {
        parameterFacts(fifty, values);
      },
    },
    {
      label: 'parameterFacts 5,000-leaf sweep',
      bound: sweepBound,
      per: 1,
      batches: 100,
      batch: 5,
      run() {
        parameterFacts(sweepManifest, swept);
      },
    },
    {
      label: 'observation incl. join',
      bound: observationBound,
      per: 1,
      batches: 500,
      batch: 20,
      run() {
        const operationId = `op-${String(sequence++)}`;
        observer.settle(observer.begin({ operation: 'render', operationId }), result);
        observer.receiveFacts(operationId, facts);
      },
      done() {
        observer.workerGone();
        observer.dispose();
      },
    },
    {
      label: 'observedHeapBytes hook',
      bound: heapHookBound,
      per: 1,
      batches: 500,
      batch: 1000,
      run() {
        sink += observedHeapBytes() ?? 0;
      },
      done() {
        if (sink <= 0) {
          throw new Error('The heap hook read nothing.');
        }
      },
    },
  ];
};

/** One measurement's result. */
export type FactsVerdict = Readonly<{
  label: string;
  bound: number;
  hardCeiling: number;
  /** The gate's value: the median of the sample p95s, per call or per span. */
  p95: number;
  /** Timed batches behind each sample. */
  batchesPerSample: number;
  /** One entry per sample: that sample's p95 and median. */
  p95s: Distribution;
  medians: Distribution;
  blocking: readonly string[];
  relative: readonly string[];
}>;

/**
 * Run the operation-facts benches.
 *
 * @param options - The bench options.
 * @param enforce - Whether the design bounds block.
 * @returns The report and whether it passed.
 */
export const runOperationFactsBench = (
  options: BenchOptions,
  enforce: boolean,
): Readonly<{ passed: boolean; report: Record<string, unknown> }> => {
  const samples = options.mode === 'quick' ? 1 : options.mode === 'full' ? 5 : options.samples;
  const verdicts: FactsVerdict[] = [];
  let passed = true;
  for (const measurement of measurements()) {
    const p95s: number[] = [];
    const medians: number[] = [];
    for (let index = 0; index < samples; index++) {
      const timings = time(measurement.run, measurement.batches, measurement.batch);
      p95s.push(percentile(timings, 0.95) / measurement.per);
      medians.push(median(timings) / measurement.per);
    }
    measurement.done?.();
    const p95 = median(p95s);
    const hardCeiling = measurement.bound * hardFactor;
    const blocking =
      p95 < hardCeiling ? [] : [`p95 ${p95.toFixed(0)} ns reaches the hard ceiling ${String(hardCeiling)}`];
    const relative = p95 <= measurement.bound ? [] : [`p95 ${p95.toFixed(0)} ns exceeds ${String(measurement.bound)}`];
    const failed = blocking.length > 0 || (enforce && relative.length > 0);
    passed &&= !failed;
    verdicts.push({
      label: measurement.label,
      bound: measurement.bound,
      hardCeiling,
      p95,
      batchesPerSample: measurement.batches,
      p95s: distribution(p95s),
      medians: distribution(medians),
      blocking,
      relative,
    });
    log(
      `[facts-bench] ${enforce ? 'gate' : 'advisory'} ${failed ? 'FAIL' : 'ok'}: ${measurement.label}: ` +
        `p95 ${p95.toFixed(0)} ns (bound ${String(measurement.bound)} ns; ${String(samples)} samples of ` +
        `${String(measurement.batches)} batches; median ${median(medians).toFixed(0)} ns)`,
    );
  }
  return {
    passed,
    report: {
      bench: 'operation-facts',
      mode: options.mode,
      settings: { samplesPerShape: samples },
      gate: { bounds: enforce ? 'enforce' : 'advisory', hardFactor },
      environment: benchEnvironment(),
      passed,
      shapes: verdicts,
    },
  };
};
