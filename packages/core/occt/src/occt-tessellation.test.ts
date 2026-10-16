import { describe, expect, it, vi } from 'vitest';
import {
  coarsenOcctTessellation,
  createTessellationBudgetExceededIssue,
  createTessellationDowngradedIssue,
  occtExplicitTessellationDefaults,
  occtMaxTessellationDowngrades,
  occtTessellationPresets,
  occtTriangleBudgets,
  resolveOcctTessellation,
  suggestOcctTessellation,
  tessellateWithinOcctBudget,
} from '#occt-tessellation.js';

const { preview } = occtExplicitTessellationDefaults;

describe('resolveOcctTessellation', () => {
  it.each([
    ['low', 500, 30],
    ['medium', 2000, 20],
    ['high', 8000, 12],
    ['extra-high', 32_000, 6],
  ] as const)('derives %s from the bounding-box diagonal', (quality, divisor, angularTolerance) => {
    expect(occtTessellationPresets[quality]).toEqual({ divisor, angularTolerance });
    expect(
      resolveOcctTessellation({ tessellation: quality, explicitDefaults: preview, measureDiagonal: () => 1000 }),
    ).toEqual({ requested: quality, linearTolerance: 1000 / divisor, angularTolerance });
  });

  it('scales a preset with the shape: a hundredfold larger shape gets a hundredfold tolerance', () => {
    const resolve = (diagonal: number) =>
      resolveOcctTessellation({ tessellation: 'medium', explicitDefaults: preview, measureDiagonal: () => diagonal })
        .linearTolerance;
    expect(resolve(1732) / resolve(17.32)).toBeCloseTo(100, 10);
  });

  it.each([
    ['a tiny shape to 0.001 mm', 0.01, 0.001],
    ['a huge shape to 50 mm', 1e9, 50],
    ['an empty shape to 50 mm', Number.NaN, 50],
    ['a void box to 50 mm', Number.POSITIVE_INFINITY, 50],
  ])('clamps %s', (_name, diagonal, linearTolerance) => {
    expect(
      resolveOcctTessellation({ tessellation: 'medium', explicitDefaults: preview, measureDiagonal: () => diagonal })
        .linearTolerance,
    ).toBe(linearTolerance);
  });

  it('passes explicit tolerances through whole and never measures the shape', () => {
    const measureDiagonal = vi.fn(() => 1000);
    expect(
      resolveOcctTessellation({
        tessellation: { linearTolerance: 0.5, angularTolerance: 7 },
        explicitDefaults: preview,
        measureDiagonal,
      }),
    ).toEqual({ requested: 'explicit', linearTolerance: 0.5, angularTolerance: 7 });
    expect(measureDiagonal).not.toHaveBeenCalled();
  });

  it("fills an omitted explicit field from the lane's absolute default, never from a preset", () => {
    const measureDiagonal = (): number => 1000;
    expect(
      resolveOcctTessellation({
        tessellation: { linearTolerance: 0.5 },
        explicitDefaults: occtExplicitTessellationDefaults.export,
        measureDiagonal,
      }),
    ).toEqual({ requested: 'explicit', linearTolerance: 0.5, angularTolerance: 20 });
    expect(
      resolveOcctTessellation({ tessellation: { angularTolerance: 7 }, explicitDefaults: preview, measureDiagonal }),
    ).toEqual({ requested: 'explicit', linearTolerance: 0.02, angularTolerance: 7 });
  });
});

