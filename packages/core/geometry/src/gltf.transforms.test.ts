import { afterEach, describe, expect, it, vi } from 'vitest';
import { Document } from '@gltf-transform/core';

/** A document with one triangle, so the transforms have mesh data to move. */
const createTriangleDocument = (): Document => {
  const document = new Document();
  const buffer = document.createBuffer();
  const position = document
    .createAccessor()
    .setBuffer(buffer)
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  const primitive = document.createPrimitive().setAttribute('POSITION', position);
  document.createNode().setMesh(document.createMesh().addPrimitive(primitive));
  return document;
};

describe('gltf transforms load gltf-transform functions on first use', () => {
  afterEach(() => {
    vi.doUnmock('@gltf-transform/functions');
    vi.resetModules();
  });

  it('rejects the transform, not the import, when gltf-transform functions cannot load', async () => {
    // In Node a missing `sharp` binary fails `@gltf-transform/functions` at module load, through `ndarray-pixels`.
    const loadFailure = new Error('Could not load the "sharp" module using the linux-x64 runtime');
    let loads = 0;
    vi.resetModules();
    vi.doMock('@gltf-transform/functions', () => {
      loads += 1;
      throw loadFailure;
    });

    const { createCoordinateTransform, createReverseCoordinateTransform, createScalingTransform } =
      await import('#gltf.transforms.js');
    const document = createTriangleDocument();
    await document.transform(createCoordinateTransform(false), createScalingTransform(false));

    expect(loads).toBe(0);
    // Vitest wraps a throwing mock factory; the module's own load error is the cause.
    await expect(document.transform(createCoordinateTransform())).rejects.toHaveProperty('cause', loadFailure);
    await expect(document.transform(createReverseCoordinateTransform())).rejects.toHaveProperty('cause', loadFailure);
    await expect(document.transform(createScalingTransform())).rejects.toHaveProperty('cause', loadFailure);
    expect(loads).toBeGreaterThan(0);
  });
});
