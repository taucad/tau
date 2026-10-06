import { installSectionClip, transferSectionClip } from '#components/geometry/graphics/three/materials/section-clip.js';
import {
  createGltfSurfaceBatches,
  disposeGltfSurfaceBatches,
  qualifyGltfSurfaceMaterial,
  qualifiedGltfSurfaceMaterialKey,
  sealGltfSurfaceMaterial,
  gltfSurfacePresentationTag,
} from '#components/geometry/graphics/three/utils/gltf-surface-batches.js';
import type { GltfSurfaceBatches } from '#components/geometry/graphics/three/utils/gltf-surface-batches.js';
import { subscribeToMatcapLoad } from '#components/geometry/graphics/three/materials/matcap-material.js';
import { geometryReceiptAt, recordRendererSpan } from '#lib/renderer-telemetry.js';
import { invalidateSceneTransparency } from '#components/geometry/graphics/three/utils/scene-transparency-revision.js';
import { holdGeometryPresentation } from '#components/geometry/graphics/three/utils/geometry-presentation-admission.js';
import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { validateAdmittedAssemblyGlb } from '@taucad/geometry-core';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Camera, Intersection, Raycaster, Mesh, MeshPhysicalMaterial } from 'three';
import {
  Group,
  Object3D,
  Material,
  Vector2,
  Box3,
  Vector3,
  Texture,
  DepthTexture,
  BufferGeometry,
  BufferAttribute,
  Float16BufferAttribute,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  InstancedMesh,
  InstancedBufferAttribute,
  Frustum,
  Matrix4,
} from 'three';
import { createThreeRenderMatrix } from '@taucad/three/spatial';
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
import type { GltfFatLineMaterial } from '#components/geometry/graphics/three/materials/gltf-edges.js';
import type { ModelComponentInstanceSlot } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import type {
  ModelEmphasisInstanceSelection,
  ModelEmphasisSet,
} from '#components/geometry/graphics/three/materials/model-emphasis-registry.js';
import {
  applyFatLineSegments,
  createGltfOccurrenceEdgeBatch,
  getGltfOccurrenceEdgeBatch,
  getGltfFatLinePositions,
  cloneGltfFatLineOwnership,
  collectGltfFatLineMaterials,
  setGltfFatLineEmphasis,
  updateGltfEdgeColor,
  updateLineMaterialResolution,
} from '#components/geometry/graphics/three/materials/gltf-edges.js';
import { applyGltfSurfaceDepthBiasToScene } from '#components/geometry/graphics/three/materials/gltf-surface-depth-bias.js';
import { setGltfAssemblyBounds } from '#components/geometry/graphics/three/use-geometry-bounds.js';
import { useSectionClip } from '#components/geometry/graphics/three/react/section-clipping-group.js';
import { installSectionClipUnder } from '#components/geometry/graphics/three/react/section-view.utils.js';
import {
  gltfEdgeColorDarkMode,
  gltfEdgeColorLightMode,
  gltfEdgeHoverColor,
  gltfEdgeSelectedColor,
} from '#components/geometry/graphics/three/overlay-colors.constants.js';
import { Theme, useTheme } from '#hooks/use-theme.js';
import { darkModeIntensityScale } from '#components/geometry/graphics/three/utils/lights.utils.js';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import {
  buildGltfComponentManifest,
  buildResidentAssemblyComponentManifest,
  buildGltfMeasurementFeatures,
  prepareGltfMetadata,
  gltfPrimitiveOccurrenceKey,
  parseGltfBytes,
  readTopologyPayload,
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
  getModelComponentHitOwner,
  getModelComponentOwner,
  getModelComponentInstanceSlots,
  getModelComponentWorldMatrix,
  getModelComponentSourceGeometry,
  getModelComponentInstanceDescriptorBytes,
  setModelComponentOwner,
  setModelComponentInstanceSlots,
} from '#components/geometry/graphics/three/utils/model-component-owner.js';
import {
  useCameraRig,
  useGraphics,
  useGraphicsSelector,
  useKinematicsSelector,
  useKinematicsRef,
  useModelInteractionSelector,
  useRenderFrame,
  useRenderFrameRetarget,
} from '#hooks/use-graphics.js';
import type { RenderFrame } from '@taucad/spatial';
import { deriveModelInteractionUnitId, getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import { getKinematicsUnitState } from '#machines/kinematics.machine.js';
import type { KinematicsUnitState } from '#machines/kinematics.machine.js';
import type { ModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import {
  resolveSectionViewRaycastClip,
  useSectionViewFlags,
} from '#components/geometry/graphics/three/use-section-view.js';
import { raycastFirstVisibleMeshHit } from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import type { RaycastClipState } from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import type { GeometryComponentManifest, GeometryComponentNode, GeometryComponentPrimitiveRef } from '@taucad/types';
import type { CadAssemblyDisplay } from '#machines/cad.machine.js';
import type { AdmittedAssembly, PublishedPartAsset } from '@taucad/runtime/types';
import { createThreeResourceDisposer } from '@taucad/three/resources';
import { BVH, estimateMemoryInBytes } from 'three-mesh-bvh';
import { getCachedBvh } from '#components/geometry/graphics/three/utils/bvh-cache.js';
import {
  buildAssemblyDemandIndex,
  queryAssemblyDemandIndex,
} from '#components/geometry/graphics/three/utils/assembly-demand-index.js';
import type { AssemblyDemandIndex } from '#components/geometry/graphics/three/utils/assembly-demand-index.js';
import { canonicalJson, sha256Bytes } from '@taucad/utils/hash';
import { jsonSerializedByteLength } from '#components/geometry/graphics/three/utils/json-serialized-byte-length.js';
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
  GltfSectionSourceBinding,
  SectionTopologyGltfParser,
} from '#components/geometry/graphics/three/utils/section-surface-topology.js';
import { createSectionTopologyScheduler } from '#components/geometry/graphics/three/utils/section-topology-scheduler.js';
import { useKinematicsViewer } from '#components/geometry/graphics/three/react/kinematics-viewer.js';
import type { KinematicsSourceUpdater } from '#components/geometry/graphics/three/react/kinematics-pose-composer.js';
import type {
  AssemblyDetailPolicy,
  GltfPresentationBarrier,
  GltfPresentationTelemetry,
} from '#machines/graphics.machine.js';

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

function isGltfTexture(value: unknown): value is Texture {
  return value instanceof Texture;
}

function isGltfBufferGeometry(value: unknown): value is BufferGeometry {
  return value instanceof BufferGeometry;
}

function isGltfMaterial(value: unknown): value is Material {
  return value instanceof Material;
}

/** Narrow the installed class while preserving its actual instance and upload owners. */
function isGltfInstancedMesh(value: unknown): value is InstancedMesh {
  return value instanceof InstancedMesh;
}

function isGltfObject3D(value: unknown): value is Object3D {
  return value instanceof Object3D;
}

const collectMaterialTextures = (material: Material, resources: Set<{ dispose: () => void }>): void => {
  for (const value of Object.values(material)) {
    if (isGltfTexture(value)) {
      resources.add(value);
    }
  }
};

/** CPU image lifetime is independent of Three.js texture GPU disposal. */
type ClosableTextureImage = { close: () => void };

function textureImages(texture: Texture): ClosableTextureImage[] {
  const images: unknown[] = Array.isArray(texture.source.data) ? texture.source.data : [texture.source.data];
  return images.filter(
    (image): image is ClosableTextureImage =>
      typeof image === 'object' && image !== null && 'close' in image && typeof image.close === 'function',
  );
}

function borrowRetainedResource(inventory: RetainedGltfResources, resource: BufferGeometry | Texture | Material): void {
  inventory.borrowed.add(resource);
  if (isGltfTexture(resource)) {
    for (const image of textureImages(resource)) {
      inventory.borrowedImages.add(image);
    }
  }
}

/** Captures the resources owned by one parsed glTF presentation. */
function createGltfResourceDisposer(
  scene: Group,
  {
    originalMaterials = new Map(),
    includeSceneTextures = false,
    inventory,
  }: {
    readonly originalMaterials?: ReadonlyMap<number, Material | Material[]>;
    readonly includeSceneTextures?: boolean;
    readonly inventory?: RetainedGltfResources;
  } = {},
): () => void {
  let disposed = false;
  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    const resources = collectGltfResources(scene, originalMaterials, includeSceneTextures);
    if (inventory) {
      for (const resource of inventory.owned) {
        resources.add(resource);
      }
      for (const resource of [...inventory.borrowed, ...inventory.released]) {
        resources.delete(resource);
      }
    }
    const images = new Set<ClosableTextureImage>(inventory?.ownedImages);
    for (const resource of resources) {
      if (isGltfTexture(resource)) {
        for (const image of textureImages(resource)) {
          images.add(image);
        }
      }
    }
    for (const image of [...(inventory?.borrowedImages ?? []), ...(inventory?.releasedImages ?? [])]) {
      images.delete(image);
    }
    if (inventory) {
      const isExternalAttribute = (attribute: InstancedBufferAttribute): boolean =>
        inventory.borrowedInstanceAttributes.has(attribute) || inventory.releasedInstanceAttributes.has(attribute);
      for (const resource of resources) {
        if (!(resource instanceof InstancedMesh)) {
          continue;
        }
        // Three removes GPU instance attributes using these properties in its dispose listener.
        // Retire only this object's binding state, keeping externally owned buffers on the live candidate.
        if (isExternalAttribute(resource.instanceMatrix)) {
          resource.instanceMatrix = new InstancedBufferAttribute(new Float32Array(0), 16);
        }
        if (resource.instanceColor && isExternalAttribute(resource.instanceColor)) {
          resource.instanceColor = null;
        }
      }
    }
    createThreeResourceDisposer(resources)();
    for (const image of images) {
      image.close();
      inventory?.closedImages.add(image);
    }
  };
}

