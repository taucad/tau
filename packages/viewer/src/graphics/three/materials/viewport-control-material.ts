import type { Texture } from 'three';
import { MeshBasicMaterial } from 'three';

export function createViewportControlLabelMaterial({ map }: { readonly map: Texture }): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map,
    color: 0x00_00_00,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 1,
    fog: false,
    toneMapped: false,
  });
}

export function createViewportControlSelectorLabelMaterial({ map }: { readonly map: Texture }): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map,
    color: 0x00_00_00,
    alphaTest: 0,
    depthTest: true,
    depthWrite: false,
    transparent: true,
    opacity: 1,
    fog: false,
    toneMapped: false,
  });
}
