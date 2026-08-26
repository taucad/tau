// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildPackedSectionCapGeometry,
  createSectionCapPackedGeometryArena,
} from '#components/geometry/graphics/three/utils/section-cap-packed-geometry.js';
import { createSectionCutPlaneBasis } from '#components/geometry/graphics/three/utils/section-cap-region.js';
import type { CapMultiPolygon } from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';

type RectangleBounds = Readonly<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}>;

const square = ({ minX, minY, maxX, maxY }: RectangleBounds): CapMultiPolygon => [
  [
    [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
    ],
  ],
];

describe('buildPackedSectionCapGeometry', () => {
  it('should pack normal and overlap cap regions into one finite vertex-colored buffer set', () => {
    const basis = createSectionCutPlaneBasis({
      worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    });
    const normalStripeAxis = [Math.SQRT1_2, Math.SQRT1_2] as const;
    const overlapStripeAxis = [Math.SQRT1_2, -Math.SQRT1_2] as const;

    const buffers = buildPackedSectionCapGeometry({
      basis,
      meshWorldInverse: new THREE.Matrix4(),
      parts: [
        {
          multiPolygon: square({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
          baseColor: 0xcc_cc_cc,
          stripeColor: 0xaa_aa_aa,
          patternStrength: 1,
          stripeAxis: normalStripeAxis,
          regionKind: 'normal',
        },
        {
          multiPolygon: square({ minX: 0.25, minY: 0.25, maxX: 0.75, maxY: 0.75 }),
          baseColor: 0xb9_1c_1c,
          stripeColor: 0xfd_e0_47,
          patternStrength: 1,
          stripeAxis: overlapStripeAxis,
          regionKind: 'overlap',
        },
      ],
    });

    expect(buffers.positions.length).toBeGreaterThan(0);
    expect(buffers.indices.length).toBe(12);
    expect(buffers.planeUv.length).toBe((buffers.positions.length / 3) * 2);
    expect(buffers.baseColors.length).toBe(buffers.positions.length);
    expect(buffers.stripeColors.length).toBe(buffers.positions.length);
    expect(buffers.patternStrengths.length).toBe(buffers.positions.length / 3);
    expect(buffers.stripeAxes.length).toBe((buffers.positions.length / 3) * 2);
    expect(buffers.regionKinds.length).toBe(buffers.positions.length / 3);
    expect([...buffers.positions].every((value) => Number.isFinite(value))).toBe(true);
    expect(new Set([...buffers.baseColors].map((value) => value.toFixed(4))).size).toBeGreaterThan(1);
    expect(new Set(buffers.patternStrengths)).toEqual(new Set([1]));
    expect(new Set(buffers.regionKinds)).toEqual(new Set([0, 1]));
    expect(new Set([...buffers.stripeAxes].map((value) => value.toFixed(4)))).toEqual(
      new Set([Math.SQRT1_2.toFixed(4), (-Math.SQRT1_2).toFixed(4)]),
    );
  });

  it('should report packed geometry debug sink counters matching returned buffers', () => {
    const basis = createSectionCutPlaneBasis({
      worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    });
    const recorded: Array<{
      partCount: number;
      triangulatedPolygonCount: number;
      packedVertexCount: number;
      packedIndexCount: number;
      packedByteCount: number;
    }> = [];

    const buffers = buildPackedSectionCapGeometry({
      basis,
      meshWorldInverse: new THREE.Matrix4(),
      debugSink: {
        recordPackedGeometry(stats) {
          recorded.push(stats);
        },
      },
      parts: [
        {
          multiPolygon: square({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
          baseColor: 0xcc_cc_cc,
          stripeColor: 0xaa_aa_aa,
          patternStrength: 1,
          stripeAxis: [1, 0],
          regionKind: 'normal',
        },
      ],
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toEqual({
      partCount: 1,
      triangulatedPolygonCount: 1,
      packedVertexCount: buffers.positions.length / 3,
      packedIndexCount: buffers.indices.length,
      packedByteCount:
        buffers.positions.byteLength +
        buffers.planeUv.byteLength +
        buffers.baseColors.byteLength +
        buffers.stripeColors.byteLength +
        buffers.patternStrengths.byteLength +
        buffers.stripeAxes.byteLength +
        buffers.regionKinds.byteLength +
        buffers.indices.byteLength,
    });
  });

  it('should reuse arena backing buffers across compatible packed builds', () => {
    const basis = createSectionCutPlaneBasis({
      worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    });
    const arena = createSectionCapPackedGeometryArena();
    const part = {
      multiPolygon: square({ minX: 0, minY: 0, maxX: 1, maxY: 1 }),
      baseColor: 0xcc_cc_cc,
      stripeColor: 0xaa_aa_aa,
      patternStrength: 1,
      stripeAxis: [1, 0],
      regionKind: 'normal',
    } as const;

    const first = buildPackedSectionCapGeometry({
      arena,
      basis,
      meshWorldInverse: new THREE.Matrix4(),
      parts: [part],
    });
    const second = buildPackedSectionCapGeometry({
      arena,
      basis,
      meshWorldInverse: new THREE.Matrix4(),
      parts: [part],
    });

    expect(second.positions.buffer).toBe(first.positions.buffer);
    expect(second.indices.buffer).toBe(first.indices.buffer);
    expect(second.regionKinds.buffer).toBe(first.regionKinds.buffer);
    expect(second.positions.length).toBe(first.positions.length);
    expect(second.indices.length).toBe(first.indices.length);
    expect(second.regionKinds.length).toBe(first.regionKinds.length);
  });
});