function collectGltfResources(
  scene: Object3D,
  originalMaterials: ReadonlyMap<number, Material | Material[]> = new Map(),
  includeSceneTextures = false,
): Set<{ dispose: () => void }> {
  const resources = new Set<{ dispose: () => void }>();
  scene.traverse((child) => {
    if (child instanceof InstancedMesh) {
      resources.add(child);
    }
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
  return resources;
}

type RetainedGltfResources = {
  readonly ownedImages: Set<ClosableTextureImage>;
  readonly closedImages: Set<ClosableTextureImage>;
  readonly borrowedImages: Set<ClosableTextureImage>;
  readonly releasedImages: Set<ClosableTextureImage>;
  readonly geometries: Map<string, BufferGeometry>;
  readonly sourceGeometries: Map<string, BufferGeometry>;
  readonly textures: Map<string, Texture>;
  readonly instanceAttributes: Map<string, InstancedBufferAttribute>;
  readonly borrowedInstanceAttributes: Set<InstancedBufferAttribute>;
  readonly releasedInstanceAttributes: Set<InstancedBufferAttribute>;
  readonly owned: Set<BufferGeometry | Texture | Material>;
  readonly borrowed: Set<BufferGeometry | Texture | Material>;
  readonly released: Set<BufferGeometry | Texture | Material>;
};

const emptyRetainedGltfResources = (): RetainedGltfResources => ({
  ownedImages: new Set(),
  closedImages: new Set(),
  borrowedImages: new Set(),
  releasedImages: new Set(),
  geometries: new Map(),
  sourceGeometries: new Map(),
  textures: new Map(),
  instanceAttributes: new Map(),
  borrowedInstanceAttributes: new Set(),
  releasedInstanceAttributes: new Set(),
  owned: new Set(),
  borrowed: new Set(),
  released: new Set(),
});

/** Identity of decoded immutable geometry, including the layouts the renderer consumes. */
async function geometryResourceKey(geometry: BufferGeometry, backend: string): Promise<string> {
  const attributeKey = async (attribute: ReturnType<BufferGeometry['getAttribute']>): Promise<unknown> => {
    const interleaved = 'data' in attribute;
    const array = interleaved ? attribute.data.array : attribute.array;
    return [
      attribute.itemSize,
      attribute.normalized,
      array.constructor.name,
      interleaved ? attribute.offset : 0,
      interleaved ? attribute.data.stride : attribute.itemSize,
      await sha256Bytes(new Uint8Array(array.buffer, array.byteOffset, array.byteLength).slice()),
    ];
  };
  return canonicalJson({
    backend,
    type: geometry.type,
    groups: geometry.groups,
    drawRange: geometry.drawRange,
    attributes: await Promise.all(
      Object.entries(geometry.attributes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(async ([name, attribute]) => [name, await attributeKey(attribute)]),
    ),
    index: geometry.index ? await attributeKey(geometry.index) : undefined,
    morph: await Promise.all(
      Object.entries(geometry.morphAttributes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(async ([name, attributes]) => [
          name,
          await Promise.all(attributes.map(async (attribute) => attributeKey(attribute))),
        ]),
    ),
    morphTargetsRelative: geometry.morphTargetsRelative,
  });
}

/** Borrow only from the current presentation; no cache survives its owning canvas. */
async function retainGltfResources({
  gltf,
  bytes,
  definitionDigest,
  previous,
  backend,
  resources,
}: {
  readonly gltf: GLTF;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly definitionDigest: PublishedPartAsset['digest'];
  readonly previous: RetainedGltfResources | undefined;
  readonly backend: string;
  readonly resources: RetainedGltfResources;
}): Promise<void> {
  const { json, bin } = parseGltfBytes(bytes);
  const sourceKey = (object: Object3D): string | undefined => {
    const association = gltf.parser.associations.get(object) as GltfLoaderAssociation | undefined;
    if (association?.primitives === undefined) {
      return undefined;
    }
    let owner: Object3D | undefined = object;
    let nodeIndex: number | undefined;
    while (owner && nodeIndex === undefined) {
      nodeIndex = (gltf.parser.associations.get(owner) as GltfLoaderAssociation | undefined)?.nodes;
      owner = owner.parent ?? undefined;
    }
    return nodeIndex === undefined
      ? undefined
      : canonicalJson([definitionDigest, nodeIndex, association.meshes, association.primitives, object.type, backend]);
  };
  const geometryKeys = new Map<BufferGeometry, Promise<string>>();
  const textureKeys = new Map<Texture, Promise<string | undefined>>();
  const textureKey = async (texture: Texture): Promise<string | undefined> => {
    const association = gltf.parser.associations.get(texture) as { textures?: number } | undefined;
    const definition = association?.textures === undefined ? undefined : json.textures?.[association.textures];
    const image = definition?.source === undefined ? undefined : json.images?.[definition.source];
    if (!image) {
      return undefined;
    }
    const view = image.bufferView === undefined ? undefined : json.bufferViews?.[image.bufferView];
    let imageKey: string;
    if (view && (view.byteOffset ?? 0) + view.byteLength <= bin.byteLength) {
      imageKey = await sha256Bytes(
        new Uint8Array(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)),
      );
    } else if (image.uri?.startsWith('data:')) {
      imageKey = await sha256Bytes(new TextEncoder().encode(image.uri));
    } else {
      return undefined;
    }
    return canonicalJson([
      backend,
      imageKey,
      image.mimeType,
      definition?.extensions,
      texture.mapping,
      texture.channel,
      texture.format,
      texture.type,
      texture.internalFormat,
      texture.anisotropy,
      texture instanceof DepthTexture ? texture.compareFunction : undefined,
      texture.colorSpace,
      texture.flipY,
      texture.magFilter,
      texture.minFilter,
      texture.wrapS,
      texture.wrapT,
      texture.generateMipmaps,
      texture.premultiplyAlpha,
      texture.unpackAlignment,
      texture.offset.toArray(),
      texture.repeat.toArray(),
      texture.center.toArray(),
      texture.rotation,
      texture.matrix.elements,
    ]);
  };
  const objects: Object3D[] = [];
  gltf.scene.traverse((object) => objects.push(object));
  for (const object of objects) {
    if ('geometry' in object && isGltfBufferGeometry(object.geometry)) {
      const { geometry } = object;
      const assetKey = sourceKey(object);
      let keyPromise = geometryKeys.get(geometry);
      keyPromise ??= geometryResourceKey(geometry, backend);
      geometryKeys.set(geometry, keyPromise);
      // oxlint-disable-next-line no-await-in-loop -- One bounded candidate inventory is built before shader preparation.
      const key = await keyPromise;
      const sourceGeometry = assetKey ? previous?.sourceGeometries.get(assetKey) : undefined;
      const compatibleGeometry = previous?.geometries.get(key);
      // Asset identities qualify immutable source ownership; decoded bytes and layout
      // independently qualify reuse after an appearance-only source revision.
      const previousGeometry = sourceGeometry === compatibleGeometry ? sourceGeometry : compatibleGeometry;
      const retained = previousGeometry ?? resources.geometries.get(key);
      if (retained) {
        object.geometry = retained;
        // Predecessor maps can outlive an ownership transfer during this await.
        // Every reference read from them remains external until this candidate commits.
        if (previousGeometry) {
          borrowRetainedResource(resources, retained);
        }
      }
      resources.geometries.set(key, retained ?? geometry);
      if (assetKey) {
        resources.sourceGeometries.set(assetKey, retained ?? geometry);
      }
    }
    for (const material of getObjectMaterials(object)) {
      for (const [name, value] of Object.entries(material)) {
        if (!isGltfTexture(value)) {
          continue;
        }
        let keyPromise = textureKeys.get(value);
        keyPromise ??= textureKey(value);
        textureKeys.set(value, keyPromise);
        // oxlint-disable-next-line no-await-in-loop -- Resolve each parsed texture once, then replace all of its material slots.
        const key = await keyPromise;
        if (!key) {
          continue;
        }
        const previousTexture = previous?.textures.get(key);
        const retained = previousTexture ?? resources.textures.get(key);
        if (retained) {
          // Three material texture slots are public runtime properties, enumerated above.
          Object.assign(material, { [name]: retained });
          if (previousTexture) {
            borrowRetainedResource(resources, retained);
          }
        }
        resources.textures.set(key, retained ?? value);
      }
    }
  }
}

function captureRetainedResources(scene: Object3D, inventory: RetainedGltfResources): void {
  for (const resource of collectGltfResources(scene, undefined, true)) {
    if (isGltfBufferGeometry(resource) || isGltfTexture(resource) || isGltfMaterial(resource)) {
      inventory.owned.add(resource);
      if (isGltfTexture(resource)) {
        for (const image of textureImages(resource)) {
          inventory.ownedImages.add(image);
        }
      }
    }
  }
}

type ParsedGltfInventory = Readonly<{
  resources: ReadonlySet<BufferGeometry | Texture | Material>;
  buffers: ReadonlySet<ArrayBufferLike>;
  objectCount: number;
  jsonSerializedBytes: number;
}>;

/** Capture dependencies the real loader already requested, including secondary scenes and animation targets. */
async function captureParsedGltfInventory(
  gltf: GLTF,
  bytes: Uint8Array<ArrayBuffer>,
  inventory: RetainedGltfResources,
): Promise<ParsedGltfInventory> {
  const parsedResources = new Set<BufferGeometry | Texture | Material>();
  const objects = new Set<Object3D>();
  const captureResource = (resource: BufferGeometry | Texture | Material): void => {
    parsedResources.add(resource);
    inventory.owned.add(resource);
    if (isGltfTexture(resource)) {
      for (const image of textureImages(resource)) {
        inventory.ownedImages.add(image);
      }
    }
  };
  const captureObject = (object: Object3D): void => {
    object.traverse((child) => objects.add(child));
    for (const resource of collectGltfResources(object, undefined, true)) {
      if (isGltfBufferGeometry(resource) || isGltfTexture(resource) || isGltfMaterial(resource)) {
        captureResource(resource);
      }
    }
  };
  for (const scene of gltf.scenes) {
    captureObject(scene);
  }
  for (const camera of gltf.cameras) {
    captureObject(camera);
  }
  for (const resource of gltf.parser.associations.keys()) {
    if (isGltfMaterial(resource)) {
      captureResource(resource);
      const textures = new Set<{ dispose: () => void }>();
      collectMaterialTextures(resource, textures);
      for (const texture of textures) {
        if (isGltfTexture(texture)) {
          captureResource(texture);
        }
      }
    } else if (isGltfTexture(resource)) {
      captureResource(resource);
    }
  }
  const animationTargets = new Set<number>();
  const parserJson: unknown = gltf.parser.json;
  if (
    typeof parserJson === 'object' &&
    parserJson !== null &&
    'animations' in parserJson &&
    Array.isArray(parserJson.animations)
  ) {
    const animations: readonly unknown[] = parserJson.animations;
    for (const animation of animations) {
      if (
        typeof animation !== 'object' ||
        animation === null ||
        !('channels' in animation) ||
        !Array.isArray(animation.channels)
      ) {
        continue;
      }
      const channels: readonly unknown[] = animation.channels;
      for (const channel of channels) {
        if (typeof channel !== 'object' || channel === null || !('target' in channel)) {
          continue;
        }
        const target: unknown = channel.target;
        if (typeof target === 'object' && target !== null && 'node' in target && typeof target.node === 'number') {
          animationTargets.add(target.node);
        }
      }
    }
  }
  const { json } = parseGltfBytes(bytes);
  const meshIndices = new Set<number>();
  const visitedNodes = new Set<number>();
  const visitNode = (index: number): void => {
    if (visitedNodes.has(index)) {
      return;
    }
    visitedNodes.add(index);
    const node = json.nodes?.[index];
    if (node?.mesh !== undefined) {
      meshIndices.add(node.mesh);
    }
    for (const child of node?.children ?? []) {
      visitNode(child);
    }
  };
  for (const scene of json.scenes ?? []) {
    for (const node of scene.nodes ?? []) {
      visitNode(node);
    }
  }
  for (const index of animationTargets) {
    visitNode(index);
    // oxlint-disable-next-line no-await-in-loop -- Animation targets were eagerly requested by GLTFLoader; this retrieves existing dependencies only.
    const object: unknown = await gltf.parser.getDependency('node', index);
    if (isGltfObject3D(object)) {
      captureObject(object);
    }
  }
  for (const index of meshIndices) {
    // oxlint-disable-next-line no-await-in-loop -- Original mesh templates were eagerly requested by the scene/animation nodes above.
    const object: unknown = await gltf.parser.getDependency('mesh', index);
    if (isGltfObject3D(object)) {
      captureObject(object);
    }
  }
  const buffers = new Set<ArrayBufferLike>();
  for (const animation of gltf.animations) {
    for (const track of animation.tracks) {
      buffers.add(track.times.buffer);
      if (ArrayBuffer.isView(track.values)) {
        buffers.add(track.values.buffer);
      }
    }
  }
  const binary: unknown = gltf.parser.extensions['KHR_binary_glTF'];
  if (typeof binary === 'object' && binary !== null && 'body' in binary && binary.body instanceof ArrayBuffer) {
    buffers.add(binary.body);
  }
  return {
    resources: parsedResources,
    buffers,
    objectCount: objects.size,
    jsonSerializedBytes: new TextEncoder().encode(JSON.stringify(parserJson)).byteLength,
  };
}

/** Commit is the only point at which the predecessor releases borrowed resources. */
function transferRetainedResources(previous: RetainedGltfResources | undefined, next: RetainedGltfResources): void {
  for (const resource of next.borrowed) {
    previous?.owned.delete(resource);
    previous?.released.add(resource);
    next.owned.add(resource);
  }
  next.borrowed.clear();
  for (const attribute of next.borrowedInstanceAttributes) {
    previous?.releasedInstanceAttributes.add(attribute);
  }
  next.borrowedInstanceAttributes.clear();
  // Multiple texture samplers may share one bitmap; image ownership follows the commit once.
  for (const image of next.borrowedImages) {
    previous?.ownedImages.delete(image);
    previous?.releasedImages.add(image);
    next.ownedImages.add(image);
  }
  next.borrowedImages.clear();
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

// Provisional worktree guardrails, not measured warehouse/driver-memory acceptance.
const defaultAssemblyResourceBudget = { cpuBytes: 3 * 1024 ** 3, gpuBytes: 512 * 1024 ** 2 } as const;

type GltfMeshDisplayProperties = {
  /**
   * The GLTF file to load.
   */
  readonly gltfFile?: Uint8Array<ArrayBuffer>;
  readonly assemblyDisplay?: CadAssemblyDisplay;
  /** Private app-managed CPU/reserved GPU admission; unknown native/driver allocations remain separate. */
  readonly assemblyResourceBudget?: Readonly<{ cpuBytes: number; gpuBytes: number }>;
  /** Private calibration input; thresholds require backend/product qualification before a product default. */
  readonly assemblyDetailPolicy?: AssemblyDetailPolicy;
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

type AssemblyDetailPixelErrorInput = {
  sourceBounds: Box3;
  sourceError: number;
  drawToRender: Matrix4;
  camera: Camera;
  viewport: Readonly<{ width: number; height: number }>;
};

type AssemblyDetailCameraFrame = Readonly<{
  inverse: Matrix4;
  near: number | undefined;
  projection: Camera['projectionMatrix']['elements'];
  projectionFinite: boolean;
}>;

function prepareAssemblyDetailCameraFrame(camera: Camera): AssemblyDetailCameraFrame {
  camera.updateWorldMatrix(true, false);
  const projection = camera.projectionMatrix.elements;
  return {
    inverse: camera.matrixWorldInverse,
    near: 'near' in camera && typeof camera.near === 'number' ? camera.near : undefined,
    projection,
    projectionFinite: projection.every((value) => Number.isFinite(value)),
  };
}

function isValidAssemblyDetailViewport(viewport: AssemblyDetailPixelErrorInput['viewport']): boolean {
  return (
    Number.isFinite(viewport.width) && viewport.width > 0 && Number.isFinite(viewport.height) && viewport.height > 0
  );
}

/** Project a source deviation through the actual posed O*S and camera frame, conservatively in both axes. */
function estimateAssemblyDetailPixelErrorWithFrame(
  { sourceBounds, sourceError, drawToRender, viewport }: Omit<AssemblyDetailPixelErrorInput, 'camera'>,
  getCameraFrame: () => AssemblyDetailCameraFrame,
  validViewport: boolean,
): number {
  if (
    sourceBounds.isEmpty() ||
    ![...sourceBounds.min.toArray(), ...sourceBounds.max.toArray()].every((value) => Number.isFinite(value)) ||
    !Number.isFinite(sourceError) ||
    sourceError < 0 ||
    !validViewport
  ) {
    return Infinity;
  }
  const { inverse, near, projection, projectionFinite } = getCameraFrame();
  const view = inverse.clone().multiply(drawToRender);
  const { elements } = view;
  if (
    !elements.every((value) => Number.isFinite(value)) ||
    elements[3] !== 0 ||
    elements[7] !== 0 ||
    elements[11] !== 0 ||
    elements[15] !== 1
  ) {
    return Infinity;
  }
  // Frobenius bounds the maximum affine stretch, including admitted composed shear.
  const error =
    sourceError *
    Math.hypot(
      elements[0],
      elements[1],
      elements[2],
      elements[4],
      elements[5],
      elements[6],
      elements[8],
      elements[9],
      elements[10],
    );
  const bounds = sourceBounds.clone().applyMatrix4(view);
  if (near === undefined || !Number.isFinite(near) || bounds.max.z + error >= -near) {
    return Infinity;
  }
  if (!projectionFinite) {
    return Infinity;
  }
  let minW = Infinity;
  let maxX = 0;
  let maxY = 0;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        minW = Math.min(minW, projection[3] * x + projection[7] * y + projection[11] * z + projection[15]);
        maxX = Math.max(maxX, Math.abs(projection[0] * x + projection[4] * y + projection[8] * z + projection[12]));
        maxY = Math.max(maxY, Math.abs(projection[1] * x + projection[5] * y + projection[9] * z + projection[13]));
      }
    }
  }
  const wError = error * Math.hypot(projection[3], projection[7], projection[11]);
  if (!Number.isFinite(minW) || minW <= wError) {
    return Infinity;
  }
  const projected = (row: number, extent: number, pixels: number): number =>
    ((error * Math.hypot(projection[row]!, projection[row + 4]!, projection[row + 8]!) * minW + extent * wError) /
      (minW * (minW - wError))) *
    pixels *
    0.5;
  return Math.hypot(projected(0, maxX, viewport.width), projected(1, maxY, viewport.height));
}

/** Project a source deviation through the actual posed O*S and camera frame, conservatively in both axes. */
export function estimateAssemblyDetailPixelError(input: AssemblyDetailPixelErrorInput): number {
  return estimateAssemblyDetailPixelErrorWithFrame(
    input,
    () => prepareAssemblyDetailCameraFrame(input.camera),
    isValidAssemblyDetailViewport(input.viewport),
  );
}

/** Full evidence exits detail immediately; only entry is tightened to prevent threshold oscillation. */
export function shouldUseAssemblyDetail({
  approximatePixelError,
  previousDetail,
  fullEvidence,
  screenSpace,
}: {
  approximatePixelError: number;
  previousDetail: boolean;
  fullEvidence: boolean;
  screenSpace: NonNullable<AssemblyDetailPolicy['screenSpace']>;
}): boolean {
  if (
    !Number.isFinite(screenSpace.maxApproximatePixelError) ||
    screenSpace.maxApproximatePixelError <= 0 ||
    !Number.isFinite(screenSpace.enterDetailRatio) ||
    screenSpace.enterDetailRatio <= 0 ||
    screenSpace.enterDetailRatio >= 1
  ) {
    throw new RangeError('Invalid private assembly screen-space calibration');
  }
  return (
    !fullEvidence &&
    Number.isFinite(approximatePixelError) &&
    approximatePixelError >= 0 &&
    approximatePixelError <= screenSpace.maxApproximatePixelError * (previousDetail ? 1 : screenSpace.enterDetailRatio)
  );
}

type AssemblyDetailCalibration = {
  maxProjectedApproximateErrorPixels: number;
  projectionUnavailableCount: number;
  selectedFullEvidenceCount: number;
};

type PreparedAssemblyDetail = Readonly<{
  geometry: BufferGeometry;
  /** Meshoptimizer appearance/deviation estimate, not a maximum Hausdorff bound. */
  approximateSourceError: number;
}>;

/** Independent upload owners can alias immutable canonical CPU arrays; no renderer-private ownership patch. */
function createAssemblyDetailUploadGeometry(
  canonical: BufferGeometry,
  indices: Uint32Array,
): BufferGeometry | undefined {
  const attributes = Object.entries(canonical.attributes);
  if (
    attributes.some(([_name, source]) => {
      if (
        source instanceof Float16BufferAttribute ||
        ('isInstancedBufferAttribute' in source && Boolean(source.isInstancedBufferAttribute)) ||
        ('isStorageBufferAttribute' in source && Boolean(source.isStorageBufferAttribute)) ||
        ('isStorageInstancedBufferAttribute' in source && Boolean(source.isStorageInstancedBufferAttribute))
      ) {
        return true;
      }
      return source instanceof InterleavedBufferAttribute
        ? source.data.constructor !== InterleavedBuffer
        : !(source instanceof BufferAttribute);
    })
  ) {
    return undefined;
  }
  const geometry = new BufferGeometry();
  const interleaved = new Map<InterleavedBuffer, InterleavedBuffer>();
  for (const [name, source] of attributes) {
    if (
      source instanceof Float16BufferAttribute ||
      ('isInstancedBufferAttribute' in source && Boolean(source.isInstancedBufferAttribute))
    ) {
      return undefined;
    }
    if (source instanceof InterleavedBufferAttribute) {
      if ('isInstancedInterleavedBuffer' in source.data && source.data.isInstancedInterleavedBuffer) {
        return undefined;
      }
      let data = interleaved.get(source.data);
      if (!data) {
        data = new InterleavedBuffer(source.data.array, source.data.stride).setUsage(source.data.usage);
        interleaved.set(source.data, data);
      }
      geometry.setAttribute(
        name,
        new InterleavedBufferAttribute(data, source.itemSize, source.offset, source.normalized),
      );
    } else {
      const attribute = new BufferAttribute(source.array, source.itemSize, source.normalized).setUsage(source.usage);
      attribute.name = source.name;
      attribute.gpuType = source.gpuType;
      geometry.setAttribute(name, attribute);
    }
  }
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.boundingBox = canonical.boundingBox?.clone() ?? null;
  geometry.boundingSphere = canonical.boundingSphere?.clone() ?? null;
  geometry.name = canonical.name;
  return geometry;
}

/** Derive one private display level without changing canonical topology, vertices, or engineering evidence. */
export async function deriveAssemblyDetailGeometry({
  canonical,
  policy,
  isCancelled = () => false,
}: {
  canonical: BufferGeometry;
  policy: AssemblyDetailPolicy;
  isCancelled?: () => boolean;
}): Promise<PreparedAssemblyDetail | undefined> {
  if (
    !Number.isFinite(policy.triangleRatio) ||
    policy.triangleRatio <= 0 ||
    policy.triangleRatio >= 1 ||
    !Number.isFinite(policy.approximateRelativeError) ||
    policy.approximateRelativeError < 0
  ) {
    throw new RangeError('Invalid private assembly detail policy');
  }
  if (
    Object.keys(canonical.morphAttributes).length > 0 ||
    canonical.groups.length > 0 ||
    canonical.drawRange.start !== 0 ||
    canonical.drawRange.count !== Infinity
  ) {
    return undefined;
  }
  if (isCancelled()) {
    return undefined;
  }
  const positions = canonical.attributes['position'];
  if (positions?.itemSize !== 3 || positions instanceof Float16BufferAttribute) {
    return undefined;
  }
  const appearanceNames = Object.keys(canonical.attributes).filter((name) => name !== 'position');
  if (appearanceNames.some((name) => !['normal', 'uv', 'uv1', 'color', 'tangent'].includes(name))) {
    return undefined;
  }
  const attributeStride = appearanceNames.reduce((sum, name) => sum + canonical.getAttribute(name).itemSize, 0);
  if (attributeStride > 32) {
    return undefined;
  }
  const sourcePositions = new Float32Array(positions.count * 3);
  const sourceAttributes = new Float32Array(positions.count * attributeStride);
  for (let vertex = 0; vertex < positions.count; vertex++) {
    sourcePositions.set([positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex)], vertex * 3);
    let offset = vertex * attributeStride;
    for (const name of appearanceNames) {
      const attribute = canonical.getAttribute(name);
      if (
        attribute.count !== positions.count ||
        attribute.itemSize > 4 ||
        attribute instanceof Float16BufferAttribute
      ) {
        return undefined;
      }
      const components = [
        attribute.getX(vertex),
        attribute.getY(vertex),
        attribute.getZ(vertex),
        attribute.getW(vertex),
      ];
      sourceAttributes.set(components.slice(0, attribute.itemSize), offset);
      offset += attribute.itemSize;
    }
  }
  if (
    !sourcePositions.every((value) => Number.isFinite(value)) ||
    !sourceAttributes.every((value) => Number.isFinite(value))
  ) {
    return undefined;
  }
  const sourceIndices = canonical.index
    ? Uint32Array.from(canonical.index.array)
    : Uint32Array.from({ length: positions.count }, (_value, index) => index);
  if (sourceIndices.length % 3 || sourceIndices.some((index) => index >= positions.count)) {
    return undefined;
  }
  const targetCount = Math.floor((sourceIndices.length * policy.triangleRatio) / 3) * 3;
  if (targetCount < 3 || targetCount >= sourceIndices.length) {
    return undefined;
  }
  await MeshoptSimplifier.ready;
  if (isCancelled() || !MeshoptSimplifier.supported) {
    return undefined;
  }
  const [indices, error] = MeshoptSimplifier.simplifyWithAttributes(
    sourceIndices,
    sourcePositions,
    3,
    sourceAttributes,
    attributeStride,
    Array.from({ length: attributeStride }, () => 1),
    null,
    targetCount,
    policy.approximateRelativeError,
    // Keep attribute-aware Permissive limited to the measured normal-only CPU path.
    appearanceNames.length === 1 && appearanceNames[0] === 'normal' && canonical.getAttribute('normal').itemSize === 3
      ? ['LockBorder', 'Permissive']
      : ['LockBorder'],
  );
  if (isCancelled() || indices.length < 3 || indices.length >= sourceIndices.length || !Number.isFinite(error)) {
    return undefined;
  }
  const approximateSourceError = error * MeshoptSimplifier.getScale(sourcePositions, 3);
  if (!Number.isFinite(approximateSourceError) || approximateSourceError < 0) {
    return undefined;
  }
  const geometry = createAssemblyDetailUploadGeometry(canonical, indices);
  return geometry ? { geometry, approximateSourceError } : undefined;
}

/** Existing candidate resource inventory retains a derived geometry as one immutable definition resource. */
async function prepareAssemblyDetailDefinitions({
  definitions,
  previous,
  resources,
  policy,
  backend,
  isCancelled,
  reserveResources,
}: {
  definitions: ReadonlyMap<string, PreparedGltfDefinition>;
  previous: PreparedGltfPresentation | undefined;
  resources: RetainedGltfResources;
  policy: AssemblyDetailPolicy | undefined;
  backend: string;
  isCancelled: () => boolean;
  reserveResources: (cpuBytes: number, gpuBytes: number) => void;
}): Promise<ReadonlyMap<string, PreparedGltfDefinition>> {
  const prepared = new Map<string, PreparedGltfDefinition>();
  const candidateDetails = new Map<string, PreparedAssemblyDetail>();
  const previousErrors = new Map<string, number>();
  for (const definition of previous?.definitions?.values() ?? []) {
    for (const [key, error] of definition.detailErrors ?? []) {
      previousErrors.set(key, error);
    }
  }
  for (const [digest, definition] of definitions) {
    const primitives: PreparedDefinitionPrimitive[] = [];
    const detailErrors = new Map<string, number>();
    for (const primitive of definition.primitives) {
      let detail: PreparedAssemblyDetail | undefined;
      if (policy && primitive.geometry) {
        const key = canonicalJson([
          'meshoptimizer:1.1.1',
          backend,
          primitive.geometry.uuid,
          { triangleRatio: policy.triangleRatio, approximateRelativeError: policy.approximateRelativeError },
        ]);
        const retained = previous?.resources.geometries.get(key);
        const retainedError = previousErrors.get(key);
        const candidate = candidateDetails.get(key);
        if (candidate) {
          detail = candidate;
        } else if (retained && retainedError !== undefined) {
          borrowRetainedResource(resources, retained);
          detail = { geometry: retained, approximateSourceError: retainedError };
        } else {
          const position = primitive.geometry.getAttribute('position');
          const attributeComponents = Object.values(primitive.geometry.attributes).reduce(
            (sum, attribute) => sum + attribute.itemSize,
            0,
          );
          const indexCount = primitive.geometry.index?.count ?? position.count;
          // Simplifier input/output and upload arrays; the retained WASM heap remains unmeasured.
          reserveResources(
            position.count * attributeComponents * 4 * 2 + indexCount * 4 * 2,
            position.count * attributeComponents * 4 + indexCount * 4,
          );
          // oxlint-disable-next-line no-await-in-loop -- Derive at most one primitive at a time in the existing serialized candidate queue.
          detail = await deriveAssemblyDetailGeometry({ canonical: primitive.geometry, policy, isCancelled });
          if (detail) {
            resources.owned.add(detail.geometry);
          }
        }
        if (detail) {
          candidateDetails.set(key, detail);
          resources.geometries.set(key, detail.geometry);
          detailErrors.set(key, detail.approximateSourceError);
        }
      }
      primitives.push({ ...primitive, detail });
    }
    prepared.set(digest, { ...definition, primitives, detailErrors });
  }
  return prepared;
}

type PreparedDefinitionPrimitive = Readonly<{
  source: Object3D;
  sourceComponentId: string;
  feature?: GltfMeasurementFeatures;
  geometry?: BufferGeometry;
  localBounds?: Box3;
  detail?: PreparedAssemblyDetail;
  material?: Material;
  edgePositions?: Float32Array;
  edgeMaterial?: GltfFatLineMaterial;
  localPlacement: Matrix4;
}>;

type PreparedGltfDefinition = Readonly<{
  gltf: GLTF;
  bytes: Uint8Array<ArrayBuffer>;
  measurementFeatures: ReadonlyMap<string, GltfMeasurementFeatures>;
  primitives: readonly PreparedDefinitionPrimitive[];
  detailErrors?: ReadonlyMap<string, number>;
  parsedInventory: ParsedGltfInventory;
  immutableResources: ReadonlySet<BufferGeometry | Texture | Material>;
  backend: string;
}>;

type PreparedAssemblyLayout = ReturnType<typeof buildResidentAssemblyComponentManifest>;
type AssemblyMetadata = Awaited<ReturnType<typeof validateAdmittedAssemblyGlb>>;

type PreparedAssemblyDemand = Readonly<{
  index: AssemblyDemandIndex;
  pathsByComponent: ReadonlyMap<string, ReadonlySet<string>>;
  fullBoundComponents: ReadonlyArray<{ memberIds: readonly string[]; bounds: AssemblyMetadata['bounds'] }>;
  serializedBytes: number;
}>;

function prepareAssemblyDemand(metadata: AssemblyMetadata, layout: PreparedAssemblyLayout): PreparedAssemblyDemand {
  const index = buildAssemblyDemandIndex(metadata);
  const pathsByComponent = new Map<string, Set<string>>();
  for (const path of index.keys) {
    for (const id of layout.sourceComponentIdsByAncestry.get(path)?.values() ?? []) {
      for (const memberId of [id, ...getComponentAncestorIds(layout.manifest, id)]) {
        let paths = pathsByComponent.get(memberId);
        if (!paths) {
          paths = new Set();
          pathsByComponent.set(memberId, paths);
        }
        paths.add(path);
      }
    }
  }
  const fullBoundComponents = layout.manifest.nodeOrder.flatMap((id) => {
    const node = layout.manifest.nodesById[id];
    return node?.primitiveRefs?.length && node.bounds
      ? [{ memberIds: [id, ...getComponentAncestorIds(layout.manifest, id)], bounds: node.bounds }]
      : [];
  });
  return {
    index,
    pathsByComponent,
    fullBoundComponents,
    serializedBytes: jsonSerializedByteLength({
      keys: index.keys,
      occurrenceIndices: index.occurrenceIndices,
      pathsByComponent: [...pathsByComponent].map(([id, paths]) => [id, [...paths]]),
      fullBoundComponents,
    }),
  };
}

/** Validate source bytes and canonical descriptors before allocating any Three.js definition resources. */
async function prepareAssemblyMetadata(
  display: CadAssemblyDisplay,
  previous: PreparedGltfPresentation | undefined,
  {
    sourceFile,
    reserveResources,
    readAsset,
    onDemandIndex,
  }: Readonly<{
    sourceFile: string | undefined;
    reserveResources: (cpuBytes: number, gpuBytes: number) => void;
    readAsset: (digest: PublishedPartAsset['digest']) => Promise<Uint8Array<ArrayBuffer>>;
    onDemandIndex: () => void;
  }>,
): Promise<{
  metadata: AssemblyMetadata;
  layout: PreparedAssemblyLayout;
  demand: PreparedAssemblyDemand;
  bytes: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
  validatedSourceBytes: number;
  metadataSerializedBytes: number;
}> {
  if (
    previous?.assemblyFacade === display.admitted &&
    previous.assemblyMetadata &&
    previous.assemblyLayout &&
    previous.assemblyDemand
  ) {
    return {
      metadata: previous.assemblyMetadata,
      layout: previous.assemblyLayout,
      demand: previous.assemblyDemand,
      bytes: new Map(),
      validatedSourceBytes: previous.validatedSourceBytes ?? 0,
      metadataSerializedBytes: previous.metadataSerializedBytes ?? 0,
    };
  }
  // Reserve publication/occurrence descriptors before eager semantic metadata and source reads.
  // Three times the descriptor allowance covers strings and UTF8 preparation, not exact JS heap.
  reserveResources(display.admitted.publication.occurrences.length * (8 + 3 * 512), 0);
  const pending = display.admitted.publication.occurrences.map((occurrence) => ({ occurrence, ancestryBytes: 0 }));
  const uses = new Map<string, { count: number; ancestryBytes: number; asset: PublishedPartAsset }>();
  while (pending.length > 0) {
    const { occurrence, ancestryBytes } = pending.pop()!;
    const pathBytes = ancestryBytes + occurrence.id.length * 6 + 8;
    // Canonical IDs and ancestry recur in the six descriptor projections; include depth,
    // rather than treating a deep wrapper chain as a flat leaf list.
    reserveResources(3 * (6 * pathBytes + occurrence.transform.length * 24), 0);
    if (occurrence.children) {
      reserveResources(occurrence.children.length * (8 + 3 * 512), 0);
      for (const child of occurrence.children) {
        pending.push({ occurrence: child, ancestryBytes: pathBytes });
      }
    } else {
      const asset = display.admitted.publication.parts[occurrence.part]!.variants[occurrence.variant]!.glb;
      const retained = uses.get(asset.digest);
      uses.set(asset.digest, {
        count: (retained?.count ?? 0) + 1,
        ancestryBytes: (retained?.ancestryBytes ?? 0) + pathBytes,
        asset,
      });
    }
  }
  // The owning reader verifies all variants serially before returning its selected owned copy.
  // Reserve one advertised verification buffer plus worst-case JSON strings/UTF8; this cannot
  // prevent an oversized or dishonest individual FS/RPC allocation preceding validation.
  if ([...uses.keys()].some((digest) => !previous?.definitions?.has(digest))) {
    let largestVariantBytes = 0;
    for (const part of Object.values(display.admitted.publication.parts)) {
      for (const variant of Object.values(part.variants)) {
        largestVariantBytes = Math.max(largestVariantBytes, variant.glb.byteLength);
      }
    }
    reserveResources(largestVariantBytes + 3 * largestVariantBytes, 0);
  }
  const reservedSources = new Set<ArrayBufferLike>();
  for (const definition of previous?.definitions?.values() ?? []) {
    reservedSources.add(definition.bytes.buffer);
  }
  for (const [digest, { asset }] of uses) {
    if (!previous?.definitions?.has(digest)) {
      if (asset.byteLength > 64 * 1024 * 1024) {
        throw new RangeError('Assembly definition exceeds 64 MiB');
      }
      // Advertised planning only: the preceding FS/RPC read has no bounded-allocation contract.
      reserveResources(asset.byteLength, 0);
    }
  }
  const bytes = new Map<string, Uint8Array<ArrayBuffer>>();
  const metadata = await validateAdmittedAssemblyGlb({
    parts: display.admitted.publication.parts,
    occurrences: display.admitted.publication.occurrences,
    readAsset: async (_part, asset) => {
      const retained = bytes.get(asset.digest) ?? previous?.definitions?.get(asset.digest)?.bytes;
      const value = retained ?? (await readAsset(asset.digest));
      if (value.byteLength > 64 * 1024 * 1024) {
        throw new RangeError('Assembly definition exceeds 64 MiB');
      }
      if (!reservedSources.has(value.buffer)) {
        reserveResources(Math.max(0, value.buffer.byteLength - asset.byteLength), 0);
        reservedSources.add(value.buffer);
      }
      // Bound JSON/descriptor preparation before the existing parser, then decoded arrays before
      // semantic IO. These source declarations are reservations, not a native decoder allocation guarantee.
      const jsonBytes = new DataView(value.buffer, value.byteOffset, value.byteLength).getUint32(12, true);
      reserveResources(3 * jsonBytes, 0);
      const { json, bin } = parseGltfBytes(value);
      let decodedBytes = 0;
      const componentCounts = new Map<string, number>([
        ['SCALAR', 1],
        ['VEC2', 2],
        ['VEC3', 3],
        ['VEC4', 4],
        ['MAT2', 4],
        ['MAT3', 9],
        ['MAT4', 16],
      ]);
      const componentSizes: Readonly<Record<number, number>> = {
        5120: 1,
        5121: 1,
        5122: 2,
        5123: 2,
        5125: 4,
        5126: 4,
      };
      for (const accessor of json.accessors ?? []) {
        const components = componentCounts.get(accessor.type);
        const componentBytes = componentSizes[accessor.componentType];
        if (!components || !componentBytes || !Number.isSafeInteger(accessor.count) || accessor.count < 0) {
          throw new RangeError('Invalid assembly accessor resource reservation');
        }
        const columnCount = accessor.type.startsWith('MAT') ? Math.sqrt(components) : 1;
        const stride =
          columnCount > 1
            ? columnCount * Math.ceil((columnCount * componentBytes) / 4) * 4
            : components * componentBytes;
        decodedBytes += accessor.count * stride;
      }
      reserveResources(decodedBytes + (json.bufferViews ?? []).reduce((sum, view) => sum + view.byteLength, 0), 0);
      const topologyView = json.extensions?.['TAU_cad_topology']?.['topologyBufferView'];
      if (typeof topologyView === 'number') {
        reserveResources(3 * (json.bufferViews?.[topologyView]?.byteLength ?? 0), 0);
      }
      const topology = readTopologyPayload(json, bin);
      const descriptorBytes = new TextEncoder().encode(
        canonicalJson({
          nodes: json.nodes ?? [],
          meshes: json.meshes ?? [],
          topology,
          materials: json.materials ?? [],
        }),
      ).byteLength;
      const use = uses.get(asset.digest)!;
      // Only copied source node/topology/primitive/material descriptors recur in these six
      // projections. Shared buffer/accessor JSON is reserved once per actual parser above.
      // Canonical IDs also incorporate ancestry for each projected source component.
      const sourceComponentCount = (json.nodes?.length ?? 0) + (topology.components?.length ?? 0);
      reserveResources(3 * 6 * (descriptorBytes * use.count + use.ancestryBytes * sourceComponentCount), 0);
      bytes.set(asset.digest, value);
      return value;
    },
  });
  reserveResources(
    metadata.occurrences.length * (4 + 4) + Math.max(0, metadata.occurrences.length * 2 - 1) * (6 * 8 + 2 * 4 + 2 * 4),
    0,
  );
  const layout = buildResidentAssemblyComponentManifest({
    metadata,
    publication: display.admitted.publication,
    definitions: bytes,
    sourceFile,
    geometryHash: display.root.digest,
  });
  onDemandIndex();
  return {
    metadata,
    layout,
    demand: prepareAssemblyDemand(metadata, layout),
    bytes,
    validatedSourceBytes: [...bytes.values()].reduce((sum, value) => sum + value.byteLength, 0),
    metadataSerializedBytes: jsonSerializedByteLength({
      metadata,
      publication: display.admitted.publication,
      manifest: layout.manifest,
      occurrenceManifests: [...layout.occurrenceManifests],
      sourceComponentIdsByAncestry: [...layout.sourceComponentIdsByAncestry].map(([path, ids]) => [path, [...ids]]),
    }),
  };
}

/** Query canonical placed bounds without allocating source meshes or scanning offscreen occurrences. */
function assemblyResidentOccurrences({
  demand,
  camera,
  renderFrame,
  layout,
  unit,
  priorityIds,
}: {
  demand: PreparedAssemblyDemand;
  camera: Camera;
  renderFrame: RenderFrame;
  layout: PreparedAssemblyLayout;
  unit: KinematicsUnitState;
  priorityIds: ReadonlySet<string>;
}): ReadonlySet<string> {
  camera.updateMatrixWorld();
  const frustum = new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    camera.coordinateSystem,
    camera.reversedDepth,
  );
  const inversePlacement = createThreeRenderMatrix(renderFrame).multiply(createCanonicalGltfToTauMatrix()).invert();
  for (const plane of frustum.planes) {
    plane.applyMatrix4(inversePlacement);
  }
  const forcedKeys = new Set<string>();
  for (const id of priorityIds) {
    for (const path of demand.pathsByComponent.get(id) ?? []) {
      forcedKeys.add(path);
    }
  }
  const linkByComponent = new Map<string, string>();
  const movingPaths = new Set<string>();
  if (unit.pose) {
    for (const [linkId, link] of Object.entries(unit.mechanism?.links ?? {})) {
      const delta = unit.pose.linkTransforms[linkId];
      if (!delta) {
        continue;
      }
      const isIdentity = delta.every((value, index) => value === (index % 5 === 0 ? 1 : 0));
      for (const componentId of link.components) {
        // Identity children still shadow a moving linked ancestor; only changed links force bounds overrides.
        linkByComponent.set(componentId, linkId);
        if (!isIdentity) {
          for (const path of demand.pathsByComponent.get(componentId) ?? []) {
            movingPaths.add(path);
          }
        }
      }
    }
  }
  const posedBounds = new Map<string, AssemblyMetadata['bounds']>();
  for (const path of movingPaths) {
    const posed = new Box3();
    for (const id of layout.sourceComponentIdsByAncestry.get(path)?.values() ?? []) {
      const node = layout.manifest.nodesById[id];
      if (!node?.bounds || !node.primitiveRefs?.length) {
        continue;
      }
      const deltaId = [id, ...getComponentAncestorIds(layout.manifest, id)]
        .map((memberId) => linkByComponent.get(memberId))
        .find((value) => value !== undefined);
      const componentBounds = new Box3(new Vector3(...node.bounds.min), new Vector3(...node.bounds.max));
      const delta = deltaId && unit.pose?.linkTransforms[deltaId];
      if (delta) {
        componentBounds.applyMatrix4(new Matrix4().fromArray(delta));
      }
      posed.union(componentBounds);
    }
    if (!posed.isEmpty()) {
      posedBounds.set(path, { min: posed.min.toArray(), max: posed.max.toArray() });
    }
  }
  return queryAssemblyDemandIndex({ index: demand.index, frustum, forcedKeys, posedBounds }).occurrenceKeys;
}

