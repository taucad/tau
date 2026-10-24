import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compileParameterManifest } from '@taucad/parameters';
import type { ParameterDeclaration, ParameterManifest } from '@taucad/parameters';
import { contentDigest } from '@taucad/cache-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  heapFacts,
  operationRootNames,
  parameterFacts,
  phaseOfSpan,
  ResidentSampler,
  settleWithin,
  workerFactsFromEntries,
} from '#framework/operation-facts.js';
import { RuntimeTracer } from '#framework/runtime-tracer.js';
import { WorkerTelemetryCollector } from '#framework/worker-telemetry.js';
import type { RuntimePhase } from '#types/runtime-observation.types.js';
import { workerOperationFactsSchema } from '#types/runtime-wire-common.schemas.js';
import type { TelemetryEntry } from '#types/runtime-wire.types.js';

/** One span of a chain: its own time in milliseconds and its children, run in order. */
type Step = Readonly<{ name: string; self: number; children?: readonly Step[] }>;

const wrap = (name: string, self: number, children: readonly Step[]): Step => ({
  name: `middleware.wrap(${name})`,
  self,
  children,
});

/**
 * Record a chain through the real tracer and collector, on a controlled clock.
 *
 * @param operation - The root's operation.
 * @param steps - The root's children.
 * @returns The collector's slice for the operation and the root's span id.
 */
const record = (
  operation: string,
  steps: readonly Step[],
): { entries: readonly TelemetryEntry[]; rootSpanId: string } => {
  let clock = 1000;
  const now = vi.spyOn(performance, 'now').mockImplementation(() => clock);
  try {
    const collector = new WorkerTelemetryCollector(() => undefined);
    const tracer = new RuntimeTracer();
    tracer.setEntrySink((entry) => {
      collector.collect(entry);
    });
    const mark = collector.beginOperation();
    const run = (step: Step): void => {
      const span = tracer.startSpan(step.name);
      clock += step.self / 2;
      for (const child of step.children ?? []) {
        run(child);
      }
      clock += step.self / 2;
      span.end();
    };
    run({ name: `kernel.${operation}`, self: 1, children: steps });
    const entries = collector.operationEntries(mark)!;
    const root = entries.find((entry) => entry.name === `kernel.${operation}`)!;
    return { entries, rootSpanId: String(root.detail?.['spanId']) };
  } finally {
    now.mockRestore();
  }
};

/* The four real chains, as `kernel-worker.ts` starts them with the hooks the first-party middleware implement. */
const chains = {
  describe: [
    { name: 'kernel.resolve-deps', self: 2 },
    wrap('ParameterUnits', 3, [wrap('ParameterCache', 4, [{ name: 'kernel.extract-params', self: 5 }])]),
  ],
  evaluate: [
    { name: 'kernel.resolve-deps', self: 2 },
    wrap('ParameterFileResolver', 1, [
      wrap('GeometryCache', 3, [
        {
          name: 'kernel.compute',
          self: 4,
          children: [
            { name: 'kernel.bundle', self: 5, children: [{ name: 'fs.read', self: 1 }] },
            { name: 'kernel.execute', self: 6 },
          ],
        },
      ]),
    ]),
    { name: 'kernel.compute.reuse', self: 0.5 },
  ],
  render: [
    {
      name: 'kernel.mesh',
      self: 1,
      children: [
        wrap('GeometryCache', 2, [
          wrap('GltfEdgeDetection', 3, [wrap('DisplaySimplification', 4, [{ name: 'kernel.mesh-compute', self: 5 }])]),
        ]),
      ],
    },
  ],
  export: [
    { name: 'kernel.export-reheat', self: 2 },
    { name: 'kernel.resolve-deps', self: 1 },
    wrap('GeometryCache', 3, [wrap('GltfEdgeDetection', 2, [{ name: 'kernel.export-compute', self: 7 }])]),
  ],
} satisfies Record<string, readonly Step[]>;

const sum = (phases: Partial<Record<RuntimePhase, number>>): number =>
  Object.values(phases).reduce((total, value) => total + value, 0);

