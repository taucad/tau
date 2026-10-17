// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { esbuildBundler } from '@taucad/esbuild';
import { occtTriangleBudgets } from '@taucad/occt-core';
import { assertRenderingSuccess, createTestGeometry } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { opencascadeKernel } from '#opencascade.kernel.js';
import { opencascadeOptionsSchema } from '#opencascade.schemas.js';

const sphere = `import { BRepPrimAPI_MakeSphere } from 'libcascade';
export default function main() { return new BRepPrimAPI_MakeSphere(5).Shape(); }`;

// D-RT-05 / D-GFX-10: the preview budget was the same 2,000,000 triangles on a phone as on a desktop.
describe('OpenCascade host preview budget', { timeout: 120_000 }, () => {
  it('defaults to the policy preview budget', () => {
    expect(opencascadeOptionsSchema.parse({})).toMatchObject({ previewTriangleBudget: occtTriangleBudgets.preview });
  });

  it("coarsens a preview to the host's previewTriangleBudget and reports it", async () => {
    const previewTriangleBudget = 200;
    const rendering = await createTestGeometry({
      runtime: defineRuntime({
        kernels: [opencascadeKernel({ previewTriangleBudget })],
        bundlers: [esbuildBundler()],
      }),
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
});
