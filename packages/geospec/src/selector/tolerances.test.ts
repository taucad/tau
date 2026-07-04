import { describe, expect, it } from 'vitest';
import { defaultSelectorTolerances, resolveTolerances } from '#selector/tolerances.js';

describe('selector tolerances', () => {
  it('should default to millimetre/degree contract values with no overrides', () => {
    expect(resolveTolerances()).toEqual({
      linearMm: 0.02,
      angularToleranceDegrees: 0.5,
      staleAreaRatio: 0.02,
    });
  });

  it('should apply partial overrides without mutating the defaults', () => {
    const resolved = resolveTolerances({ angularToleranceDegrees: 2 });

    expect(resolved).toEqual({ linearMm: 0.02, angularToleranceDegrees: 2, staleAreaRatio: 0.02 });
    expect(defaultSelectorTolerances.angularToleranceDegrees).toBe(0.5);
  });
});
