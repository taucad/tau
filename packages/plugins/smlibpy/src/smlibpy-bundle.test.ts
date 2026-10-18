// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { readSmlibpyMeshBundle } from '#smlibpy-bundle.js';
import { encodeMeshBundle, squareShape } from '#smlibpy-bundle.fixture.js';

describe('readSmlibpyMeshBundle', () => {
  it('reads shapes into typed arrays with their appearance, resources and mechanism', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]);
    const bundle = readSmlibpyMeshBundle(
      encodeMeshBundle(
        [
          { ...squareShape, name: 'Plate', color: '#ff0000', opacity: 0.5, metalness: 0.2, roughness: 0.4 },
          { ...squareShape, material: { pbrMetallicRoughness: { baseColorTexture: { index: 0 } } } },
        ],
        {
          images: [{ name: 'grain', mimeType: 'image/png', data: png }],
          textures: [{ source: 0, sampler: 0 }],
          samplers: [{ magFilter: 9729 }],
          mechanism: { links: {} },
        },
      ),
    );

    const [plate, textured] = bundle.geometries;
    expect(plate).toMatchObject({ name: 'Plate', color: '#ff0000', opacity: 0.5, metalness: 0.2, roughness: 0.4 });
    expect(plate!.faces.vertices).toEqual(Float32Array.from(squareShape.vertices));
    expect(plate!.faces.triangles).toEqual(Uint32Array.from(squareShape.triangles));
    expect(plate!.faces.faceGroups).toEqual(squareShape.faceGroups);
    expect(plate!.edges.lines).toEqual(Float32Array.from(squareShape.lines!));
    expect(plate!.edges.edgeGroups).toHaveLength(4);
    expect(plate).not.toHaveProperty('material');
    expect(textured!.material).toEqual({ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } });
    expect(bundle.images).toEqual([{ name: 'grain', mimeType: 'image/png', data: png }]);
    expect(bundle.textures).toEqual([{ source: 0, sampler: 0 }]);
    expect(bundle.samplers).toEqual([{ magFilter: 9729 }]);
    expect(bundle.mechanism).toEqual({ links: {} });
  });

  it('omits what the worker did not write and reads a bundle at any byte offset', () => {
    const bytes = encodeMeshBundle([squareShape]);
    const shifted = new Uint8Array(bytes.byteLength + 1);
    shifted.set(bytes, 1);

    const bundle = readSmlibpyMeshBundle(shifted.subarray(1));

    expect(Object.keys(bundle)).toEqual(['geometries']);
    expect(bundle.geometries[0]!.faces.normals).toEqual(Float32Array.from(squareShape.normals));
  });

  it('refuses bytes that are not a well-formed bundle', () => {
    const bytes = encodeMeshBundle([squareShape]);
    const header = new DataView(bytes.buffer).getUint32(8, true);

    expect(() => readSmlibpyMeshBundle(new Uint8Array([1, 2, 3]))).toThrow(/without its header/);
    expect(() => readSmlibpyMeshBundle(new Uint8Array(16))).toThrow(/without its header/);

    const overlong = new Uint8Array(bytes);
    new DataView(overlong.buffer).setUint32(8, bytes.byteLength, true);
    expect(() => readSmlibpyMeshBundle(overlong)).toThrow(/header exceeds the bundle/);

    expect(() => readSmlibpyMeshBundle(bytes.subarray(0, 12 + header + 4))).toThrow(/slice exceeds the bundle/);
  });
});
