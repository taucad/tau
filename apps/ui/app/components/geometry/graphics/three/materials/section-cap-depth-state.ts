import type * as THREE from 'three';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';

export type SectionCapDepthBias = Readonly<{
  polygonOffsetFactor: number;
  polygonOffsetUnits: number;
}>;

const sectionCapDepthBiasByBackend = {
  webgl: {
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  },
  webgpu: {
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  },
} as const satisfies Record<ResolvedGraphicsBackend, SectionCapDepthBias>;

export function getSectionCapDepthBias(backend: ResolvedGraphicsBackend): SectionCapDepthBias {
  return sectionCapDepthBiasByBackend[backend];
}

export function applySectionCapDepthState(material: THREE.Material, backend: ResolvedGraphicsBackend): void {
  const bias = getSectionCapDepthBias(backend);

  material.transparent = false;
  material.depthTest = true;
  material.depthWrite = true;
  material.polygonOffset = true;
  material.polygonOffsetFactor = bias.polygonOffsetFactor;
  material.polygonOffsetUnits = bias.polygonOffsetUnits;
}
