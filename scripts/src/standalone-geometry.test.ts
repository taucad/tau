import { describe, expect, it } from 'vitest';

import { compareVolumes, measureGlb, measureMesh, measureStl } from '#standalone-geometry.js';

/** The 12 outward triangles of an axis-aligned box from the origin to `size`. */
const boxTriangles = ([x, y, z]: readonly [number, number, number]): number[][][] => {
  // Corner `i` takes x, y and z from its first, second and third binary digit.
  const p = (i: number): number[] => [i % 2 === 1 ? x : 0, Math.floor(i / 2) % 2 === 1 ? y : 0, i >= 4 ? z : 0];
  const quads = [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
  ];
  return quads.flatMap(([a = 0, b = 0, c = 0, d = 0]) => [
    [p(a), p(b), p(c)],
    [p(a), p(c), p(d)],
  ]);
};

const binaryStl = (triangles: number[][][]): Uint8Array<ArrayBuffer> => {
  const view = new DataView(new ArrayBuffer(84 + 50 * triangles.length));
  view.setUint32(80, triangles.length, true);
  for (const [index, triangle] of triangles.entries()) {
    for (const [corner, point] of triangle.entries()) {
      for (const [axis, value] of point.entries()) {
        view.setFloat32(84 + 50 * index + 12 + 12 * corner + 4 * axis, value, true);
      }
    }
  }
  return new Uint8Array(view.buffer);
};

const asciiStl = (triangles: number[][][]): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(
    `solid box\n${triangles
      .map(
        (triangle) =>
          `facet normal 0 0 0\nouter loop\n${triangle.map((point) => `vertex ${point.join(' ')}`).join('\n')}\nendloop\nendfacet`,
      )
      .join('\n')}\nendsolid box\n`,
  );

/** A GLB of the box in metres under a node with `transform`. */
const glb = (triangles: number[][][], node: Record<string, unknown>): Uint8Array<ArrayBuffer> => {
  const positions = new Float32Array(triangles.flatMap((triangle) => triangle.flat()).map((value) => value / 1000));
  const json = new TextEncoder().encode(
    JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [1] }],
      nodes: [{ mesh: 0 }, { ...node, children: [0] }],
      meshes: [{ primitives: [{ attributes: Object.fromEntries([['POSITION', 0]]) }] }],
      accessors: [{ bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3' }],
      bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
      buffers: [{ byteLength: positions.byteLength }],
    }),
  );
  const jsonLength = Math.ceil(json.byteLength / 4) * 4;
  const bytes = new Uint8Array(12 + 8 + jsonLength + 8 + positions.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46_54_6c_67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  bytes.fill(0x20, 20, 20 + jsonLength);
  bytes.set(json, 20);
  view.setUint32(20 + jsonLength, positions.byteLength, true);
  view.setUint32(24 + jsonLength, 0x00_4e_49_42, true);
  bytes.set(new Uint8Array(positions.buffer), 28 + jsonLength);
  return bytes;
};

describe('standalone geometry', () => {
  const box = boxTriangles([20, 10, 5]);

  it('should measure the enclosed volume of a binary and an ASCII STL in mm³', () => {
    expect(measureStl(binaryStl(box))).toMatchObject({ format: 'stl', triangles: 12, volume: 1000, max: [20, 10, 5] });
    expect(measureStl(asciiStl(box)).volume).toBeCloseTo(1000, 9);
    expect(measureMesh('a.stl', binaryStl(box)).volume).toBe(1000);
  });

  it('should measure a GLB in mm³ under its node transforms', () => {
    const rotated = glb(box, { rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2], translation: [1, 2, 3] });
    expect(measureGlb(rotated).volume).toBeCloseTo(1000, 3);
    const scaled = glb(box, { scale: [2, 2, 2] });
    expect(measureMesh('a.glb', scaled).volume).toBeCloseTo(8000, 2);
  });

  it('should pass within 1e-6 and fail beyond it, and fail an empty mesh', () => {
    const tau = measureStl(binaryStl(box));
    const close = measureStl(binaryStl(boxTriangles([20, 10, 5 + 1e-6])));
    const far = measureStl(binaryStl(boxTriangles([20, 10, 5 + 1e-3])));

    expect(compareVolumes(tau, close).pass).toBe(true);
    expect(compareVolumes(tau, far)).toMatchObject({ pass: false });
    expect(compareVolumes(tau, far).relativeDifference).toBeGreaterThan(1e-6);
    expect(compareVolumes(measureStl(binaryStl([])), measureStl(binaryStl([]))).pass).toBe(false);
  });
});
