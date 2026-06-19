import type * as THREE from 'three';
import { buildPackedSectionCapGeometry } from '#components/geometry/graphics/three/utils/section-cap-packed-geometry.js';
import type {
  PackedSectionCapGeometryBuffers,
  SectionCapPackedGeometryArena,
} from '#components/geometry/graphics/three/utils/section-cap-packed-geometry.js';
import type { SectionCutPlaneBasis } from '#components/geometry/graphics/three/utils/section-cap-region.js';
import type { CapMultiPolygon } from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';
import type { SectionCapPackingDebugSink } from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';

const neutralBaseColor = 0xff_ff_ff;
const neutralStripeColor = 0xff_ff_ff;
const defaultStripeAxis = [0, 1] as const;

export const buildCurrentSectionBaseCapGeometry = (options: {
  multiPolygon: CapMultiPolygon;
  basis: SectionCutPlaneBasis;
  meshWorldInverse: THREE.Matrix4;
  arena?: SectionCapPackedGeometryArena;
  debugSink?: SectionCapPackingDebugSink;
}): PackedSectionCapGeometryBuffers =>
  buildPackedSectionCapGeometry({
    parts:
      options.multiPolygon.length === 0
        ? []
        : [
            {
              multiPolygon: options.multiPolygon,
              baseColor: neutralBaseColor,
              stripeColor: neutralStripeColor,
              patternStrength: 1,
              stripeAxis: defaultStripeAxis,
              regionKind: 'normal',
            },
          ],
    basis: options.basis,
    meshWorldInverse: options.meshWorldInverse,
    arena: options.arena,
    debugSink: options.debugSink,
  });
