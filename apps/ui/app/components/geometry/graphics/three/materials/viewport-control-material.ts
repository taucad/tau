import type { Side, Texture } from 'three';
import { Color, DoubleSide, FrontSide, MeshBasicMaterial, MeshMatcapMaterial } from 'three';

export function createViewportControlBodyMaterial({
  matcap,
  side = DoubleSide,
  depthTest = false,
  depthWrite = false,
}: {
  readonly matcap: Texture;
  readonly side?: Side;
  readonly depthTest?: boolean;
  readonly depthWrite?: boolean;
}): MeshMatcapMaterial {
  return new MeshMatcapMaterial({
    matcap,
    color: new Color(0xff_ff_ff),
    vertexColors: true,
    depthTest,
    depthWrite,
    transparent: false,
    opacity: 1,
    side,
    fog: false,
    toneMapped: false,
  });
}

export function createViewportControlSelfOccludingBodyMaterial({
  matcap,
  side = FrontSide,
}: {
  readonly matcap: Texture;
  readonly side?: Side;
}): MeshMatcapMaterial {
  return createViewportControlBodyMaterial({ matcap, side, depthTest: true, depthWrite: true });
}

export function setViewportControlMaterialOpacity(material: MeshMatcapMaterial, opacity: number): void {
  const nextTransparent = opacity < 1;
  material.opacity = opacity;

  if (material.transparent !== nextTransparent) {
    material.transparent = nextTransparent;
    material.needsUpdate = true;
  }
}

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
