// @vitest-environment node
/**
 * Call-count regression tests for the Manifold kernel's render and GLB export paths
 * (cad-performance-policy Rule 3; wasm-kernel-call-batching-policy-blueprint P3, P4), and its
 * user-code library tracing.
 *
 * Manifold renders and exports by running the model again at the requested circular detail, then
 * writing the returned glTF nodes. The tests spy on the manifold-3d methods that path calls on
 * every Manifold and count them, so a later change that lowers a count updates the number here.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import type { TelemetryEntry } from '@taucad/runtime/types';
import { assertRenderingSuccess, createTestRuntimeClient } from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import { manifoldKernel } from '#manifold.kernel.js';
import type { ManifoldOptions } from '#manifold.kernel.js';

vi.setConfig({ testTimeout: 30_000 });

/** `copies` glTF nodes that all share one cube: nodes grow with the parameter, sources stay one. */
const instancedCode = `
  import { GLTFNode, Manifold } from 'manifold-3d/manifoldCAD';

  export const defaultParams = { copies: 2 };

  export default function main(params: typeof defaultParams) {
    const cube = Manifold.cube([10, 10, 10], true);
    return Array.from({ length: params.copies }, (_, index) => {
      const node = new GLTFNode();
      node.manifold = cube;
      node.translation = [index * 20, 0, 0];
      return node;
    });
  }
`;

const tracedCode = `
  import { CrossSection, Manifold } from 'manifold-3d/manifoldCAD';
  export default function main() {
    const base = Manifold.cube([10, 10, 10], true);
    const pin = CrossSection.circle(2, 16).extrude(20);
    return base.subtract(pin).add(Manifold.sphere(3, 16));
  }
`;

const testClients = new Set<ReturnType<typeof createClient>>();

const createClient = (
  files: Record<string, string>,
  options?: ManifoldOptions & { readonly telemetry?: TelemetryEntry[] },
) => {
  const { telemetry, ...kernelOptions } = options ?? {};
  const client = createTestRuntimeClient({
    runtime: defineRuntime({ kernels: [manifoldKernel(kernelOptions)], bundlers: [esbuildBundler()] }),
    files,
  });
  if (telemetry) {
    client.on('telemetry', (batch) => {
      telemetry.push(...batch.entries);
    });
  }
  testClients.add(client);
  return client;
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([...testClients].map(async (client) => client.shutdown()));
  testClients.clear();
});

type Counts = Record<string, number>;

/**
 * Spy on the Manifold instance methods the render path calls. manifold-3d's setup replaces
 * `Manifold` with a factory whose `prototype` instances never inherit, so the prototype comes
 * from an instance.
 * @returns A reader of the counts so far.
 */
const spyOnManifold = async (): Promise<() => Counts> => {
  const manifoldCad = await import('manifold-3d/manifoldCAD');
  // A static-constructor result: manifold-3d's own registry frees it at the kernel's next cleanup.
  const probe = manifoldCad.Manifold.tetrahedron();
  const prototype = Object.getPrototypeOf(probe) as typeof probe;
  const spies: Record<string, MockInstance> = {
    'Manifold.getMesh': vi.spyOn(prototype, 'getMesh'),
    'Manifold.calculateNormals': vi.spyOn(prototype, 'calculateNormals'),
    'Manifold.numProp': vi.spyOn(prototype, 'numProp'),
  };
  return () => Object.fromEntries(Object.entries(spies).map(([name, spy]) => [name, spy.mock.calls.length]));
};

type Measured = { render: Counts; glb: Counts };

/** Evaluate, then count the calls a render and a GLB export make. */
const measureInstanced = async (copies: number): Promise<Measured> => {
  const client = createClient({ 'main.ts': instancedCode });
  const document = client.open({ source: { path: 'main.ts' }, parameters: { copies }, watch: false });
  try {
    const evaluated = await document.evaluation();
    expect(evaluated.superseded).toBe(false);

    let read = await spyOnManifold();
    const view = document.view('model');
    const outcome = await view.rendering();
    view.close();
    if (outcome.superseded) {
      throw new Error('render was superseded');
    }
    assertRenderingSuccess(outcome.rendering);
    const render = read();
    vi.restoreAllMocks();

    read = await spyOnManifold();
    const exported = await document.export('glb');
    expect(exported.success).toBe(true);
    const glb = read();
    return { render, glb };
  } finally {
    vi.restoreAllMocks();
    document.close();
  }
};

describe('Manifold kernel call counts', () => {
  let small: Measured;
  let large: Measured;

  beforeAll(async () => {
    small = await measureInstanced(2);
    large = await measureInstanced(8);
  });

  it('should copy each source mesh once, however many glTF nodes share it, on the render and GLB export paths', () => {
    // Blueprint A11 (WP6, charter B5): `addMissingNormals` reads `getMesh().runOriginalID` and
    // `numProp()` once per source manifold, as `calculateNormals` already was, so the counts stay
    // flat as instanced nodes grow. manifold-3d's scene builder adds one cached `getMesh()` per
    // source, which makes two.
    expect({ small: small.render, large: large.render }).toEqual({
      small: { 'Manifold.getMesh': 2, 'Manifold.calculateNormals': 1, 'Manifold.numProp': 1 },
      large: { 'Manifold.getMesh': 2, 'Manifold.calculateNormals': 1, 'Manifold.numProp': 1 },
    });
    // The GLB export meshes the model through the same path.
    expect({ small: small.glb, large: large.glb }).toEqual({ small: small.render, large: large.render });
  });
});

describe('Manifold library call tracing', () => {
  /** Telemetry is posted after each operation's reply; give the batch time to arrive. */
  const settleTelemetry = async (): Promise<void> =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });

  const renderTraced = async (options?: ManifoldOptions): Promise<TelemetryEntry[]> => {
    const telemetry: TelemetryEntry[] = [];
    const client = createClient({ 'main.ts': tracedCode }, { ...options, telemetry });
    const document = client.open({ source: { path: 'main.ts' }, watch: false });
    const view = document.view('model');
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

  it('should count user-code calls per class in a summary after evaluation and render', async () => {
    const telemetry = await renderTraced({ libraryTracing: 'summary' });

    const summaries = telemetry.filter((entry) => entry.name === 'manifold.library.summary');
    // One summary for the evaluation and one for the render, which runs the model again.
    expect(summaries).toHaveLength(2);
    for (const summary of summaries) {
      expect(summary.detail).toMatchObject({
        library: 'manifold',
        'Manifold.cube.calls': 1,
        'Manifold.sphere.calls': 1,
        'CrossSection.circle.calls': 1,
        'total.calls': 3,
        'total.errors': 0,
      });
    }
  });

  it('should emit one span per user-code call in per-call mode', async () => {
    const telemetry = await renderTraced({ libraryTracing: 'per-call' });

    const names = telemetry
      .filter((entry) => entry.name.startsWith('manifold.library.'))
      .map((entry) => entry.name)
      .toSorted();
    // Each call once at evaluation and once more when the render runs the model again.
    expect(names).toEqual([
      'manifold.library.CrossSection.circle',
      'manifold.library.CrossSection.circle',
      'manifold.library.Manifold.cube',
      'manifold.library.Manifold.cube',
      'manifold.library.Manifold.sphere',
      'manifold.library.Manifold.sphere',
    ]);
  });

  it('should emit no library telemetry when tracing is off', async () => {
    const telemetry = await renderTraced();

    expect(telemetry.filter((entry) => entry.name.startsWith('manifold.library.'))).toHaveLength(0);
  });
});
