// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { writeGlb } from '@taucad/geometry-core';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { Vector2, Vector3 } from 'three';
import type { Mesh, Object3D } from 'three';
import { applyFatLineSegments } from '#graphics/three/materials/gltf-edges.js';
import { separateGltfNodeChildren } from '#graphics/three/utils/gltf-node-groups.js';
import type { GltfNodeAssociation } from '#graphics/three/utils/gltf-node-groups.js';
import {
  buildModuleAboveSolidGlb,
  nodeChildrenTestMaterial as material,
} from '#graphics/three/utils/gltf-node-groups.test-utils.js';

const parse = async (): Promise<GLTF> => new GLTFLoader().parseAsync(buildModuleAboveSolidGlb().buffer, '');

const associationsOf = (gltf: GLTF): Map<Object3D, GltfNodeAssociation | undefined> =>
  gltf.parser.associations as Map<Object3D, GltfNodeAssociation | undefined>;

const findByType = (scene: Object3D, type: string): Object3D[] => {
  const found: Object3D[] = [];
  scene.traverse((object) => {
    if (object.type === type) {
      found.push(object);
    }
  });
  return found;
};

const isWorldVisible = (object: Object3D): boolean => {
  for (let current: Object3D | undefined = object; current; current = current.parent ?? undefined) {
    if (!current.visible) {
      return false;
    }
  }
  return true;
};

describe('separateGltfNodeChildren', () => {
  it('should give a node loaded as its LINES primitive a group holding the primitive and its child nodes', async () => {
    const gltf = await parse();
    const [edges] = findByType(gltf.scene, 'LineSegments');
    const [surface] = findByType(gltf.scene, 'Mesh') as Mesh[];
    // The loader's own layout: the solid hangs beneath the module's edges.
    expect(surface!.parent).toBe(edges);

    separateGltfNodeChildren(gltf.scene, associationsOf(gltf));

    const [group] = gltf.scene.children;
    expect(group!.type).toBe('Group');
    expect(group!.name).toBe(edges!.name);
    expect(group!.children).toEqual([edges, surface]);
    expect(edges!.children).toEqual([]);
    expect(associationsOf(gltf).get(group!)).toEqual({ meshes: 0, nodes: 0 });
    expect(associationsOf(gltf).get(edges!)).toEqual({ meshes: 0, primitives: 0 });
    expect(associationsOf(gltf).get(surface!)).toEqual({ meshes: 1, primitives: 0, nodes: 1 });
    gltf.scene.updateMatrixWorld(true);
    expect(group!.position.toArray()).toEqual([10, 0, 0]);
    expect(edges!.getWorldPosition(new Vector3()).toArray()).toEqual([10, 0, 0]);
    expect(surface!.getWorldPosition(new Vector3()).toArray()).toEqual([10, 0, 0]);
  });

  it('should keep the child solid when the edges become fat lines', async () => {
    const gltf = await parse();
    separateGltfNodeChildren(gltf.scene, associationsOf(gltf));

    applyFatLineSegments(gltf, { resolution: new Vector2(768, 576), backend: 'webgpu' });

    expect(findByType(gltf.scene, 'LineSegments2')).toHaveLength(1);
    expect(findByType(gltf.scene, 'Mesh')).toHaveLength(1);
  });

  it('should keep the child solid visible when the edges are hidden', async () => {
    const gltf = await parse();
    separateGltfNodeChildren(gltf.scene, associationsOf(gltf));
    const [edges] = findByType(gltf.scene, 'LineSegments');
    const [surface] = findByType(gltf.scene, 'Mesh');

    edges!.visible = false;

    expect(isWorldVisible(surface!)).toBe(true);
  });

  it('should leave leaf primitives and multi-primitive groups as the loader built them', async () => {
    const gltf = await new GLTFLoader().parseAsync(
      writeGlb({
        nodes: [
          {
            name: 'Part',
            primitives: [
              {
                mode: 4,
                positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
                indices: Uint32Array.from([0, 1, 2]),
                material,
              },
              {
                mode: 1,
                positions: Float32Array.from([0, 0, 0, 1, 0, 0]),
                indices: Uint32Array.from([0, 1]),
                material,
              },
            ],
          },
        ],
      }).buffer,
      '',
    );
    const before = gltf.scene.children.map((child) => [child, [...child.children]]);

    separateGltfNodeChildren(gltf.scene, associationsOf(gltf));

    expect(gltf.scene.children.map((child) => [child, [...child.children]])).toEqual(before);
  });
});
