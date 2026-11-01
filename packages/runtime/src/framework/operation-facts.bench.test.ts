/**
 * Operation-facts cost, advisory (T11 worker-facts and observation benches).
 *
 * Everything measured here runs only while a client observes, and only after the operation's terminal reply. The
 * bounds of the design (p95 ≤ 1,500 ns per span for the walk; `parameterFacts` p95 ≤ 15 µs at 50 leaves and ≤ 100 µs
 * on the truncated 5,000-leaf sweep; ≤ 2 µs per observation including the join; ≤ 100 ns for a kernel's heap hook,
 * T26) are reported on stderr and stay
 * advisory until calibrated on the runner that enforces them, which then sets `TAU_FACTS_BENCH_GATE=enforce`. A ceiling
 * ten times each bound always blocks, so a pathological regression cannot land.
 */

import type { ParameterManifest } from '@taucad/parameters';
import { describe, expect, it } from 'vitest';
import { ClientOperationObserver } from '#client/runtime-operation-observer.js';
import { parameterFacts, workerFactsFromEntries } from '#framework/operation-facts.js';
import { RuntimeTracer } from '#framework/runtime-tracer.js';
import { WorkerTelemetryCollector } from '#framework/worker-telemetry.js';
import type { TelemetryEntry } from '#types/runtime-wire.types.js';

const enforce = process.env['TAU_FACTS_BENCH_GATE'] === 'enforce';
const walkBound = 1500;
const parameterBound = 15_000;
const sweepBound = 100_000;
const observationBound = 2000;
const heapHookBound = 100;
const hardFactor = 10;

type Tracer = Pick<RuntimeTracer, 'startSpan'>;

const percentile = (values: readonly number[], fraction: number): number => {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!;
};

/**
 * Time one call repeatedly, in batches so a sample is well above the clock's resolution.
 *
 * @param run - The call.
 * @param samples - How many samples.
 * @param batch - Calls per sample.
 * @returns The p95 and median, in nanoseconds per call.
 */
const sample = (run: () => void, samples: number, batch = 20): Readonly<{ p95: number; median: number }> => {
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
  return { p95: percentile(timings, 0.95), median: percentile(timings, 0.5) };
};

/**
 * Report a measurement and gate it: advisory against the design bound, blocking at ten times it.
 *
 * @param label - What was measured.
 * @param value - The p95, in nanoseconds.
 * @param bound - The design bound, in nanoseconds.
 */
const gate = (label: string, value: number, bound: number): void => {
  process.stderr.write(`[facts-bench] ${label}: p95 ${value.toFixed(0)} ns (bound ${String(bound)} ns)\n`);
  expect(value).toBeLessThan(bound * hardFactor);
  if (enforce) {
    expect(value).toBeLessThanOrEqual(bound);
  }
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

const shaped = (bindings: Record<string, Record<string, unknown>>, defaults: Record<string, unknown>) =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- parameterFacts reads only bindings and defaults; the fixture is a partial manifest.
  ({ bindings, defaults }) as unknown as ParameterManifest;

describe('operation facts cost (advisory)', () => {
  it('should walk every shape within the per-span bound', () => {
    for (const shape of shapes) {
      const { entries, rootSpanId } = record(shape);
      const { p95 } = sample(() => {
        workerFactsFromEntries(entries, rootSpanId);
      }, 500);
      gate(`walk ${shape.name} (${String(entries.length)} spans) per span`, p95 / entries.length, walkBound);
    }
  });

  it('should count parameters within the leaf bounds', () => {
    const bindings: Record<string, Record<string, unknown>> = {};
    const defaults: Record<string, unknown> = {};
    const values: Record<string, unknown> = {};
    for (let index = 0; index < 46; index++) {
      bindings[`/p${String(index)}`] = { representation: 'binary64' };
      defaults[`p${String(index)}`] = index;
      values[`p${String(index)}`] = index % 5 === 0 ? index + 1 : index;
    }
    for (let index = 0; index < 4; index++) {
      bindings[`/s${String(index)}`] = {};
      defaults[`s${String(index)}`] = { b: 1, a: [1, 2] };
      values[`s${String(index)}`] = { a: [1, 2], b: index };
    }
    const fifty = shaped(bindings, defaults);
    gate('parameterFacts 50 leaves', sample(() => parameterFacts(fifty, values), 500).p95, parameterBound);

    const sweep = Array.from({ length: 5000 }, (_, index) => index);
    const sweepManifest = shaped({ '/values/*': {} }, { values: sweep });
    const swept = { values: sweep.map((value) => value + 1) };
    gate('parameterFacts 5,000-leaf sweep', sample(() => parameterFacts(sweepManifest, swept), 100, 5).p95, sweepBound);
  });

  it('should observe and join one attempt within the observation bound', () => {
    const observer = new ClientOperationObserver('web-worker');
    observer.onOperation(() => undefined);
    observer.observe('facts');
    observer.connected({ observation: ['facts'], sent: 'facts', send: () => undefined });
    const facts = { queue: 1, execution: 2, cold: false, reuse: 'computed' } as const;
    const result = { type: 'result', result: { success: true, issues: [] } } as const;
    let sequence = 0;
    const { p95 } = sample(() => {
      const operationId = `op-${String(sequence++)}`;
      observer.settle(observer.begin({ operation: 'render', operationId }), result);
      observer.receiveFacts(operationId, facts);
    }, 500);
    observer.workerGone();
    observer.dispose();
    gate('observation incl. join', p95, observationBound);
  });

  // T26 (FR-03): a kernel's `observedHeapBytes` is one property read of its linear memory, as brep's `HEAPU8` and
  // the PicoGK browser session's last reply are.
  it('should read a WebAssembly heap hook within the hook bound', () => {
    const memory = new WebAssembly.Memory({ initial: 16 });
    const view = new Uint8Array(memory.buffer);
    const observedHeapBytes = (): number | undefined => view.byteLength;
    let sink = 0;
    const { p95 } = sample(
      () => {
        sink += observedHeapBytes() ?? 0;
      },
      500,
      1000,
    );
    expect(sink).toBeGreaterThan(0);
    gate('observedHeapBytes hook', p95, heapHookBound);
  });
});
