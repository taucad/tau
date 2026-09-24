import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { GLTFLoader } from 'three/addons';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type {
  Camera,
  Group,
  Object3D,
  Material,
  Texture,
  Intersection,
  Raycaster,
  BufferGeometry,
  Mesh,
  Scene,
  MeshPhysicalMaterial,
} from 'three';
import { Vector2, Box3, Vector3, WebGLCoordinateSystem, WebGPUCoordinateSystem } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { applyMatcap } from '#components/geometry/graphics/three/materials/gltf-matcap.js';
import {
  applyModelMaterialAppearance,
  getOrCaptureModelMaterialAppearance,
  updateCapturedModelMaterialBaseColor,
} from '#components/geometry/graphics/three/materials/model-component-appearance.js';
import type { ModelComponentEmphasis } from '#components/geometry/graphics/three/materials/model-component-appearance.js';
import {
  emptyModelEmphasisSet,
  setModelEmphasisSet,
} from '#components/geometry/graphics/three/materials/model-emphasis-registry.js';
import type { ModelEmphasisSet } from '#components/geometry/graphics/three/materials/model-emphasis-registry.js';
import {
  applyFatLineSegments,
  collectGltfFatLineMaterials,
  setGltfFatLineEmphasis,
  updateGltfEdgeColor,
  updateLineMaterialResolution,
} from '#components/geometry/graphics/three/materials/gltf-edges.js';
import { applyGltfSurfaceDepthBiasToScene } from '#components/geometry/graphics/three/materials/gltf-surface-depth-bias.js';
import {
  gltfEdgeColorDarkMode,
  gltfEdgeColorLightMode,
} from '#components/geometry/graphics/three/overlay-colors.constants.js';
import { Theme, useTheme } from '#hooks/use-theme.js';
import { darkModeIntensityScale } from '#components/geometry/graphics/three/utils/lights.utils.js';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { buildGltfComponentManifest } from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import {
  createGltfComponentOwnership,
  getComponentAncestorIds,
  getGltfPrimitiveComponentId,
  hasComponentOrAncestor,
  hasComponentOrDescendant,
} from '#components/geometry/graphics/metadata/gltf-component-visibility.js';
import {
  applyInPlaceGeometryUpdate,
  captureInPlaceGeometryTargets,
} from '#components/geometry/graphics/three/utils/in-place-geometry-update.js';
import type { InPlaceGeometryTargets } from '#components/geometry/graphics/three/utils/in-place-geometry-update.js';
import { hasSceneTagInHierarchy, sceneTag } from '#components/geometry/graphics/three/utils/scene-tags.js';
import type { SceneTagKey } from '#components/geometry/graphics/three/utils/scene-tags.js';
import {
  getModelComponentId,
  getModelComponentIdInHierarchy,
  setModelComponentOwner,
} from '#components/geometry/graphics/three/utils/model-component-owner.js';
import {
  useCameraRig,
  useGraphics,
  useGraphicsSelector,
  useModelInteractionSelector,
  useRenderFrame,
  useRenderFrameRetarget,
} from '#hooks/use-graphics.js';
import type { RenderFrame } from '@taucad/spatial';
import { deriveModelInteractionUnitId, getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import type { ModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import {
  createSectionViewRaycastClipState,
  useSectionView,
} from '#components/geometry/graphics/three/use-section-view.js';
import { raycastFirstVisibleMeshHit } from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import type { RaycastClipState } from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import type { GeometryComponentManifest, GeometryComponentNode, GeometryComponentPrimitiveRef } from '@taucad/types';
import { createThreeResourceDisposer } from '@taucad/three/resources';
import {
  applyCanonicalGltfBounds,
  createCanonicalGltfToTauMatrix,
} from '#components/geometry/graphics/three/gltf-world.js';
import {
  registerGltfSectionSurfaceSources,
  setGltfSectionSurfaceRegistrationState,
} from '#components/geometry/graphics/three/utils/section-surface-topology.js';
import type {
  GltfSectionTopologyTiming,
  SectionTopologyGltfParser,
} from '#components/geometry/graphics/three/utils/section-surface-topology.js';
import { createSectionTopologyScheduler } from '#components/geometry/graphics/three/utils/section-topology-scheduler.js';
import type { GltfPresentationBarrier, GltfPresentationTelemetry } from '#machines/graphics.machine.js';

// Module-scoped GLTFLoader instance. GLTFLoader is stateless and fully reusable,
// so creating a fresh instance per parse wastes initialization overhead and GC pressure.
const gltfLoader = new GLTFLoader();
const modelHitBlockingSceneTags = new Set<SceneTagKey>([sceneTag.sectionViewHelper, sceneTag.measurementUi]);

function isFatLineSegmentsMesh(child: Object3D): boolean {
  return child.type === 'LineSegments2';
}

function isLineObject(object: Object3D): boolean {
  return object.type === 'LineSegments' || isFatLineSegmentsMesh(object);
}

function isSurfaceObject(object: Object3D): object is Mesh {
  const maybeMesh = object as Object3D & { isMesh?: unknown };
  return maybeMesh.isMesh === true && !isFatLineSegmentsMesh(object);
}

function isModelRenderableObject(object: Object3D): boolean {
  return isSurfaceObject(object) || isLineObject(object);
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
    readonly min: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };
    readonly max: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };
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

const collectMaterialTextures = (material: Material, resources: Set<{ dispose: () => void }>): void => {
  for (const value of Object.values(material)) {
    if (value && typeof value === 'object' && 'isTexture' in value) {
      resources.add(value as Texture);
    }
  }
};

/** Captures the resources owned by one parsed glTF presentation. */
function createGltfResourceDisposer(
  scene: Group,
  originalMaterials: ReadonlyMap<number, Material | Material[]> = new Map(),
  includeSceneTextures = false,
): () => void {
  let disposed = false;
  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    const resources = new Set<{ dispose: () => void }>();
    scene.traverse((child) => {
      if ('geometry' in child) {
        const { geometry } = child as { geometry?: BufferGeometry };
        if (geometry) {
          resources.add(geometry);
        }
      }
      for (const material of [...getObjectMaterials(child), ...collectGltfFatLineMaterials(child)]) {
        resources.add(material);
        if (includeSceneTextures) {
          collectMaterialTextures(material, resources);
        }
      }
    });
    for (const saved of originalMaterials.values()) {
      for (const material of Array.isArray(saved) ? saved : [saved]) {
        resources.add(material);
        // Original-material snapshots retain the parsed GLTF textures. Current scene
        // materials may instead reference the shared matcap singleton, which this
        // presentation does not own and therefore must not dispose.
        collectMaterialTextures(material, resources);
      }
    }
    createThreeResourceDisposer(resources)();
  };
}

/**
 * Retain parsed materials as immutable snapshots and give each surface its own
 * clone, so initial PBR component opacity cannot mutate a sibling's material.
 */
function saveOriginalMaterials(scene: Group): Map<number, Material | Material[]> {
  const saved = new Map<number, Material | Material[]>();
  scene.traverse((child) => {
    if ('isMesh' in child && child.isMesh && !isFatLineSegmentsMesh(child)) {
      const mesh = child as Mesh;
      saved.set(mesh.id, mesh.material);
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => material.clone())
        : mesh.material.clone();
    }
  });
  return saved;
}

/**
 * Restore clones of saved original materials onto a scene.
 * The saved map remains an immutable ownership inventory for final disposal.
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
      const replacement = Array.isArray(original) ? original.map((material) => material.clone()) : original.clone();
      const restoredMats = Array.isArray(replacement) ? replacement : [replacement];
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
          mat.dispose();
        }
      }

      mesh.material = replacement;
    }
  });
}

type GltfMeshDisplayProperties = {
  /**
   * The GLTF file to load.
   */
  readonly gltfFile: Uint8Array<ArrayBuffer>;
  readonly sourceFile?: string;
  readonly geometryHash?: string;
  /** Monotonic graphics-machine revision for this requested artifact. */
  readonly presentationRevision?: number;
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
  readonly onModelComponentSecondaryPointerCandidate?: (
    target: ModelComponentSecondaryPointerTarget | undefined,
  ) => void;
};

