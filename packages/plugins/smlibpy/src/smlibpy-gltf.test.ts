/* eslint-disable @typescript-eslint/naming-convention -- glTF extension keys use standardized names. */
// @vitest-environment node
import type { Volume } from '@gltf-transform/extensions';
import type { KernelIssue } from '@taucad/runtime/types';
import { tauCadTopologyExtension } from '@taucad/runtime/types';
import { glbToDocument } from '@taucad/runtime-testing';
import { describe, expect, it, vi } from 'vitest';

import { readSmlibpyMeshBundle } from '#smlibpy-bundle.js';
import type { SmlibpyGeometry } from '#smlibpy-bundle.js';
import { encodeMeshBundle, squareShape } from '#smlibpy-bundle.fixture.js';
import type { BundleShape } from '#smlibpy-bundle.fixture.js';
import { convertSmlibpyGeometriesToGltf } from '#smlibpy-gltf.js';
import type { SmlibpyGltfOptions } from '#smlibpy-gltf.js';

const geometry = (shape: Partial<BundleShape> = {}): SmlibpyGeometry =>
  readSmlibpyMeshBundle(encodeMeshBundle([{ ...squareShape, ...shape }])).geometries[0]!;

const read = async (bytes: Uint8Array<ArrayBuffer>) => glbToDocument(Uint8Array.from(bytes));

type Topology = {
  components: Array<{ id: string; name: string; faceGroups: unknown[]; edgeGroups: unknown[]; sourceRefs: unknown }>;
  mechanism?: {
    units: { length: string };
    links: Record<string, { components: string[] }>;
    joints: Record<string, { origin: number[] }>;
  };
};

const readTopology = (glb: Uint8Array<ArrayBuffer>): Topology | undefined => {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as {
    bufferViews: Array<{ byteOffset?: number; byteLength: number }>;
    extensions?: Record<string, { topologyBufferView: number }>;
  };
  const extension = json.extensions?.[tauCadTopologyExtension];
  if (extension === undefined) {
    return undefined;
  }
  const binaryStart = 20 + jsonLength + 8;
  const bufferView = json.bufferViews[extension.topologyBufferView]!;
  const start = binaryStart + (bufferView.byteOffset ?? 0);
  return JSON.parse(new TextDecoder().decode(glb.subarray(start, start + bufferView.byteLength))) as Topology;
};

const png = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP8zwACTGCSAQANHQEDgslx/wAAAABJRU5ErkJggg==',
    'base64',
  ),
);

