import { describe, expect, it } from 'vitest';
import {
  buildFixtureIndex,
  createFixtureFaceFacts,
  createFixtureXde,
} from '#selector/__fixtures__/two-cube-fixture.js';
import { buildSelectorIndex } from '#selector/index-builder.js';
import { resolve } from '#selector/resolve.js';
import type { GeometrySelector, SelectorFaceFacts } from '#selector/types.js';

const index = buildFixtureIndex();

const indexWith = (faces: SelectorFaceFacts[]) =>
  buildSelectorIndex({
    xde: {
      occurrences: [
        {
          path: 'part',
          productName: 'Part',
          instanceName: 'part',
          transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          shapeIndex: 0,
        },
      ],
      subshapeNames: [],
      datumPlacements: [],
      semanticDatums: [],
      datumSystems: [],
      supplementalPlanes: [],
      freeShapeCount: 0,
    },
    faceFactsByOccurrence: { part: { faces } },
  });

describe('query predicates', () => {
  it('should reject a range predicate against an absent fact', () => {
    const selection = resolve({ kind: 'face', query: { radius: 2 } }, index);

    expect(selection.entities.every((entity) => entity.facts.radius !== undefined)).toBe(true);
  });

  it('should accept an open-ended range', () => {
    const selection = resolve(
      { kind: 'face', query: { radius: { min: 1.5 } }, expect: 'many' },
      {
        ...index,
      },
    );

    expect(selection.entities.length).toBeGreaterThan(0);
  });

  it('should reject a containsPoint probe when the candidate has no bounds', () => {
    const boundless = indexWith([
      {
        faceIndex: 0,
        surfaceType: 'plane',
        normal: [0, 0, 1],
        offset: 0,
        area: 1,
        centroid: [0, 0, 0],
      } as unknown as SelectorFaceFacts,
    ]);
    const selection = resolve({ kind: 'face', query: { containsPoint: [0, 0, 0] } }, boundless);

    expect(selection.status).not.toBe('resolved');
  });

  it('should reject a containsPoint probe on a cylinder off its wall', () => {
    const selection = resolve({ kind: 'face', query: { surfaceType: 'cylinder', containsPoint: [5, 5, 5] } }, index);

    expect(selection.status).not.toBe('resolved');
  });

  it('should accept a containsPoint probe on a cylinder wall', () => {
    const selection = resolve(
      { kind: 'face', query: { surfaceType: 'cylinder', containsPoint: [7, 5, 5] }, expect: 'many' },
      index,
    );

    expect(selection.entities.length).toBeGreaterThan(0);
  });

  it('should refuse a cylinder residual when the axis is degenerate', () => {
    const degenerate = indexWith([
      {
        faceIndex: 0,
        surfaceType: 'cylinder',
        axisOrigin: [0, 0, 0],
        axisDirection: [0, 0, 0],
        radius: 1,
        area: 1,
        centroid: [0, 0, 0],
        bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
      },
    ]);
    const selection = resolve({ kind: 'face', query: { containsPoint: [0, 0, 0] } }, degenerate);

    expect(selection.status).toBe('resolved');
  });

  it('should refuse a cylinder residual when the axis facts are missing', () => {
    const partial = indexWith([
      {
        faceIndex: 0,
        surfaceType: 'cylinder',
        radius: 1,
        area: 1,
        centroid: [0, 0, 0],
        bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
      },
    ]);
    const selection = resolve({ kind: 'face', query: { containsPoint: [0, 0, 0] } }, partial);

    expect(selection.status).toBe('resolved');
  });

  it('should reject a near predicate that misses the centroid', () => {
    const selection = resolve({ kind: 'face', query: { near: { x: 999 } } }, index);

    expect(selection.status).not.toBe('resolved');
  });

  it('should honour an explicit near tolerance', () => {
    const selection = resolve({ kind: 'face', query: { near: { x: 5, y: 5, z: 10, tolerance: 0.5 } } }, index);

    expect(selection.status).toBe('resolved');
  });

  it('should reject a direction predicate when the fact is absent', () => {
    const selection = resolve(
      { kind: 'plane', query: { normal: { direction: [0, 0, 1] } } },
      indexWith([
        { faceIndex: 0, surfaceType: 'plane', offset: 0, area: 1, centroid: [0, 0, 0] } as unknown as SelectorFaceFacts,
      ]),
    );

    expect(selection.status).not.toBe('resolved');
  });

  it('should honour an explicit angular tolerance', () => {
    const selection = resolve(
      {
        kind: 'plane',
        query: { normal: { direction: [0, 0, 1], angularToleranceDegrees: 0.1 } },
        expect: 'many',
      },
      index,
    );

    expect(selection.entities.length).toBeGreaterThan(0);
  });
});

