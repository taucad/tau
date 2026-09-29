import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import type { GLTF } from '@gltf-transform/core';
import { EXTManifold } from 'manifold-3d/manifold-gltf';
import {
  createEmptyGlb,
  createEmptyGltf,
  createEmptyGltfGeometry,
  writeGlb,
  writeGltfJson,
} from '#utils/glb-writer.js';
import type { GlbInput } from '#utils/glb-writer.js';

import { packageName, packageVersion } from '#utils/package-info.js';

const expectedGenerator = `${packageName}@${packageVersion}`;

// =============================================================================
// Fixtures
// =============================================================================

function createTrianglePrimitive(
  options: { color?: [number, number, number, number]; alphaMode?: 'OPAQUE' | 'BLEND' } = {},
) {
  return {
    mode: 4,
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
    material: {
      doubleSided: true,
      alphaMode: options.alphaMode ?? 'OPAQUE',
      pbrMetallicRoughness: {
        baseColorFactor: options.color ?? ([0.8, 0.8, 0.8, 1] as [number, number, number, number]),
        metallicFactor: 0,
        roughnessFactor: 0.35,
      },
    },
  };
}

function createSingleTriangleInput(): GlbInput {
  return {
    nodes: [
      {
        name: 'Triangle',
        primitives: [createTrianglePrimitive()],
      },
    ],
  };
}

function createMultiNodeInput(): GlbInput {
  return {
    nodes: [
      { name: 'Writer Node 1', primitives: [createTrianglePrimitive({ color: [1, 0, 0, 1] })] },
      { name: 'Writer Node 2', primitives: [createTrianglePrimitive({ color: [0, 0, 1, 1] })] },
      { name: 'Writer Node 3', primitives: [createTrianglePrimitive({ color: [0, 1, 0, 1] })] },
    ],
  };
}

function createLinesInput(): GlbInput {
  return {
    nodes: [
      {
        name: 'Edges',
        primitives: [
          {
            mode: 1,
            positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0]),
            indices: new Uint32Array([0, 1, 2, 3]),
            material: {
              doubleSided: true,
              alphaMode: 'OPAQUE',
              pbrMetallicRoughness: {
                baseColorFactor: [0, 0, 0, 1] as [number, number, number, number],
                metallicFactor: 0,
                roughnessFactor: 1,
              },
            },
          },
        ],
      },
    ],
  };
}

const cubeIndices = new Uint32Array([
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
]);

function createManifoldInput(): GlbInput {
  const basePositions = [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1];
  const positions = new Float32Array([...basePositions, ...basePositions]);
  const normals = new Float32Array(positions.length);
  const first = cubeIndices.filter((_, index) => Math.floor(index / 3) % 2 === 0);
  const second = cubeIndices.filter((_, index) => Math.floor(index / 3) % 2 === 1).map((index) => index + 8);
  const exact = new Uint32Array([...first, ...second.map((index) => index - 8)]);
  const { material } = createTrianglePrimitive();
  return {
    nodes: [
      {
        name: 'Surface',
        primitives: [
          { mode: 4, positions, normals, indices: first, material },
          {
            mode: 4,
            positions,
            normals,
            indices: second,
            material: {
              ...material,
              pbrMetallicRoughness: { ...material.pbrMetallicRoughness, baseColorFactor: [1, 0, 0, 1] },
            },
          },
        ],
        manifoldTopology: { indices: exact },
      },
      createLinesInput().nodes[0]!,
    ],
  };
}

function readGlbJson(glb: Uint8Array<ArrayBuffer>) {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonChunkLength = view.getUint32(12, true);
  const jsonBytes = glb.slice(20, 20 + jsonChunkLength);
  return JSON.parse(new TextDecoder().decode(jsonBytes).trim()) as Record<string, unknown>;
}

// =============================================================================
// Tests
// =============================================================================