/* Spans are collected as they end, so `ran` lists the innermost wrap first. */
describe('workerFactsFromEntries on the real chains', () => {
  it.each(Object.keys(chains) as Array<keyof typeof chains>)(
    'should keep every phase non-negative, inside the root and free of wrap time on %s',
    (operation) => {
      const { entries, rootSpanId } = record(operation, chains[operation]);
      const root = entries.find((entry) => String(entry.detail?.['spanId']) === rootSpanId)!;
      const facts = workerFactsFromEntries(entries, rootSpanId);
      for (const value of Object.values(facts.phases ?? {})) {
        expect(value).toBeGreaterThanOrEqual(0);
      }
      expect(sum(facts.phases ?? {}) + (facts.middleware?.total ?? 0)).toBeLessThanOrEqual(root.duration + 1e-9);
    },
  );

  it('should attribute the describe chain: prepare from resolve-deps, resolve from extract-params', () => {
    const { entries, rootSpanId } = record('describe', chains.describe);
    expect(workerFactsFromEntries(entries, rootSpanId)).toEqual({
      phases: { prepare: 2, resolve: 5 },
      middleware: { total: 7, slowestId: 'ParameterCache', slowest: 4, ran: ['ParameterCache', 'ParameterUnits'] },
    });
  });

  it('should attribute bundle and execute inside compute once, and reuse from the deferred span', () => {
    const { entries, rootSpanId } = record('evaluate', chains.evaluate);
    const facts = workerFactsFromEntries(entries, rootSpanId);
    expect(facts.phases).toEqual({ prepare: 2, compute: 16, reuse: 0.5 });
    expect(facts.middleware).toEqual({
      total: 4,
      slowestId: 'GeometryCache',
      slowest: 3,
      ran: ['GeometryCache', 'ParameterFileResolver'],
    });
  });

  it('should subtract nested render wraps from mesh, counting mesh-compute inside mesh once', () => {
    const { entries, rootSpanId } = record('render', chains.render);
    const facts = workerFactsFromEntries(entries, rootSpanId);
    expect(facts.phases).toEqual({ mesh: 6 });
    expect(facts.middleware).toEqual({
      total: 9,
      slowestId: 'DisplaySimplification',
      slowest: 4,
      ran: ['DisplaySimplification', 'GltfEdgeDetection', 'GeometryCache'],
    });
  });

  it('should count wraps directly under the export root in middleware alone', () => {
    const { entries, rootSpanId } = record('export', chains.export);
    const facts = workerFactsFromEntries(entries, rootSpanId);
    expect(facts.phases).toEqual({ export: 9, prepare: 1 });
    expect(facts.middleware?.total).toBe(5);
    expect(facts.middleware?.slowestId).toBe('GeometryCache');
  });

  it('should ignore a deferred span of an earlier operation that landed in the slice', () => {
    const { entries, rootSpanId } = record('describe', chains.describe);
    const stray: TelemetryEntry = {
      name: 'kernel.compute.reuse',
      startTime: 0,
      duration: 50,
      detail: { spanId: 'stray', parentSpanId: 'an-earlier-root' },
      workerTimeOrigin: 0,
    };
    expect(workerFactsFromEntries([stray, ...entries], rootSpanId).phases).toEqual({ prepare: 2, resolve: 5 });
  });

  it('should report a slowest third-party wrap as _OTHER, never its own name', () => {
    const vendor = `Vendor${'X'.repeat(200)}`;
    const entries: TelemetryEntry[] = [
      { name: 'kernel.evaluate', startTime: 0, duration: 10, detail: { spanId: '1' }, workerTimeOrigin: 0 },
      {
        name: `middleware.wrap(${vendor})`,
        startTime: 0,
        duration: 6,
        detail: { spanId: '2', parentSpanId: '1' },
        workerTimeOrigin: 0,
      },
      {
        name: 'middleware.wrap(GeometryCache)',
        startTime: 0,
        duration: 1,
        detail: { spanId: '3', parentSpanId: '1' },
        workerTimeOrigin: 0,
      },
    ];
    const facts = workerFactsFromEntries(entries, '1');
    expect(facts.middleware).toMatchObject({ slowestId: '_OTHER', slowest: 6 });
    expect(
      workerOperationFactsSchema.safeParse({ queue: 0, execution: 10, cold: false, reuse: 'none', ...facts }).success,
    ).toBe(true);
  });

  it('should close third-party middleware names to _OTHER once in ran, and carry the bundler id', () => {
    const entries: TelemetryEntry[] = [
      { name: 'kernel.evaluate', startTime: 0, duration: 10, detail: { spanId: '1' }, workerTimeOrigin: 0 },
      {
        name: 'middleware.wrap(VendorA)',
        startTime: 0,
        duration: 1,
        detail: { spanId: '2', parentSpanId: '1' },
        workerTimeOrigin: 0,
      },
      {
        name: 'middleware.wrap(VendorB)',
        startTime: 0,
        duration: 1,
        detail: { spanId: '3', parentSpanId: '1' },
        workerTimeOrigin: 0,
      },
      {
        name: 'kernel.bundle',
        startTime: 0,
        duration: 2,
        detail: { spanId: '4', parentSpanId: '1', 'bundler.id': 'esbuild' },
        workerTimeOrigin: 0,
      },
    ];
    const facts = workerFactsFromEntries(entries, '1');
    expect(facts.middleware?.ran).toEqual(['_OTHER']);
    expect(facts.bundler).toBe('esbuild');
  });
});