describe('ray probes', () => {
  const ray = (origin: [number, number, number], direction: [number, number, number]): GeometrySelector => ({
    kind: 'face',
    query: { surfaceType: 'plane', hitByRay: { origin, direction } },
    expect: 'many',
  });

  it('should miss a plane the ray runs parallel to', () => {
    const selection = resolve(ray([0, 0, 0], [1, 0, 0]), index);

    expect(selection.entities).toStrictEqual([]);
  });

  it('should miss a plane behind the ray origin', () => {
    const selection = resolve(ray([5, 5, 50], [0, 0, 1]), index);

    expect(selection.entities).toStrictEqual([]);
  });

  it('should miss a plane whose hit point is outside its bounds', () => {
    const selection = resolve(ray([500, 500, 0], [0, 0, 1]), index);

    expect(selection.entities).toStrictEqual([]);
  });

  it('should ignore a plane with no normal facts', () => {
    const selection = resolve(
      ray([0, 0, 0], [0, 0, 1]),
      indexWith([{ faceIndex: 0, surfaceType: 'plane', area: 1, centroid: [0, 0, 0] } as unknown as SelectorFaceFacts]),
    );

    expect(selection.entities).toStrictEqual([]);
  });

  const cylinderRay = (origin: [number, number, number], direction: [number, number, number]): GeometrySelector => ({
    kind: 'face',
    query: { surfaceType: 'cylinder', hitByRay: { origin, direction } },
    expect: 'many',
  });

  it('should hit the nearest cylinder wall', () => {
    const selection = resolve(cylinderRay([-10, 5, 5], [1, 0, 0]), index);

    expect(selection.entities).toHaveLength(1);
  });

  it('should miss a cylinder the ray runs parallel to', () => {
    const selection = resolve(cylinderRay([5, 5, -10], [0, 0, 1]), index);

    expect(selection.entities).toStrictEqual([]);
  });

  it('should miss a cylinder the ray never reaches', () => {
    const selection = resolve(cylinderRay([-10, 500, 5], [1, 0, 0]), index);

    expect(selection.entities).toStrictEqual([]);
  });

  it('should miss a cylinder behind the ray origin', () => {
    const selection = resolve(cylinderRay([50, 5, 5], [1, 0, 0]), index);

    expect(selection.entities).toStrictEqual([]);
  });

  it('should ignore a cylinder with a degenerate axis', () => {
    const selection = resolve(
      cylinderRay([-10, 0, 0], [1, 0, 0]),
      indexWith([
        {
          faceIndex: 0,
          surfaceType: 'cylinder',
          axisOrigin: [0, 0, 0],
          axisDirection: [0, 0, 0],
          radius: 1,
          area: 1,
          centroid: [0, 0, 0],
          bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
        },
      ]),
    );

    expect(selection.entities).toStrictEqual([]);
  });

  it('should ignore a cylinder without radius facts', () => {
    const selection = resolve(
      cylinderRay([-10, 0, 0], [1, 0, 0]),
      indexWith([
        {
          faceIndex: 0,
          surfaceType: 'cylinder',
          axisOrigin: [0, 0, 0],
          axisDirection: [0, 0, 1],
          area: 1,
          centroid: [0, 0, 0],
          bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
        },
      ]),
    );

    expect(selection.entities).toStrictEqual([]);
  });
});

describe('nearest probe', () => {
  it('should report none when the candidate pool is empty', () => {
    const selection = resolve({ kind: 'axis', of: 'nosuch', query: { nearestTo: [0, 0, 0] } }, index);

    expect(selection.entities).toStrictEqual([]);
  });
});

