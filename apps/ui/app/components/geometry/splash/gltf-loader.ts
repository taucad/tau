import * as THREE from 'three';
import type { Group, MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/addons';
import type { Geometry } from '@taucad/types';

/**
 * Result of loading a GLTF geometry with material.
 */
export type LoadedGltf = {
  scene: Group;
  material: MeshStandardMaterial;
};

/**
 * Options for loading a GLTF geometry with material.
 */
export type LoadGltfOptions = {
  /** The geometry to load (must be GLTF format) */
  geometry: Geometry;
  /** Color for the material */
  color: string;
  /** Initial opacity (0-1) */
  opacity?: number;
};

/** Default material properties for gear meshes */
const defaultMaterialProperties = {
  metalness: 0.7,
  roughness: 0.2,
  envMapIntensity: 1,
  transparent: true,
};

/**
 * Loads a GLTF geometry and applies a standard material to all meshes.
 *
 * This utility centralizes the common pattern of:
 * 1. Parsing GLTF from ArrayBuffer
 * 2. Creating a MeshStandardMaterial with consistent properties
 * 3. Applying material to all meshes with shadow settings
 *
 * @param options - Load options including geometry, color, and opacity
 * @returns Promise resolving to the loaded scene and material, or undefined if loading fails
 */
export async function loadGltfWithMaterial(options: LoadGltfOptions): Promise<LoadedGltf | undefined> {
  const { geometry, color, opacity = 1 } = options;

  if (geometry.format !== 'gltf') {
    console.warn('[loadGltfWithMaterial] Geometry is not GLTF format');
    return undefined;
  }

  try {
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(geometry.content.buffer, '');

    const material = new THREE.MeshStandardMaterial({
      color,
      ...defaultMaterialProperties,
      opacity,
    });

    gltf.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.material = material;
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    return { scene: gltf.scene, material };
  } catch (error) {
    console.error('[loadGltfWithMaterial] Failed to load GLTF:', error);
    return undefined;
  }
}
