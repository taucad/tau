// @vitest-environment node
/* oxlint-disable typescript/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any. */
import { describe, expect, it } from 'vitest';
import { esbuildBundler } from '@taucad/esbuild';
import { occtTriangleBudgets } from '@taucad/occt-core';
import { assertRenderingSuccess, createTestGeometry } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { replicadKernel } from '#replicad.kernel.js';
import { replicadOptionsSchema } from '#replicad.schemas.js';

const sphere = `import { makeSphere } from 'replicad';
export default function main() { return makeSphere(5); }`;

// D-RT-05 / D-GFX-10: the preview budget was the same 2,000,000 triangles on a phone as on a desktop.
describe('Replicad host memory budget', { timeout: 120_000 }, () => {
  it('defaults to the policy preview budget', () => {
    expect(replicadOptionsSchema.parse({})).toMatchObject({ previewTriangleBudget: occtTriangleBudgets.preview });
  });

  it("coarsens a preview to the host's previewTriangleBudget and reports it", async () => {
    const previewTriangleBudget = 200;
    const rendering = await createTestGeometry({
      runtime: defineRuntime({ kernels: [replicadKernel({ previewTriangleBudget })], bundlers: [esbuildBundler()] }),
      files: { 'main.ts': sphere },
      open: { source: { path: 'main.ts' } },
    });
    assertRenderingSuccess(rendering);
    expect(rendering.artifact.tessellation?.downgraded).toBeGreaterThanOrEqual(1);
    expect(rendering.issues).toContainEqual(
      expect.objectContaining({
        code: 'TESSELLATION_DOWNGRADED',
        details: expect.objectContaining({ budget: previewTriangleBudget }),
      }),
    );
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
