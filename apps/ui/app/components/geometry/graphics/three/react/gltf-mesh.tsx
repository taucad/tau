import { installSectionClip, transferSectionClip } from '#components/geometry/graphics/three/materials/section-clip.js';
import {
  createGltfSurfaceBatches,
  disposeGltfSurfaceBatches,
  qualifyGltfSurfaceMaterial,
  sealGltfSurfaceMaterial,
  gltfSurfacePresentationTag,
} from '#components/geometry/graphics/three/utils/gltf-surface-batches.js';
import type { GltfSurfaceBatches } from '#components/geometry/graphics/three/utils/gltf-surface-batches.js';
import { subscribeToMatcapLoad } from '#components/geometry/graphics/three/materials/matcap-material.js';
import { geometryReceiptAt, recordRendererSpan } from '#lib/renderer-telemetry.js';
import { invalidateSceneTransparency } from '#components/geometry/graphics/three/utils/scene-transparency-revision.js';
import { holdGeometryPresentation } from '#components/geometry/graphics/three/utils/geometry-presentation-admission.js';
import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { GLTFLoader } from 'three/addons';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type {
  Group,
  Object3D,
  Material,
  Texture,
  Intersection,
  Raycaster,
  BufferGeometry,
  Mesh,
  MeshPhysicalMaterial,
  InstancedMesh,
} from 'three';
import { Vector2, Box3, Vector3 } from 'three';
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
import { useSectionClip } from '#components/geometry/graphics/three/react/section-clipping-group.js';
import { installSectionClipUnder } from '#components/geometry/graphics/three/react/section-view.utils.js';
import {
  gltfEdgeColorDarkMode,
  gltfEdgeColorLightMode,
} from '#components/geometry/graphics/three/overlay-colors.constants.js';
import { Theme, useTheme } from '#hooks/use-theme.js';
import { darkModeIntensityScale } from '#components/geometry/graphics/three/utils/lights.utils.js';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import {
  prepareGltfMetadata,
  gltfPrimitiveOccurrenceKey,
} from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import type { GltfMeasurementFeatures } from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
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
  useKinematicsSelector,
  useModelInteractionSelector,
  useRenderFrame,
  useRenderFrameRetarget,
} from '#hooks/use-graphics.js';
import type { RenderFrame } from '@taucad/spatial';
import { deriveModelInteractionUnitId, getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import { getKinematicsUnitState } from '#machines/kinematics.machine.js';
import type { ModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import {
  resolveSectionViewRaycastClip,
  useSectionViewFlags,
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
import { useKinematicsViewer } from '#components/geometry/graphics/three/react/kinematics-viewer.js';
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
  return maybeMesh.isMesh === true && !isFatLineSegmentsMesh(object) && !object.userData[gltfSurfacePresentationTag];
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
      for (const material of getMaterials(mesh.material)) {
        qualifyGltfSurfaceMaterial(material);
      }
    }
  });
  return saved;
}

/**
 * Restore clones of saved original materials onto a scene.
 * The saved map remains an immutable ownership inventory for final disposal.
 */
