import { describe, expect, it } from 'vitest';
import { writeGlb } from '@taucad/geometry-core';
import { tauCadTopologyExtension } from '@taucad/types/constants';
import type { GlbMaterial, GlbResources } from '@taucad/geometry-core';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { Box3, Raycaster, Vector2, Vector3 } from 'three';
import { getOrBuildBvh } from '#components/geometry/graphics/three/utils/bvh-cache.js';
import { parseGltfBytes } from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import type { GltfJson } from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import type { BufferGeometry, BufferAttribute, InterleavedBufferAttribute, Mesh, Object3D } from 'three';
import { applyFatLineSegments } from '#components/geometry/graphics/three/materials/gltf-edges.js';
import {
  applyInPlaceGeometryUpdate,
  captureInPlaceGeometryTargets,
} from '#components/geometry/graphics/three/utils/in-place-geometry-update.js';
import { raycastFirstVisibleMeshHit } from '#components/geometry/graphics/three/utils/bvh-raycast.js';

const surfaceMaterial: GlbMaterial = {
  doubleSided: false,
  alphaMode: 'OPAQUE',
  pbrMetallicRoughness: {
    baseColorFactor: [0.5, 0.5, 0.5, 1],
    metallicFactor: 0.1,
    roughnessFactor: 0.8,
  },
};

type GlbOptions = {
  readonly lift?: number;
  readonly indices?: number[];
  readonly material?: GlbMaterial;
  readonly resources?: GlbResources;
  readonly uvOffset?: number;
  readonly topology?: { readonly id: string; readonly binary: boolean };
};

function buildGlb({
  lift = 0,
  indices = [0, 1, 2],
  material = surfaceMaterial,
  resources,
  uvOffset = 0,
  topology,
}: GlbOptions = {}): Uint8Array<ArrayBuffer> {
  const positions = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, lift]);
  const normals = Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  return writeGlb({
    ...resources,
    ...(topology
      ? {
          extensionsUsed: ['TAU_cad_topology'],
          ...(topology.binary
            ? {
                extraBufferViews: [
                  {
                    key: 'topology',
                    data: new TextEncoder().encode(
                      JSON.stringify({
                        components: [{ id: topology.id, nodeIndex: 0 }],
                      }),
                    ),
                  },
                ],
                extensions: (views: Record<string, number>) => ({
                  [tauCadTopologyExtension]: { topologyBufferView: views['topology']! },
                }),
              }
            : {
                extensions: {
                  [tauCadTopologyExtension]: {
                    components: [{ id: topology.id, nodeIndex: 0 }],
                  },
                },
              }),
        }
      : {}),
    nodes: [
      {
        name: 'Part',
        primitives: [
          {
            mode: 4,
            positions,
            normals,
            indices: Uint32Array.from(indices),
            material,
            tangents: Float32Array.from([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]),
            texCoords: [Float32Array.from([uvOffset, 0, 1, 0, 0, 1]), Float32Array.from([0, uvOffset, 1, 0, 0, 1])],
          },
          {
            mode: 1,
            positions,
            indices: Uint32Array.from([0, 1, 1, 2]),
            material,
          },
        ],
      },
    ],
  });
}

function editJson(bytes: Uint8Array<ArrayBuffer>, edit: (json: GltfJson) => void): Uint8Array<ArrayBuffer> {
  const { json, bin } = parseGltfBytes(bytes);
  edit(json);
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const length = Math.ceil(encoded.length / 4) * 4;
  const result = new Uint8Array(28 + length + bin.length);
  const view = new DataView(result.buffer);
  view.setUint32(0, 0x46_54_6c_67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, result.length, true);
  view.setUint32(12, length, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  result.fill(32, 20, 20 + length);
  result.set(encoded, 20);
  view.setUint32(20 + length, bin.length, true);
  view.setUint32(24 + length, 0x00_4e_49_42, true);
  result.set(bin, 28 + length);
  return result;
}

async function present(bytes: Uint8Array<ArrayBuffer>): Promise<GLTF> {
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '');
  applyFatLineSegments(gltf, {
    resolution: new Vector2(800, 600),
    backend: 'webgl',
  });
  return gltf;
}

function findSurface(scene: Object3D): Mesh {
  let found: Mesh | undefined;
  scene.traverse((object) => {
    if (!found && object.type === 'Mesh') {
      found = object as Mesh;
    }
  });
  if (!found) {
    throw new Error('Expected a surface mesh in the presented scene.');
  }
  return found;
}