type GltfPresentationTimings = Partial<Record<keyof GltfPresentationTelemetry['durations'], number>>;

type PreparedGltfPresentation = {
  readonly revision: number;
  readonly key: string;
  readonly unitId: string;
  readonly scene: Group;
  readonly manifest: GeometryComponentManifest;
  readonly parser: SectionTopologyGltfParser;
  readonly originalMaterials: Map<number, Material | Material[]>;
  /** D22: the buffers a same-topology result may be written into, absent when the scene cannot take one. */
  readonly inPlace?: InPlaceGeometryTargets;
  readonly receivedAt: number;
  readonly timings: GltfPresentationTimings;
  barrier: GltfPresentationBarrier;
  sectionStatus: 'pending' | 'ready' | 'unsupported' | 'cancelled';
  analysisPromise?: Promise<'completed' | 'discarded' | 'failed'>;
  committedAt?: number;
  firstFrameAt?: number;
  modelEmptyFrames: number;
  telemetrySent: boolean;
  disposed: boolean;
  dispose: () => void;
};

const countGltfPresentation = (
  scene: Group,
): Pick<GltfPresentationTelemetry, 'meshCount' | 'triangleCount' | 'sourceLineCount' | 'lineSegmentCount'> => {
  let meshCount = 0;
  let triangleCount = 0;
  let sourceLineCount = 0;
  let lineSegmentCount = 0;
  scene.traverse((object) => {
    if (isSurfaceObject(object)) {
      meshCount += 1;
      triangleCount += Math.floor(
        (object.geometry.getIndex()?.count ?? object.geometry.getAttribute('position').count) / 3,
      );
    } else if (isLineObject(object)) {
      sourceLineCount += 1;
      const { geometry } = object as Object3D & { geometry: BufferGeometry };
      lineSegmentCount += Math.floor(geometry.getAttribute('position').count / 2);
    }
  });
  return { meshCount, triangleCount, sourceLineCount, lineSegmentCount };
};

type ComponentVisualStateOptions = {
  readonly componentId: string;
  readonly hiddenComponentIds: ReadonlySet<string>;
  readonly isolatedComponentIds: ReadonlySet<string>;
  readonly focusedComponentId?: string;
  readonly explicitOpacity?: number;
};

type ComponentVisualStateWithManifestOptions = Omit<
  ComponentVisualStateOptions,
  'focusedComponentId' | 'explicitOpacity'
> & {
  readonly manifest: GeometryComponentManifest;
  readonly focusedComponentIds: ReadonlySet<string>;
  readonly opacityByComponentId: Readonly<Record<string, number>> | undefined;
};

export type ViewerHoverUpdate = {
  readonly nextCachedComponentId: string | undefined;
  readonly shouldSend: boolean;
  readonly componentId: string | undefined;
};

export function resolveViewerHoverUpdate({
  isViewerHoverSuppressed,
  previousComponentId,
  nextComponentId,
}: {
  readonly isViewerHoverSuppressed: boolean;
  readonly previousComponentId: string | undefined;
  readonly nextComponentId: string | undefined;
}): ViewerHoverUpdate {
  if (isViewerHoverSuppressed) {
    return {
      nextCachedComponentId: undefined,
      shouldSend: false,
      componentId: undefined,
    };
  }

  if (nextComponentId === previousComponentId) {
    return {
      nextCachedComponentId: previousComponentId,
      shouldSend: false,
      componentId: undefined,
    };
  }

  return {
    nextCachedComponentId: nextComponentId,
    shouldSend: true,
    componentId: nextComponentId,
  };
}

export function shouldConsumeGuardedModelPointerClick({
  suppressNextModelPointerClick,
  isModelPointerClickSuppressed,
}: {
  readonly suppressNextModelPointerClick: boolean;
  readonly isModelPointerClickSuppressed: boolean;
}): boolean {
  return suppressNextModelPointerClick || isModelPointerClickSuppressed;
}

export type ModelPointerClickAction =
  | { readonly type: 'allowSceneUi' }
  | { readonly type: 'consumeModelPointerGuard' }
  | { readonly type: 'toggleComponentSelection'; readonly componentId: string }
  | { readonly type: 'clearFocusAndSelection' };

export type ModelPointerClickDispatch =
  | { readonly type: 'clearModelPointerClickGuard' }
  | {
      readonly type: 'toggleModelComponentSelection';
      readonly unitId: string;
      readonly componentId: string;
      readonly source: 'viewer';
    }
  | {
      readonly type: 'clearModelComponentFocus';
      readonly unitId: string;
      readonly source: 'viewer';
    }
  | {
      readonly type: 'clearModelComponentSelection';
      readonly unitId: string;
      readonly source: 'viewer';
    };

export type ModelComponentSecondaryPointerTarget = {
  readonly unitId: string;
  readonly componentId: string;
};

export type ModelComponentContextMenuTarget = ModelComponentSecondaryPointerTarget;

export type ModelContextMenuAction =
  | { readonly type: 'allowSceneUi' }
  | { readonly type: 'consumeModelPointerGuard' }
  | { readonly type: 'ignore' }
  | { readonly type: 'openComponentMenu'; readonly componentId: string };

export function resolveModelPointerClickAction({
  intersections,
  modelComponentId,
  suppressNextModelPointerClick,
  isModelPointerClickSuppressed,
}: {
  readonly intersections: ReadonlyArray<Pick<Intersection, 'distance' | 'object'>>;
  readonly modelComponentId: string | undefined;
  readonly suppressNextModelPointerClick: boolean;
  readonly isModelPointerClickSuppressed: boolean;
}): ModelPointerClickAction {
  if (hasModelHitBlockingSceneUiHit(intersections)) {
    return { type: 'allowSceneUi' };
  }

  if (
    shouldConsumeGuardedModelPointerClick({
      suppressNextModelPointerClick,
      isModelPointerClickSuppressed,
    })
  ) {
    return { type: 'consumeModelPointerGuard' };
  }

  return modelComponentId
    ? { type: 'toggleComponentSelection', componentId: modelComponentId }
    : { type: 'clearFocusAndSelection' };
}

export function resolveModelContextMenuAction({
  intersections,
  modelComponentId,
  suppressNextModelPointerClick,
  isModelPointerClickSuppressed,
}: {
  readonly intersections: ReadonlyArray<Pick<Intersection, 'distance' | 'object'>>;
  readonly modelComponentId: string | undefined;
  readonly suppressNextModelPointerClick: boolean;
  readonly isModelPointerClickSuppressed: boolean;
}): ModelContextMenuAction {
  if (hasModelHitBlockingSceneUiHit(intersections)) {
    return { type: 'allowSceneUi' };
  }

  if (suppressNextModelPointerClick) {
    return { type: 'consumeModelPointerGuard' };
  }

  if (isModelPointerClickSuppressed) {
    return { type: 'ignore' };
  }

  return modelComponentId ? { type: 'openComponentMenu', componentId: modelComponentId } : { type: 'ignore' };
}

export function resolveModelPointerMissedAction({
  suppressNextModelPointerClick,
  isModelPointerClickSuppressed,
}: {
  readonly suppressNextModelPointerClick: boolean;
  readonly isModelPointerClickSuppressed: boolean;
}): ModelPointerClickAction {
  return shouldConsumeGuardedModelPointerClick({
    suppressNextModelPointerClick,
    isModelPointerClickSuppressed,
  })
    ? { type: 'consumeModelPointerGuard' }
    : { type: 'clearFocusAndSelection' };
}

