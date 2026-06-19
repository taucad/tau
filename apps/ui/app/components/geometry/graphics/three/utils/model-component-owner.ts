import type { Object3D } from 'three';

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
