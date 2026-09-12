import * as THREE from 'three';
import type { Mesh, MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/addons';
import type { Geometry } from '@taucad/types';
import { sampleMeshSurface } from '#components/geometry/splash/point-sampler.js';
import type { SampledPoints } from '#components/geometry/splash/point-sampler.js';
import { applyCanonicalGltfWorld } from '#components/geometry/graphics/three/gltf-world.js';

/**
 * The runtime emits canonical glTF — Y-up, **metres**. Every world-space constant in
 * this folder (camera distance, gear pitch radii, assembly offsets, scatter radius,
 * point size, explosion strength, shader noise amplitude) is expressed in the
 * millimetres `gear.jscad.js` is authored in, so the splash converts once here and
 * stays in a single unit system from then on.
 */
const millimetresPerMetre = 1000;

/**
 * Result of loading a splash gear glTF with its own material.
 */
export type LoadedGltf = {
  scene: THREE.Group;
  material: MeshStandardMaterial;
};

/** Default material properties for gear meshes */
const defaultMaterialProperties = {
  metalness: 0.7,
  roughness: 0.2,
  envMapIntensity: 1,
  transparent: true,
};

/**
 * Parses a splash gear geometry into a flat group of Tau-world, millimetre-scale meshes.
 *
 * Both the glTF→Tau axis transform and the unit scale are baked into the buffer
 * geometry and every node is reset to identity. The surface sampler reads geometry
 * attributes directly and ignores node transforms, so this is the only arrangement
 * in which a sampled point cloud and the rendered mesh share one frame — and the
 * particle→solid crossfades depend on that being exact.
 *
 * @param geometry - The runtime geometry to parse (must be glTF format)
 * @returns The parsed scene, or undefined if the geometry is not glTF or fails to parse
 */
async function parseGearScene(geometry: Geometry): Promise<THREE.Group | undefined> {
  if (geometry.format !== 'gltf') {
    console.warn('[splash/gltf-loader] Geometry is not glTF format');
    return undefined;
  }

  try {
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(geometry.content.buffer, '');
    applyCanonicalGltfWorld(gltf.scene);

    const meshes: Mesh[] = [];
    gltf.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-argument -- instanceof narrows to Mesh<any>; the generic defaults are what we want
        meshes.push(object);
      }
    });

    const scene = new THREE.Group();
    const baked = new Set<THREE.BufferGeometry>();
    for (const mesh of meshes) {
      if (!baked.has(mesh.geometry)) {
        baked.add(mesh.geometry);
        mesh.geometry.applyMatrix4(mesh.matrixWorld);
        mesh.geometry.scale(millimetresPerMetre, millimetresPerMetre, millimetresPerMetre);
      }
      mesh.position.set(0, 0, 0);
      mesh.quaternion.identity();
      mesh.scale.set(1, 1, 1);
      scene.add(mesh);
    }

    return scene;
  } catch (error) {
    console.error('[splash/gltf-loader] Failed to parse glTF:', error);
    return undefined;
  }
}

/**
 * Loads a splash gear glTF and applies a standard material to all of its meshes.
 *
 * @param options - Load options including geometry, color, and opacity
 * @param options.geometry - The geometry to load (must be glTF format)
 * @param options.color - Color for the material
 * @param options.opacity - Initial opacity (0-1)
 * @returns The loaded scene and material, or undefined if loading fails
 */
export async function loadGltfWithMaterial({
  geometry,
  color,
  opacity = 1,
}: {
  geometry: Geometry;
  color: string;
  opacity?: number;
}): Promise<LoadedGltf | undefined> {
  const scene = await parseGearScene(geometry);

  if (!scene) {
    return undefined;
  }

  const material = new THREE.MeshStandardMaterial({ color, ...defaultMaterialProperties, opacity });

  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.material = material;
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  return { scene, material };
}

/**
 * Samples points uniformly from the surface of a splash gear geometry.
 *
 * @param geometry - The geometry to sample (must be glTF format)
 * @param pointCount - Number of points to sample
 * @returns Sampled points, or undefined if the geometry could not be parsed
 */
export async function sampleGltfSurface(geometry: Geometry, pointCount: number): Promise<SampledPoints | undefined> {
  const scene = await parseGearScene(geometry);

  if (!scene) {
    return undefined;
  }

  let foundMesh: Mesh | undefined;
  scene.traverse((object) => {
    if (!foundMesh && object instanceof THREE.Mesh) {
      foundMesh = object;
    }
  });

  if (!foundMesh) {
    console.warn('[splash/gltf-loader] No mesh found in glTF scene');
    return undefined;
  }

  return sampleMeshSurface(foundMesh, pointCount);
}
