import { describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import type { GLTF } from '@gltf-transform/core';
import type { SpatialMatrix } from '@taucad/spatial';
import { TauCadTopology, writeGlb, writeGltfJson } from '#index.js';
import type { GlbInput, GlbNode, GlbPrimitive, TauCadTopologyRoot } from '#index.js';

const occurrenceExtension = 'TAU_occurrence_test';
const identity: SpatialMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const triangle = (): GlbPrimitive => ({
  mode: 4,
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  texCoords: [new Float32Array([0, 0, 1, 0, 0, 1])],
  tangents: new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]),
  indices: new Uint16Array([0, 1, 2]),
  material: {
    name: 'Steel',
    pbrMetallicRoughness: { baseColorFactor: [0.7, 0.7, 0.7, 1], metallicFactor: 0.2, roughnessFactor: 0.4 },
  },
});
const placement = (x: number): SpatialMatrix => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1];
const read = async (input: GlbInput, write: typeof writeGlb): Promise<GLTF.IGLTF> => {
  const bytes = write(input);
  if (write === writeGlb) {
    const { json } = await new NodeIO().binaryToJSON(bytes);
    return json;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as GLTF.IGLTF;
};

// Both public entrypoints have the same sharing/validation contract.
describe.each([
  ['GLB', writeGlb],
  ['glTF', writeGltfJson],
] as const)('%s shared inline geometry', (_name, write) => {
  it.each([1, 2, 100, 1000])(
    'should retain %i occurrence identities and placements with one asset layout',
    async (count) => {
      const primitives = [triangle()];
      const input: GlbInput = {
        nodes: Array.from({ length: count }, (_unused, index) => ({
          name: `bolt-${index + 1}`,
          primitives,
          matrix: placement(index * 2),
          extras: { tauComponentId: `component:bolt-${index + 1}` },
          extensions: { [occurrenceExtension]: { index } },
        })),
      };
      const original = structuredClone(input);
      const json = await read(input, write);
      expect(json.meshes).toHaveLength(1);
      expect(json.meshes?.[0]?.name).toBe('bolt-1');
      expect(json.accessors).toHaveLength(5);
      expect(json.bufferViews).toHaveLength(5);
      expect(json.buffers?.[0]?.byteLength).toBe(152);
      expect(json.materials).toHaveLength(1);
      expect(json.nodes).toHaveLength(count);
      expect(json.scenes?.[0]?.nodes).toEqual(Array.from({ length: count }, (_unused, index) => index));
      for (const [index, node] of json.nodes!.entries()) {
        expect(node.mesh).toBe(0);
        expect(node.name).toBe(`bolt-${index + 1}`);
        expect(node.matrix).toEqual(placement(index * 2));
        expect(node.extras).toEqual({ tauComponentId: `component:bolt-${index + 1}` });
        expect(node.extensions).toEqual({ [occurrenceExtension]: { index } });
      }
      expect(json.accessors?.[json.meshes![0]!.primitives[0]!.indices!]?.componentType).toBe(5123);
      expect(input).toEqual(original);
    },
  );

  it('should share exact attribute views across material variants without changing authored asset metadata', async () => {
    const first = triangle();
    const second: GlbPrimitive = {
      ...first,
      material: { ...first.material, name: 'Other steel', extras: { authored: 'variant' } },
    };
    const json = await read(
      {
        nodes: [
          { name: 'A', primitives: [first] },
          { name: 'B', primitives: [second] },
        ],
      },
      write,
    );
    expect(json.meshes).toHaveLength(2);
    expect(json.meshes?.map((mesh) => mesh.name)).toEqual(['A', 'B']);
    expect(json.materials?.map((material) => [material.name, material.extras])).toEqual([
      ['Steel', undefined],
      ['Other steel', { authored: 'variant' }],
    ]);
    expect(json.accessors).toHaveLength(5);
    expect(json.bufferViews).toHaveLength(5);
    expect(json.buffers?.[0]?.byteLength).toBe(152);
    const [a, b] = json.meshes!.map((mesh) => mesh.primitives[0]!);
    expect(a!.attributes).toEqual(b!.attributes);
    expect(a!.indices).toBe(b!.indices);
    expect(a!.material).not.toBe(b!.material);
  });

  it('should intern new typed views of one source range and preserve offset bytes and four-byte padding', async () => {
    const first = triangle();
    const indicesBuffer = new Uint16Array([99, 0, 1, 2, 99]);
    first.indices = indicesBuffer.subarray(1, 4);
    const second: GlbPrimitive = {
      ...first,
      positions: new Float32Array(first.positions.buffer, first.positions.byteOffset, first.positions.length),
      indices: new Uint16Array(indicesBuffer.buffer, 2, 3),
    };
    const input = { nodes: [{ primitives: [first] }, { primitives: [second] }] };
    const json = await read(input, write);
    expect(json.accessors).toHaveLength(5);
    expect(json.bufferViews).toHaveLength(5);
    for (const view of json.bufferViews!) {
      expect(view.byteOffset! % 4).toBe(0);
    }
    const bytes = writeGlb(input);
    const dataView = new DataView(bytes.buffer);
    const bin = 28 + dataView.getUint32(12, true);
    const accessor = json.accessors![json.meshes![0]!.primitives[0]!.indices!]!;
    const view = json.bufferViews![accessor.bufferView!]!;
    expect([0, 1, 2].map((index) => dataView.getUint16(bin + view.byteOffset! + index * 2, true))).toEqual([0, 1, 2]);
    expect([...bytes.subarray(bin + view.byteOffset! + 6, bin + view.byteOffset! + 8)]).toEqual([0, 0]);
  });

  it('should keep different vertex layouts of one byte window in separate no-stride views', async () => {
    const values = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1]);
    const points: GlbPrimitive = { mode: 0, positions: values, normals: values, material: {} };
    const other: GlbPrimitive = { mode: 0, positions: new Float32Array(18), texCoords: [values], material: {} };
    const bytes = writeGlb({ nodes: [{ primitives: [points, other] }] });
    const io = new NodeIO();
    const { json } = await io.binaryToJSON(bytes);
    const [first, second] = json.meshes![0]!.primitives;
    const position = json.accessors![first!.attributes['POSITION']!]!;
    const normal = json.accessors![first!.attributes['NORMAL']!]!;
    const uv = json.accessors![second!.attributes['TEXCOORD_0']!]!;
    expect(new Set([position.bufferView, normal.bufferView, uv.bufferView]).size).toBe(3);
    expect([position.count, normal.count, uv.count]).toEqual([4, 4, 6]);
    expect([position.type, normal.type, uv.type]).toEqual(['VEC3', 'VEC3', 'VEC2']);
    expect(json.bufferViews!.every((view) => view.byteStride === undefined)).toBe(true);
    const document = await io.readBinary(bytes);
    const primitives = document.getRoot().listMeshes()[0]!.listPrimitives();
    expect(primitives[0]!.getAttribute('POSITION')!.getArray()).toEqual(values);
    expect(primitives[0]!.getAttribute('NORMAL')!.getArray()).toEqual(values);
    expect(primitives[1]!.getAttribute('TEXCOORD_0')!.getArray()).toEqual(values);
    const emitted = await read({ nodes: [{ primitives: [points, other] }] }, write);
    expect(emitted.bufferViews).toHaveLength(4);
  });

  it('should keep equal-valued arrays in different buffers separate', async () => {
    const first = triangle();
    const second: GlbPrimitive = { ...first, positions: new Float32Array(first.positions) };
    const json = await read({ nodes: [{ primitives: [first] }, { primitives: [second] }] }, write);
    expect(json.accessors).toHaveLength(6);
    expect(json.bufferViews).toHaveLength(6);
    expect(json.buffers?.[0]?.byteLength).toBe(188);
    expect(json.meshes![0]!.primitives[0]!.attributes['POSITION']).not.toBe(
      json.meshes![1]!.primitives[0]!.attributes['POSITION'],
    );
  });

  it('should preserve primitive component-ID ownership instead of copying it across occurrences', () => {
    const primitives = [{ ...triangle(), extras: { tauComponentId: 'component:primitive' } }];
    expect(() => write({ nodes: [{ primitives }, { primitives }] })).toThrow(TypeError);
    expect(() => write({ nodes: [{ primitives }, { primitives }] })).toThrow(/Duplicate tauComponentId/);
  });

  it('should preserve occurrence topology references to a shared mesh asset', async () => {
    const primitives = [triangle()];
    const payload = {
      schemaVersion: 1,
      components: [0, 1].map((nodeIndex) => ({
        id: `component:bolt-${nodeIndex + 1}`,
        name: `bolt-${nodeIndex + 1}`,
        kind: 'mesh',
        selector: `node-${nodeIndex}`,
        nodeIndex,
        meshIndex: 0,
        primitiveRefs: [{ nodeIndex, meshIndex: 0, primitiveIndex: 0 }],
      })),
    };
    const input: GlbInput = {
      nodes: payload.components.map((component) => ({
        name: component.name,
        primitives,
        matrix: placement(component.nodeIndex * 2),
        extras: { tauComponentId: component.id },
      })),
      extraBufferViews: [{ key: 'topology', data: new TextEncoder().encode(JSON.stringify(payload)) }],
      extensions: (views) => ({
        [TauCadTopology.EXTENSION_NAME]: {
          schemaVersion: 1,
          encoding: 'application/json',
          topologyBufferView: views['topology']!,
        },
      }),
    };
    const json = await read(input, write);
    expect(json.nodes?.map((node) => node.mesh)).toEqual([0, 0]);
    expect(json.extensionsUsed).toContain(TauCadTopology.EXTENSION_NAME);
    const document = await new NodeIO().registerExtensions([TauCadTopology]).readBinary(writeGlb(input));
    const topology = document.getRoot().getExtension<TauCadTopologyRoot>(TauCadTopology.EXTENSION_NAME);
    expect(topology?.getPayload()).toEqual(payload);
  });

  it('should keep manifold topology identity separate from shared primitive-array identity', async () => {
    const primitive: GlbPrimitive = {
      mode: 4,
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
      indices: new Uint16Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]),
      material: triangle().material,
    };
    const primitives = [primitive];
    const topology = { indices: Uint32Array.from(primitive.indices!) };
    const json = await read(
      {
        nodes: [
          { primitives, manifoldTopology: topology },
          { primitives, manifoldTopology: topology },
          { primitives, manifoldTopology: { indices: topology.indices } },
          { primitives },
        ],
      },
      write,
    );
    expect(json.nodes?.map((node) => node.mesh)).toEqual([0, 0, 1, 2]);
    expect(json.meshes).toHaveLength(3);
    expect(json.meshes?.map((mesh) => Boolean(mesh.extensions?.['EXT_mesh_manifold']))).toEqual([true, true, false]);
    expect(json.extensionsUsed).toContain('EXT_mesh_manifold');
  });

  it('should preserve a de-indexed closed manifold and authored primitive metadata', async () => {
    const vertices = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const corners = [0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3];
    const primitive: GlbPrimitive = {
      mode: 4,
      positions: Float32Array.from(corners.flatMap((index) => vertices[index]!)),
      material: {},
      extras: { authored: 'triangle-soup' },
      extensions: { [occurrenceExtension]: { primitive: true } },
    };
    const topology = Uint32Array.from(corners.map((index) => corners.indexOf(index)));
    const input: GlbInput = { nodes: [{ primitives: [primitive], manifoldTopology: { indices: topology } }] };
    const json = await read(input, write);
    const rendered = json.meshes![0]!.primitives[0]!;
    expect(rendered.extras).toEqual(primitive.extras);
    expect(rendered.extensions).toEqual(primitive.extensions);
    expect(json.accessors![rendered.indices!]!.count).toBe(12);
    const document = await new NodeIO().readBinary(writeGlb(input));
    const decoded = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    expect(decoded.getAttribute('POSITION')!.getArray()).toEqual(primitive.positions);
    expect(decoded.getIndices()!.getArray()).toEqual(Uint32Array.from(corners, (_corner, index) => index));
    // The manifold accessor applies the sparse corner-to-topological-vertex mapping.
    const extension = json.meshes![0]!.extensions!['EXT_mesh_manifold'];
    expect(extension).toMatchObject({ manifoldPrimitive: { mode: 4 } });
    expect(json.accessors!.find((accessor) => accessor.sparse)?.sparse?.count).toBe(8);
  });

  it.each([new Uint32Array(), new Uint16Array([0, 1, 2])])(
    'should reject malformed manifold index storage %j',
    (indices) => {
      const primitive: GlbPrimitive = {
        mode: 4,
        positions: new Float32Array(18),
        indices: new Uint32Array(),
        material: {},
      };
      const node: GlbNode = { primitives: [primitive], manifoldTopology: { indices: new Uint32Array() } };
      Reflect.set(node.manifoldTopology!, 'indices', indices);
      const input: GlbInput = { nodes: [node] };
      expect(() => write(input)).toThrow(TypeError);
      expect(() => write(input)).toThrow(/nonempty Uint32 triangle indices/);
    },
  );

  it('should validate shared index bytes independently for Uint16 and Uint32 interpretation', () => {
    const first = triangle();
    const words = new Uint16Array([0, 1, 0, 2, 1, 2]);
    first.indices = words;
    const second = { ...first, indices: new Uint32Array(words.buffer) };
    expect(() => write({ nodes: [{ primitives: [first, second] }] })).toThrow(TypeError);
    expect(() => write({ nodes: [{ primitives: [first, second] }] })).toThrow(/Index must be less/);
  });

  it.each([Uint16Array, Uint32Array])('should reject index restart values for %j', (IndexArray) => {
    const primitive = triangle();
    primitive.indices = new IndexArray([IndexArray === Uint16Array ? 65_535 : 4_294_967_295, 0, 1]);
    expect(() => write({ nodes: [{ primitives: [primitive] }] })).toThrow(TypeError);
    expect(() => write({ nodes: [{ primitives: [primitive] }] })).toThrow(/primitive restart/);
  });

  it('should retain the maximum legal Uint16 index and Uint32 index 65535', async () => {
    const first = triangle();
    first.positions = new Float32Array(65_535 * 3);
    delete first.normals;
    delete first.texCoords;
    delete first.tangents;
    first.indices = new Uint16Array([65_534, 0, 1]);
    const second = { ...first, positions: new Float32Array(65_536 * 3), indices: new Uint32Array([65_535, 0, 1]) };
    const json = await read({ nodes: [{ primitives: [first] }, { primitives: [second] }] }, write);
    expect(json.meshes!.map((mesh) => json.accessors![mesh.primitives[0]!.indices!]!.componentType)).toEqual([
      5123, 5125,
    ]);
  });

  it.each([
    ['POSITION', { positions: new Float32Array([0, 0]) }],
    ['POSITION', { positions: new Float32Array([0, Number.NaN, 0, 1, 0, 0, 0, 1, 0]) }],
    ['NORMAL', { normals: new Float32Array(6) }],
    ['Index', { indices: new Uint16Array([3, 0, 1]) }],
    ['topology', { indices: new Uint16Array([0, 1]) }],
  ])('should reject invalid %s before returning output', (message, invalid) => {
    const input = { nodes: [{ primitives: [{ ...triangle(), ...invalid }] }] };
    expect(() => write(input)).toThrow(TypeError);
    expect(() => write(input)).toThrow(new RegExp(message));
  });

  it.each([
    [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    [1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0.25, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, Number.NaN, 0, 0, 0, 0, 1],
  ])('should reject non-TRS matrix %j', (...matrix) => {
    // Deliberately malformed runtime input; the public tuple misuse is checked separately.
    const node: GlbNode = { primitives: [triangle()] };
    Reflect.set(node, 'matrix', matrix);
    expect(() => write({ nodes: [node] })).toThrow(TypeError);
    expect(() => write({ nodes: [node] })).toThrow(/matrix/);
  });

  it.each([null, {}, [1, 0, 0]])('should reject a malformed runtime matrix %j', (matrix) => {
    // Runtime JavaScript misuse is intentionally outside the statically checked tuple contract.
    const node: GlbNode = { primitives: [triangle()] };
    Reflect.set(node, 'matrix', matrix);
    expect(() => write({ nodes: [node] })).toThrow(TypeError);
    expect(() => write({ nodes: [node] })).toThrow(/SpatialMatrix/);
  });

  it('should reject nonrepresentable normalized matrix columns without changing input', () => {
    const matrix: SpatialMatrix = [
      Number.MAX_VALUE,
      Number.MAX_VALUE,
      Number.MAX_VALUE,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
    ];
    expect(() => write({ nodes: [{ primitives: [triangle()], matrix }] })).toThrow(TypeError);
    expect(() => write({ nodes: [{ primitives: [triangle()], matrix }] })).toThrow(/nonzero scale columns/);
  });

  it.each([1.5, -1, 7])('should reject unsupported primitive mode %j', (mode) => {
    const primitive = { ...triangle(), mode };
    expect(() => write({ nodes: [{ primitives: [primitive] }] })).toThrow(TypeError);
    expect(() => write({ nodes: [{ primitives: [primitive] }] })).toThrow(/complete topology elements/);
  });

  it.each([2, 3, 5, 6])('should reject insufficient vertices for primitive mode %i', (mode) => {
    const primitive: GlbPrimitive = { mode, positions: new Float32Array([0, 0, 0]), material: {} };
    expect(() => write({ nodes: [{ primitives: [primitive] }] })).toThrow(TypeError);
    expect(() => write({ nodes: [{ primitives: [primitive] }] })).toThrow(/complete topology elements/);
  });

  it.each([
    ['integer width', { indices: new Float32Array([0, 1, 2]) }, /Uint16Array or Uint32Array/],
    ['NORMAL', { normals: new Float32Array([0, 0, Number.NaN, 0, 0, 1, 0, 0, 1]) }, /finite components/],
    ['UV', { texCoords: [new Float32Array([0, 0, Number.NaN, 0, 0, 1])] }, /finite components/],
    ['FLOAT width', { normals: new Float64Array(9) }, /complete nonempty FLOAT vectors/],
  ])('should reject malformed runtime %s attributes', (_name, invalid, message) => {
    // Typed-array width misuse is supplied as malformed JavaScript input.
    const primitive = Object.assign(triangle(), invalid);
    expect(() => write({ nodes: [{ primitives: [primitive] }] })).toThrow(TypeError);
    expect(() => write({ nodes: [{ primitives: [primitive] }] })).toThrow(message);
  });

  it.each([Number.MAX_SAFE_INTEGER, 0x1_00_00_00_00])(
    'should reject declared payload capacity %i before allocating output',
    (declaredLength) => {
      const data = new Uint8Array(1);
      // Exercise checked size arithmetic without allocating a multi-gigabyte fixture.
      Object.defineProperty(data, 'byteLength', { value: declaredLength });
      expect(() => write({ nodes: [], extraBufferViews: [{ key: 'oversized', data }] })).toThrow(RangeError);
      expect(() => write({ nodes: [], extraBufferViews: [{ key: 'oversized', data }] })).toThrow(/uint32 capacity/);
    },
  );

  it('should reject GLB framing overflow before allocating the final binary', () => {
    const data = new Uint8Array(1);
    Object.defineProperty(data, 'byteLength', { value: 0xff_ff_ff_fc });
    expect(() => writeGlb({ nodes: [], extraBufferViews: [{ key: 'framing', data }] })).toThrow(RangeError);
    expect(() => writeGlb({ nodes: [], extraBufferViews: [{ key: 'framing', data }] })).toThrow(
      /GLB exceeds uint32 capacity/,
    );
  });

  it('should reject a sparse matrix with a missing translation element', () => {
    const matrix = [...identity];
    Reflect.deleteProperty(matrix, '12');
    // Deliberately malformed JavaScript input; static tuple misuse is tested separately.
    const node: GlbNode = { primitives: [triangle()] };
    Reflect.set(node, 'matrix', matrix);
    expect(() => write({ nodes: [node] })).toThrow(TypeError);
    expect(() => write({ nodes: [node] })).toThrow(/finite column-major affine/);
  });

  it('should preserve finite rotation, reflection and nonuniform scale matrix values', async () => {
    const matrix: SpatialMatrix = [0, 2, 0, 0, -3, 0, 0, 0, 0, 0, -4, 0, 5, 6, 7, 1];
    const json = await read(
      {
        nodes: [
          { primitives: [triangle()], matrix },
          { primitives: [triangle()], matrix: identity },
        ],
      },
      write,
    );
    expect(json.nodes?.map((node) => node.matrix)).toEqual([matrix, identity]);
  });
});
