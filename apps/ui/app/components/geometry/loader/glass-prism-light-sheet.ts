import { BufferAttribute, BufferGeometry, DynamicDrawUsage } from 'three';
import type { RaySegment, RaySegmentKind } from '#components/geometry/loader/glass-prism-light-field.js';
import { lightRibbonAttributeNames } from '#components/geometry/loader/glass-prism-material.node.js';

/**
 * Geometry for the traced light: every segment becomes a flat ribbon lying in the sheet plane, two
 * triangles wide enough to glow. Buffers are allocated once for a capacity and refilled each frame.
 */

export type LightSheetGeometry = Readonly<{
  geometry: BufferGeometry;
  /** Refill the buffers from `segments`, dropping any beyond capacity. Returns the ribbons drawn. */
  update: (segments: readonly RaySegment[]) => number;
  dispose: () => void;
}>;

/** Ribbon half-widths in render units, per kind; the white beam is the widest. */
const halfWidths: Readonly<Record<RaySegmentKind, number>> = {
  incident: 0.04,
  internal: 0.028,
  exit: 0.032,
  stray: 0.018,
};

const verticesPerRibbon = 6;
/** Corner order of the two triangles, as `along, across` in 0..1. */
const corners: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 0],
  [1, 1],
  [0, 1],
];

/** Allocate ribbon buffers for up to `capacity` segments; `widthScale` widens every ribbon, for small surfaces. */
export const createLightSheetGeometry = (capacity: number, widthScale = 1): LightSheetGeometry => {
  const vertexCount = capacity * verticesPerRibbon;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const profiles = new Float32Array(vertexCount * 2);
  const geometry = new BufferGeometry();
  const positionAttribute = new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage);
  const colorAttribute = new BufferAttribute(colors, 3).setUsage(DynamicDrawUsage);
  const uvAttribute = new BufferAttribute(uvs, 2).setUsage(DynamicDrawUsage);
  const profileAttribute = new BufferAttribute(profiles, 2).setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('uv', uvAttribute);
  geometry.setAttribute(lightRibbonAttributeNames.color, colorAttribute);
  geometry.setAttribute(lightRibbonAttributeNames.profile, profileAttribute);
  geometry.setDrawRange(0, 0);

  const update = (segments: readonly RaySegment[]): number => {
    const count = Math.min(capacity, segments.length);
    for (let index = 0; index < count; index += 1) {
      const segment = segments[index]!;
      const dx = segment.end[0] - segment.start[0];
      const dz = segment.end[1] - segment.start[1];
      const length = Math.hypot(dx, dz) || 1;
      const halfWidth = halfWidths[segment.kind] * widthScale;
      // Perpendicular in the sheet plane, scaled to the ribbon's half-width.
      const px = (-dz / length) * halfWidth;
      const pz = (dx / length) * halfWidth;
      for (const [corner, [along, across]] of corners.entries()) {
        const vertex = index * verticesPerRibbon + corner;
        const side = across * 2 - 1;
        positions[vertex * 3] = segment.start[0] + dx * along + px * side;
        positions[vertex * 3 + 1] = 0;
        positions[vertex * 3 + 2] = segment.start[1] + dz * along + pz * side;
        colors[vertex * 3] = segment.color[0];
        colors[vertex * 3 + 1] = segment.color[1];
        colors[vertex * 3 + 2] = segment.color[2];
        uvs[vertex * 2] = along;
        uvs[vertex * 2 + 1] = across;
        profiles[vertex * 2] = segment.intensity;
        profiles[vertex * 2 + 1] = segment.taper ? 1 : 0;
      }
    }
    geometry.setDrawRange(0, count * verticesPerRibbon);
    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
    uvAttribute.needsUpdate = true;
    profileAttribute.needsUpdate = true;
    return count;
  };

  return {
    geometry,
    update,
    dispose: () => {
      geometry.dispose();
    },
  };
};
