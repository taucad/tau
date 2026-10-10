import { createGltfEdgeBatches } from '#components/geometry/graphics/three/utils/gltf-edge-batches.js';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { sceneTag } from '#components/geometry/graphics/three/utils/scene-tags.js';
import { getCapturedModelMaterialAppearance } from '#components/geometry/graphics/three/materials/model-component-appearance.js';
import {
  getGltfSurfaceDepthBiasCohort,
  isGltfSurfaceDepthBiasHookExtension,
} from '#components/geometry/graphics/three/materials/gltf-surface-depth-bias.js';
import type { Mesh } from 'three';
import {
  Color,
  DynamicDrawUsage,
  Euler,
  Group,
  InstancedMesh,
  Layers,
  Material,
  Matrix3,
  Matrix4,
  Object3D,
  Plane,
  Vector2,
  Vector3,
  Vector4,
} from 'three';

/** Private tag: every semantic traversal skips this subtree; it has no component owner. */
export const gltfSurfacePresentationTag = sceneTag.gltfSurfacePresentation;
const occurrenceLayers = new WeakMap<Object3D, Layers>();
type KnownHooks = Pick<Material, 'onBeforeCompile' | 'customProgramCacheKey'> & {
  base: Pick<Material, 'opacity' | 'transparent' | 'depthWrite'>;
  sealed: boolean;
};
const qualifiedMaterials = new WeakMap<Material, KnownHooks>();
const sceneBatches = new WeakMap<Object3D, GltfSurfaceBatches>();
const supportedMaterialTypes = new Set([
  'MeshStandardMaterial',
  'MeshPhysicalMaterial',
  'MeshMatcapMaterial',
  'MeshStandardNodeMaterial',
  'MeshPhysicalNodeMaterial',
  'MeshMatcapNodeMaterial',
]);

/** Called by the loader/material factory before Tau's known clip/depth hooks are composed. */
export function qualifyGltfSurfaceMaterial(material: Material): void {
  const descriptors = Object.getOwnPropertyDescriptors(material);
  if (Object.values(descriptors).some((descriptor) => descriptor.get ?? descriptor.set)) {
    return;
  }
  if (!supportedMaterialTypes.has(material.type) || material.onBeforeCompile !== Material.prototype.onBeforeCompile) {
    return;
  }
  if (Object.entries(descriptors).some(([key, descriptor]) => key.endsWith('Node') && descriptor.value !== null)) {
    return;
  }
  qualifiedMaterials.set(material, {
    onBeforeCompile: material.onBeforeCompile,
    customProgramCacheKey: material.customProgramCacheKey,
    base: {
      opacity: material.opacity,
      transparent: material.transparent,
      depthWrite: material.depthWrite,
    },
    sealed: false,
  });
}

/* Seal only immediately after the owning factory composes Tau's known clip/depth hooks. */
export function sealGltfSurfaceMaterial(material: Material): void {
  const known = qualifiedMaterials.get(material);
  if (!known || known.sealed) {
    return;
  }
  const authored = getCapturedModelMaterialAppearance(material) ?? material;
  qualifiedMaterials.set(material, {
    onBeforeCompile: material.onBeforeCompile,
    customProgramCacheKey: material.customProgramCacheKey,
    base: {
      opacity: authored.opacity,
      transparent: authored.transparent,
      depthWrite: authored.depthWrite,
    },
    sealed: true,
  });
}

/** Picking keeps the original semantic layer mask when direct submission is suppressed. */
export function getGltfOccurrenceLayers(object: Object3D): Layers {
  return occurrenceLayers.get(object) ?? object.layers;
}

const ignoredMaterialFields = new Set([
  'id',
  'uuid',
  'name',
  'userData',
  'version',
  '_listeners',
  'onBeforeCompile',
  'customProgramCacheKey',
]);
const objectIds = new WeakMap<WeakKey, number>();
let nextObjectId = 1;
function identity(value: WeakKey): number {
  let id = objectIds.get(value);
  if (id === undefined) {
    id = nextObjectId++;
    objectIds.set(value, id);
  }
  return id;
}

