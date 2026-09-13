import { useState, useEffect, useRef, useCallback } from 'react';
import { GLTFLoader } from 'three/addons';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Camera, Group, Object3D, Material, BufferGeometry, Mesh, Texture } from 'three';
import { Vector2, Box3 } from 'three';
import { useThree } from '@react-three/fiber';
import { applyMatcap } from '#components/geometry/graphics/three/materials/gltf-matcap.js';
import {
  applyFatLineSegments,
  updateGltfEdgeColor,
  updateLineMaterialResolution,
} from '#components/geometry/graphics/three/materials/gltf-edges.js';
import {
  gltfEdgeColorDarkMode,
  gltfEdgeColorLightMode,
} from '#components/geometry/graphics/three/overlay-colors.constants.js';
import { Theme, useTheme } from '#hooks/use-theme.js';
import { darkModeIntensityScale } from '#components/geometry/graphics/three/utils/lights.utils.js';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';

// Module-scoped GLTFLoader instance. GLTFLoader is stateless and fully reusable,
// so creating a fresh instance per parse wastes initialization overhead and GC pressure.
const gltfLoader = new GLTFLoader();

function isFatLineSegmentsMesh(child: Object3D): boolean {
  return child.type === 'LineSegments2';
}

/**
 * Snapshot of the three OCJS rendering smoke-trail probe values:
 *   1. byteLength of the GLB Uint8Array fed to GLTFLoader
 *   2. childrenCount on the parsed `gltf.scene`
 *   3. world-space bbox of `gltf.scene` after parse
 *
 * The flat shape (no nesting beyond `bbox.min`/`bbox.max`) is intentional so
 * that Safari's console payload formatter shows every value without truncation
 * — Safari collapses deeply nested objects in WebInspector by default.
 */
type GltfSceneProbe = {
  readonly byteLength: number;
  readonly childrenCount: number;
  readonly bbox: {
    readonly min: { readonly x: number; readonly y: number; readonly z: number };
    readonly max: { readonly x: number; readonly y: number; readonly z: number };
    readonly finite: boolean;
  };
};

/**
 * Build a flat probe snapshot from a parsed GLTF scene.
 *
 * `bbox.finite` is true iff every component of `min` and `max` is a finite
 * number. `Box3#isEmpty()` (min.x > max.x after `setFromObject` on an empty
 * group) coerces to `±Infinity` for every coordinate, so `finite === false`
 * uniformly catches both the empty-children case AND the coordinate-transform
 * regression case (NaN/Infinity positions on otherwise-populated meshes).
 */
function buildGltfSceneProbe(gltf: GLTF, byteLength: number): GltfSceneProbe {
  const bbox = new Box3().setFromObject(gltf.scene);
  const finite =
    Number.isFinite(bbox.min.x) &&
    Number.isFinite(bbox.min.y) &&
    Number.isFinite(bbox.min.z) &&
    Number.isFinite(bbox.max.x) &&
    Number.isFinite(bbox.max.y) &&
    Number.isFinite(bbox.max.z);

  return {
    byteLength,
    childrenCount: gltf.scene.children.length,
    bbox: {
      min: { x: bbox.min.x, y: bbox.min.y, z: bbox.min.z },
      max: { x: bbox.max.x, y: bbox.max.y, z: bbox.max.z },
      finite,
    },
  };
}

/**
 * Downstream half of the OCJS-rendering smoke trail.
 *
 * Pairs with the kernel-side `convertReplicadGeometriesToGltf` debug log to
 * triangulate "geometry compute completed but nothing rendered" reports from
 * the browser console alone, with no debugger attach required:
 *
 *   1. kernel `byteLength == 0`                                  → upstream produced an empty GLB
 *      (SLProps-normal pipeline regression)
 *   2. kernel `byteLength > 0` + UI `childrenCount == 0`         → GLTFLoader silently dropped nodes
 *      (glTF binary malformed for Safari — accessor / extension Safari rejects)
 *   3. UI `childrenCount > 0` + UI `bbox.finite === false`       → coordinate transform regression
 *      (NaN/Infinity positions reaching the GPU)
 *
 * Silent on the happy path (≥1 child AND finite bbox); never logs anything for
 * a successful render to keep the console quiet across project hot-reloads.
 *
 * Exported only so each gate can be unit-tested without bootstrapping a
 * React-Three-Fiber renderer for the parent component; not part of the public
 * `GltfMesh` API.
 */