describe.each([
  ['GLB', writeGlb],
  ['glTF', writeGltfJson],
] as const)('%s component identity', (_format, write) => {
  it('should preserve one component ID across its node and surface/edge references', async () => {
    const input = createSingleTriangleInput();
    const node = input.nodes[0]!;
    node.extras = { tauComponentId: 'component:Part_1-2' };
    node.primitives.push(createLinesInput().nodes[0]!.primitives[0]!);
    for (const primitive of node.primitives) {
      primitive.extras = { tauComponentId: 'component:Part_1-2' };
    }
    const bytes = write(input);
    const document =
      write === writeGlb
        ? await new NodeIO().binaryToJSON(bytes)
        : { json: JSON.parse(new TextDecoder().decode(bytes)) as GLTF.IGLTF };
    const { json } = document;
    expect(json.nodes?.[0]?.extras).toEqual(node.extras);
    expect(json.meshes?.[0]?.primitives.map((primitive) => primitive.extras)).toEqual([node.extras, node.extras]);
  });

  it.each(['', 'component:two parts', 'component:gear/1', 'component:齿轮', 'component:a\n', 42, null])(
    'should reject an invalid component ID %j on nodes or primitives',
    (id) => {
      for (const primitiveOnly of [false, true]) {
        const input = createSingleTriangleInput();
        const owner = primitiveOnly ? input.nodes[0]!.primitives[0]! : input.nodes[0]!;
        owner.extras = { tauComponentId: id };
        expect(() => write(input)).toThrow(TypeError);
        expect(() => write(input)).toThrow(/tauComponentId.*node 0/);
      }
    },
  );

  it('should reject component IDs shared by different nodes', () => {
    const input = createMultiNodeInput();
    input.nodes[0]!.extras = { tauComponentId: 'component:shared' };
    input.nodes[1]!.primitives[0]!.extras = { tauComponentId: 'component:shared' };
    expect(() => write(input)).toThrow(TypeError);
    expect(() => write(input)).toThrow(/Duplicate tauComponentId.*component:shared.*nodes 0 and 1/);
  });

  it('should reject an ID colliding with an emitted name without renaming authored data', () => {
    const input = createSingleTriangleInput();
    input.nodes[0]!.extras = { tauComponentId: 'component:reserved' };
    input.nodes[0]!.primitives[0]!.material.name = 'component:reserved';
    expect(() => write(input)).toThrow(TypeError);
    expect(() => write(input)).toThrow(/tauComponentId.*component:reserved.*name/);
    expect(input.nodes[0]!.primitives[0]!.material.name).toBe('component:reserved');
  });
});

