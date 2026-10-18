import { expect, it } from 'vitest';
import { renderedXyCircle } from '#support/rendered-circle.js';

type Point = readonly [number, number, number];
const circlePoints = (center: Point): Point[] =>
  Array.from({ length: 37 }, (_, index) => {
    // Odd, uneven sampling has no opposite vertices or exact cardinal extrema.
    const angle = 0.13 + (index / 37) ** 1.2 * Math.PI * 2;
    return [center[0] + 0.087 * Math.cos(angle), center[1] + 0.087 * Math.sin(angle), center[2]] as const;
  }).flatMap(([x, y, z]) => [
    [x, y, z - 0.008],
    [x, y, z + 0.008],
  ]);

it('should recover an unevenly tessellated translated circle without assuming symmetric extrema', () => {
  const expected: Point = [1.25, -0.32, 0.007];
  const points = circlePoints(expected);
  // Internal/chamfer vertices cannot replace outer circular support points.
  points.push([expected[0] + 0.04, expected[1], expected[2]]);
  const boundsCenterX = (Math.min(...points.map(([x]) => x)) + Math.max(...points.map(([x]) => x))) / 2;
  expect(Math.abs(boundsCenterX - expected[0])).toBeGreaterThan(1e-7);
  const measured = renderedXyCircle(points);
  expect(measured.radius).toBeCloseTo(0.087, 12);
  for (const [axis, coordinate] of measured.center.entries()) {
    expect(coordinate).toBeCloseTo(expected[axis]!, 12);
  }
});

it('should preserve displacement so the unchanged orbit and anchor thresholds reject actual placement corruption', () => {
  const gear: Point = [0.048, 0, 0.007];
  const centered = renderedXyCircle(circlePoints([0, 0, 0.007]));
  const shifted = renderedXyCircle(circlePoints([0.00003, 0, 0.007]));
  const distance = (a: Point, b: Point) => Math.hypot(...a.map((value, axis) => value - b[axis]!));
  expect(Math.abs(distance(gear, centered.center) - 0.048)).toBeLessThan(1e-7);
  expect(Math.abs(distance(gear, shifted.center) - 0.048)).toBeGreaterThan(1e-7);
  const displacedPin: Point = [0.04803, 0, 0.007];
  expect(distance(gear, displacedPin)).toBeGreaterThan(1e-7);
});

it('should refuse absent or collinear circle support instead of returning a misleading center', () => {
  expect(() => renderedXyCircle([])).toThrow('without surface vertices');
  expect(() =>
    renderedXyCircle([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]),
  ).toThrow('degenerate');
});