export function probeGltfScene(gltf: GLTF, byteLength: number): void {
  const probe = buildGltfSceneProbe(gltf, byteLength);

  if (probe.childrenCount === 0) {
    console.warn('GLTFLoader produced a scene with zero children', probe);
    return;
  }

  if (!probe.bbox.finite) {
    console.warn('GLTFLoader produced a scene with a non-finite bounding box', probe);
  }
}

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
    if ('isMesh' in child && child.isMesh && !isFatLineSegmentsMesh(child)) {
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
    if ('isMesh' in child && child.isMesh && !isFatLineSegmentsMesh(child)) {
      const mesh = child as Mesh;
      const original = saved.get(mesh.id);
      if (!original) {
        return;
      }

      // Preserve clipping planes so section-view clipping survives material restoration
      const currentMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const restoredMats = Array.isArray(original) ? original : [original];
      for (let i = 0; i < restoredMats.length && i < currentMats.length; i++) {
        const currentMat = currentMats[i];
        const restoredMat = restoredMats[i];
        if (currentMat && restoredMat && currentMat.clippingPlanes?.length) {
          restoredMat.clippingPlanes = currentMat.clippingPlanes;
        }
      }

      // Dispose current material if it was replaced (e.g. matcap)
      if (mesh.material !== original) {
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
    if (object.type === 'LineSegments' || isFatLineSegmentsMesh(object)) {
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
 * @param props - The GLTF mesh display properties
 * @param props.gltfFile - The GLTF file to load
 * @param props.enableMatcap - Whether to enable matcap material
 * @param props.enableSurfaces - Whether to enable surfaces
 * @param props.enableLines - Whether to enable lines
 * @returns A React component with Three.js primitives that renders the GLTF mesh
 */
export function GltfMesh({
  gltfFile,
  enableMatcap = false,
  enableSurfaces = true,
  enableLines = true,
}: GltfMeshDisplayProperties): React.JSX.Element | undefined {
  const graphicsBackendThree = useThreeGraphicsBackend();
  // The "base scene" is the parsed GLTF with line segments converted but no material overrides.
  // It serves as the template from which material modes (matcap/original) are derived.
  const [baseScene, setBaseScene] = useState<Group | undefined>(undefined);
  // The rendered scene has material mode applied and is what <primitive> displays.
  const [scene, setScene] = useState<Group | undefined>(undefined);
  const { size, invalidate, gl, camera } = useThree();
  const { theme } = useTheme();
  const matcapTint = theme === Theme.DARK ? darkModeIntensityScale : 1;

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
    // Object-wrapped cancellation token (mirrors `viewport-gizmo-cube.tsx`'s
    // `warmupCancellation` shape). The function-call indirection through
    // `isCancelled()` defeats TS's flow-narrowing across the second await-then-check
    // pair: without it TS pins `cancellation.cancelled` to `false` along every branch
    // following an `if (cancellation.cancelled) return` early-return, and the
    // post-`compileAsync` re-check would be flagged as a useless conditional even
    // though the cleanup function mutates the property outside TS's view.
    const cancellation = { cancelled: false };
    const isCancelled = (): boolean => cancellation.cancelled;

    const loadGltf = async (): Promise<void> => {
      try {
        const gltf = await gltfLoader.parseAsync(gltfFile.buffer, '');

        if (isCancelled()) {
          disposeSceneResources(gltf.scene);
          return;
        }

        probeGltfScene(gltf, gltfFile.byteLength);

        // Convert LineSegments to LineSegments2 for fat line rendering
        const edgeColor = theme === Theme.DARK ? gltfEdgeColorDarkMode : gltfEdgeColorLightMode;
        applyFatLineSegments(gltf, resolutionRef.current, graphicsBackendThree, edgeColor);

        // Save clones of the original materials before any overrides
        disposeSavedMaterials(originalMaterialsRef.current);
        originalMaterialsRef.current = saveOriginalMaterials(gltf.scene);

        // R4: pipeline pre-warm. The `Line2NodeMaterial` for edges (and the surface mesh
        // pipelines) would otherwise pay `createRenderPipelineAsync` latency on the first
        // visible frame, producing the "skipped frames on model load" artifact documented
        // in `docs/research/gltf-edges-fat-line-performance.md` (Finding 5). Mirror the
        // viewport-gizmo-cube.tsx precedent: capture `compileAsync` to a local for TS
        // narrowing, call via `compile.call(renderer, ...)`, and re-check cancellation
        // after the await so a teardown mid-warmup is a no-op. On WebGL `compileAsync`
        // is absent, so the guard skips the call entirely.
        const renderer = gl as unknown as {
          compileAsync?: (scene: Object3D, camera: Camera) => Promise<unknown>;
        };
        const compile = renderer.compileAsync;
        if (typeof compile === 'function') {
          try {
            await compile.call(renderer, gltf.scene, camera);
          } catch (error) {
            console.error('GLTF pipeline warm-up failed', error);
          }
          if (isCancelled()) {
            disposeSceneResources(gltf.scene);
            return;
          }
        }

        setBaseScene(gltf.scene);
        invalidate();
      } catch (error) {
        if (!isCancelled()) {
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
      cancellation.cancelled = true;
    };
  }, [gltfFile, graphicsBackendThree, invalidate, gl, camera]);

  // Theme-aware edge tint without re-parsing the GLTF binary.
  useEffect(() => {
    if (!scene) {
      return;
    }

    const edgeColor = theme === Theme.DARK ? gltfEdgeColorDarkMode : gltfEdgeColorLightMode;
    updateGltfEdgeColor(scene, edgeColor);
    invalidate();
  }, [scene, theme, invalidate]);

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
        void applyMatcap({ scene: targetScene } as GLTF, matcapTint, graphicsBackendThree);
      } else {
        restoreOriginalMaterials(targetScene, originalMaterialsRef.current);
      }
    },
    [enableMatcap, graphicsBackendThree, matcapTint],
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