describe('writeGlb', () => {
  it('should produce a valid empty scene when input has no nodes', async () => {
    const glb = writeGlb({ nodes: [] });
    const document = await new NodeIO().readBinary(glb);
    const json = readGlbJson(glb) as { meshes: unknown[]; nodes: unknown[]; scenes: Array<{ nodes: number[] }> };

    expect(document.getRoot().listMeshes()).toHaveLength(0);
    expect(document.getRoot().listNodes()).toHaveLength(0);
    expect(json.meshes).toEqual([]);
    expect(json.nodes).toEqual([]);
    expect(json.scenes[0]!.nodes).toEqual([]);
  });

  it('should produce a valid GLB with correct magic bytes and version', async () => {
    const glb = writeGlb(createSingleTriangleInput());
    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);

    expect(view.getUint32(0, true)).toBe(0x46_54_6c_67);
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(8, true)).toBe(glb.byteLength);

    const document = await new NodeIO().readBinary(glb);
    expect(document.getRoot().listMeshes()).toHaveLength(1);
  });

  it('writes no index buffer for a primitive whose indices would be the identity', async () => {
    const indexed = createLinesInput();
    const unindexed: GlbInput = {
      nodes: [
        {
          ...indexed.nodes[0]!,
          primitives: indexed.nodes[0]!.primitives.map(({ indices: _identity, ...primitive }) => primitive),
        },
      ],
    };

    const glb = writeGlb(unindexed);
    const document = await new NodeIO().readBinary(glb);
    const primitive = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!;

    // A de-indexed line soup is the common case for edge overlays; four bytes per vertex and an
    // accessor for 0,1,2,… is pure waste, and glTF draws arrays when `indices` is absent.
    expect(primitive.getIndices()).toBeNull();
    expect(primitive.getAttribute('POSITION')!.getCount()).toBe(4);
    expect(glb.byteLength).toBeLessThan(writeGlb(indexed).byteLength);
  });

  it('should produce correct accessor counts for a single triangle', async () => {
    const glb = writeGlb(createSingleTriangleInput());
    const document = await new NodeIO().readBinary(glb);
    const primitive = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!;

    const positions = primitive.getAttribute('POSITION')!;
    expect(positions.getCount()).toBe(3);
    expect(positions.getType()).toBe('VEC3');
    expect(positions.getComponentType()).toBe(5126);

    const normals = primitive.getAttribute('NORMAL')!;
    expect(normals.getCount()).toBe(3);
    expect(normals.getType()).toBe('VEC3');

    const indices = primitive.getIndices()!;
    expect(indices.getCount()).toBe(3);
    expect(indices.getComponentType()).toBe(5125);
  });

  it('should store coordinate values matching the input', async () => {
    const input: GlbInput = {
      nodes: [
        {
          primitives: [
            {
              mode: 4,
              positions: new Float32Array([1.5, -2, 3, 4, 5, 6, 7, 8, 9]),
              normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
              indices: new Uint32Array([0, 1, 2]),
              material: {
                doubleSided: true,
                alphaMode: 'OPAQUE',
                pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 },
              },
            },
          ],
        },
      ],
    };

    const glb = writeGlb(input);
    const document = await new NodeIO().readBinary(glb);
    const positions = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute('POSITION')!;

    const vertex0 = positions.getElement(0, [0, 0, 0]);
    expect(vertex0[0]).toBeCloseTo(1.5);
    expect(vertex0[1]).toBeCloseTo(-2);
    expect(vertex0[2]).toBeCloseTo(3);

    const vertex1 = positions.getElement(1, [0, 0, 0]);
    expect(vertex1[0]).toBeCloseTo(4);
    expect(vertex1[1]).toBeCloseTo(5);
    expect(vertex1[2]).toBeCloseTo(6);
  });

  it('should store normals correctly', async () => {
    const input: GlbInput = {
      nodes: [
        {
          primitives: [
            {
              mode: 4,
              positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
              normals: new Float32Array([0.577, 0.577, 0.577, 0, 1, 0, 1, 0, 0]),
              indices: new Uint32Array([0, 1, 2]),
              material: {
                doubleSided: true,
                alphaMode: 'OPAQUE',
                pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 },
              },
            },
          ],
        },
      ],
    };

    const glb = writeGlb(input);
    const document = await new NodeIO().readBinary(glb);
    const normals = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute('NORMAL')!;

    const normal0 = normals.getElement(0, [0, 0, 0]);
    expect(normal0[0]).toBeCloseTo(0.577, 3);
    expect(normal0[1]).toBeCloseTo(0.577, 3);
    expect(normal0[2]).toBeCloseTo(0.577, 3);
  });

  it('should store indices correctly', async () => {
    const input: GlbInput = {
      nodes: [
        {
          primitives: [
            {
              mode: 4,
              positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]),
              normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
              indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
              material: {
                doubleSided: true,
                alphaMode: 'OPAQUE',
                pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 },
              },
            },
          ],
        },
      ],
    };

    const glb = writeGlb(input);
    const document = await new NodeIO().readBinary(glb);
    const indices = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getIndices()!;

    expect(indices.getCount()).toBe(6);
    const indexArray = indices.getArray()!;
    expect([...indexArray]).toEqual([0, 1, 2, 1, 3, 2]);
  });

  it('should compute correct min/max on POSITION accessors', async () => {
    const input: GlbInput = {
      nodes: [
        {
          primitives: [
            {
              mode: 4,
              positions: new Float32Array([-1, -2, -3, 4, 5, 6, 0, 0, 0]),
              indices: new Uint32Array([0, 1, 2]),
              material: {
                doubleSided: true,
                alphaMode: 'OPAQUE',
                pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 },
              },
            },
          ],
        },
      ],
    };

    const glb = writeGlb(input);
    const document = await new NodeIO().readBinary(glb);
    const positions = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute('POSITION')!;

    expect(positions.getMin([0, 0, 0])).toEqual([-1, -2, -3]);
    expect(positions.getMax([0, 0, 0])).toEqual([4, 5, 6]);
  });

  it('should handle multiple primitives with different materials', async () => {
    const input: GlbInput = {
      nodes: [
        {
          name: 'MultiMat',
          primitives: [
            createTrianglePrimitive({ color: [1, 0, 0, 1] }),
            createTrianglePrimitive({ color: [0, 0, 1, 0.5], alphaMode: 'BLEND' }),
          ],
        },
      ],
    };

    const glb = writeGlb(input);
    const document = await new NodeIO().readBinary(glb);
    const materials = document.getRoot().listMaterials();

    expect(materials).toHaveLength(2);

    const redMaterial = materials.find((m) => m.getBaseColorFactor()[0] === 1 && m.getBaseColorFactor()[1] === 0);
    expect(redMaterial).toBeDefined();
    expect(redMaterial!.getAlphaMode()).toBe('OPAQUE');

    const blueMaterial = materials.find((m) => m.getBaseColorFactor()[2] === 1);
    expect(blueMaterial).toBeDefined();
    expect(blueMaterial!.getAlphaMode()).toBe('BLEND');
  });

  it('should handle LINES mode primitives', async () => {
    const glb = writeGlb(createLinesInput());
    const document = await new NodeIO().readBinary(glb);
    const primitive = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!;

    expect(primitive.getMode()).toBe(1);

    const positions = primitive.getAttribute('POSITION')!;
    expect(positions.getCount()).toBe(4);

    expect(primitive.getAttribute('NORMAL')).toBeNull();
  });

  it('should serialize certified manifold topology and keep lines in a sibling mesh', async () => {
    const glb = writeGlb(createManifoldInput());
    const json = readGlbJson(glb) as {
      extensionsUsed: string[];
      meshes: Array<{
        extensions?: {
          EXT_mesh_manifold?: { manifoldPrimitive: { indices: number }; mergeIndices: number; mergeValues: number };
        };
        primitives: Array<{ attributes: Record<string, number>; indices: number }>;
      }>;
      accessors: Array<{ bufferView: number; byteOffset: number; count: number; sparse?: { count: number } }>;
    };
    const surface = json.meshes[0]!;
    const extension = surface.extensions?.EXT_mesh_manifold;

    expect(json.extensionsUsed).toContain('EXT_mesh_manifold');
    expect(surface.primitives[0]!.attributes).toEqual(surface.primitives[1]!.attributes);
    expect(json.accessors[surface.primitives[0]!.indices]!.bufferView).toBe(
      json.accessors[surface.primitives[1]!.indices]!.bufferView,
    );
    expect(json.accessors[surface.primitives[1]!.indices]!.byteOffset).toBe(18 * Uint32Array.BYTES_PER_ELEMENT);
    expect(json.accessors[extension!.manifoldPrimitive.indices]!.sparse?.count).toBe(18);
    expect(typeof extension?.mergeIndices).toBe('number');
    expect(typeof extension?.mergeValues).toBe('number');
    expect(json.meshes[1]!.extensions).toBeUndefined();

    const document = await new NodeIO().registerExtensions([EXTManifold]).readBinary(glb);
    expect(document.getRoot().listMeshes()[0]!.getExtension(EXTManifold.EXTENSION_NAME)).not.toBeNull();
  });

  it('should refuse false manifold claims at the writer boundary', () => {
    const input = createSingleTriangleInput();
    input.nodes[0]!.manifoldTopology = { indices: new Uint32Array([0, 1, 2]) };
    expect(() => writeGlb(input)).toThrow('not an oriented 2-manifold');

    const mismatched = createManifoldInput();
    mismatched.nodes[0]!.manifoldTopology!.indices[18] = 6;
    expect(() => writeGlb(mismatched)).toThrow('identical POSITION values');
  });

  it('should produce correct node names for multi-node input', async () => {
    const glb = writeGlb(createMultiNodeInput());
    const document = await new NodeIO().readBinary(glb);
    const nodes = document.getRoot().listNodes();

    expect(nodes).toHaveLength(3);
    expect(nodes[0]!.getName()).toBe('Writer Node 1');
    expect(nodes[1]!.getName()).toBe('Writer Node 2');
    expect(nodes[2]!.getName()).toBe('Writer Node 3');
  });

  it('should produce empty scene for input with no nodes', async () => {
    const input: GlbInput = { nodes: [] };
    const glb = writeGlb(input);
    const document = await new NodeIO().readBinary(glb);

    expect(document.getRoot().listMeshes()).toHaveLength(0);
    expect(document.getRoot().listNodes()).toHaveLength(0);
  });

  it('should set metallic and roughness factors on materials', async () => {
    const input: GlbInput = {
      nodes: [
        {
          primitives: [
            {
              mode: 4,
              positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
              indices: new Uint32Array([0, 1, 2]),
              material: {
                doubleSided: true,
                alphaMode: 'OPAQUE',
                pbrMetallicRoughness: {
                  baseColorFactor: [0.5, 0.5, 0.5, 1],
                  metallicFactor: 0.8,
                  roughnessFactor: 0.2,
                },
              },
            },
          ],
        },
      ],
    };

    const glb = writeGlb(input);
    const document = await new NodeIO().readBinary(glb);
    const material = document.getRoot().listMaterials()[0]!;

    expect(material.getMetallicFactor()).toBeCloseTo(0.8);
    expect(material.getRoughnessFactor()).toBeCloseTo(0.2);
    expect(material.getDoubleSided()).toBe(true);
  });

  it('should set generator field in asset metadata to package name and version', async () => {
    const glb = writeGlb(createSingleTriangleInput());
    const document = await new NodeIO().readBinary(glb);

    expect(document.getRoot().listExtensionsUsed()).toHaveLength(0);
    const json = JSON.parse(
      new TextDecoder().decode(glb.slice(20, 20 + new DataView(glb.buffer).getUint32(12, true))),
    ) as { asset: { generator: string } };
    expect(json.asset.generator).toBe(expectedGenerator);
    expect(json.asset.generator).toMatch(/^@taucad\/geometry-core@\d+\.\d+\.\d+/);
  });

  it('should deduplicate identical materials', async () => {
    const input: GlbInput = {
      nodes: [
        { primitives: [createTrianglePrimitive()] },
        { primitives: [createTrianglePrimitive()] },
        { primitives: [createTrianglePrimitive()] },
      ],
    };

    const glb = writeGlb(input);
    const document = await new NodeIO().readBinary(glb);

    expect(document.getRoot().listMaterials()).toHaveLength(1);
    expect(document.getRoot().listMeshes()).toHaveLength(3);
  });

  it('should skip nodes with no primitives', async () => {
    const input: GlbInput = {
      nodes: [
        { name: 'Empty', primitives: [] },
        { name: 'HasMesh', primitives: [createTrianglePrimitive()] },
      ],
    };

    const glb = writeGlb(input);
    const document = await new NodeIO().readBinary(glb);

    expect(document.getRoot().listNodes()).toHaveLength(1);
    expect(document.getRoot().listNodes()[0]!.getName()).toBe('HasMesh');
  });

  it('should produce primitives without normals when omitted', async () => {
    const input: GlbInput = {
      nodes: [
        {
          primitives: [
            {
              mode: 4,
              positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
              indices: new Uint32Array([0, 1, 2]),
              material: {
                doubleSided: true,
                alphaMode: 'OPAQUE',
                pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 },
              },
            },
          ],
        },
      ],
    };

    const glb = writeGlb(input);
    const document = await new NodeIO().readBinary(glb);
    const primitive = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!;

    expect(primitive.getAttribute('POSITION')).toBeDefined();
    expect(primitive.getAttribute('NORMAL')).toBeNull();
  });

  it('should produce mixed surface and line primitives on different nodes', async () => {
    const input: GlbInput = {
      nodes: [
        {
          name: 'Surface',
          primitives: [createTrianglePrimitive()],
        },
        {
          name: 'Edges',
          primitives: [
            {
              mode: 1,
              positions: new Float32Array([0, 0, 0, 1, 0, 0]),
              indices: new Uint32Array([0, 1]),
              material: {
                doubleSided: true,
                alphaMode: 'OPAQUE',
                pbrMetallicRoughness: {
                  baseColorFactor: [0, 0, 0, 1] as [number, number, number, number],
                  metallicFactor: 0,
                  roughnessFactor: 1,
                },
              },
            },
          ],
        },
      ],
    };

    const glb = writeGlb(input);
    const document = await new NodeIO().readBinary(glb);
    const meshes = document.getRoot().listMeshes();

    expect(meshes).toHaveLength(2);
    expect(meshes[0]!.listPrimitives()[0]!.getMode()).toBe(4);
    expect(meshes[1]!.listPrimitives()[0]!.getMode()).toBe(1);
  });

  it('should preserve node, primitive, and material extras and extensions', () => {
    const nodeExtension = 'TAU_test_node';
    const primitiveExtension = 'TAU_test_primitive';
    const materialExtension = 'TAU_test_material';
    const input: GlbInput = {
      nodes: [
        {
          name: 'Annotated',
          extras: { componentId: 'component:annotated' },
          extensions: { [nodeExtension]: { enabled: true } },
          primitives: [
            {
              ...createTrianglePrimitive(),
              extras: { primitiveId: 'primitive:face' },
              extensions: { [primitiveExtension]: { faceId: 42 } },
              material: {
                ...createTrianglePrimitive().material,
                extras: { materialId: 'material:gray' },
                extensions: { [materialExtension]: { coating: 'matcap' } },
              },
            },
          ],
        },
      ],
    };

    const json = readGlbJson(writeGlb(input)) as {
      nodes: Array<{ extras?: unknown; extensions?: unknown }>;
      meshes: Array<{ primitives: Array<{ extras?: unknown; extensions?: unknown }> }>;
      materials: Array<{ extras?: unknown; extensions?: unknown }>;
    };

    expect(json.nodes[0]!.extras).toEqual({ componentId: 'component:annotated' });
    expect(json.nodes[0]!.extensions).toEqual({ [nodeExtension]: { enabled: true } });
    expect(json.meshes[0]!.primitives[0]!.extras).toEqual({ primitiveId: 'primitive:face' });
    expect(json.meshes[0]!.primitives[0]!.extensions).toEqual({ [primitiveExtension]: { faceId: 42 } });
    expect(json.materials[0]!.extras).toEqual({ materialId: 'material:gray' });
    expect(json.materials[0]!.extensions).toEqual({ [materialExtension]: { coating: 'matcap' } });
  });

  it('should resolve keyed extra bufferViews into root extensions', () => {
    const topologyExtension = 'TAU_cad_topology';
    const input: GlbInput = {
      nodes: [{ name: 'Triangle', primitives: [createTrianglePrimitive()] }],
      extensionsUsed: [topologyExtension],
      extensionsRequired: [topologyExtension],
      extraBufferViews: [
        {
          key: 'topology',
          data: new TextEncoder().encode(JSON.stringify({ components: ['component:triangle'] })),
        },
      ],
      extensions: (bufferViews) => {
        const topologyBufferView = bufferViews['topology'];
        if (topologyBufferView === undefined) {
          throw new Error('Expected topology buffer view to be materialized.');
        }

        return {
          [topologyExtension]: {
            schemaVersion: 1,
            topologyBufferView,
          },
        };
      },
    };

    const json = readGlbJson(writeGlb(input)) as {
      bufferViews: Array<{ target?: number }>;
      extensions: Record<typeof topologyExtension, { topologyBufferView: number }>;
      extensionsUsed: string[];
      extensionsRequired: string[];
    };

    expect(json.extensionsUsed).toEqual([topologyExtension]);
    expect(json.extensionsRequired).toEqual([topologyExtension]);
    expect(json.extensions[topologyExtension].topologyBufferView).toBe(json.bufferViews.length - 1);
    expect(json.bufferViews.at(-1)!.target).toBeUndefined();
  });
});

