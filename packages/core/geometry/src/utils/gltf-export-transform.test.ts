import { describe, expect, it, vi } from 'vitest';
import { Document, NodeIO, Primitive, WebIO } from '@gltf-transform/core';
import type { Accessor, JSONDocument, TypedArray } from '@gltf-transform/core';
import { transformGltfExportBytes } from '#utils/gltf-export-transform.js';
import { writeGlb, writeGltfJson } from '#utils/glb-writer.js';
import type { GlbInput } from '#utils/glb-writer.js';
import { EXTManifold } from 'manifold-3d/manifold-gltf';

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

describe('EXT_mesh_manifold export transforms', () => {
  // Two faces of a tetrahedron corner with their own normals: render vertices 3 and 4
  // repeat the positions of 0 and 1, and the merge (stream positions 3 and 4) folds them back.
  const splitVertexGlb = async (): Promise<Uint8Array<ArrayBuffer>> => {
    const document = new Document();
    const buffer = document.createBuffer();
    const accessor = (name: string, type: 'SCALAR' | 'VEC3', array: TypedArray): Accessor =>
      document.createAccessor(name).setBuffer(buffer).setType(type).setArray(array);
    const renderIndices = new Uint32Array([0, 1, 2, 4, 3, 5]);
    const primitive = document
      .createPrimitive()
      .setMode(Primitive.Mode['TRIANGLES']!)
      .setAttribute(
        'POSITION',
        accessor('position', 'VEC3', new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])),
      )
      .setAttribute(
        'NORMAL',
        accessor('normal', 'VEC3', new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, -1, 0, -1, 0, 0, -1, 0, 0, -1, 0])),
      )
      .setIndices(accessor('render indices', 'SCALAR', new Uint32Array(renderIndices)));
    const mesh = document.createMesh('Corner').addPrimitive(primitive);
    const manifold = document.createExtension(EXTManifold).createManifoldPrimitive();
    manifold
      .setIndices(accessor('manifold indices', 'SCALAR', new Uint32Array(renderIndices)))
      .setRunIndex([0, 6])
      .setMerge(
        accessor('merge from', 'SCALAR', new Uint32Array([3, 4])),
        accessor('merge to', 'SCALAR', new Uint32Array([1, 0])),
      );
    mesh.setExtension(EXTManifold.EXTENSION_NAME, manifold);
    document.createScene().addChild(document.createNode('Corner').setMesh(mesh));
    return new NodeIO().registerExtensions([EXTManifold]).writeBinary(document);
  };

  it('should keep render indices on their split vertices through a rotated, scaled export', async () => {
    const exported = await transformGltfExportBytes(await splitVertexGlb(), {
      format: 'glb',
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
    });

    const document = await new NodeIO().registerExtensions([EXTManifold]).readBinary(exported);
    const [primitive] = document.getRoot().listMeshes()[0]!.listPrimitives();
    expect([...primitive!.getIndices()!.getArray()!]).toEqual([0, 1, 2, 4, 3, 5]);
  });
});
