import type {
  CapMultiPolygon,
  CapPoint2,
  CapRing,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';

const samePointEpsilon = 1e-10;

export const sectionCapClipperDecimalPrecision = 8;

export const isSameCapPoint = (a: CapPoint2, b: CapPoint2): boolean =>
  Math.abs(a[0] - b[0]) <= samePointEpsilon && Math.abs(a[1] - b[1]) <= samePointEpsilon;

export const stripClosingCapPoint = (ring: CapRing): CapRing => {
  if (ring.length > 1 && isSameCapPoint(ring[0]!, ring.at(-1)!)) {
    return ring.slice(0, -1);
  }

  return ring;
};

export const sanitizeCapRing = (ring: readonly CapPoint2[]): CapRing =>
  stripClosingCapPoint(
    ring.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).map(([x, y]) => [x, y] satisfies CapPoint2),
  );

export const sanitizeCapMultiPolygon = (multiPolygon: CapMultiPolygon): CapMultiPolygon =>
  multiPolygon
    .map((polygon) => polygon.map((ring) => sanitizeCapRing(ring)).filter((ring) => ring.length >= 3))
    .filter((polygon) => polygon.length > 0);

export const capMultiPolygonIsEmpty = (multiPolygon: CapMultiPolygon): boolean =>
  sanitizeCapMultiPolygon(multiPolygon).length === 0;
