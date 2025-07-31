import { describe, it, expect } from 'vitest';
import { transformVerticesGltf } from '#components/geometry/kernel/utils/common.js';

describe('transformVerticesGltf', () => {
  it('should transform z-up millimeters to y-up meters correctly', () => {
    // Test basic transformation: [x, y, z] in mm -> [x/1000, z/1000, -y/1000] in m
    const input: [number, number, number] = [1000, 2000, 3000]; // 1m, 2m, 3m in mm
    const result = transformVerticesGltf(input);

    // Expected: x' = x/1000, y' = z/1000, z' = -y/1000
    expect(result).toEqual([1, 3, -2]); // [1m, 3m, -2m]
  });

  it('should handle zero coordinates', () => {
    const input: [number, number, number] = [0, 0, 0];
    const result = transformVerticesGltf(input);

    expect(result).toEqual([0, 0, 0]);
  });

  it('should handle negative coordinates', () => {
    const input: [number, number, number] = [-1000, -2000, -3000];
    const result = transformVerticesGltf(input);

    expect(result).toEqual([-1, -3, 2]); // Note: -y becomes positive z
  });

  it('should convert coordinate system correctly for unit cube', () => {
    // Test corners of a unit cube (1000mm = 1m) in z-up system
    const corners = [
      [0, 0, 0], // Origin
      [1000, 0, 0], // +X
      [0, 1000, 0], // +Y (forward in z-up)
      [0, 0, 1000], // +Z (up in z-up)
    ] as const;

    const transformed = corners.map((corner) => transformVerticesGltf(corner));

    expect(transformed).toEqual([
      [0, 0, 0], // Origin stays at origin
      [1, 0, 0], // +X stays +X (scaled to meters)
      [0, 0, -1], // +Y becomes -Z (forward becomes backward)
      [0, 1, 0], // +Z becomes +Y (up stays up, different axis)
    ]);
  });

  it('should maintain precision for small values', () => {
    const input: [number, number, number] = [1, 2, 3]; // 1mm, 2mm, 3mm
    const result = transformVerticesGltf(input);

    expect(result).toEqual([0.001, 0.003, -0.002]); // 0.001m, 0.003m, -0.002m
  });

  it('should normalize signed zero to regular zero', () => {
    // Test that the function handles JavaScript's signed zero quirk
    const input: [number, number, number] = [0, 0, 0];
    const result = transformVerticesGltf(input);

    // Verify no signed zeros in the result
    expect(Object.is(result[0], 0)).toBe(true); // Not -0
    expect(Object.is(result[1], 0)).toBe(true); // Not -0
    expect(Object.is(result[2], 0)).toBe(true); // Not -0
  });
});
