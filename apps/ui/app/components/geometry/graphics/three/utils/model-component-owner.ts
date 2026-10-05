import { BufferGeometry, InstancedMesh, Mesh } from 'three';
import type { Matrix4, Object3D, Intersection } from 'three';
import type { GltfSectionSourceBinding } from '#components/geometry/graphics/three/utils/section-surface-topology.js';

export type ModelComponentOwner = Readonly<{
  unitId: string;
  componentId: string;
}>;

export const modelComponentOwnerUserDataKeys = {
  componentId: 'tauComponentId',
  unitId: 'tauUnitId',
} as const;

type UserDataRecord = Record<string, unknown>;

function getUserData(object: Object3D): UserDataRecord {
  return object.userData as UserDataRecord;
}

export function setModelComponentOwner(object: Object3D, owner: ModelComponentOwner): void {
  const userData = getUserData(object);
  userData[modelComponentOwnerUserDataKeys.componentId] = owner.componentId;
  userData[modelComponentOwnerUserDataKeys.unitId] = owner.unitId;
}

export function getModelComponentId(object: Object3D): string | undefined {
  const componentId = getUserData(object)[modelComponentOwnerUserDataKeys.componentId];
  return typeof componentId === 'string' ? componentId : undefined;
}

export function getModelComponentOwner(object: Object3D): ModelComponentOwner | undefined {
  const userData = getUserData(object);
  const componentId = userData[modelComponentOwnerUserDataKeys.componentId];
  const unitId = userData[modelComponentOwnerUserDataKeys.unitId];

  if (typeof componentId !== 'string' || typeof unitId !== 'string') {
    return undefined;
  }

  return { unitId, componentId };
}

export function getModelComponentIdInHierarchy(object: Object3D | undefined): string | undefined {
  let current = object;
  while (current !== undefined) {
    const componentId = getModelComponentId(current);
    if (componentId) {
      return componentId;
    }

    current = current.parent ?? undefined;
  }

  return undefined;
}

export function getModelComponentOwnerInHierarchy(object: Object3D | undefined): ModelComponentOwner | undefined {
  let current = object;
  while (current !== undefined) {
    const owner = getModelComponentOwner(current);
    if (owner) {
      return owner;
    }

    current = current.parent ?? undefined;
  }

  return undefined;
}

/** Candidate-owned slot evidence on the actual mesh; imported extras cannot manufacture this symbol. */
export type ModelComponentInstanceSlot = Readonly<{
  owner: ModelComponentOwner;
  sourceObject: Object3D;
  measurementFeatures?: unknown;
  sourceBinding?: GltfSectionSourceBinding;
}>;

const modelComponentInstanceSlots = Symbol('modelComponentInstanceSlots');
const modelComponentInstanceDescriptorBytes = Symbol('modelComponentInstanceDescriptorBytes');
type ModelComponentInstanceObject = InstancedMesh & {
  [modelComponentInstanceSlots]?: readonly ModelComponentInstanceSlot[];
  [modelComponentInstanceDescriptorBytes]?: number;
};

/** Bind all live draw slots at candidate construction; IDs never derive from array position. */
export function setModelComponentInstanceSlots(
  mesh: InstancedMesh,
  slots: readonly ModelComponentInstanceSlot[],
): void {
  if (slots.length !== mesh.count) {
    throw new RangeError('Instance slots do not match actual draw count');
  }
  const bound: ModelComponentInstanceObject = mesh;
  if (bound[modelComponentInstanceSlots]) {
    throw new Error('Instance ownership is already bound');
  }
  const encoder = new TextEncoder();
  let descriptorBytes = 0;
  for (const slot of slots) {
    descriptorBytes += encoder.encode(
      JSON.stringify({
        owner: slot.owner,
        sourceObjectId: slot.sourceObject.id,
        occurrenceId: slot.sourceBinding?.occurrenceId,
        measurementFeatures: slot.measurementFeatures,
      }),
    ).byteLength;
  }
  bound[modelComponentInstanceDescriptorBytes] = descriptorBytes;
  bound[modelComponentInstanceSlots] = Object.freeze(
    slots.map((slot) =>
      Object.freeze({
        ...slot,
        owner: Object.freeze({ ...slot.owner }),
      }),
    ),
  );
  const clear = (): void => {
    Reflect.deleteProperty(bound, modelComponentInstanceSlots);
    Reflect.deleteProperty(bound, modelComponentInstanceDescriptorBytes);
    mesh.removeEventListener('dispose', clear);
  };
  mesh.addEventListener('dispose', clear);
}

/** No ancestor fallback is permitted for an instance whose live slot has no canonical evidence. */
export function getModelComponentInstanceSlot(
  object: Object3D,
  instanceId: number | undefined,
): ModelComponentInstanceSlot | undefined {
  if (
    !(object instanceof InstancedMesh) ||
    instanceId === undefined ||
    !Number.isSafeInteger(instanceId) ||
    instanceId < 0 ||
    instanceId >= object.count
  ) {
    return undefined;
  }
  const slots = (object as ModelComponentInstanceObject)[modelComponentInstanceSlots];
  return slots?.length === object.count ? slots[instanceId] : undefined;
}

export function getModelComponentInstanceSlots(object: Object3D): readonly ModelComponentInstanceSlot[] | undefined {
  if (!(object instanceof InstancedMesh)) {
    return undefined;
  }
  const slots = (object as ModelComponentInstanceObject)[modelComponentInstanceSlots];
  return slots?.length === object.count ? slots : undefined;
}

/** Resolve a genuine hit's canonical identity while preserving ordinary mesh inheritance. */
export function getModelComponentHitOwner(
  hit: Pick<Intersection, 'object' | 'instanceId'>,
): ModelComponentOwner | undefined {
  return hit.object instanceof InstancedMesh
    ? getModelComponentInstanceSlot(hit.object, hit.instanceId)?.owner
    : getModelComponentOwnerInHierarchy(hit.object);
}

/** Actual primitive placement including intrinsic source placement; native exact E*O remains separate. */
export function getModelComponentWorldMatrix(
  object: Object3D,
  instanceId: number | undefined,
  target: Matrix4,
): Matrix4 | undefined {
  if (object instanceof InstancedMesh) {
    if (!getModelComponentInstanceSlot(object, instanceId)) {
      return undefined;
    }
    object.getMatrixAt(instanceId!, target);
    return target.premultiply(object.matrixWorld);
  }
  return target.copy(object.matrixWorld);
}

/** Serialized descriptor allowance only; object/string heap costs are not an exact browser-memory measurement. */
export function getModelComponentInstanceDescriptorBytes(object: Object3D): number {
  return object instanceof InstancedMesh
    ? ((object as ModelComponentInstanceObject)[modelComponentInstanceDescriptorBytes] ?? 0)
    : 0;
}

/** A coarse display level never substitutes for immutable canonical engineering surface evidence. */
export function getModelComponentSourceGeometry(object: Object3D, instanceId?: number): BufferGeometry | undefined {
  const source =
    object instanceof InstancedMesh ? getModelComponentInstanceSlot(object, instanceId)?.sourceObject : object;
  const geometry: unknown = source instanceof Mesh ? source.geometry : undefined;
  return geometry instanceof BufferGeometry ? geometry : undefined;
}