describe('writeGltfJson', () => {
  it('should produce valid JSON glTF with zero meshes when input has no nodes', () => {
    const gltfBytes = writeGltfJson({ nodes: [] });
    const json = JSON.parse(new TextDecoder().decode(gltfBytes)) as {
      asset: { version: string; generator: string };
      meshes: unknown[];
      nodes: unknown[];
      scenes: Array<{ nodes: number[] }>;
      buffers: Array<{ uri: string; byteLength: number }>;
    };

    expect(json.asset.version).toBe('2.0');
    expect(json.asset.generator).toBe(expectedGenerator);
    expect(json.meshes).toEqual([]);
    expect(json.nodes).toEqual([]);
    expect(json.scenes[0]!.nodes).toEqual([]);
    expect(json.buffers[0]!.byteLength).toBe(0);
    expect(json.buffers[0]!.uri).toBe('data:application/octet-stream;base64,');
  });

  it('should produce valid JSON glTF with embedded base64 buffer URI', () => {
    const gltfBytes = writeGltfJson(createSingleTriangleInput());
    const json = JSON.parse(new TextDecoder().decode(gltfBytes)) as {
      asset: { version: string; generator: string };
      meshes: unknown[];
      buffers: Array<{ uri: string; byteLength: number }>;
    };

    expect(json.asset.version).toBe('2.0');
    expect(json.asset.generator).toBe(expectedGenerator);
    expect(json.meshes).toHaveLength(1);
    expect(json.buffers).toHaveLength(1);
    expect(json.buffers[0]!.uri).toMatch(/^data:application\/octet-stream;base64,/);
    expect(json.buffers[0]!.byteLength).toBeGreaterThan(0);
  });

  it('should produce geometry matching writeGlb output for the same input', async () => {
    const input = createSingleTriangleInput();
    const glb = writeGlb(input);
    const gltfBytes = writeGltfJson(input);

    const glbDocument = await new NodeIO().readBinary(glb);
    const gltfJson = JSON.parse(new TextDecoder().decode(gltfBytes)) as {
      meshes: unknown[];
      nodes: Array<{ name?: string }>;
    };

    expect(gltfJson.meshes).toHaveLength(glbDocument.getRoot().listMeshes().length);
    expect(gltfJson.nodes).toHaveLength(glbDocument.getRoot().listNodes().length);
  });

  it('should produce valid JSON with multiple nodes', () => {
    const gltfBytes = writeGltfJson(createMultiNodeInput());
    const json = JSON.parse(new TextDecoder().decode(gltfBytes)) as {
      nodes: Array<{ name: string }>;
      scenes: Array<{ nodes: number[] }>;
    };

    expect(json.nodes).toHaveLength(3);
    expect(json.scenes[0]!.nodes).toEqual([0, 1, 2]);
    expect(json.nodes[0]!.name).toBe('Writer Node 1');
  });

  it('should include extensions and extra bufferViews in JSON glTF output', () => {
    const topologyExtension = 'TAU_cad_topology';
    const gltfBytes = writeGltfJson({
      nodes: [{ name: 'Triangle', primitives: [createTrianglePrimitive()] }],
      extensionsUsed: [topologyExtension],
      extraBufferViews: [{ key: 'topology', data: new Uint8Array([1, 2, 3, 4]) }],
      extensions: (bufferViews) => {
        const topologyBufferView = bufferViews['topology'];
        if (topologyBufferView === undefined) {
          throw new Error('Expected topology buffer view to be materialized.');
        }

        return {
          [topologyExtension]: { topologyBufferView },
        };
      },
    });
    const json = JSON.parse(new TextDecoder().decode(gltfBytes)) as {
      bufferViews: unknown[];
      extensionsUsed: string[];
      extensions: Record<typeof topologyExtension, { topologyBufferView: number }>;
    };

    expect(json.extensionsUsed).toEqual([topologyExtension]);
    expect(json.extensions[topologyExtension].topologyBufferView).toBe(json.bufferViews.length - 1);
  });
});

