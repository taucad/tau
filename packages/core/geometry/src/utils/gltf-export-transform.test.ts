import { describe, expect, it, vi } from 'vitest';
import { NodeIO, WebIO } from '@gltf-transform/core';
import type { JSONDocument } from '@gltf-transform/core';
import { transformGltfExportBytes } from '#utils/gltf-export-transform.js';
import { writeGlb, writeGltfJson } from '#utils/glb-writer.js';
import type { GlbInput } from '#utils/glb-writer.js';

const fixture = (): GlbInput => {
  const primitives = [
    {
      mode: 4,
      material: {},
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    },
  ];
  return {
    nodes: [
      { name: 'Bolt A', primitives },
      { name: 'Bolt B', primitives },
    ],
  };
};

describe('direct glTF export encoding', () => {
  it.each([false, true])('should write JSON directly from GLB with transform %s', async (transform) => {
    const source = writeGlb(fixture());
    const before = new Uint8Array(source);
    const binaryWrites = vi.spyOn(WebIO.prototype, 'writeBinary');
    try {
      const bytes = await transformGltfExportBytes(source, {
        format: 'gltf',
        ...(transform ? { unit: { length: 'millimeter' }, coordinateSystem: 'z-up' } : {}),
      });
      const document = await new NodeIO().readJSON({
        json: JSON.parse(new TextDecoder().decode(bytes)) as JSONDocument['json'],
        resources: {},
      });
      const nodes = document.getRoot().listNodes();
      expect(nodes.map((node) => node.getName())).toEqual(['Bolt A', 'Bolt B']);
      expect(nodes[0]?.getMesh()).toBe(nodes[1]?.getMesh());
      expect(document.getRoot().listMeshes()).toHaveLength(1);
      expect(nodes[0]?.getMesh()?.listPrimitives()[0]?.getAttribute('POSITION')?.getArray()).toEqual(
        new Float32Array(transform ? [0, 0, 0, 1000, 0, 0, 0, 0, 1000] : [0, 0, 0, 1, 0, 0, 0, 1, 0]),
      );
      expect(binaryWrites).not.toHaveBeenCalled();
      expect(source).toEqual(before);
    } finally {
      binaryWrites.mockRestore();
    }
  });

  it('should convert embedded JSON to binary and retain exact bytes on same-format no-op exports', async () => {
    const json = writeGltfJson(fixture());
    expect(await transformGltfExportBytes(json, { format: 'gltf' })).toBe(json);
    const bytes = await transformGltfExportBytes(json, { format: 'glb' });
    const document = await new NodeIO().readBinary(bytes);
    expect(document.getRoot().listMeshes()).toHaveLength(1);
    expect(
      document
        .getRoot()
        .listNodes()
        .map((node) => node.getName()),
    ).toEqual(['Bolt A', 'Bolt B']);
    expect(await transformGltfExportBytes(bytes, { format: 'glb' })).toBe(bytes);
  });
});