/** Source-local bounds are read once by the definition inventory, including interleaved positions. */
function getAssemblyPrimitiveLocalBounds(geometry: BufferGeometry): Box3 {
  if (geometry.boundingBox) {
    return geometry.boundingBox.clone();
  }
  const bounds = new Box3();
  const positions = geometry.attributes['position'];
  const point = new Vector3();
  if (positions) {
    for (let index = 0; index < positions.count; index++) {
      bounds.expandByPoint(point.fromBufferAttribute(positions, index));
    }
  }
  return bounds;
}

/** Camera demand uses existing canonical metadata/definition owners, with no mesh or geometry allocation. */
function resolveAssemblyDetailSelections({
  display,
  definitions,
  metadata,
  demand,
  layout,
  resident,
  modelVisualState,
  camera,
  renderFrame,
  viewport,
  unit,
  policy,
  previous,
  calibration,
}: {
  display: CadAssemblyDisplay;
  definitions: ReadonlyMap<string, PreparedGltfDefinition>;
  metadata: AssemblyMetadata;
  demand: PreparedAssemblyDemand;
  layout: PreparedAssemblyLayout;
  resident: ReadonlySet<string>;
  modelVisualState: ApplyModelComponentVisualStateToSceneOptions['modelVisualState'];
  camera: Camera;
  renderFrame: RenderFrame;
  viewport: Readonly<{ width: number; height: number }>;
  unit: KinematicsUnitState;
  policy: AssemblyDetailPolicy | undefined;
  previous: ReadonlyMap<string, boolean> | undefined;
  calibration?: AssemblyDetailCalibration;
}): ReadonlyMap<string, boolean> {
  const selections = new Map<string, boolean>();
  const priority = new Set([
    ...modelVisualState.selectedComponentIds,
    ...(modelVisualState.focusedComponentId ? [modelVisualState.focusedComponentId] : []),
  ]);
  const renderPlacement = createThreeRenderMatrix(renderFrame).multiply(createCanonicalGltfToTauMatrix());
  const linkByComponent = new Map<string, string>();
  for (const [linkId, link] of Object.entries(unit.mechanism?.links ?? {})) {
    for (const id of link.components) {
      linkByComponent.set(id, linkId);
    }
  }
  const validViewport = isValidAssemblyDetailViewport(viewport);
  let cameraFrame: AssemblyDetailCameraFrame | undefined;
  const getCameraFrame = (): AssemblyDetailCameraFrame => {
    cameraFrame ??= prepareAssemblyDetailCameraFrame(camera);
    return cameraFrame;
  };
  for (const path of resident) {
    const leaf = demand.index.keyToLeaf.get(path);
    const occurrence = leaf === undefined ? undefined : metadata.occurrences[demand.index.occurrenceIndices[leaf]!];
    if (!occurrence?.definition) {
      throw new Error('Detail demand lost canonical occurrence');
    }
    const { part, variant } = occurrence.definition;
    const definition = definitions.get(display.admitted.publication.parts[part]!.variants[variant]!.glb.digest);
    if (!definition) {
      throw new Error('Detail demand lost resident definition');
    }
    const ids = layout.sourceComponentIdsByAncestry.get(path);
    for (const [primitiveIndex, primitive] of definition.primitives.entries()) {
      if (!primitive.geometry || !primitive.detail) {
        continue;
      }
      const id = ids?.get(primitive.sourceComponentId);
      if (!id) {
        throw new Error('Detail demand lost canonical component');
      }
      const members = [id, ...getComponentAncestorIds(layout.manifest, id)];
      const key = JSON.stringify([occurrence.id, primitiveIndex]);
      const fullEvidence = members.some((member) => priority.has(member));
      if (fullEvidence && calibration) {
        calibration.selectedFullEvidenceCount++;
      }
      if (!policy?.screenSpace) {
        selections.set(key, !fullEvidence);
        continue;
      }
      const linkId = members.map((member) => linkByComponent.get(member)).find((value) => value !== undefined);
      const delta = linkId && unit.pose?.linkTransforms[linkId];
      const placed = new Matrix4().fromArray(occurrence.worldTransform).multiply(primitive.localPlacement);
      if (delta) {
        placed.premultiply(new Matrix4().fromArray(delta));
      }
      const sourceBounds = primitive.localBounds;
      if (!sourceBounds) {
        throw new Error('Detail demand lost source-local primitive bounds');
      }
      const approximatePixelError = estimateAssemblyDetailPixelErrorWithFrame(
        {
          sourceBounds,
          sourceError: primitive.detail.approximateSourceError,
          drawToRender: renderPlacement.clone().multiply(placed),
          viewport,
        },
        getCameraFrame,
        validViewport,
      );
      if (calibration) {
        if (Number.isFinite(approximatePixelError)) {
          calibration.maxProjectedApproximateErrorPixels = Math.max(
            calibration.maxProjectedApproximateErrorPixels,
            approximatePixelError,
          );
        } else {
          calibration.projectionUnavailableCount++;
        }
      }
      selections.set(
        key,
        shouldUseAssemblyDetail({
          approximatePixelError,
          previousDetail: previous?.get(key) === true,
          fullEvidence,
          screenSpace: policy.screenSpace,
        }),
      );
    }
  }
  return selections;
}

/** Retain definition templates in the existing candidate inventory, before occurrence cloning. */
async function prepareAssemblyDefinitions({
  display,
  previous,
  resources,
  backend,
  resolution,
  edgeColor,
  isCancelled,
  assets,
  sourceBytes,
  reserveResources,
  readAsset,
}: {
  readonly display: CadAssemblyDisplay;
  readonly previous: PreparedGltfPresentation | undefined;
  readonly resources: RetainedGltfResources;
  readonly backend: ReturnType<typeof useThreeGraphicsBackend>;
  readonly resolution: Vector2;
  readonly edgeColor: number;
  readonly isCancelled: () => boolean;
  readonly assets: ReadonlySet<PublishedPartAsset['digest']>;
  readonly sourceBytes: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
  readonly reserveResources: (cpuBytes: number, gpuBytes: number) => void;
  readonly readAsset: (digest: PublishedPartAsset['digest']) => Promise<Uint8Array<ArrayBuffer>>;
}): Promise<ReadonlyMap<string, PreparedGltfDefinition>> {
  const definitions = new Map<string, PreparedGltfDefinition>();
  let verificationReserved = false;
  for (const digest of assets) {
    const retained = previous?.definitions?.get(digest);
    if (retained?.backend === backend) {
      // Ownership may already have moved to a newer candidate while an older one was
      // awaiting a read. Every predecessor reference is externally owned until commit.
      for (const resource of retained.immutableResources) {
        borrowRetainedResource(resources, resource);
      }
      for (const [key, geometry] of previous!.resources.geometries) {
        if (retained.immutableResources.has(geometry)) {
          resources.geometries.set(key, geometry);
        }
      }
      for (const [key, texture] of previous!.resources.textures) {
        if (retained.immutableResources.has(texture)) {
          resources.textures.set(key, texture);
        }
      }
      definitions.set(digest, retained);
      continue;
    }
    const suppliedBytes = sourceBytes.get(digest) ?? retained?.bytes;
    let advertisedBytes = 0;
    if (!suppliedBytes) {
      let largestVariantBytes = 0;
      for (const part of Object.values(display.admitted.publication.parts)) {
        for (const variant of Object.values(part.variants)) {
          largestVariantBytes = Math.max(largestVariantBytes, variant.glb.byteLength);
          if (variant.glb.digest === digest) {
            advertisedBytes = variant.glb.byteLength;
          }
        }
      }
      if (advertisedBytes > 64 * 1024 * 1024) {
        throw new RangeError('Assembly definition exceeds 64 MiB');
      }
      // A reused metadata facade can demand a definition not retained in its last view.
      // Reserve its selected owned copy and one serial verifier before the existing read;
      // neither advertisement bounds an individual dishonest FS/RPC allocation.
      reserveResources(advertisedBytes, 0);
      if (!verificationReserved) {
        reserveResources(largestVariantBytes + 3 * largestVariantBytes, 0);
        verificationReserved = true;
      }
    }
    // oxlint-disable-next-line no-await-in-loop -- Bound peak allocation to one definition during candidate preparation.
    const bytes = suppliedBytes ?? (await readAsset(digest));
    if (!suppliedBytes) {
      reserveResources(Math.max(0, bytes.buffer.byteLength - advertisedBytes), 0);
    }
    if (isCancelled()) {
      throw new DOMException('Assembly preparation cancelled.', 'AbortError');
    }
    if (bytes.byteLength > 64 * 1024 * 1024) {
      throw new RangeError('Assembly definition exceeds 64 MiB');
    }
    reserveResources(3 * new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true), 0);
    const { json } = parseGltfBytes(bytes);
    let decodedBytes = 0;
    const componentCounts = new Map<string, number>([
      ['SCALAR', 1],
      ['VEC2', 2],
      ['VEC3', 3],
      ['VEC4', 4],
      ['MAT2', 4],
      ['MAT3', 9],
      ['MAT4', 16],
    ]);
    const componentSizes: Readonly<Record<number, number>> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
    for (const accessor of json.accessors ?? []) {
      const components = componentCounts.get(accessor.type);
      const componentBytes = componentSizes[accessor.componentType];
      if (!components || !componentBytes || !Number.isSafeInteger(accessor.count) || accessor.count < 0) {
        throw new RangeError('Invalid assembly accessor resource reservation');
      }
      const columns = accessor.type.startsWith('MAT') ? Math.sqrt(components) : 1;
      decodedBytes +=
        accessor.count *
        (columns > 1 ? columns * Math.ceil((columns * componentBytes) / 4) * 4 : components * componentBytes);
    }
    // Accessor declarations also cover sparse destination arrays; buffer-view storage may coexist.
    const decodedViews = (json.bufferViews ?? []).reduce((sum, view) => sum + view.byteLength, 0);
    let fatLineBytes = 0;
    for (const mesh of json.meshes ?? []) {
      for (const primitive of mesh.primitives ?? []) {
        if (primitive.mode !== 1) {
          continue;
        }
        const accessor = json.accessors?.[primitive.indices ?? primitive.attributes?.['POSITION'] ?? -1];
        if (!accessor) {
          throw new RangeError('Missing mandatory edge resource declaration');
        }
        // Installed LineSegmentsGeometry: 24 Float32 positions,16 Float32 UVs,18 Uint16 indices;
        // extractPositions adds one Float32 endpoint array per source edge primitive.
        fatLineBytes += 24 * 4 + 16 * 4 + 18 * 2 + accessor.count * 3 * 4;
      }
    }
    reserveResources(
      decodedBytes +
        decodedViews +
        fatLineBytes +
        (bytes.byteLength === bytes.buffer.byteLength ? 0 : bytes.byteLength),
      decodedBytes + decodedViews + fatLineBytes,
    );
    // Image decode, decoder/WASM and driver/binding expansion cannot be derived from compressed size.
    // Supported images/materials remain enabled; known decoded resources are reconciled before compile.
    // oxlint-disable-next-line no-await-in-loop -- The definition owns one actual GLTFLoader parser and resource set.
    const gltf = await gltfLoader.parseAsync(
      bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? bytes.buffer
        : new Uint8Array(bytes).buffer,
      '',
    );
    // oxlint-disable-next-line no-await-in-loop -- Capture all already-parsed dependencies before any cancellation or ownership mutation.
    const parsedInventory = await captureParsedGltfInventory(gltf, bytes, resources);
    applyFatLineSegments(gltf, { resolution, backend, edgeColor });
    captureRetainedResources(gltf.scene, resources);
    for (const resource of collectGltfResources(gltf.scene, undefined, true)) {
      if (isGltfMaterial(resource)) {
        resources.owned.add(resource);
      }
    }
    // oxlint-disable-next-line no-await-in-loop -- Content compatibility retains unchanged geometry across an appearance-only definition revision.
    await retainGltfResources({
      gltf,
      bytes,
      definitionDigest: digest,
      previous: previous?.resources,
      backend,
      resources,
    });
    const manifest = buildGltfComponentManifest(bytes);
    const measurementFeatures = buildGltfMeasurementFeatures(bytes, manifest);
    const associations = new Map<Object3D, GltfLoaderAssociation>();
    for (const [object, association] of gltf.parser.associations) {
      if (isGltfObject3D(object)) {
        associations.set(object, association);
      }
    }
    annotateSceneComponents(gltf.scene, manifest, { unitId: digest, associations, measurementFeatures });
    gltf.scene.updateMatrixWorld(true);
    const primitives: PreparedDefinitionPrimitive[] = [];
    gltf.scene.traverse((object) => {
      const sourceComponentId = getModelComponentId(object);
      if (!sourceComponentId || !isModelRenderableObject(object)) {
        return;
      }
      const association = associations.get(object);
      let node: Object3D | undefined = object;
      let nodeIndex: number | undefined;
      while (node && nodeIndex === undefined) {
        nodeIndex = associations.get(node)?.nodes;
        node = node.parent ?? undefined;
      }
      const feature =
        nodeIndex === undefined || association?.meshes === undefined || association.primitives === undefined
          ? undefined
          : measurementFeatures.get(
              gltfPrimitiveOccurrenceKey({
                nodeIndex,
                meshIndex: association.meshes,
                primitiveIndex: association.primitives,
              }),
            );
      const edgePositions = getGltfFatLinePositions(object);
      const edgeMaterial = collectGltfFatLineMaterials(object)[0];
      const material = isSurfaceObject(object) && !Array.isArray(object.material) ? object.material : undefined;
      const eligibleSurface =
        isSurfaceObject(object) &&
        object.type === 'Mesh' &&
        !object.morphTargetInfluences &&
        material &&
        isOpaqueAssemblyBatchMaterial(material);
      primitives.push({
        source: object,
        sourceComponentId,
        feature,
        geometry: eligibleSurface ? object.geometry : undefined,
        localBounds: eligibleSurface ? getAssemblyPrimitiveLocalBounds(object.geometry) : undefined,
        material: eligibleSurface ? material : undefined,
        edgePositions,
        edgeMaterial,
        localPlacement: object.matrixWorld.clone(),
      });
    });
    const immutableResources = new Set<BufferGeometry | Texture | Material>();
    for (const resource of collectGltfResources(gltf.scene, undefined, true)) {
      if (isGltfBufferGeometry(resource) || isGltfTexture(resource) || isGltfMaterial(resource)) {
        immutableResources.add(resource);
      }
    }
    definitions.set(digest, {
      gltf,
      bytes,
      measurementFeatures,
      primitives,
      parsedInventory,
      immutableResources,
      backend,
    });
  }
  return definitions;
}

