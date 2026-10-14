import type { Object3D } from 'three';

/**
 * Identifies the model component, and the unit that produced it, that a scene object belongs to.
 *
 * @public
 */
export type ModelComponentOwner = Readonly<{
  unitId: string;
  componentId: string;
}>;

/**
 * The `userData` keys under which a scene object's component owner is stored.
 *
 * @public
 */
export const modelComponentOwnerUserDataKeys = {
  componentId: 'tauComponentId',
  unitId: 'tauUnitId',
} as const;

type UserDataRecord = Record<string, unknown>;

function getUserData(object: Object3D): UserDataRecord {
  return object.userData as UserDataRecord;
}

/**
 * Records the component owner of a scene object in its `userData`.
 *
 * @param object - The scene object to tag.
 * @param owner - The unit and component the object belongs to.
 * @public
 */
export function setModelComponentOwner(object: Object3D, owner: ModelComponentOwner): void {
  const userData = getUserData(object);
  userData[modelComponentOwnerUserDataKeys.componentId] = owner.componentId;
  userData[modelComponentOwnerUserDataKeys.unitId] = owner.unitId;
}

/**
 * Reads the component id stored on a scene object, without searching its ancestors.
 *
 * @param object - The scene object to read.
 * @returns The component id, or `undefined` when the object is not tagged.
 * @public
 */
export function getModelComponentId(object: Object3D): string | undefined {
  const componentId = getUserData(object)[modelComponentOwnerUserDataKeys.componentId];
  return typeof componentId === 'string' ? componentId : undefined;
}

/**
 * Reads the component owner stored on a scene object, without searching its ancestors.
 *
 * @param object - The scene object to read.
 * @returns The owner, or `undefined` when the object lacks a component or unit id.
 * @public
 */
export function getModelComponentOwner(object: Object3D): ModelComponentOwner | undefined {
  const userData = getUserData(object);
  const componentId = userData[modelComponentOwnerUserDataKeys.componentId];
  const unitId = userData[modelComponentOwnerUserDataKeys.unitId];

  if (typeof componentId !== 'string' || typeof unitId !== 'string') {
    return undefined;
  }

  return { unitId, componentId };
}

/**
 * Finds the component id of a scene object or its nearest tagged ancestor.
 *
 * @param object - The scene object to start from.
 * @returns The first component id found walking up the parents, or `undefined`.
 * @public
 */
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

/**
 * Finds the component owner of a scene object or its nearest tagged ancestor.
 *
 * @param object - The scene object to start from.
 * @returns The first owner found walking up the parents, or `undefined`.
 * @public
 */
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
