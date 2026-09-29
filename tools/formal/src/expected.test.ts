/* eslint-disable @typescript-eslint/naming-convention -- expected.json keys are spec module names. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Expectation, ExpectedFile } from '#expected.js';
import { compareOutcome, findExpectedFiles, knownFailures, lintExpectedFile } from '#expected.js';

const defect: Expectation = {
  tier: 'pr',
  expect: { violated: 'NoLeaseLeak' },
  kind: 'defect',
  ref: 'S4 O2',
  fixedBy: 'W8',
};

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('compareOutcome', () => {
  it('should fail when a defect verdict flips to pass', () => {
    expect(compareOutcome(defect, 'pass')).toBe(
      'expected violated NoLeaseLeak, got pass; the defect (S4 O2) no longer fails: update expected.json',
    );
  });

  it('should fail when a passing config reports a violation', () => {
    expect(compareOutcome({ tier: 'pr', expect: 'pass' }, { violated: 'TypeOK' })).toBe(
      'expected pass, got violated TypeOK',
    );
  });

  it('should fail when a different property is violated or the run errors', () => {
    expect([
      compareOutcome(defect, { violated: 'TypeOK' }),
      compareOutcome({ tier: 'pr', expect: 'pass' }, { error: 'watchdog after 300s' }),
    ]).toEqual([
      'expected violated NoLeaseLeak, got violated TypeOK',
      'expected pass, got error (watchdog after 300s)',
    ]);
  });

  it('should accept a rejection at the recorded row with the same rules in any order', () => {
    const expectation: Expectation = {
      tier: 'pr',
      expect: { rejected: { row: 158, rules: ['EpochNotReopened', 'EpochStartsAtZero'] } },
      kind: 'witness',
    };

    expect([
      compareOutcome(expectation, { rejected: { row: 158, rules: ['EpochStartsAtZero', 'EpochNotReopened'] } }),
      compareOutcome(expectation, { rejected: { row: 157, rules: ['EpochNotReopened', 'EpochStartsAtZero'] } }),
    ]).toEqual([
      undefined,
      'expected rejected at row 158 by EpochNotReopened, EpochStartsAtZero, got rejected at row 157 by EpochNotReopened, EpochStartsAtZero',
    ]);
  });
});

describe('lintExpectedFile', () => {
  it('should require a kind for every non-pass verdict and fixedBy for a defect', () => {
    const file: ExpectedFile = {
      configs: {
        'A.x.cfg': { tier: 'pr', expect: { violated: 'P' } },
        'A.y.cfg': { tier: 'pr', expect: { violated: 'Q' }, kind: 'defect' },
      },
    };

    expect(lintExpectedFile(file)).toEqual([
      'A.x.cfg: a non-pass verdict needs a kind (defect, witness or limit)',
      'A.y.cfg: a defect names the work package that fixes it (fixedBy)',
    ]);
  });
});

describe('knownFailures', () => {
  it('should list every non-pass verdict in formal known', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'formal-known-'));
    roots.push(root);
    const specs = path.join(root, 'packages/owner/specs/turn');
    mkdirSync(specs, { recursive: true });
    const file: ExpectedFile = {
      configs: { 'T.pr.cfg': { tier: 'pr', expect: 'pass' }, 'T.bad.cfg': defect },
      apalache: [{ tier: 'nightly', expect: 'Error', kind: 'witness', args: ['check', '--inv=IndInv', 'MC_T.tla'] }],
      logs: {
        ChatLog: {
          'ChatLog/seeded/gap.jsonl': {
            tier: 'pr',
            expect: { rejected: { row: 6, rules: ['SequenceContiguous'] } },
            kind: 'witness',
          },
        },
      },
    };
    writeFileSync(path.join(specs, 'expected.json'), JSON.stringify(file));

    const rows = knownFailures(findExpectedFiles(path.join(root, 'packages/owner')), root);

    expect(rows.map((row) => `${row.where} ${row.name}`)).toEqual([
      'packages/owner/specs/turn T.bad.cfg',
      'packages/owner/specs/turn apalache check --inv=IndInv MC_T.tla',
      'packages/owner/specs/turn ChatLog ChatLog/seeded/gap.jsonl',
    ]);
  });
});
