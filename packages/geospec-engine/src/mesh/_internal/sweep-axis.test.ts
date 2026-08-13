import { describe, expect, it } from 'vitest';
import { sweepAxisByCentreVariance } from '#mesh/_internal/sweep-axis.js';

describe('sweepAxisByCentreVariance', () => {
  it('should pick the axis the centres actually spread along', () => {
    expect(
      sweepAxisByCentreVariance([
        [0, 0, 0],
        [10, 0, 0],
        [20, 0, 0],
      ]),
    ).toBe(0);
    expect(
      sweepAxisByCentreVariance([
        [0, 0, 0],
        [0, 10, 0],
        [0, 20, 0],
      ]),
    ).toBe(1);
    expect(
      sweepAxisByCentreVariance([
        [0, 0, 0],
        [0, 0, 10],
        [0, 0, 20],
      ]),
    ).toBe(2);
  });

  it('should resolve ties x then y so the choice is a pure function of the geometry', () => {
    // Identical spread on all three axes: x wins, never insertion order.
    const cube: Array<[number, number, number]> = [
      [0, 0, 0],
      [10, 10, 10],
    ];
    expect(sweepAxisByCentreVariance(cube)).toBe(0);
    expect(sweepAxisByCentreVariance([...cube].reverse())).toBe(0);
    // Y ties z with x flat.
    expect(
      sweepAxisByCentreVariance([
        [1, 0, 0],
        [1, 5, 5],
      ]),
    ).toBe(1);
  });

  it('should answer for an empty set instead of producing NaN', () => {
    expect(sweepAxisByCentreVariance([])).toBe(0);
  });
});
