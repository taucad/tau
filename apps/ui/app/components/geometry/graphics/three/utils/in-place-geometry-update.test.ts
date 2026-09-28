import { describe, expect, it } from 'vitest';
import { writeGlb } from '@taucad/geometry-core';
import type { GlbMaterial, GlbResources } from '@taucad/geometry-core';
import { GLTFLoader } from 'three/addons';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { Vector2 } from 'three';
import type { BufferAttribute, InterleavedBufferAttribute, Mesh, Object3D } from 'three';
import { applyFatLineSegments } from '#components/geometry/graphics/three/materials/gltf-edges.js';
import {
  applyInPlaceGeometryUpdate,
  captureInPlaceGeometryTargets,
} from '#components/geometry/graphics/three/utils/in-place-geometry-update.js';

const surfaceMaterial: GlbMaterial = {
  doubleSided: false,
  alphaMode: 'OPAQUE',
  pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1], metallicFactor: 0.1, roughnessFactor: 0.8 },
};

type GlbOptions = {
  readonly lift?: number;
  readonly indices?: number[];
  readonly material?: GlbMaterial;
  readonly resources?: GlbResources;
  readonly uvOffset?: number;
};

function buildGlb({
  lift = 0,
  indices = [0, 1, 2],
  material = surfaceMaterial,
  resources,
  uvOffset = 0,
}: GlbOptions = {}): Uint8Array<ArrayBuffer> {
  const positions = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, lift]);
  const normals = Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  return writeGlb({
    ...resources,
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
          { mode: 1, positions, indices: Uint32Array.from([0, 1, 1, 2]), material },
        ],
      },
    ],
  });
}

async function present(bytes: Uint8Array<ArrayBuffer>): Promise<GLTF> {
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '');
  applyFatLineSegments(gltf, { resolution: new Vector2(800, 600), backend: 'webgl' });
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

describe('in-place geometry update', () => {
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
          resources: { ...resources, images: [{ mimeType: 'image/png', data: new Uint8Array([1, 2, 3, 5]) }] },
          lift: 2,
        }),
      ),
    ).toBe(false);
    expect(
      applyInPlaceGeometryUpdate(
        targets!,
        buildGlb({ resources: { ...resources, samplers: [{ wrapS: 33_071 }] }, lift: 2 }),
      ),
    ).toBe(false);
    expect(position.getZ(2)).toBe(1);
  });
});
