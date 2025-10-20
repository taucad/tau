import { useState, useEffect, useRef } from 'react';
import { GLTFLoader } from 'three/addons';
import type { Group } from 'three';
import { applyLineSegments } from '#components/geometry/graphics/three/materials/gltf-edges.js';
import { applyMatcap } from '#components/geometry/graphics/three/materials/gltf-matcap.js';

type GltfMeshDisplayProperties = {
  /**
   * The GLTF blob to load.
   */
  readonly gltfBlob: Blob;
  /**
   * Whether to enable matcap material.
   */
  readonly enableMatcap: boolean;
  /**
   * Whether to enable surfaces.
   */
  readonly enableSurfaces?: boolean;
  /**
   * Whether to enable lines.
   */
  readonly enableLines?: boolean;
  /**
   * Whether to enable Y-up rotation.
   */
  readonly enableYupRotation?: boolean;
};

/**
 * This component renders a GLTF mesh.
 *
 * Rather than using Drei's `Gltf` component, this component is optimized for performance
 * and caters to the needs of a CAD application.
 *
 * It does the following:
 * - Supports toggling visibility of surfaces and lines
 * - Supports matcap material
 * - Creates edge geometry from mesh faces if no line segments are found
 * - Detects and prioritizes vertex colors over material colors
 *   - When vertex colors (COLOR_0 attribute) are present: uses vertex colors exclusively
 *   - When no vertex colors are present: falls back to material colors and opacity
 *
 * @param gltfBlob - The GLTF blob to load
 * @param name - The name of the mesh
 * @param enableSurfaces - Whether to enable surfaces
 * @param enableLines - Whether to enable lines
 * @param enableYupRotation - Whether to enable Y-up rotation
 * @returns A React component with Three.js primitives that renders the GLTF mesh
 */
export function GltfMesh({
  gltfBlob,
  enableMatcap = true,
  enableSurfaces = true,
  enableLines = true,
  enableYupRotation = false,
}: GltfMeshDisplayProperties): React.JSX.Element | undefined {
  const [scene, setScene] = useState<Group | undefined>(undefined);
  const isLoadingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const loadGltf = async (): Promise<void> => {
      isLoadingRef.current = true;

      try {
        const arrayBuffer = await gltfBlob.arrayBuffer();

        const loader = new GLTFLoader();

        const gltf = await loader.parseAsync(
          arrayBuffer,
          '', // Path (not needed for ArrayBuffer)
        );

        // Apply line segments from mesh edges if no LineSegments exist
        applyLineSegments(gltf);

        if (enableMatcap) {
          await applyMatcap(gltf);
        }

        if (enableYupRotation) {
          // Apply 90-degree rotation around x-axis
          gltf.scene.rotation.x = Math.PI / 2;
        }

        setScene(gltf.scene);
        isLoadingRef.current = false;
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to read blob:', error);
          isLoadingRef.current = false;
        }
      }
    };

    if (!isLoadingRef.current) {
      void loadGltf();
    }

    return () => {
      cancelled = true;
    };
  }, [gltfBlob, enableMatcap, enableYupRotation]);

  // Toggle visibility of surfaces and lines based on props
  useEffect(() => {
    if (!scene) {
      return;
    }

    scene.traverse((object) => {
      if (object.type === 'Mesh') {
        object.visible = enableSurfaces;
      } else if (object.type === 'LineSegments') {
        object.visible = enableLines;
      }
    });
  }, [scene, enableSurfaces, enableLines]);

  if (!scene) {
    return undefined;
  }

  return <primitive object={scene} />;
}
