import { describe, expect, it } from 'vitest';
import type { OccurrenceMeshResult } from '#mesh/types.js';
import { classifySeating, occtContactClassifier, windingContactClassifier } from '#proofs/contact-classifier.js';

/**
 * Outward-oriented unit tetrahedron (4 triangles, A=origin, B/C/D on the axes) —
 * the minimal closed solid for the winding oracle. Each face is wound so its
 * geometric normal points out of the solid.
 */
const tetrahedron = (): OccurrenceMeshResult => ({
  triangles: new Float64Array([
    0,
    0,
    0,
    0,
    1,
    0,
    1,
    0,
    0, // Base face, −z outward
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1, // Side face, −y outward
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    1,
    0, // Side face, −x outward
    1,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    1, // Slant face, (+,+,+) outward
  ]),
  deflection: 0.01,
});

describe('classifySeating', () => {
  it('penetrates strictly inside, seats on-surface or bracketed, else none', () => {
    expect(classifySeating('in', undefined, undefined)).toBe('penetrate');
    expect(classifySeating('on', undefined, undefined)).toBe('seat');
    // Probe pair straddling the target boundary (one in, one out) → seat.
    expect(classifySeating('out', 'in', 'out')).toBe('seat');
    // Either probe on the boundary → seat.
    expect(classifySeating('out', 'on', 'out')).toBe('seat');
    expect(classifySeating('out', 'out', 'out')).toBe('none');
    expect(classifySeating('out', undefined, undefined)).toBe('none');
  });
});

describe('occtContactClassifier', () => {
  it('passes native states through and surfaces native errors', () => {
    const ok = occtContactClassifier({ classifyPoints: () => JSON.stringify({ states: ['in', 'out', 'on'] }) }, 0);
    expect(
      ok.classify([
        [0, 0, 0],
        [1, 1, 1],
        [2, 2, 2],
      ]),
    ).toEqual(['in', 'out', 'on']);
    const bad = occtContactClassifier({ classifyPoints: () => JSON.stringify({ error: 'boom' }) }, 0);
    expect(bad.classify([[0, 0, 0]])).toEqual({ error: 'boom' });
  });
});

describe('windingContactClassifier', () => {
  it('errors on an empty or failed occurrence mesh (the fallback ladder trigger)', () => {
    expect(windingContactClassifier({ error: 'no mesh' })).toEqual({ error: 'no mesh' });
    expect(windingContactClassifier({ triangles: new Float64Array(0), deflection: 0.01 })).toEqual({
      error: 'occurrence-mesh-empty',
    });
  });

  it('classifies interior as in, far exterior as out, and a coincident point as on', () => {
    const classifier = windingContactClassifier(tetrahedron());
    if ('error' in classifier) {
      throw new Error('expected a classifier, got an error');
    }
    // Interior point (well inside the band), far exterior, and a point exactly on
    // the base face — the distance band holds the last at `on`, not `in`.
    expect(
      classifier.classify([
        [0.2, 0.2, 0.2],
        [5, 5, 5],
        [0.3, 0.3, 0],
      ]),
    ).toEqual(['in', 'out', 'on']);
  });
});

describe('windingContactClassifier analytic seating (CO-R6)', () => {
  it('should decide the on band from the exact analytic distance with a single-deflection band', () => {
    const mesh = tetrahedron();
    // Analytic base plane z = 0: signed distance is just the z coordinate.
    const classifier = windingContactClassifier(mesh, {
      toleranceBand: 0.1,
      analyticOnDistance: (point) => point[2],
    });
    if ('error' in classifier) {
      throw new Error('classifier must build for the closed tetrahedron');
    }

    // Band = tolerance + ONE deflection share = 0.11 (target side is exact).
    expect(
      classifier.classify([
        [0.2, 0.2, 0.05], // Within the band above the plane → on.
        [0.2, 0.2, -0.1], // Below the plane but within the band → on.
        [0.2, 0.2, 0.2], // Beyond the band, inside the solid → in.
        [5, 5, 5], // Beyond the band, outside → out.
      ]),
    ).toEqual(['on', 'on', 'in', 'out']);

    // The exact point at the band edge stays on; just past it does not.
    expect(
      classifier.classify([
        [0.2, 0.2, 0.11],
        [0.2, 0.2, 0.12],
      ]),
    ).toEqual(['on', 'in']);
  });
});