function findFatLine(scene: Object3D): Mesh {
  let found: Mesh | undefined;
  scene.traverse((object) => {
    if (!found && object.type === 'LineSegments2') {
      found = object as Mesh;
    }
  });
  if (!found) {
    throw new Error('Expected a fat line in the presented scene.');
  }
  return found;
}

// Repack only the test fixture JSON; retain the writer's BIN chunk and accessor offsets.
function rewriteJson(bytes: Uint8Array<ArrayBuffer>, update: (json: GltfJson) => void): Uint8Array<ArrayBuffer> {
  const { json, bin } = parseGltfBytes(bytes);
  update(json);
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(text.length / 4) * 4;
  const binaryLength = Math.ceil(bin.length / 4) * 4;
  const result = new Uint8Array(28 + jsonLength + binaryLength);
  const view = new DataView(result.buffer);
  view.setUint32(0, 0x46_54_6c_67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, result.length, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  result.fill(0x20, 20, 20 + jsonLength);
  result.set(text, 20);
  view.setUint32(20 + jsonLength, binaryLength, true);
  view.setUint32(24 + jsonLength, 0x00_4e_49_42, true);
  result.set(bin, 28 + jsonLength);
  return result;
}

function snapshotGeometry(geometry: BufferGeometry) {
  const attributes = Object.entries(geometry.attributes).map(([name, attribute]) => {
    const data = 'data' in attribute ? attribute.data : attribute;
    return {
      name,
      attribute,
      data,
      array: data.array,
      values: [...data.array],
      version: data.version,
    };
  });
  const { index } = geometry;
  const indexValues = index ? [...index.array] : undefined;
  const indexVersion = index?.version;
  const box = geometry.boundingBox;
  const sphere = geometry.boundingSphere;
  const boxValue = box?.clone() ?? null;
  const sphereValue = sphere?.clone() ?? null;
  return () => {
    for (const before of attributes) {
      const attribute = geometry.getAttribute(before.name);
      const data = 'data' in attribute ? attribute.data : attribute;
      expect(attribute).toBe(before.attribute);
      expect(data).toBe(before.data);
      expect(data.array).toBe(before.array);
      expect([...data.array]).toEqual(before.values);
      expect(data.version).toBe(before.version);
    }
    expect(geometry.index).toBe(index);
    expect(index ? [...index.array] : undefined).toEqual(indexValues);
    expect(index?.version).toBe(indexVersion);
    expect(geometry.boundingBox).toBe(box);
    expect(geometry.boundingSphere).toBe(sphere);
    expect(box).toEqual(boxValue);
    expect(sphere).toEqual(sphereValue);
  };
}

describe('in-place geometry update', () => {
  it('should move actual shared occurrence nodes without uploads or rebuilding their BVH', async () => {
    const repeated = (translations: readonly number[], rotate = false) =>
      rewriteJson(buildGlb(), (json) => {
        json.nodes = translations.map((translation, nodeIndex) => ({
          ...json.nodes![0]!,
          name: `Occurrence ${nodeIndex}`,
          translation: [translation, 0, 0],
          rotation: rotate && nodeIndex === 0 ? [0, 0, Math.SQRT1_2, Math.SQRT1_2] : [0, 0, 0, 1],
        }));
        json.scenes![0]!.nodes = [0, 1];
      });
    const bytes = repeated([0, 5]);
    const gltf = await present(bytes);
    const surfaces: Mesh[] = [];
    gltf.scene.traverse((object) => {
      if (object.type === 'Mesh') {
        surfaces.push(object as Mesh);
      }
    });
    expect(surfaces).toHaveLength(2);
    expect(surfaces[1]?.geometry).toBe(surfaces[0]?.geometry);
    const surface = surfaces[0]!;
    const bvh = getOrBuildBvh(surface.geometry);
    const unchanged = snapshotGeometry(surface.geometry);
    const targets = captureInPlaceGeometryTargets({ scene: gltf.scene, associations: gltf.parser.associations, bytes });
    expect(targets?.nodes).toHaveLength(2);
    expect(applyInPlaceGeometryUpdate(targets!, repeated([3, 8], true))).toBe(true);
    unchanged();
    expect(getOrBuildBvh(surface.geometry)).toBe(bvh);
    expect(surfaces.map((mesh) => mesh.getWorldPosition(new Vector3()).x)).toEqual([3, 8]);
    expect(new Box3().setFromObject(gltf.scene).max.x).toBe(9);
    const hit = raycastFirstVisibleMeshHit({
      raycaster: new Raycaster(new Vector3(8.25, 0.25, 3), new Vector3(0, 0, -1)),
      meshes: surfaces,
    });
    expect(hit?.object).toBe(surfaces[1]);
    // A source pose that did not change must leave a later animation pose alone.
    targets!.nodes[0]!.object.position.x = 30;
    targets!.nodes[0]!.object.updateMatrix();
    expect(applyInPlaceGeometryUpdate(targets!, repeated([3, 8], true))).toBe(true);
    expect(targets!.nodes[0]!.object.position.x).toBe(30);
    expect(applyInPlaceGeometryUpdate(targets!, repeated([0, 5]))).toBe(true);
    expect(surfaces.map((mesh) => mesh.getWorldPosition(new Vector3()).x)).toEqual([0, 5]);
    unchanged();
  });

  it.each([
    [2, 1, 1],
    [-1, 1, 1],
  ])('should reject scale or mirror pose changes atomically: %s', async (x, y, z) => {
    const bytes = buildGlb();
    const gltf = await present(bytes);
    const surface = findSurface(gltf.scene);
    const unchanged = snapshotGeometry(surface.geometry);
    const targets = captureInPlaceGeometryTargets({ scene: gltf.scene, associations: gltf.parser.associations, bytes });
    const matrices = targets!.nodes.map(({ object }) => object.matrix.clone());
    const incoming = rewriteJson(buildGlb({ lift: 5 }), (json) => {
      json.nodes![0]!.translation = [12, 0, 0];
      json.nodes![0]!.scale = [x, y, z];
    });
    expect(applyInPlaceGeometryUpdate(targets!, incoming)).toBe(false);
    unchanged();
    expect(targets!.nodes.map(({ object }) => object.matrix)).toEqual(matrices);
  });

  it('should upload only a changed unrelated part while retaining the real shared occurrence geometry and BVH', async () => {
    const source = (otherLift: number) =>
      rewriteJson(
        writeGlb({
          nodes: [0, otherLift].map((lift, nodeIndex) => ({
            name: `Part ${nodeIndex}`,
            primitives: [
              {
                mode: 4,
                positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, lift]),
                indices: Uint32Array.from([0, 1, 2]),
                material: surfaceMaterial,
              },
            ],
          })),
        }),
        (json) => {
          json.nodes!.push({ ...json.nodes![0]!, name: 'Repeated part', translation: [5, 0, 0] });
          json.scenes![0]!.nodes!.push(2);
        },
      );
    const bytes = source(0);
    const gltf = await present(bytes);
    const surfaces: Mesh[] = [];
    gltf.scene.traverse((object) => {
      if (object.type === 'Mesh') {
        surfaces.push(object as Mesh);
      }
    });
    expect(surfaces).toHaveLength(3);
    const [first, other, repeated] = surfaces as [Mesh, Mesh, Mesh];
    expect(repeated.geometry).toBe(first.geometry);
    expect(other.geometry).not.toBe(first.geometry);
    const bvh = getOrBuildBvh(first.geometry);
    const unchanged = snapshotGeometry(first.geometry);
    const otherPosition = other.geometry.getAttribute('position') as BufferAttribute;
    const { version } = otherPosition;
    const targets = captureInPlaceGeometryTargets({ scene: gltf.scene, associations: gltf.parser.associations, bytes });
    expect(applyInPlaceGeometryUpdate(targets!, source(5))).toBe(true);
    unchanged();
    expect(getOrBuildBvh(first.geometry)).toBe(bvh);
    expect(repeated.geometry).toBe(first.geometry);
    expect(otherPosition.getZ(2)).toBe(5);
    expect(otherPosition.version).toBe(version + 1);
  });

  it('should write a same-topology result into the presented buffers without re-parsing', async () => {
    const gltf = await present(buildGlb());
    const targets = captureInPlaceGeometryTargets({
      scene: gltf.scene,
      associations: gltf.parser.associations as ReadonlyMap<Object3D, { meshes?: number; primitives?: number }>,
      bytes: buildGlb(),
    });
    expect(targets).toBeDefined();

    const surface = findSurface(gltf.scene);
    const position = surface.geometry.getAttribute('position') as BufferAttribute;
    const positionVersionBefore = position.version;
    const fatLine = findFatLine(gltf.scene);
    const instanceStart = fatLine.geometry.getAttribute('instanceStart') as InterleavedBufferAttribute;

    expect(applyInPlaceGeometryUpdate(targets!, buildGlb({ lift: 5, uvOffset: 0.5 }))).toBe(true);

    expect([...(position.array as Float32Array)]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 5]);
    expect(position.version).toBeGreaterThan(positionVersionBefore);
    expect(surface.geometry.getAttribute('uv').getX(0)).toBe(0.5);
    expect(surface.geometry.getAttribute('uv1').getY(0)).toBe(0.5);
    expect(surface.geometry.getAttribute('tangent').getW(0)).toBe(1);
    expect(surface.geometry.boundingBox?.max.toArray()).toEqual([1, 1, 5]);
    expect(surface.geometry.boundingSphere).not.toBeNull();
    // Edges are de-indexed copies: the second segment ends at the lifted vertex.
    expect([...(instanceStart.data.array as Float32Array)].slice(6)).toEqual([1, 0, 0, 0, 1, 5]);
  });

  it('should update every independent occurrence of a primitive', async () => {
    const repeat = (bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> =>
      editJson(bytes, (json) => {
        json.nodes!.push({ ...json.nodes![0]!, translation: [2, 0, 0] });
        json.scenes![0]!.nodes!.push(json.nodes!.length - 1);
      });
    const bytes = repeat(buildGlb());
    const gltf = await present(bytes);
    const edges: Mesh[] = [];
    gltf.scene.traverse((object) => {
      if (object.type === 'LineSegments2') {
        edges.push(object as Mesh);
      }
    });
    expect(edges).toHaveLength(2);
    const targets = captureInPlaceGeometryTargets({ scene: gltf.scene, associations: gltf.parser.associations, bytes });
    expect(applyInPlaceGeometryUpdate(targets!, repeat(buildGlb({ lift: 5 })))).toBe(true);
    const endpoints = edges[1]!.geometry.getAttribute('instanceEnd') as InterleavedBufferAttribute;
    expect(endpoints.getZ(1)).toBe(5);
  });

  it('should leave identical payload buffers and unchanged attributes clean', async () => {
    const bytes = buildGlb();
    const gltf = await present(bytes);
    const targets = captureInPlaceGeometryTargets({ scene: gltf.scene, associations: gltf.parser.associations, bytes });
    const surface = findSurface(gltf.scene);
    const position = surface.geometry.getAttribute('position') as BufferAttribute;
    const normal = surface.geometry.getAttribute('normal') as BufferAttribute;
    const edges = findFatLine(gltf.scene).geometry.getAttribute('instanceStart') as InterleavedBufferAttribute;
    const versions = [position.version, normal.version, edges.data.version];
    expect(applyInPlaceGeometryUpdate(targets!, buildGlb())).toBe(true);
    expect([position.version, normal.version, edges.data.version]).toEqual(versions);
    expect(applyInPlaceGeometryUpdate(targets!, buildGlb({ lift: 1 }))).toBe(true);
    expect(normal.version).toBe(versions[1]);
  });

  it('should refuse scene transform or ownership changes before writing buffers', async () => {
    const bytes = buildGlb();
    const gltf = await present(bytes);
    const targets = captureInPlaceGeometryTargets({ scene: gltf.scene, associations: gltf.parser.associations, bytes });
    const changed = editJson(buildGlb({ lift: 5 }), (json) => {
      json.nodes![0]!.translation = [2, 0, 0];
    });
    expect(applyInPlaceGeometryUpdate(targets!, changed)).toBe(false);
    expect(findSurface(gltf.scene).geometry.getAttribute('position').getZ(2)).toBe(0);
  });

  it('should refuse a result whose index buffer changed', async () => {
    const gltf = await present(buildGlb());
    const targets = captureInPlaceGeometryTargets({
      scene: gltf.scene,
      associations: gltf.parser.associations as ReadonlyMap<Object3D, { meshes?: number; primitives?: number }>,
      bytes: buildGlb(),
    });
    const position = findSurface(gltf.scene).geometry.getAttribute('position') as BufferAttribute;

    expect(applyInPlaceGeometryUpdate(targets!, buildGlb({ lift: 5, indices: [0, 2, 1] }))).toBe(false);
    expect([...(position.array as Float32Array)]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  });

  it('should refuse a result whose materials changed', async () => {
    const gltf = await present(buildGlb());
    const targets = captureInPlaceGeometryTargets({
      scene: gltf.scene,
      associations: gltf.parser.associations as ReadonlyMap<Object3D, { meshes?: number; primitives?: number }>,
      bytes: buildGlb(),
    });
    const position = findSurface(gltf.scene).geometry.getAttribute('position') as BufferAttribute;

    const recoloured = {
      ...surfaceMaterial,
      pbrMetallicRoughness: {
        ...surfaceMaterial.pbrMetallicRoughness,
        baseColorFactor: [1, 0, 0, 1] as [number, number, number, number],
      },
    };
    expect(applyInPlaceGeometryUpdate(targets!, buildGlb({ lift: 5, material: recoloured }))).toBe(false);
    expect([...(position.array as Float32Array)]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  });
  it('reloads changed image bytes and samplers even when material indices are unchanged', async () => {
    const resources: GlbResources = {
      images: [{ mimeType: 'image/png', data: new Uint8Array([1, 2, 3, 4]) }],
      textures: [{ source: 0, sampler: 0 }],
      samplers: [{ wrapS: 10_497 }],
    };
    const bytes = buildGlb({ resources });
    const gltf = await present(bytes);
    const targets = captureInPlaceGeometryTargets({
      scene: gltf.scene,
      associations: gltf.parser.associations as ReadonlyMap<Object3D, { meshes?: number; primitives?: number }>,
      bytes,
    });
    const position = findSurface(gltf.scene).geometry.getAttribute('position') as BufferAttribute;
    expect(applyInPlaceGeometryUpdate(targets!, buildGlb({ resources, lift: 1 }))).toBe(true);
    expect(
      applyInPlaceGeometryUpdate(
        targets!,
        buildGlb({
          resources: {
            ...resources,
            images: [{ mimeType: 'image/png', data: new Uint8Array([1, 2, 3, 5]) }],
          },
          lift: 2,
        }),
      ),
    ).toBe(false);
    expect(
      applyInPlaceGeometryUpdate(
        targets!,
        buildGlb({
          resources: { ...resources, samplers: [{ wrapS: 33_071 }] },
          lift: 2,
        }),
      ),
    ).toBe(false);
    expect(position.getZ(2)).toBe(1);
  });

  it.each([
    [
      'non-rigid node transform',
      (json: GltfJson) => {
        json.nodes![0]!.scale = [2, 1, 1];
      },
    ],
    [
      'node name',
      (json: GltfJson) => {
        json.nodes![0]!.name = 'Replacement';
      },
    ],
    [
      'node hierarchy',
      (json: GltfJson) => {
        json.nodes!.push({ name: 'Parent', children: [0] });
        json.scenes![0]!.nodes = [json.nodes!.length - 1];
      },
    ],
    [
      'scene roots',
      (json: GltfJson) => {
        json.scenes![0]!.nodes = [];
      },
    ],
    [
      'active scene',
      (json: GltfJson) => {
        json.scenes!.push({ nodes: [] });
        json.scene = json.scenes!.length - 1;
      },
    ],
  ] as const)('should reject changed %s before mutating any presented geometry', async (_name, change) => {
    const bytes = buildGlb();
    const gltf = await present(bytes);
    const surface = findSurface(gltf.scene);
    const line = findFatLine(gltf.scene);
    const bvh = getOrBuildBvh(surface.geometry);
    const unchangedSurface = snapshotGeometry(surface.geometry);
    const unchangedLine = snapshotGeometry(line.geometry);
    const targets = captureInPlaceGeometryTargets({
      scene: gltf.scene,
      associations: gltf.parser.associations as ReadonlyMap<Object3D, { meshes?: number; primitives?: number }>,
      bytes,
    });
    expect(targets).toBeDefined();
    expect(applyInPlaceGeometryUpdate(targets!, rewriteJson(buildGlb({ lift: 5 }), change))).toBe(false);
    unchangedSurface();
    unchangedLine();
    expect(getOrBuildBvh(surface.geometry)).toBe(bvh);
  });

  it.each([false, true])(
    'should reject changed topology component identity with binary=%s atomically',
    async (binary) => {
      const bytes = buildGlb({ topology: { id: 'part:original', binary } });
      const gltf = await present(bytes);
      const surface = findSurface(gltf.scene);
      const line = findFatLine(gltf.scene);
      const bvh = getOrBuildBvh(surface.geometry);
      const unchangedSurface = snapshotGeometry(surface.geometry);
      const unchangedLine = snapshotGeometry(line.geometry);
      const targets = captureInPlaceGeometryTargets({
        scene: gltf.scene,
        associations: gltf.parser.associations as ReadonlyMap<Object3D, { meshes?: number; primitives?: number }>,
        bytes,
      });
      expect(targets).toBeDefined();
      expect(
        applyInPlaceGeometryUpdate(targets!, buildGlb({ lift: 5, topology: { id: 'part:replacement', binary } })),
      ).toBe(false);
      unchangedSurface();
      unchangedLine();
      expect(getOrBuildBvh(surface.geometry)).toBe(bvh);
    },
  );

  it('should leave equal buffers, bounds and the existing BVH untouched', async () => {
    const bytes = buildGlb();
    const gltf = await present(bytes);
    const surface = findSurface(gltf.scene);
    const line = findFatLine(gltf.scene);
    const bvh = getOrBuildBvh(surface.geometry);
    const unchangedSurface = snapshotGeometry(surface.geometry);
    const unchangedLine = snapshotGeometry(line.geometry);
    const targets = captureInPlaceGeometryTargets({
      scene: gltf.scene,
      associations: gltf.parser.associations as ReadonlyMap<Object3D, { meshes?: number; primitives?: number }>,
      bytes,
    });
    expect(applyInPlaceGeometryUpdate(targets!, buildGlb())).toBe(true);
    unchangedSurface();
    unchangedLine();
    expect(getOrBuildBvh(surface.geometry)).toBe(bvh);
  });

  it('should bump only position and fat-line data for changed POSITION and rebuild the BVH', async () => {
    const bytes = buildGlb();
    const gltf = await present(bytes);
    const surface = findSurface(gltf.scene);
    const position = surface.geometry.getAttribute('position') as BufferAttribute;
    const normal = surface.geometry.getAttribute('normal') as BufferAttribute;
    const uv = surface.geometry.getAttribute('uv') as BufferAttribute;
    const tangent = surface.geometry.getAttribute('tangent') as BufferAttribute;
    const index = surface.geometry.index!;
    const start = findFatLine(gltf.scene).geometry.getAttribute('instanceStart') as InterleavedBufferAttribute;
    const versions = [position.version, normal.version, uv.version, tangent.version, index.version, start.data.version];
    const bvh = getOrBuildBvh(surface.geometry);
    const targets = captureInPlaceGeometryTargets({
      scene: gltf.scene,
      associations: gltf.parser.associations as ReadonlyMap<Object3D, { meshes?: number; primitives?: number }>,
      bytes,
    });
    expect(applyInPlaceGeometryUpdate(targets!, buildGlb({ lift: 5 }))).toBe(true);
    expect([position.version, normal.version, uv.version, tangent.version, index.version, start.data.version]).toEqual([
      versions[0]! + 1,
      versions[1],
      versions[2],
      versions[3],
      versions[4],
      versions[5]! + 1,
    ]);
    expect(surface.geometry.getAttribute('position')).toBe(position);
    expect(position.getZ(2)).toBe(5);
    expect(surface.geometry.boundingBox?.max.z).toBe(5);
    expect(getOrBuildBvh(surface.geometry)).not.toBe(bvh);
  });

  it('should preserve position, bounds, fat-line buffers and BVH when only UV changes', async () => {
    const bytes = buildGlb();
    const gltf = await present(bytes);
    const surface = findSurface(gltf.scene);
    const line = findFatLine(gltf.scene);
    const bvh = getOrBuildBvh(surface.geometry);
    const position = surface.geometry.getAttribute('position') as BufferAttribute;
    const positionVersion = position.version;
    const uv = surface.geometry.getAttribute('uv') as BufferAttribute;
    const uvVersion = uv.version;
    const box = surface.geometry.boundingBox;
    const sphere = surface.geometry.boundingSphere;
    const unchangedLine = snapshotGeometry(line.geometry);
    const targets = captureInPlaceGeometryTargets({
      scene: gltf.scene,
      associations: gltf.parser.associations as ReadonlyMap<Object3D, { meshes?: number; primitives?: number }>,
      bytes,
    });
    expect(applyInPlaceGeometryUpdate(targets!, buildGlb({ uvOffset: 0.5 }))).toBe(true);
    expect(surface.geometry.getAttribute('position')).toBe(position);
    expect(position.version).toBe(positionVersion);
    expect(uv.version).toBe(uvVersion + 1);
    expect(uv.getX(0)).toBe(0.5);
    expect(surface.geometry.boundingBox).toBe(box);
    expect(surface.geometry.boundingSphere).toBe(sphere);
    unchangedLine();
    expect(getOrBuildBvh(surface.geometry)).toBe(bvh);
  });

  it.each([false, true])('should update every live primitive instance with shared geometry=%s', async (shared) => {
    const bytes = rewriteJson(buildGlb(), (json) => {
      json.nodes!.push({ ...json.nodes![0]!, name: 'Second instance' });
      json.scenes![0]!.nodes!.push(json.nodes!.length - 1);
    });
    const gltf = await present(bytes);
    const surfaces: Mesh[] = [];
    const lines: Mesh[] = [];
    gltf.scene.traverse((object) => {
      if (object.type === 'Mesh') {
        surfaces.push(object as Mesh);
      }
      if (object.type === 'LineSegments2') {
        lines.push(object as Mesh);
      }
    });
    expect(surfaces).toHaveLength(2);
    expect(lines).toHaveLength(2);
    const [surface, secondSurface] = surfaces as [Mesh, Mesh];
    const [line, secondLine] = lines as [Mesh, Mesh];
    secondSurface.geometry = shared ? surface.geometry : surface.geometry.clone();
    secondLine.geometry = shared ? line.geometry : line.geometry.clone();
    const position = surface.geometry.getAttribute('position') as BufferAttribute;
    const secondPosition = secondSurface.geometry.getAttribute('position') as BufferAttribute;
    const start = line.geometry.getAttribute('instanceStart') as InterleavedBufferAttribute;
    const secondStart = secondLine.geometry.getAttribute('instanceStart') as InterleavedBufferAttribute;
    const versions = [position.version, secondPosition.version, start.data.version, secondStart.data.version];
    const targets = captureInPlaceGeometryTargets({
      scene: gltf.scene,
      associations: gltf.parser.associations as ReadonlyMap<Object3D, { meshes?: number; primitives?: number }>,
      bytes,
    });
    expect(targets).toBeDefined();
    const updated = rewriteJson(buildGlb({ lift: 5 }), (json) => {
      json.nodes!.push({ ...json.nodes![0]!, name: 'Second instance' });
      json.scenes![0]!.nodes!.push(json.nodes!.length - 1);
    });
    expect(applyInPlaceGeometryUpdate(targets!, updated)).toBe(true);
    expect([position.getZ(2), secondPosition.getZ(2)]).toEqual([5, 5]);
    expect([...(start.data.array as Float32Array)]).toEqual([...(secondStart.data.array as Float32Array)]);
    expect((start.data.array as Float32Array)[11]).toBe(5);
    expect([position.version, secondPosition.version, start.data.version, secondStart.data.version]).toEqual(
      versions.map((version) => version + 1),
    );
    expect(secondSurface.geometry === surface.geometry).toBe(shared);
    expect(secondLine.geometry === line.geometry).toBe(shared);
  });

  it('should refuse capture when distinct primitive addresses share a mutable geometry', async () => {
    const bytes = buildGlb();
    const gltf = await present(bytes);
    const surface = findSurface(gltf.scene);
    const line = findFatLine(gltf.scene);
    line.geometry = surface.geometry;
    const unchanged = snapshotGeometry(surface.geometry);
    expect(
      captureInPlaceGeometryTargets({
        scene: gltf.scene,
        associations: gltf.parser.associations as ReadonlyMap<Object3D, { meshes?: number; primitives?: number }>,
        bytes,
      }),
    ).toBeUndefined();
    unchanged();
  });

  it('should refuse material-split surfaces that share accessor storage across primitive addresses', async () => {
    const splitMaterials = (json: GltfJson, splitPosition: boolean) => {
      const primitive = json.meshes![0]!.primitives![0]!;
      const indices = json.accessors!.push({ ...json.accessors![primitive.indices!]! }) - 1;
      const material = json.materials!.push({ ...json.materials![primitive.material!]! }) - 1;
      const attributes = { ...primitive.attributes };
      attributes['POSITION'] = splitPosition ? primitive.attributes!['NORMAL']! : primitive.attributes!['POSITION']!;
      json.meshes![0]!.primitives!.splice(1, 0, { ...primitive, indices, material, attributes });
    };
    const bytes = rewriteJson(buildGlb(), (json) => {
      splitMaterials(json, false);
    });
    const incoming = rewriteJson(buildGlb({ lift: 5 }), (json) => {
      splitMaterials(json, true);
    });
    const gltf = await present(bytes);
    const replacement = await present(incoming);
    const surfaces: Mesh[] = [];
    const replacements: Mesh[] = [];
    gltf.scene.traverse((object) => {
      if (object.type === 'Mesh') {
        surfaces.push(object as Mesh);
      }
    });
    replacement.scene.traverse((object) => {
      if (object.type === 'Mesh') {
        replacements.push(object as Mesh);
      }
    });
    expect(surfaces).toHaveLength(2);
    expect(replacements).toHaveLength(2);
    const [first, second] = surfaces as [Mesh, Mesh];
    expect(first.geometry).not.toBe(second.geometry);
    expect(first.material).not.toBe(second.material);
    expect(first.geometry.getAttribute('position')).toBe(second.geometry.getAttribute('position'));
    const positions = replacements.map((mesh) => mesh.geometry.getAttribute('position'));
    expect(positions[0]!.count).toBe(positions[1]!.count);
    expect(positions[0]!.itemSize).toBe(positions[1]!.itemSize);
    expect([...positions[0]!.array]).not.toEqual([...positions[1]!.array]);
    expect([...replacements[0]!.geometry.index!.array]).toEqual([...replacements[1]!.geometry.index!.array]);
    const unchanged = surfaces.map((mesh) => snapshotGeometry(mesh.geometry));
    unchanged.push(snapshotGeometry(findFatLine(gltf.scene).geometry));
    expect(
      captureInPlaceGeometryTargets({
        scene: gltf.scene,
        associations: gltf.parser.associations as ReadonlyMap<Object3D, { meshes?: number; primitives?: number }>,
        bytes,
      }),
    ).toBeUndefined();
    for (const assertUnchanged of unchanged) {
      assertUnchanged();
    }
  });

  it('should refuse POSITION and NORMAL semantics backed by the same loader accessor', async () => {
    const bytes = rewriteJson(buildGlb(), (json) => {
      const attributes = json.meshes![0]!.primitives![0]!.attributes!;
      attributes['NORMAL'] = attributes['POSITION']!;
    });
    const gltf = await present(bytes);
    const { geometry } = findSurface(gltf.scene);
    expect(geometry.getAttribute('position')).toBe(geometry.getAttribute('normal'));
    const unchanged = snapshotGeometry(geometry);
    expect(
      captureInPlaceGeometryTargets({
        scene: gltf.scene,
        associations: gltf.parser.associations as ReadonlyMap<Object3D, { meshes?: number; primitives?: number }>,
        bytes,
      }),
    ).toBeUndefined();
    unchanged();
  });

  it.each(['normalized', 'sparse'] as const)(
    'should refuse an incoming %s accessor without mutation',
    async (change) => {
      const bytes = buildGlb();
      const gltf = await present(bytes);
      const unchanged = snapshotGeometry(findSurface(gltf.scene).geometry);
      const lineUnchanged = snapshotGeometry(findFatLine(gltf.scene).geometry);
      const targets = captureInPlaceGeometryTargets({
        scene: gltf.scene,
        associations: gltf.parser.associations as ReadonlyMap<Object3D, { meshes?: number; primitives?: number }>,
        bytes,
      });
      const incoming = rewriteJson(buildGlb({ lift: 5 }), (json) => {
        const primitive = json.meshes![0]!.primitives![0]!;
        const accessor = json.accessors![primitive.attributes!['POSITION']!]!;
        if (change === 'normalized') {
          accessor.normalized = true;
        } else {
          accessor.sparse = {
            count: 1,
            indices: {
              bufferView: json.accessors![primitive.indices!]!.bufferView!,
              componentType: 5125,
            },
            values: { bufferView: accessor.bufferView! },
          };
        }
      });
      expect(targets).toBeDefined();
      expect(applyInPlaceGeometryUpdate(targets!, incoming)).toBe(false);
      unchanged();
      lineUnchanged();
    },
  );
});