/** Clone only occurrence-owned object and material state; definition geometry and textures stay immutable. */
function cloneDefinitionOccurrence(definition: PreparedGltfDefinition): {
  scene: Group;
  associations: ReadonlyMap<Object3D, GltfLoaderAssociation>;
} {
  const scene = definition.gltf.scene.clone(true);
  const sourceObjects: Object3D[] = [];
  const clonedObjects: Object3D[] = [];
  definition.gltf.scene.traverse((object) => sourceObjects.push(object));
  scene.traverse((object) => clonedObjects.push(object));
  const associations = new Map<Object3D, GltfLoaderAssociation>();
  for (const [index, source] of sourceObjects.entries()) {
    const target = clonedObjects[index]!;
    cloneGltfFatLineOwnership(source, target);
    const association = definition.gltf.parser.associations.get(source) as GltfLoaderAssociation | undefined;
    if (association) {
      associations.set(target, association);
    }
  }
  return { scene, associations };
}

/** Sorted transmissive/backdrop materials retain individual ordinary occurrence draw owners. */
export function isOpaqueAssemblyBatchMaterial(material: Material): boolean {
  if (
    material.transparent ||
    ('transmission' in material && typeof material.transmission === 'number' && material.transmission > 0)
  ) {
    return false;
  }
  const nodes: unknown[] = [
    'transmissionNode' in material ? material.transmissionNode : undefined,
    'backdropNode' in material ? material.backdropNode : undefined,
  ];
  for (const node of nodes) {
    if (typeof node === 'object' && node !== null && 'isNode' in node && node.isNode === true) {
      return false;
    }
  }
  return true;
}

/** Three instanced normals support orthogonal affine columns; reflected/skewed inputs retain the ordinary path. */
function isBatchableDrawMatrix(matrix: Matrix4): boolean {
  const { elements } = matrix;
  if (
    !elements.every((value) => Number.isFinite(value)) ||
    elements[3] !== 0 ||
    elements[7] !== 0 ||
    elements[11] !== 0 ||
    elements[15] !== 1 ||
    matrix.determinant() <= 0
  ) {
    return false;
  }
  const columns = [
    new Vector3(elements[0], elements[1], elements[2]),
    new Vector3(elements[4], elements[5], elements[6]),
    new Vector3(elements[8], elements[9], elements[10]),
  ];
  return (
    columns.every((column) => column.lengthSq() > 0) &&
    [
      [0, 1],
      [0, 2],
      [1, 2],
    ].every(
      ([a, b]) =>
        Math.abs(columns[a!]!.dot(columns[b!]!)) <= 64 * Number.EPSILON * columns[a!]!.length() * columns[b!]!.length(),
    )
  );
}

/** Prepare a definition-local scene from shared canonical admission metadata; no flattened GLB is allocated. */
async function prepareAssemblyScene({
  display,
  definitions,
  metadata,
  layout,
  resident,
  demand,
  unitId,
  scene,
  modelVisualState,
  backend,
  resources,
  previousResources,
  detailSelections,
  reserveResources,
}: {
  readonly display: CadAssemblyDisplay;
  readonly definitions: ReadonlyMap<string, PreparedGltfDefinition>;
  readonly metadata: AssemblyMetadata;
  readonly layout: PreparedAssemblyLayout;
  readonly resident: ReadonlySet<string>;
  readonly demand: PreparedAssemblyDemand;
  readonly unitId: string;
  readonly scene: Group;
  readonly modelVisualState: ApplyModelComponentVisualStateToSceneOptions['modelVisualState'];
  readonly backend: ReturnType<typeof useThreeGraphicsBackend>;
  readonly resources: RetainedGltfResources;
  readonly previousResources: RetainedGltfResources | undefined;
  readonly detailSelections: ReadonlyMap<string, boolean>;
  readonly reserveResources: (cpuBytes: number, gpuBytes: number) => void;
}): Promise<{
  scene: Group;
  manifest: GeometryComponentManifest;
  metadata: Awaited<ReturnType<typeof validateAdmittedAssemblyGlb>>;
  parser: SectionTopologyGltfParser | undefined;
  sourceBindings: ReadonlyMap<Object3D, GltfSectionSourceBinding>;
}> {
  const { manifest, occurrenceManifests, sourceComponentIdsByAncestry } = layout;
  const sourceBindings = new Map<Object3D, GltfSectionSourceBinding>();
  let firstParser: SectionTopologyGltfParser | undefined;
  const linkByComponent = new Map<string, { linkId: string; componentId: string }>();
  for (const [linkId, link] of Object.entries(metadata.mechanism?.links ?? {})) {
    for (const componentId of link.components) {
      linkByComponent.set(componentId, { linkId, componentId });
    }
  }
  const hidden = new Set(modelVisualState.hiddenComponentIds);
  const isolated = new Set(modelVisualState.isolatedComponentIds);
  const focused = new Set(modelVisualState.focusedComponentId ? [modelVisualState.focusedComponentId] : []);
  const opacityByComponentId =
    Object.keys(modelVisualState.opacityByComponentId).length > 0 ? modelVisualState.opacityByComponentId : undefined;
  const extent = Math.max(...metadata.bounds.max.map((value, axis) => value - metadata.bounds.min[axis]!));
  // Cells only rebase draw storage; they never reject a demanded or selected occurrence.
  const cellWidth = Math.max(1, extent / 64);
  type SurfaceGroup = {
    parent: Group;
    source: PreparedDefinitionPrimitive;
    matrices: Matrix4[];
    slots: ModelComponentInstanceSlot[];
    opacity: number;
    geometry: BufferGeometry;
  };
  type EdgeGroup = {
    parent: Group;
    material: GltfFatLineMaterial;
    occurrences: Array<{ componentId: string; positions: Float32Array; localToBatch: Matrix4 }>;
  };
  const selectedComponents = new Set(modelVisualState.selectedComponentIds);
  const parents = new Map<string, Group>();
  const surfaces = new Map<string, SurfaceGroup>();
  const edges = new Map<string, EdgeGroup>();
  for (const pathKey of resident) {
    // The candidate-owned Float64 index already binds each demanded path to canonical metadata.
    // Camera-only candidates must not rebuild an occurrence map over all offscreen placements.
    const leaf = demand.index.keyToLeaf.get(pathKey);
    const canonical = leaf === undefined ? undefined : metadata.occurrences[demand.index.occurrenceIndices[leaf]!];
    if (!canonical?.definition) {
      throw new Error('Demanded assembly occurrence has no definition');
    }
    const { part, variant } = canonical.definition;
    const asset = display.admitted.publication.parts[part]!.variants[variant]!.glb;
    const definition = definitions.get(asset.digest);
    const localManifest = occurrenceManifests.get(pathKey);
    if (!definition || !localManifest) {
      throw new Error('Retained assembly occurrence has no prepared definition');
    }
    const componentIds = sourceComponentIdsByAncestry.get(pathKey)!;
    const surfacePrimitives = definition.primitives.reduce((sum, primitive) => sum + (primitive.geometry ? 1 : 0), 0);
    const edgeSegments = definition.primitives.reduce(
      (sum, primitive) => sum + (primitive.edgePositions?.length ?? 0) / 6,
      0,
    );
    // Reserve occurrence matrices, ownership/slot descriptors and all mandatory fat-edge
    // endpoint/color/upload arrays before creating occurrence objects or accumulating batches.
    reserveResources(
      surfacePrimitives * (16 * 4 + 3 * 256) +
        (edgeSegments > 0 ? 24 * 4 + 16 * 4 + 18 * 2 + edgeSegments * 6 * 4 * 2 : 0),
      surfacePrimitives * 16 * 4 + (edgeSegments > 0 ? 24 * 4 + 16 * 4 + 18 * 2 + edgeSegments * 6 * 4 * 2 : 0),
    );
    const parser = definition.gltf.parser as unknown as SectionTopologyGltfParser;
    firstParser ??= parser;
    const placement = new Matrix4().fromArray(canonical.worldTransform);
    const eligible = definition.primitives.every((primitive) => {
      const componentId = componentIds.get(primitive.sourceComponentId);
      if (!componentId) {
        return false;
      }
      const visual = resolveComponentVisualStateWithManifest({
        componentId,
        manifest,
        hiddenComponentIds: hidden,
        isolatedComponentIds: isolated,
        focusedComponentIds: focused,
        opacityByComponentId,
      });
      return (
        visual.opacity >= 1 &&
        (Boolean(primitive.geometry && primitive.material) ||
          Boolean(primitive.edgePositions && primitive.edgeMaterial)) &&
        isBatchableDrawMatrix(placement.clone().multiply(primitive.localPlacement))
      );
    });
    if (!eligible) {
      // Ordinary occurrence wrappers/material/ownership descriptors are app-owned allowances;
      // immutable geometry/textures remain shared, including mandatory source edge geometry.
      reserveResources(3 * definition.parsedInventory.jsonSerializedBytes, 0);
      // Preserve non-instancable skin/morph/transparent/mirrored sources with the ordinary owner path.
      const wrapper = new Group();
      wrapper.matrix.copy(placement);
      wrapper.matrixAutoUpdate = false;
      setModelComponentOwner(wrapper, { unitId, componentId: canonical.id });
      scene.add(wrapper);
      const cloned = cloneDefinitionOccurrence(definition);
      wrapper.add(cloned.scene);
      const measurementFeatures = new Map<string, GltfMeasurementFeatures>();
      for (const [key, feature] of definition.measurementFeatures) {
        const componentId = componentIds.get(feature.componentId);
        if (componentId) {
          measurementFeatures.set(key, {
            ...feature,
            componentId,
            occurrenceId: `${componentId}@node:${feature.primitive.nodeIndex}`,
          });
        }
      }
      cloned.scene.traverse((object) => {
        const sourceId = getModelComponentId(object);
        const componentId = sourceId && componentIds.get(sourceId);
        if (componentId) {
          setModelComponentOwner(object, { unitId, componentId });
        }
      });
      annotateSceneComponents(cloned.scene, localManifest, {
        unitId,
        associations: cloned.associations,
        measurementFeatures,
      });
      const localParser: SectionTopologyGltfParser = {
        json: parser.json,
        associations: cloned.associations,
        getDependency: async (type, index) => parser.getDependency(type, index),
      };
      cloned.scene.traverse((object) =>
        sourceBindings.set(object, { parser: localParser, occurrenceId: canonical.id }),
      );
      continue;
    }
    for (const [primitiveIndex, primitive] of definition.primitives.entries()) {
      const componentId = componentIds.get(primitive.sourceComponentId);
      if (!componentId) {
        throw new Error('Batch primitive lost canonical component evidence');
      }
      const visual = resolveComponentVisualStateWithManifest({
        componentId,
        manifest,
        hiddenComponentIds: hidden,
        isolatedComponentIds: isolated,
        focusedComponentIds: focused,
        opacityByComponentId,
      });
      if (!visual.visible) {
        continue;
      }
      const linked =
        linkByComponent.size === 0
          ? undefined
          : [componentId, ...getComponentAncestorIds(manifest, componentId)]
              .map((id) => linkByComponent.get(id))
              .find((entry) => entry !== undefined);
      const center = canonical.bounds
        ? canonical.bounds.min.map((value, axis) => (value + canonical.bounds!.max[axis]!) / 2)
        : [placement.elements[12], placement.elements[13], placement.elements[14]];
      const origin = center.map((value) => Math.floor(value / cellWidth) * cellWidth);
      const cellKey = JSON.stringify([linked?.linkId ?? '', origin]);
      let parent = parents.get(cellKey);
      if (!parent) {
        parent = new Group();
        parent.matrix.makeTranslation(origin[0]!, origin[1]!, origin[2]!);
        parent.matrixAutoUpdate = false;
        if (linked) {
          setModelComponentOwner(parent, { unitId, componentId: linked.componentId });
        }
        parents.set(cellKey, parent);
        scene.add(parent);
      }
      const localToBatch = parent.matrix.clone().invert().multiply(placement).multiply(primitive.localPlacement);
      if (primitive.geometry && primitive.material) {
        const fullEvidence =
          (selectedComponents.size > 0 || focused.size > 0) &&
          [componentId, ...getComponentAncestorIds(manifest, componentId)].some(
            (id) => selectedComponents.has(id) || focused.has(id),
          );
        const drawGeometry =
          !fullEvidence &&
          primitive.detail &&
          detailSelections.get(JSON.stringify([canonical.id, primitiveIndex])) === true
            ? primitive.detail.geometry
            : primitive.geometry;
        const groupKey = JSON.stringify([cellKey, drawGeometry.id, primitive.material.uuid, visual.opacity]);
        let group = surfaces.get(groupKey);
        if (!group) {
          group = {
            parent,
            source: primitive,
            matrices: [],
            slots: [],
            opacity: visual.opacity,
            geometry: drawGeometry,
          };
          surfaces.set(groupKey, group);
        }
        group.matrices.push(localToBatch);
        group.slots.push({
          owner: { unitId, componentId },
          sourceObject: primitive.source,
          measurementFeatures: primitive.feature && {
            ...primitive.feature,
            componentId,
            occurrenceId: `${componentId}@node:${primitive.feature.primitive.nodeIndex}`,
          },
          sourceBinding: { parser, occurrenceId: canonical.id },
        });
      } else if (primitive.edgePositions && primitive.edgeMaterial) {
        const groupKey = JSON.stringify([cellKey, primitive.edgeMaterial.uuid]);
        let group = edges.get(groupKey);
        if (!group) {
          group = { parent, material: primitive.edgeMaterial, occurrences: [] };
          edges.set(groupKey, group);
        }
        group.occurrences.push({ componentId, positions: primitive.edgePositions, localToBatch });
      } else {
        throw new Error(`Batch primitive ${primitiveIndex} became unsupported`);
      }
    }
  }
  for (const group of surfaces.values()) {
    const material = group.source.material!.clone();
    const mesh = new InstancedMesh(group.geometry, material, 0);
    const instanceMatrixArray = new Float32Array(group.slots.length * 16);
    mesh.instanceMatrix = new InstancedBufferAttribute(instanceMatrixArray, 16);
    mesh.count = group.slots.length;
    for (const [slot, matrix] of group.matrices.entries()) {
      if (!matrix.elements.every((value) => Number.isFinite(Math.fround(value)))) {
        throw new RangeError('Instance placement exceeds Float32 local storage');
      }
      mesh.setMatrixAt(slot, matrix);
    }
    group.parent.add(mesh);
    const instanceKey = canonicalJson([
      backend,
      group.source.geometry!.uuid,
      group.slots.map((slot) => slot.owner),
      // oxlint-disable-next-line eslint/no-await-in-loop -- Candidate surface allocations and hashes are serialized to preserve resource transfer and cancellation order.
      await sha256Bytes(
        new Uint8Array(instanceMatrixArray.buffer, instanceMatrixArray.byteOffset, instanceMatrixArray.byteLength),
      ),
    ]);
    const retainedAttribute = previousResources?.instanceAttributes.get(instanceKey);
    if (retainedAttribute) {
      // A predecessor map is an external owner even when another candidate already transferred it.
      resources.borrowedInstanceAttributes.add(retainedAttribute);
      mesh.instanceMatrix = retainedAttribute;
    } else {
      mesh.instanceMatrix.needsUpdate = true;
    }
    resources.instanceAttributes.set(instanceKey, mesh.instanceMatrix);
    setModelComponentInstanceSlots(mesh, group.slots);
    applyModelMaterialAppearance(material, getOrCaptureModelMaterialAppearance(material), group.opacity);
  }
  for (const group of edges.values()) {
    const batch = createGltfOccurrenceEdgeBatch({ backend, material: group.material, occurrences: group.occurrences });
    if (batch) {
      group.parent.add(batch.object);
    }
  }
  setGltfAssemblyBounds(scene, {
    bounds: metadata.bounds,
    unitId,
    source: { display, metadata },
    components: demand.fullBoundComponents,
  });
  scene.updateMatrixWorld(true);
  return { scene, manifest, metadata, parser: firstParser, sourceBindings };
}

type GltfPresentationTimings = Partial<Record<keyof GltfPresentationTelemetry['durations'], number>>;

const committedGltfDrawInventory = Symbol('committedGltfDrawInventory');
const liveGltfAssemblyResourceInventory = Symbol('liveGltfAssemblyResourceInventory');
const armedGltfAssemblyAdmissionResourceInventory = Symbol('armedGltfAssemblyAdmissionResourceInventory');

type AssemblyPreparationPhase =
  | 'queued'
  | 'source-validation'
  | 'demand-index'
  | 'definition-preparation'
  | 'detail-preparation'
  | 'scene-preparation'
  | 'material-preparation'
  | 'section-analysis'
  | 'admission'
  | 'committed'
  | 'cancelled'
  | 'failed';

type AssemblyPreparationProgress = {
  display: CadAssemblyDisplay;
  key: string;
  revision: number;
  phase: AssemblyPreparationPhase;
  requestedAssetReads: number;
  completedAssetReads: number;
};

const assemblyPreparationOwners = new WeakMap<Object3D, Set<() => AssemblyPreparationProgress | undefined>>();

/** Requested-owner phase only: no committed-draw or presentation claim before first admission. */
export function captureRequestedGltfAssemblyPreparation(
  root: Object3D,
  requested: Readonly<{ display: CadAssemblyDisplay; key: string; revision: number }>,
): Readonly<Omit<AssemblyPreparationProgress, 'display' | 'key'>> | undefined {
  let matching: AssemblyPreparationProgress | undefined;
  for (const read of assemblyPreparationOwners.get(root) ?? []) {
    const progress = read();
    if (
      progress?.display === requested.display &&
      progress.key === requested.key &&
      progress.revision === requested.revision
    ) {
      if (matching) {
        return undefined;
      }
      matching = progress;
    }
  }
  return (
    matching && {
      revision: matching.revision,
      phase: matching.phase,
      requestedAssetReads: matching.requestedAssetReads,
      completedAssetReads: matching.completedAssetReads,
    }
  );
}

type ExactAssemblyCpuResources = Readonly<{ bufferCount: number; backingBytes: number; payloadBytes: number }>;

type LiveGltfAssemblyResourceInventory = Readonly<{
  key: string;
  presentationRevision: number;
  candidateSceneId: string;
  unitId: string;
  current: ExactAssemblyCpuResources;
  candidate?: ExactAssemblyCpuResources & Readonly<{ key: string; revision: number; sceneId: string; unitId: string }>;
  union: ExactAssemblyCpuResources;
  retiredOwnerCount: number;
}>;

type GltfAssemblyDrawCapture = Readonly<{
  display: CadAssemblyDisplay;
  metadata: AssemblyMetadata;
  key: string;
  presentationRevision: number;
  /** Inherent identity of the committed assembly scene; changes on camera/detail/residency replacement. */
  candidateSceneId: string;
  unitId: string;
  poseRevision: number;
  /** Actual committed identity-local assembly root world transform; metadata GLTF world to render world. */
  canonicalToRenderMatrix: readonly number[];
  surfaces: ReadonlyArray<
    Readonly<{
      componentId: string;
      objectId: number;
      /** Actual installed draw owner used by the existing measurement catalog, distinct from canonical component IDs. */
      objectUuid: string;
      instanceId?: number;
      drawMatrixWorld: readonly number[];
      canonicalRenderBounds: Readonly<{ min: readonly number[]; max: readonly number[] }>;
      drawGeometryId: string;
      canonicalGeometryId: string;
      materialIds: readonly string[];
      /** Current installed surface material opacity; excludes edge and emphasis helper inventories. */
      materialOpacities: readonly number[];
      canonicalBvhIdentity: unknown;
      drawTriangles: number;
      indexVersion?: number;
      attributeVersions: Readonly<Record<string, number>>;
      visible: boolean;
    }>
  >;
  edges: ReadonlyArray<
    Readonly<{
      objectId: number;
      matrixWorld: readonly number[];
      segments: ReadonlyArray<Readonly<{ componentId: string; first: number; count: number }>>;
      mandatoryTriangles: number;
      geometryId: string;
      positionVersions: Readonly<Record<string, number>>;
      positionBytes: number;
      colorBytes: number;
      visible: boolean;
    }>
  >;
  /** Revoked by candidate replacement, disposal or any new pose, including a return to identical coordinates. */
  isCurrent(): boolean;
}>;

type GltfInventoryObject = Object3D & {
  [committedGltfDrawInventory]?: () => GltfAssemblyDrawCapture | undefined;
  [liveGltfAssemblyResourceInventory]?: () => LiveGltfAssemblyResourceInventory | undefined;
  [armedGltfAssemblyAdmissionResourceInventory]?: (inventory: LiveGltfAssemblyResourceInventory) => void;
};

/** Explicit readonly debug capture of the actual mounted producer; never derives identity from names or extras. */
export function captureCommittedGltfDrawInventory(root: Object3D): GltfAssemblyDrawCapture | undefined {
  let capture: GltfAssemblyDrawCapture | undefined;
  root.traverse((object) => {
    if (capture) {
      return;
    }
    const owner: GltfInventoryObject = object;
    capture = owner[committedGltfDrawInventory]?.();
  });
  return capture;
}

