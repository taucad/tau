import { useState, useEffect, useRef, useCallback } from 'react';
import { GLTFLoader, LineSegments2 } from 'three/addons';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Group, Object3D, Material, BufferGeometry, Mesh, Texture } from 'three';
import { Vector2 } from 'three';
import { useThree } from '@react-three/fiber';
import { applyMatcap } from '#materials/gltf-matcap.js';
import {
  applyFatLineSegments,
  updateLineMaterialResolution,
} from '#materials/gltf-edges.js';

// Module-scoped GLTFLoader instance. GLTFLoader is stateless and fully reusable,
// so creating a fresh instance per parse wastes initialization overhead and GC pressure.
const gltfLoader = new GLTFLoader();

/**
 * Dispose a material and all its texture properties.
 */
function disposeMaterialWithTextures(mat: Material): void {
  for (const value of Object.values(mat)) {
    if (value && typeof value === 'object' && 'isTexture' in value) {
      (value as Texture).dispose();
    }
  }

  mat.dispose();
}

/**
 * Recursively dispose all GPU resources (geometries, materials, textures) in a scene graph.
 * This prevents GPU memory leaks when replacing or unmounting GLTF scenes.
 */
function disposeSceneResources(object: Object3D): void {
  object.traverse((child) => {
    // Dispose geometry
    if ('geometry' in child) {
      const { geometry } = child as { geometry?: BufferGeometry };
      geometry?.dispose();
    }

    // Dispose material(s) and their textures
    if ('material' in child) {
      const { material } = child as { material?: Material | Material[] };
      if (material) {
        const materials = Array.isArray(material) ? material : [material];
        for (const mat of materials) {
          disposeMaterialWithTextures(mat);
        }
      }
    }
  });
}

/**
 * Clone and save all mesh materials from a scene so they can be restored
 * after destructive operations like matcap application.
 */
function saveOriginalMaterials(scene: Group): Map<number, Material | Material[]> {
  const saved = new Map<number, Material | Material[]>();
  scene.traverse((child) => {
    if ('isMesh' in child && child.isMesh && !(child instanceof LineSegments2)) {
      const mesh = child as Mesh;
      if (Array.isArray(mesh.material)) {
        saved.set(
          mesh.id,
          mesh.material.map((m) => m.clone()),
        );
      } else {
        saved.set(mesh.id, mesh.material.clone());
      }
    }
  });
  return saved;
}

/**
 * Restore saved original materials onto a scene.
 * Disposes any current materials that differ from the originals (e.g. matcap materials).
 */
function restoreOriginalMaterials(scene: Group, saved: Map<number, Material | Material[]>): void {
  scene.traverse((child) => {
    if ('isMesh' in child && child.isMesh && !(child instanceof LineSegments2)) {
      const mesh = child as Mesh;
      const original = saved.get(mesh.id);
      if (!original) {
        return;
      }

      // Dispose current material if it was replaced (e.g. matcap)
      if (mesh.material !== original) {
        const currentMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of currentMats) {
          disposeMaterialWithTextures(mat);
        }
      }

      // Assign saved clones directly (they are pristine copies never used as active materials).
      // Re-clone the saved copies so the stored originals remain untouched for future restores.
      if (Array.isArray(original)) {
        mesh.material = original;
        saved.set(
          mesh.id,
          original.map((m) => m.clone()),
        );
      } else {
        mesh.material = original;
        saved.set(mesh.id, original.clone());
      }
    }
  });
}

/**
 * Dispose saved material clones stored in the originals map.
 */
function disposeSavedMaterials(saved: Map<number, Material | Material[]>): void {
  for (const mat of saved.values()) {
    if (Array.isArray(mat)) {
      for (const m of mat) {
        disposeMaterialWithTextures(m);
      }
    } else {
      disposeMaterialWithTextures(mat);
    }
  }

  saved.clear();
}

type GltfMeshDisplayProperties = {
  /**
   * The GLTF file to load.
   */
  readonly gltfFile: Uint8Array<ArrayBuffer>;
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
};

/**
 * Update visibility of surfaces and lines based on object type.
 *
 * Uses Three.js object type for identification:
 * - Mesh objects (including subclasses like SkinnedMesh, InstancedMesh) are surfaces
 * - LineSegments and LineSegments2 objects are edges
 *
 * @param scene - The GLTF scene
 * @param enableSurfaces - Whether to show surfaces
 * @param enableLines - Whether to show lines
 */
function updateVisibility(scene: Group, enableSurfaces: boolean, enableLines: boolean): void {
  scene.traverse((object) => {
    // Check line types first (LineSegments2 has custom type)
    if (object.type === 'LineSegments' || object instanceof LineSegments2) {
      object.visible = enableLines;
    } else if ('isMesh' in object && object.isMesh) {
      // `isMesh` is true for Mesh, SkinnedMesh, InstancedMesh, etc.
      object.visible = enableSurfaces;
    }
  });
}