describe('empty GLB helpers', () => {
  it('should create canonical empty GLB and glTF bytes', async () => {
    const glb = createEmptyGlb();
    const gltf = createEmptyGltf();
    const glbDocument = await new NodeIO().readBinary(glb);
    const gltfJson = JSON.parse(new TextDecoder().decode(gltf)) as { meshes: unknown[] };

    expect(glbDocument.getRoot().listMeshes()).toHaveLength(0);
    expect(gltfJson.meshes).toEqual([]);
  });

  it('should create a runtime glTF geometry artifact backed by empty GLB bytes', async () => {
    const geometry = createEmptyGltfGeometry();
    const document = await new NodeIO().readBinary(geometry.content);

    expect(geometry.format).toBe('gltf');
    expect(document.getRoot().listMeshes()).toHaveLength(0);
  });
});

// =============================================================================
// Single-copy layout (byte identity)
// =============================================================================

const onePixelPng = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1EAAAAASUVORK5CYII=', 'base64'),
);

function createPaddedResourceInput(): GlbInput {
  // Positions viewed at a non-zero offset inside a larger buffer: the writer must honour byteOffset.
  const backing = new Float32Array([9, 9, 9, 0, 0, 0, 1, 0, 0, 0, 1, 0, 9]);
  const primitive = createTrianglePrimitive();
  return {
    nodes: [
      {
        name: 'Textured',
        primitives: [
          {
            ...primitive,
            positions: backing.subarray(3, 12),
            texCoords: [new Float32Array([0, 0, 1, 0, 0, 1])],
            material: {
              ...primitive.material,
              pbrMetallicRoughness: { ...primitive.material.pbrMetallicRoughness, baseColorTexture: { index: 0 } },
            },
          },
        ],
      },
    ],
    // Odd byte lengths exercise the four-byte padding between views.
    extraBufferViews: [{ key: 'odd', data: new Uint8Array([1, 2, 3, 4, 5]) }],
    images: [{ data: onePixelPng, mimeType: 'image/png' }],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ wrapS: 10_497, wrapT: 33_071, minFilter: 9987, magFilter: 9729 }],
  };
}

