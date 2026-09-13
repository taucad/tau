import type { GeoSpecAssertionMatchers } from '#assertion-client/index.js';

const holes = [
  { diameter: 2, center: [1, 2, 3] },
  { diameter: 2, center: { x: 1, y: 2, z: 3 } },
  { diameter: 2, center: { x: 1 } },
  { diameter: 2, center: {} },
  { diameter: 2 },
] satisfies readonly Parameters<GeoSpecAssertionMatchers['toHaveCircularHole']>[0][];

const patterns = [
  { count: 4, holeDiameter: 2, center: [1, 2, 3] },
  { count: 4, holeDiameter: 2, center: { x: 1, y: 2, z: 3 } },
  { count: 4, holeDiameter: 2, center: { x: 1 } },
  { count: 4, holeDiameter: 2, center: {} },
  { count: 4, holeDiameter: 2 },
] satisfies readonly Parameters<GeoSpecAssertionMatchers['toHaveCircularHolePattern']>[0][];

const wrongLength: Parameters<GeoSpecAssertionMatchers['toHaveCircularHole']>[0] = {
  diameter: 2,
  // @ts-expect-error A point vector requires exactly three coordinates.
  center: [1, 2],
};

void holes;
void patterns;
void wrongLength;