export function resolveModelPointerClickDispatches({
  clickAction,
  unitId,
}: {
  readonly clickAction: Exclude<ModelPointerClickAction, { readonly type: 'allowSceneUi' }>;
  readonly unitId: string;
}): readonly ModelPointerClickDispatch[] {
  if (clickAction.type === 'consumeModelPointerGuard') {
    return [{ type: 'clearModelPointerClickGuard' }];
  }

  if (clickAction.type === 'toggleComponentSelection') {
    return [
      {
        type: 'toggleModelComponentSelection',
        unitId,
        componentId: clickAction.componentId,
        source: 'viewer',
      },
    ];
  }

  return [
    { type: 'clearModelComponentFocus', unitId, source: 'viewer' },
    { type: 'clearModelComponentSelection', unitId, source: 'viewer' },
  ];
}

export function resolveComponentVisualState({
  componentId,
  hiddenComponentIds,
  isolatedComponentIds,
  focusedComponentId,
  explicitOpacity,
}: ComponentVisualStateOptions): {
  readonly visible: boolean;
  readonly opacity: number;
} {
  const isDimmedByIsolation = isolatedComponentIds.size > 0 && !isolatedComponentIds.has(componentId);
  const isDimmedByFocus = focusedComponentId !== undefined && focusedComponentId !== componentId;

  return {
    visible: !hiddenComponentIds.has(componentId),
    opacity: explicitOpacity ?? (isDimmedByIsolation || isDimmedByFocus ? 0.5 : 1),
  };
}

function resolveInheritedOpacity({
  manifest,
  componentId,
  opacityByComponentId,
}: {
  readonly manifest: GeometryComponentManifest;
  readonly componentId: string;
  readonly opacityByComponentId: Readonly<Record<string, number>>;
}): number | undefined {
  if (opacityByComponentId[componentId] !== undefined) {
    return opacityByComponentId[componentId];
  }
  for (const ancestorId of getComponentAncestorIds(manifest, componentId)) {
    if (opacityByComponentId[ancestorId] !== undefined) {
      return opacityByComponentId[ancestorId];
    }
  }
  return undefined;
}

function resolveComponentVisualStateWithManifest({
  componentId,
  manifest,
  hiddenComponentIds,
  isolatedComponentIds,
  focusedComponentIds,
  opacityByComponentId,
}: ComponentVisualStateWithManifestOptions): {
  readonly visible: boolean;
  readonly opacity: number;
} {
  const isIncludedByIsolation =
    isolatedComponentIds.size === 0 ||
    hasComponentOrAncestor(manifest, componentId, isolatedComponentIds) ||
    hasComponentOrDescendant(manifest, componentId, isolatedComponentIds);
  const isDimmedByFocus =
    focusedComponentIds.size > 0 &&
    !hasComponentOrAncestor(manifest, componentId, focusedComponentIds) &&
    !hasComponentOrDescendant(manifest, componentId, focusedComponentIds);
  const explicitOpacity = opacityByComponentId
    ? resolveInheritedOpacity({ manifest, componentId, opacityByComponentId })
    : undefined;

  return {
    visible:
      isIncludedByIsolation &&
      (hiddenComponentIds.size === 0 || !hasComponentOrAncestor(manifest, componentId, hiddenComponentIds)),
    opacity: explicitOpacity ?? (!isIncludedByIsolation || isDimmedByFocus ? 0.5 : 1),
  };
}

function resolveModelComponentEmphasisWithManifest(
  componentSets: {
    readonly focused: ReadonlySet<string>;
    readonly selected: ReadonlySet<string>;
    readonly hovered: ReadonlySet<string>;
  },
  manifest: GeometryComponentManifest,
  componentId: string,
): ModelComponentEmphasis {
  if (
    componentSets.focused.size > 0 &&
    (hasComponentOrAncestor(manifest, componentId, componentSets.focused) ||
      hasComponentOrDescendant(manifest, componentId, componentSets.focused))
  ) {
    return 'focused';
  }

  if (
    componentSets.selected.size > 0 &&
    (hasComponentOrAncestor(manifest, componentId, componentSets.selected) ||
      hasComponentOrDescendant(manifest, componentId, componentSets.selected))
  ) {
    return 'selected';
  }

  if (
    componentSets.hovered.size > 0 &&
    (hasComponentOrAncestor(manifest, componentId, componentSets.hovered) ||
      hasComponentOrDescendant(manifest, componentId, componentSets.hovered))
  ) {
    return 'hover';
  }

  return 'none';
}

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
    if (isLineObject(object)) {
      object.visible = enableLines;
    } else if (isSurfaceObject(object)) {
      // `isMesh` is true for Mesh, SkinnedMesh, InstancedMesh, etc.
      object.visible = enableSurfaces;
    }
  });
}

function getObjectComponentId(object: Object3D | undefined): string | undefined {
  return getModelComponentIdInHierarchy(object);
}

export function collectModelPickableSurfaceMeshes(root: Object3D): Mesh[] {
  const meshes: Mesh[] = [];

  root.traverse((object) => {
    if (!isSurfaceObject(object)) {
      return;
    }

    if (!getObjectComponentId(object)) {
      return;
    }

    if (hasSceneTagInHierarchy(object, modelHitBlockingSceneTags)) {
      return;
    }

    meshes.push(object);
  });

  return meshes;
}

function getPrimitiveReferences(node: GeometryComponentNode): readonly GeometryComponentPrimitiveRef[] {
  return Array.isArray(node.primitiveRefs) ? (node.primitiveRefs as readonly GeometryComponentPrimitiveRef[]) : [];
}

type GltfLoaderAssociation = {
  readonly nodes?: number;
  readonly meshes?: number;
  readonly primitives?: number;
};

function isWorldVisible(object: Object3D): boolean {
  let current: Object3D | undefined = object;
  while (current !== undefined) {
    if (!current.visible) {
      return false;
    }
    current = current.parent ?? undefined;
  }
  return true;
}

export function hasModelHitBlockingSceneUiHit(
  intersections: ReadonlyArray<Pick<Intersection, 'distance' | 'object'>>,
): boolean {
  for (const intersection of intersections) {
    if (!Number.isFinite(intersection.distance) || !isWorldVisible(intersection.object)) {
      continue;
    }

    if (hasSceneTagInHierarchy(intersection.object, modelHitBlockingSceneTags)) {
      return true;
    }
  }

  return false;
}

export function resolveModelComponentHitFromRay({
  raycaster,
  meshes,
  clipping,
}: {
  readonly raycaster: Raycaster;
  readonly meshes: readonly Mesh[];
  readonly clipping?: RaycastClipState;
}): string | undefined {
  const hit = raycastFirstVisibleMeshHit({ raycaster, meshes, clipping });
  return getObjectComponentId(hit?.object);
}