const layoutFixtures: ReadonlyArray<readonly [string, () => GlbInput]> = [
  ['empty scene', () => ({ nodes: [] })],
  ['single triangle', createSingleTriangleInput],
  ['multiple nodes', createMultiNodeInput],
  ['lines', createLinesInput],
  ['manifold topology with sparse merges', createManifoldInput],
  ['padded extra views, images and offset views', createPaddedResourceInput],
];

const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

/** Split a GLB into its JSON (generator redacted, so a version bump never moves the digest) and BIN chunks. */
function splitGlb(glb: Uint8Array<ArrayBuffer>): { json: string; bin: Uint8Array<ArrayBuffer> } {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)).replace(expectedGenerator, '<generator>');
  const binOffset = 20 + jsonLength;
  const binLength = binOffset < glb.byteLength ? view.getUint32(binOffset, true) : 0;
  return { json, bin: glb.subarray(binOffset + 8, binOffset + 8 + binLength) };
}

/** Assemble a GLB the plain way (JSON chunk, then BIN chunk) from the self-contained glTF's JSON and buffer. */
function assembleReferenceGlb(input: GlbInput): Uint8Array<ArrayBuffer> {
  const json = JSON.parse(new TextDecoder().decode(writeGltfJson(input))) as { buffers: Array<{ uri?: string }> };
  const bin = Uint8Array.from(Buffer.from(json.buffers[0]!.uri!.split(',')[1]!, 'base64'));
  delete json.buffers[0]!.uri;
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(jsonBytes.byteLength / 4) * 4;
  const binLength = Math.ceil(bin.byteLength / 4) * 4;
  const glb = new Uint8Array(28 + jsonLength + binLength);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46_54_6c_67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, glb.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  glb.set(jsonBytes, 20);
  glb.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonLength);
  view.setUint32(20 + jsonLength, binLength, true);
  view.setUint32(24 + jsonLength, 0x00_4e_49_42, true);
  glb.set(bin, 28 + jsonLength);
  return glb;
}