describe('tessellateWithinOcctBudget', () => {
  // Triangle count scales with the inverse of the linear tolerance.
  const tessellate = vi.fn(({ linearTolerance }: { linearTolerance: number }) => ({
    triangles: 100 / linearTolerance,
  }));

  it('tessellates once when the request fits', () => {
    tessellate.mockClear();
    const outcome = tessellateWithinOcctBudget({
      tolerances: { linearTolerance: 1, angularTolerance: 20 },
      budget: 100,
      tessellate,
    });
    expect(outcome).toEqual({
      result: { triangles: 100 },
      effective: { linearTolerance: 1, angularTolerance: 20 },
      downgraded: 0,
    });
    expect(tessellate).toHaveBeenCalledTimes(1);
  });

  it('coarsens one step at a time until the mesh fits', () => {
    const outcome = tessellateWithinOcctBudget({
      tolerances: { linearTolerance: 1, angularTolerance: 20 },
      budget: 30,
      tessellate,
    });
    expect(outcome.effective).toEqual({ linearTolerance: 4, angularTolerance: 28 });
    expect(outcome.downgraded).toBe(2);
    expect(outcome.result.triangles).toBe(25);
  });

  it('stops after three steps and delivers the last mesh', () => {
    const outcome = tessellateWithinOcctBudget({
      tolerances: { linearTolerance: 1, angularTolerance: 20 },
      budget: 1,
      tessellate,
    });
    expect(outcome.downgraded).toBe(occtMaxTessellationDowngrades);
    expect(outcome.effective).toEqual({ linearTolerance: 8, angularTolerance: 32 });
    expect(outcome.result.triangles).toBe(12.5);
  });

  it('steps twice the linear tolerance and four degrees', () => {
    expect(coarsenOcctTessellation({ linearTolerance: 0.25, angularTolerance: 6 })).toEqual({
      linearTolerance: 0.5,
      angularTolerance: 10,
    });
  });

  it('keeps the policy budgets', () => {
    expect(occtTriangleBudgets).toEqual({ preview: 2_000_000, capture: 8_000_000, export: 20_000_000 });
  });
});

describe('budget issues', () => {
  const requested = { requested: 'medium', linearTolerance: 0.5, angularTolerance: 20 } as const;

  it('reports a downgrade as a warning with requested and effective tolerances', () => {
    const issue = createTessellationDowngradedIssue({
      producer: 'replicad',
      requested,
      effective: { linearTolerance: 1, angularTolerance: 24 },
      downgraded: 1,
      triangles: 900,
      budget: 1000,
    });
    expect(issue).toMatchObject({
      code: 'TESSELLATION_DOWNGRADED',
      severity: 'warning',
      details: {
        producer: 'replicad',
        requested: { form: 'medium', linearTolerance: 0.5, angularTolerance: 20 },
        effective: { linearTolerance: 1, angularTolerance: 24 },
        downgraded: 1,
      },
    });
    expect(issue.message).toContain("preset 'medium'");
    expect(issue.message).toContain('coarsened 1 step to');
    expect(
      createTessellationDowngradedIssue({
        producer: 'replicad',
        requested: { ...requested, requested: 'explicit' },
        effective: { linearTolerance: 2, angularTolerance: 28 },
        downgraded: 2,
        triangles: 900,
        budget: 1000,
      }).message,
    ).toContain('explicit tolerances');
  });

  it('refuses an export with a suggested tolerance that fits', () => {
    const issue = createTessellationBudgetExceededIssue({
      producer: 'replicad',
      requested,
      triangles: 30_000_000,
      budget: occtTriangleBudgets.export,
    });
    expect(issue).toMatchObject({
      code: 'RESOURCE_LIMIT',
      severity: 'error',
      details: { suggested: { linearTolerance: 0.75, angularTolerance: 20 } },
    });
    expect(issue.message).toContain('{ linearTolerance: 0.75, angularTolerance: 20 }');
  });

  it('rounds a suggestion up to two significant digits', () => {
    expect(
      suggestOcctTessellation(
        { linearTolerance: 0.013, angularTolerance: 12 },
        { triangles: 21_000_000, budget: 20_000_000 },
      ),
    ).toEqual({ linearTolerance: 0.014, angularTolerance: 12 });
    expect(suggestOcctTessellation({ linearTolerance: 0, angularTolerance: 12 }, { triangles: 2, budget: 1 })).toEqual({
      linearTolerance: 0,
      angularTolerance: 12,
    });
  });
});
