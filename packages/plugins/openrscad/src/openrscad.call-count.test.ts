// @vitest-environment node
/**
 * Call-count regression tests for the OpenRSCAD kernel's render-with-edges and export paths
 * (cad-performance-policy Rule 3; wasm-kernel-call-batching-policy-blueprint P3, P4), and its
 * engine call tracing.
 *
 * The engine is driven through coarse calls: one `renderToGlb` per mesh and one `exportShape3D`
 * per export, each returning a whole artifact. The tests spy on the engine the kernel loads and
 * assert that the count does not change when the model grows.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import * as engine from '@taulabs/openrscad-engine';
import type { TelemetryEntry } from '@taucad/runtime/types';
import { assertRenderingSuccess, createTestRuntimeClient } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { createOpenrscadKernel } from '#openrscad.kernel.js';

vi.setConfig({ testTimeout: 60_000 });

/** A row of `count` spheres: triangles grow with the count, calls should not. */
const spheresSource = (count: number): string =>
  `$fn = 24; for (i = [0 : ${count - 1}]) translate([i * 30, 0, 0]) sphere(10);`;

const testClients = new Set<{ shutdown(): Promise<void> }>();

afterEach(async () => {
  await Promise.all([...testClients].map(async (client) => client.shutdown()));
  testClients.clear();
});

type Counts = Record<string, number>;

/**
 * Await an export and assert it succeeded.
 * @param pending - The export in flight.
 */
const expectExported = async (pending: Promise<{ success: boolean }>): Promise<void> => {
  const exported = await pending;
  expect(exported.success).toBe(true);
};

/** An engine whose calls are counted, for the kernel to load. */
const spiedEngine = (): { backend: typeof engine; read: () => Counts } => {
  const backend = { ...engine };
  const names = ['parameters', 'renderToGlb', 'exportShape3D', 'cacheStats', 'clearCache'] as const;
  const spies: Record<string, MockInstance> = Object.fromEntries(names.map((name) => [name, vi.spyOn(backend, name)]));
  return {
    backend,
    read: () => Object.fromEntries(Object.entries(spies).map(([name, spy]) => [name, spy.mock.calls.length])),
  };
};

type Measured = { evaluate: Counts; render: Counts; glb: Counts; threeMf: Counts };

/** Count the engine calls of an evaluation, a render with edges, a GLB export with edges and a 3MF export. */
const measureSpheres = async (count: number): Promise<Measured> => {
  const { backend, read } = spiedEngine();
  const client = createTestRuntimeClient({
    runtime: defineRuntime({ kernels: [createOpenrscadKernel({ loadBackend: async () => backend })()] }),
    files: { 'main.scad': spheresSource(count) },
  });
  testClients.add(client);
  const delta = (() => {
    let last: Counts = read();
    return (): Counts => {
      const now = read();
      const change = Object.fromEntries(Object.entries(now).map(([name, calls]) => [name, calls - (last[name] ?? 0)]));
      last = now;
      return change;
    };
  })();

  const document = client.open({ source: { path: 'main.scad' }, watch: false });
  const evaluated = await document.evaluation();
  expect(evaluated.superseded).toBe(false);
  const evaluate = delta();

  const view = document.view('model', { content: { includeEdges: true } });
  const outcome = await view.rendering();
  view.close();
  if (outcome.superseded) {
    throw new Error('render was superseded');
  }
  assertRenderingSuccess(outcome.rendering);
  const render = delta();

  await expectExported(document.export('glb', { content: { includeEdges: true } }));
  const glb = delta();
  await expectExported(document.export('3mf'));
  const threeMf = delta();
  document.close();
  return { evaluate, render, glb, threeMf };
};

describe('OpenRSCAD kernel call counts', () => {
  it('should make one engine call per evaluation, render and export, whatever the model size', async () => {
    const small = await measureSpheres(1);
    const large = await measureSpheres(6);

    const none = { parameters: 0, renderToGlb: 0, exportShape3D: 0, cacheStats: 0, clearCache: 0 };
    const expected: Measured = {
      // Opening reads the customizer parameters once; a first evaluation reads the geometry cache's size
      // and clears it for the new entry file.
      evaluate: { ...none, parameters: 1, renderToGlb: 1, cacheStats: 1, clearCache: 1 },
      render: { ...none, renderToGlb: 1 },
      glb: { ...none, exportShape3D: 1 },
      threeMf: { ...none, exportShape3D: 1 },
    };
    expect(small).toEqual(expected);
    expect(large).toEqual(expected);
  });
});

describe('OpenRSCAD engine call tracing', () => {
  /** Telemetry is posted after each operation's reply; give the batch time to arrive. */
  const settleTelemetry = async (): Promise<void> =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });

  const renderTraced = async (libraryTracing?: 'off' | 'summary' | 'per-call'): Promise<TelemetryEntry[]> => {
    const telemetry: TelemetryEntry[] = [];
    const client = createTestRuntimeClient({
      runtime: defineRuntime({
        kernels: [createOpenrscadKernel()(libraryTracing === undefined ? undefined : { libraryTracing })],
      }),
      files: { 'main.scad': spheresSource(2) },
    });
    testClients.add(client);
    client.on('telemetry', (batch) => {
      telemetry.push(...batch.entries);
    });
    const document = client.open({ source: { path: 'main.scad' }, watch: false });
    const view = document.view('model', { content: { includeEdges: true } });
    const outcome = await view.rendering();
    view.close();
    document.close();
    if (outcome.superseded) {
      throw new Error('render was superseded');
    }
    assertRenderingSuccess(outcome.rendering);
    await settleTelemetry();
    return telemetry;
  };

  it('should count engine calls in a summary after describe and under each engine span', async () => {
    const telemetry = await renderTraced('summary');

    const summaries = telemetry.filter((entry) => entry.name === 'openrscad.library.summary');
    expect(summaries.map((entry) => entry.detail)).toEqual([
      expect.objectContaining({ library: 'openrscad', 'parameters.calls': 1, 'total.calls': 1 }),
      expect.objectContaining({
        library: 'openrscad',
        'cacheStats.calls': 1,
        'clearCache.calls': 1,
        'renderToGlb.calls': 1,
        'total.calls': 3,
      }),
      expect.objectContaining({ library: 'openrscad', 'renderToGlb.calls': 1, 'total.calls': 1 }),
    ]);
    const parents = new Map(telemetry.map((entry) => [entry.detail?.['spanId'], entry.name]));
    expect(summaries.slice(1).map((entry) => parents.get(entry.detail?.['parentSpanId']))).toEqual([
      'openrscad.export-3d',
      'openrscad.export-3d-edges',
    ]);
  });

  it('should emit one span per engine call in per-call mode', async () => {
    const telemetry = await renderTraced('per-call');

    expect(telemetry.filter((entry) => entry.name.startsWith('openrscad.library.')).map((entry) => entry.name)).toEqual(
      [
        'openrscad.library.parameters',
        'openrscad.library.cacheStats',
        'openrscad.library.clearCache',
        'openrscad.library.renderToGlb',
        'openrscad.library.renderToGlb',
      ],
    );
  });

  it('should emit no engine telemetry when tracing is off', async () => {
    const telemetry = await renderTraced();

    expect(telemetry.filter((entry) => entry.name.startsWith('openrscad.library.'))).toHaveLength(0);
  });
});