describe('writeGlb single-copy layout', () => {
  // Digests recorded from the three-copy writer this layout replaced (geospec aebaf91c4).
  const recorded: Record<string, { json: string; bin: string }> = {
    'empty scene': {
      json: 'fe8baa00555e16c4a945230ce0223b936e6524dc96683d942a925b81bedd099b',
      bin: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
    'single triangle': {
      json: '5f3b073e26d063eed381de5e5b6ef19757a836ceb865effc73a3d36a94a974a3',
      bin: '754bbf6a4e2b9e9f1e311a31d508337c560177fb20fbde81348dcc93527d8508',
    },
    'multiple nodes': {
      json: 'd5077df54fe64c4a68053aa60dae0c6c6e416db3898974a9d8818913b94ed43d',
      bin: '41a06a09fb2081c248fd7e1e4f33b8a707a408fe9857ada2acbf619f5798b776',
    },
    lines: {
      json: '78bc4a23830a95d528810705606092638717272ed39acf31c75881255821aec7',
      bin: 'db740eb029986ab3f57670063eb89265b9ea8a3d930614152e77680f1de00fee',
    },
    'manifold topology with sparse merges': {
      json: 'ff3a2500760d5f699d98a9ebf5a89bb6eef5fe81467935ff5903f5d8c4cc11d4',
      bin: 'cae69e2f02f3ae1f0dec0df69d3e0d461504c333cadafd1d844cb179fc31f526',
    },
    'padded extra views, images and offset views': {
      json: '67ab3620d0de739f719a0b9178b87feff697957b2a3dd5237d5b846168bcba50',
      bin: 'd3caee732bdef671ef3bba543ff4d90656991182a565a3699eb9d66d2e042f3f',
    },
  };

  it.each(layoutFixtures)('should write %s byte-identically to the plain assembly', (_name, create) => {
    const input = create();
    expect(writeGlb(input)).toEqual(assembleReferenceGlb(input));
  });

  it.each(layoutFixtures)('should keep the recorded bytes for %s', (name, create) => {
    const { json, bin } = splitGlb(writeGlb(create()));
    expect({ json: sha256(new TextEncoder().encode(json)), bin: sha256(bin) }).toEqual(recorded[name]);
  });
});
