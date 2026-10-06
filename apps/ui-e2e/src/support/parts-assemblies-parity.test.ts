import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { Document, NodeIO } from '@gltf-transform/core';
import {
  assertOrdinaryParityDiagnostics,
  emittedParitySurfaceMaterials,
  emittedParitySurfaceNormals,
  parityDrawFrameEvidence,
} from '#support/parts-assemblies-parity.js';

function finiteParityDocument(alphaMode: 'OPAQUE' | 'BLEND' = 'OPAQUE') {
  const document = new Document();
  const buffer = document.createBuffer();
  const position = document
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const normal = document
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]))
    .setBuffer(buffer);
  const material = document
    .createMaterial()
    .setAlphaMode(alphaMode)
    .setBaseColorFactor([0.2, 0.4, 0.6, alphaMode === 'BLEND' ? 0.5 : 1]);
  const primitive = document
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normal)
    .setMaterial(material);
  const mesh = document.createMesh().addPrimitive(primitive);
  const scene = document.createScene().addChild(document.createNode().setMesh(mesh));
  document.getRoot().setDefaultScene(scene);
  return { document, normal, primitive };
}

describe('S13 parity evidence qualification', () => {
  it('distinguishes final composed shear from orthogonal positive scale using the actual normal operation', () => {
    const scale = new Matrix4().makeScale(2, 1, 1);
    const orthogonal = parityDrawFrameEvidence(scale.elements, [[1, 2, 3]]);
    expect(orthogonal.determinant).toBeGreaterThan(0);
    expect(orthogonal.normalizedDot).toBe(0);
    expect(orthogonal.normalCorrectionDistance).toBeLessThan(64 * Number.EPSILON);
    const shear = parityDrawFrameEvidence(scale.clone().multiply(new Matrix4().makeRotationZ(Math.PI / 4)).elements, [
      [1, 2, 3],
    ]);
    expect(shear.determinant).toBeGreaterThan(0);
    expect(shear.normalizedDot).toBeGreaterThan(0.5);
    expect(shear.normalCorrectionDistance).toBeGreaterThan(0.1);
    expect(parityDrawFrameEvidence(new Matrix4().makeScale(-1, 1, 1).elements, [[1, 2, 3]]).determinant).toBeLessThan(
      0,
    );
  });
  it('denies preparing, stale-root, wrong-file and missing imported geometry identity', () => {
    const settled = {
      projectId: 'actual-project',
      sourceEntryPath: 'parity/baseline.glb',
      sourceGeometryHash: 'actual-import',
      requestedKey: 'actual-import',
      presentedKey: 'actual-import',
      requestedRevision: 7,
      presentedRevision: 7,
      outcome: 'success',
      requestedRenderId: 9,
      settledRenderId: 9,
    };
    expect(assertOrdinaryParityDiagnostics(settled, settled.sourceEntryPath)).toBe('actual-import');
    for (const patch of [
      { requestedKey: 'next-root' },
      { presentedRevision: 6 },
      { sourceGeometryHash: undefined },
      { requestedRenderId: 10 },
      { outcome: 'failure' },
      { sourceEntryPath: 'different.glb' },
    ]) {
      expect(() => assertOrdinaryParityDiagnostics({ ...settled, ...patch }, settled.sourceEntryPath)).toThrow(
        'coherently committed',
      );
    }
  });

  it.each(['OPAQUE', 'BLEND'] as const)(
    'reads actual NodeIO-emitted float normals and %s material with default transmission',
    async (alphaMode) => {
      const { document } = finiteParityDocument(alphaMode);
      const bytes = await new NodeIO().writeBinary(document);
      const materials = await emittedParitySurfaceMaterials(bytes);
      const normals = await emittedParitySurfaceNormals(bytes);
      expect(materials).toEqual([
        {
          sourceMaterialIndex: 0,
          alphaMode,
          transmissionFactor: 0,
          baseColorFactor: [0.2, 0.4, 0.6, alphaMode === 'BLEND' ? 0.5 : 1],
        },
      ]);
      expect(normals).toEqual([
        [0, 0, 1],
        [0, 0, 1],
        [0, 0, 1],
      ]);
    },
  );

  it('rejects actual NodeIO-emitted normalized integer normals while its material remains readable', async () => {
    const { document, normal } = finiteParityDocument();
    normal.setArray(new Int16Array([0, 0, 32_767, 0, 0, 32_767, 0, 0, 32_767])).setNormalized(true);
    const bytes = await new NodeIO().writeBinary(document);
    const materials = await emittedParitySurfaceMaterials(bytes);
    expect(materials).toHaveLength(1);
    expect(materials[0]).toMatchObject({ alphaMode: 'OPAQUE', transmissionFactor: 0 });
    await expect(emittedParitySurfaceNormals(bytes)).rejects.toThrow(
      'Finite parity normal accessor does not match the actual float source owner.',
    );
  });

  it('rejects a real material-unbound triangle while retaining its actual float normal evidence', async () => {
    const { document, primitive } = finiteParityDocument();
    primitive.setMaterial(null);
    const bytes = await new NodeIO().writeBinary(document);
    const normals = await emittedParitySurfaceNormals(bytes);
    expect(normals).toEqual([
      [0, 0, 1],
      [0, 0, 1],
      [0, 0, 1],
    ]);
    await expect(emittedParitySurfaceMaterials(bytes)).rejects.toThrow(
      'Emitted parity source has no material-bound triangle primitive.',
    );
  });
});
