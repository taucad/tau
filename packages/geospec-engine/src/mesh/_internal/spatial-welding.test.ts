import { describe, expect, it } from 'vitest';
import { spatialEpsilon, weldFlatPositions, weldPositions } from '#mesh/_internal/spatial-welding.js';

describe('spatial welding', () => {
  it('should merge positions inside the epsilon and keep distinct ones apart', () => {
    const canonical = weldPositions([
      [0, 0, 0],
      [spatialEpsilon / 2, 0, 0],
      [1, 0, 0],
    ]);

    expect([...canonical]).toStrictEqual([0, 0, 2]);
  });

  it('should merge across a cell boundary (the 3x3x3 neighbour sweep)', () => {
    // Two points straddling a grid line: a bucket-local search would miss them.
    const canonical = weldPositions([
      [spatialEpsilon * 2, 0, 0],
      [spatialEpsilon * 2 - spatialEpsilon / 4, 0, 0],
    ]);

    expect([...canonical]).toStrictEqual([0, 0]);
  });

  it('should separate neighbours that differ on any single axis', () => {
    const canonical = weldPositions([
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);

    expect([...canonical]).toStrictEqual([0, 1, 2]);
  });

  it('should accept a flat buffer and honour an explicit epsilon', () => {
    const canonical = weldFlatPositions(new Float64Array([0, 0, 0, 0.4, 0, 0, 9, 0, 0]), 3, 0.5);

    expect([...canonical]).toStrictEqual([0, 0, 2]);
  });

  it('should weld nothing when there is nothing to weld', () => {
    expect([...weldPositions([])]).toStrictEqual([]);
  });
});
