import { describe, expect, it } from 'vitest';
import { buildSelectorIndex } from '#selector/index-builder.js';
import { resolve } from '#selector/resolve.js';
import type { XdeReadResult } from '#step/types.js';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const xde: XdeReadResult = {
  occurrences: [
    { path: 'root', productName: 'Root', instanceName: 'root', transform: [...identity], shapeIndex: 0 },
    // Nested path (exercises the parent/child ordinal walk) and an occurrence
    // with no authored instance name.
    { path: 'root.child', productName: 'Child', transform: [...identity], shapeIndex: 1 },
  ],
  subshapeNames: [
    { occurrencePath: 'root', name: 'taper', shapeType: 'face', faceIndex: 0 },
    { occurrencePath: 'root', name: 'lid', shapeType: 'face', faceIndex: 1 },
    // Authored name over a non-analytic face: derives no plane/axis kind.
    { occurrencePath: 'root', name: 'blend', shapeType: 'face', faceIndex: 2 },
  ],
  datumPlacements: [],
  // Datum features over a cone and a plane, plus one with no attachable face.
  semanticDatums: [
    { occurrencePath: 'root', label: 'A', faceIndexes: [0] },
    { occurrencePath: 'root', label: 'B', faceIndexes: [1] },
    { occurrencePath: 'root', label: 'C', faceIndexes: [2] },
  ],
  datumSystems: [],
  supplementalPlanes: [],
  freeShapeCount: 0,
};

const index = buildSelectorIndex({
  xde,
  faceFactsByOccurrence: {
    root: {
      faces: [
        {
          faceIndex: 0,
          surfaceType: 'cone',
          axisOrigin: [0, 0, 0],
          axisDirection: [0, 0, 1],
          radius: 2,
          area: 20,
          centroid: [0, 0, 5],
          bounds: { min: [-2, -2, 0], max: [2, 2, 10] },
        },
        {
          faceIndex: 1,
          surfaceType: 'plane',
          normal: [0, 0, 1],
          offset: 10,
          area: 12,
          centroid: [0, 0, 10],
          bounds: { min: [-2, -2, 10], max: [2, 2, 10] },
        },
        {
          faceIndex: 2,
          surfaceType: 'bspline',
          area: 1,
          centroid: [0, 0, 1],
          bounds: { min: [-1, -1, 0], max: [1, 1, 2] },
        },
      ],
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- occurrence paths are the map keys.
    'root.child': { faces: [] },
  },
});

describe('index builder', () => {
  it('should preserve analytic occurrence bounds supplied by XDE', () => {
    const bounds: {
      min: [number, number, number];
      max: [number, number, number];
    } = { min: [-1, -2, -3], max: [1, 2, 3] };
    const bounded = buildSelectorIndex({
      xde: {
        occurrences: [
          {
            path: 'bounded',
            productName: 'Bounded',
            transform: [...identity],
            shapeIndex: 0,
            bounds,
          },
        ],
        subshapeNames: [],
        datumPlacements: [],
        semanticDatums: [],
        datumSystems: [],
        supplementalPlanes: [],
        freeShapeCount: 0,
      },
      faceFactsByOccurrence: { bounded: { faces: [] } },
    });

    expect(bounded.occurrences[0]?.bounds).toStrictEqual(bounds);
  });

  it('should index a nested occurrence without an authored instance name', () => {
    const selection = resolve({ kind: 'occurrence', path: 'root.child' }, index);

    expect(selection.entities[0]?.occurrencePath).toBe('root.child');
  });

  it('should treat a cone face as an axis candidate', () => {
    const selection = resolve({ kind: 'axis', of: 'root' }, index);

    expect(selection.entities[0]?.facts.surfaceType).toBe('cone');
  });

  it('should derive datum frames from cone, plane, and unattachable features', () => {
    expect(resolve({ kind: 'datum', name: 'root.A' }, index).status).toBe('resolved');
    expect(resolve({ kind: 'datum', name: 'root.B' }, index).status).toBe('resolved');
    // 'C' attaches to a non-analytic face: indexed, but with no derivable frame.
    expect(resolve({ kind: 'datum', name: 'root.C' }, index).status).not.toBe('ambiguous');
  });
});

describe('derived entity kinds', () => {
  it('should derive only the face kind for a non-analytic authored face', () => {
    const selection = resolve('root.blend', index);

    expect(selection.entities[0]?.entityType).toBe('face');
  });
});

describe('set algebra and residuals', () => {
  it('should fail an allOf member', () => {
    const selection = resolve(
      { kind: 'face', of: 'root', query: { allOf: [{ surfaceType: 'plane' }, { area: 999 }] } },
      index,
    );

    expect(selection.status).toBe('unmatched');
    expect(selection.candidates?.[0]?.excludedBy).toContain('allOf');
  });

  it('should satisfy an anyOf member', () => {
    const selection = resolve(
      { kind: 'face', of: 'root', query: { anyOf: [{ surfaceType: 'plane' }, { surfaceType: 'torus' }] } },
      index,
    );

    expect(selection.status).toBe('resolved');
  });

  it('should reject an anyOf with no satisfied member', () => {
    const selection = resolve({ kind: 'face', of: 'root', query: { anyOf: [{ area: 999 }] } }, index);

    expect(selection.status).toBe('unmatched');
  });

  it('should reject a not member that matches', () => {
    const selection = resolve({ kind: 'face', of: 'root', query: { surfaceType: 'plane', not: { area: 12 } } }, index);

    expect(selection.status).toBe('unmatched');
  });

  it('should accept a not member that does not match', () => {
    const selection = resolve({ kind: 'face', of: 'root', query: { surfaceType: 'plane', not: { area: 999 } } }, index);

    expect(selection.status).toBe('resolved');
  });

  it('should refuse a plane residual when the offset fact is absent', () => {
    const partial = buildSelectorIndex({
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
            {
              faceIndex: 0,
              surfaceType: 'plane',
              normal: [0, 0, 1],
              area: 1,
              centroid: [0, 0, 0],
              bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
            },
          ],
        },
      },
    });

    expect(resolve({ kind: 'face', query: { containsPoint: [0, 0, 0] } }, partial).status).toBe('resolved');
  });
});
