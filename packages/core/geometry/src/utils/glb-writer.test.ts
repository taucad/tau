import { describe, it, expect } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
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
      baseColorFactor: options.color ?? ([0.8, 0.8, 0.8, 1] as [number, number, number, number]),
      metallicFactor: 0,
      roughnessFactor: 0.35,
      doubleSided: true,
      alphaMode: options.alphaMode ?? 'OPAQUE',
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
              baseColorFactor: [0, 0, 0, 1] as [number, number, number, number],
              metallicFactor: 0,
              roughnessFactor: 1,
              doubleSided: true,
              alphaMode: 'OPAQUE',
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
          { mode: 4, positions, normals, indices: second, material: { ...material, baseColorFactor: [1, 0, 0, 1] } },
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
                baseColorFactor: [1, 1, 1, 1],
                metallicFactor: 0,
                roughnessFactor: 1,
                doubleSided: true,
                alphaMode: 'OPAQUE',
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
                baseColorFactor: [1, 1, 1, 1],
                metallicFactor: 0,
                roughnessFactor: 1,
                doubleSided: true,
                alphaMode: 'OPAQUE',
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
                baseColorFactor: [1, 1, 1, 1],
                metallicFactor: 0,
                roughnessFactor: 1,
                doubleSided: true,
                alphaMode: 'OPAQUE',
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
                baseColorFactor: [1, 1, 1, 1],
                metallicFactor: 0,
                roughnessFactor: 1,
                doubleSided: true,
                alphaMode: 'OPAQUE',
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
                baseColorFactor: [0.5, 0.5, 0.5, 1],
                metallicFactor: 0.8,
                roughnessFactor: 0.2,
                doubleSided: true,
                alphaMode: 'OPAQUE',
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
                baseColorFactor: [1, 1, 1, 1],
                metallicFactor: 0,
                roughnessFactor: 1,
                doubleSided: true,
                alphaMode: 'OPAQUE',
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
                baseColorFactor: [0, 0, 0, 1] as [number, number, number, number],
                metallicFactor: 0,
                roughnessFactor: 1,
                doubleSided: true,
                alphaMode: 'OPAQUE',
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