describe('phaseOfSpan', () => {
  const frameworkDirectory = resolve(import.meta.dirname);
  const sites = new Set<string>();
  for (const file of readdirSync(frameworkDirectory)) {
    if (!file.endsWith('.ts') || /\.(?:test|bench\.test|test-d)\.ts$/u.test(file) || file === 'operation-facts.ts') {
      continue;
    }
    const source = readFileSync(join(frameworkDirectory, file), 'utf8');
    for (const match of source.matchAll(/startSpan\(\s*'(kernel\.[\w.-]+)'/gu)) {
      sites.add(match[1]!);
    }
  }

  it('should name a phase for every non-root kernel span the framework starts', () => {
    const missing = [...sites].filter((name) => !operationRootNames.has(name) && !phaseOfSpan.has(name));
    expect(missing).toEqual([]);
  });

  it('should name no span that no framework site starts', () => {
    expect([...phaseOfSpan.keys()].filter((name) => !sites.has(name))).toEqual([]);
  });

  it('should list the background publication span as reuse', () => {
    expect(phaseOfSpan.get('kernel.compute.publication')).toBe('reuse');
  });
});

const digest = contentDigest({ value: `sha256:${'1'.repeat(64)}` });
const compile = async (declaration: ParameterDeclaration): Promise<ParameterManifest> =>
  compileParameterManifest({
    declaration,
    scope: { kind: 'source', authority: 'filesystem', root: '/project', entry: '/project/model.ts' },
    source: { id: 'fixture-kernel', version: '1.0.0', revision: digest, capability: 'json-structure' },
    dependency: digest,
    middleware: digest,
    resolution: {},
    sourceFiles: {},
  });
const structure = (properties: Record<string, unknown>, required: readonly string[] = []) => ({
  $schema: 'https://json-structure.org/meta/extended/v0/#',
  $id: 'urn:taucad:test:observation',
  $uses: ['JSONSchemaUnits'],
  name: 'ObservationParameters',
  type: 'object',
  properties,
  required,
});
/** A manifest-shaped object; `parameterFacts` reads only the bindings and the defaults. */
const shaped = (bindings: Record<string, Record<string, unknown>>, defaults: Record<string, unknown>) =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- parameterFacts reads only bindings and defaults; the fixture is a partial manifest.
  ({ bindings, defaults }) as unknown as ParameterManifest;

describe('parameterFacts', () => {
  it('should count nested unit defaults and their overrides', async () => {
    const manifest = await compile({
      schema: structure(
        {
          dimensions: {
            type: 'object',
            properties: { width: { type: 'double', ucumUnit: 'mm' }, height: { type: 'double', ucumUnit: 'mm' } },
            required: ['width', 'height'],
          },
        },
        ['dimensions'],
      ),
      defaults: { dimensions: { width: 20, height: 14 } },
      bindings: {},
    });
    expect(parameterFacts(manifest, manifest.defaults)).toMatchObject({ declared: 2, modified: 0 });
    expect(parameterFacts(manifest, { dimensions: { width: 21, height: 14 } })).toMatchObject({
      declared: 2,
      modified: 1,
      features: ['units'],
    });
  });

  it('should count array members once each and report the array and decimal features', async () => {
    const manifest = await compile({
      schema: structure({
        opaque: { type: 'double' },
        exact: { type: 'decimal' },
        samples: { type: 'array', items: { type: 'double', ucumUnit: 'mm' } },
      }),
      defaults: { opaque: 2, exact: '0.1234567890123456789', samples: [1, 2] },
      bindings: {},
    });
    const facts = parameterFacts(manifest, { opaque: 2, exact: '0.5', samples: [1, 2, 3] });
    expect(facts).toMatchObject({ declared: 5, modified: 2 });
    expect(new Set(facts.features)).toEqual(new Set(['units', 'decimal', 'array']));
  });

  it('should count a 44-leaf structured fixture with structured leaves compared canonically', () => {
    const bindings: Record<string, Record<string, unknown>> = {};
    const defaults: Record<string, unknown> = {};
    const values: Record<string, unknown> = {};
    for (let index = 0; index < 40; index++) {
      bindings[`/p${String(index)}`] = { representation: 'binary64' };
      defaults[`p${String(index)}`] = index;
      values[`p${String(index)}`] = index < 3 ? index + 1 : index;
    }
    for (let index = 0; index < 4; index++) {
      bindings[`/s${String(index)}`] = { representation: 'binary64' };
      defaults[`s${String(index)}`] = { b: 1, a: [1, 2] };
      values[`s${String(index)}`] = index === 0 ? { a: [1, 3], b: 1 } : { a: [1, 2], b: 1 };
    }
    expect(parameterFacts(shaped(bindings, defaults), values)).toEqual({
      declared: 44,
      modified: 4,
      features: ['structured'],
    });
  });

  it('should count an over-budget structured leaf as unknown without truncating', () => {
    const big = { text: 'x'.repeat(2048) };
    const facts = parameterFacts(shaped({ '/big': {}, '/n': {} }, { big, n: 1 }), { big: { ...big }, n: 2 });
    expect(facts).toMatchObject({ declared: 2, modified: 1, unknown: 1 });
    expect(facts).not.toHaveProperty('truncated');
  });

  it('should stop a 5,000-leaf sweep at 1,000 leaves and say so', () => {
    const sweep = Array.from({ length: 5000 }, (_, index) => index);
    const started = performance.now();
    const facts = parameterFacts(shaped({ '/values/*': {} }, { values: sweep }), { values: sweep.map((v) => v + 1) });
    expect(performance.now() - started).toBeLessThan(50);
    expect(facts.truncated).toBe(true);
    expect(facts.declared).toBeLessThanOrEqual(1000);
  });
});

describe('heapFacts', () => {
  it('should prefer the observation hook, then the recycling hook, never a thread realm resident set', () => {
    expect(
      heapFacts({
        observedHeapBytes: () => 64,
        heapBytes: () => 32,
        observesChild: false,
        realm: 'web-worker',
        resident: () => 1,
      }),
    ).toEqual({ heapBytes: 64, heapSource: 'kernel', realm: 'web-worker' });
    expect(
      heapFacts({
        observedHeapBytes: undefined,
        heapBytes: () => 32,
        observesChild: false,
        realm: 'node-worker',
        resident: () => 1,
      }),
    ).toEqual({ heapBytes: 32, heapSource: 'kernel', realm: 'node-worker' });
    for (const realm of ['web-worker', 'node-worker', 'in-process'] as const) {
      expect(
        heapFacts({
          observedHeapBytes: undefined,
          heapBytes: undefined,
          observesChild: false,
          realm,
          resident: () => 9,
        }),
      ).toEqual({ heapSource: 'none', realm });
    }
  });

  it('should report the resident set only where the worker owns its process, and none for a native kernel', () => {
    const base = { observedHeapBytes: undefined, heapBytes: undefined, resident: () => 4096 };
    expect(heapFacts({ ...base, observesChild: false, realm: 'utility' })).toEqual({
      heapBytes: 4096,
      heapSource: 'resident',
      realm: 'utility',
    });
    expect(heapFacts({ ...base, observesChild: true, realm: 'process' })).toEqual({
      heapSource: 'none',
      realm: 'process',
    });
  });

  it('should survive a throwing or non-finite hook', () => {
    expect(
      heapFacts({
        observedHeapBytes: () => {
          throw new Error('gone');
        },
        heapBytes: undefined,
        observesChild: false,
        realm: 'web-worker',
        resident: () => undefined,
      }),
    ).toEqual({ heapSource: 'none', realm: 'web-worker' });
    expect(
      heapFacts({
        observedHeapBytes: () => Number.NaN,
        heapBytes: undefined,
        observesChild: false,
        realm: 'web-worker',
        resident: () => undefined,
      }),
    ).toEqual({ heapSource: 'none', realm: 'web-worker' });
  });
});

describe('ResidentSampler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should take its first sample off the settle path and linger a minute after idle', () => {
    vi.useFakeTimers();
    const read = vi.fn(() => 1234);
    const sampler = new ResidentSampler(read);
    sampler.start();
    expect(read).not.toHaveBeenCalled();
    expect(sampler.latest()).toBeUndefined();
    vi.advanceTimersByTime(0);
    expect(sampler.latest()).toBe(1234);
    sampler.idle();
    vi.advanceTimersByTime(59_000);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    vi.advanceTimersByTime(1000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('settleWithin', () => {
  it('should resolve undefined after the bound or on a rejected read', async () => {
    await expect(settleWithin(Promise.resolve(5), 50)).resolves.toBe(5);
    await expect(settleWithin(Promise.reject(new Error('read failed')), 50)).resolves.toBeUndefined();
    const never = new Promise<number>(() => {
      // Never settles.
    });
    await expect(settleWithin(never, 5)).resolves.toBeUndefined();
  });
});
