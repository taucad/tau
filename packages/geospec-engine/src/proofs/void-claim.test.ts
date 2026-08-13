import { describe, expect, it } from 'vitest';
import type { Vec3 } from '#mesh/types.js';
import type { RelationshipProofContext } from '#proofs/context.js';
import { boxContext } from '#proofs/testing/box-world.js';
import {
  regionContains,
  resolveVoidClaim,
  voidRegionPaddingMm,
  voidMismatch,
  voidUnsupported,
} from '#proofs/void-claim.js';
import type { ResolvedVoidClaim } from '#proofs/void-claim.js';

const box = { min: [0, 0, 0] as Vec3, max: [10, 10, 10] as Vec3 };

const contextWithOccurrences = (
  rows: Array<{ path: string; bounds?: { min: Vec3; max: Vec3 } }>,
): RelationshipProofContext => {
  const base = boxContext([box, box]);
  return {
    ...base,
    occurrenceIndexByPath: new Map(rows.map((row, position) => [row.path, position])),
    index: {
      ...base.index,
      occurrences: rows.map((row, position) => ({
        path: row.path,
        productName: row.path,
        transform: [],
        shapeIndex: position,
        ordinalPath: [position + 1],
        ...(row.bounds ? { bounds: row.bounds } : {}),
      })),
    },
  };
};

const claimOf = (result: ReturnType<typeof resolveVoidClaim>): ResolvedVoidClaim => {
  if ('diagnostics' in result) {
    throw new Error(`expected a resolved claim, got: ${result.diagnostics[0]?.message}`);
  }
  return result.claim;
};

const messageOf = (result: ReturnType<typeof resolveVoidClaim>): string => {
  if (!('diagnostics' in result)) {
    throw new Error('expected a refusal');
  }
  return result.diagnostics[0]!.message;
};

describe('void claim diagnostics', () => {
  it('should omit an absent details payload from a refusal', () => {
    expect(voidUnsupported('why', 'how')[0]).toEqual({
      code: 'GEOSPEC_VOID_CONTINUITY_UNSUPPORTED',
      severity: 'error',
      message: 'why',
      suggestion: 'how',
    });
    expect(voidUnsupported('why', 'how', { a: 1 })[0]?.details).toEqual({ a: 1 });
  });

  it('should name the canonical engine on every mismatch, with or without a location', () => {
    const located = voidMismatch({
      message: 'broken',
      suggestion: 'fix',
      center: [1, 2, 3],
      details: { waypoint: [1, 2, 3] },
    })[0];
    expect(located?.spatial?.center).toEqual([1, 2, 3]);
    expect(located?.details).toEqual({ engine: 'topological', waypoint: [1, 2, 3] });

    const unlocated = voidMismatch({ message: 'broken', suggestion: 'fix' })[0];
    expect(unlocated?.spatial).toBeUndefined();
    expect(unlocated?.details).toEqual({ engine: 'topological' });
  });

  it('should test region membership on every axis', () => {
    const region = { min: [0, 0, 0] as Vec3, max: [1, 1, 1] as Vec3 };
    expect(regionContains([0.5, 0.5, 0.5], region)).toBe(true);
    expect(regionContains([0, 1, 0], region)).toBe(true);
    expect(regionContains([-0.1, 0.5, 0.5], region)).toBe(false);
    expect(regionContains([1.1, 0.5, 0.5], region)).toBe(false);
    expect(regionContains([0.5, -0.1, 0.5], region)).toBe(false);
    expect(regionContains([0.5, 1.1, 0.5], region)).toBe(false);
    expect(regionContains([0.5, 0.5, -0.1], region)).toBe(false);
    expect(regionContains([0.5, 0.5, 1.1], region)).toBe(false);
  });
});