/** On-demand owned CPU backing/range census; detached and retired presentations have no authority. */
export function captureLiveGltfAssemblyResourceInventory(
  root: Object3D,
): LiveGltfAssemblyResourceInventory | undefined {
  let capture: LiveGltfAssemblyResourceInventory | undefined;
  root.traverse((object) => {
    capture ??= (object as GltfInventoryObject)[liveGltfAssemblyResourceInventory]?.();
  });
  return capture;
}

/** Arm one private numeric observation on the actual current scene, without retaining that scene in the caller. */
export function armGltfAssemblyAdmissionResourceInventory(
  root: Object3D,
  sceneId: string,
  onAdmission: (inventory: LiveGltfAssemblyResourceInventory) => void,
): boolean {
  const owner: GltfInventoryObject | undefined = root.getObjectByProperty('uuid', sceneId);
  const current = owner?.[committedGltfDrawInventory]?.();
  if (!owner?.[liveGltfAssemblyResourceInventory] || current?.candidateSceneId !== sceneId || !current.isCurrent()) {
    return false;
  }
  owner[armedGltfAssemblyAdmissionResourceInventory] = onAdmission;
  return true;
}

/** Revoke an unconsumed test observation while its owning scene is still mounted. */
export function clearGltfAssemblyAdmissionResourceInventory(root: Object3D, sceneId: string): void {
  const owner: GltfInventoryObject | undefined = root.getObjectByProperty('uuid', sceneId);
  if (owner) {
    owner[armedGltfAssemblyAdmissionResourceInventory] = undefined;
  }
}

