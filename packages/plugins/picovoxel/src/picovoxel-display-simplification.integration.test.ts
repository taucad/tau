import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { esbuild } from '@taucad/esbuild';
import { displaySimplification } from '@taucad/middleware';
import type { KernelIssue } from '@taucad/runtime/types';
import { defineRuntime } from '@taucad/runtime/worker';
import { createTestRuntimeClient, glbToDocument } from '@taucad/runtime-testing';
import { picovoxel } from '@taucad/picovoxel';

/** A 20 mm gyroid ball at 0.5 mm voxels: tens of thousands of triangles. */
const source = `
import type { Pico } from 'picovoxel';
export const defaultParams = { voxelSize: 0.5 };
export default function main(pico: Pico) {
  const k = (2 * Math.PI) / 8;
  const gyroid = ['+',
    ['*', ['sin', ['*', 'x', k]], ['cos', ['*', 'y', k]]],
    ['*', ['sin', ['*', 'y', k]], ['cos', ['*', 'z', k]]],
    ['*', ['sin', ['*', 'z', k]], ['cos', ['*', 'x', k]]]];
  const sheet = ['-', ['/', ['abs', gyroid], 1.3 * k], 0.75];
  const ball = ['-', ['sqrt', ['+', ['*', 'x', 'x'], ['*', 'y', 'y'], ['*', 'z', 'z']]], 10];
  return pico.createVoxels({ shape: 'implicit', boundsMin: [-11, -11, -11], boundsMax: [11, 11, 11], sdf: ['max', sheet, ball] as never });
}
`;

const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

const renderAndExport = async (maxTriangles?: number) => {
  const client = createTestRuntimeClient({
    runtime: defineRuntime({
      plugins: [picovoxel({ kernels: { default: { wasm: 'serial' } } }), esbuild()],
      middleware: maxTriangles === undefined ? [] : [displaySimplification({ maxTriangles })],
    }),
  });
  const document = client.open({ source: { entry: 'main.ts', files: { 'main.ts': source } } });
  try {
    const outcome = await document.view('model').rendering();
    if (outcome.superseded || !outcome.rendering.success || typeof outcome.rendering.artifact.content === 'string') {
      throw new Error('Expected a GLB rendering');
    }
    const exports = await Promise.all(
      (['stl', 'glb'] as const).map(async (format) => {
        const exported = await document.export(format);
        if (!exported.success) {
          throw new Error(exported.issues.map(({ message }) => message).join('; '));
        }
        return [format, exported.files.map((file) => sha256(file.bytes))] as const;
      }),
    );
    return { rendering: outcome.rendering, exports };
  } finally {
    document.close();
  }
};

const triangleCount = async (bytes: Uint8Array<ArrayBuffer>): Promise<number> => {
  const document = await glbToDocument(bytes);
  return document
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce((sum, primitive) => sum + primitive.getIndices()!.getCount() / 3, 0);
};

describe('PicoVoxel display simplification through the real runtime', () => {
  it('should simplify an over-budget preview, report it, and leave voxelSize and exports exact', async () => {
    const full = await renderAndExport();
    const fullTessellation = full.rendering.artifact.tessellation!;
    const budget = Math.floor(fullTessellation.triangles / 2);

    const simplified = await renderAndExport(budget);

    const { artifact, issues } = simplified.rendering;
    const delivered = await triangleCount(artifact.content as Uint8Array<ArrayBuffer>);
    expect(delivered).toBeLessThan(fullTessellation.triangles);
    expect(artifact.tessellation).toMatchObject({ triangles: delivered, voxelSize: 0.5 });
    expect(artifact.tessellation!.vertices).toBeLessThan(fullTessellation.vertices);
    expect(issues.filter(({ code }) => code === 'DISPLAY_SIMPLIFIED')).toEqual([
      expect.objectContaining<Partial<KernelIssue>>({
        severity: 'warning',
        details: expect.objectContaining({
          from: fullTessellation.triangles,
          to: delivered,
          maxErrorMm: 0.25,
          voxelSize: 0.5,
          budget,
        }) as unknown,
      }),
    ]);
    expect(simplified.exports).toEqual(full.exports);
  });
});
