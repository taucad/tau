import { describe, it, expect } from 'vitest';
import {
  createVertexTransform,
  transformNormalArray,
  transformVerticesGltf,
  transformVertexArray,
} from '#framework/common.js';

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

describe('transformVertexArray', () => {
  it('should transform all vertices in a flat array', () => {
    const vertices = [1000, 2000, 3000, 0, 0, 0];
    const result = transformVertexArray(vertices);

    expect(result[0]).toBeCloseTo(1, 5);
    expect(result[1]).toBeCloseTo(3, 5);
    expect(result[2]).toBeCloseTo(-2, 5);
    expect(result[3]).toBe(0);
    expect(result[4]).toBe(0);
    expect(result[5]).toBe(0);
  });

  it('should skip vertices with undefined coordinates in transformVertexArray', () => {
    // Array with length not divisible by 3 -- trailing element treated as incomplete vertex
    const vertices = [1000, 2000, 3000, 500];
    const result = transformVertexArray(vertices);

    expect(result[0]).toBeCloseTo(1, 5);
    expect(result[1]).toBeCloseTo(3, 5);
    expect(result[2]).toBeCloseTo(-2, 5);
    expect(result[3]).toBe(0);
  });
});

describe('createVertexTransform', () => {
  it('should keep z-up millimeter coordinates unscaled for canonical GeoSpec exports', () => {
    const transform = createVertexTransform({ coordinateSystem: 'z-up', unit: { length: 'millimeter' } });

    expect(transform([50, 25, 10])).toEqual([50, 25, 10]);
  });

  it('should transform to y-up millimeters without applying meter scale', () => {
    const transform = createVertexTransform({ coordinateSystem: 'y-up', unit: { length: 'millimeter' } });

    expect(transform([50, 25, 10])).toEqual([50, 10, -25]);
  });

  it('should transform flat vertex arrays using requested coordinate and length units', () => {
    const result = transformVertexArray([50, 25, 10], {
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
    });

    expect([...result]).toEqual([50, 25, 10]);
  });

  it('should rotate normals without scaling them', () => {
    const result = transformNormalArray([0, 0, 1], { coordinateSystem: 'y-up' });

    expect([...result]).toEqual([0, 1, 0]);
  });
});