type PreparedGltfPresentation = {
  readonly revision: number;
  readonly key: string;
  readonly unitId: string;
  readonly scene: Group;
  readonly manifest: GeometryComponentManifest;
  readonly parser: SectionTopologyGltfParser | undefined;
  readonly originalMaterials: Map<number, Material | Material[]>;
  readonly resources: RetainedGltfResources;
  readonly definitions?: ReadonlyMap<string, PreparedGltfDefinition>;
  readonly assemblyMetadata?: Awaited<ReturnType<typeof validateAdmittedAssemblyGlb>>;
  readonly assemblyLayout?: PreparedAssemblyLayout;
  readonly assemblyDemand?: PreparedAssemblyDemand;
  readonly residentOccurrences?: ReadonlySet<string>;
  readonly detailSelections?: ReadonlyMap<string, boolean>;
  readonly detailCalibration?: Readonly<AssemblyDetailCalibration>;
  readonly validatedSourceBytes?: number;
  readonly metadataSerializedBytes?: number;
  assemblyResources?: GltfPresentationTelemetry['assemblyResources'];
  readonly assemblyFacade?: AdmittedAssembly;
  readonly assemblyPoseRevision?: number;
  readonly assemblyRenderFrameKey?: string;
  mountedRootWorld?: Matrix4;
  readonly sourceBindings?: ReadonlyMap<Object3D, GltfSectionSourceBinding>;
  readonly ownershipSignature?: string;
  readonly getMeasurementFeatures: ReturnType<typeof prepareGltfMetadata>['getMeasurementFeatures'];
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

/** Move only an exactly unchanged batch after React has detached the previous scene. */
function transferUnchangedAssemblyBatches(
  previous: PreparedGltfPresentation,
  current: PreparedGltfPresentation,
): boolean {
  const materialUses = (bundle: PreparedGltfPresentation): Map<Material, number> => {
    const uses = new Map<Material, number>();
    const add = (material: Material): void => {
      uses.set(material, (uses.get(material) ?? 0) + 1);
    };
    bundle.scene.traverse((object) => {
      for (const material of getObjectMaterials(object)) {
        add(material);
      }
    });
    for (const saved of bundle.originalMaterials.values()) {
      for (const material of getMaterials(saved)) {
        add(material);
      }
    }
    return uses;
  };
  const previousMaterialUses = materialUses(previous);
  const currentMaterialUses = materialUses(current);
  const byAttribute = new Map<InstancedBufferAttribute, InstancedMesh>();
  const ambiguous = new Set<InstancedBufferAttribute>();
  previous.scene.traverse((object) => {
    if (!(object instanceof InstancedMesh) || !getModelComponentInstanceSlots(object as Object3D)) {
      return;
    }
    const mesh = object as InstancedMesh;
    if (byAttribute.has(mesh.instanceMatrix)) {
      ambiguous.add(mesh.instanceMatrix);
    } else {
      byAttribute.set(mesh.instanceMatrix, mesh);
    }
  });
  const candidates: InstancedMesh[] = [];
  current.scene.traverse((object) => {
    if (object instanceof InstancedMesh && getModelComponentInstanceSlots(object as Object3D)) {
      candidates.push(object as InstancedMesh);
    }
  });
  let transferred = false;
  for (const candidate of candidates) {
    const old = byAttribute.get(candidate.instanceMatrix);
    const oldParent = old?.parent;
    const candidateParent = candidate.parent;
    if (
      !old ||
      ambiguous.has(candidate.instanceMatrix) ||
      !oldParent ||
      !candidateParent ||
      oldParent.parent !== previous.scene ||
      candidateParent.parent !== current.scene ||
      old.geometry !== candidate.geometry ||
      old.count !== candidate.count ||
      old.instanceColor !== null ||
      candidate.instanceColor !== null ||
      old.morphTexture !== null ||
      candidate.morphTexture !== null ||
      !old.matrix.equals(candidate.matrix) ||
      !oldParent.matrix.equals(candidateParent.matrix) ||
      !previous.scene.matrix.equals(current.scene.matrix) ||
      old.visible !== candidate.visible ||
      oldParent.visible !== candidateParent.visible ||
      old.layers.mask !== candidate.layers.mask ||
      oldParent.layers.mask !== candidateParent.layers.mask ||
      old.renderOrder !== candidate.renderOrder ||
      old.castShadow !== candidate.castShadow ||
      old.receiveShadow !== candidate.receiveShadow ||
      old.frustumCulled !== candidate.frustumCulled ||
      old.raycast !== candidate.raycast ||
      old.onBeforeRender !== candidate.onBeforeRender ||
      old.onAfterRender !== candidate.onAfterRender ||
      previous.sourceBindings?.has(old) === true ||
      current.sourceBindings?.has(candidate) === true
    ) {
      continue;
    }
    const oldParentOwner = getModelComponentOwner(oldParent);
    const candidateParentOwner = getModelComponentOwner(candidateParent);
    if (
      oldParentOwner?.unitId !== candidateParentOwner?.unitId ||
      oldParentOwner?.componentId !== candidateParentOwner?.componentId
    ) {
      continue;
    }
    const oldSlots = getModelComponentInstanceSlots(old);
    const candidateSlots = getModelComponentInstanceSlots(candidate);
    if (
      !oldSlots ||
      !candidateSlots ||
      oldSlots.length !== candidateSlots.length ||
      oldSlots.some((slot, index) => {
        const next = candidateSlots[index];
        const oldFeature = slot.measurementFeatures as GltfMeasurementFeatures | undefined;
        const nextFeature = next?.measurementFeatures as GltfMeasurementFeatures | undefined;
        return (
          !next ||
          slot.owner.unitId !== next.owner.unitId ||
          slot.owner.componentId !== next.owner.componentId ||
          slot.sourceObject !== next.sourceObject ||
          Boolean(oldFeature) !== Boolean(nextFeature) ||
          (oldFeature !== undefined &&
            (oldFeature.componentId !== nextFeature?.componentId ||
              oldFeature.occurrenceId !== nextFeature.occurrenceId ||
              oldFeature.kind !== nextFeature.kind ||
              oldFeature.primitive !== nextFeature.primitive ||
              oldFeature.faces !== nextFeature.faces ||
              oldFeature.edges !== nextFeature.edges)) ||
          slot.sourceBinding?.parser !== next.sourceBinding?.parser ||
          slot.sourceBinding?.occurrenceId !== next.sourceBinding?.occurrenceId
        );
      })
    ) {
      continue;
    }
    const oldDataKeys = Object.keys(old.userData);
    if (
      oldDataKeys.length !== Object.keys(candidate.userData).length ||
      oldDataKeys.some((key) => !Object.is(old.userData[key], candidate.userData[key]))
    ) {
      continue;
    }
    if (Array.isArray(old.material) || Array.isArray(candidate.material)) {
      continue;
    }
    const oldOriginal = previous.originalMaterials.get(old.id);
    const candidateOriginal = current.originalMaterials.get(candidate.id);
    if (
      !oldOriginal ||
      !candidateOriginal ||
      Array.isArray(oldOriginal) ||
      Array.isArray(candidateOriginal) ||
      old.material === candidate.material ||
      old.material === oldOriginal ||
      old.material === candidateOriginal ||
      oldOriginal === candidate.material ||
      oldOriginal === candidateOriginal ||
      candidate.material === candidateOriginal ||
      previousMaterialUses.get(old.material) !== 1 ||
      previousMaterialUses.get(oldOriginal) !== 1 ||
      currentMaterialUses.get(candidate.material) !== 1 ||
      currentMaterialUses.get(candidateOriginal) !== 1
    ) {
      continue;
    }
    const oldKey = qualifiedGltfSurfaceMaterialKey(old.material);
    const candidateKey = qualifiedGltfSurfaceMaterialKey(candidate.material);
    qualifyGltfSurfaceMaterial(oldOriginal);
    qualifyGltfSurfaceMaterial(candidateOriginal);
    const oldOriginalKey = qualifiedGltfSurfaceMaterialKey(oldOriginal);
    const candidateOriginalKey = qualifiedGltfSurfaceMaterialKey(candidateOriginal);
    if (
      oldKey === undefined ||
      candidateKey === undefined ||
      oldOriginalKey === undefined ||
      candidateOriginalKey === undefined ||
      oldKey !== candidateKey ||
      oldOriginalKey !== candidateOriginalKey
    ) {
      continue;
    }
    // One scene parent at a time. The previous scene is detached before this layout effect.
    candidateParent.remove(candidate);
    oldParent.remove(old);
    candidateParent.add(old);
    previous.originalMaterials.delete(old.id);
    current.originalMaterials.delete(candidate.id);
    current.originalMaterials.set(old.id, oldOriginal);
    for (const material of [old.material, oldOriginal]) {
      previous.resources.owned.delete(material);
      previous.resources.released.add(material);
      current.resources.owned.add(material);
    }
    for (const material of new Set([candidate.material, candidateOriginal])) {
      current.resources.owned.delete(material);
      material.dispose();
    }
    // Both candidate and predecessor point at the borrowed attribute. Dispose only
    // the candidate object's empty replacement binding, never the live GPU buffer.
    const retainedAttribute = candidate.instanceMatrix;
    candidate.instanceMatrix = new InstancedBufferAttribute(new Float32Array(0), 16);
    candidate.dispose();
    byAttribute.delete(retainedAttribute);
    transferred = true;
  }
  return transferred;
}

/** Rebind the post-commit owner after its captured placeholder sources were replaced. */
function rebindCommittedAssemblySurfaceBatches(
  bundle: PreparedGltfPresentation,
  {
    backend,
    resolution,
    sectionClip,
  }: Readonly<{
    backend: ReturnType<typeof useThreeGraphicsBackend>;
    resolution: Vector2;
    sectionClip: Parameters<typeof installSectionClip>[1];
  }>,
): void {
  bundle.surfaceBatches.dispose();
  const inventory = getComponentInventory(bundle.scene);
  bundle.surfaceBatches = createGltfSurfaceBatches(
    bundle.scene,
    inventory.filter((object) => isSurfaceObject(object)),
    {
      sources: inventory.filter((object): object is Mesh => isFatLineSegmentsMesh(object)),
      backend,
      resolution,
      prepareMaterial: (material) => {
        installSectionClip(material, sectionClip);
      },
    },
  );
  if (bundle.assemblyResources) {
    const previous = bundle.assemblyResources;
    const measured = countAssemblyResources(bundle, undefined, { queuedPreparationCount: 0 });
    bundle.assemblyResources = {
      ...measured,
      preparedSourceBufferCount: previous.preparedSourceBufferCount,
      preparedSourcePayloadBytes: previous.preparedSourcePayloadBytes,
      currentAndCandidateExactBufferCpuBytes: Math.max(
        measured.currentAndCandidateExactBufferCpuBytes,
        previous.currentAndCandidateExactBufferCpuBytes,
      ),
      currentAndCandidateExactBufferCount: Math.max(
        measured.currentAndCandidateExactBufferCount,
        previous.currentAndCandidateExactBufferCount,
      ),
      currentAndCandidateExactPayloadCpuBytes: Math.max(
        measured.currentAndCandidateExactPayloadCpuBytes,
        previous.currentAndCandidateExactPayloadCpuBytes,
      ),
      currentAndCandidateBytesEstimate: Math.max(
        measured.currentAndCandidateBytesEstimate,
        previous.currentAndCandidateBytesEstimate,
      ),
    };
  }
}

/** Count actual unique resources without treating occurrence clones as additional immutable allocations. */
function countAssemblyResources(
  bundle: PreparedGltfPresentation,
  previous: PreparedGltfPresentation | undefined,
  {
    queuedPreparationCount,
    retired = [],
    sourceBytes,
    resourceBudget,
    onBudgetInventory,
  }: Readonly<{
    queuedPreparationCount: number;
    retired?: readonly PreparedGltfPresentation[];
    sourceBytes?: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
    resourceBudget?: GltfMeshDisplayProperties['assemblyResourceBudget'];
    onBudgetInventory?: (cpuBytes: number, gpuBytes: number) => void;
  }>,
): NonNullable<GltfPresentationTelemetry['assemblyResources']> {
  const presentations = [...new Set([bundle, previous, ...retired])].filter(
    (value): value is PreparedGltfPresentation => value !== undefined && !value.disposed,
  );
  const inventory = (values: readonly PreparedGltfPresentation[]) => {
    const geometries = new Set<BufferGeometry>();
    const textures = new Set<Texture>();
    const materials = new Set<Material>();
    const compressedBuffers = new Set<ArrayBufferLike>();
    const geometryBuffers = new Set<ArrayBufferLike>();
    const parserBuffers = new Set<ArrayBufferLike>();
    const preparedSourceBuffers = new Set<ArrayBufferLike>();
    const fullPayloadBuffers = new Set<ArrayBufferLike>();
    const payloadRanges = new Map<ArrayBufferLike, Array<readonly [number, number]>>();
    const compressedPayloadRanges = new Map<ArrayBufferLike, Array<readonly [number, number]>>();
    const sourcePayloadRanges = new Map<ArrayBufferLike, Array<readonly [number, number]>>();
    const edgePayloadRanges = new Map<ArrayBufferLike, Array<readonly [number, number]>>();
    const texturePayloadRanges = new Map<ArrayBufferLike, Array<readonly [number, number]>>();
    const capturePayload = (
      view: ArrayBufferView,
      rangesByBuffer: Map<ArrayBufferLike, Array<readonly [number, number]>>,
    ): void => {
      const ranges = rangesByBuffer.get(view.buffer) ?? [];
      ranges.push([view.byteOffset, view.byteOffset + view.byteLength]);
      rangesByBuffer.set(view.buffer, ranges);
    };
    if (values === presentations) {
      for (const bytes of sourceBytes?.values() ?? []) {
        preparedSourceBuffers.add(bytes.buffer);
        capturePayload(bytes, sourcePayloadRanges);
      }
    }
    const parsedInventories = new Set<ParsedGltfInventory>();
    const parserGeometries = new Set<BufferGeometry>();
    const parserTextures = new Set<Texture>();
    const closedImages = new Set<ClosableTextureImage>();
    const ownedImages = new Set<ClosableTextureImage>();
    const gpuAttributes = new Set<unknown>();
    const textureImageOwners = new Set<unknown>();
    const textureTypedBuffers = new Set<ArrayBufferLike>();
    let textureTypedViewBytes = 0;
    const instanceBuffers = new Set<ArrayBufferLike>();
    const detailGeometries = new Set<BufferGeometry>();
    const detailGpuAttributes = new Set<unknown>();
    const edgeBuffers = new Set<ArrayBufferLike>();
    const edgeGpuAttributes = new Set<unknown>();
    const detailDecisions = new Set<ReadonlyMap<string, boolean>>();
    let detailDecisionSerializedBytes = 0;
    let detailUploadGpuBytesEstimate = 0;
    let edgeGpuBytesEstimate = 0;
    let surfaceBatchCount = 0;
    let edgeBatchCount = 0;
    let wrapperObjectCount = 0;
    let canonicalSurfaceTriangleCount = 0;
    let detailSurfaceTriangleCount = 0;
    let mandatoryEdgeTriangleCount = 0;
    let instanceAttributeGpuBytesEstimate = 0;
    let instanceSlotDescriptorsSerializedBytes = 0;
    const sourceFacades = new Set<AdmittedAssembly>();
    const metadataInventories = new Set<AssemblyMetadata>();
    const demandInventories = new Set<PreparedAssemblyDemand>();
    let demandIndexCpuBytes = 0;
    let demandDescriptorsSerializedBytes = 0;
    const bvhTrees = new Set<unknown>();
    let geometryGpuBytesEstimate = 0;
    let bvhBytesEstimate = 0;
    let bvhTreesWithUnknownSize = 0;
    let textureCpuBytesEstimate = 0;
    let textureGpuBytesEstimate = 0;
    let texturesWithUnknownSize = 0;
    let sceneObjectCount = 0;
    let validatedSourceBytes = 0;
    let metadataSerializedBytes = 0;
    let parserJsonSerializedBytes = 0;
    let parserObjectCount = 0;
    const captureSceneObject = (object: Object3D): void => {
      sceneObjectCount += 1;
      if (object instanceof Group) {
        wrapperObjectCount++;
      }
      if (isSurfaceObject(object)) {
        const triangles =
          Math.floor((object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3) *
          (object instanceof InstancedMesh ? object.count : 1);
        if (detailGeometries.has(object.geometry)) {
          detailSurfaceTriangleCount += triangles;
        } else {
          canonicalSurfaceTriangleCount += triangles;
        }
      }
      const edgePositions = getGltfFatLinePositions(object);
      const edgeGeometry: unknown = 'geometry' in object ? object.geometry : undefined;
      if (edgePositions && isGltfBufferGeometry(edgeGeometry)) {
        edgeBatchCount += getGltfOccurrenceEdgeBatch(object) ? 1 : 0;
        mandatoryEdgeTriangleCount +=
          Math.floor((edgeGeometry.index?.count ?? edgeGeometry.attributes['position']?.count ?? 0) / 3) *
          (edgePositions.length / 6);
        for (const attribute of [
          ...Object.values(edgeGeometry.attributes),
          ...(edgeGeometry.index ? [edgeGeometry.index] : []),
        ]) {
          const owner = 'data' in attribute ? attribute.data : attribute;
          edgeBuffers.add(owner.array.buffer);
          capturePayload(owner.array, edgePayloadRanges);
          if (!edgeGpuAttributes.has(owner)) {
            edgeGpuAttributes.add(owner);
            edgeGpuBytesEstimate += owner.array.byteLength;
          }
        }
      }
      if (object instanceof InstancedMesh) {
        surfaceBatchCount++;
        instanceSlotDescriptorsSerializedBytes += getModelComponentInstanceDescriptorBytes(object);
        for (const attribute of [object.instanceMatrix, ...(object.instanceColor ? [object.instanceColor] : [])]) {
          instanceBuffers.add(attribute.array.buffer);
          capturePayload(attribute.array, payloadRanges);
          // WebGPU InstanceNode may allocate a distinct upload wrapper per draw object even for
          // the same CPU attribute. Count each draw owner conservatively; backend binding bytes remain unmeasured.
          instanceAttributeGpuBytesEstimate += attribute.array.byteLength;
        }
      }
    };
    for (const value of values) {
      if (value.detailSelections && !detailDecisions.has(value.detailSelections)) {
        detailDecisions.add(value.detailSelections);
        detailDecisionSerializedBytes += new TextEncoder().encode(
          canonicalJson([...value.detailSelections]),
        ).byteLength;
      }
      if (value.assemblyDemand && !demandInventories.has(value.assemblyDemand)) {
        demandInventories.add(value.assemblyDemand);
        demandIndexCpuBytes += value.assemblyDemand.index.byteLength;
        demandDescriptorsSerializedBytes += value.assemblyDemand.serializedBytes;
      }
      if (value.assemblyFacade && !sourceFacades.has(value.assemblyFacade)) {
        sourceFacades.add(value.assemblyFacade);
        // Known validated source inputs only. The actual reader has no asset byte cache;
        // its all-variant verification, target copy and transport/FS transients remain an unmeasured allowance.
        validatedSourceBytes += value.validatedSourceBytes ?? 0;
        if (value.assemblyMetadata && !metadataInventories.has(value.assemblyMetadata)) {
          metadataInventories.add(value.assemblyMetadata);
          metadataSerializedBytes += value.metadataSerializedBytes ?? 0;
        }
      }
      for (const image of value.resources.closedImages) {
        closedImages.add(image);
      }
      for (const image of value.resources.ownedImages) {
        ownedImages.add(image);
      }
      const resources = collectGltfResources(value.scene, value.originalMaterials);
      for (const resource of value.resources.owned) {
        if (!value.resources.borrowed.has(resource) && !value.resources.released.has(resource)) {
          resources.add(resource);
        }
      }
      for (const definition of value.definitions?.values() ?? []) {
        compressedBuffers.add(definition.bytes.buffer);
        capturePayload(definition.bytes, payloadRanges);
        capturePayload(definition.bytes, compressedPayloadRanges);
        if (!parsedInventories.has(definition.parsedInventory)) {
          parsedInventories.add(definition.parsedInventory);
          parserJsonSerializedBytes += definition.parsedInventory.jsonSerializedBytes;
          parserObjectCount += definition.parsedInventory.objectCount;
          for (const buffer of definition.parsedInventory.buffers) {
            parserBuffers.add(buffer);
            fullPayloadBuffers.add(buffer);
          }
          for (const resource of definition.parsedInventory.resources) {
            if (isGltfBufferGeometry(resource)) {
              parserGeometries.add(resource);
            } else if (isGltfTexture(resource)) {
              parserTextures.add(resource);
            }
          }
        }
        for (const resource of definition.immutableResources) {
          resources.add(resource);
        }
        for (const primitive of definition.primitives) {
          if (primitive.detail) {
            resources.add(primitive.detail.geometry);
            detailGeometries.add(primitive.detail.geometry);
          }
        }
      }
      for (const resource of resources) {
        if (isGltfBufferGeometry(resource)) {
          geometries.add(resource);
        } else if (isGltfTexture(resource)) {
          textures.add(resource);
        } else if (isGltfMaterial(resource)) {
          materials.add(resource);
        }
      }
      value.scene.traverse(captureSceneObject);
    }
    for (const geometry of geometries) {
      const attributes = [
        ...Object.values(geometry.attributes),
        ...(geometry.index ? [geometry.index] : []),
        ...Object.values(geometry.morphAttributes).flat(),
      ];
      for (const attribute of attributes) {
        const owner = 'data' in attribute ? attribute.data : attribute;
        geometryBuffers.add(owner.array.buffer);
        capturePayload(owner.array, payloadRanges);
        if (!gpuAttributes.has(owner)) {
          gpuAttributes.add(owner);
          geometryGpuBytesEstimate += owner.array.byteLength;
        }
        if (detailGeometries.has(geometry) && !detailGpuAttributes.has(owner)) {
          detailGpuAttributes.add(owner);
          detailUploadGpuBytesEstimate += owner.array.byteLength;
        }
      }
    }
    for (const geometry of parserGeometries) {
      for (const attribute of [
        ...Object.values(geometry.attributes),
        ...(geometry.index ? [geometry.index] : []),
        ...Object.values(geometry.morphAttributes).flat(),
      ]) {
        const owner = 'data' in attribute ? attribute.data : attribute;
        geometryBuffers.add(owner.array.buffer);
        capturePayload(owner.array, payloadRanges);
      }
    }
    for (const geometry of new Set([...geometries, ...parserGeometries])) {
      const cached = getCachedBvh(geometry);
      if (cached) {
        bvhTrees.add(cached);
      }
      if (geometry.boundsTree) {
        bvhTrees.add(geometry.boundsTree);
      }
    }
    for (const tree of bvhTrees) {
      // The installed estimator walks a known tree's object graph, including shared geometry.
      // This is a rough allowance, not an exact additional-buffer or browser-heap measurement.
      if (tree instanceof BVH) {
        bvhBytesEstimate += estimateMemoryInBytes(tree);
      } else {
        bvhTreesWithUnknownSize += 1;
      }
    }
    for (const texture of new Set([...textures, ...parserTextures])) {
      const image: unknown = texture.source.data;
      if (textureImages(texture).some((value) => closedImages.has(value))) {
        continue;
      }
      if (
        typeof image !== 'object' ||
        image === null ||
        !('width' in image) ||
        !('height' in image) ||
        typeof image.width !== 'number' ||
        typeof image.height !== 'number' ||
        !Number.isFinite(image.width) ||
        !Number.isFinite(image.height) ||
        image.width <= 0 ||
        image.height <= 0
      ) {
        texturesWithUnknownSize += 1;
        continue;
      }
      const data = 'data' in image ? image.data : undefined;
      const pixelBytes = ArrayBuffer.isView(data) ? data.byteLength : image.width * image.height * 4;
      if (!textureImageOwners.has(image)) {
        textureImageOwners.add(image);
        textureCpuBytesEstimate += pixelBytes;
        if (ArrayBuffer.isView(data)) {
          textureTypedBuffers.add(data.buffer);
          capturePayload(data, texturePayloadRanges);
          textureTypedViewBytes += pixelBytes;
        }
      }
      if (textures.has(texture)) {
        textureGpuBytesEstimate += Math.ceil(pixelBytes * (texture.generateMipmaps ? 4 / 3 : 1));
      }
    }
    for (const image of ownedImages) {
      if (closedImages.has(image) || textureImageOwners.has(image)) {
        continue;
      }
      if (
        'width' in image &&
        'height' in image &&
        typeof image.width === 'number' &&
        typeof image.height === 'number' &&
        Number.isFinite(image.width) &&
        Number.isFinite(image.height) &&
        image.width > 0 &&
        image.height > 0
      ) {
        textureImageOwners.add(image);
        textureCpuBytesEstimate += image.width * image.height * 4;
      } else {
        texturesWithUnknownSize += 1;
      }
    }
    const sumBytes = (buffers: ReadonlySet<ArrayBufferLike>): number =>
      [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0);
    const sumPayload = (
      buffers: ReadonlySet<ArrayBufferLike>,
      rangesByBuffer: ReadonlyMap<ArrayBufferLike, Array<readonly [number, number]>>,
      fullBuffers?: ReadonlySet<ArrayBufferLike>,
    ): number => {
      let payloadBytes = 0;
      for (const buffer of buffers) {
        const ranges = rangesByBuffer.get(buffer);
        if (!ranges || fullBuffers?.has(buffer)) {
          payloadBytes += buffer.byteLength;
          continue;
        }
        let end = 0;
        for (const [start, stop] of ranges.toSorted((left, right) => left[0] - right[0])) {
          payloadBytes += Math.max(0, stop - Math.max(start, end));
          end = Math.max(end, stop);
        }
      }
      return payloadBytes;
    };
    const geometryCpuBytes = sumBytes(geometryBuffers);
    const residentCompressedBytes = sumBytes(compressedBuffers);
    const parsedDependencyCpuBytes = sumBytes(parserBuffers);
    const instanceAttributeCpuBytes = sumBytes(instanceBuffers);
    const residentBuffers = new Set([...compressedBuffers, ...geometryBuffers, ...parserBuffers, ...instanceBuffers]);
    const residentCpuBytes = sumBytes(residentBuffers);
    if (resourceBudget && values === presentations) {
      const exactCpuBuffers = new Set([
        ...compressedBuffers,
        ...geometryBuffers,
        ...parserBuffers,
        ...instanceBuffers,
        ...textureTypedBuffers,
      ]);
      for (const bytes of sourceBytes?.values() ?? []) {
        exactCpuBuffers.add(bytes.buffer);
      }
      for (const demand of demandInventories) {
        for (const array of [
          demand.index.bounds,
          demand.index.children,
          demand.index.ranges,
          demand.index.order,
          demand.index.parents,
        ]) {
          exactCpuBuffers.add(array.buffer);
        }
      }
      const accountedCpuBytes =
        sumBytes(exactCpuBuffers) +
        textureCpuBytesEstimate -
        textureTypedViewBytes +
        bvhBytesEstimate +
        3 *
          (metadataSerializedBytes +
            demandDescriptorsSerializedBytes +
            parserJsonSerializedBytes +
            instanceSlotDescriptorsSerializedBytes +
            detailDecisionSerializedBytes);
      const reservedGpuBytes = geometryGpuBytesEstimate + instanceAttributeGpuBytesEstimate + textureGpuBytesEstimate;
      onBudgetInventory?.(accountedCpuBytes, reservedGpuBytes);
      if (accountedCpuBytes > resourceBudget.cpuBytes || reservedGpuBytes > resourceBudget.gpuBytes) {
        throw new RangeError('Assembly current/candidate resources exceed the private CPU/GPU budget');
      }
    }
    return {
      validatedSourceBytes,
      preparedSourceBufferCount: preparedSourceBuffers.size,
      preparedSourcePayloadBytes: sumPayload(preparedSourceBuffers, sourcePayloadRanges),
      residentCompressedBytes,
      residentCompressedBufferCount: compressedBuffers.size,
      residentCompressedPayloadBytes: sumPayload(compressedBuffers, compressedPayloadRanges),
      geometryCpuBytes,
      geometryGpuBytesEstimate,
      instanceAttributeCpuBytes,
      instanceAttributeGpuBytesEstimate,
      exactResidentBufferCpuBytes: residentCpuBytes,
      exactResidentBufferCount: residentBuffers.size,
      exactResidentPayloadCpuBytes: sumPayload(residentBuffers, payloadRanges, fullPayloadBuffers),
      detailGeometryCount: detailGeometries.size,
      detailUploadGpuBytesEstimate,
      detailDecisionSerializedBytes,
      edgeCpuBytes: sumBytes(edgeBuffers),
      edgeBufferCount: edgeBuffers.size,
      edgePayloadBytes: sumPayload(edgeBuffers, edgePayloadRanges),
      edgeGpuBytesEstimate,
      surfaceBatchCount,
      edgeBatchCount,
      wrapperObjectCount,
      canonicalSurfaceTriangleCount,
      detailSurfaceTriangleCount,
      mandatoryEdgeTriangleCount,
      instanceSlotDescriptorsSerializedBytes,
      textureCpuBytesEstimate,
      textureTypedBufferCount: textureTypedBuffers.size,
      textureTypedPayloadBytes: sumPayload(textureTypedBuffers, texturePayloadRanges),
      textureGpuBytesEstimate,
      texturesWithUnknownSize,
      bvhTreeCount: bvhTrees.size,
      bvhTreesWithUnknownSize,
      bvhBytesEstimate,
      metadataSerializedBytes,
      demandIndexCpuBytes,
      demandDescriptorsSerializedBytes,
      parserJsonSerializedBytes,
      parsedDependencyCpuBytes,
      parserObjectCount,
      sceneObjectCount,
      materialCount: materials.size,
      totalBytesEstimate:
        validatedSourceBytes +
        residentCpuBytes +
        geometryGpuBytesEstimate +
        instanceAttributeGpuBytesEstimate +
        instanceSlotDescriptorsSerializedBytes +
        detailDecisionSerializedBytes +
        textureCpuBytesEstimate +
        textureGpuBytesEstimate +
        bvhBytesEstimate +
        metadataSerializedBytes +
        demandIndexCpuBytes +
        demandDescriptorsSerializedBytes +
        parserJsonSerializedBytes,
    };
  };
  const candidateInventory =
    presentations.length === 1 && presentations[0] === bundle ? undefined : inventory([bundle]);
  const overlap = inventory(presentations);
  const { totalBytesEstimate, ...candidate } = candidateInventory ?? overlap;
  return {
    ...candidate,
    preparedSourceBufferCount: overlap.preparedSourceBufferCount,
    preparedSourcePayloadBytes: overlap.preparedSourcePayloadBytes,
    detailCalibration: bundle.detailCalibration,
    /** Known resource inventories only; these allowances have no defensible numeric bound yet. */
    unmeasuredInventory: [
      'reader all-variant verification, target copy, transport and filesystem transients',
      'queued reader/source-validation bytes before candidate inventory creation',
      'simplifier retained WASM heap and temporary input/output buffers',
      'backend instance wrapper, binding, upload and driver overlap',
      'Three scene/material/parser, canonical metadata/map and admitted publication heap',
      'measurement/section worker and external emphasis proxy buffers',
    ],
    currentAndCandidateExactBufferCpuBytes: overlap.exactResidentBufferCpuBytes,
    currentAndCandidateExactBufferCount: overlap.exactResidentBufferCount,
    currentAndCandidateExactPayloadCpuBytes: overlap.exactResidentPayloadCpuBytes,
    currentAndCandidateBytesEstimate: Math.max(totalBytesEstimate, overlap.totalBytesEstimate),
    definitionCount: bundle.definitions?.size ?? 0,
    residentOccurrenceCount: bundle.residentOccurrences?.size ?? 0,
    queuedPreparationCount,
  };
}

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

    if (
      object instanceof InstancedMesh ? !getModelComponentInstanceSlots(object)?.length : !getObjectComponentId(object)
    ) {
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
  return hit
    ? hit.object instanceof InstancedMesh
      ? getModelComponentHitOwner(hit)?.componentId
      : getObjectComponentId(hit.object)
    : undefined;
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
        counts.triangleCount +=
          Math.floor((object.geometry.getIndex()?.count ?? object.geometry.getAttribute('position').count) / 3) *
          (object instanceof InstancedMesh ? object.count : 1);
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
  const hoverInstances: ModelEmphasisInstanceSelection[] = [];
  const selectedInstances: ModelEmphasisInstanceSelection[] = [];

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
    const batch = getGltfOccurrenceEdgeBatch(object);
    if (batch) {
      object.visible = enableLines;
      const colors = new Map<string, number>();
      for (const span of batch.segments) {
        const emphasis = resolveModelComponentEmphasisWithManifest(
          emphasisComponents,
          componentManifest,
          span.componentId,
        );
        if (emphasis !== 'none') {
          colors.set(span.componentId, emphasis === 'hover' ? gltfEdgeHoverColor : gltfEdgeSelectedColor);
        }
      }
      batch.setColors(colors);
      continue;
    }
    if (isGltfInstancedMesh(object)) {
      const slots = getModelComponentInstanceSlots(object);
      if (!slots) {
        object.visible = false;
        continue;
      }
      object.visible = enableSurfaces;
      const hoverIds: number[] = [];
      const selectedIds: number[] = [];
      for (const [instanceId, slot] of slots.entries()) {
        const emphasis = resolveModelComponentEmphasisWithManifest(
          emphasisComponents,
          componentManifest,
          slot.owner.componentId,
        );
        if (emphasis === 'hover') {
          hoverIds.push(instanceId);
        } else if (emphasis !== 'none') {
          selectedIds.push(instanceId);
        }
      }
      if (hoverIds.length > 0) {
        hoverInstances.push({ source: object, instanceIds: hoverIds, slots: hoverIds.map((id) => slots[id]!) });
      }
      if (selectedIds.length > 0) {
        selectedInstances.push({
          source: object,
          instanceIds: selectedIds,
          slots: selectedIds.map((id) => slots[id]!),
        });
      }
      continue;
    }
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

  return { hover, selected, hoverInstances, selectedInstances };
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
  assemblyDisplay,
  assemblyDetailPolicy: explicitAssemblyDetailPolicy,
  assemblyResourceBudget = defaultAssemblyResourceBudget,
  sourceFile,
  geometryHash,
  presentationRevision = 0,
  enableMatcap = false,
  enableSurfaces = true,
  enableLines = true,
  onModelComponentSecondaryPointerCandidate,
}: GltfMeshDisplayProperties): React.JSX.Element | undefined {
  const graphicsActor = useGraphics();
  const calibratedAssemblyDetailPolicy = useGraphicsSelector((snapshot) => snapshot.context.assemblyDetailCalibration);
  const assemblyDetailPolicy = explicitAssemblyDetailPolicy ?? calibratedAssemblyDetailPolicy;
  const graphicsBackendThree = useThreeGraphicsBackend();
  const sectionClip = useSectionClip();
  const sectionView = useSectionViewFlags();
  const cameraRig = useCameraRig();
  const kinematicsRef = useKinematicsRef();
  const renderFrame = useRenderFrame();
  const assemblyRenderFrame = assemblyDisplay ? renderFrame : undefined;
  const assemblyRenderFrameKey = assemblyRenderFrame
    ? JSON.stringify([
        assemblyRenderFrame.anchorFrameId,
        assemblyRenderFrame.originMeters,
        assemblyRenderFrame.metersPerRenderUnit,
      ])
    : undefined;
  const assetMatrix = useMemo(() => createCanonicalGltfToTauMatrix(), []);
  const [presentation, setPresentation] = useState<PreparedGltfPresentation | undefined>();
  const [assemblyDemandRevision, setAssemblyDemandRevision] = useState(0);
  const assemblyDemandRef = useRef<ReadonlySet<string> | undefined>(undefined);
  const committedPresentationRef = useRef<PreparedGltfPresentation | undefined>(undefined);
  const preparationStats = useRef({
    activeParses: 0,
    activeParseHighWaterMark: 0,
    parsesStarted: 0,
    parsesDiscarded: 0,
    committedBundleHighWaterMark: 0,
    candidateBundleHighWaterMark: 0,
  });
  const candidatePresentationRef = useRef<PreparedGltfPresentation | undefined>(undefined);
  const preparationProgressRef = useRef<AssemblyPreparationProgress | undefined>(undefined);
  const preparationInFlightRef = useRef<Promise<void> | undefined>(undefined);
  const latestPreparationRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const retiredPresentationsRef = useRef<PreparedGltfPresentation[]>([]);
  const frameProbeRef = useRef<{ revision: number; modelEmptyFrames: number } | undefined>(undefined);
  const [topologyScheduler] = useState(createSectionTopologyScheduler);
  const { size, invalidate, scene: rootScene, camera } = useThree();
  useLayoutEffect(() => {
    if (!assemblyDisplay) {
      return;
    }
    const readers =
      assemblyPreparationOwners.get(rootScene) ?? new Set<() => AssemblyPreparationProgress | undefined>();
    const read = () => preparationProgressRef.current;
    readers.add(read);
    assemblyPreparationOwners.set(rootScene, readers);
    return () => {
      readers.delete(read);
      if (readers.size === 0) {
        assemblyPreparationOwners.delete(rootScene);
      }
      if (preparationProgressRef.current?.display === assemblyDisplay) {
        preparationProgressRef.current = undefined;
      }
    };
  }, [assemblyDisplay, rootScene]);
  const assemblyCamera = assemblyDisplay ? camera : undefined;
  const assemblyCameraStateRef = useRef<string | undefined>(undefined);
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
  const drainPreparations = useCallback(function runPreparations(): void {
    if (preparationInFlightRef.current) {
      return;
    }
    const prepareQueued = async (): Promise<void> => {
      await Promise.resolve();
      try {
        while (latestPreparationRef.current) {
          const prepare = latestPreparationRef.current;
          latestPreparationRef.current = undefined;
          // oxlint-disable-next-line no-await-in-loop -- One candidate is allocated at a time; newer requests replace the single pending request.
          await prepare();
        }
      } catch (error) {
        console.error('Failed to prepare GLTF:', error);
      } finally {
        preparationInFlightRef.current = undefined;
        if (latestPreparationRef.current) {
          runPreparations();
        }
      }
    };
    preparationInFlightRef.current = prepareQueued();
  }, []);

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
  const isCameraDragHoverSuppressed = useGraphicsSelector((state) =>
    state.context.viewerHoverSuppressionReasons.includes('cameraControls'),
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
  const assemblyStyle = useMemo(
    () =>
      assemblyDisplay
        ? JSON.stringify([
            modelVisualState.hiddenComponentIds,
            modelVisualState.isolatedComponentIds,
            modelVisualState.focusedComponentId,
            modelVisualState.opacityByComponentId,
          ])
        : undefined,
    [
      assemblyDisplay,
      modelVisualState.hiddenComponentIds,
      modelVisualState.isolatedComponentIds,
      modelVisualState.focusedComponentId,
      modelVisualState.opacityByComponentId,
    ],
  );
  const assemblyPreparationKey = assemblyDisplay ? `${assemblyDemandRevision}:${assemblyStyle}` : undefined;
  const latestAssemblyPreparationKeyRef = useRef(assemblyPreparationKey);
  useLayoutEffect(() => {
    latestAssemblyPreparationKeyRef.current = assemblyPreparationKey;
  }, [assemblyPreparationKey]);
  const assemblyPriorityIds = useMemo(
    () =>
      assemblyDisplay
        ? new Set([
            ...modelVisualState.selectedComponentIds,
            ...(modelVisualState.focusedComponentId ? [modelVisualState.focusedComponentId] : []),
          ])
        : undefined,
    [assemblyDisplay, modelVisualState.selectedComponentIds, modelVisualState.focusedComponentId],
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

  const sourceUpdaterRef = useRef<KinematicsSourceUpdater | undefined>(undefined);
  const receiveSourceUpdater = useCallback((updater: KinematicsSourceUpdater | undefined) => {
    sourceUpdaterRef.current = updater;
  }, []);
  const handleKinematicsPointerDown = useKinematicsViewer({
    unitId,
    scene,
    manifest: componentManifest,
    getPickableMeshes: getModelPickableMeshes,
    onSourceUpdater: receiveSourceUpdater,
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
      if (bundle.assemblyFacade) {
        const measured = countAssemblyResources(bundle, undefined, {
          queuedPreparationCount: latestPreparationRef.current ? 1 : 0,
        });
        bundle.assemblyResources = {
          ...measured,
          preparedSourceBufferCount: Math.max(
            measured.preparedSourceBufferCount,
            bundle.assemblyResources?.preparedSourceBufferCount ?? 0,
          ),
          preparedSourcePayloadBytes: Math.max(
            measured.preparedSourcePayloadBytes,
            bundle.assemblyResources?.preparedSourcePayloadBytes ?? 0,
          ),
          currentAndCandidateExactBufferCpuBytes: Math.max(
            measured.currentAndCandidateExactBufferCpuBytes,
            bundle.assemblyResources?.currentAndCandidateExactBufferCpuBytes ?? 0,
          ),
          currentAndCandidateExactBufferCount: Math.max(
            measured.currentAndCandidateExactBufferCount,
            bundle.assemblyResources?.currentAndCandidateExactBufferCount ?? 0,
          ),
          currentAndCandidateExactPayloadCpuBytes: Math.max(
            measured.currentAndCandidateExactPayloadCpuBytes,
            bundle.assemblyResources?.currentAndCandidateExactPayloadCpuBytes ?? 0,
          ),
          currentAndCandidateBytesEstimate: Math.max(
            measured.currentAndCandidateBytesEstimate,
            bundle.assemblyResources?.currentAndCandidateBytesEstimate ?? 0,
          ),
        };
      }
      graphicsActor.send({
        type: 'gltfPresentationMeasured',
        telemetry: {
          revision: bundle.revision,
          key: bundle.key,
          candidateSceneId: bundle.scene.uuid,
          backend: graphicsBackendThree,
          barrier: bundle.barrier,
          outcome,
          glbBytes: bundle.sourceBytes.byteLength,
          renderBoundary: 'submitted',
          assemblyResources: bundle.assemblyResources,
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
      if (!bundle.parser) {
        bundle.sectionStatus = 'ready';
        return 'completed';
      }
      const { parser } = bundle;
      const analyze = async (): Promise<'completed' | 'discarded' | 'failed'> => {
        const outcome = await topologyScheduler.submit({
          generation: bundle.revision,
          run: async () => {
            const analysisStartedAt = performance.now();
            await registerGltfSectionSurfaceSources({
              scene: bundle.scene,
              manifest: bundle.manifest,
              unitId: bundle.unitId,
              parser,
              sourceBindings: bundle.sourceBindings,
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
    const progress: AssemblyPreparationProgress | undefined = assemblyDisplay
      ? {
          display: assemblyDisplay,
          key: assemblyDisplay.root.digest,
          revision: presentationRevision,
          phase: 'queued',
          requestedAssetReads: 0,
          completedAssetReads: 0,
        }
      : undefined;
    preparationProgressRef.current = progress;
    const setPhase = (phase: AssemblyPreparationPhase): void => {
      if (progress) {
        progress.phase = phase;
      }
    };
    const readAssemblyAsset = async (digest: PublishedPartAsset['digest']): Promise<Uint8Array<ArrayBuffer>> => {
      if (!assemblyDisplay || !progress) {
        throw new Error('Assembly source owner is unavailable.');
      }
      progress.requestedAssetReads += 1;
      const bytes = await assemblyDisplay.admitted.readAsset(digest);
      progress.completedAssetReads += 1;
      return bytes;
    };
    const preparationKey = assemblyPreparationKey;
    const isCancelled = (): boolean =>
      cancellation.cancelled ||
      (preparationKey !== undefined && latestAssemblyPreparationKeyRef.current !== preparationKey);

    const preparationAt = performance.now();
    const presentationSource = assemblyDisplay?.admitted ?? gltfFile;
    const presentationAdmission = presentationSource
      ? holdGeometryPresentation(presentationSource)
      : { presented: () => undefined, release: () => undefined };
    const receivedAt = (gltfFile ? geometryReceiptAt(gltfFile) : undefined) ?? preparationAt;
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
      if (!gltfFile) {
        throw new Error('CAD display has no source GLB');
      }
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
        !gltfFile ||
        assemblyDisplay !== undefined ||
        !committed ||
        committed.assemblyFacade !== undefined ||
        committed.disposed ||
        candidatePresentationRef.current !== undefined ||
        !committed.parser ||
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
      try {
        if (
          ![assemblyResourceBudget.cpuBytes, assemblyResourceBudget.gpuBytes].every(
            (bytes) => Number.isSafeInteger(bytes) && bytes > 0,
          )
        ) {
          return false;
        }
        countAssemblyResources(committed, undefined, {
          queuedPreparationCount: 0,
          retired: retiredPresentationsRef.current,
          resourceBudget: assemblyResourceBudget,
        });
      } catch {
        return false;
      }
      const inPlaceStartedAt = performance.now();
      committed.inPlace ??= captureInPlaceGeometryTargets({
        scene: committed.scene,
        associations: committed.parser.associations,
        bytes: committed.sourceBytes,
      });
      if (!committed.inPlace) {
        return false;
      }
      const targets = committed.inPlace;
      const update = (): boolean => applyInPlaceGeometryUpdate(targets, gltfFile, parsed);
      if (!(sourceUpdaterRef.current ? sourceUpdaterRef.current(update) : update())) {
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
      // The guard retains hierarchy and IDs, and applies only proven rigid mapped node poses.
      // Annotation refreshes placed bounds and measurement metadata on the retained objects.
      annotateSceneComponents(committed.scene, manifest, { unitId: requestedUnitId, measurementFeatures });
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
      setPhase('committed');
      invalidate();
      return true;
    };

    const loadGltf = async (): Promise<void> => {
      let unpreparedDispose: (() => void) | undefined;
      let preparingBundle: PreparedGltfPresentation | undefined;
      try {
        if (presentInPlace()) {
          return;
        }
        if (
          ![assemblyResourceBudget.cpuBytes, assemblyResourceBudget.gpuBytes].every(
            (bytes) => Number.isSafeInteger(bytes) && bytes > 0,
          )
        ) {
          throw new RangeError('Invalid private assembly CPU/GPU resource budget');
        }
        const { current } = committedPresentationRef;
        let reservedCpuBytes = 0;
        let reservedGpuBytes = 0;
        let currentCpuBytes = 0;
        let currentGpuBytes = 0;
        const liveOwner = current ?? retiredPresentationsRef.current.find((owner) => !owner.disposed);
        if (liveOwner) {
          countAssemblyResources(liveOwner, undefined, {
            queuedPreparationCount: 0,
            retired: retiredPresentationsRef.current,
            resourceBudget: assemblyResourceBudget,
            onBudgetInventory: (cpuBytes, gpuBytes) => {
              currentCpuBytes = cpuBytes;
              currentGpuBytes = gpuBytes;
            },
          });
        }
        const reserveResources = (cpuBytes: number, gpuBytes: number): void => {
          reservedCpuBytes += cpuBytes;
          reservedGpuBytes += gpuBytes;
          if (
            !Number.isSafeInteger(reservedCpuBytes) ||
            !Number.isSafeInteger(reservedGpuBytes) ||
            cpuBytes < 0 ||
            gpuBytes < 0 ||
            currentCpuBytes + reservedCpuBytes > assemblyResourceBudget.cpuBytes ||
            currentGpuBytes + reservedGpuBytes > assemblyResourceBudget.gpuBytes
          ) {
            throw new RangeError('Assembly preparation reservation exceeds the private CPU/GPU budget');
          }
        };
        reserveResources(0, 0);
        const parseStartedAt = performance.now();
        const stats = preparationStats.current;
        const resources = emptyRetainedGltfResources();
        const reuseFrom = committedPresentationRef.current;
        let candidateScene = new Group();
        unpreparedDispose = createGltfResourceDisposer(candidateScene, {
          originalMaterials: undefined,
          includeSceneTextures: true,
          inventory: resources,
        });
        let manifest: GeometryComponentManifest;
        let parser: SectionTopologyGltfParser | undefined;
        let definitions: ReadonlyMap<string, PreparedGltfDefinition> | undefined;
        let sourceBindings: ReadonlyMap<Object3D, GltfSectionSourceBinding> | undefined;
        let preparingSourceBytes: ReadonlyMap<string, Uint8Array<ArrayBuffer>> | undefined;
        let assemblyMetadata: Awaited<ReturnType<typeof validateAdmittedAssemblyGlb>> | undefined;
        let assemblyLayout: PreparedAssemblyLayout | undefined;
        let assemblyDemand: PreparedAssemblyDemand | undefined;
        let residentOccurrences: ReadonlySet<string> | undefined;
        let detailSelections: ReadonlyMap<string, boolean> | undefined;
        let detailCalibration: AssemblyDetailCalibration | undefined;
        let validatedSourceBytes: number | undefined;
        let metadataSerializedBytes: number | undefined;
        let inPlace: InPlaceGeometryTargets | undefined;
        let getMeasurementFeatures: PreparedGltfPresentation['getMeasurementFeatures'] = () => new Map();
        const edgeColor = theme === Theme.DARK ? gltfEdgeColorDarkMode : gltfEdgeColorLightMode;
        if (assemblyDisplay) {
          if (!assemblyCamera || !assemblyRenderFrame) {
            throw new Error('Assembly camera frame is unavailable');
          }
          setPhase('source-validation');
          const preparedMetadata = await prepareAssemblyMetadata(assemblyDisplay, reuseFrom, {
            sourceFile,
            reserveResources,
            readAsset: readAssemblyAsset,
            onDemandIndex: () => {
              setPhase('demand-index');
            },
          });
          if (isCancelled()) {
            unpreparedDispose();
            return;
          }
          preparingSourceBytes = preparedMetadata.bytes;
          assemblyMetadata = preparedMetadata.metadata;
          assemblyLayout = preparedMetadata.layout;
          assemblyDemand = preparedMetadata.demand;
          validatedSourceBytes = preparedMetadata.validatedSourceBytes;
          metadataSerializedBytes = preparedMetadata.metadataSerializedBytes;
          // Semantic verification documents and temporary serialization are no longer owned here.
          // Reconcile the retained metadata/source footprint before reserving decoder/occurrence work;
          // borrowed typed backings and metadata/demand owners remain charged only in the live union.
          const liveOwners = [reuseFrom, ...retiredPresentationsRef.current].filter(
            (owner): owner is PreparedGltfPresentation => owner !== undefined && !owner.disposed,
          );
          const retainedBuffers = new Set<ArrayBufferLike>();
          for (const owner of liveOwners) {
            for (const definition of owner.definitions?.values() ?? []) {
              retainedBuffers.add(definition.bytes.buffer);
            }
            for (const array of owner.assemblyDemand
              ? [
                  owner.assemblyDemand.index.bounds,
                  owner.assemblyDemand.index.children,
                  owner.assemblyDemand.index.ranges,
                  owner.assemblyDemand.index.order,
                  owner.assemblyDemand.index.parents,
                ]
              : []) {
              retainedBuffers.add(array.buffer);
            }
          }
          const newBuffers = new Set<ArrayBufferLike>(
            [...preparedMetadata.bytes.values()].map((value) => value.buffer),
          );
          for (const array of [
            assemblyDemand.index.bounds,
            assemblyDemand.index.children,
            assemblyDemand.index.ranges,
            assemblyDemand.index.order,
            assemblyDemand.index.parents,
          ]) {
            newBuffers.add(array.buffer);
          }
          reservedCpuBytes =
            [...newBuffers].reduce((sum, buffer) => sum + (retainedBuffers.has(buffer) ? 0 : buffer.byteLength), 0) +
            3 *
              ((liveOwners.some((owner) => owner.assemblyMetadata === assemblyMetadata) ? 0 : metadataSerializedBytes) +
                (liveOwners.some((owner) => owner.assemblyDemand === assemblyDemand)
                  ? 0
                  : assemblyDemand.serializedBytes));
          reservedGpuBytes = 0;
          reserveResources(0, 0);
          residentOccurrences = assemblyResidentOccurrences({
            demand: assemblyDemand,
            camera: assemblyCamera,
            renderFrame: assemblyRenderFrame,
            layout: assemblyLayout,
            unit: getKinematicsUnitState(kinematicsRef.getSnapshot().context, requestedUnitId),
            priorityIds: assemblyPriorityIds ?? new Set(),
          });
          assemblyDemandRef.current = residentOccurrences;
          const assets = new Set<PublishedPartAsset['digest']>();
          for (const path of residentOccurrences) {
            const leaf = assemblyDemand.index.keyToLeaf.get(path);
            if (leaf === undefined) {
              throw new Error('Demanded occurrence has no canonical bounds entry');
            }
            const occurrence = assemblyMetadata.occurrences[assemblyDemand.index.occurrenceIndices[leaf]!]!;
            if (!occurrence.definition) {
              throw new Error('Demanded occurrence has no canonical definition');
            }
            const { part, variant } = occurrence.definition;
            assets.add(assemblyDisplay.admitted.publication.parts[part]!.variants[variant]!.glb.digest);
          }
          setPhase('definition-preparation');
          definitions = await prepareAssemblyDefinitions({
            display: assemblyDisplay,
            previous: reuseFrom,
            resources,
            backend: graphicsBackendThree,
            resolution: resolutionRef.current,
            edgeColor,
            isCancelled,
            assets,
            sourceBytes: preparedMetadata.bytes,
            reserveResources,
            readAsset: readAssemblyAsset,
          });
          if (isCancelled()) {
            unpreparedDispose();
            return;
          }
          setPhase('detail-preparation');
          definitions = await prepareAssemblyDetailDefinitions({
            definitions,
            previous: reuseFrom,
            resources,
            policy: assemblyDetailPolicy,
            backend: graphicsBackendThree,
            isCancelled,
            reserveResources,
          });
          if (isCancelled()) {
            unpreparedDispose();
            return;
          }
          detailCalibration = {
            maxProjectedApproximateErrorPixels: 0,
            projectionUnavailableCount: 0,
            selectedFullEvidenceCount: 0,
          };
          detailSelections = resolveAssemblyDetailSelections({
            display: assemblyDisplay,
            definitions,
            metadata: assemblyMetadata,
            demand: assemblyDemand,
            layout: assemblyLayout,
            resident: residentOccurrences,
            modelVisualState,
            camera: assemblyCamera,
            renderFrame: assemblyRenderFrame,
            viewport: { width: resolutionRef.current.x, height: resolutionRef.current.y },
            unit: getKinematicsUnitState(kinematicsRef.getSnapshot().context, requestedUnitId),
            policy: assemblyDetailPolicy,
            previous: reuseFrom?.detailSelections,
            calibration: detailCalibration,
          });
          setPhase('scene-preparation');
          const prepared = await prepareAssemblyScene({
            display: assemblyDisplay,
            definitions,
            metadata: assemblyMetadata,
            layout: assemblyLayout,
            resident: residentOccurrences,
            demand: assemblyDemand,
            unitId: requestedUnitId,
            scene: candidateScene,
            modelVisualState,
            backend: graphicsBackendThree,
            resources,
            previousResources: reuseFrom?.resources,
            detailSelections,
            reserveResources,
          });
          candidateScene = prepared.scene;
          manifest = prepared.manifest;
          parser = prepared.parser;
          sourceBindings = prepared.sourceBindings;
          assemblyMetadata = prepared.metadata;
          getMeasurementFeatures = () => {
            const features = new Map<string, GltfMeasurementFeatures>();
            for (const object of getComponentInventory(candidateScene)) {
              const key = object.userData['measurementPrimitiveKey'] as string | undefined;
              const feature = object.userData['measurementFeatures'] as GltfMeasurementFeatures | undefined;
              if (key && feature) {
                features.set(key, feature);
              }
            }
            return features;
          };
        } else {
          if (!gltfFile) {
            throw new Error('CAD display has no source GLB or admitted assembly');
          }
          const loaderBytes =
            gltfFile.byteOffset === 0 && gltfFile.byteLength === gltfFile.buffer.byteLength
              ? gltfFile.buffer
              : new Uint8Array(gltfFile).buffer;
          stats.parsesStarted += 1;
          stats.activeParses += 1;
          stats.activeParseHighWaterMark = Math.max(stats.activeParseHighWaterMark, stats.activeParses);
          let gltf: GLTF;
          try {
            gltf = await gltfLoader.parseAsync(loaderBytes, '');
          } finally {
            stats.activeParses -= 1;
          }
          candidateScene = gltf.scene;
          await captureParsedGltfInventory(gltf, gltfFile, resources);
          unpreparedDispose = createGltfResourceDisposer(candidateScene, {
            originalMaterials: undefined,
            includeSceneTextures: true,
            inventory: resources,
          });
          if (isCancelled()) {
            stats.parsesDiscarded += 1;
            unpreparedDispose();
            return;
          }
          probeGltfScene(gltf, gltfFile.byteLength);
          const preparedMetadata = prepareMetadata();
          manifest = preparedMetadata.manifest;
          getMeasurementFeatures = preparedMetadata.getMeasurementFeatures;
          const measurementFeatures = measurementDemandRef.current ? getMeasurementFeatures() : undefined;
          annotateSceneComponents(candidateScene, manifest, {
            unitId: requestedUnitId,
            associations: gltf.parser.associations as ReadonlyMap<Object3D, GltfLoaderAssociation>,
            measurementFeatures,
          });
          if (materialOptionsRef.current.enableLines) {
            applyFatLineSegments(gltf, { resolution: resolutionRef.current, backend: graphicsBackendThree, edgeColor });
            expandedEdgeScenes.add(candidateScene);
          }
          captureRetainedResources(candidateScene, resources);
          parser = gltf.parser as unknown as SectionTopologyGltfParser;
          inPlace = captureInPlaceGeometryTargets({
            scene: candidateScene,
            associations: gltf.parser.associations as ReadonlyMap<Object3D, GltfLoaderAssociation>,
            bytes: gltfFile,
          });
        }
        timings.parse = performance.now() - parseStartedAt;
        if (timings.parse >= 50) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
          });
        }
        unpreparedDispose = createGltfResourceDisposer(candidateScene, {
          originalMaterials: undefined,
          includeSceneTextures: true,
          inventory: resources,
        });
        setGltfSectionSurfaceRegistrationState(candidateScene, 'pending');
        if (isCancelled()) {
          stats.parsesDiscarded += 1;
          unpreparedDispose();
          return;
        }
        const originalMaterials = saveOriginalMaterials(candidateScene);
        unpreparedDispose = createGltfResourceDisposer(candidateScene, {
          originalMaterials,
          includeSceneTextures: false,
          inventory: resources,
        });
        setPhase('material-preparation');
        const materialsStartedAt = performance.now();
        const materialOptions = materialOptionsRef.current;
        if (materialOptions.enableMatcap) {
          await applyMatcap({ scene: candidateScene }, materialOptions.matcapTint, graphicsBackendThree);
        }
        if (isCancelled()) {
          unpreparedDispose();
          return;
        }
        applyGltfSurfaceDepthBiasToScene(candidateScene, graphicsBackendThree);
        // Install the committed clip before the first draw.
        installSectionClipUnder(candidateScene, sectionClip);
        seedSceneMaterialAppearances(candidateScene);
        timings.materials = performance.now() - materialsStartedAt;
        // Prime the canonical inventory before adding the private presentation subtree.
        const surfaces = getComponentInventory(candidateScene).filter((object) => isSurfaceObject(object));
        const surfaceBatches = createGltfSurfaceBatches(candidateScene, surfaces, {
          sources: getComponentInventory(candidateScene).filter((object): object is Mesh =>
            isFatLineSegmentsMesh(object),
          ),
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
          scene: candidateScene,
          manifest,
          parser,
          definitions,
          sourceBindings,
          assemblyMetadata,
          assemblyLayout,
          assemblyDemand,
          residentOccurrences,
          detailSelections,
          detailCalibration,
          validatedSourceBytes,
          metadataSerializedBytes,
          assemblyFacade: assemblyDisplay?.admitted,
          assemblyPoseRevision: assemblyDisplay ? kinematicsRef.getSnapshot().context.revision : undefined,
          assemblyRenderFrameKey,
          originalMaterials,
          resources,
          inPlace,
          ...(assemblyDisplay ? {} : { ownershipSignature: ownershipSignature(manifest) }),
          getMeasurementFeatures,
          surfaceBatches,
          sourceBytes: gltfFile ?? new Uint8Array(),
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
        if (assemblyDisplay && assemblyMetadata) {
          const display = assemblyDisplay;
          const metadata = assemblyMetadata;
          const owner: GltfInventoryObject = candidateScene;
          owner[liveGltfAssemblyResourceInventory] = () => {
            if (bundle.disposed || committedPresentationRef.current !== bundle) {
              return undefined;
            }
            const current = bundle;
            const candidate = candidatePresentationRef.current;
            const pending = candidate && candidate !== current && !candidate.disposed ? candidate : undefined;
            const retired = retiredPresentationsRef.current.filter((value) => !value.disposed);
            const exact = (value: PreparedGltfPresentation): ExactAssemblyCpuResources => {
              const resources = countAssemblyResources(value, undefined, { queuedPreparationCount: 0 });
              return {
                bufferCount: resources.exactResidentBufferCount,
                backingBytes: resources.exactResidentBufferCpuBytes,
                payloadBytes: resources.exactResidentPayloadCpuBytes,
              };
            };
            const overlap = countAssemblyResources(pending ?? current, pending ? current : undefined, {
              queuedPreparationCount: 0,
              retired,
            });
            const result: LiveGltfAssemblyResourceInventory = {
              key: current.key,
              presentationRevision: current.revision,
              candidateSceneId: current.scene.uuid,
              unitId: current.unitId,
              current: exact(current),
              ...(pending
                ? {
                    candidate: {
                      ...exact(pending),
                      key: pending.key,
                      revision: pending.revision,
                      sceneId: pending.scene.uuid,
                      unitId: pending.unitId,
                    },
                  }
                : {}),
              union: {
                bufferCount: overlap.currentAndCandidateExactBufferCount,
                backingBytes: overlap.currentAndCandidateExactBufferCpuBytes,
                payloadBytes: overlap.currentAndCandidateExactPayloadCpuBytes,
              },
              retiredOwnerCount: retired.length,
            };
            return committedPresentationRef.current === bundle ? result : undefined;
          };
          owner[committedGltfDrawInventory] = () => {
            if (bundle.disposed || committedPresentationRef.current !== bundle) {
              return undefined;
            }
            const { context } = kinematicsRef.getSnapshot();
            if (getKinematicsUnitState(context, bundle.unitId).mechanism !== bundle.manifest.mechanism) {
              return undefined;
            }
            const poseRevision = context.revision;
            bundle.scene.updateWorldMatrix(true, true);
            const canonicalToRenderMatrix = bundle.scene.matrixWorld.toArray();
            const isCurrent = (): boolean => {
              if (bundle.disposed || committedPresentationRef.current !== bundle) {
                return false;
              }
              const currentContext = kinematicsRef.getSnapshot().context;
              bundle.scene.updateWorldMatrix(true, false);
              return (
                currentContext.revision === poseRevision &&
                getKinematicsUnitState(currentContext, bundle.unitId).mechanism === bundle.manifest.mechanism &&
                bundle.scene.matrixWorld.elements.every((value, index) => value === canonicalToRenderMatrix[index])
              );
            };
            const surfaces: Array<GltfAssemblyDrawCapture['surfaces'][number]> = [];
            const edges: Array<GltfAssemblyDrawCapture['edges'][number]> = [];
            const captureState = { incompleteEdgeInventory: false };
            const visible = (object: Object3D): boolean => {
              let current: Object3D | undefined = object;
              while (current) {
                if (!current.visible) {
                  return false;
                }
                current = current.parent ?? undefined;
              }
              return true;
            };
            bundle.scene.traverse((object) => {
              const edge = getGltfOccurrenceEdgeBatch(object);
              if (edge) {
                const triangles =
                  edge.object.geometry.index?.count ?? edge.object.geometry.attributes['position']?.count ?? 0;
                const positionVersions: Record<string, number> = {};
                for (const name of ['position', 'instanceStart', 'instanceEnd']) {
                  const attribute = edge.object.geometry.getAttribute(name);
                  if (attribute instanceof InterleavedBufferAttribute) {
                    positionVersions[name] = attribute.data.version;
                  } else if (attribute instanceof BufferAttribute) {
                    positionVersions[name] = attribute.version;
                  }
                }
                edges.push({
                  geometryId: edge.object.geometry.uuid,
                  positionVersions,
                  objectId: object.id,
                  matrixWorld: object.matrixWorld.toArray(),
                  segments: edge.segments,
                  mandatoryTriangles:
                    Math.floor(triangles / 3) * edge.segments.reduce((sum, span) => sum + span.count, 0),
                  positionBytes: edge.positionBytes,
                  colorBytes: edge.colorBytes,
                  visible: visible(object),
                });
                return;
              }
              if (collectGltfFatLineMaterials(object).length > 0) {
                const positions = getGltfFatLinePositions(object);
                const componentId = getModelComponentId(object);
                if (!positions || !componentId || !('geometry' in object) || !isGltfBufferGeometry(object.geometry)) {
                  captureState.incompleteEdgeInventory = true;
                  return;
                }
                const { geometry } = object;
                const positionVersions: Record<string, number> = {};
                for (const name of ['position', 'instanceStart', 'instanceEnd']) {
                  const attribute = geometry.getAttribute(name);
                  if (attribute instanceof InterleavedBufferAttribute) {
                    positionVersions[name] = attribute.data.version;
                  } else if (attribute instanceof BufferAttribute) {
                    positionVersions[name] = attribute.version;
                  }
                }
                const colorArrays = new Set<ArrayLike<number> & { byteLength: number }>();
                for (const name of ['color', 'instanceColorStart', 'instanceColorEnd']) {
                  const attribute = geometry.getAttribute(name);
                  if (attribute instanceof InterleavedBufferAttribute) {
                    colorArrays.add(attribute.data.array);
                  } else if (attribute instanceof BufferAttribute) {
                    colorArrays.add(attribute.array);
                  }
                }
                const count = Math.floor(positions.length / 6);
                edges.push({
                  objectId: object.id,
                  matrixWorld: object.matrixWorld.toArray(),
                  segments: [{ componentId, first: 0, count }],
                  mandatoryTriangles:
                    Math.floor((geometry.index?.count ?? geometry.attributes['position']?.count ?? 0) / 3) * count,
                  geometryId: geometry.uuid,
                  positionVersions,
                  positionBytes: positions.byteLength,
                  colorBytes: [...colorArrays].reduce((sum, array) => sum + array.byteLength, 0),
                  visible: visible(object),
                });
                return;
              }
              if (!isSurfaceObject(object)) {
                return;
              }
              const slots = getModelComponentInstanceSlots(object);
              const addSurface = (componentId: string, instanceId?: number): void => {
                const geometry = getModelComponentSourceGeometry(object, instanceId);
                const matrix = getModelComponentWorldMatrix(object, instanceId, new Matrix4());
                if (!geometry || !matrix) {
                  return;
                }
                const bounds = getAssemblyPrimitiveLocalBounds(geometry).applyMatrix4(matrix);
                const attributeVersions: Record<string, number> = {};
                for (const [name, attribute] of Object.entries(object.geometry.attributes)) {
                  if (attribute instanceof InterleavedBufferAttribute) {
                    attributeVersions[name] = attribute.data.version;
                  } else if (attribute instanceof BufferAttribute) {
                    attributeVersions[name] = attribute.version;
                  }
                }
                surfaces.push({
                  componentId,
                  objectId: object.id,
                  objectUuid: object.uuid,
                  instanceId,
                  drawMatrixWorld: matrix.toArray(),
                  canonicalRenderBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
                  drawGeometryId: object.geometry.uuid,
                  canonicalGeometryId: geometry.uuid,
                  materialIds: (Array.isArray(object.material) ? object.material : [object.material]).map(
                    (material) => material.uuid,
                  ),
                  materialOpacities: (Array.isArray(object.material) ? object.material : [object.material]).map(
                    (material) => material.opacity,
                  ),
                  canonicalBvhIdentity: getCachedBvh(geometry),
                  drawTriangles: Math.floor(
                    (object.geometry.index?.count ?? object.geometry.attributes['position']?.count ?? 0) / 3,
                  ),
                  indexVersion: object.geometry.index?.version,
                  attributeVersions,
                  visible: visible(object),
                });
              };
              if (slots) {
                for (const [index, slot] of slots.entries()) {
                  addSurface(slot.owner.componentId, index);
                }
              } else {
                const id = getModelComponentId(object);
                if (id) {
                  addSurface(id);
                }
              }
            });
            return isCurrent() && !captureState.incompleteEdgeInventory
              ? {
                  display,
                  metadata,
                  key: bundle.key,
                  presentationRevision: bundle.revision,
                  candidateSceneId: bundle.scene.uuid,
                  unitId: bundle.unitId,
                  poseRevision,
                  canonicalToRenderMatrix,
                  surfaces,
                  edges,
                  isCurrent,
                }
              : undefined;
          };
        }
        materialSignaturesRef.current.set(
          bundle,
          `${materialOptions.enableMatcap}:${materialOptions.matcapTint}:${graphicsBackendThree}`,
        );
        const disposeCanonicalResources = createGltfResourceDisposer(bundle.scene, {
          originalMaterials: bundle.originalMaterials,
          includeSceneTextures: false,
          inventory: bundle.resources,
        });
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
          (bundle.scene as GltfInventoryObject)[armedGltfAssemblyAdmissionResourceInventory] = undefined;
          bundle.sectionStatus = 'cancelled';
          setGltfSectionSurfaceRegistrationState(bundle.scene, 'cancelled');
          disposeResources();
        };
        candidatePresentationRef.current = bundle;
        setPhase('section-analysis');
        preparingBundle = bundle;
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
            setPhase(isCancelled() || outcome === 'discarded' ? 'cancelled' : 'failed');
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

        setPhase('admission');
        countAssemblyResources(bundle, committedPresentationRef.current, {
          queuedPreparationCount: 0,
          retired: retiredPresentationsRef.current,
          sourceBytes: preparingSourceBytes,
          resourceBudget: assemblyResourceBudget,
        });

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
        if (
          !isCancelled() &&
          previous === reuseFrom &&
          !reuseFrom?.disposed &&
          assemblyDisplay &&
          assemblyMetadata &&
          assemblyLayout &&
          assemblyDemand &&
          assemblyCamera &&
          assemblyRenderFrame &&
          residentOccurrences
        ) {
          const demanded = assemblyResidentOccurrences({
            demand: assemblyDemand,
            camera: assemblyCamera,
            renderFrame: assemblyRenderFrame,
            layout: assemblyLayout,
            unit: getKinematicsUnitState(kinematicsRef.getSnapshot().context, requestedUnitId),
            priorityIds: assemblyPriorityIds ?? new Set(),
          });
          const latestDetails =
            definitions &&
            resolveAssemblyDetailSelections({
              display: assemblyDisplay,
              definitions,
              metadata: assemblyMetadata,
              demand: assemblyDemand,
              layout: assemblyLayout,
              resident: residentOccurrences,
              modelVisualState,
              camera: assemblyCamera,
              renderFrame: assemblyRenderFrame,
              viewport: { width: resolutionRef.current.x, height: resolutionRef.current.y },
              unit: getKinematicsUnitState(kinematicsRef.getSnapshot().context, requestedUnitId),
              policy: assemblyDetailPolicy,
              previous: reuseFrom?.detailSelections,
            });
          const detailChanged =
            latestDetails !== undefined &&
            (latestDetails.size !== detailSelections?.size ||
              [...latestDetails].some(([key, value]) => detailSelections.get(key) !== value));
          if (
            detailChanged ||
            demanded.size !== residentOccurrences.size ||
            [...demanded].some((id) => !residentOccurrences.has(id))
          ) {
            bundle.dispose();
            if (candidatePresentationRef.current === bundle) {
              candidatePresentationRef.current = undefined;
            }
            assemblyDemandRef.current = demanded;
            setAssemblyDemandRevision((revision) => revision + 1);
            return;
          }
        }
        if (isCancelled() || previous !== reuseFrom || reuseFrom?.disposed) {
          bundle.dispose();
          if (candidatePresentationRef.current === bundle) {
            candidatePresentationRef.current = undefined;
          }
          return;
        }
        const resourceInventory = countAssemblyResources(bundle, previous, {
          queuedPreparationCount: latestPreparationRef.current ? 1 : 0,
          retired: retiredPresentationsRef.current,
          sourceBytes: preparingSourceBytes,
          resourceBudget: assemblyResourceBudget,
        });
        const previousScene: GltfInventoryObject | undefined = previous?.scene;
        const onAdmission = previousScene?.[armedGltfAssemblyAdmissionResourceInventory];
        if (onAdmission) {
          previousScene[armedGltfAssemblyAdmissionResourceInventory] = undefined;
          const exact = previousScene[liveGltfAssemblyResourceInventory]?.();
          if (exact?.candidate?.sceneId === bundle.scene.uuid) {
            onAdmission(exact);
          }
        }
        if (bundle.assemblyFacade) {
          bundle.assemblyResources = resourceInventory;
        }
        transferRetainedResources(previous?.resources, bundle.resources);
        const liveResources = collectGltfResources(bundle.scene, bundle.originalMaterials);
        for (const definition of bundle.definitions?.values() ?? []) {
          for (const resource of definition.immutableResources) {
            liveResources.add(resource);
          }
          for (const primitive of definition.primitives) {
            if (primitive.detail) {
              liveResources.add(primitive.detail.geometry);
            }
          }
        }
        for (const resource of bundle.resources.owned) {
          if (!liveResources.has(resource)) {
            resource.dispose();
            bundle.resources.owned.delete(resource);
          }
        }
        const liveImages = new Set<ClosableTextureImage>();
        for (const resource of liveResources) {
          if (isGltfTexture(resource)) {
            for (const image of textureImages(resource)) {
              liveImages.add(image);
            }
          }
        }
        for (const image of bundle.resources.ownedImages) {
          if (!liveImages.has(image)) {
            image.close();
            bundle.resources.closedImages.add(image);
            bundle.resources.ownedImages.delete(image);
            bundle.resources.releasedImages.add(image);
          }
        }
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
        setPhase('committed');
        invalidate();
      } catch (error) {
        setPhase(isCancelled() ? 'cancelled' : 'failed');
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
              glbBytes: gltfFile?.byteLength ?? 0,
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
        if (preparingBundle && committedPresentationRef.current !== preparingBundle) {
          preparingBundle.dispose();
          if (candidatePresentationRef.current === preparingBundle) {
            candidatePresentationRef.current = undefined;
          }
        }
      }
    };

    const prepare = async (): Promise<void> => {
      if (!isCancelled()) {
        await loadGltf();
      }
    };
    latestPreparationRef.current = prepare;
    drainPreparations();

    return () => {
      cancellation.cancelled = true;
      setPhase('cancelled');
      if (latestPreparationRef.current === prepare) {
        latestPreparationRef.current = undefined;
      }
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
    assemblyDisplay,
    assemblyPreparationKey,
    assemblyDetailPolicy,
    assemblyResourceBudget.cpuBytes,
    assemblyResourceBudget.gpuBytes,
    assemblyCamera,
    assemblyRenderFrame,
    assemblyPriorityIds,
    kinematicsRef,
    graphicsBackendThree,
    invalidate,
    graphicsActor,
    sourceFile,
    geometryHash,
    requestedUnitId,
    presentationRevision,
    ensureSectionAnalysis,
    drainPreparations,
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
    const previous = retiredPresentationsRef.current.at(-1);
    const materialSignature = `${enableMatcap}:${matcapTint}:${graphicsBackendThree}`;
    let attachedToViewport = false;
    for (let parent = presentation?.scene.parent; parent; parent = parent.parent) {
      if (parent === rootScene) {
        attachedToViewport = true;
        break;
      }
    }
    if (presentation && attachedToViewport) {
      presentation.scene.updateWorldMatrix(true, false);
    }
    if (
      !presentation ||
      !previous ||
      !attachedToViewport ||
      !previous.mountedRootWorld ||
      !previous.mountedRootWorld.equals(presentation.scene.matrixWorld) ||
      previous.assemblyRenderFrameKey !== presentation.assemblyRenderFrameKey ||
      presentation.assemblyRenderFrameKey !== assemblyRenderFrameKey ||
      !assemblyDisplay ||
      assemblyDisplay.admitted !== presentation.assemblyFacade ||
      previous.assemblyFacade !== presentation.assemblyFacade ||
      previous.key !== presentation.key ||
      previous.unitId !== presentation.unitId ||
      previous.assemblyPoseRevision === undefined ||
      previous.assemblyPoseRevision !== presentation.assemblyPoseRevision ||
      presentation.assemblyPoseRevision !== kinematicsRef.getSnapshot().context.revision ||
      previous.manifest.mechanism !== undefined ||
      presentation.manifest.mechanism !== undefined ||
      previous.disposed ||
      presentation.disposed ||
      committedPresentationRef.current !== presentation ||
      previous.scene.parent !== null ||
      presentation.firstFrameAt !== undefined ||
      sectionView.isActive ||
      previous.barrier !== 'display-ready' ||
      presentation.barrier !== 'display-ready' ||
      previous.sectionStatus !== 'pending' ||
      presentation.sectionStatus !== 'pending' ||
      previous.analysisPromise !== undefined ||
      presentation.analysisPromise !== undefined ||
      enableMatcap ||
      materialSignaturesRef.current.get(previous) !== materialSignature ||
      materialSignaturesRef.current.get(presentation) !== materialSignature
    ) {
      if (presentation && attachedToViewport) {
        (presentation.mountedRootWorld ??= new Matrix4()).copy(presentation.scene.matrixWorld);
      }
      return;
    }
    if (!transferUnchangedAssemblyBatches(previous, presentation)) {
      (presentation.mountedRootWorld ??= new Matrix4()).copy(presentation.scene.matrixWorld);
      return;
    }
    // Both owners captured their source objects. Retire the detached owner's
    // callbacks before the moved objects enter the current visual effect.
    previous.surfaceBatches.dispose();
    componentInventories.delete(previous.scene);
    componentInventories.delete(presentation.scene);
    modelPickableMeshesSceneRef.current = undefined;
    modelPickableMeshesRef.current = [];
    rebindCommittedAssemblySurfaceBatches(presentation, {
      backend: graphicsBackendThree,
      resolution: resolutionRef.current,
      sectionClip,
    });
    (presentation.mountedRootWorld ??= new Matrix4()).copy(presentation.scene.matrixWorld);
  }, [
    assemblyDisplay,
    assemblyRenderFrameKey,
    enableMatcap,
    graphicsBackendThree,
    kinematicsRef,
    matcapTint,
    presentation,
    rootScene,
    sectionClip,
    sectionView.isActive,
  ]);

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
    const residentPresentation = committedPresentationRef.current;
    if (
      assemblyDisplay?.admitted === residentPresentation?.assemblyFacade &&
      assemblyDisplay !== undefined &&
      residentPresentation !== undefined &&
      residentPresentation.assemblyMetadata &&
      residentPresentation.assemblyLayout &&
      residentPresentation.assemblyDemand
    ) {
      camera.updateMatrixWorld();
      const cameraState = JSON.stringify([
        camera.projectionMatrix.elements,
        camera.matrixWorldInverse.elements,
        renderFrame.originMeters,
        renderFrame.metersPerRenderUnit,
        kinematicsRef.getSnapshot().context.revision,
        modelVisualState.selectedComponentIds,
        modelVisualState.focusedComponentId,
        size.width,
        size.height,
        assemblyDetailPolicy?.screenSpace,
      ]);
      if (cameraState !== assemblyCameraStateRef.current) {
        assemblyCameraStateRef.current = cameraState;
        const demanded = assemblyResidentOccurrences({
          demand: residentPresentation.assemblyDemand,
          camera,
          renderFrame,
          layout: residentPresentation.assemblyLayout,
          unit: getKinematicsUnitState(kinematicsRef.getSnapshot().context, residentPresentation.unitId),
          priorityIds: new Set([
            ...modelVisualState.selectedComponentIds,
            ...(modelVisualState.focusedComponentId ? [modelVisualState.focusedComponentId] : []),
          ]),
        });
        const nextDetails =
          residentPresentation.definitions &&
          resolveAssemblyDetailSelections({
            display: assemblyDisplay,
            definitions: residentPresentation.definitions,
            metadata: residentPresentation.assemblyMetadata,
            demand: residentPresentation.assemblyDemand,
            layout: residentPresentation.assemblyLayout,
            resident: residentPresentation.residentOccurrences ?? demanded,
            modelVisualState,
            camera,
            renderFrame,
            viewport: { width: resolutionRef.current.x, height: resolutionRef.current.y },
            unit: getKinematicsUnitState(kinematicsRef.getSnapshot().context, residentPresentation.unitId),
            policy: assemblyDetailPolicy,
            previous: residentPresentation.detailSelections,
          });
        const detailChanged =
          nextDetails !== undefined &&
          (nextDetails.size !== residentPresentation.detailSelections?.size ||
            [...nextDetails].some(([key, value]) => residentPresentation.detailSelections?.get(key) !== value));
        const previousDemand = assemblyDemandRef.current;
        if (
          detailChanged ||
          !previousDemand ||
          demanded.size !== previousDemand.size ||
          [...demanded].some((id) => !previousDemand.has(id))
        ) {
          assemblyDemandRef.current = demanded;
          setAssemblyDemandRevision((revision) => revision + 1);
        }
      }
    }
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
      candidatePresentationRef.current = undefined;
      const committed = committedPresentationRef.current;
      if (committed) {
        graphicsActor.send({ type: 'gltfPresentationReleased', revision: committed.revision, key: committed.key });
        committed.dispose();
        committedPresentationRef.current = undefined;
      }
      for (const retired of retiredPresentationsRef.current.splice(0)) {
        retired.dispose();
      }
    },
    [graphicsActor, topologyScheduler],
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

    const focusedBounds = new Box3(new Vector3(...focusedNode.bounds.min), new Vector3(...focusedNode.bounds.max));
    if (componentManifest.mechanism) {
      const unit = getKinematicsUnitState(kinematicsRef.getSnapshot().context, unitId);
      if (unit.mechanism !== componentManifest.mechanism || !unit.pose) {
        return;
      }
      const linkByComponent = new Map<string, string>();
      for (const [linkId, link] of Object.entries(unit.mechanism.links)) {
        for (const componentId of link.components) {
          linkByComponent.set(componentId, linkId);
        }
      }
      focusedBounds.makeEmpty();
      const assemblyComponents = new Map(
        presentation.assemblyMetadata?.components.map((entry) => [entry.component.id, entry]) ?? [],
      );
      const assemblyOccurrences = new Map(
        presentation.assemblyMetadata?.occurrences.map((occurrence) => [
          JSON.stringify(occurrence.ancestry),
          occurrence,
        ]) ?? [],
      );
      // Index immutable own primitives once per definition for this Focus action.
      const primitivesByDefinition = new Map<PreparedGltfDefinition, Map<string, PreparedDefinitionPrimitive[]>>();
      const boundsByPrimitive = new Map<PreparedDefinitionPrimitive, Box3>();
      const focusedIds = new Set([modelVisualState.focusedComponentId]);
      for (const componentId of componentManifest.nodeOrder) {
        const node = componentManifest.nodesById[componentId];
        if (
          !node?.bounds ||
          node.meshNodeIndices.length === 0 ||
          !hasComponentOrAncestor(componentManifest, componentId, focusedIds)
        ) {
          continue;
        }
        const linkId = [componentId, ...getComponentAncestorIds(componentManifest, componentId)]
          .map((id) => linkByComponent.get(id))
          .find((id) => id !== undefined);
        const bounds = new Box3(new Vector3(...node.bounds.min), new Vector3(...node.bounds.max));
        if (presentation.assemblyMetadata) {
          const entry = assemblyComponents.get(componentId);
          const occurrence = entry && assemblyOccurrences.get(JSON.stringify(entry.ancestry));
          const variant =
            occurrence?.definition &&
            presentation.assemblyFacade?.publication.parts[occurrence.definition.part]?.variants[
              occurrence.definition.variant
            ];
          const definition = variant && presentation.definitions?.get(variant.glb.digest);
          if (!entry?.sourceComponentId || !occurrence || !definition) {
            return;
          }
          let primitivesByComponent = primitivesByDefinition.get(definition);
          if (!primitivesByComponent) {
            primitivesByComponent = new Map();
            for (const primitive of definition.primitives) {
              const ownPrimitives = primitivesByComponent.get(primitive.sourceComponentId);
              if (ownPrimitives) {
                ownPrimitives.push(primitive);
              } else {
                primitivesByComponent.set(primitive.sourceComponentId, [primitive]);
              }
            }
            primitivesByDefinition.set(definition, primitivesByComponent);
          }
          bounds.makeEmpty();
          const placement = new Matrix4().fromArray(occurrence.worldTransform);
          for (const primitive of primitivesByComponent.get(entry.sourceComponentId) ?? []) {
            let ownBounds = boundsByPrimitive.get(primitive);
            if (!ownBounds) {
              ownBounds = new Box3();
              if (primitive.edgePositions) {
                const point = new Vector3();
                for (let index = 0; index < primitive.edgePositions.length; index += 3) {
                  ownBounds.expandByPoint(point.fromArray(primitive.edgePositions, index));
                }
              } else if (primitive.localBounds) {
                ownBounds.copy(primitive.localBounds);
              } else {
                const geometry = getModelComponentSourceGeometry(primitive.source);
                if (geometry) {
                  ownBounds.copy(getAssemblyPrimitiveLocalBounds(geometry));
                }
              }
              boundsByPrimitive.set(primitive, ownBounds);
            }
            bounds.union(ownBounds.clone().applyMatrix4(placement.clone().multiply(primitive.localPlacement)));
          }
          if (bounds.isEmpty()) {
            return;
          }
        }
        if (linkId !== undefined) {
          const delta = unit.pose.linkTransforms[linkId];
          if (!delta) {
            return;
          }
          bounds.applyMatrix4(new Matrix4().fromArray(delta));
        }
        focusedBounds.union(bounds);
      }
      if (focusedBounds.isEmpty()) {
        return;
      }
    }
    lastFocusedComponentIdRef.current = modelVisualState.focusedComponentId;
    const physicalBox = applyCanonicalGltfBounds(focusedBounds);
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
  }, [
    cameraRig,
    componentManifest,
    invalidate,
    kinematicsRef,
    modelVisualState.focusedComponentId,
    presentation,
    unitId,
  ]);

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
      const componentId =
        event.object instanceof InstancedMesh
          ? getModelComponentHitOwner(event)?.componentId
          : getObjectComponentId(event.object);
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
        modelComponentId:
          event.object instanceof InstancedMesh
            ? getModelComponentHitOwner(event)?.componentId
            : getObjectComponentId(event.object),
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
        modelComponentId:
          event.object instanceof InstancedMesh
            ? getModelComponentHitOwner(event)?.componentId
            : getObjectComponentId(event.object),
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

  // R3F excludes objects without hover handlers before pointer-move raycasting; presses still pick.
  return (
    <group matrix={assetMatrix} matrixAutoUpdate={false}>
      <primitive
        object={scene}
        onPointerMove={isCameraDragHoverSuppressed ? undefined : handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerOut={isCameraDragHoverSuppressed ? undefined : handlePointerOut}
        onClick={handleClick}
        onPointerMissed={handlePointerMissed}
      />
    </group>
  );
}
