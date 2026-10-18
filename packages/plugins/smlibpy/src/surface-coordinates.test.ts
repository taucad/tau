// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { projectSurfaceCoordinates } from '#surface-coordinates.js';

/** A unit cube's six faces, two triangles each, with outward flat normals and counter-clockwise winding. */
const cube = () => {
  const faces: Array<{ corners: number[][]; normal: number[] }> = [
    {
      normal: [1, 0, 0],
      corners: [
        [1, 0, 0],
        [1, 1, 0],
        [1, 1, 1],
        [1, 0, 1],
      ],
    },
    {
      normal: [-1, 0, 0],
      corners: [
        [0, 0, 0],
        [0, 0, 1],
        [0, 1, 1],
        [0, 1, 0],
      ],
    },
    {
      normal: [0, 1, 0],
      corners: [
        [0, 1, 0],
        [0, 1, 1],
        [1, 1, 1],
        [1, 1, 0],
      ],
    },
    {
      normal: [0, -1, 0],
      corners: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [0, 0, 1],
      ],
    },
    {
      normal: [0, 0, 1],
      corners: [
        [0, 0, 1],
        [1, 0, 1],
        [1, 1, 1],
        [0, 1, 1],
      ],
    },
    {
      normal: [0, 0, -1],
      corners: [
        [0, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
        [1, 0, 0],
      ],
    },
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (const { corners, normal } of faces) {
    const base = positions.length / 3;
    for (const corner of corners) {
      positions.push(...corner);
      normals.push(...normal);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, indices };
};

describe('projectSurfaceCoordinates', () => {
  it('splits a mesh into box charts with unit UVs and orthonormal tangent frames', () => {
    const projected = projectSurfaceCoordinates(cube());

    expect(projected.indices).toHaveLength(36);
    expect(projected.positions).toHaveLength(24 * 3);
    expect(Math.min(...projected.texCoords)).toBe(0);
    expect(Math.max(...projected.texCoords)).toBe(1);
    const handedness = new Set<number>();
    for (let vertex = 0; vertex < projected.positions.length / 3; vertex++) {
      const [tx, ty, tz, w] = projected.tangents.slice(vertex * 4, vertex * 4 + 4);
      const [nx, ny, nz] = projected.normals.slice(vertex * 3, vertex * 3 + 3);
      expect(Math.hypot(tx!, ty!, tz!)).toBeCloseTo(1, 6);
      expect(tx! * nx! + ty! * ny! + tz! * nz!).toBeCloseTo(0, 6);
      handedness.add(w!);
    }
    expect([...handedness].every((w) => w === 1 || w === -1)).toBe(true);
  });

  it('keeps degenerate triangles and flat bounds finite', () => {
    // A zero-area triangle on a line beside a triangle in the XZ plane, then a line with no extent but X.
    const projected = projectSurfaceCoordinates({
      positions: [0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 1],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2, 0, 1, 3],
    });

    const line = projectSurfaceCoordinates({
      positions: [0, 0, 0, 1, 0, 0, 2, 0, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
    });

    for (const result of [projected, line]) {
      expect(result.texCoords.every(Number.isFinite)).toBe(true);
      expect(result.tangents.every(Number.isFinite)).toBe(true);
    }
    expect(line.texCoords).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('marks a frame left-handed where the smooth normals face away from the winding', () => {
    const projected = projectSurfaceCoordinates({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      normals: [0, 0, -1, 0, 0, -1, 0, 0, -1],
      indices: [0, 1, 2],
    });

    expect(projected.tangents[3]).toBe(-1);
  });

  it('falls back to a perpendicular tangent where the smooth normal runs along the chart tangent', () => {
    // A Z-facing triangle whose vertex normals point along +X, the chart's U axis, and an X-facing one along +Y.
    const alongX = projectSurfaceCoordinates({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      normals: [1, 0, 0, 1, 0, 0, 1, 0, 0],
      indices: [0, 1, 2],
    });
    const alongY = projectSurfaceCoordinates({
      positions: [0, 0, 0, 0, 1, 0, 0, 0, 1],
      normals: [0, 1, 0, 0, 1, 0, 0, 1, 0],
      indices: [0, 1, 2],
    });

    expect(alongX.tangents.slice(0, 3)).toEqual([0, 0, -1]);
    expect(alongY.tangents.slice(0, 3).map((value) => value + 0)).toEqual([0, 0, 1]);
  });
});
