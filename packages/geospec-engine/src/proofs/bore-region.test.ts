import { describe, expect, it } from 'vitest';
import type { Vec3 } from '#mesh/types.js';
import { boreRegionOf, measureBoreFit, pointInBore } from '#proofs/bore-region.js';
import type { ProofEndpoint } from '#proofs/context.js';
import type { GeometryFacts } from '#selector/types.js';

/** A cylindrical face along `direction`, spanning `[from, to]` from the origin. */
const cylinderFace = (options: {
  origin?: Vec3;
  direction?: Vec3;
  radius: number;
  from: number;
  to: number;
  surfaceType?: GeometryFacts['surfaceType'];
  omit?: 'axisOrigin' | 'axisDirection' | 'radius' | 'bounds' | 'face';
}): ProofEndpoint => {
  const origin = options.origin ?? [0, 0, 0];
  const direction = options.direction ?? [1, 0, 0];
  const { radius } = options;
  // Bounds of the cylinder: the axial span plus the radius on the other axes.
  const along = (t: number, axis: number): number => origin[axis]! + direction[axis]! * t;
  const min: Vec3 = [0, 1, 2].map(
    (axis) => Math.min(along(options.from, axis), along(options.to, axis)) - (direction[axis] === 0 ? radius : 0),
  ) as unknown as Vec3;
  const max: Vec3 = [0, 1, 2].map(
    (axis) => Math.max(along(options.from, axis), along(options.to, axis)) + (direction[axis] === 0 ? radius : 0),
  ) as unknown as Vec3;
  const facts: GeometryFacts = {
    surfaceType: options.surfaceType ?? 'cylinder',
    ...(options.omit === 'axisOrigin' ? {} : { axisOrigin: origin }),
    ...(options.omit === 'axisDirection' ? {} : { axisDirection: direction }),
    ...(options.omit === 'radius' ? {} : { radius }),
    ...(options.omit === 'bounds' ? {} : { bounds: { min, max } }),
    faceIndex: 0,
  };
  return { occurrence: 0, face: options.omit === 'face' ? -1 : 0, facts };
};

const boreA = boreRegionOf(cylinderFace({ radius: 11.03, from: -30, to: -14 }))!;

describe('boreRegionOf', () => {
  it('should read the face radius and its own axial extent', () => {
    expect(boreA).toEqual({
      origin: [0, 0, 0],
      direction: [1, 0, 0],
      radius: 11.03,
      from: -30,
      to: -14,
    });
  });

  it('should normalize the axis direction', () => {
    const bore = boreRegionOf(cylinderFace({ radius: 2, direction: [0, 0, 3], from: 0, to: 10 }));
    expect(bore?.direction).toEqual([0, 0, 1]);
  });

  it('should refuse anything that is not a complete analytic cylindrical face', () => {
    expect(boreRegionOf(cylinderFace({ radius: 2, from: 0, to: 1, omit: 'face' }))).toBeUndefined();
    expect(boreRegionOf(cylinderFace({ radius: 2, from: 0, to: 1, surfaceType: 'plane' }))).toBeUndefined();
    expect(boreRegionOf(cylinderFace({ radius: 2, from: 0, to: 1, omit: 'axisOrigin' }))).toBeUndefined();
    expect(boreRegionOf(cylinderFace({ radius: 2, from: 0, to: 1, omit: 'axisDirection' }))).toBeUndefined();
    expect(boreRegionOf(cylinderFace({ radius: 2, from: 0, to: 1, omit: 'radius' }))).toBeUndefined();
    expect(boreRegionOf(cylinderFace({ radius: 2, from: 0, to: 1, omit: 'bounds' }))).toBeUndefined();
    expect(boreRegionOf(cylinderFace({ radius: 2, direction: [0, 0, 0], from: 0, to: 1 }))).toBeUndefined();
  });
});

describe('pointInBore', () => {
  it('should hold inside the radius and inside the face extent', () => {
    expect(pointInBore(boreA, [-20, 0, 0])).toBe(true);
    expect(pointInBore(boreA, [-20, 11, 0])).toBe(true);
  });

  it('should fail outside the radius', () => {
    expect(pointInBore(boreA, [-20, 12, 0])).toBe(false);
  });

  it('should fail beyond either end of the face extent', () => {
    expect(pointInBore(boreA, [-31, 0, 0])).toBe(false);
    expect(pointInBore(boreA, [-13, 0, 0])).toBe(false);
  });
});

describe('measureBoreFit', () => {
  const pin = (from: number, to: number, radius = 11): ProofEndpoint => cylinderFace({ radius, from, to });

  it('should measure a pin that fits and engages', () => {
    const fit = measureBoreFit(pin(-32, 32), boreA, 0.5)!;
    expect(fit.clearance).toBeCloseTo(0.03, 9);
    expect(fit.engagement).toBeCloseTo(16, 9);
    expect(fit.offset).toBe(0);
    expect(fit.angle).toBe(0);
    expect(fit.witness).toEqual([-22, 0, 0]);
  });

  it('should report zero engagement when the extents miss each other', () => {
    expect(measureBoreFit(pin(-32, -12), boreA, 0.5)?.engagement).toBeCloseTo(16, 9);
    const boreB = boreRegionOf(cylinderFace({ radius: 11.03, from: 14, to: 30 }))!;
    expect(measureBoreFit(pin(-32, -12), boreB, 0.5)?.engagement).toBe(0);
  });

  it('should report a negative clearance for a pin that overruns the bore radius', () => {
    expect(measureBoreFit(pin(-32, 32, 12), boreA, 0.5)?.clearance).toBeCloseTo(-0.97, 9);
  });

  it('should charge an off-axis pin its radial offset', () => {
    const offAxis = cylinderFace({ origin: [0, 0.5, 0], radius: 11, from: -32, to: 32 });
    const fit = measureBoreFit(offAxis, boreA, 0.5)!;
    expect(fit.offset).toBeCloseTo(0.5, 9);
    expect(fit.clearance).toBeCloseTo(-0.47, 9);
  });

  it('should read an anti-parallel subject axis in the bore frame', () => {
    const reversed = cylinderFace({ direction: [-1, 0, 0], radius: 11, from: -32, to: 32 });
    expect(measureBoreFit(reversed, boreA, 0.5)?.engagement).toBeCloseTo(16, 9);
  });

  it('should refuse a non-cylindrical subject', () => {
    expect(
      measureBoreFit(cylinderFace({ radius: 5, from: 0, to: 1, surfaceType: 'plane' }), boreA, 0.5),
    ).toBeUndefined();
  });

  it('should refuse a skewed subject axis', () => {
    const skewed = cylinderFace({ direction: [0, 0, 1], radius: 11, from: -32, to: 32 });
    expect(measureBoreFit(skewed, boreA, 0.5)).toBeUndefined();
  });
});
