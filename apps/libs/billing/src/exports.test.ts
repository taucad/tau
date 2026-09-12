import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as billing from '#index.js';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  exports: Record<string, string>;
};

describe('package exports', () => {
  it('pins the public billing surface', () => {
    expect(packageJson.exports).toEqual({
      '.': './src/index.ts',
      './hooks/billing-session': './src/hooks/billing-session.tsx',
      './hooks/use-entitlements': './src/hooks/use-entitlements.ts',
      './hooks/use-credits': './src/hooks/use-credits.ts',
      './hooks/use-model-estimates': './src/hooks/use-model-estimates.ts',
      './hooks/use-open-holds': './src/hooks/use-open-holds.ts',
      './hooks/use-usage-snapshot': './src/hooks/use-usage-snapshot.ts',
    });
  });
});

describe('retired money surface', () => {
  /* Operational usage and balances are credits; the µ$ helpers and the legacy
   * µ$ credit-account contract had no consumer left and are deleted, so nothing
   * can reintroduce a dollar-denominated operational amount through them. */
  it('no longer exports the microdollar helpers or the legacy credit-account contract', () => {
    for (const name of [
      'centsToMicro',
      'formatMicroUsd',
      'microPerCent',
      'microPerUsd',
      'usdToMicro',
      'parseCreditAccount',
      'wireCreditAccountSchema',
    ]) {
      expect(billing).not.toHaveProperty(name);
    }
  });

  it('keeps the exact credit-atom formatters that replaced them', () => {
    expect(billing.formatCreditAtoms(12_345n)).toBe('1.2345');
    expect(billing.formatCreditAtomsDisplay(12_345n)).toBe('1.23');
  });
});
