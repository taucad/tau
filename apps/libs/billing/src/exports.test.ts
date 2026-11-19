import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as billing from '#index.js';

const packageJsonText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const packageJson = JSON.parse(packageJsonText) as {
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
      './training-consent': './src/training-consent.ts',
      './plan-catalog': './src/tau-plan-catalog.ts',
      './kernel-tier-requirements': './src/kernel-tier-requirements.ts',
    });
  });

  it('declares each subpath once and maps no two subpaths to one file', () => {
    // `JSON.parse` keeps only the last of two equal keys, so read the declared subpaths from the text.
    const exportsBlock = /^ {2}"exports": \{$([\s\S]*?)^ {2}\}/mu.exec(packageJsonText)?.[1] ?? '';
    const subpaths = [...exportsBlock.matchAll(/^ {4}"([^"]+)":/gmu)].map((match) => match[1]);
    expect(subpaths.filter((subpath, index) => subpaths.indexOf(subpath) !== index)).toEqual([]);
    expect(new Set(subpaths)).toEqual(new Set(Object.keys(packageJson.exports)));

    const targets = Object.values(packageJson.exports).map((target) => path.posix.normalize(target));
    expect(targets.filter((target, index) => targets.indexOf(target) !== index)).toEqual([]);
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
    expect(billing.formatCreditAtomsDisplay(12_345n)).toBe('1');
  });
});