/** Value types compare by values; texture/node/custom objects retain exact identity. */
function renderValue(value: unknown, visiting = new Set<WeakKey>()): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('Nonfinite rendering property');
  }
  if (typeof value === 'function') {
    return { identity: identity(value) };
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (
    value instanceof Color ||
    value instanceof Vector2 ||
    value instanceof Vector3 ||
    value instanceof Vector4 ||
    value instanceof Matrix3 ||
    value instanceof Matrix4 ||
    value instanceof Euler
  ) {
    return renderValue(value.toArray(), visiting);
  }
  if (value instanceof Plane) {
    return [renderValue(value.normal, visiting), renderValue(value.constant, visiting)];
  }
  if (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype) {
    if (visiting.has(value)) {
      throw new TypeError('Cyclic rendering property');
    }
    visiting.add(value);
    const entries = Object.entries(Object.getOwnPropertyDescriptors(value)).sort(([a], [b]) => a.localeCompare(b));
    const properties: Record<string, unknown> = {};
    for (const [key, descriptor] of entries) {
      if (descriptor.get ?? descriptor.set) {
        throw new TypeError('Accessor rendering property');
      }
      properties[key] = renderValue(descriptor.value as unknown, visiting);
    }
    visiting.delete(value);
    return properties;
  }
  return { identity: identity(value) };
}

function materialKey(material: Material, owningCohort = false): string | undefined {
  const known = qualifiedMaterials.get(material);
  if (
    !known ||
    ((material.onBeforeCompile !== known.onBeforeCompile ||
      material.customProgramCacheKey !== known.customProgramCacheKey) &&
      !isGltfSurfaceDepthBiasHookExtension(material, known)) ||
    (owningCohort ? known.base.transparent || known.base.opacity < 1 : material.transparent || material.opacity < 1) ||
    ('transmission' in material && typeof material.transmission === 'number' && material.transmission > 0)
  ) {
    return undefined;
  }
  const properties: Record<string, unknown> = {};
  try {
    const programCacheKey = material.customProgramCacheKey();
    const bias = owningCohort ? getGltfSurfaceDepthBiasCohort(material, programCacheKey) : undefined;
    const descriptors = Object.getOwnPropertyDescriptors(material);
    for (const key of Object.keys(descriptors).sort()) {
      if (ignoredMaterialFields.has(key)) {
        continue;
      }
      const descriptor = descriptors[key]!;
      if (descriptor.get ?? descriptor.set) {
        return undefined;
      }
      const value: unknown =
        bias && (key === 'polygonOffset' || key === 'polygonOffsetFactor' || key === 'polygonOffsetUnits')
          ? bias[key]
          : owningCohort &&
              (material.transparent || material.opacity < 1) &&
              (key === 'opacity' || key === 'transparent' || key === 'depthWrite')
            ? known.base[key]
            : descriptor.value;
      // Unqualified executable material properties cannot be compared by function text.
      if (typeof value === 'function') {
        return undefined;
      }
      properties[key] = renderValue(value);
    }
    return JSON.stringify([material.type, bias?.programCacheKey ?? programCacheKey, bias?.backend, properties]);
  } catch {
    return undefined;
  }
}

function worldVisible(object: Object3D): boolean {
  for (let current: Object3D | undefined = object; current; current = current.parent ?? undefined) {
    if (!current.visible) {
      return false;
    }
  }
  return true;
}

/** Three instancing supports positive, orthogonal linear transforms; shear/reflection stay canonical. */
function supportedMatrix(matrix: Matrix4): boolean {
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
  const dot = (a: number, b: number): number =>
    elements[a]! * elements[b]! + elements[a + 1]! * elements[b + 1]! + elements[a + 2]! * elements[b + 2]!;
  const orthogonal = (a: number, b: number): boolean =>
    Math.abs(dot(a, b)) <= Math.sqrt(dot(a, a) * dot(b, b)) * Number.EPSILON * 64;
  return orthogonal(0, 4) && orthogonal(0, 8) && orthogonal(4, 8);
}

type Batch = { mesh: InstancedMesh; occurrences: Mesh[]; matrices: Matrix4[] };
export type GltfSurfaceBatches = Readonly<{
  group: Group;
  /** Appearance/topology event, never camera/frame work. */
  sync: () => void;
  /** Canonical objects changed by the pose owner; cached descendants identify affected slots. */
  syncMatrices: (changed: readonly Object3D[]) => void;
  dispose: () => void;
}>;

