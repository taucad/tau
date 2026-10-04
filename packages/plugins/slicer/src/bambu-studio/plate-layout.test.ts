import { describe, expect, it } from 'vitest';

import { writeBinaryStl } from '#glb-mesh.js';
import { moveStl, placeClearOfTower, presetRect, stlFootprint } from '#bambu-studio/plate-layout.js';

const square = (minX: number, minY: number, size: number) =>
  writeBinaryStl({
    positions: Float32Array.from([
      minX,
      minY,
      0,
      minX + size,
      minY,
      0,
      minX + size,
      minY + size,
      0,
      minX,
      minY + size,
      2,
    ]),
    indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
    bounds: { min: [minX, minY, 0], max: [minX + size, minY + size, 2] },
    color: undefined,
  });

describe('presetRect', () => {
  it('should bound a preset polygon written as "XxY" points', () => {
    expect(presetRect(['0x0', '180x0', '180x180', '0x180'])).toEqual({ minX: 0, minY: 0, maxX: 180, maxY: 180 });
    expect(presetRect(['18x28', '0x28', '0x0', '18x0'])).toEqual({ minX: 0, minY: 0, maxX: 18, maxY: 28 });
  });

  it('should read no area from an empty or single-point polygon', () => {
    expect(presetRect([])).toBeUndefined();
    expect(presetRect(['0x0'])).toBeUndefined();
    expect(presetRect(undefined)).toBeUndefined();
  });
});

describe('stlFootprint and moveStl', () => {
  it('should bound a binary STL in XY and move it without touching Z', () => {
    const stl = square(-78.5, -81, 20);
    expect(stlFootprint(stl)).toEqual({ minX: -78.5, minY: -81, maxX: -58.5, maxY: -61 });
    const moved = moveStl(stl, 100, 50.25);
    expect(stlFootprint(moved)).toEqual({ minX: 21.5, minY: -30.75, maxX: 41.5, maxY: -10.75 });
    // Z and the triangle count are untouched; the source bytes are not mutated.
    // Triangle 1's third corner is the vertex at Z 2: header, one triangle, its normal, two corners, then Z.
    expect(new DataView(moved.buffer).getFloat32(84 + 50 + 12 + 2 * 12 + 8, true)).toBe(2);
    expect(stlFootprint(stl).minX).toBe(-78.5);
  });
});

describe('placeClearOfTower', () => {
  // The A1 mini slice that conflicted on 3 October: Bambu Studio arranged the 102 mm assembly flush
  // against its estimate of the tower, and the tower it printed was wider than that estimate.
  const bed = { minX: 0, minY: 0, maxX: 180, maxY: 180 };
  const tower = { minX: 11.8, minY: 121.3, maxX: 57.2, maxY: 166.1 };
  const footprint = { minX: -78.5, minY: -81, maxX: 24, maxY: 21.375 };
  const arranged = { minX: 52.7, minY: 38.4, maxX: 154.8, maxY: 140.4 };

  it('should move the assembly the shortest way clear of the tower the slicer printed', () => {
    const move = placeClearOfTower({ bed, exclusions: [], tower, arranged, footprint, clearance: 3 });
    expect(move).toBeDefined();
    const placed = {
      minX: footprint.minX + move!.dx,
      minY: footprint.minY + move!.dy,
      maxX: footprint.maxX + move!.dx,
      maxY: footprint.maxY + move!.dy,
    };
    // Right of the tower by the clearance, still where Bambu Studio put it front to back, inside the bed.
    expect(placed.minX).toBeCloseTo(tower.maxX + 3);
    expect((placed.minY + placed.maxY) / 2).toBeCloseTo((arranged.minY + arranged.maxY) / 2);
    expect(placed.maxX).toBeLessThanOrEqual(bed.maxX);
    expect(placed.minY).toBeGreaterThanOrEqual(bed.minY);
  });

  it('should take another side when the shortest move would cover an excluded area', () => {
    // An excluded area at the back right, like the X1C's front-left one, rules out the move right.
    const blocked = { minX: 165, minY: 120, maxX: 180, maxY: 180 };
    const move = placeClearOfTower({ bed, exclusions: [blocked], tower, arranged, footprint, clearance: 3 });
    expect(move).toBeDefined();
    expect(footprint.maxY + move!.dy).toBeCloseTo(tower.minY - 3);
  });

  it('should find no place when the assembly and the tower cannot share the bed', () => {
    const wide = { minX: 0, minY: 0, maxX: 170, maxY: 170 };
    expect(placeClearOfTower({ bed, exclusions: [], tower, arranged, footprint: wide, clearance: 3 })).toBeUndefined();
  });
});
