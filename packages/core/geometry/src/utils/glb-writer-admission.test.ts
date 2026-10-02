import { describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import type { GLTF } from '@gltf-transform/core';
import { writeGlb, writeGltfJson } from '#index.js';
import type { GlbInput, GlbNode, GlbPrimitive } from '#index.js';

const webpExtension = 'EXT_texture_webp';
const writerExtension = 'TAU_writer_fixture';

const tetrahedron = (): GlbNode => {
  const indices = new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]);
  return {
    primitives: [
      {
        mode: 4,
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
        indices,
        material: {},
      },
    ],
    manifoldTopology: { indices: new Uint32Array(indices) },
  };
};

const readJson = async (bytes: Uint8Array<ArrayBuffer>, binary: boolean): Promise<GLTF.IGLTF> => {
  if (binary) {
    const { json } = await new NodeIO().binaryToJSON(bytes);
    return json;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as GLTF.IGLTF;
};

describe.each([
  ['GLB', writeGlb],
  ['JSON', writeGltfJson],
] as const)('%s manifold admission', (_format, write) => {
  it.each([
    [
      'empty primitive list',
      /one or more TRIANGLES/,
      (node: GlbNode) => {
        node.primitives = [];
      },
    ],
    [
      'line primitive',
      /one or more TRIANGLES/,
      (node: GlbNode) => {
        node.primitives[0]!.mode = 1;
      },
    ],
    [
      'different stream lengths',
      /same complete triangles/,
      (node: GlbNode) => {
        node.manifoldTopology!.indices = new Uint32Array([0, 2, 1]);
      },
    ],
    [
      'topology index overflow',
      /index out of range/,
      (node: GlbNode) => {
        node.manifoldTopology!.indices[0] = 4;
      },
    ],
    [
      'merging different coordinates',
      /identical POSITION/,
      (node: GlbNode) => {
        node.manifoldTopology!.indices[0] = 1;
      },
    ],
    [
      'collapsed topological triangle',
      /collapsed triangle/,
      (node: GlbNode) => {
        node.primitives[0]!.positions.fill(0);
        node.manifoldTopology!.indices[1] = 0;
      },
    ],
    [
      'inconsistent edge winding',
      /oriented 2-manifold/,
      (node: GlbNode) => {
        node.manifoldTopology!.indices.set([0, 1, 2]);
        node.primitives[0]!.indices!.set([0, 1, 2]);
      },
    ],
  ] as const)('should reject %s and preserve authored arrays', (_case, message, change) => {
    const node = tetrahedron();
    change(node);
    const input = { nodes: [node] };
    const original = structuredClone(input);
    expect(() => write(input)).toThrow(Error);
    expect(() => write(input)).toThrow(message);
    expect(input).toEqual(original);
  });

  it('should validate actual typed index storage when its iterator reports different entries', () => {
    const node = tetrahedron();
    const primitive = node.primitives[0]!;
    primitive.indices![0] = 4;
    Reflect.set(primitive.indices!, Symbol.iterator, function* () {
      for (let index = 0; index < 12; index++) {
        yield 0;
      }
    });
    // Serialized buffer bytes contain index4 despite an iterator claiming all zeros.
    expect(primitive.indices![0]).toBe(4);
    expect(() => write({ nodes: [{ primitives: [primitive] }] })).toThrow(TypeError);
    expect(() => write({ nodes: [{ primitives: [primitive] }] })).toThrow(/Index must be less than POSITION count/);
    expect(primitive.indices![0]).toBe(4);
  });

  it('should validate serialized matrix entries when its iterator reports a different translation', () => {
    const node = tetrahedron();
    const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, Number.NaN, 0, 0, 1];
    Reflect.set(matrix, Symbol.iterator, function* () {
      yield* [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    });
    Reflect.set(node, 'matrix', matrix);
    expect(() => write({ nodes: [node] })).toThrow(TypeError);
    expect(() => write({ nodes: [node] })).toThrow(/finite column-major affine/);
    expect(matrix[12]).toBeNaN();
  });

  it('should omit empty ordinary normals but reject them for manifold output', async () => {
    const node = tetrahedron();
    node.primitives[0]!.normals = new Float32Array();
    const ordinary = await readJson(write({ nodes: [{ primitives: node.primitives }] }), write === writeGlb);
    expect(ordinary.meshes![0]!.primitives[0]!.attributes['NORMAL']).toBeUndefined();
    expect(() => write({ nodes: [node] })).toThrow(Error);
    expect(() => write({ nodes: [node] })).toThrow(/complete finite triangle attributes/);
  });

  it('should reject two closed shells touching at one non-manifold vertex', () => {
    const node = tetrahedron();
    node.primitives[0]!.positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, -1, 0, 0, 0, -1, 0, 0, 0, -1,
    ]);
    const other = node.primitives[0]!.indices!.map((index) => (index === 0 ? 0 : index + 3));
    const indices = new Uint32Array([...node.primitives[0]!.indices!, ...other]);
    node.primitives[0]!.indices = indices;
    node.manifoldTopology!.indices = new Uint32Array(indices);
    expect(() => write({ nodes: [node] })).toThrow(Error);
    expect(() => write({ nodes: [node] })).toThrow(/disconnected vertex link/);
  });

  it('should accept equal attribute values in independently owned arrays across material primitives', async () => {
    const node = tetrahedron();
    const first = node.primitives[0]!;
    first.normals = new Float32Array(first.positions.length);
    first.texCoords = [new Float32Array(8)];
    first.tangents = Float32Array.from({ length: 16 }, (_unused, index) =>
      index % 4 === 0 || index % 4 === 3 ? 1 : 0,
    );
    const second: GlbPrimitive = {
      ...first,
      positions: new Float32Array(first.positions),
      normals: new Float32Array(first.normals),
      texCoords: first.texCoords.map((uv) => new Float32Array(uv)),
      tangents: new Float32Array(first.tangents),
      indices: first.indices!.slice(6),
      material: { name: 'other asset' },
    };
    first.indices = first.indices!.slice(0, 6);
    node.primitives.push(second);
    const json = await readJson(write({ nodes: [node] }), write === writeGlb);
    expect(json.meshes![0]!.primitives).toHaveLength(2);
    expect(json.meshes![0]!.primitives.map((primitive) => json.accessors![primitive.indices!]!.count)).toEqual([6, 6]);
    expect(json.materials!.map((material) => material.name)).toEqual([undefined, 'other asset']);
  });

  it.each(['positions', 'normals', 'tangents', 'texCoords', 'different-length', 'missing-normal'] as const)(
    'should reject distinct %s layouts across manifold primitives',
    (attribute) => {
      const node = tetrahedron();
      const first = node.primitives[0]!;
      first.normals = new Float32Array(first.positions.length);
      first.tangents = Float32Array.from({ length: 16 }, (_unused, index) =>
        index % 4 === 0 || index % 4 === 3 ? 1 : 0,
      );
      first.texCoords = [new Float32Array(8)];
      const second: GlbPrimitive = { ...first };
      if (attribute === 'positions') {
        second.positions = new Float32Array(first.positions);
        second.positions[0] = 2;
      }
      if (attribute === 'normals') {
        second.normals = new Float32Array(first.normals);
        second.normals[0] = 1;
      }
      if (attribute === 'tangents') {
        second.tangents = new Float32Array(first.tangents);
        second.tangents[3] = -1;
      }
      if (attribute === 'texCoords') {
        second.texCoords = [new Float32Array(8)];
        second.texCoords[0]![0] = 1;
      }
      if (attribute === 'different-length') {
        second.positions = new Float32Array(15);
        second.normals = new Float32Array(15);
        delete second.tangents;
        delete second.texCoords;
      }
      if (attribute === 'missing-normal') {
        delete second.normals;
      }
      node.primitives.push(second);
      expect(() => write({ nodes: [node] })).toThrow(Error);
      expect(() => write({ nodes: [node] })).toThrow(/must share identical/);
    },
  );

  it('should retain named WebP resources and root metadata', async () => {
    const input: GlbInput = {
      nodes: [],
      images: [{ name: 'authored texture', mimeType: 'image/webp', data: new Uint8Array([1, 2, 3]) }],
      textures: [{ extensions: { [webpExtension]: { source: 0 } } }],
      extras: { authored: 'assembly' },
      extensions: { [writerExtension]: { preserved: true } },
    };
    const json = await readJson(write(input), write === writeGlb);
    expect(json.images![0]!.name).toBe('authored texture');
    expect(json.images![0]!.mimeType).toBe('image/webp');
    expect(json.extensionsRequired).toContain('EXT_texture_webp');
    expect(json.asset.extras).toEqual(input.extras);
    expect(json.extensions!['TAU_writer_fixture']).toEqual({ preserved: true });
  });
});
