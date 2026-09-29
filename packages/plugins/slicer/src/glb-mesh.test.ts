import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isClosedMesh, readTriangleMesh } from '#glb-mesh.js';
import type { TriangleMesh } from '#glb-mesh.js';
import { boxTriangles, boxVertices, writeTestGlb } from '#glb.test-helpers.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

// Millimetres to the micrometre; `+ 0` turns -0 into 0 for `toEqual`.
const micrometres = (value: number): number => Math.round(value * 1000) / 1000 + 0;
const boundsOf = ({ bounds }: TriangleMesh) => ({ min: bounds.min.map(micrometres), max: bounds.max.map(micrometres) });
const box = (min: readonly [number, number, number], max: readonly [number, number, number], color?: number) => ({
  vertices: boxVertices(min, max),
  triangles: boxTriangles,
  ...(color === undefined ? {} : { color }),
});

describe('readTriangleMesh', () => {
  it('should group primitives by colour into parts in first-appearance order, the uncoloured ones together', async () => {
    const model = await readTriangleMesh(
      await writeTestGlb([
        box([0, 0, 0], [10, 10, 10], 0xff_00_00),
        box([20, 0, 0], [30, 10, 10]),
        box([40, 0, 0], [50, 10, 10], 0x00_00_ff),
        box([0, 20, 0], [10, 30, 10], 0xff_00_00),
        box([20, 20, 0], [30, 30, 10]),
      ]),
    );

    expect(model.parts.map(({ color }) => color)).toEqual(['#FF0000', undefined, '#0000FF']);
    expect(model.parts.map((part) => part.indices.length / 3)).toEqual([24, 24, 12]);
    expect(model.parts.map((part) => boundsOf(part))).toEqual([
      { min: [0, 0, 0], max: [10, 30, 10] },
      { min: [20, 0, 0], max: [30, 30, 10] },
      { min: [40, 0, 0], max: [50, 10, 10] },
    ]);
    // The whole model is every triangle welded as one mesh, in its first colour.
    expect(model.color).toBe('#FF0000');
    expect(model.indices.length / 3).toBe(60);
    expect(boundsOf(model)).toEqual({ min: [0, 0, 0], max: [50, 30, 10] });
  });

  it('should keep a model of one colour as one part equal to the whole mesh', async () => {
    const model = await readTriangleMesh(Uint8Array.from(readFileSync(join(fixtures, 'cube.glb'))));

    expect(model.parts).toEqual([
      { positions: model.positions, indices: model.indices, bounds: model.bounds, color: undefined },
    ]);
  });

  it('should weld each part on its own, so parts that share a face keep their own corners', async () => {
    const model = await readTriangleMesh(
      await writeTestGlb([box([0, 0, 0], [10, 10, 10], 0xff_00_00), box([10, 0, 0], [20, 10, 10], 0x00_00_ff)]),
    );

    expect(model.positions.length / 3).toBe(12);
    expect(model.parts.map(({ positions }) => positions.length / 3)).toEqual([8, 8]);
  });

  it('should read the two-colour fixture as a red and a blue cube in printer millimetres', async () => {
    const model = await readTriangleMesh(Uint8Array.from(readFileSync(join(fixtures, 'two-colour-cubes.glb'))));

    expect(model.parts.map((part) => [part.color, boundsOf(part)])).toEqual([
      ['#FF0000', { min: [-15, -5, 0], max: [-5, 5, 10] }],
      ['#0000FF', { min: [5, -5, 0], max: [15, 5, 10] }],
    ]);
  });

  it('should drop degenerate triangles and a colour left with none', async () => {
    const point = [5, 5, 5] as const;
    const model = await readTriangleMesh(
      await writeTestGlb([
        box([0, 0, 0], [10, 10, 10], 0xff_00_00),
        { vertices: [point, point, point], triangles: [[0, 1, 2]], color: 0x00_ff_00 },
      ]),
    );

    expect(model.parts.map(({ color }) => color)).toEqual(['#FF0000']);
    expect(model.indices.length / 3).toBe(12);
  });

  it('should refuse a GLB whose triangles are all degenerate', async () => {
    const point = [5, 5, 5] as const;

    await expect(
      readTriangleMesh(await writeTestGlb([{ vertices: [point, point, point], triangles: [[0, 1, 2]] }])),
    ).rejects.toThrow('The GLB carries no triangle primitives.');
  });
});

describe('isClosedMesh', () => {
  it('should accept a closed box, and two boxes that meet along an edge', async () => {
    const single = await readTriangleMesh(await writeTestGlb([box([0, 0, 0], [10, 10, 10])]));
    const pair = await readTriangleMesh(
      await writeTestGlb([box([0, 0, 0], [10, 10, 10]), box([10, 10, 0], [20, 20, 10])]),
    );

    expect(isClosedMesh(single)).toBe(true);
    expect(isClosedMesh(pair)).toBe(true);
  });

  it('should refuse the faces of one solid split between two colours', async () => {
    const vertices = boxVertices([0, 0, 0], [10, 10, 10]);
    const model = await readTriangleMesh(
      await writeTestGlb([
        { vertices, triangles: boxTriangles.slice(0, 6), color: 0xff_00_00 },
        { vertices, triangles: boxTriangles.slice(6), color: 0x00_00_ff },
      ]),
    );

    expect(model.parts.map((part) => isClosedMesh(part))).toEqual([false, false]);
    expect(isClosedMesh(model)).toBe(true);
  });
});
