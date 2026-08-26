import { describe, expect, it } from 'vitest';
import { buildFixtureIndex } from '#selector/__fixtures__/two-cube-fixture.js';
import { buildSelectorIndex } from '#selector/index-builder.js';
import { resolve } from '#selector/resolve.js';
import type { SelectorFaceFacts } from '#selector/types.js';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const index = buildFixtureIndex();

/** An index whose faces carry no centroid or area (zero-area faces are skipped by the body build). */
const factlessIndex = buildSelectorIndex({
  xde: {
    occurrences: [{ path: 'p', productName: 'P', instanceName: 'p', transform: [...identity], shapeIndex: 0 }],
    subshapeNames: [],
    datumPlacements: [],
    semanticDatums: [],
    datumSystems: [],
    supplementalPlanes: [],
    freeShapeCount: 0,
  },
  faceFactsByOccurrence: {
    p: {
      faces: [
        { faceIndex: 0, surfaceType: 'bspline', area: 0 } as unknown as SelectorFaceFacts,
        { faceIndex: 1, surfaceType: 'bspline', area: 0 } as unknown as SelectorFaceFacts,
      ],
    },
  },
});

describe('analytic residuals', () => {
  it('should accept a containsPoint probe on a plane face', () => {
    const selection = resolve({ kind: 'plane', of: 'cubeA', query: { containsPoint: [5, 5, 10] } }, index);

    expect(selection.status).toBe('resolved');
  });

  it('should reject a containsPoint probe off a plane face', () => {
    const selection = resolve({ kind: 'plane', of: 'cubeA', query: { containsPoint: [5, 5, 9] } }, index);

    expect(selection.status).not.toBe('resolved');
  });
});

describe('facts-free candidates', () => {
  it('should reject a near predicate when the candidate has no centroid', () => {
    const selection = resolve({ kind: 'face', query: { near: { x: 0 } } }, factlessIndex);

    expect(selection.status).toBe('unmatched');
  });

  it('should sink candidates with no centroid when ordering along an axis', () => {
    const selection = resolve(
      { kind: 'face', query: { orderBy: 'offsetAlong', along: [0, 0, 1] }, expect: 'many' },
      factlessIndex,
    );

    expect(selection.entities).toHaveLength(2);
  });

  it('should sink candidates with no area when ordering by area', () => {
    const selection = resolve({ kind: 'face', query: { orderBy: 'area' }, expect: 'many' }, factlessIndex);

    expect(selection.entities).toHaveLength(2);
  });
});

describe('interface near misses', () => {
  it('should offer last-segment near misses for an unscoped interface name', () => {
    const selection = resolve({ kind: 'interface', name: 'face.top' }, index);

    expect(selection.status).toBe('unmatched');
    expect(selection.candidates?.length).toBeGreaterThan(0);
  });
});

describe('probe tie-breaking is deterministic', () => {
  /** Two coplanar faces the same ray hits at the same parameter. */
  const coplanar = buildSelectorIndex({
    xde: {
      occurrences: [
        { path: 'a', productName: 'A', instanceName: 'a', transform: [...identity], shapeIndex: 0 },
        { path: 'b', productName: 'B', instanceName: 'b', transform: [...identity], shapeIndex: 1 },
      ],
      subshapeNames: [],
      datumPlacements: [],
      semanticDatums: [],
      datumSystems: [],
      supplementalPlanes: [],
      freeShapeCount: 0,
    },
    faceFactsByOccurrence: {
      a: {
        faces: [
          {
            faceIndex: 0,
            surfaceType: 'plane',
            normal: [0, 0, 1],
            offset: 5,
            area: 4,
            centroid: [0, 0, 5],
            bounds: { min: [-1, -1, 5], max: [1, 1, 5] },
          },
        ],
      },
      b: {
        faces: [
          {
            faceIndex: 0,
            surfaceType: 'plane',
            normal: [0, 0, 1],
            offset: 5,
            area: 4,
            centroid: [0, 0, 5],
            bounds: { min: [-1, -1, 5], max: [1, 1, 5] },
          },
        ],
      },
    },
  });

  it('should break equal ray parameters by entity id', () => {
    const selection = resolve(
      { kind: 'face', query: { surfaceType: 'plane', hitByRay: { origin: [0, 0, 0], direction: [0, 0, 1] } } },
      coplanar,
    );

    expect(selection.entities).toHaveLength(1);
  });

  it('should break exactly equidistant nearestTo candidates by entity id', () => {
    const selection = resolve({ kind: 'plane', query: { nearestTo: [0, 0, 5] } }, coplanar);

    expect(selection.status).toBe('ambiguous');
  });
});

describe('nearest probe without facts', () => {
  it('should select nothing when no candidate carries a centroid', () => {
    const selection = resolve({ kind: 'face', query: { nearestTo: [0, 0, 0] } }, factlessIndex);

    expect(selection.entities).toStrictEqual([]);
  });
});
