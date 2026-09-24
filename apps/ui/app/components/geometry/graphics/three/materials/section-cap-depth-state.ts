import type * as THREE from 'three';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import {
  applyGltfSurfaceDepthBias,
  gltfSurfacePolygonOffset,
} from '#components/geometry/graphics/three/materials/gltf-surface-depth-bias.js';

export type SectionCapDepthBias = Readonly<{
  polygonOffsetFactor: number;
  polygonOffsetUnits: number;
}>;

/**
 * The separation a section cap carries, read back from the shared surface bias.
 *
 * The cap is an opaque depth writer like any other surface, so it takes the one separation the
 * whole viewport uses rather than a second set of constants. That matters because the viewport
 * writes `gl_FragDepth`, which discards the rasterizer's polygon offset: a cap separated only by
 * `polygonOffset*` ties its own outline and the outline then drops out in pieces. See
 * `docs/research/viewer-emphasis-depth-and-coverage-blueprint.md` Finding 2.
 */
export function getSectionCapDepthBias(backend: ResolvedGraphicsBackend): SectionCapDepthBias {
  return gltfSurfacePolygonOffset[backend];
}

export function applySectionCapDepthState(material: THREE.Material, backend: ResolvedGraphicsBackend): void {
  material.transparent = false;
  material.depthTest = true;
  material.depthWrite = true;
  applyGltfSurfaceDepthBias(material, backend);
}
