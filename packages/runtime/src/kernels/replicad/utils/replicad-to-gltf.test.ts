import { describe, it, expect, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { NodeIO } from '@gltf-transform/core';
import { tauCadTopologyExtension } from '@taucad/types/constants';
import { convertReplicadGeometriesToGltf } from '#kernels/replicad/utils/replicad-to-gltf.js';
import type { GeometryReplicad } from '#kernels/replicad/replicad.types.js';
import type { RuntimeLogger } from '#types/runtime-kernel.types.js';

// =============================================================================
// Fixtures
// =============================================================================

function createSimpleGeometry(overrides: Partial<GeometryReplicad> = {}): GeometryReplicad {
  return {
    format: 'replicad',
    name: 'TestShape',
    faces: {
      vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      triangles: [0, 1, 2],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      faceGroups: [],
    },
    edges: { lines: [], edgeGroups: [] },
    ...overrides,
  };
}

function alignTo4(value: number): number {
  const remainder = value % 4;
  return remainder === 0 ? value : value + (4 - remainder);
}

function readGlbJsonAndBin(glb: Uint8Array<ArrayBuffer>) {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonChunkLength = view.getUint32(12, true);
  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonChunkLength;
  const binHeaderStart = jsonStart + alignTo4(jsonChunkLength);
  const binChunkLength = view.getUint32(binHeaderStart, true);
  const binStart = binHeaderStart + 8;
  const json = JSON.parse(new TextDecoder().decode(glb.slice(jsonStart, jsonEnd)).trim()) as {
    nodes: Array<{ extras?: Record<string, unknown> }>;
    meshes: Array<{ primitives: Array<{ extras?: Record<string, unknown> }> }>;
    bufferViews: Array<{ byteOffset: number; byteLength: number }>;
    extensions?: Record<string, { topologyBufferView?: number }>;
    extensionsUsed?: string[];
  };
  return {
    json,
    bin: glb.slice(binStart, binStart + binChunkLength),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('convertReplicadGeometriesToGltf', () => {
  it('should convert empty geometries array to valid GLB', async () => {
    const result = convertReplicadGeometriesToGltf({ geometries: [], format: 'glb' });

    expect(result).toBeInstanceOf(Uint8Array);
    const document = await new NodeIO().readBinary(result);
    expect(document.getRoot().listMeshes()).toHaveLength(0);
  });

  it('should produce a mesh with correct triangle count', async () => {
    const geometry = createSimpleGeometry({
      faces: {
        vertices: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
        triangles: [0, 1, 2, 0, 2, 3],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
        faceGroups: [],
      },
    });

    const glb = convertReplicadGeometriesToGltf({ geometries: [geometry], format: 'glb' });
    const document = await new NodeIO().readBinary(glb);
    const primitive = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!;

    expect(primitive.getIndices()!.getCount()).toBe(6);
    expect(primitive.getAttribute('POSITION')!.getCount()).toBe(4);
    expect(primitive.getAttribute('NORMAL')!.getCount()).toBe(4);
  });

  it('should set node name from geometry name', async () => {
    const geometry = createSimpleGeometry({ name: 'MyCube' });
    const glb = convertReplicadGeometriesToGltf({ geometries: [geometry], format: 'glb' });
    const document = await new NodeIO().readBinary(glb);

    expect(document.getRoot().listNodes()[0]!.getName()).toBe('MyCube');
  });

  it('should resolve unnamed and legacy generated geometry names to canonical shape names', async () => {
    const first = createSimpleGeometry({ name: '' });
    const second = createSimpleGeometry({ name: 'Shape_1' });
    const glb = convertReplicadGeometriesToGltf({ geometries: [first, second], format: 'glb' });
    const document = await new NodeIO().readBinary(glb);

    expect(
      document
        .getRoot()
        .listNodes()
        .map((node) => node.getName()),
    ).toEqual(['Shape 1', 'Shape 2']);
    expect(
      document
        .getRoot()
        .listMeshes()
        .map((mesh) => mesh.getName()),
    ).toEqual(['Shape 1', 'Shape 2']);

    const { json, bin } = readGlbJsonAndBin(glb);
    const extension = json.extensions?.[tauCadTopologyExtension];
    const bufferView = json.bufferViews[extension!.topologyBufferView!]!;
    const payloadBytes = bin.slice(bufferView.byteOffset, bufferView.byteOffset + bufferView.byteLength);
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as {
      components: Array<{ id: string; name: string }>;
    };

    expect(payload.components).toEqual([
      expect.objectContaining({ id: 'component:node-0', name: 'Shape 1' }),
      expect.objectContaining({ id: 'component:node-1', name: 'Shape 2' }),
    ]);
  });

  it('should apply red color to material baseColorFactor', async () => {
    const geometry = createSimpleGeometry({ color: '#ff0000', opacity: 1 });
    const glb = convertReplicadGeometriesToGltf({ geometries: [geometry], format: 'glb' });
    const document = await new NodeIO().readBinary(glb);
    const material = document.getRoot().listMaterials()[0]!;

    const color = material.getBaseColorFactor();
    expect(color[0]).toBeCloseTo(1, 2);
    expect(color[1]).toBeCloseTo(0, 2);
    expect(color[2]).toBeCloseTo(0, 2);
    expect(color[3]).toBeCloseTo(1, 2);
    expect(material.getAlphaMode()).toBe('OPAQUE');
    expect(material.getName()).toBe('');
  });

  // Discriminating test: pure primaries pass for both correct and incorrect
  // implementations because sRGB endpoints (0 and 1) map to themselves under
  // the gamma curve. Mid-gray exposes the bug — sRGB-as-linear would yield
  // ~0.502, the correct linear value is ~0.216.
  // See docs/policy/color-space-policy.md.
  it('should encode mid-gray #808080 to linear ~0.216 (not sRGB 0.502)', async () => {
    const geometry = createSimpleGeometry({ color: '#808080', opacity: 1 });
    const glb = convertReplicadGeometriesToGltf({ geometries: [geometry], format: 'glb' });
    const document = await new NodeIO().readBinary(glb);
    const material = document.getRoot().listMaterials()[0]!;

    const color = material.getBaseColorFactor();
    expect(color[0]).toBeCloseTo(0.215_861, 3);
    expect(color[1]).toBeCloseTo(0.215_861, 3);
    expect(color[2]).toBeCloseTo(0.215_861, 3);
    expect(color[3]).toBeCloseTo(1, 2);
    expect(material.getName()).toBe('');
  });

  it('should set BLEND alphaMode for semi-transparent geometry', async () => {
    const geometry = createSimpleGeometry({ color: '#ff0000', opacity: 0.5 });
    const glb = convertReplicadGeometriesToGltf({ geometries: [geometry], format: 'glb' });
    const document = await new NodeIO().readBinary(glb);
    const material = document.getRoot().listMaterials()[0]!;

    expect(material.getAlphaMode()).toBe('BLEND');
    expect(material.getBaseColorFactor()[3]).toBeCloseTo(0.5);
    expect(material.getName()).toBe('');
  });

  it('should produce separate nodes for multiple geometries', async () => {
    const red = createSimpleGeometry({ name: 'Red', color: '#ff0000' });
    const blue = createSimpleGeometry({ name: 'Blue', color: '#0000ff' });

    const glb = convertReplicadGeometriesToGltf({ geometries: [red, blue], format: 'glb' });
    const document = await new NodeIO().readBinary(glb);

    expect(document.getRoot().listNodes()).toHaveLength(2);
    expect(document.getRoot().listMaterials()).toHaveLength(2);
    expect(document.getRoot().listNodes()[0]!.getName()).toBe('Red');
    expect(document.getRoot().listNodes()[1]!.getName()).toBe('Blue');
  });

  it('should include edge line primitives when edges are provided', async () => {
    const geometry = createSimpleGeometry({
      edges: {
        lines: [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0],
        edgeGroups: [
          { start: 0, count: 6, edgeId: 1 },
          { start: 6, count: 6, edgeId: 2 },
        ],
      },
    });

    const glb = convertReplicadGeometriesToGltf({ geometries: [geometry], format: 'glb' });
    const document = await new NodeIO().readBinary(glb);
    const primitives = document.getRoot().listMeshes()[0]!.listPrimitives();
    const materialNames = document
      .getRoot()
      .listMaterials()
      .map((material) => material.getName());

    expect(primitives).toHaveLength(2);
    expect(primitives[0]!.getMode()).toBe(4);
    expect(primitives[1]!.getMode()).toBe(1);
    expect(materialNames).toEqual(['', '']);
  });

  it('should annotate nodes and primitives with stable Tau component metadata', () => {
    const geometry = createSimpleGeometry({
      name: 'planet gear',
      faces: {
        vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        triangles: [0, 1, 2],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        faceGroups: [{ start: 0, count: 3, faceId: 7 }],
      },
      edges: {
        lines: [0, 0, 0, 1, 0, 0],
        edgeGroups: [{ start: 0, count: 6, edgeId: 11 }],
      },
    });

    const glb = convertReplicadGeometriesToGltf({ geometries: [geometry], format: 'glb' });
    const { json } = readGlbJsonAndBin(glb);

    expect(json.nodes[0]!.extras).toEqual({
      tauComponentId: 'component:node-0',
      tauComponentKind: 'part',
      tauComponentSelector: 'node/0',
    });
    expect(json.meshes[0]!.primitives[0]!.extras).toMatchObject({
      tauComponentId: 'component:node-0',
      tauComponentKind: 'body',
      tauComponentSelector: 'node/0/surface',
      faceGroups: [{ start: 0, count: 3, faceId: 7 }],
    });
    expect(json.meshes[0]!.primitives[1]!.extras).toMatchObject({
      tauComponentId: 'component:node-0',
      tauComponentKind: 'line',
      tauComponentSelector: 'node/0/edges',
      edgeGroups: [{ start: 0, count: 6, edgeId: 11 }],
    });
  });

  it('should write Tau topology extension payload with face and edge groups', () => {
    const geometry = createSimpleGeometry({
      name: 'Housing',
      faces: {
        vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        triangles: [0, 1, 2],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        faceGroups: [{ start: 0, count: 3, faceId: 123 }],
      },
      edges: {
        lines: [0, 0, 0, 1, 0, 0],
        edgeGroups: [{ start: 0, count: 6, edgeId: 456 }],
      },
    });

    const glb = convertReplicadGeometriesToGltf({ geometries: [geometry], format: 'glb' });
    const { json, bin } = readGlbJsonAndBin(glb);
    const extension = json.extensions?.[tauCadTopologyExtension];
    expect(json.extensionsUsed).toEqual([tauCadTopologyExtension]);
    expect(extension?.topologyBufferView).toBeDefined();

    const bufferView = json.bufferViews[extension!.topologyBufferView!]!;
    const payloadBytes = bin.slice(bufferView.byteOffset, bufferView.byteOffset + bufferView.byteLength);
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as {
      schemaVersion: number;
      components: Array<{
        id: string;
        name: string;
        nodeIndex: number;
        faceGroups: Array<{ faceId: number }>;
        edgeGroups: Array<{ edgeId: number }>;
        capabilities: { hasPreciseTopology: boolean };
      }>;
    };

    expect(payload.schemaVersion).toBe(1);
    expect(payload.components).toHaveLength(1);
    expect(payload.components[0]).toMatchObject({
      id: 'component:node-0',
      name: 'Housing',
      selector: 'node/0',
      nodeIndex: 0,
      faceGroups: [{ faceId: 123 }],
      edgeGroups: [{ edgeId: 456 }],
      capabilities: { hasPreciseTopology: true },
    });
  });

  it('should omit Tau interaction metadata when topology is disabled for production exports', () => {
    const geometry = createSimpleGeometry({
      name: 'ExportShape',
      faces: {
        vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        triangles: [0, 1, 2],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        faceGroups: [{ start: 0, count: 3, faceId: 123 }],
      },
      edges: {
        lines: [0, 0, 0, 1, 0, 0],
        edgeGroups: [{ start: 0, count: 6, edgeId: 456 }],
      },
    });

    const glb = convertReplicadGeometriesToGltf({
      geometries: [geometry],
      format: 'glb',
      includeTauTopology: false,
    });
    const { json } = readGlbJsonAndBin(glb);

    expect(json.extensionsUsed).toBeUndefined();
    expect(json.extensions?.[tauCadTopologyExtension]).toBeUndefined();
    expect(json.nodes[0]!.extras).toBeUndefined();
    expect(json.meshes[0]!.primitives[0]!.extras).toBeUndefined();
    expect(json.meshes[0]!.primitives[1]!.extras).toBeUndefined();
  });

  it('should produce valid glTF JSON output with base64 buffer', () => {
    const geometry = createSimpleGeometry();
    const gltfBytes = convertReplicadGeometriesToGltf({ geometries: [geometry], format: 'gltf' });

    const json = JSON.parse(new TextDecoder().decode(gltfBytes)) as {
      asset: { version: string; generator: string };
      meshes: unknown[];
      buffers: Array<{ uri: string }>;
    };

    expect(json.asset.version).toBe('2.0');
    expect(json.asset.generator).toMatch(/^@taucad\/runtime@\d+\.\d+\.\d+/);
    expect(json.meshes).toHaveLength(1);
    expect(json.buffers[0]!.uri).toMatch(/^data:application\/octet-stream;base64,/);
  });

  it('should transform coordinates from z-up to y-up and mm to meters', async () => {
    const geometry = createSimpleGeometry({
      faces: {
        vertices: [1000, 2000, 3000, 0, 0, 0, 1000, 0, 0],
        triangles: [0, 1, 2],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        faceGroups: [],
      },
    });

    const glb = convertReplicadGeometriesToGltf({ geometries: [geometry], format: 'glb' });
    const document = await new NodeIO().readBinary(glb);
    const positions = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute('POSITION')!;

    const vertex0 = positions.getElement(0, [0, 0, 0]);
    expect(vertex0[0]).toBeCloseTo(1, 4);
    expect(vertex0[1]).toBeCloseTo(3, 4);
    expect(vertex0[2]).toBeCloseTo(-2, 4);
  });

  it('should export z-up millimeter coordinates when requested', async () => {
    const geometry = createSimpleGeometry({
      faces: {
        vertices: [50, 25, 10, 0, 0, 0, 50, 0, 0],
        triangles: [0, 1, 2],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        faceGroups: [],
      },
    });

    const glb = convertReplicadGeometriesToGltf({
      geometries: [geometry],
      format: 'glb',
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
    });
    const document = await new NodeIO().readBinary(glb);
    const positions = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute('POSITION')!;

    expect(positions.getElement(0, [0, 0, 0])).toEqual([50, 25, 10]);
  });

  it('should apply default gray color when no color is specified', async () => {
    const geometry = createSimpleGeometry();
    const glb = convertReplicadGeometriesToGltf({ geometries: [geometry], format: 'glb' });
    const document = await new NodeIO().readBinary(glb);
    const material = document.getRoot().listMaterials()[0]!;

    const color = material.getBaseColorFactor();
    expect(color[0]).toBeCloseTo(0.7);
    expect(color[1]).toBeCloseTo(0.7);
    expect(color[2]).toBeCloseTo(0.7);
    expect(color[3]).toBeCloseTo(1);
  });

  it('should use provided metalness/roughness values when set', async () => {
    const geometry = createSimpleGeometry({ metalness: 0.9, roughness: 0.2 });
    const glb = convertReplicadGeometriesToGltf({ geometries: [geometry], format: 'glb' });
    const document = await new NodeIO().readBinary(glb);
    const material = document.getRoot().listMaterials()[0]!;

    expect(material.getMetallicFactor()).toBeCloseTo(0.9, 2);
    expect(material.getRoughnessFactor()).toBeCloseTo(0.2, 2);
  });

  it('should fall back to cadMaterialDefaults when metalness/roughness are not set', async () => {
    const geometry = createSimpleGeometry();
    const glb = convertReplicadGeometriesToGltf({ geometries: [geometry], format: 'glb' });
    const document = await new NodeIO().readBinary(glb);
    const material = document.getRoot().listMaterials()[0]!;

    expect(material.getMetallicFactor()).toBeCloseTo(0, 2);
    expect(material.getRoughnessFactor()).toBeCloseTo(0.35, 2);
  });

  describe('logger instrumentation', () => {
    it('should log a debug line with format/nodeCount/byteLength when a logger is supplied', () => {
      const debug = vi.fn();
      const logger = mock<RuntimeLogger>({ debug });
      const geometry = createSimpleGeometry({ name: 'Logged' });

      const glb = convertReplicadGeometriesToGltf({ geometries: [geometry], format: 'glb', logger });

      expect(debug).toHaveBeenCalledTimes(1);
      const message = debug.mock.calls[0]![0] as string;
      expect(message).toContain('format=glb');
      expect(message).toContain('nodeCount=1');
      expect(message).toContain(`byteLength=${glb.byteLength}`);
    });

    it('should report nodeCount=0 when given an empty geometries array', () => {
      const debug = vi.fn();
      const logger = mock<RuntimeLogger>({ debug });

      convertReplicadGeometriesToGltf({ geometries: [], format: 'glb', logger });

      expect(debug).toHaveBeenCalledTimes(1);
      expect(debug.mock.calls[0]![0] as string).toContain('nodeCount=0');
    });

    it('should not invoke any logger method when no logger is supplied', () => {
      // No throw / no crash means the optional path is exercised; assertion
      // is implicit (no logger to spy on). This locks in the optional contract.
      expect(() =>
        convertReplicadGeometriesToGltf({ geometries: [createSimpleGeometry()], format: 'glb' }),
      ).not.toThrow();
    });
  });
});
