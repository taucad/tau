import { describe, expect, it } from 'vitest';
import { extractReferencedGltfUris } from '#gltf.dependencies.js';

describe('extractReferencedGltfUris', () => {
  it('returns external buffer and image URIs in deterministic document order', () => {
    const gltf = JSON.stringify({
      buffers: [{ uri: '../shared/model.bin' }, { uri: 'data:application/octet-stream;base64,AA==' }],
      images: [{ uri: 'textures/albedo.png' }, { bufferView: 0 }],
    });

    expect(extractReferencedGltfUris(gltf)).toEqual(['../shared/model.bin', 'textures/albedo.png']);
  });

  it.each(['not json', 'null', '[]'])('returns no filesystem references for invalid GLTF JSON %s', (json) => {
    expect(extractReferencedGltfUris(json)).toEqual([]);
  });
});