describe('ordering and pick', () => {
  const orderedFaces = (query: Record<string, unknown>): string[] =>
    resolve({ kind: 'face', query: { ...query }, expect: 'many' }, index).entities.map((entity) => entity.id);

  it('should order by area by default', () => {
    expect(orderedFaces({ orderBy: 'area' })).toHaveLength(9);
  });

  it('should order by radius, sinking faces without one', () => {
    const byRadius = orderedFaces({ orderBy: 'radius' });

    expect(byRadius).toHaveLength(9);
  });

  it('should order by offset along an explicit axis', () => {
    expect(orderedFaces({ orderBy: 'offsetAlong', along: [1, 0, 0] })).toHaveLength(9);
  });

  it('should order by offset along the default axis', () => {
    expect(orderedFaces({ orderBy: 'offsetAlong' })).toHaveLength(9);
  });

  it('should fall back to the default axis when along is degenerate', () => {
    expect(orderedFaces({ orderBy: 'offsetAlong', along: [0, 0, 0] })).toHaveLength(9);
  });

  it.each<[string, 'first' | 'last' | number]>([
    ['first', 'first'],
    ['last', 'last'],
    ['index 0', 0],
    ['a negative index', -1],
  ])('should pick %s', (_label, pick) => {
    const selection = resolve({ kind: 'face', query: { orderBy: 'area', pick }, expect: 'one' }, index);

    expect(selection.entities).toHaveLength(1);
  });

  it('should pick nothing when the index is out of range', () => {
    const selection = resolve({ kind: 'face', query: { orderBy: 'area', pick: 99 }, expect: 'many' }, index);

    expect(selection.entities).toStrictEqual([]);
  });

  it('should order without picking', () => {
    expect(orderedFaces({ orderBy: 'area' })).toHaveLength(9);
  });
});

describe('entity pools', () => {
  it('should expose one body entity per occurrence', () => {
    const selection = resolve({ kind: 'body', expect: 'many' }, index);

    expect(selection.entities.every((entity) => entity.entityType === 'body')).toBe(true);
  });
});

describe('authored-name failures', () => {
  it('should report a dangling authored interface as unsupported', () => {
    const selection = resolve('cubeA.ghost', index);

    expect(selection.status).toBe('unsupported');
  });

  it('should report an unknown group name', () => {
    const selection = resolve({ kind: 'group', name: 'cubeA.nosuchgroup' }, index);

    expect(selection.status).toBe('unmatched');
  });

  it('should report an ambiguous group name across occurrences', () => {
    const xde = createFixtureXde();
    xde.subshapeNames.push(
      { occurrencePath: 'cubeB', name: 'bore[1]', shapeType: 'face', faceIndex: 0 },
      { occurrencePath: 'cubeB', name: 'bore[2]', shapeType: 'face', faceIndex: 1 },
    );
    const ambiguous = buildSelectorIndex({ xde, faceFactsByOccurrence: createFixtureFaceFacts() });

    const selection = resolve({ kind: 'group', name: 'bore', of: /cube/u }, ambiguous);

    expect(selection.status).toBe('ambiguous');
  });

  it('should report group drift against an exact expectation', () => {
    const selection = resolve({ kind: 'group', name: 'cubeA.bore', expect: { exactly: 5 } }, index);

    expect(selection.status).toBe('unmatched');
    expect(selection.diagnostics[0]?.message).toContain('resolved 3 of 5');
  });

  it('should report group drift against an at-least expectation', () => {
    const selection = resolve({ kind: 'group', name: 'cubeA.bore', expect: { atLeast: 9 } }, index);

    expect(selection.status).toBe('unmatched');
  });

  it('should accept a satisfied at-least expectation', () => {
    const selection = resolve({ kind: 'group', name: 'cubeA.bore', expect: { atLeast: 2 } }, index);

    expect(selection.status).toBe('resolved');
  });

  it('should match occurrences by path pattern', () => {
    const selection = resolve({ kind: 'occurrence', path: 'bolt[1]' }, index);

    expect(selection.entities[0]?.occurrencePath).toBe('bolt[1]');
  });

  it('should report unmatched occurrences with near-miss candidates', () => {
    const selection = resolve({ kind: 'occurrence', name: 'nosuch' }, index);

    expect(selection.status).toBe('unmatched');
    expect(selection.candidates?.length).toBeGreaterThan(0);
  });

  it('should report unmatched datums with near-miss candidates', () => {
    const selection = resolve({ kind: 'datum', name: 'nosuch' }, index);

    expect(selection.status).toBe('unmatched');
  });

  it('should scope named rows with of', () => {
    const selection = resolve({ kind: 'interface', name: 'face.top', of: 'cubeA' }, index);

    expect(selection.status).toBe('resolved');
  });

  it('should resolve nothing when the of scope excludes every row', () => {
    const selection = resolve({ kind: 'interface', name: 'face.top', of: 'cubeB' }, index);

    expect(selection.status).toBe('unmatched');
  });
});
