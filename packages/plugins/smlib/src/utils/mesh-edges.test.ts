// @vitest-environment node
/* oxlint-disable eslint/new-cap -- smlibwasm's shape constructors are functions (Spline, Cylinder), as in build123d. */
import { describe, expect, it } from 'vitest';
import * as smlib from '@classcad/smlibwasm';
import type { Part } from '@classcad/smlibwasm';

import { render } from '#utils/render-output.js';
import type { GeometrySmlib } from '#smlib.types.js';

/** A spline-toothed wheel on a boss: curved edges whose own samples cut across the faceted surface. */
function wheel(): Part {
  const outline = Array.from({ length: 72 }, (_, index): [number, number, number] => {
    const angle = (2 * Math.PI * index) / 72;
    const radius = index % 4 < 2 ? 20 : 17;
    return [radius * Math.cos(angle), radius * Math.sin(angle), 0];
  });
  const teeth = smlib.extrude(smlib.makeFace(smlib.Spline(...outline, outline[0]!)), 6);
  return smlib.fuse(teeth, smlib.Cylinder(6, 14));
}

const pointKey = (values: ArrayLike<number>, index: number): string =>
  `${values[index]},${values[index + 1]},${values[index + 2]}`;
const segmentKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The triangle edges whose two sides belong to different faces, by welded position. */
function faceBoundary({ faces }: GeometrySmlib): Set<string> {
  const sides = new Map<string, Set<number>>();
  for (const { start, count, faceId } of faces.faceGroups) {
    for (let corner = start; corner < start + count; corner += 3) {
      for (const [from, to] of [
        [0, 1],
        [1, 2],
        [2, 0],
      ] as const) {
        const key = segmentKey(
          pointKey(faces.vertices, faces.triangles[corner + from]! * 3),
          pointKey(faces.vertices, faces.triangles[corner + to]! * 3),
        );
        sides.set(key, (sides.get(key) ?? new Set()).add(faceId));
      }
    }
  }
  return new Set([...sides].filter(([, owners]) => owners.size > 1).map(([key]) => key));
}

describe('B-rep edge lines', () => {
  it.each([0.2, 0.02])('should draw every edge through the face mesh boundary at linear tolerance %s', (tolerance) => {
    const shape = wheel();
    const [geometry] = render([{ shape, name: 'wheel' }], {
      library: smlib,
      tessellation: { linearTolerance: tolerance, angularTolerance: 20 },
      collectBrepEdges: true,
    });
    const { lines, edgeGroups } = geometry!.edges;
    const drawn = new Set<string>();
    for (let index = 0; index < lines.length; index += 6) {
      drawn.add(segmentKey(pointKey(lines, index), pointKey(lines, index + 3)));
    }

    expect(edgeGroups.map(({ edgeId }) => edgeId)).toEqual(shape.edges().map((_, edgeId) => edgeId));
    expect(drawn).toEqual(faceBoundary(geometry!));
    expect(drawn.size).toBeGreaterThan(shape.edges().length * 20);
  });
});
