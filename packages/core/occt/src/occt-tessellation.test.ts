import { describe, expect, it, vi } from 'vitest';
import {
  occtExplicitTessellationDefaults,
  occtTessellationPresets,
  resolveOcctTessellation,
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
