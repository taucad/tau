import * as THREE from 'three';
import { capPointToWorld } from '#components/geometry/graphics/three/utils/section-cap-region.js';
import type { SectionCutPlaneBasis } from '#components/geometry/graphics/three/utils/section-cap-region.js';
import type { CapMultiPolygon, CapRing } from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';

export type SectionCapBoundaryStats = Readonly<{
  ringCount: number;
  segmentCount: number;
}>;

export type SectionCapBoundaryPositionsResult = Readonly<{
  positions: Float32Array;
  stats: SectionCapBoundaryStats;
}>;

const floatsPerSegment = 6;
const _firstWorld = /* @__PURE__ */ new THREE.Vector3();
const _secondWorld = /* @__PURE__ */ new THREE.Vector3();

const countRingSegments = (ring: CapRing): number => (ring.length >= 2 ? ring.length : 0);

export const countSectionCapBoundarySegments = (multiPolygon: CapMultiPolygon): SectionCapBoundaryStats => {
  let ringCount = 0;
  let segmentCount = 0;

  for (const polygon of multiPolygon) {
    for (const ring of polygon) {
      const ringSegments = countRingSegments(ring);
      if (ringSegments === 0) {
        continue;
      }

      ringCount++;
      segmentCount += ringSegments;
    }
  }

  return { ringCount, segmentCount };
};

export const buildSectionCapBoundaryPositions = (options: {
  multiPolygon: CapMultiPolygon;
  basis: SectionCutPlaneBasis;
  meshWorldInverse: THREE.Matrix4;
  planeNormalBias?: number;
}): SectionCapBoundaryPositionsResult => {
  const stats = countSectionCapBoundarySegments(options.multiPolygon);
  if (stats.segmentCount === 0) {
    return { positions: new Float32Array(0), stats };
  }

  const positions = new Float32Array(stats.segmentCount * floatsPerSegment);
  const bias = options.planeNormalBias ?? 0;
  let writeIndex = 0;

  for (const polygon of options.multiPolygon) {
    for (const ring of polygon) {
      if (ring.length < 2) {
        continue;
      }

      for (let index = 0; index < ring.length; index++) {
        const current = ring[index]!;
        const next = ring[(index + 1) % ring.length]!;
        _firstWorld.copy(capPointToWorld(current, options.basis));
        _secondWorld.copy(capPointToWorld(next, options.basis));
        if (bias !== 0) {
          _firstWorld.addScaledVector(options.basis.normal, bias);
          _secondWorld.addScaledVector(options.basis.normal, bias);
        }
        _firstWorld.applyMatrix4(options.meshWorldInverse);
        _secondWorld.applyMatrix4(options.meshWorldInverse);

        positions[writeIndex++] = _firstWorld.x;
        positions[writeIndex++] = _firstWorld.y;
        positions[writeIndex++] = _firstWorld.z;
        positions[writeIndex++] = _secondWorld.x;
        positions[writeIndex++] = _secondWorld.y;
        positions[writeIndex++] = _secondWorld.z;
      }
    }
  }

  return { positions, stats };
};
