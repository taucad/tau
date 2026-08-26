import { useState, useEffect } from 'react';
import { GLTFLoader } from 'three/addons';
import * as THREE from 'three';
import type { Group } from 'three';

type PreviewGltfMeshProperties = {
  /**
   * The GLTF file to load.
   */
  readonly gltfFile: Uint8Array<ArrayBuffer>;
  /**
   * The color of the material.
   * @default '#14b8a6' (primary/teal)
   */
  readonly color?: string;
  /**
   * Metalness of the material (0-1).
   * @default 0.7
   */
  readonly metalness?: number;
  /**
   * Roughness of the material (0-1).
   * @default 0.2
   */
  readonly roughness?: number;
  /**
   * Environment map intensity for reflections.
   * @default 1
   */
  readonly envMapIntensity?: number;
};

/**
 * A preview-optimized GLTF mesh renderer.
 *
 * Unlike the standard GltfMesh component, this component:
 * - Does NOT add line segments (cleaner preview appearance)
 * - Uses a metallic MeshStandardMaterial instead of matcap
 * - Is optimized for showcase/preview scenarios
 *
 * @param props - The preview GLTF mesh properties
 * @param props.gltfFile - The GLTF file to load
 * @param props.color - Material color (default: primary teal)
 * @param props.metalness - Material metalness (default: 0.7)
 * @param props.roughness - Material roughness (default: 0.2)
 * @param props.envMapIntensity - Environment map intensity (default: 1)
 */
export function PreviewGltfMesh({
  gltfFile,
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- Three.js material color
  color = '#14b8a6',
  metalness = 0.7,
  roughness = 0.2,
  envMapIntensity = 1,
}: PreviewGltfMeshProperties): React.JSX.Element | undefined {
  const [scene, setScene] = useState<Group | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const loadGltf = async (): Promise<void> => {
      try {
        const loader = new GLTFLoader();
        const gltf = await loader.parseAsync(gltfFile.buffer, '');

        // Apply metallic standard material to all meshes (no lines)
        const metallicMaterial = new THREE.MeshStandardMaterial({
          color,
          metalness,
          roughness,
          envMapIntensity,
        });

        gltf.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.material = metallicMaterial;
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });

        if (!cancelled) {
          setScene(gltf.scene);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load GLTF:', error);
        }
      }
    };

    void loadGltf();

    return () => {
      cancelled = true;
    };
  }, [gltfFile, color, metalness, roughness, envMapIntensity]);

  if (!scene) {
    return undefined;
  }

  return <primitive object={scene} />;
}
