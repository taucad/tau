import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Group, MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/addons';
import type { Geometry } from '@taucad/types';

/** Default material properties for gear meshes */
const defaultMaterialProperties = {
  metalness: 0.7,
  roughness: 0.2,
  envMapIntensity: 1,
  transparent: true,
};

/** Gear colors */
const gear12Color = '#14b8a6'; // Teal
const gear8Color = '#5B8FD9'; // Blue

/**
 * Loaded mesh with scene and material reference.
 */
export type LoadedMesh = {
  scene: Group;
  material: MeshStandardMaterial;
};

/**
 * Result of preloading meshes.
 */
export type PreloadedMeshes = {
  /** Gear12 mesh for initial display */
  gear12Mesh: LoadedMesh | undefined;
  /** Gear8 mesh for crossfade after first morph */
  gear8Mesh: LoadedMesh | undefined;
  /** Gear12 mesh for assembly (cloned, independent material) */
  assemblyGear12Mesh: LoadedMesh | undefined;
  /** Gear8 mesh for assembly (cloned, independent material) */
  assemblyGear8Mesh: LoadedMesh | undefined;
  /** Whether all meshes are loaded and ready */
  isLoaded: boolean;
};

/**
 * Options for the usePreloadedMeshes hook.
 */
export type UsePreloadedMeshesOptions = {
  /** Gear12 geometry to preload */
  gear12Geometry: Geometry | undefined;
  /** Gear8 geometry to preload */
  gear8Geometry: Geometry | undefined;
};

/**
 * Loads a GLTF geometry and creates a mesh with material.
 */
async function loadMesh(geometry: Geometry, color: string): Promise<LoadedMesh | undefined> {
  if (geometry.format !== 'gltf') {
    return undefined;
  }

  try {
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(geometry.content.buffer, '');

    const material = new THREE.MeshStandardMaterial({
      color,
      ...defaultMaterialProperties,
      opacity: 1,
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
    console.error('[usePreloadedMeshes] Failed to load mesh:', error);
    return undefined;
  }
}

/**
 * Clones a loaded mesh with a new independent material.
 * This allows the clone to have independent opacity control.
 */
function cloneMesh(original: LoadedMesh, color: string): LoadedMesh {
  const clonedScene = original.scene.clone(true);

  const material = new THREE.MeshStandardMaterial({
    color,
    ...defaultMaterialProperties,
    opacity: 0, // Assembly meshes start hidden
  });

  clonedScene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.material = material;
    }
  });

  return { scene: clonedScene, material };
}

/**
 * Hook that preloads all gear meshes eagerly when geometries become available.
 *
 * This hook:
 * - Loads meshes immediately when geometries are available (not phase-dependent)
 * - Creates cloned meshes for assembly use with independent materials
 * - Caches meshes to avoid re-loading on subsequent animation loops
 * - Returns stable references that persist across renders
 *
 * @param options - Configuration with gear geometries
 * @returns Object containing all preloaded meshes and loading status
 */
export function usePreloadedMeshes(options: UsePreloadedMeshesOptions): PreloadedMeshes {
  const { gear12Geometry, gear8Geometry } = options;

  // State for loaded meshes
  const [gear12Mesh, setGear12Mesh] = useState<LoadedMesh | undefined>(undefined);
  const [gear8Mesh, setGear8Mesh] = useState<LoadedMesh | undefined>(undefined);
  const [assemblyGear12Mesh, setAssemblyGear12Mesh] = useState<LoadedMesh | undefined>(undefined);
  const [assemblyGear8Mesh, setAssemblyGear8Mesh] = useState<LoadedMesh | undefined>(undefined);

  // Refs to track if we've already loaded each mesh (prevents duplicate loading)
  const hasLoadedGear12Ref = useRef(false);
  const hasLoadedGear8Ref = useRef(false);

  // Load gear12 mesh
  useEffect(() => {
    if (!gear12Geometry || hasLoadedGear12Ref.current) {
      return;
    }

    hasLoadedGear12Ref.current = true;

    const load = async (): Promise<void> => {
      const mesh = await loadMesh(gear12Geometry, gear12Color);
      if (mesh) {
        setGear12Mesh(mesh);
        // Create assembly clone with independent material
        const assemblyClone = cloneMesh(mesh, gear12Color);
        setAssemblyGear12Mesh(assemblyClone);
      }
    };

    void load();
  }, [gear12Geometry]);

  // Load gear8 mesh
  useEffect(() => {
    if (!gear8Geometry || hasLoadedGear8Ref.current) {
      return;
    }

    hasLoadedGear8Ref.current = true;

    const load = async (): Promise<void> => {
      const mesh = await loadMesh(gear8Geometry, gear8Color);
      if (mesh) {
        setGear8Mesh(mesh);
        // Create assembly clone with independent material
        const assemblyClone = cloneMesh(mesh, gear8Color);
        setAssemblyGear8Mesh(assemblyClone);
      }
    };

    void load();
  }, [gear8Geometry]);

  // Determine if all meshes are loaded
  const isLoaded = Boolean(gear12Mesh && gear8Mesh && assemblyGear12Mesh && assemblyGear8Mesh);

  return {
    gear12Mesh,
    gear8Mesh,
    assemblyGear12Mesh,
    assemblyGear8Mesh,
    isLoaded,
  };
}
