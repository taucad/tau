import { afterEach, describe, expect, it } from 'vitest';
import type { GeometryDiagnostic } from '#mesh/types.js';
import {
  chargeBudget,
  checkBudget,
  MatcherBudgetExceeded,
  MatcherWallBackstopExceeded,
  setMatcherBudgetOverrides,
  withMatcherBudget,
} from '#runner/matcher-budget.js';

const unitEnvKey = 'GEOSPEC_MATCHER_UNIT_BUDGET';
const backstopEnvKey = 'GEOSPEC_MATCHER_WALL_BACKSTOP_MS';

/** Burn wall-clock time past `budget` ms so the next charge crosses the backstop. */
const spin = (budget: number): void => {
  const until = Date.now() + budget + 4;
  while (Date.now() < until) {
    // Deterministic outcome: the real clock always advances past the budget.
  }
};

describe('matcher budget (R13: deterministic work units)', () => {
  afterEach(() => {
    // Static keys: oxlint no-dynamic-delete forbids deleting a computed key.
    delete process.env['GEOSPEC_MATCHER_UNIT_BUDGET'];
    delete process.env['GEOSPEC_MATCHER_WALL_BACKSTOP_MS'];
    setMatcherBudgetOverrides({});
  });

  it('does nothing when no budget is active', () => {
    expect(() => {
      chargeBudget(1_000_000);
      checkBudget();
    }).not.toThrow();
  });

  it('returns a fast matcher its own diagnostics unchanged', () => {
    const own: GeometryDiagnostic[] = [{ code: 'X', severity: 'error', message: 'm', suggestion: 's' }];
    const result = withMatcherBudget('spatialRelationships', () => own);
    expect(result).toBe(own);
  });

  it('fails a matcher that exhausts its unit budget with a MATCHER_TIMEOUT diagnostic', () => {
    process.env[unitEnvKey] = '10';
    const result = withMatcherBudget('voidContinuity', () => {
      chargeBudget(16);
      return [];
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.code).toBe('MATCHER_TIMEOUT');
    expect(result[0]?.severity).toBe('error');
    expect(result[0]?.message).toContain("'voidContinuity'");
    expect(result[0]?.message).toContain('10 work-unit');
    expect(result[0]?.details).toMatchObject({ budget: 10, unitsUsed: 16, unit: 'work-units' });
  });

  it('is deterministic: the same charge sequence fails at the same charge regardless of elapsed time', () => {
    process.env[unitEnvKey] = '100';
    const chargesBeforeFailure = (): number => {
      let charges = 0;
      withMatcherBudget('voidContinuity', () => {
        for (let index = 0; index < 10; index += 1) {
          chargeBudget(16);
          charges += 1;
        }
        return [];
      });
      return charges;
    };
    const first = chargesBeforeFailure();
    spin(5); // Elapsed wall time must not shift the failing charge.
    const second = chargesBeforeFailure();
    expect(first).toBe(second);
    expect(first).toBe(6); // 7 × 16 = 112 > 100: the 7th charge throws, so 6 complete.
  });

  it('fails on the non-verdict wall backstop with an infrastructure MATCHER_STALLED diagnostic', () => {
    process.env[backstopEnvKey] = '1';
    const result = withMatcherBudget('voidContinuity', () => {
      spin(1);
      chargeBudget(1);
      return [];
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.code).toBe('MATCHER_STALLED');
    expect(result[0]?.message).toContain('infrastructure failure');
    expect(result[0]?.details).toMatchObject({ infrastructure: true });
  });

  it('honours host overrides (the browser typed-config carrier)', () => {
    setMatcherBudgetOverrides({ unitBudget: 5 });
    const result = withMatcherBudget('spatialRelationships', () => {
      chargeBudget(6);
      return [];
    });
    expect(result[0]?.code).toBe('MATCHER_TIMEOUT');
  });

  it('propagates a non-budget error unchanged', () => {
    expect(() =>
      withMatcherBudget('contactArea', () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
  });

  it('restores the outer budget after a nested matcher so inner exhaustion does not leak', () => {
    process.env[unitEnvKey] = '250';
    const outer = withMatcherBudget('outer', () => {
      // A nested matcher exhausts its own units...
      process.env[unitEnvKey] = '1';
      const inner = withMatcherBudget('inner', () => {
        chargeBudget(2);
        return [];
      });
      expect(inner[0]?.code).toBe('MATCHER_TIMEOUT');
      // ...but the outer (generous) budget is restored, so this does not throw.
      process.env[unitEnvKey] = '250';
      expect(() => {
        chargeBudget(1);
      }).not.toThrow();
      return [];
    });
    expect(outer).toEqual([]);
  });

  it('carries the matcher, budget, and units used on the thrown signals', () => {
    const exceeded = new MatcherBudgetExceeded('voidContinuity', 42, 43);
    expect(exceeded).toBeInstanceOf(Error);
    expect(exceeded.matcher).toBe('voidContinuity');
    expect(exceeded.budget).toBe(42);
    expect(exceeded.unitsUsed).toBe(43);
    const stalled = new MatcherWallBackstopExceeded('voidContinuity', 600_000);
    expect(stalled.backstop).toBe(600_000);
  });
});
