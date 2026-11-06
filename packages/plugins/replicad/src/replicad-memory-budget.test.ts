// @vitest-environment node
/* oxlint-disable typescript/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any. */
import { describe, expect, it } from 'vitest';
import { esbuildBundler } from '@taucad/esbuild';
import { assertRenderingSuccess, createMockKernelRuntime, createTestGeometry } from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { defineRuntime } from '@taucad/runtime/worker';
import { replicadKernel } from '#replicad.kernel.js';
import { replicadOptionsSchema } from '#replicad.schemas.js';

const sphere = `import { makeSphere } from 'replicad';
export default function main() { return makeSphere(5); }`;

// D1 (kernel budget program): no preview budget on any device. A host that still passes the deprecated option
// gets the requested tessellation, never a coarsened one.
describe('Replicad host memory budget', { timeout: 120_000 }, () => {
  it('has no default preview triangle budget', () => {
    expect(replicadOptionsSchema.parse({})).not.toHaveProperty('previewTriangleBudget');
  });

  it('renders a preview over the former previewTriangleBudget at the requested tessellation', async () => {
    const previewTriangleBudget = 200;
    const rendering = await createTestGeometry({
      runtime: defineRuntime({ kernels: [replicadKernel({ previewTriangleBudget })], bundlers: [esbuildBundler()] }),
      files: { 'main.ts': sphere },
      open: { source: { path: 'main.ts' } },
    });
    assertRenderingSuccess(rendering);
    const { tessellation } = rendering.artifact;
    expect(tessellation?.triangles).toBeGreaterThan(previewTriangleBudget);
    expect(tessellation).toMatchObject({ requested: 'medium' });
    expect(tessellation).not.toHaveProperty('downgraded');
    expect(rendering.issues).not.toContainEqual(expect.objectContaining({ code: 'TESSELLATION_DOWNGRADED' }));
  });

  // D-RT-03: a host can recycle a worker past its device's threshold only if each rendering says how large the
  // kernel's WebAssembly heap has grown; linear memory never shrinks.
  it('reports its WebAssembly heap on each rendering', async () => {
    const rendering = await createTestGeometry({
      runtime: defineRuntime({ kernels: [replicadKernel()], bundlers: [esbuildBundler()] }),
      files: { 'main.ts': sphere },
      open: { source: { path: 'main.ts' } },
    });
    assertRenderingSuccess(rendering);
    expect(rendering.heapBytes).toBeGreaterThan(16 * 2 ** 20);
  });
});

// T26 (PR-1b, AR-W15-01): the observation-only heap hook reads the same linear memory as the recycling hook, which
// stays exactly as it was.
describe('Replicad observed heap', { timeout: 120_000 }, () => {
  it('reports its WebAssembly memory after initialize, equal to the recycling hook', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', replicadKernel());
    const runtime = createMockKernelRuntime();
    const context = await definition.initialize(replicadOptionsSchema.parse({}), runtime);
    try {
      const observed = definition.observedHeapBytes?.(context);

      expect(Number.isSafeInteger(observed)).toBe(true);
      expect(observed).toBeGreaterThan(0);
      expect(observed).toBe(context.occt.value.wasmMemory.buffer.byteLength);
      expect(observed).toBe(definition.heapBytes?.(context));
    } finally {
      await definition.onDispose?.(context);
    }
  });
});
