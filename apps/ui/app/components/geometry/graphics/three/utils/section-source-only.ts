import type { Material, Object3D } from 'three';

export const sectionSourceOnlyUserDataKey = 'tauSectionSourceOnly';

export function isSectionSourceOnlyObject(object: Object3D): boolean {
  return object.userData[sectionSourceOnlyUserDataKey] === true;
}

export function markSectionSourceOnlyObject(object: Object3D): void {
  object.userData[sectionSourceOnlyUserDataKey] = true;
}

export function configureSectionSourceOnlyMaterial(material: Material): void {
  material.visible = true;
  material.transparent = true;
  material.opacity = 0;
  material.depthWrite = false;
  material.colorWrite = false;
  material.needsUpdate = true;
}