export function restoreOriginalMaterials(scene: Group, saved: Map<number, Material | Material[]>): void {
  scene.traverse((child) => {
    if ('isMesh' in child && child.isMesh && !isFatLineSegmentsMesh(child)) {
      const mesh = child as Mesh;
      const original = saved.get(mesh.id);
      if (!original) {
        return;
      }

      // The section clip carries over to the restored materials.
      const currentMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const replacement = Array.isArray(original) ? original.map((material) => material.clone()) : original.clone();
      const restoredMats = Array.isArray(replacement) ? replacement : [replacement];
      for (const material of restoredMats) {
        qualifyGltfSurfaceMaterial(material);
      }
      for (const [index, restoredMat] of restoredMats.entries()) {
        const currentMat = currentMats[index] ?? currentMats[0];
        if (currentMat) {
          transferSectionClip(currentMat, restoredMat);
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
  readonly ownershipSignature: string;
  readonly getMeasurementFeatures: ReturnType<typeof prepareGltfMetadata>['getMeasurementFeatures'];
  readonly parser: SectionTopologyGltfParser;
  readonly originalMaterials: Map<number, Material | Material[]>;
  surfaceBatches: GltfSurfaceBatches;
  /** D22: the buffers a same-topology result may be written into, absent when the scene cannot take one. */
  inPlace?: InPlaceGeometryTargets;
  readonly sourceBytes: Uint8Array<ArrayBuffer>;
  readonly presentationAdmission: ReturnType<typeof holdGeometryPresentation>;
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
  disposeResources: () => void;
};

type GltfPresentationCounts = {
  meshCount: number;
  triangleCount: number;
  sourceLineCount: number;
  lineSegmentCount: number;
};
const presentationCounts = new WeakMap<Group, GltfPresentationCounts>();
const countGltfPresentation = (scene: Group): GltfPresentationCounts => {
  getComponentInventory(scene);
  return presentationCounts.get(scene)!;
};

type ComponentVisualStateOptions = {
  readonly componentId: string;
  readonly hiddenComponentIds: ReadonlySet<string>;
  readonly isolatedComponentIds: ReadonlySet<string>;
  readonly focusedComponentId?: string;
  readonly explicitOpacity?: number;
};

// Binary topology can change ownership without changing glTF's JSON node layout.
function ownershipSignature(manifest: GeometryComponentManifest): string {
  return JSON.stringify([
    manifest.rootId,
    manifest.nodeOrder,
    manifest.nodeOrder.map((id) => {
      const node = manifest.nodesById[id];
      return node
        ? {
            ...node,
            bounds: undefined,
            reference: undefined,
            appearance: undefined,
            capabilities: undefined,
          }
        : undefined;
    }),
  ]);
}

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
    readonly measurementFeatures?: ReadonlyMap<string, GltfMeasurementFeatures>;
    readonly preserveInventory?: boolean;
  },
): void {
  if (!options.preserveInventory) {
    componentInventories.delete(scene);
  }
  appliedAppearance.delete(scene);
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

  const setMeasurementFeatures = (
    object: Object3D,
    componentId: string,
    reference: GeometryComponentPrimitiveRef | undefined,
  ): void => {
    const key = reference
      ? gltfPrimitiveOccurrenceKey(reference)
      : (object.userData['measurementPrimitiveKey'] as string | undefined);
    if (key) {
      object.userData['measurementPrimitiveKey'] = key;
    }
    const features = key ? options.measurementFeatures?.get(key) : undefined;
    if (features?.componentId === componentId) {
      object.userData['measurementFeatures'] = features;
    } else {
      delete object.userData['measurementFeatures'];
    }
  };

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
    const association = options.associations?.get(object);
    const nodeIndex = association?.nodes ?? inheritedNodeIndex;
    const primitiveReference =
      nodeIndex !== undefined && association?.meshes !== undefined && association.primitives !== undefined
        ? {
            nodeIndex,
            meshIndex: association.meshes,
            primitiveIndex: association.primitives,
          }
        : undefined;
    const existingComponentId = getModelComponentId(object);
    if (typeof existingComponentId === 'string') {
      setModelComponentOwner(object, {
        unitId: options.unitId,
        componentId: existingComponentId,
      });
      const previousFeatures = object.userData['measurementFeatures'] as GltfMeasurementFeatures | undefined;
      setMeasurementFeatures(object, existingComponentId, primitiveReference ?? previousFeatures?.primitive);
      for (const child of object.children) {
        annotateObject({
          object: child,
          inheritedComponentId: existingComponentId,
          previousSiblingRenderableComponentId: undefined,
          inheritedNodeIndex: nodeIndex,
        });
      }
      return existingComponentId;
    }

    const primitiveComponentId = primitiveReference
      ? getGltfPrimitiveComponentId(ownership, primitiveReference)
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
        setMeasurementFeatures(object, componentId, primitiveReference);
      }
    }

    let previousChildRenderableComponentId: string | undefined;
    for (const child of object.children) {
      if (child.userData[gltfSurfacePresentationTag]) {
        continue;
      }
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
    if (child.userData[gltfSurfacePresentationTag]) {
      continue;
    }
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
      sealGltfSurfaceMaterial(material);
    }
  });
}

export type ApplyModelComponentVisualStateToSceneOptions = Readonly<{
  scene: Group;
  /** Stable inventory supplied only by the presentation owner. Other callers collect current membership. */
  inventory?: readonly Object3D[];
  componentManifest: GeometryComponentManifest;
  modelVisualState: Pick<
    ModelInteractionUnitState,
    | 'hiddenComponentIds'
    | 'isolatedComponentIds'
    | 'focusedComponentId'
    | 'opacityByComponentId'
    | 'hoveredComponentId'
    | 'selectedComponentIds'
  > & {
    /** Parts the Kinematics pane points at; they light as a hovered part does. */
    readonly kinematicsHoveredComponentIds?: readonly string[];
  };
  enableSurfaces: boolean;
  enableLines: boolean;
}>;

const componentInventories = new WeakMap<Group, readonly Object3D[]>();
const expandedEdgeScenes = new WeakSet<Group>();
const appliedAppearance = new WeakMap<Group, ApplyModelComponentVisualStateToSceneOptions>();