/** Owns instance buffers only; canonical surfaces own geometry, material, labels, visibility and BVH. */
export function createGltfSurfaceBatches(
  root: Object3D,
  sources: readonly Mesh[],
  edges?: Readonly<{
    sources: readonly Mesh[];
    backend: ResolvedGraphicsBackend;
    resolution: Vector2;
    prepareMaterial: (material: Material) => void;
  }>,
): GltfSurfaceBatches {
  const group = new Group();
  group.userData[gltfSurfacePresentationTag] = true;
  group.raycast = () => undefined;
  root.add(group);
  const batches = new Map<string, Batch>();
  const slots = new Map<Mesh, { batch: Batch; slot: number }>();
  const descendants = new Map<Object3D, Set<Mesh>>();
  const inverseRoot = new Matrix4();
  const local = new Matrix4();
  const originalLayers = new Map<Mesh, Layers>();
  let disposed = false;
  for (const source of [...sources, ...(edges?.sources ?? [])]) {
    const layers = new Layers();
    layers.mask = source.layers.mask;
    originalLayers.set(source, layers);
  }
  for (const source of sources) {
    for (
      let ancestor: Object3D | undefined = source;
      ancestor && ancestor !== root.parent;
      ancestor = ancestor.parent ?? undefined
    ) {
      let affected = descendants.get(ancestor);
      if (!affected) {
        affected = new Set();
        descendants.set(ancestor, affected);
      }
      affected.add(source);
    }
  }
  const restore = (source: Mesh): void => {
    const layers = originalLayers.get(source)!;
    source.layers.mask = layers.mask;
    occurrenceLayers.delete(source);
  };
  const edgeBatches = edges
    ? createGltfEdgeBatches(root, edges.sources, {
        backend: edges.backend,
        resolution: edges.resolution,
        hooks: {
          restore,
          suppress(source) {
            occurrenceLayers.set(source, originalLayers.get(source)!);
            source.layers.mask = 0;
          },
          prepareMaterial: edges.prepareMaterial,
        },
      })
    : undefined;
  if (edgeBatches) {
    group.add(edgeBatches.group);
  }
  const placement = (source: Mesh): Matrix4 => {
    source.updateWorldMatrix(true, false);
    return local.multiplyMatrices(inverseRoot, source.matrixWorld);
  };
  const bounds = (batch: Batch): void => {
    batch.mesh.instanceMatrix.needsUpdate = true;
    batch.mesh.computeBoundingBox();
    batch.mesh.computeBoundingSphere();
  };
  const sync = (): void => {
    if (disposed) {
      return;
    }
    root.updateWorldMatrix(true, false);
    inverseRoot.copy(root.matrixWorld).invert();
    const memberships = new Map<string, Mesh[]>();
    const retainedKeys = new Set<string>();
    const compatibleCounts = new Map<string, number>();
    for (const source of sources) {
      restore(source);
      const material = Array.isArray(source.material) ? undefined : source.material;
      const shading = material ? materialKey(material, true) : undefined;
      if (
        !shading ||
        source.type !== 'Mesh' ||
        Boolean(source.morphTargetInfluences) ||
        Boolean(source.customDepthMaterial) ||
        Boolean(source.customDistanceMaterial) ||
        source.onBeforeRender !== Object3D.prototype.onBeforeRender ||
        source.onAfterRender !== Object3D.prototype.onAfterRender ||
        !supportedMatrix(placement(source))
      ) {
        continue;
      }
      const key = JSON.stringify([
        source.geometry.uuid,
        shading,
        source.renderOrder,
        source.frustumCulled,
        source.castShadow,
        source.receiveShadow,
        originalLayers.get(source)!.mask,
      ]);
      retainedKeys.add(key);
      compatibleCounts.set(key, (compatibleCounts.get(key) ?? 0) + 1);
      if (!worldVisible(source) || !material || !materialKey(material)) {
        continue;
      }
      const members = memberships.get(key) ?? [];
      members.push(source);
      memberships.set(key, members);
    }
    slots.clear();
    for (const [key, members] of memberships) {
      let batch = batches.get(key);
      const source = members[0]!;
      const capacity = compatibleCounts.get(key)!;
      if (batch && capacity > batch.mesh.instanceMatrix.count) {
        batch.mesh.removeFromParent();
        batch.mesh.dispose();
        batches.delete(key);
        batch = undefined;
      }
      if (!batch) {
        // A singleton saves no draw; leave it canonical and allocate no instance buffer.
        if ((compatibleCounts.get(key) ?? 0) < 2) {
          continue;
        }
        const mesh = new InstancedMesh(source.geometry, source.material, capacity);
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        mesh.raycast = () => undefined;
        mesh.userData[gltfSurfacePresentationTag] = true;
        mesh.renderOrder = source.renderOrder;
        mesh.frustumCulled = source.frustumCulled;
        mesh.castShadow = source.castShadow;
        mesh.receiveShadow = source.receiveShadow;
        mesh.layers.mask = originalLayers.get(source)!.mask;
        group.add(mesh);
        batch = { mesh, occurrences: [], matrices: [] };
        batches.set(key, batch);
      }
      let changed = batch.mesh.count !== members.length;
      batch.mesh.material = source.material;
      batch.mesh.count = members.length;
      batch.mesh.visible = true;
      for (const [slot, member] of members.entries()) {
        const matrix = placement(member);
        if (batch.occurrences[slot] !== member || !batch.matrices[slot]?.equals(matrix)) {
          batch.mesh.setMatrixAt(slot, matrix);
          (batch.matrices[slot] ??= new Matrix4()).copy(matrix);
          batch.mesh.instanceMatrix.addUpdateRange(slot * 16, 16);
          changed = true;
        }
        occurrenceLayers.set(member, originalLayers.get(member)!);
        member.layers.mask = 0;
        slots.set(member, { batch, slot });
      }
      batch.occurrences = members;
      if (changed) {
        bounds(batch);
      }
    }
    edgeBatches?.sync();
    // Retain the finite opaque endpoint across hide/isolate/opacity; it owns no material variants.
    for (const [key, batch] of batches) {
      if (!retainedKeys.has(key)) {
        batch.mesh.removeFromParent();
        batch.mesh.dispose();
        batches.delete(key);
      } else if (!memberships.has(key)) {
        batch.mesh.count = 0;
        batch.mesh.visible = false;
        batch.occurrences = [];
      }
    }
  };
  const owner: GltfSurfaceBatches = {
    group,
    sync,
    syncMatrices(changed) {
      if (disposed) {
        return;
      }
      root.updateWorldMatrix(true, false);
      inverseRoot.copy(root.matrixWorld).invert();
      const affected = new Set(changed.flatMap((object) => [...(descendants.get(object) ?? [])]));
      const dirty = new Set<Batch>();
      for (const source of affected) {
        const entry = slots.get(source);
        if (!entry) {
          sync();
          return;
        }
        const matrix = placement(source);
        if (!supportedMatrix(matrix)) {
          sync();
          return;
        }
        const { batch, slot } = entry;
        if (batch.matrices[slot]!.equals(matrix)) {
          continue;
        }
        batch.mesh.setMatrixAt(slot, matrix);
        batch.matrices[slot]!.copy(matrix);
        batch.mesh.instanceMatrix.addUpdateRange(slot * 16, 16);
        dirty.add(batch);
      }
      for (const batch of dirty) {
        bounds(batch);
      }
      edgeBatches?.syncMatrices(changed);
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      edgeBatches?.dispose();
      for (const source of sources) {
        restore(source);
      }
      for (const batch of batches.values()) {
        batch.mesh.removeFromParent();
        batch.mesh.dispose();
      }
      batches.clear();
      slots.clear();
      descendants.clear();
      group.removeFromParent();
      sceneBatches.delete(root);
    },
  };
  sceneBatches.set(root, owner);
  return owner;
}

/** Pose-owner seam: synchronizes only occurrences below the changed canonical objects. */
export function syncGltfSurfaceBatchMatrices(root: Object3D, changed: readonly Object3D[]): void {
  sceneBatches.get(root)?.syncMatrices(changed);
}

/** Disposes the current scene owner across in-place presentation revisions. */
export function disposeGltfSurfaceBatches(root: Object3D): void {
  sceneBatches.get(root)?.dispose();
}