describe('convertSmlibpyGeometriesToGltf', () => {
  it('writes one named node per shape with a face-grouped surface, an edge overlay and its topology', async () => {
    const glb = convertSmlibpyGeometriesToGltf({ geometries: [geometry({ name: 'Plate' }), geometry()] });

    const document = await read(glb);
    const nodes = document.getRoot().listNodes();
    expect(nodes.map((node) => node.getName())).toEqual(['Plate', 'Shape 2']);
    expect(
      nodes[0]!
        .getMesh()!
        .listPrimitives()
        .map((primitive) => primitive.getMode()),
    ).toEqual([4, 1]);
    const topology = readTopology(glb)!;
    expect(topology.components.map(({ id }) => id)).toEqual(['component:plate', 'component:node-1']);
    expect(topology.components[0]).toMatchObject({
      faceGroups: [{ start: 0, count: 6, faceId: 0 }],
      sourceRefs: { kernelId: 'smlibpy', faceGroupUnit: 'indices-v1', edgeGroupUnit: 'xyz-scalars-v1' },
    });
    expect(topology.components[0]!.edgeGroups).toHaveLength(4);
    // Y-up metres: (1, 1, 0) mm → (0.001, 0, -0.001) m.
    const positions = nodes[0]!.getMesh()!.listPrimitives()[0]!.getAttribute('POSITION')!;
    expect(positions.getElement(2, []).map((value) => Math.round(value * 1e9) / 1e9)).toEqual([0.001, 0, -0.001]);
  });

  it('writes the legacy appearance as a PBR material in linear colour', async () => {
    const glb = convertSmlibpyGeometriesToGltf({
      geometries: [
        geometry({ color: '#ff0000', opacity: 0.5, metalness: 0.8, roughness: 0.3 }),
        geometry({ roughness: 1 }),
        geometry({ opacity: 0.25 }),
        geometry({ color: '#ffffff' }),
      ],
    });

    const document = await read(glb);
    const materials = document
      .getRoot()
      .listNodes()
      .map((node) => node.getMesh()!.listPrimitives()[0]!.getMaterial()!);
    expect(materials[0]!.getBaseColorFactor()).toEqual([1, 0, 0, 0.5]);
    expect(materials[0]!.getAlphaMode()).toBe('BLEND');
    expect(materials[0]!.getMetallicFactor()).toBeCloseTo(0.8);
    expect(materials[0]!.getRoughnessFactor()).toBeCloseTo(0.3);
    expect(materials[1]!.getAlphaMode()).toBe('OPAQUE');
    expect(materials[1]!.getRoughnessFactor()).toBe(1);
    expect(materials[2]!.getBaseColorFactor()[3]).toBe(0.25);
    expect(materials[3]!.getBaseColorFactor()).toEqual([1, 1, 1, 1]);
  });

  it('writes authored materials with box UVs and tangents when they sample a texture or anisotropy', async () => {
    const textured = { pbrMetallicRoughness: { baseColorTexture: { index: 0 } } };
    const anisotropic = { extensions: { KHR_materials_anisotropy: { anisotropyStrength: 0.5 } } };
    const plain = { pbrMetallicRoughness: { baseColorFactor: [0, 0, 1, 1] } };
    const options: SmlibpyGltfOptions = {
      geometries: [
        geometry({ material: textured }),
        geometry({ material: anisotropic }),
        geometry({ material: plain }),
      ],
      images: [{ mimeType: 'image/png', data: png }],
      textures: [{ source: 0 }],
    };

    for (const coordinateSystem of ['y-up', 'z-up'] as const) {
      // oxlint-disable-next-line no-await-in-loop -- two frames, read in order.
      const document = await read(convertSmlibpyGeometriesToGltf({ ...options, coordinateSystem }));
      const surfaces = document
        .getRoot()
        .listNodes()
        .map((node) => node.getMesh()!.listPrimitives()[0]!);
      expect(surfaces[0]!.getAttribute('TEXCOORD_0')!.getCount()).toBe(4);
      expect(surfaces[0]!.getMaterial()!.getBaseColorTexture()).not.toBeNull();
      // Signed zeros aside, the +X tangent of a Z-up square stays +X in either frame; its handedness is +1.
      const tangent = surfaces[1]!
        .getAttribute('TANGENT')!
        .getElement(0, [0, 0, 0, 0])
        .map((value) => value + 0);
      expect(tangent).toEqual([1, 0, 0, 1]);
      expect(surfaces[2]!.getAttribute('TEXCOORD_0')).toBeNull();
    }
  });

  it('scales volume distances to the output unit', async () => {
    const volume = { extensions: { KHR_materials_volume: { thicknessFactor: 2, attenuationDistance: 3 } } };
    const bare = { extensions: { KHR_materials_volume: {} } };
    const write = (unit: 'meter' | 'millimeter') =>
      convertSmlibpyGeometriesToGltf({
        geometries: [geometry({ material: volume }), geometry({ material: bare })],
        unit: { length: unit },
      });
    const thickness = async (bytes: Uint8Array<ArrayBuffer>) => {
      const document = await read(bytes);
      return document
        .getRoot()
        .listMaterials()
        .flatMap((material) => material.getExtension<Volume>('KHR_materials_volume') ?? [])
        .map((extension) => extension.getThicknessFactor());
    };

    expect(await thickness(write('meter'))).toEqual([2, 0]);
    expect(await thickness(write('millimeter'))).toEqual([2000, 0]);
  });

  it('keeps curves and drops shapes with nothing to draw', async () => {
    const curve = geometry({ vertices: [], normals: [], triangles: [], faceGroups: [] });
    const degenerate = geometry({ triangles: [0, 0, 1], faceGroups: [{ start: 0, count: 3, faceId: 0 }], lines: [] });
    const empty = geometry({ vertices: [], normals: [], triangles: [], faceGroups: [], lines: [], edgeGroups: [] });

    const glb = convertSmlibpyGeometriesToGltf({ geometries: [curve, degenerate, empty] });

    const document = await read(glb);
    const nodes = document.getRoot().listNodes();
    expect(nodes).toHaveLength(1);
    expect(
      nodes[0]!
        .getMesh()!
        .listPrimitives()
        .map((primitive) => primitive.getMode()),
    ).toEqual([1]);
    expect(readTopology(glb)!.components).toHaveLength(1);
  });

  it('omits the overlay or the topology on request and writes glTF JSON', async () => {
    const noEdges = convertSmlibpyGeometriesToGltf({ geometries: [geometry()], includeEdges: false });
    const document = await read(noEdges);
    const primitives = document.getRoot().listNodes()[0]!.getMesh()!.listPrimitives();
    expect(primitives.map((primitive) => primitive.getMode())).toEqual([4]);
    expect(readTopology(noEdges)!.components[0]!.edgeGroups).toHaveLength(4);

    const bare = convertSmlibpyGeometriesToGltf({ geometries: [geometry()], includeTauTopology: false });
    expect(readTopology(bare)).toBeUndefined();

    const json = JSON.parse(
      new TextDecoder().decode(convertSmlibpyGeometriesToGltf({ geometries: [geometry()], format: 'gltf' })),
    ) as { asset: { version: string }; buffers: Array<{ uri: string }> };
    expect(json.asset.version).toBe('2.0');
    expect(json.buffers[0]!.uri).toMatch(/^data:application\/octet-stream;base64,/u);

    expect(convertSmlibpyGeometriesToGltf({ geometries: [] }).byteLength).toBeGreaterThan(0);
  });

  describe('mechanism', () => {
    const hinge = {
      schemaVersion: 1,
      units: { length: 'mm', angle: 'deg' },
      root: 'base',
      links: { base: { shapes: ['Base'] }, lid: { shapes: ['Lid'] } },
      joints: { hinge: { type: 'revolute', parent: 'base', child: 'lid', origin: [1, 1, 0], axis: [1, 0, 0] } },
    };
    const geometries = [geometry({ name: 'Base' }), geometry({ name: 'Lid' })];

    it('writes the mechanism in the vertices frame and unit', () => {
      const yUp = readTopology(convertSmlibpyGeometriesToGltf({ geometries, mechanism: hinge }))!.mechanism!;
      expect(yUp.units.length).toBe('m');
      expect(yUp.links).toEqual({ base: { components: ['component:base'] }, lid: { components: ['component:lid'] } });
      expect(yUp.joints['hinge']!.origin.map((value) => Math.round(value * 1e6) / 1e6)).toEqual([0.001, 0, -0.001]);

      const zUp = readTopology(
        convertSmlibpyGeometriesToGltf({
          geometries,
          mechanism: hinge,
          coordinateSystem: 'z-up',
          unit: { length: 'millimeter' },
        }),
      )!.mechanism!;
      expect(zUp.units.length).toBe('mm');
      expect(zUp.joints['hinge']!.origin).toEqual([1, 1, 0]);
    });

    it('reports an invalid mechanism with the smlibpy producer and still writes the geometry', () => {
      const onMechanismIssues = vi.fn<(issues: KernelIssue[]) => void>();

      const glb = convertSmlibpyGeometriesToGltf({ geometries, mechanism: 42, onMechanismIssues });

      expect(readTopology(glb)!.mechanism).toBeUndefined();
      expect(onMechanismIssues.mock.calls[0]?.[0]).toMatchObject([
        { code: 'INVALID_ANNOTATION', details: { producer: { kernelId: 'smlibpy' } } },
      ]);
      expect(() => convertSmlibpyGeometriesToGltf({ geometries, mechanism: 42 })).not.toThrow();
    });

    it('writes no mechanism without topology', () => {
      const glb = convertSmlibpyGeometriesToGltf({ geometries, mechanism: hinge, includeTauTopology: false });

      expect(readTopology(glb)).toBeUndefined();
    });
  });
});