/**
 * This component renders a GLTF mesh.
 *
 * Rather than using Drei's `Gltf` component, this component is optimized for performance
 * and caters to the needs of a CAD application.
 *
 * It does the following:
 * - Supports toggling visibility of surfaces and lines via object type
 * - Supports matcap material (applied to all Mesh objects)
 * - Converts LineSegments to LineSegments2 for fat line rendering with constant screen-space width
 * - Edges are rendered as LineSegments from the GLTF (processed by edge detection middleware)
 * - Detects and prioritizes vertex colors over material colors
 *   - When vertex colors (COLOR_0 attribute) are present: uses vertex colors exclusively
 *   - When no vertex colors are present: falls back to material colors and opacity
 *
 * @param gltfFile - The GLTF file to load
 * @param enableMatcap - Whether to enable matcap material
 * @param enableSurfaces - Whether to enable surfaces
 * @param enableLines - Whether to enable lines
 * @returns A React component with Three.js primitives that renders the GLTF mesh
 */
export function GltfMesh({
  gltfFile,
  enableMatcap = false,
  enableSurfaces = true,
  enableLines = true,
}: GltfMeshDisplayProperties): React.JSX.Element | undefined {
  // The "base scene" is the parsed GLTF with line segments converted but no material overrides.
  // It serves as the template from which material modes (matcap/original) are derived.
  const [baseScene, setBaseScene] = useState<Group | undefined>(undefined);
  // The rendered scene has material mode applied and is what <primitive> displays.
  const [scene, setScene] = useState<Group | undefined>(undefined);
  const { size, invalidate } = useThree();

  // Memoize resolution vector to avoid creating new objects on each render
  const resolutionRef = useRef(new Vector2(size.width, size.height));

  // Saved clones of the original materials so we can restore them after matcap is toggled off.
  const originalMaterialsRef = useRef<Map<number, Material | Material[]>>(new Map());

  // Update resolution when size changes. Deferred via requestAnimationFrame
  // so that rapid resize events (e.g. dragging a Dockview divider) batch into
  // a single scene traversal + invalidation per animation frame.
  useEffect(() => {
    resolutionRef.current.set(size.width, size.height);

    if (!scene) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      updateLineMaterialResolution(scene, resolutionRef.current);
      invalidate();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [size, scene, invalidate]);

  // ── Effect 1: Parse GLTF binary (expensive, only on gltfFile change) ──────
  // Parses the GLTF, converts line segments, and saves original materials.
  // Does not apply matcap or any material overrides -- that is handled by Effect 2.
  useEffect(() => {
    let cancelled = false;

    const loadGltf = async (): Promise<void> => {
      try {
        if (typeof SharedArrayBuffer === 'function' && gltfFile.buffer instanceof SharedArrayBuffer) {
          throw new TypeError('SharedArrayBuffer is not supported in <GltfMesh />');
        }

        const gltf = await gltfLoader.parseAsync(
          gltfFile.buffer,
          '', // Path (not needed for ArrayBuffer)
        );

        if (cancelled) {
          disposeSceneResources(gltf.scene);
          return;
        }

        // Convert LineSegments to LineSegments2 for fat line rendering
        applyFatLineSegments(gltf, resolutionRef.current);

        // Save clones of the original materials before any overrides
        disposeSavedMaterials(originalMaterialsRef.current);
        originalMaterialsRef.current = saveOriginalMaterials(gltf.scene);

        setBaseScene(gltf.scene);
        invalidate();
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load GLTF:', error);
        }
      }
    };

    // Dispose previous base scene and saved materials before loading new one
    setBaseScene((previous) => {
      if (previous) {
        disposeSceneResources(previous);
      }

      return undefined;
    });
    setScene(undefined);

    void loadGltf();

    return () => {
      cancelled = true;
    };
  }, [gltfFile, invalidate]);

  // Cleanup on unmount: dispose base scene and saved materials
  useEffect(
    () => () => {
      disposeSavedMaterials(originalMaterialsRef.current);
    },
    [],
  );

  // Effect 2: Apply materials (lightweight, runs on matcap toggle or new base scene).
  // Applies matcap or restores original materials on the base scene.
  // When enableMatcap changes, only this effect runs (no GLTF re-parse).
  // Visibility is NOT handled here -- it is handled by the dedicated visibility effect
  // below to avoid expensive material re-application on visibility toggles.
  const applyMaterials = useCallback(
    (targetScene: Group): void => {
      if (enableMatcap) {
        void applyMatcap({ scene: targetScene } as GLTF);
      } else {
        restoreOriginalMaterials(targetScene, originalMaterialsRef.current);
      }
    },
    [enableMatcap],
  );

  useEffect(() => {
    if (!baseScene) {
      return;
    }

    applyMaterials(baseScene);
    setScene(baseScene);
    invalidate();
  }, [baseScene, applyMaterials, invalidate]);

  // Toggle visibility when enableSurfaces or enableLines change
  useEffect(() => {
    if (scene) {
      updateVisibility(scene, enableSurfaces, enableLines);
      invalidate();
    }
  }, [scene, enableSurfaces, enableLines, invalidate]);

  if (!scene) {
    return undefined;
  }

  return <primitive object={scene} />;
}