describe('void claim resolution', () => {
  const context = contextWithOccurrences([
    { path: 'block', bounds: { min: [0, 0, 0], max: [10, 10, 10] } },
    { path: 'pin', bounds: { min: [2, 2, 2], max: [4, 4, 4] } },
  ]);

  it('should refuse an empty path', () => {
    expect(messageOf(resolveVoidClaim({ path: [] }, context))).toContain('at least one path waypoint');
  });

  it('should refuse a claim with neither a material set nor bounds', () => {
    expect(messageOf(resolveVoidClaim({ path: [[5, 5, 5]] }, context))).toContain('material set or explicit bounds');
  });

  it('should refuse a material occurrence the subject does not contain', () => {
    expect(messageOf(resolveVoidClaim({ path: [[5, 5, 5]], material: ['ghost'] }, context))).toContain(
      "material occurrence 'ghost'",
    );
  });

  it('should refuse an empty declared material set', () => {
    expect(messageOf(resolveVoidClaim({ path: [[5, 5, 5]], material: [] }, context))).toContain('empty material set');
  });

  it('should default the material set to every occurrence when bounds are declared', () => {
    const claim = claimOf(
      resolveVoidClaim({ path: [[5, 5, 5]], bounds: { min: [-1, -1, -1], max: [11, 11, 11] } }, context),
    );
    expect(claim.materialPaths).toEqual(['block', 'pin']);
    expect(claim.region).toEqual({ min: [-1, -1, -1], max: [11, 11, 11] });
  });

  it('should pad a region derived from material bounds by the fixed proof constant', () => {
    const claim = claimOf(resolveVoidClaim({ path: [[5, 5, 5]], material: ['pin'] }, context));
    expect(voidRegionPaddingMm).toBe(2);
    expect(claim.region).toEqual({ min: [0, 0, 0], max: [6, 6, 6] });
    expect(claim.materials).toEqual([1]);
  });

  it('should union every material occurrence when deriving the region', () => {
    const claim = claimOf(resolveVoidClaim({ path: [[5, 5, 5]], material: ['pin', 'block'] }, context));
    expect(claim.region).toEqual({ min: [-2, -2, -2], max: [12, 12, 12] });
  });

  it('should skip a boundless material when deriving the region from the rest', () => {
    const mixed = contextWithOccurrences([
      { path: 'block', bounds: { min: [0, 0, 0], max: [10, 10, 10] } },
      { path: 'ghostly' },
    ]);
    const claim = claimOf(resolveVoidClaim({ path: [[5, 5, 5]], material: ['ghostly', 'block'] }, mixed));
    expect(claim.region).toEqual({ min: [-2, -2, -2], max: [12, 12, 12] });
  });

  it('should take an occurrence waypoint as its bounds centre', () => {
    const claim = claimOf(resolveVoidClaim({ path: [{ occurrence: 'pin' }], material: ['block'] }, context));
    expect(claim.waypoints).toEqual([[3, 3, 3]]);
  });

  it('should refuse an occurrence waypoint with no exact bounds', () => {
    const boundless = contextWithOccurrences([
      { path: 'block', bounds: { min: [0, 0, 0], max: [10, 10, 10] } },
      { path: 'ghostly' },
    ]);
    expect(
      messageOf(resolveVoidClaim({ path: [{ occurrence: 'ghostly' }], material: ['block'] }, boundless)),
    ).toContain("waypoint occurrence 'ghostly' has no exact bounds");
  });

  it('should refuse when no material occurrence carries bounds to derive a region from', () => {
    const boundless = contextWithOccurrences([{ path: 'block' }]);
    expect(messageOf(resolveVoidClaim({ path: [[0, 0, 0]], material: ['block'] }, boundless))).toContain(
      'no exact bounds to derive them from',
    );
  });

  it('should refuse a waypoint outside the proven region', () => {
    expect(
      messageOf(resolveVoidClaim({ path: [[99, 0, 0]], bounds: { min: [0, 0, 0], max: [1, 1, 1] } }, context)),
    ).toContain('lies outside the proven region');
  });

  it('should refuse an isolation probe outside the proven region', () => {
    expect(
      messageOf(
        resolveVoidClaim(
          {
            path: [[0.5, 0.5, 0.5]],
            bounds: { min: [0, 0, 0], max: [1, 1, 1] },
            isolatedFrom: [[99, 0, 0]],
          },
          context,
        ),
      ),
    ).toContain('lies outside the proven region');
  });

  it('should carry the declared minimum cross-section and isolation probes through', () => {
    const claim = claimOf(
      resolveVoidClaim(
        {
          path: [
            [5, 5, 5],
            [6, 6, 6],
          ],
          material: ['block'],
          minCrossSection: 12,
          isolatedFrom: [[0.5, 0.5, 0.5]],
        },
        context,
      ),
    );
    expect(claim.minCrossSection).toBe(12);
    expect(claim.isolatedFrom).toEqual([[0.5, 0.5, 0.5]]);
    expect(claim.waypoints).toHaveLength(2);
  });
});