export function annotateSceneComponents(
  scene: Group,
  manifest: GeometryComponentManifest,
  options: {
    readonly unitId: string;
    readonly associations?: ReadonlyMap<Object3D, GltfLoaderAssociation>;
  },
): void {
  const childComponentIds = manifest.nodesById[manifest.rootId]?.childIds ?? [];
  const primitiveComponentNodes: GeometryComponentNode[] = [];
  const ownership = createGltfComponentOwnership(manifest);
  for (const componentId of manifest.nodeOrder) {
    const node = manifest.nodesById[componentId];
    if (!node) {
      continue;
    }

    const primitiveReferences = getPrimitiveReferences(node);
    if (primitiveReferences.length > 0 && node.childIds.length === 0) {
      primitiveComponentNodes.push(node);
    }
  }

  const primitiveComponentIds = primitiveComponentNodes
    .sort((a, b) => {
      const aRef = getPrimitiveReferences(a)[0];
      const bRef = getPrimitiveReferences(b)[0];
      if (!aRef || !bRef) {
        return 0;
      }
      return (
        aRef.nodeIndex - bRef.nodeIndex || aRef.meshIndex - bRef.meshIndex || aRef.primitiveIndex - bRef.primitiveIndex
      );
    })
    .map((node) => node.id);
  let fallbackIndex = 0;
  let primitiveFallbackIndex = 0;

  const annotateObject = ({
    object,
    inheritedComponentId,
    previousSiblingRenderableComponentId,
    inheritedNodeIndex,
  }: {
    object: Object3D;
    inheritedComponentId: string | undefined;
    previousSiblingRenderableComponentId: string | undefined;
    inheritedNodeIndex: number | undefined;
  }): string | undefined => {
    const existingComponentId = getModelComponentId(object);
    if (typeof existingComponentId === 'string') {
      setModelComponentOwner(object, {
        unitId: options.unitId,
        componentId: existingComponentId,
      });
      for (const child of object.children) {
        annotateObject({
          object: child,
          inheritedComponentId: existingComponentId,
          previousSiblingRenderableComponentId: undefined,
          inheritedNodeIndex,
        });
      }
      return existingComponentId;
    }

    const association = options.associations?.get(object);
    const nodeIndex = association?.nodes ?? inheritedNodeIndex;
    const primitiveComponentId =
      nodeIndex !== undefined && association?.meshes !== undefined && association.primitives !== undefined
        ? getGltfPrimitiveComponentId(ownership, {
            nodeIndex,
            meshIndex: association.meshes,
            primitiveIndex: association.primitives,
          })
        : undefined;
    const associatedComponentId = primitiveComponentId ?? ownership.componentIdByNodeIndex.get(nodeIndex ?? -1);
    let componentId = associatedComponentId ?? inheritedComponentId;

    if (isModelRenderableObject(object)) {
      const fallbackPrimitiveComponentId =
        !associatedComponentId && !isLineObject(object) && primitiveComponentIds.length > 0
          ? primitiveComponentIds[primitiveFallbackIndex]
          : undefined;
      if (fallbackPrimitiveComponentId) {
        primitiveFallbackIndex += 1;
        componentId = fallbackPrimitiveComponentId;
      }

      if (!componentId) {
        componentId = isLineObject(object) ? previousSiblingRenderableComponentId : undefined;
        if (!componentId) {
          componentId = childComponentIds[fallbackIndex];
          fallbackIndex += componentId ? 1 : 0;
        }
      }

      if (componentId) {
        setModelComponentOwner(object, { unitId: options.unitId, componentId });
      }
    }

    let previousChildRenderableComponentId: string | undefined;
    for (const child of object.children) {
      const childComponentId = annotateObject({
        object: child,
        inheritedComponentId: componentId,
        previousSiblingRenderableComponentId: previousChildRenderableComponentId,
        inheritedNodeIndex: nodeIndex,
      });
      if (childComponentId && isModelRenderableObject(child)) {
        previousChildRenderableComponentId = childComponentId;
      }
    }

    return componentId;
  };

  for (const child of scene.children) {
    annotateObject({
      object: child,
      inheritedComponentId: undefined,
      previousSiblingRenderableComponentId: undefined,
      inheritedNodeIndex: undefined,
    });
  }
}

function getMaterials(material: Material | Material[]): Material[] {
  return Array.isArray(material) ? material : [material];
}

function getObjectMaterials(object: Object3D): Material[] {
  if (!('material' in object)) {
    return [];
  }

  const { material } = object as Object3D & {
    material?: Material | Material[];
  };
  return material ? getMaterials(material) : [];
}

function seedSceneMaterialAppearances(scene: Group): void {
  scene.traverse((object) => {
    for (const material of getObjectMaterials(object)) {
      getOrCaptureModelMaterialAppearance(material);
    }
  });
}

export type ApplyModelComponentVisualStateToSceneOptions = Readonly<{
  scene: Group;
  componentManifest: GeometryComponentManifest;
  modelVisualState: Pick<
    ModelInteractionUnitState,
    | 'hiddenComponentIds'
    | 'isolatedComponentIds'
    | 'focusedComponentId'
    | 'opacityByComponentId'
    | 'hoveredComponentId'
    | 'selectedComponentIds'
  >;
  enableSurfaces: boolean;
  enableLines: boolean;
}>;

/**
 * Apply visibility, dimming and emphasis to every component object. Returns the emphasised
 * surface meshes so the owner can publish them to the silhouette/wash overlay; edges receive
 * their emphasis material here because they are the only per-component objects the overlay
 * does not proxy.
 */
export function applyModelComponentVisualStateToScene({
  scene,
  componentManifest,
  modelVisualState,
  enableSurfaces,
  enableLines,
}: ApplyModelComponentVisualStateToSceneOptions): ModelEmphasisSet {
  const hidden = new Set(modelVisualState.hiddenComponentIds);
  const isolated = new Set(modelVisualState.isolatedComponentIds);
  const emphasisComponents = {
    focused: new Set(modelVisualState.focusedComponentId ? [modelVisualState.focusedComponentId] : []),
    selected: new Set(modelVisualState.selectedComponentIds),
    hovered: new Set(modelVisualState.hoveredComponentId ? [modelVisualState.hoveredComponentId] : []),
  };
  const opacityByComponentId =
    Object.keys(modelVisualState.opacityByComponentId).length > 0 ? modelVisualState.opacityByComponentId : undefined;
  const hover: Mesh[] = [];
  const selected: Mesh[] = [];

  scene.traverse((object) => {
    const componentId = getObjectComponentId(object);
    if (!componentId) {
      return;
    }

    const isLine = isLineObject(object);
    const isSurface = isSurfaceObject(object);
    const globallyVisible = isLine ? enableLines : isSurface ? enableSurfaces : true;
    const visualState = resolveComponentVisualStateWithManifest({
      componentId,
      manifest: componentManifest,
      hiddenComponentIds: hidden,
      isolatedComponentIds: isolated,
      focusedComponentIds: emphasisComponents.focused,
      opacityByComponentId,
    });
    object.visible = globallyVisible && visualState.visible;

    const emphasis = resolveModelComponentEmphasisWithManifest(emphasisComponents, componentManifest, componentId);
    if (isLine) {
      // Edges share one base material per presentation, so emphasis is a per-object material
      // swap rather than a tint on the shared material (which would let the last-visited
      // component win). Edge opacity is not per-component; see the edge emphasis blueprint.
      setGltfFatLineEmphasis(object, emphasis);
      return;
    }

    if (isSurface && object.visible && emphasis !== 'none') {
      (emphasis === 'hover' ? hover : selected).push(object);
    }

    for (const material of getObjectMaterials(object)) {
      const snapshot = getOrCaptureModelMaterialAppearance(material);
      applyModelMaterialAppearance(material, snapshot, visualState.opacity);
    }
  });

  return { hover, selected };
}

