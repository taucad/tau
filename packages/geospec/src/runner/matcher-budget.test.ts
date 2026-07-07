import { afterEach, describe, expect, it } from 'vitest';
import type { GeometryDiagnostic } from '#mesh/types.js';
import { checkBudget, MatcherBudgetExceeded, withMatcherBudget } from '#runner/matcher-budget.js';

const envKey = 'GEOSPEC_MATCHER_TIMEOUT_MS';

/** Burn wall-clock time past `budget` ms so the next checkBudget crosses it. */
const spin = (budget: number): void => {
  const until = Date.now() + budget + 4;
  while (Date.now() < until) {
    // Deterministic outcome: the real clock always advances past the budget.
  }
};

describe('matcher budget (WS-C)', () => {
  afterEach(() => {
    // Static key: oxlint no-dynamic-delete forbids deleting a computed key.
    delete process.env['GEOSPEC_MATCHER_TIMEOUT_MS'];
  });

  it('does nothing when no budget is active', () => {
    expect(() => {
      checkBudget();
    }).not.toThrow();
  });

  it('returns a fast matcher its own diagnostics unchanged', () => {
    const own: GeometryDiagnostic[] = [{ code: 'X', severity: 'error', message: 'm', suggestion: 's' }];
    const result = withMatcherBudget('spatialRelationship', () => own);
    expect(result).toBe(own);
  });

  it('fails a matcher that outruns its budget with a MATCHER_TIMEOUT diagnostic', () => {
    process.env[envKey] = '1';
    const result = withMatcherBudget('voidContinuity', () => {
      spin(1);
      checkBudget();
      return [];
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.code).toBe('MATCHER_TIMEOUT');
    expect(result[0]?.severity).toBe('error');
    expect(result[0]?.message).toContain("'voidContinuity'");
    expect(result[0]?.message).toContain('1 ms');
  });

  it('propagates a non-budget error unchanged', () => {
    expect(() =>
      withMatcherBudget('contactArea', () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
  });

  it('restores the outer budget after a nested matcher so the inner timeout does not leak', () => {
    process.env[envKey] = '250';
    const outer = withMatcherBudget('outer', () => {
      // A nested matcher with a tiny budget times out on its own...
      process.env[envKey] = '1';
      const inner = withMatcherBudget('inner', () => {
        spin(1);
        checkBudget();
        return [];
      });
      expect(inner[0]?.code).toBe('MATCHER_TIMEOUT');
      // ...but the outer (generous) budget is restored, so this does not throw.
      process.env[envKey] = '250';
      expect(() => {
        checkBudget();
      }).not.toThrow();
      return [];
    });
    expect(outer).toEqual([]);
  });

  it('carries the matcher and budget on the thrown signal', () => {
    const error = new MatcherBudgetExceeded('voidContinuity', 42);
    expect(error).toBeInstanceOf(Error);
    expect(error.matcher).toBe('voidContinuity');
    expect(error.budget).toBe(42);
  });
});