const getComponentInventory = (scene: Group): readonly Object3D[] => {
  let objects = componentInventories.get(scene);
  if (!objects) {
    const collected: Object3D[] = [];
    const counts: GltfPresentationCounts = {
      meshCount: 0,
      triangleCount: 0,
      sourceLineCount: 0,
      lineSegmentCount: 0,
    };
    scene.traverse((object) => {
      if (object.userData[gltfSurfacePresentationTag]) {
        return;
      }
      if (Boolean(getObjectComponentId(object)) || isSurfaceObject(object) || isLineObject(object)) {
        collected.push(object);
      }
      if (isSurfaceObject(object)) {
        counts.meshCount += 1;
        counts.triangleCount += Math.floor(
          (object.geometry.getIndex()?.count ?? object.geometry.getAttribute('position').count) / 3,
        );
      } else if (isLineObject(object) && !object.userData['fatLineSource']) {
        counts.sourceLineCount += 1;
        const { geometry } = object as Object3D & { geometry: BufferGeometry };
        counts.lineSegmentCount +=
          geometry.attributes['instanceStart']?.count ?? Math.floor(geometry.getAttribute('position').count / 2);
      }
    });
    presentationCounts.set(scene, counts);
    objects = collected;
    componentInventories.set(scene, objects);
  }
  return objects;
};

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
  inventory,
}: ApplyModelComponentVisualStateToSceneOptions): ModelEmphasisSet {
  const previous = appliedAppearance.get(scene);
  const applyAppearance =
    !inventory ||
    !previous ||
    previous.componentManifest !== componentManifest ||
    previous.enableSurfaces !== enableSurfaces ||
    previous.enableLines !== enableLines ||
    previous.modelVisualState.hiddenComponentIds !== modelVisualState.hiddenComponentIds ||
    previous.modelVisualState.isolatedComponentIds !== modelVisualState.isolatedComponentIds ||
    previous.modelVisualState.focusedComponentId !== modelVisualState.focusedComponentId ||
    previous.modelVisualState.opacityByComponentId !== modelVisualState.opacityByComponentId;
  appliedAppearance.set(scene, {
    scene,
    componentManifest,
    modelVisualState,
    enableSurfaces,
    enableLines,
  });
  const hidden = new Set(modelVisualState.hiddenComponentIds);
  const isolated = new Set(modelVisualState.isolatedComponentIds);
  const emphasisComponents = {
    focused: new Set(modelVisualState.focusedComponentId ? [modelVisualState.focusedComponentId] : []),
    selected: new Set(modelVisualState.selectedComponentIds),
    hovered: new Set([
      ...(modelVisualState.hoveredComponentId ? [modelVisualState.hoveredComponentId] : []),
      ...(modelVisualState.kinematicsHoveredComponentIds ?? []),
    ]),
  };
  const opacityByComponentId =
    Object.keys(modelVisualState.opacityByComponentId).length > 0 ? modelVisualState.opacityByComponentId : undefined;
  const hover: Mesh[] = [];
  const selected: Mesh[] = [];

  const currentObjects: Object3D[] = [];
  if (applyAppearance) {
    invalidateSceneTransparency(scene);
  }
  if (!inventory) {
    scene.traverse((object) => {
      if (!object.userData[gltfSurfacePresentationTag]) {
        currentObjects.push(object);
      }
    });
  }
  for (const object of inventory ?? currentObjects) {
    const isLine = isLineObject(object);
    const isSurface = isSurfaceObject(object);
    const globallyVisible = isLine ? enableLines : isSurface ? enableSurfaces : true;
    const componentId = getObjectComponentId(object);
    if (!componentId) {
      if (applyAppearance && (isLine || isSurface)) {
        object.visible = globallyVisible;
      }
      continue;
    }
    const visualState = applyAppearance
      ? resolveComponentVisualStateWithManifest({
          componentId,
          manifest: componentManifest,
          hiddenComponentIds: hidden,
          isolatedComponentIds: isolated,
          focusedComponentIds: emphasisComponents.focused,
          opacityByComponentId,
        })
      : undefined;
    if (visualState) {
      object.visible = globallyVisible && visualState.visible;
    }

    const emphasis = resolveModelComponentEmphasisWithManifest(emphasisComponents, componentManifest, componentId);
    if (isLine) {
      // Edges share one base material per presentation, so emphasis is a per-object material
      // swap rather than a tint on the shared material (which would let the last-visited
      // component win). Edge opacity is not per-component; see the edge emphasis blueprint.
      const [worn] = getObjectMaterials(object);
      setGltfFatLineEmphasis(object, emphasis);
      const [next] = getObjectMaterials(object);
      if (worn && next) {
        transferSectionClip(worn, next);
      }
      continue;
    }

    if (isSurface && object.visible && emphasis !== 'none') {
      (emphasis === 'hover' ? hover : selected).push(object);
    }

    for (const material of visualState ? getObjectMaterials(object) : []) {
      const snapshot = getOrCaptureModelMaterialAppearance(material);
      applyModelMaterialAppearance(material, snapshot, visualState!.opacity);
    }
  }

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
  const sectionClip = useSectionClip();
  const sectionView = useSectionViewFlags();
  const cameraRig = useCameraRig();
  const renderFrame = useRenderFrame();
  const assetMatrix = useMemo(() => createCanonicalGltfToTauMatrix(), []);
  const [presentation, setPresentation] = useState<PreparedGltfPresentation | undefined>();
  const committedPresentationRef = useRef<PreparedGltfPresentation | undefined>(undefined);
  const activePreparationRef = useRef<Promise<void> | undefined>(undefined);
  const preparationStats = useRef({
    activeParses: 0,
    activeParseHighWaterMark: 0,
    parsesStarted: 0,
    parsesDiscarded: 0,
    committedBundleHighWaterMark: 0,
    candidateBundleHighWaterMark: 0,
  });
  const candidatePresentationRef = useRef<PreparedGltfPresentation | undefined>(undefined);
  const retiredPresentationsRef = useRef<PreparedGltfPresentation[]>([]);
  const frameProbeRef = useRef<{ revision: number; modelEmptyFrames: number } | undefined>(undefined);
  const [topologyScheduler] = useState(createSectionTopologyScheduler);
  const { size, invalidate, scene: rootScene } = useThree();
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
  const sectionBarrierRef = useRef<GltfPresentationBarrier>(sectionView.isActive ? 'analysis-ready' : 'display-ready');
  const materialOptionsRef = useRef({ enableMatcap, matcapTint, enableLines });
  const needsMeasurementFeatures = useGraphicsSelector(
    (state) => state.context.isMeasureActive || state.context.measurements.some((measurement) => measurement.isPinned),
  );
  const measurementDemandRef = useRef(needsMeasurementFeatures);
  useLayoutEffect(() => {
    measurementDemandRef.current = needsMeasurementFeatures;
  }, [needsMeasurementFeatures]);
  const materialSignaturesRef = useRef(new WeakMap<PreparedGltfPresentation, string>());

  useEffect(() => {
    sectionBarrierRef.current = sectionView.isActive ? 'analysis-ready' : 'display-ready';
    materialOptionsRef.current = { enableMatcap, matcapTint, enableLines };
  }, [enableMatcap, matcapTint, enableLines, sectionView.isActive]);

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
  const kinematicsHoveredComponentIds = useKinematicsSelector(
    (state) => getKinematicsUnitState(state.context, unitId).hoveredComponentIds,
  );
  const modelVisualState = useMemo(
    () => ({
      ...modelUnitState,
      isViewerHoverSuppressed,
      kinematicsHoveredComponentIds,
    }),
    [isViewerHoverSuppressed, kinematicsHoveredComponentIds, modelUnitState],
  );
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
      const { context } = graphicsActor.getSnapshot();
      // A section handle drag owns the pointer and suppresses model hover, so its moves skip the model query.
      // The model's presses (secondary, and a primary one that starts a kinematics drag) never start that
      // drag, and the release's click raycasts after pointer-up has lifted the suppression.
      if (context.viewerHoverSuppressionReasons.includes('sectionViewTransform')) {
        return false;
      }

      const hit = raycastFirstVisibleMeshHit({
        raycaster,
        meshes: getModelPickableMeshes(),
        // Read here, not selected: a section drag step must not re-render the model.
        clipping: resolveSectionViewRaycastClip(context, renderFrame),
      });
      if (hit) {
        intersections.push(hit);
      }
      return false;
    };
    return () => {
      scene.raycast = previousRaycast;
    };
  }, [getModelPickableMeshes, graphicsActor, renderFrame, scene]);

  const handleKinematicsPointerDown = useKinematicsViewer({
    unitId,
    scene,
    manifest: componentManifest,
    getPickableMeshes: getModelPickableMeshes,
  });

  // R3F already invalidates on resize. Update line uniforms before that frame,
  // without a second RAF/traversal after the resized canvas has been presented.
  useLayoutEffect(() => {
    resolutionRef.current.set(size.width, size.height);
    if (scene) {
      updateLineMaterialResolution(scene, resolutionRef.current);
    }
  }, [size.width, size.height, scene]);

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
          glbBytes: bundle.sourceBytes.byteLength,
          renderBoundary: 'submitted',
          ...countGltfPresentation(bundle.scene),
          durations: bundle.timings,
          modelEmptyFrames:
            frameProbeRef.current?.revision === bundle.revision
              ? frameProbeRef.current.modelEmptyFrames
              : bundle.modelEmptyFrames,
          ...preparationStats.current,
          topologyJobsStarted: schedulerStats.started,
          topologyJobsDiscarded: schedulerStats.discarded,
        },
      });
    },
    [graphicsActor, graphicsBackendThree, topologyScheduler],
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
            const analysisStartedAt = performance.now();
            await registerGltfSectionSurfaceSources({
              scene: bundle.scene,
              manifest: bundle.manifest,
              unitId: bundle.unitId,
              parser: bundle.parser,
              isCancelled: () => bundle.disposed,
              onTiming: (timing: GltfSectionTopologyTiming) => {
                bundle.timings.topologySubmit = timing.submitMilliseconds;
                bundle.timings.topologyWorker = timing.workerMilliseconds;
                bundle.timings.topologyPack = timing.packMilliseconds;
                bundle.timings.topologyHydrate = timing.hydrateMilliseconds;
                bundle.timings.topologyResolve = timing.resolveMilliseconds;
                recordRendererSpan('renderer.section-topology', {
                  startTime: analysisStartedAt,
                  duration: performance.now() - analysisStartedAt,
                  attributes: {
                    key: bundle.key,
                    revision: bundle.revision,
                    backend: graphicsBackendThree,
                    ...timing,
                  },
                });
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
    [emitTelemetry, graphicsActor, graphicsBackendThree, invalidate, topologyScheduler],
  );

  // Parse and fully prepare one unattached candidate while the committed scene remains visible.
  useEffect(() => {
    // Cleanup may cancel across any awaited loader, task yield or analysis.
    const cancellation = { cancelled: false };
    const isCancelled = (): boolean => cancellation.cancelled;

    const preparationAt = performance.now();
    const presentationAdmission = holdGeometryPresentation(gltfFile);
    const receivedAt = geometryReceiptAt(gltfFile) ?? preparationAt;
    const timings: GltfPresentationTimings = {
      receiptToPreparation: preparationAt - receivedAt,
    };
    frameProbeRef.current = {
      revision: presentationRevision,
      modelEmptyFrames: 0,
    };
    graphicsActor.send({
      type: 'gltfPreparationStarted',
      revision: presentationRevision,
      key: geometryHash ?? '',
    });

    let candidateMetadata: ReturnType<typeof prepareGltfMetadata> | undefined;
    const prepareMetadata = (): ReturnType<typeof prepareGltfMetadata> => {
      if (candidateMetadata) {
        return candidateMetadata;
      }
      const startedAt = performance.now();
      candidateMetadata = prepareGltfMetadata(gltfFile, {
        sourceFile,
        geometryHash,
      });
      timings.manifest = performance.now() - startedAt;
      return candidateMetadata;
    };

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
        candidatePresentationRef.current !== undefined ||
        committed.sectionStatus !== 'pending' ||
        sectionBarrierRef.current !== 'display-ready'
      ) {
        return false;
      }

      // Validate component and mechanism metadata before touching any live buffer.
      const { manifest, getMeasurementFeatures, parsed } = prepareMetadata();
      if (ownershipSignature(manifest) !== committed.ownershipSignature) {
        return false;
      }
      const measurementFeatures = measurementDemandRef.current ? getMeasurementFeatures() : undefined;
      const inPlaceStartedAt = performance.now();
      committed.inPlace ??= captureInPlaceGeometryTargets({
        scene: committed.scene,
        associations: committed.parser.associations,
        bytes: committed.sourceBytes,
      });
      if (!committed.inPlace) {
        return false;
      }
      if (!applyInPlaceGeometryUpdate(committed.inPlace, gltfFile, parsed)) {
        return false;
      }
      committed.surfaceBatches.sync();
      // Updated prototype bounds affect every placed instance, even when its matrix is unchanged.
      for (const object of committed.surfaceBatches.group.children) {
        if ('isInstancedMesh' in object && object.isInstancedMesh) {
          const batch = object as InstancedMesh;
          batch.computeBoundingBox();
          batch.computeBoundingSphere();
        }
      }
      timings.inPlace = performance.now() - inPlaceStartedAt;

      const annotationStartedAt = performance.now();
      // Component ids are unchanged with the topology, so this only re-keys them to the new unit.
      annotateSceneComponents(committed.scene, manifest, {
        unitId: requestedUnitId,
        preserveInventory: true,
        measurementFeatures,
      });
      timings.annotation = performance.now() - annotationStartedAt;

      const bundle: PreparedGltfPresentation = {
        ...committed,
        revision: presentationRevision,
        key: geometryHash ?? '',
        unitId: requestedUnitId,
        manifest,
        getMeasurementFeatures,
        sourceBytes: gltfFile,
        presentationAdmission,
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
      const { disposeResources } = committed;
      committed.dispose = () => undefined;
      bundle.dispose = () => {
        bundle.disposed = true;
        disposeResources();
      };
      materialSignaturesRef.current.set(bundle, materialSignaturesRef.current.get(committed) ?? '');
      committedPresentationRef.current = bundle;
      preparationStats.current.committedBundleHighWaterMark = 1;
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
        if (presentInPlace()) {
          return;
        }
        const parseStartedAt = performance.now();
        const loaderBytes =
          gltfFile.byteOffset === 0 && gltfFile.byteLength === gltfFile.buffer.byteLength
            ? gltfFile.buffer
            : new Uint8Array(gltfFile).buffer;
        const stats = preparationStats.current;
        stats.parsesStarted += 1;
        stats.activeParses += 1;
        stats.activeParseHighWaterMark = Math.max(stats.activeParseHighWaterMark, stats.activeParses);
        let gltf: GLTF;
        try {
          gltf = await gltfLoader.parseAsync(loaderBytes, '');
        } finally {
          stats.activeParses -= 1;
        }
        timings.parse = performance.now() - parseStartedAt;
        unpreparedDispose = createGltfResourceDisposer(gltf.scene, undefined, true);

        if (timings.parse >= 50) {
          // A real task boundary lets input and the prior scene paint after a large loader job.
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
          });
        }
        if (isCancelled()) {
          stats.parsesDiscarded += 1;
          unpreparedDispose();
          return;
        }

        if (gltf.scene.children.length === 0) {
          probeGltfScene(gltf, gltfFile.byteLength);
        }
        // The bounds owner measures/validates the complete committed scene once, after its saved pose.

        const { manifest, getMeasurementFeatures } = prepareMetadata();
        const annotationStartedAt = performance.now();
        annotateSceneComponents(gltf.scene, manifest, {
          unitId: requestedUnitId,
          associations: gltf.parser.associations as ReadonlyMap<Object3D, GltfLoaderAssociation>,
          measurementFeatures: measurementDemandRef.current ? getMeasurementFeatures() : undefined,
        });
        timings.annotation = performance.now() - annotationStartedAt;
        setGltfSectionSurfaceRegistrationState(gltf.scene, 'pending');

        // Convert LineSegments to LineSegments2 for fat line rendering
        const fatLinesStartedAt = performance.now();
        const edgeColor = theme === Theme.DARK ? gltfEdgeColorDarkMode : gltfEdgeColorLightMode;
        if (materialOptionsRef.current.enableLines) {
          applyFatLineSegments(gltf, {
            resolution: resolutionRef.current,
            backend: graphicsBackendThree,
            edgeColor,
          });
        }
        if (materialOptionsRef.current.enableLines) {
          expandedEdgeScenes.add(gltf.scene);
        }
        timings.fatLines = performance.now() - fatLinesStartedAt;

        if (performance.now() - annotationStartedAt >= 16) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
          });
          if (isCancelled()) {
            unpreparedDispose();
            return;
          }
        }
        const originalMaterials = saveOriginalMaterials(gltf.scene);
        unpreparedDispose = createGltfResourceDisposer(gltf.scene, originalMaterials);
        const materialsStartedAt = performance.now();
        const materialOptions = materialOptionsRef.current;
        if (materialOptions.enableMatcap) {
          await applyMatcap({ scene: gltf.scene }, materialOptions.matcapTint, graphicsBackendThree);
        }
        applyGltfSurfaceDepthBiasToScene(gltf.scene, graphicsBackendThree);
        // Install the committed clip before the first draw.
        installSectionClipUnder(gltf.scene, sectionClip);
        seedSceneMaterialAppearances(gltf.scene);
        timings.materials = performance.now() - materialsStartedAt;
        // Prime the canonical inventory before adding the private presentation subtree.
        const surfaces = getComponentInventory(gltf.scene).filter((object) => isSurfaceObject(object));
        const surfaceBatches = createGltfSurfaceBatches(gltf.scene, surfaces, {
          sources: getComponentInventory(gltf.scene).filter((object): object is Mesh => isFatLineSegmentsMesh(object)),
          backend: graphicsBackendThree,
          resolution: resolutionRef.current,
          prepareMaterial: (material) => {
            installSectionClip(material, sectionClip);
          },
        });
        const bundle: PreparedGltfPresentation = {
          revision: presentationRevision,
          key: geometryHash ?? '',
          unitId: requestedUnitId,
          scene: gltf.scene,
          manifest,
          ownershipSignature: ownershipSignature(manifest),
          getMeasurementFeatures,
          parser: gltf.parser as unknown as SectionTopologyGltfParser,
          originalMaterials,
          surfaceBatches,
          sourceBytes: gltfFile,
          presentationAdmission,
          receivedAt,
          timings,
          barrier: sectionBarrierRef.current,
          sectionStatus: 'pending',
          modelEmptyFrames: 0,
          telemetrySent: false,
          disposed: false,
          dispose: () => undefined,
          disposeResources: () => undefined,
        };
        materialSignaturesRef.current.set(
          bundle,
          `${materialOptions.enableMatcap}:${materialOptions.matcapTint}:${graphicsBackendThree}`,
        );
        const disposeCanonicalResources = createGltfResourceDisposer(bundle.scene, bundle.originalMaterials);
        const disposeResources = (): void => {
          disposeGltfSurfaceBatches(bundle.scene);
          disposeCanonicalResources();
        };
        bundle.disposeResources = disposeResources;
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
        stats.candidateBundleHighWaterMark = Math.max(stats.candidateBundleHighWaterMark, 1);
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
            presentationAdmission.release();
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

        // Compile through the actual active render context after layout applies pose, visibility,
        // bounds and camera. Detached compileAsync rebuilt programs for an incomplete context.
        if (isCancelled()) {
          bundle.dispose();
          if (candidatePresentationRef.current === bundle) {
            candidatePresentationRef.current = undefined;
          }
          return;
        }

        const previous = committedPresentationRef.current;
        bundle.modelEmptyFrames =
          frameProbeRef.current?.revision === bundle.revision ? frameProbeRef.current.modelEmptyFrames : 0;
        bundle.committedAt = performance.now();
        committedPresentationRef.current = bundle;
        stats.committedBundleHighWaterMark = Math.max(stats.committedBundleHighWaterMark, 1);
        if (candidatePresentationRef.current === bundle) {
          candidatePresentationRef.current = undefined;
        }
        if (previous) {
          retiredPresentationsRef.current.push(previous);
        }
        setPresentation(bundle);
        invalidate();
      } catch (error) {
        presentationAdmission.release();
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
              ...preparationStats.current,
              topologyJobsStarted: topologyScheduler.stats().started,
              topologyJobsDiscarded: topologyScheduler.stats().discarded,
            },
          });
        }
        unpreparedDispose?.();
      }
    };

    const prepareLatest = async (): Promise<void> => {
      // One active preparation; superseded waiters drop their bytes before doing any loader work.
      while (activePreparationRef.current) {
        // oxlint-disable-next-line no-await-in-loop -- A new loader job waits for the sole active preparation and drops stale revisions.
        await activePreparationRef.current;
        if (isCancelled()) {
          return;
        }
      }
      if (isCancelled()) {
        return;
      }
      const preparation = loadGltf();
      activePreparationRef.current = preparation;
      await preparation;
      if (activePreparationRef.current === preparation) {
        activePreparationRef.current = undefined;
      }
    };
    void prepareLatest();

    return () => {
      cancellation.cancelled = true;
      presentationAdmission.release();
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
    graphicsActor,
    sourceFile,
    geometryHash,
    requestedUnitId,
    presentationRevision,
    ensureSectionAnalysis,
    emitTelemetry,
    sectionClip,
  ]);

  useEffect(() => {
    if (scene && enableMatcap) {
      return subscribeToMatcapLoad(invalidate);
    }
    return undefined;
  }, [scene, enableMatcap, invalidate]);

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

  useLayoutEffect(() => {
    if (!presentation || !needsMeasurementFeatures) {
      return;
    }
    const features = presentation.getMeasurementFeatures();
    for (const object of getComponentInventory(presentation.scene)) {
      const key = object.userData['measurementPrimitiveKey'] as string | undefined;
      const feature = key ? features.get(key) : undefined;
      if (feature?.componentId === getObjectComponentId(object)) {
        object.userData['measurementFeatures'] = feature;
      }
    }
  }, [presentation, needsMeasurementFeatures]);

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
    if (presentation?.sectionStatus !== 'pending' || !sectionView.isActive) {
      return;
    }
    void ensureSectionAnalysis(presentation);
  }, [ensureSectionAnalysis, presentation, sectionView.isActive]);

  useFrame(() => {
    if (!scene && frameProbeRef.current) {
      frameProbeRef.current.modelEmptyFrames += 1;
    }
    const committed = committedPresentationRef.current;
    if (
      !committed ||
      scene !== committed.scene ||
      committed.firstFrameAt !== undefined ||
      committed.committedAt === undefined
    ) {
      return;
    }
    committed.firstFrameAt = performance.now();
    committed.timings.commitToFirstFrame = committed.firstFrameAt - committed.committedAt;
    committed.timings.receiptToFirstFrame = committed.firstFrameAt - committed.receivedAt;
    // A presentation that never needed section topology is complete at its first frame (D27).
    if (committed.sectionStatus !== 'pending' || committed.barrier === 'display-ready') {
      emitTelemetry(committed, 'presented');
    }
    const submittedAt = committed.firstFrameAt;
    requestAnimationFrame(() => {
      if (committedPresentationRef.current !== committed || committed.disposed) {
        return;
      }
      recordRendererSpan('renderer.presentation-opportunity', {
        startTime: submittedAt,
        duration: performance.now() - submittedAt,
        attributes: {
          key: committed.key,
          revision: committed.revision,
          backend: graphicsBackendThree,
        },
      });
      committed.presentationAdmission.presented();
    });
  }, 1.1);

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
      presentation.surfaceBatches.sync();
    },
    [presentation],
  );
  useRenderFrameRetarget(retargetMaterialDistances);

  // Material-mode and visual-state changes commit through one presentation owner.
  useLayoutEffect(() => {
    if (!presentation || !scene || !componentManifest) {
      return;
    }
    const materialSignature = `${enableMatcap}:${matcapTint}:${graphicsBackendThree}`;
    if (materialSignaturesRef.current.get(presentation) !== materialSignature) {
      if (enableMatcap) {
        void applyMatcap({ scene: presentation.scene }, matcapTint, graphicsBackendThree);
      } else {
        restoreOriginalMaterials(presentation.scene, presentation.originalMaterials);
      }
      retargetMaterialDistances(renderFrame);
      applyGltfSurfaceDepthBiasToScene(presentation.scene, graphicsBackendThree);
      seedSceneMaterialAppearances(presentation.scene);
      invalidateSceneTransparency(presentation.scene);
      appliedAppearance.delete(presentation.scene);
      materialSignaturesRef.current.set(presentation, materialSignature);
    }

    if (enableLines && !expandedEdgeScenes.has(scene)) {
      const bundle = committedPresentationRef.current;
      applyFatLineSegments(
        { scene, parser: bundle?.parser },
        {
          resolution: resolutionRef.current,
          backend: graphicsBackendThree,
          edgeColor: activeEdgeColor,
          preserveSourceNodes: true,
        },
      );
      expandedEdgeScenes.add(scene);
      if (bundle?.scene === scene) {
        bundle.inPlace = undefined;
      }
      componentInventories.delete(scene);
      appliedAppearance.delete(scene);
      installSectionClipUnder(scene, sectionClip);
      seedSceneMaterialAppearances(scene);
      if (bundle?.scene === scene) {
        bundle.surfaceBatches.dispose();
        const inventory = getComponentInventory(scene);
        bundle.surfaceBatches = createGltfSurfaceBatches(
          scene,
          inventory.filter((object) => isSurfaceObject(object)),
          {
            sources: inventory.filter((object): object is Mesh => isFatLineSegmentsMesh(object)),
            backend: graphicsBackendThree,
            resolution: resolutionRef.current,
            prepareMaterial: (material) => {
              installSectionClip(material, sectionClip);
            },
          },
        );
      }
    }

    const emphasised = applyModelComponentVisualStateToScene({
      scene,
      componentManifest,
      inventory: getComponentInventory(scene),
      modelVisualState,
      enableSurfaces,
      enableLines,
    });
    presentation.surfaceBatches.sync();
    setModelEmphasisSet(rootScene, emphasised);
    invalidate();
  }, [
    activeEdgeColor,
    componentManifest,
    enableLines,
    enableMatcap,
    enableSurfaces,
    graphicsBackendThree,
    invalidate,
    matcapTint,
    modelVisualState,
    presentation,
    renderFrame,
    retargetMaterialDistances,
    rootScene,
    scene,
    sectionClip,
  ]);

  useLayoutEffect(() => {
    if (!scene) {
      return undefined;
    }
    return () => {
      setModelEmphasisSet(rootScene, emptyModelEmphasisSet);
      invalidateSceneTransparency(rootScene);
    };
  }, [rootScene, scene]);

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
      if (event.nativeEvent.button === 0) {
        if (!hasModelHitBlockingSceneUiHit(event.intersections)) {
          handleKinematicsPointerDown(event);
        }
        return;
      }

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
    [
      handleKinematicsPointerDown,
      onModelComponentSecondaryPointerCandidate,
      publishSecondaryPointerAction,
      resolveContextMenuActionFromEvent,
    ],
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