export function applyGltfEdgeThemeColor(scene: Group, edgeColor: number): void {
  const updatedMaterials = updateGltfEdgeColor(scene, edgeColor);
  for (const material of updatedMaterials) {
    updateCapturedModelMaterialBaseColor(material, edgeColor);
  }
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
  sourceFile,
  geometryHash,
  presentationRevision = 0,
  enableMatcap = false,
  enableSurfaces = true,
  enableLines = true,
  onModelComponentSecondaryPointerCandidate,
}: GltfMeshDisplayProperties): React.JSX.Element | undefined {
  const graphicsActor = useGraphics();
  const graphicsBackendThree = useThreeGraphicsBackend();
  const sectionView = useSectionView();
  const cameraRig = useCameraRig();
  const renderFrame = useRenderFrame();
  const assetMatrix = useMemo(() => createCanonicalGltfToTauMatrix(), []);
  const [presentation, setPresentation] = useState<PreparedGltfPresentation | undefined>();
  const committedPresentationRef = useRef<PreparedGltfPresentation | undefined>(undefined);
  const candidatePresentationRef = useRef<PreparedGltfPresentation | undefined>(undefined);
  const retiredPresentationsRef = useRef<PreparedGltfPresentation[]>([]);
  const frameProbeRef = useRef<{ revision: number; modelEmptyFrames: number } | undefined>(undefined);
  const [topologyScheduler] = useState(createSectionTopologyScheduler);
  const { size, invalidate, gl, scene: rootScene } = useThree();
  const { theme } = useTheme();
  const activeEdgeColor = theme === Theme.DARK ? gltfEdgeColorDarkMode : gltfEdgeColorLightMode;
  const matcapTint = theme === Theme.DARK ? darkModeIntensityScale : 1;
  const requestedUnitId = deriveModelInteractionUnitId({
    sourceFile,
    geometryHash,
  });
  const scene = presentation?.scene;
  const componentManifest = presentation?.manifest;
  const unitId = presentation?.unitId ?? requestedUnitId;
  const sectionBarrierRef = useRef<GltfPresentationBarrier>(
    sectionView.isActive && sectionView.enableMesh ? 'analysis-ready' : 'display-ready',
  );
  const materialOptionsRef = useRef({ enableMatcap, matcapTint });
  const materialSignaturesRef = useRef(new WeakMap<PreparedGltfPresentation, string>());

  useEffect(() => {
    sectionBarrierRef.current = sectionView.isActive && sectionView.enableMesh ? 'analysis-ready' : 'display-ready';
    materialOptionsRef.current = { enableMatcap, matcapTint };
  }, [enableMatcap, matcapTint, sectionView.enableMesh, sectionView.isActive]);

  // Memoize resolution vector to avoid creating new objects on each render
  const resolutionRef = useRef(new Vector2(size.width, size.height));

  const lastHoveredComponentIdRef = useRef<string | undefined>(undefined);
  const lastFocusedComponentIdRef = useRef<string | undefined>(undefined);
  const modelPickableMeshesSceneRef = useRef<Group | undefined>(undefined);
  const modelPickableMeshesRef = useRef<readonly Mesh[]>([]);
  const modelUnitState = useModelInteractionSelector((state) => getModelInteractionUnitState(state.context, unitId));
  const isViewerHoverSuppressed = useGraphicsSelector(
    (state) => state.context.viewerHoverSuppressionReasons.length > 0,
  );
  const modelVisualState = useMemo(
    () => ({ ...modelUnitState, isViewerHoverSuppressed }),
    [isViewerHoverSuppressed, modelUnitState],
  );
  const modelRaycastClipState = useMemo<RaycastClipState | undefined>(() => {
    return createSectionViewRaycastClipState({
      enableMesh: sectionView.enableMesh,
      isActive: sectionView.isActive,
      plane: sectionView.plane,
    });
  }, [sectionView.enableMesh, sectionView.isActive, sectionView.plane]);

  const getModelPickableMeshes = useCallback((): readonly Mesh[] => {
    if (!scene) {
      modelPickableMeshesSceneRef.current = undefined;
      modelPickableMeshesRef.current = [];
      return [];
    }

    if (modelPickableMeshesSceneRef.current === scene) {
      return modelPickableMeshesRef.current;
    }

    const meshes = collectModelPickableSurfaceMeshes(scene);
    modelPickableMeshesSceneRef.current = scene;
    modelPickableMeshesRef.current = meshes;
    return meshes;
  }, [scene]);

  useLayoutEffect(() => {
    if (!scene) {
      return undefined;
    }
    const previousRaycast = scene.raycast;
    // R3F recursively raycasts the event root before dispatching handlers. Return
    // false to stop Three's descendant walk after the clipping-aware BVH query.
    // oxlint-disable-next-line react/immutability -- This presentation owns the external Three.js scene and restores its imperative raycast hook on teardown.
    scene.raycast = (raycaster, intersections): false => {
      const hit = raycastFirstVisibleMeshHit({
        raycaster,
        meshes: getModelPickableMeshes(),
        clipping: modelRaycastClipState,
      });
      if (hit) {
        intersections.push(hit);
      }
      return false;
    };
    return () => {
      scene.raycast = previousRaycast;
    };
  }, [getModelPickableMeshes, modelRaycastClipState, scene]);

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

  const emitTelemetry = useCallback(
    (bundle: PreparedGltfPresentation, outcome: GltfPresentationTelemetry['outcome']): void => {
      if (bundle.telemetrySent || (outcome === 'presented' && bundle.firstFrameAt === undefined)) {
        return;
      }
      bundle.telemetrySent = true;
      const schedulerStats = topologyScheduler.stats();
      graphicsActor.send({
        type: 'gltfPresentationMeasured',
        telemetry: {
          revision: bundle.revision,
          key: bundle.key,
          backend: graphicsBackendThree,
          barrier: bundle.barrier,
          outcome,
          glbBytes: gltfFile.byteLength,
          ...countGltfPresentation(bundle.scene),
          durations: bundle.timings,
          modelEmptyFrames:
            frameProbeRef.current?.revision === bundle.revision
              ? frameProbeRef.current.modelEmptyFrames
              : bundle.modelEmptyFrames,
          committedBundleHighWaterMark: 1,
          candidateBundleHighWaterMark: 1,
          topologyJobsStarted: schedulerStats.started,
          topologyJobsDiscarded: schedulerStats.discarded,
        },
      });
    },
    [gltfFile.byteLength, graphicsActor, graphicsBackendThree, topologyScheduler],
  );

  const ensureSectionAnalysis = useCallback(
    async (bundle: PreparedGltfPresentation): Promise<'completed' | 'discarded' | 'failed'> => {
      if (bundle.sectionStatus === 'ready') {
        return 'completed';
      }
      if (bundle.sectionStatus === 'cancelled') {
        return 'discarded';
      }
      if (bundle.sectionStatus === 'unsupported') {
        return 'failed';
      }
      if (bundle.analysisPromise) {
        return bundle.analysisPromise;
      }
      const analyze = async (): Promise<'completed' | 'discarded' | 'failed'> => {
        const outcome = await topologyScheduler.submit({
          generation: bundle.revision,
          run: async () => {
            await registerGltfSectionSurfaceSources({
              scene: bundle.scene,
              manifest: bundle.manifest,
              unitId: bundle.unitId,
              parser: bundle.parser,
              onTiming: (timing: GltfSectionTopologyTiming) => {
                bundle.timings.topologySubmit = timing.submitMilliseconds;
                bundle.timings.topologyWorker = timing.workerMilliseconds;
                bundle.timings.topologyHydrate = timing.hydrateMilliseconds;
              },
            });
          },
        });
        const completedWhileDisplayed = outcome === 'discarded' && committedPresentationRef.current === bundle;
        if ((outcome === 'completed' || completedWhileDisplayed) && !bundle.disposed) {
          bundle.sectionStatus = 'ready';
          graphicsActor.send({
            type: 'gltfAnalysisReady',
            revision: bundle.revision,
            key: bundle.key,
          });
          invalidate();
        } else {
          bundle.sectionStatus = outcome === 'failed' ? 'unsupported' : 'cancelled';
          setGltfSectionSurfaceRegistrationState(bundle.scene, bundle.sectionStatus);
        }
        if (bundle.firstFrameAt !== undefined) {
          emitTelemetry(bundle, 'presented');
        }
        return outcome;
      };
      bundle.analysisPromise = analyze();
      return bundle.analysisPromise;
    },
    [emitTelemetry, graphicsActor, invalidate, topologyScheduler],
  );

  // Parse and fully prepare one unattached candidate while the committed scene remains visible.
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

    const receivedAt = performance.now();
    const timings: GltfPresentationTimings = {};
    frameProbeRef.current = { revision: presentationRevision, modelEmptyFrames: 0 };
    graphicsActor.send({
      type: 'gltfPreparationStarted',
      revision: presentationRevision,
      key: geometryHash ?? '',
    });

    /* D22: a result whose topology, accessor layout and materials are unchanged is written straight into
     * the presented buffers — no reparse, no fat-line rebuild, no material recompile, no new scene graph.
     * It is refused while a section view is armed or while the presented scene carries section topology
     * (I11: exact-section semantics on updated buffers are unproven), and whenever any primitive fails to
     * validate, in which case nothing has been mutated and the full path below presents the result. */
    const presentInPlace = (): boolean => {
      const committed = committedPresentationRef.current;
      if (
        !committed ||
        committed.disposed ||
        !committed.inPlace ||
        candidatePresentationRef.current !== undefined ||
        committed.sectionStatus !== 'pending' ||
        sectionBarrierRef.current !== 'display-ready'
      ) {
        return false;
      }

      const inPlaceStartedAt = performance.now();
      if (!applyInPlaceGeometryUpdate(committed.inPlace, gltfFile)) {
        return false;
      }
      timings.inPlace = performance.now() - inPlaceStartedAt;

      const manifestStartedAt = performance.now();
      const manifest = buildGltfComponentManifest(gltfFile, { sourceFile, geometryHash });
      timings.manifest = performance.now() - manifestStartedAt;
      const annotationStartedAt = performance.now();
      // Component ids are unchanged with the topology, so this only re-keys them to the new unit.
      annotateSceneComponents(committed.scene, manifest, { unitId: requestedUnitId });
      timings.annotation = performance.now() - annotationStartedAt;

      const bundle: PreparedGltfPresentation = {
        ...committed,
        revision: presentationRevision,
        key: geometryHash ?? '',
        unitId: requestedUnitId,
        manifest,
        receivedAt,
        timings,
        barrier: 'display-ready',
        sectionStatus: 'pending',
        analysisPromise: undefined,
        committedAt: performance.now(),
        firstFrameAt: undefined,
        modelEmptyFrames: 0,
        telemetrySent: false,
      };
      // Both bundles describe one scene: ownership of its resources moves to the live bundle so the
      // retirement effect cannot dispose the geometry that is still on screen.
      const disposeResources = committed.dispose;
      committed.dispose = () => undefined;
      bundle.dispose = () => {
        bundle.disposed = true;
        disposeResources();
      };
      materialSignaturesRef.current.set(bundle, materialSignaturesRef.current.get(committed) ?? '');
      committedPresentationRef.current = bundle;
      graphicsActor.send({
        type: 'gltfDisplayReady',
        revision: bundle.revision,
        key: bundle.key,
        barrier: bundle.barrier,
      });
      setPresentation(bundle);
      invalidate();
      return true;
    };

    const loadGltf = async (): Promise<void> => {
      let unpreparedDispose: (() => void) | undefined;
      try {
        const parseStartedAt = performance.now();
        const gltf = await gltfLoader.parseAsync(gltfFile.buffer, '');
        timings.parse = performance.now() - parseStartedAt;
        unpreparedDispose = createGltfResourceDisposer(gltf.scene, undefined, true);

        if (isCancelled()) {
          unpreparedDispose();
          return;
        }

        probeGltfScene(gltf, gltfFile.byteLength);

        const manifestStartedAt = performance.now();
        const manifest = buildGltfComponentManifest(gltfFile, { sourceFile, geometryHash });
        timings.manifest = performance.now() - manifestStartedAt;
        const annotationStartedAt = performance.now();
        annotateSceneComponents(gltf.scene, manifest, {
          unitId: requestedUnitId,
          associations: gltf.parser.associations as ReadonlyMap<Object3D, GltfLoaderAssociation>,
        });
        timings.annotation = performance.now() - annotationStartedAt;
        setGltfSectionSurfaceRegistrationState(gltf.scene, 'pending');

        // Convert LineSegments to LineSegments2 for fat line rendering
        const fatLinesStartedAt = performance.now();
        const edgeColor = theme === Theme.DARK ? gltfEdgeColorDarkMode : gltfEdgeColorLightMode;
        applyFatLineSegments(gltf, {
          resolution: resolutionRef.current,
          backend: graphicsBackendThree,
          edgeColor,
        });
        timings.fatLines = performance.now() - fatLinesStartedAt;

        const originalMaterials = saveOriginalMaterials(gltf.scene);
        unpreparedDispose = createGltfResourceDisposer(gltf.scene, originalMaterials);
        const materialsStartedAt = performance.now();
        const materialOptions = materialOptionsRef.current;
        if (materialOptions.enableMatcap) {
          await applyMatcap({ scene: gltf.scene }, materialOptions.matcapTint, graphicsBackendThree);
        }
        applyGltfSurfaceDepthBiasToScene(gltf.scene, graphicsBackendThree);
        seedSceneMaterialAppearances(gltf.scene);
        timings.materials = performance.now() - materialsStartedAt;
        const bundle: PreparedGltfPresentation = {
          revision: presentationRevision,
          key: geometryHash ?? '',
          unitId: requestedUnitId,
          scene: gltf.scene,
          manifest,
          parser: gltf.parser as unknown as SectionTopologyGltfParser,
          originalMaterials,
          inPlace: captureInPlaceGeometryTargets({
            scene: gltf.scene,
            associations: gltf.parser.associations as ReadonlyMap<Object3D, GltfLoaderAssociation>,
            bytes: gltfFile,
          }),
          receivedAt,
          timings,
          barrier: sectionBarrierRef.current,
          sectionStatus: 'pending',
          modelEmptyFrames: 0,
          telemetrySent: false,
          disposed: false,
          dispose: () => undefined,
        };
        materialSignaturesRef.current.set(
          bundle,
          `${materialOptions.enableMatcap}:${materialOptions.matcapTint}:${graphicsBackendThree}`,
        );
        const disposeResources = createGltfResourceDisposer(bundle.scene, bundle.originalMaterials);
        bundle.dispose = () => {
          if (bundle.disposed) {
            return;
          }
          bundle.disposed = true;
          bundle.sectionStatus = 'cancelled';
          setGltfSectionSurfaceRegistrationState(bundle.scene, 'cancelled');
          disposeResources();
        };
        candidatePresentationRef.current = bundle;
        unpreparedDispose = undefined;

        graphicsActor.send({
          type: 'gltfDisplayReady',
          revision: bundle.revision,
          key: bundle.key,
          barrier: bundle.barrier,
        });
        if (bundle.barrier === 'analysis-ready') {
          const outcome = await ensureSectionAnalysis(bundle);
          if (outcome !== 'completed' || isCancelled()) {
            bundle.dispose();
            if (candidatePresentationRef.current === bundle) {
              candidatePresentationRef.current = undefined;
            }
            if (!isCancelled()) {
              graphicsActor.send({
                type: 'gltfPresentationFailed',
                revision: bundle.revision,
                key: bundle.key,
              });
              emitTelemetry(bundle, outcome === 'discarded' ? 'stale' : 'failed');
            }
            return;
          }
        }

        // R4: pipeline pre-warm. The `Line2NodeMaterial` for edges (and the surface mesh
        // pipelines) would otherwise pay `createRenderPipelineAsync` latency on the first
        // visible frame, producing the "skipped frames on model load" artifact documented
        // in `docs/research/gltf-edges-fat-line-performance.md` (Finding 5). Mirror the
        // viewport-gizmo-cube.tsx precedent: capture `compileAsync` to a local for TS
        // narrowing, call via `compile.call(renderer, ...)`, and re-check cancellation
        // after the await so a teardown mid-warmup is a no-op. Both backends need the
        // destination scene so the detached model inherits its lights and environment.
        const renderer = gl as unknown as {
          compileAsync?: (scene: Object3D, camera: Camera, targetScene?: Scene) => Promise<unknown>;
          coordinateSystem?: unknown;
        };
        const { compileAsync: compile, coordinateSystem } = renderer;
        if (typeof compile === 'function') {
          const warmupStartedAt = performance.now();
          try {
            const endpointCameras = [cameraRig.perspectiveCamera, cameraRig.orthographicCamera];
            if (coordinateSystem === WebGLCoordinateSystem || coordinateSystem === WebGPUCoordinateSystem) {
              for (const endpointCamera of endpointCameras) {
                endpointCamera.coordinateSystem = coordinateSystem;
                endpointCamera.updateProjectionMatrix();
              }
            }
            await Promise.all(
              endpointCameras.map(async (endpointCamera) =>
                compile.call(renderer, gltf.scene, endpointCamera, rootScene),
              ),
            );
          } catch (error) {
            console.error('GLTF pipeline warm-up failed', error);
          }
          timings.pipelineWarmup = performance.now() - warmupStartedAt;
          if (isCancelled()) {
            bundle.dispose();
            if (candidatePresentationRef.current === bundle) {
              candidatePresentationRef.current = undefined;
            }
            return;
          }
        }

        const previous = committedPresentationRef.current;
        bundle.modelEmptyFrames =
          frameProbeRef.current?.revision === bundle.revision ? frameProbeRef.current.modelEmptyFrames : 0;
        bundle.committedAt = performance.now();
        committedPresentationRef.current = bundle;
        if (candidatePresentationRef.current === bundle) {
          candidatePresentationRef.current = undefined;
        }
        if (previous) {
          retiredPresentationsRef.current.push(previous);
        }
        setPresentation(bundle);
        invalidate();
      } catch (error) {
        if (!isCancelled()) {
          console.error('Failed to load GLTF:', error);
          graphicsActor.send({
            type: 'gltfPresentationFailed',
            revision: presentationRevision,
            key: geometryHash ?? '',
          });
          graphicsActor.send({
            type: 'gltfPresentationMeasured',
            telemetry: {
              revision: presentationRevision,
              key: geometryHash ?? '',
              backend: graphicsBackendThree,
              barrier: sectionBarrierRef.current,
              outcome: 'failed',
              glbBytes: gltfFile.byteLength,
              meshCount: 0,
              triangleCount: 0,
              sourceLineCount: 0,
              lineSegmentCount: 0,
              durations: timings,
              modelEmptyFrames:
                frameProbeRef.current?.revision === presentationRevision ? frameProbeRef.current.modelEmptyFrames : 0,
              committedBundleHighWaterMark: committedPresentationRef.current ? 1 : 0,
              candidateBundleHighWaterMark: 0,
              topologyJobsStarted: topologyScheduler.stats().started,
              topologyJobsDiscarded: topologyScheduler.stats().discarded,
            },
          });
        }
        unpreparedDispose?.();
      }
    };

    if (!presentInPlace()) {
      void loadGltf();
    }

    return () => {
      cancellation.cancelled = true;
      const candidate = candidatePresentationRef.current;
      if (candidate?.revision === presentationRevision) {
        candidate.dispose();
        candidatePresentationRef.current = undefined;
        emitTelemetry(candidate, 'cancelled');
      }
      graphicsActor.send({
        type: 'setHoveredModelComponent',
        unitId: requestedUnitId,
        componentId: undefined,
        source: 'viewer',
      });
    };
  }, [
    gltfFile,
    graphicsBackendThree,
    invalidate,
    gl,
    graphicsActor,
    sourceFile,
    geometryHash,
    requestedUnitId,
    rootScene,
    cameraRig,
    presentationRevision,
    ensureSectionAnalysis,
    emitTelemetry,
  ]);

  // Theme-aware edge tint without re-parsing the GLTF binary.
  useEffect(() => {
    if (!scene) {
      return;
    }

    applyGltfEdgeThemeColor(scene, activeEdgeColor);
    invalidate();
  }, [scene, activeEdgeColor, invalidate]);

  useLayoutEffect(() => {
    if (!presentation) {
      return;
    }
    graphicsActor.send({
      type: 'gltfPresentationCommitted',
      revision: presentation.revision,
      key: presentation.key,
      unitId: presentation.unitId,
      manifest: presentation.manifest,
    });
  }, [graphicsActor, presentation]);

  // Retire the previous bundle only after React has detached its primitive.
  useEffect(() => {
    for (const retired of retiredPresentationsRef.current.splice(0)) {
      if (retired !== presentation) {
        retired.dispose();
      }
    }
  }, [presentation]);

  /* D27: section topology is built only for an armed section tool. It used to run 50 ms after every
   * presentation, for every model, whether or not the feature was ever used — 283 ms of main thread at
   * 100k triangles and 1.7 s at 1M, against a 16 ms pipeline. An active section view still submits
   * immediately and awaits the same promise before its next swap. */
  useEffect(() => {
    if (presentation?.sectionStatus !== 'pending' || !sectionView.isActive || !sectionView.enableMesh) {
      return;
    }
    void ensureSectionAnalysis(presentation);
  }, [ensureSectionAnalysis, presentation, sectionView.enableMesh, sectionView.isActive]);

  useFrame(() => {
    if (!scene && frameProbeRef.current) {
      frameProbeRef.current.modelEmptyFrames += 1;
    }
    const committed = committedPresentationRef.current;
    if (!committed || committed.firstFrameAt !== undefined || committed.committedAt === undefined) {
      return;
    }
    committed.firstFrameAt = performance.now();
    committed.timings.commitToFirstFrame = committed.firstFrameAt - committed.committedAt;
    committed.timings.receiptToFirstFrame = committed.firstFrameAt - committed.receivedAt;
    // A presentation that never needed section topology is complete at its first frame (D27).
    if (committed.sectionStatus !== 'pending' || committed.barrier === 'display-ready') {
      emitTelemetry(committed, 'presented');
    }
  });

  useEffect(
    () => () => {
      topologyScheduler.dispose();
      candidatePresentationRef.current?.dispose();
      committedPresentationRef.current?.dispose();
      for (const retired of retiredPresentationsRef.current.splice(0)) {
        retired.dispose();
      }
    },
    [topologyScheduler],
  );

  // Thickness is object-space and Three scales its transmission ray with modelMatrix.
  // Absorption distance is world-space: convert only that value to this viewport's
  // render units, from immutable loader materials on every atomic frame retarget.
  const retargetMaterialDistances = useCallback(
    (nextFrame: RenderFrame): void => {
      if (!presentation) {
        return;
      }
      presentation.scene.traverse((object) => {
        const original = presentation.originalMaterials.get(object.id);
        if (!original) {
          return;
        }
        const originals = getMaterials(original);
        for (const [index, material] of getObjectMaterials(object).entries()) {
          const source = originals[index];
          if (source && 'attenuationDistance' in source && 'attenuationDistance' in material) {
            (material as MeshPhysicalMaterial).attenuationDistance =
              (source as MeshPhysicalMaterial).attenuationDistance / nextFrame.metersPerRenderUnit;
          }
        }
      });
    },
    [presentation],
  );
  useRenderFrameRetarget(retargetMaterialDistances);

  // Material-mode changes mutate only the committed bundle and never reparse the GLB.
  useEffect(() => {
    if (!presentation) {
      return;
    }
    const materialSignature = `${enableMatcap}:${matcapTint}:${graphicsBackendThree}`;
    if (materialSignaturesRef.current.get(presentation) === materialSignature) {
      return;
    }
    if (enableMatcap) {
      void applyMatcap({ scene: presentation.scene }, matcapTint, graphicsBackendThree);
    } else {
      restoreOriginalMaterials(presentation.scene, presentation.originalMaterials);
    }
    retargetMaterialDistances(renderFrame);
    applyGltfSurfaceDepthBiasToScene(presentation.scene, graphicsBackendThree);
    seedSceneMaterialAppearances(presentation.scene);
    materialSignaturesRef.current.set(presentation, materialSignature);
    invalidate();
  }, [
    enableMatcap,
    graphicsBackendThree,
    invalidate,
    matcapTint,
    presentation,
    renderFrame,
    retargetMaterialDistances,
  ]);

  // Toggle visibility when enableSurfaces or enableLines change
  useEffect(() => {
    if (scene) {
      updateVisibility(scene, enableSurfaces, enableLines);
      invalidate();
    }
  }, [scene, enableSurfaces, enableLines, invalidate]);

  useEffect(() => {
    if (!scene || !componentManifest) {
      return;
    }

    const emphasised = applyModelComponentVisualStateToScene({
      scene,
      componentManifest,
      modelVisualState,
      enableSurfaces,
      enableLines,
    });
    applyGltfSurfaceDepthBiasToScene(scene, graphicsBackendThree);
    setModelEmphasisSet(rootScene, emphasised);
    invalidate();
    return () => {
      setModelEmphasisSet(rootScene, emptyModelEmphasisSet);
    };
  }, [
    scene,
    componentManifest,
    modelVisualState,
    enableSurfaces,
    enableLines,
    graphicsBackendThree,
    invalidate,
    rootScene,
  ]);

  useEffect(() => {
    lastHoveredComponentIdRef.current = modelVisualState.isViewerHoverSuppressed
      ? undefined
      : modelVisualState.hoveredComponentId;
  }, [modelVisualState.hoveredComponentId, modelVisualState.isViewerHoverSuppressed]);

  useEffect(() => {
    if (!componentManifest) {
      return;
    }

    if (!modelVisualState.focusedComponentId) {
      if (lastFocusedComponentIdRef.current !== undefined) {
        cameraRig.actorRef.send({
          type: 'setBounds',
          bounds: cameraRig.actorRef.getSnapshot().context.view.bounds,
        });
        invalidate();
      }
      lastFocusedComponentIdRef.current = undefined;
      return;
    }

    if (lastFocusedComponentIdRef.current === modelVisualState.focusedComponentId) {
      return;
    }

    const focusedNode = componentManifest.nodesById[modelVisualState.focusedComponentId];
    if (!focusedNode?.bounds) {
      return;
    }

    lastFocusedComponentIdRef.current = modelVisualState.focusedComponentId;
    const physicalBox = applyCanonicalGltfBounds(
      new Box3(new Vector3(...focusedNode.bounds.min), new Vector3(...focusedNode.bounds.max)),
    );
    const sceneBounds = cameraRig.actorRef.getSnapshot().context.view.bounds;
    cameraRig.actorRef.send({
      type: 'frame',
      bounds: {
        min: [physicalBox.min.x, physicalBox.min.y, physicalBox.min.z],
        max: [physicalBox.max.x, physicalBox.max.y, physicalBox.max.z],
      },
      margin: 0.1,
    });
    cameraRig.actorRef.send({ type: 'setBounds', bounds: sceneBounds });
    invalidate();
  }, [cameraRig, componentManifest, invalidate, modelVisualState.focusedComponentId]);

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (hasModelHitBlockingSceneUiHit(event.intersections)) {
        const hoverUpdate = resolveViewerHoverUpdate({
          isViewerHoverSuppressed: modelVisualState.isViewerHoverSuppressed,
          previousComponentId: lastHoveredComponentIdRef.current,
          nextComponentId: undefined,
        });
        lastHoveredComponentIdRef.current = hoverUpdate.nextCachedComponentId;
        if (hoverUpdate.shouldSend) {
          graphicsActor.send({
            type: 'setHoveredModelComponent',
            unitId,
            componentId: hoverUpdate.componentId,
            source: 'viewer',
          });
        }
        return;
      }

      if (modelVisualState.isViewerHoverSuppressed) {
        lastHoveredComponentIdRef.current = undefined;
        return;
      }

      if (graphicsActor.getSnapshot().context.suppressNextModelPointerClick) {
        graphicsActor.send({ type: 'clearModelPointerClickGuard' });
      }

      event.stopPropagation();
      // The scene's raycast owner already resolved the nearest visible, unclipped surface.
      const componentId = getObjectComponentId(event.object);
      const hoverUpdate = resolveViewerHoverUpdate({
        isViewerHoverSuppressed: modelVisualState.isViewerHoverSuppressed,
        previousComponentId: lastHoveredComponentIdRef.current,
        nextComponentId: componentId,
      });
      lastHoveredComponentIdRef.current = hoverUpdate.nextCachedComponentId;
      if (hoverUpdate.shouldSend) {
        graphicsActor.send({
          type: 'setHoveredModelComponent',
          unitId,
          componentId: hoverUpdate.componentId,
          source: 'viewer',
        });
      }
    },
    [graphicsActor, modelVisualState.isViewerHoverSuppressed, unitId],
  );

  const handlePointerOut = useCallback(() => {
    const hoverUpdate = resolveViewerHoverUpdate({
      isViewerHoverSuppressed: modelVisualState.isViewerHoverSuppressed,
      previousComponentId: lastHoveredComponentIdRef.current,
      nextComponentId: undefined,
    });
    lastHoveredComponentIdRef.current = hoverUpdate.nextCachedComponentId;
    if (hoverUpdate.shouldSend) {
      graphicsActor.send({
        type: 'setHoveredModelComponent',
        unitId,
        componentId: undefined,
        source: 'viewer',
      });
    }
  }, [graphicsActor, modelVisualState.isViewerHoverSuppressed, unitId]);

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const graphicsContext = graphicsActor.getSnapshot().context;
      const clickAction = resolveModelPointerClickAction({
        intersections: event.intersections,
        modelComponentId: getObjectComponentId(event.object),
        suppressNextModelPointerClick: graphicsContext.suppressNextModelPointerClick,
        isModelPointerClickSuppressed: graphicsContext.modelPointerClickSuppressionReasons.length > 0,
      });

      if (clickAction.type === 'allowSceneUi') {
        return;
      }

      event.stopPropagation();
      for (const dispatchEvent of resolveModelPointerClickDispatches({
        clickAction,
        unitId,
      })) {
        graphicsActor.send(dispatchEvent);
      }
    },
    [graphicsActor, unitId],
  );

  const resolveContextMenuActionFromEvent = useCallback(
    (event: ThreeEvent<MouseEvent | PointerEvent>): ModelContextMenuAction => {
      const graphicsContext = graphicsActor.getSnapshot().context;
      return resolveModelContextMenuAction({
        intersections: event.intersections,
        modelComponentId: getObjectComponentId(event.object),
        suppressNextModelPointerClick: graphicsContext.suppressNextModelPointerClick,
        isModelPointerClickSuppressed: graphicsContext.modelPointerClickSuppressionReasons.length > 0,
      });
    },
    [graphicsActor],
  );

  const publishSecondaryPointerAction = useCallback(
    (contextMenuAction: ModelContextMenuAction): void => {
      if (!onModelComponentSecondaryPointerCandidate) {
        return;
      }

      if (contextMenuAction.type === 'consumeModelPointerGuard') {
        graphicsActor.send({ type: 'clearModelPointerClickGuard' });
      }
      onModelComponentSecondaryPointerCandidate(
        contextMenuAction.type === 'openComponentMenu'
          ? { unitId, componentId: contextMenuAction.componentId }
          : undefined,
      );
    },
    [graphicsActor, onModelComponentSecondaryPointerCandidate, unitId],
  );

  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!onModelComponentSecondaryPointerCandidate || event.nativeEvent.button !== 2) {
        return;
      }

      const contextMenuAction = resolveContextMenuActionFromEvent(event);

      if (contextMenuAction.type === 'allowSceneUi') {
        return;
      }

      event.stopPropagation();
      publishSecondaryPointerAction(contextMenuAction);
    },
    [onModelComponentSecondaryPointerCandidate, publishSecondaryPointerAction, resolveContextMenuActionFromEvent],
  );

  const handlePointerMissed = useCallback(() => {
    lastHoveredComponentIdRef.current = undefined;
    if (!modelVisualState.isViewerHoverSuppressed) {
      graphicsActor.send({
        type: 'setHoveredModelComponent',
        unitId,
        componentId: undefined,
        source: 'viewer',
      });
    }

    const missedAction = resolveModelPointerMissedAction({
      suppressNextModelPointerClick: graphicsActor.getSnapshot().context.suppressNextModelPointerClick,
      isModelPointerClickSuppressed: graphicsActor.getSnapshot().context.modelPointerClickSuppressionReasons.length > 0,
    });
    if (missedAction.type === 'consumeModelPointerGuard') {
      graphicsActor.send({ type: 'clearModelPointerClickGuard' });
      return;
    }

    graphicsActor.send({
      type: 'clearModelComponentFocus',
      unitId,
      source: 'viewer',
    });
    graphicsActor.send({
      type: 'clearModelComponentSelection',
      unitId,
      source: 'viewer',
    });
  }, [graphicsActor, modelVisualState.isViewerHoverSuppressed, unitId]);

  if (!scene) {
    return undefined;
  }

  return (
    <group matrix={assetMatrix} matrixAutoUpdate={false}>
      <primitive
        object={scene}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
        onPointerMissed={handlePointerMissed}
      />
    </group>
  );
}
