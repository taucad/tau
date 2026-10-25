// @vitest-environment node
/**
 * Byte locks for the exports and the render that native edges must not change: STL and STEP never
 * carry edges, and a GLB export or render without `includeEdges` stays as it was before the kernel
 * drew its own edges. The digests were recorded on `main` before the change; a libcascade upgrade or a
 * deliberate mesh change re-records them.
 */
import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { assertRenderingSuccess, createTestRuntimeClient } from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import { opencascadeKernel } from '#opencascade.kernel.js';

const model = `import { BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder, TopLoc_Location, gp_Trsf, gp_Vec } from 'libcascade';
export default function main() {
  const trsf = new gp_Trsf();
  trsf.SetTranslation(new gp_Vec(30, 0, 0));
  const box = new BRepPrimAPI_MakeBox(10, 20, 30).Shape().Moved(new TopLoc_Location(trsf), false);
  return [
    { shape: new BRepPrimAPI_MakeCylinder(5, 20).Shape(), name: 'Cylinder', color: '#3366cc' },
    { shape: box, name: 'Box' },
  ];
}`;

const tessellation = { linearTolerance: 0.1, angularTolerance: 15 };

const client = createTestRuntimeClient({
  runtime: defineRuntime({ kernels: [opencascadeKernel()], bundlers: [esbuildBundler()] }),
  files: { 'main.ts': model },
});
const document = client.open({ source: { path: 'main.ts' }, parameters: {} });

afterAll(async () => {
  await client.shutdown();
});

const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

/** STEP's header records when the file was written; everything after it is the geometry. */
const withoutStepTimestamp = (bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(new TextDecoder().decode(bytes).replace(/FILE_NAME\('[^']*','[^']*'/, "FILE_NAME('',''"));

const exportedFiles = async (format: 'stl' | 'step' | 'glb', options: Record<string, unknown>) => {
  const exported = await document.export(format, { options });
  if (!exported.success) {
    throw new Error(exported.issues.map((issue) => issue.message).join('; '));
  }
  return exported.files;
};

describe('OpenCascade export bytes', { timeout: 60_000 }, () => {
  it('should keep STL exports byte-identical', async () => {
    const files = await exportedFiles('stl', { tessellation });
    expect(files.map((file) => [file.name, sha256(file.bytes)])).toEqual([
      ['Cylinder.stl', 'd5c87568f4caa7c9dee676b28ab7d9e51d3e8830f2f20ee5cc3c0a96b423e3d8'],
      ['Box.stl', '9ca8b1260edf46f402d69d7f4ea6fb1aea4be86bc5ff309054eada945a3940c7'],
    ]);
  });

  it('should keep STEP exports byte-identical apart from the write time', async () => {
    const files = await exportedFiles('step', {});
    expect(files.map((file) => [file.name, sha256(withoutStepTimestamp(file.bytes))])).toEqual([
      ['assembly.step', '2b44023b78113cebe8af5f4ac7010de2285431da7a9c09b899bab025bcaee931'],
    ]);
  });

  it('should keep a GLB export without includeEdges byte-identical', async () => {
    const files = await exportedFiles('glb', { tessellation });
    expect(files.map((file) => [file.name, sha256(file.bytes)])).toEqual([
      ['model.glb', 'ca024aad5e402f9629360f01797847116c542ec587b8db9aaec87f8dc3d46210'],
    ]);
  });

  it('should keep a render without includeEdges byte-identical', async () => {
    const view = document.view('model', { options: { tessellation } });
    const outcome = await view.rendering();
    view.close();
    if (outcome.superseded) {
      throw new Error('Render was superseded');
    }
    assertRenderingSuccess(outcome.rendering);
    expect(sha256(outcome.rendering.artifact.content as Uint8Array<ArrayBuffer>)).toBe(
      'ca024aad5e402f9629360f01797847116c542ec587b8db9aaec87f8dc3d46210',
    );
  });
});
