import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GLTFLoader } from 'three/addons';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Camera, Group, Object3D, Material, Texture, Intersection, Ray } from 'three';
import {
  Vector2,
  Box3,
  Vector3,
  Raycaster,
  PerspectiveCamera,
  OrthographicCamera,
  BufferGeometry,
  BufferAttribute,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import { useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { applyMatcap } from '#components/geometry/graphics/three/materials/gltf-matcap.js';
import {
  applyModelMaterialAppearance,
  getOrCaptureModelMaterialAppearance,
  resolveModelComponentEmphasis,
  updateCapturedModelMaterialBaseColor,
} from '#components/geometry/graphics/three/materials/model-component-appearance.js';
import type { ModelComponentEmphasis } from '#components/geometry/graphics/three/materials/model-component-appearance.js';
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
import { buildGltfComponentManifest } from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import { hasSceneTagInHierarchy, sceneTag } from '#components/geometry/graphics/three/utils/scene-tags.js';
import type { SceneTagKey } from '#components/geometry/graphics/three/utils/scene-tags.js';
import {
  getModelComponentId,
  getModelComponentIdInHierarchy,
  setModelComponentOwner,
} from '#components/geometry/graphics/three/utils/model-component-owner.js';
import { useGraphics, useModelInteractionRef, useModelInteractionSelector } from '#hooks/use-graphics.js';
import { deriveModelInteractionUnitId, getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import type { ModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import {
  createSectionViewRaycastClipState,
  useSectionView,
} from '#components/geometry/graphics/three/use-section-view.js';
import { raycastFirstVisibleMeshHit } from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import type { RaycastClipState } from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import {
  configureSectionSourceOnlyMaterial,
  isSectionSourceOnlyObject,
  markSectionSourceOnlyObject,
} from '#components/geometry/graphics/three/utils/section-source-only.js';
import type { GeometryComponentManifest, GeometryComponentNode, GeometryComponentPrimitiveRef } from '@taucad/types';

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
  readonly sourceFile?: string;
  readonly geometryHash?: string;
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

type ComponentVisualStateOptions = {
  readonly componentId: string;
  readonly hiddenComponentIds: ReadonlySet<string>;
  readonly isolatedComponentIds: ReadonlySet<string>;
  readonly focusedComponentId?: string;
  readonly explicitOpacity?: number;
};

type ComponentVisualStateWithManifestOptions = ComponentVisualStateOptions & {
  readonly manifest: GeometryComponentManifest;
  readonly opacityByComponentId: Record<string, number>;
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
  | { readonly type: 'clearModelComponentFocus'; readonly unitId: string; readonly source: 'viewer' }
  | { readonly type: 'clearModelComponentSelection'; readonly unitId: string; readonly source: 'viewer' };

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

  if (shouldConsumeGuardedModelPointerClick({ suppressNextModelPointerClick, isModelPointerClickSuppressed })) {
    return { type: 'consumeModelPointerGuard' };
  }

  return modelComponentId
    ? { type: 'toggleComponentSelection', componentId: modelComponentId }
    : { type: 'clearFocusAndSelection' };
}

export function resolveModelPointerMissedAction({
  suppressNextModelPointerClick,
  isModelPointerClickSuppressed,
}: {
  readonly suppressNextModelPointerClick: boolean;
  readonly isModelPointerClickSuppressed: boolean;
}): ModelPointerClickAction {
  return shouldConsumeGuardedModelPointerClick({ suppressNextModelPointerClick, isModelPointerClickSuppressed })
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
}: ComponentVisualStateOptions): { readonly visible: boolean; readonly opacity: number } {
  const isDimmedByIsolation = isolatedComponentIds.size > 0 && !isolatedComponentIds.has(componentId);
  const isDimmedByFocus = focusedComponentId !== undefined && focusedComponentId !== componentId;

  return {
    visible: !hiddenComponentIds.has(componentId),
    opacity: explicitOpacity ?? (isDimmedByIsolation || isDimmedByFocus ? 0.5 : 1),
  };
}

function getComponentAncestorIds(manifest: GeometryComponentManifest, componentId: string): string[] {
  const ancestors: string[] = [];
  let current = manifest.nodesById[componentId];
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId);
    ancestors.push(current.parentId);
    current = manifest.nodesById[current.parentId];
  }
  return ancestors;
}

function hasComponentOrAncestor(
  manifest: GeometryComponentManifest,
  componentId: string,
  componentIds: ReadonlySet<string>,
): boolean {
  if (componentIds.has(componentId)) {
    return true;
  }
  return getComponentAncestorIds(manifest, componentId).some((ancestorId) => componentIds.has(ancestorId));
}

function hasComponentOrDescendant(
  manifest: GeometryComponentManifest,
  componentId: string,
  componentIds: ReadonlySet<string>,
): boolean {
  if (componentIds.has(componentId)) {
    return true;
  }

  const stack = [...(manifest.nodesById[componentId]?.childIds ?? [])];
  while (stack.length > 0) {
    const nextId = stack.pop()!;
    if (componentIds.has(nextId)) {
      return true;
    }
    stack.push(...(manifest.nodesById[nextId]?.childIds ?? []));
  }
  return false;
}

function resolveInheritedOpacity({
  manifest,
  componentId,
  opacityByComponentId,
}: {
  readonly manifest: GeometryComponentManifest;
  readonly componentId: string;
  readonly opacityByComponentId: Record<string, number>;
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
  focusedComponentId,
  opacityByComponentId,
}: ComponentVisualStateWithManifestOptions): { readonly visible: boolean; readonly opacity: number } {
  const isHidden = hasComponentOrAncestor(manifest, componentId, hiddenComponentIds);
  const isIncludedByIsolation =
    isolatedComponentIds.size === 0 ||
    hasComponentOrAncestor(manifest, componentId, isolatedComponentIds) ||
    hasComponentOrDescendant(manifest, componentId, isolatedComponentIds);
  const focusedSet = focusedComponentId ? new Set([focusedComponentId]) : undefined;
  const isDimmedByFocus =
    focusedSet !== undefined &&
    !hasComponentOrAncestor(manifest, componentId, focusedSet) &&
    !hasComponentOrDescendant(manifest, componentId, focusedSet);
  const explicitOpacity = resolveInheritedOpacity({ manifest, componentId, opacityByComponentId });

  return {
    visible: !isHidden && isIncludedByIsolation,
    opacity: explicitOpacity ?? (!isIncludedByIsolation || isDimmedByFocus ? 0.5 : 1),
  };
}

function resolveModelComponentEmphasisWithManifest(
  unitState: Pick<ModelInteractionUnitState, 'hoveredComponentId' | 'selectedComponentIds' | 'focusedComponentId'>,
  manifest: GeometryComponentManifest,
  componentId: string,
): ModelComponentEmphasis {
  const focusedSet = unitState.focusedComponentId ? new Set([unitState.focusedComponentId]) : undefined;
  if (
    focusedSet &&
    (hasComponentOrAncestor(manifest, componentId, focusedSet) ||
      hasComponentOrDescendant(manifest, componentId, focusedSet))
  ) {
    return 'focused';
  }

  const selectedSet = new Set(unitState.selectedComponentIds);
  if (
    hasComponentOrAncestor(manifest, componentId, selectedSet) ||
    hasComponentOrDescendant(manifest, componentId, selectedSet)
  ) {
    return 'selected';
  }

  const hoveredSet = unitState.hoveredComponentId ? new Set([unitState.hoveredComponentId]) : undefined;
  if (
    hoveredSet &&
    (hasComponentOrAncestor(manifest, componentId, hoveredSet) ||
      hasComponentOrDescendant(manifest, componentId, hoveredSet))
  ) {
    return 'hover';
  }

  return resolveModelComponentEmphasis(unitState, componentId);
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

    if (isSectionSourceOnlyObject(object)) {
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

function configureSectionSourceOnlyMaterials(scene: Group): void {
  scene.traverse((object) => {
    if (!isSectionSourceOnlyObject(object)) {
      return;
    }

    for (const material of getObjectMaterials(object)) {
      configureSectionSourceOnlyMaterial(material);
    }
  });
}

function getPrimitiveReferences(node: GeometryComponentNode): readonly GeometryComponentPrimitiveRef[] {
  return Array.isArray(node.primitiveRefs) ? (node.primitiveRefs as readonly GeometryComponentPrimitiveRef[]) : [];
}

function appendMeshTrianglesToSectionSource({
  mesh,
  sceneWorldInverse,
  positions,
  indices,
}: {
  readonly mesh: Mesh;
  readonly sceneWorldInverse: Matrix4;
  readonly positions: number[];
  readonly indices: number[];
}): void {
  const { position } = mesh.geometry.attributes;
  if (!(position instanceof BufferAttribute)) {
    return;
  }

  const localToScene = new Matrix4().multiplyMatrices(sceneWorldInverse, mesh.matrixWorld);
  const index = mesh.geometry.getIndex();
  const sourceIndexCount = index?.count ?? position.count;
  const sourceIndices = index?.array as ArrayLike<number> | undefined;
  const point = new Vector3();
  const vertexOffset = positions.length / 3;

  for (let sourceOffset = 0; sourceOffset < sourceIndexCount; sourceOffset++) {
    const sourceVertexIndex = sourceIndices ? sourceIndices[sourceOffset]! : sourceOffset;
    point.fromBufferAttribute(position, sourceVertexIndex).applyMatrix4(localToScene);
    positions.push(point.x, point.y, point.z);
    indices.push(vertexOffset + sourceOffset);
  }
}

function createSectionSourceProxyGeometry(scene: Group, meshes: readonly Mesh[]): BufferGeometry | undefined {
  if (meshes.length === 0) {
    return undefined;
  }

  scene.updateMatrixWorld(true);
  const sceneWorldInverse = new Matrix4().copy(scene.matrixWorld).invert();
  const positions: number[] = [];
  const indices: number[] = [];

  for (const mesh of meshes) {
    mesh.updateMatrixWorld(true);
    appendMeshTrianglesToSectionSource({ mesh, sceneWorldInverse, positions, indices });
  }

  if (positions.length === 0 || indices.length === 0) {
    return undefined;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createInvisibleSectionSourceMaterial(): MeshBasicMaterial {
  const material = new MeshBasicMaterial();
  configureSectionSourceOnlyMaterial(material);
  return material;
}

function installSectionSourceProxyMeshes(
  scene: Group,
  manifest: GeometryComponentManifest,
  options: { readonly unitId: string },
): void {
  const sourceMeshesByComponentId = new Map<string, Mesh[]>();
  scene.traverse((object) => {
    if (!isSurfaceObject(object) || isSectionSourceOnlyObject(object)) {
      return;
    }

    const componentId = getModelComponentId(object);
    if (!componentId) {
      return;
    }

    const meshes = sourceMeshesByComponentId.get(componentId) ?? [];
    meshes.push(object);
    sourceMeshesByComponentId.set(componentId, meshes);
  });

  for (const componentId of manifest.nodeOrder) {
    const component = manifest.nodesById[componentId];
    if (component?.kind !== 'body' || component.childIds.length === 0) {
      continue;
    }

    const sourceMeshes = component.childIds.flatMap((childId) => sourceMeshesByComponentId.get(childId) ?? []);
    if (sourceMeshes.length < 2) {
      continue;
    }

    const geometry = createSectionSourceProxyGeometry(scene, sourceMeshes);
    if (!geometry) {
      continue;
    }

    const proxy = new Mesh(geometry, createInvisibleSectionSourceMaterial());
    proxy.name = `${component.name} section source`;
    proxy.frustumCulled = false;
    proxy.renderOrder = -1;
    markSectionSourceOnlyObject(proxy);
    setModelComponentOwner(proxy, { unitId: options.unitId, componentId });
    proxy.userData['tauSectionOwnerComponentId'] = componentId;
    scene.add(proxy);
  }
}

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

function syncModelRaycasterFromPointerEvent({
  raycaster,
  ray,
  camera,
}: {
  readonly raycaster: Raycaster;
  readonly ray: Ray;
  readonly camera: Camera;
}): void {
  raycaster.ray.copy(ray);
  raycaster.camera = camera;
  raycaster.near = 0;
  raycaster.far =
    camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera ? camera.far : Number.POSITIVE_INFINITY;
}

export function annotateSceneComponents(
  scene: Group,
  manifest: GeometryComponentManifest,
  options: { readonly unitId: string },
): void {
  const childComponentIds = manifest.nodesById[manifest.rootId]?.childIds ?? [];
  const primitiveComponentNodes: GeometryComponentNode[] = [];
  for (const componentId of manifest.nodeOrder) {
    const node = manifest.nodesById[componentId];
    if (!node || getPrimitiveReferences(node).length === 0 || node.childIds.length > 0) {
      continue;
    }
    primitiveComponentNodes.push(node);
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

  const annotateObject = (
    object: Object3D,
    inheritedComponentId: string | undefined,
    previousSiblingRenderableComponentId: string | undefined,
  ): string | undefined => {
    const existingComponentId = getModelComponentId(object);
    if (typeof existingComponentId === 'string') {
      setModelComponentOwner(object, { unitId: options.unitId, componentId: existingComponentId });
      for (const child of object.children) {
        annotateObject(child, existingComponentId, undefined);
      }
      return existingComponentId;
    }

    let componentId = inheritedComponentId;

    if (isModelRenderableObject(object)) {
      const primitiveComponentId =
        !isLineObject(object) && primitiveComponentIds.length > 0
          ? primitiveComponentIds[primitiveFallbackIndex]
          : undefined;
      if (primitiveComponentId) {
        primitiveFallbackIndex += 1;
        componentId = primitiveComponentId;
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
      const childComponentId = annotateObject(child, componentId, previousChildRenderableComponentId);
      if (childComponentId && isModelRenderableObject(child)) {
        previousChildRenderableComponentId = childComponentId;
      }
    }

    return componentId;
  };

  for (const child of scene.children) {
    annotateObject(child, undefined, undefined);
  }
}

function getMaterials(material: Material | Material[]): Material[] {
  return Array.isArray(material) ? material : [material];
}

function getObjectMaterials(object: Object3D): Material[] {
  if (!('material' in object)) {
    return [];
  }

  const { material } = object as Object3D & { material?: Material | Material[] };
  return material ? getMaterials(material) : [];
}

function seedSceneMaterialAppearances(scene: Group): void {
  scene.traverse((object) => {
    for (const material of getObjectMaterials(object)) {
      getOrCaptureModelMaterialAppearance(material);
    }
  });
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
  enableMatcap = false,
  enableSurfaces = true,
  enableLines = true,
}: GltfMeshDisplayProperties): React.JSX.Element | undefined {
  const graphicsActor = useGraphics();
  const modelInteractionRef = useModelInteractionRef();
  const graphicsBackendThree = useThreeGraphicsBackend();
  const sectionView = useSectionView();
  // The "base scene" is the parsed GLTF with line segments converted but no material overrides.
  // It serves as the template from which material modes (matcap/original) are derived.
  const [baseScene, setBaseScene] = useState<Group | undefined>(undefined);
  // The rendered scene has material mode applied and is what <primitive> displays.
  const [scene, setScene] = useState<Group | undefined>(undefined);
  const [componentManifest, setComponentManifest] = useState<GeometryComponentManifest | undefined>(undefined);
  const { size, invalidate, gl, camera } = useThree();
  const { controls } = useThree();
  const { theme } = useTheme();
  const activeEdgeColor = theme === Theme.DARK ? gltfEdgeColorDarkMode : gltfEdgeColorLightMode;
  const matcapTint = theme === Theme.DARK ? darkModeIntensityScale : 1;
  const unitId = deriveModelInteractionUnitId({ sourceFile, geometryHash });

  // Memoize resolution vector to avoid creating new objects on each render
  const resolutionRef = useRef(new Vector2(size.width, size.height));

  // Saved clones of the original materials so we can restore them after matcap is toggled off.
  const originalMaterialsRef = useRef<Map<number, Material | Material[]>>(new Map());
  const lastHoveredComponentIdRef = useRef<string | undefined>(undefined);
  const lastFocusedComponentIdRef = useRef<string | undefined>(undefined);
  const modelRaycasterRef = useRef(new Raycaster());
  const modelPickableMeshesSceneRef = useRef<Group | undefined>(undefined);
  const modelPickableMeshesRef = useRef<readonly Mesh[]>([]);
  const modelVisualState = useModelInteractionSelector((state) => {
    const unit = getModelInteractionUnitState(state.context, unitId);
    return {
      manifest: unit.manifest,
      hoveredComponentId: unit.hoveredComponentId,
      selectedComponentIds: unit.selectedComponentIds,
      focusedComponentId: unit.focusedComponentId,
      hiddenComponentIds: unit.hiddenComponentIds,
      isolatedComponentIds: unit.isolatedComponentIds,
      opacityByComponentId: unit.opacityByComponentId,
      isViewerHoverSuppressed: state.context.isViewerHoverSuppressed,
      revision: state.context.revision,
    };
  });
  const modelRaycastClipState = useMemo<RaycastClipState | undefined>(() => {
    return createSectionViewRaycastClipState(sectionView);
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

        const graphicsOwnedManifest = getModelInteractionUnitState(
          modelInteractionRef.getSnapshot().context,
          unitId,
        ).manifest;
        const manifest = graphicsOwnedManifest ?? buildGltfComponentManifest(gltfFile, { sourceFile, geometryHash });
        annotateSceneComponents(gltf.scene, manifest, { unitId });
        installSectionSourceProxyMeshes(gltf.scene, manifest, { unitId });

        // Convert LineSegments to LineSegments2 for fat line rendering
        const edgeColor = theme === Theme.DARK ? gltfEdgeColorDarkMode : gltfEdgeColorLightMode;
        applyFatLineSegments(gltf, {
          resolution: resolutionRef.current,
          backend: graphicsBackendThree,
          edgeColor,
        });

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
        setComponentManifest(manifest);
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
    setComponentManifest(undefined);

    void loadGltf();

    return () => {
      cancellation.cancelled = true;
      graphicsActor.send({ type: 'setHoveredModelComponent', unitId, componentId: undefined, source: 'viewer' });
    };
  }, [
    gltfFile,
    graphicsBackendThree,
    invalidate,
    gl,
    camera,
    graphicsActor,
    modelInteractionRef,
    sourceFile,
    geometryHash,
    unitId,
  ]);

  // Theme-aware edge tint without re-parsing the GLTF binary.
  useEffect(() => {
    if (!scene) {
      return;
    }

    applyGltfEdgeThemeColor(scene, activeEdgeColor);
    invalidate();
  }, [scene, activeEdgeColor, invalidate]);

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
    configureSectionSourceOnlyMaterials(baseScene);
    seedSceneMaterialAppearances(baseScene);
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

  useEffect(() => {
    if (!scene || !componentManifest) {
      return;
    }

    const hidden = new Set(modelVisualState.hiddenComponentIds);
    const isolated = new Set(modelVisualState.isolatedComponentIds);

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
        focusedComponentId: modelVisualState.focusedComponentId,
        explicitOpacity: modelVisualState.opacityByComponentId[componentId],
        opacityByComponentId: modelVisualState.opacityByComponentId,
      });
      object.visible = globallyVisible && visualState.visible;

      const materials = getObjectMaterials(object);
      if (materials.length === 0) {
        return;
      }

      if (isSectionSourceOnlyObject(object)) {
        for (const material of materials) {
          configureSectionSourceOnlyMaterial(material);
        }
        return;
      }

      const emphasis = resolveModelComponentEmphasisWithManifest(modelVisualState, componentManifest, componentId);
      for (const material of materials) {
        const snapshot = getOrCaptureModelMaterialAppearance(material);
        applyModelMaterialAppearance(material, snapshot, { opacity: visualState.opacity, emphasis });
      }
    });

    invalidate();
  }, [scene, componentManifest, modelVisualState, activeEdgeColor, enableSurfaces, enableLines, invalidate]);

  useEffect(() => {
    lastHoveredComponentIdRef.current = modelVisualState.isViewerHoverSuppressed
      ? undefined
      : modelVisualState.hoveredComponentId;
  }, [modelVisualState.hoveredComponentId, modelVisualState.isViewerHoverSuppressed]);

  useEffect(() => {
    if (!componentManifest || !modelVisualState.focusedComponentId) {
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
    const box = new Box3(new Vector3(...focusedNode.bounds.min), new Vector3(...focusedNode.bounds.max));
    const cameraControls = controls as
      | {
          fitToBox?: (
            box: Box3,
            enableTransition: boolean,
            options?: { paddingLeft?: number; paddingRight?: number; paddingTop?: number; paddingBottom?: number },
          ) => Promise<unknown>;
        }
      | undefined;

    if (typeof cameraControls?.fitToBox === 'function') {
      void cameraControls.fitToBox(box, true, {
        paddingLeft: 24,
        paddingRight: 24,
        paddingTop: 24,
        paddingBottom: 24,
      });
      invalidate();
      return;
    }

    const center = box.getCenter(new Vector3());
    camera.lookAt(center);
    invalidate();
  }, [camera, componentManifest, controls, invalidate, modelVisualState.focusedComponentId]);

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
      syncModelRaycasterFromPointerEvent({
        raycaster: modelRaycasterRef.current,
        ray: event.ray,
        camera,
      });
      const componentId = resolveModelComponentHitFromRay({
        raycaster: modelRaycasterRef.current,
        meshes: getModelPickableMeshes(),
        clipping: modelRaycastClipState,
      });
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
    [
      camera,
      getModelPickableMeshes,
      graphicsActor,
      modelRaycastClipState,
      modelVisualState.isViewerHoverSuppressed,
      unitId,
    ],
  );

  const handlePointerOut = useCallback(() => {
    const hoverUpdate = resolveViewerHoverUpdate({
      isViewerHoverSuppressed: modelVisualState.isViewerHoverSuppressed,
      previousComponentId: lastHoveredComponentIdRef.current,
      nextComponentId: undefined,
    });
    lastHoveredComponentIdRef.current = hoverUpdate.nextCachedComponentId;
    if (hoverUpdate.shouldSend) {
      graphicsActor.send({ type: 'setHoveredModelComponent', unitId, componentId: undefined, source: 'viewer' });
    }
  }, [graphicsActor, modelVisualState.isViewerHoverSuppressed, unitId]);

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const graphicsContext = graphicsActor.getSnapshot().context;
      syncModelRaycasterFromPointerEvent({
        raycaster: modelRaycasterRef.current,
        ray: event.ray,
        camera,
      });
      const modelComponentId = resolveModelComponentHitFromRay({
        raycaster: modelRaycasterRef.current,
        meshes: getModelPickableMeshes(),
        clipping: modelRaycastClipState,
      });
      const clickAction = resolveModelPointerClickAction({
        intersections: event.intersections,
        modelComponentId,
        suppressNextModelPointerClick: graphicsContext.suppressNextModelPointerClick,
        isModelPointerClickSuppressed: graphicsContext.modelPointerClickSuppressionReasons.length > 0,
      });

      if (clickAction.type === 'allowSceneUi') {
        return;
      }

      event.stopPropagation();
      for (const dispatchEvent of resolveModelPointerClickDispatches({ clickAction, unitId })) {
        graphicsActor.send(dispatchEvent);
      }
    },
    [camera, getModelPickableMeshes, graphicsActor, modelRaycastClipState, unitId],
  );

  const handlePointerMissed = useCallback(() => {
    lastHoveredComponentIdRef.current = undefined;
    if (!modelVisualState.isViewerHoverSuppressed) {
      graphicsActor.send({ type: 'setHoveredModelComponent', unitId, componentId: undefined, source: 'viewer' });
    }

    const missedAction = resolveModelPointerMissedAction({
      suppressNextModelPointerClick: graphicsActor.getSnapshot().context.suppressNextModelPointerClick,
      isModelPointerClickSuppressed: graphicsActor.getSnapshot().context.modelPointerClickSuppressionReasons.length > 0,
    });
    if (missedAction.type === 'consumeModelPointerGuard') {
      graphicsActor.send({ type: 'clearModelPointerClickGuard' });
      return;
    }

    graphicsActor.send({ type: 'clearModelComponentFocus', unitId, source: 'viewer' });
    graphicsActor.send({ type: 'clearModelComponentSelection', unitId, source: 'viewer' });
  }, [graphicsActor, modelVisualState.isViewerHoverSuppressed, unitId]);

  if (!scene) {
    return undefined;
  }

  return (
    <primitive
      object={scene}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
      onPointerMissed={handlePointerMissed}
    />
  );
}
