import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- package-local verifier tests exercise the standalone script directly.
import { wave1ParityRows } from './wave1-parity.mts';
// oxlint-disable-next-line no-restricted-imports -- package-local verifier tests share the script's report vocabulary.
import type { RunReport } from './wave1-parity.mts';

const report = (): RunReport => ({
  passed: 40,
  failed: 65,
  files: Array.from({ length: 9 }, (_, fileIndex) => ({
    file: `fixture-${fileIndex}.geospec.ts`,
    tests: Array.from({ length: fileIndex === 8 ? 17 : 11 }, (_, testIndex) => {
      const passed = fileIndex * 11 + testIndex < 40;
      return {
        suite: [`suite-${fileIndex}`],
        name: `test-${testIndex}`,
        status: passed ? 'passed' : 'failed',
        diagnostics: passed ? [] : [{ code: 'GEOMETRY_MISMATCH' }],
      };
    }),
  })),
});

describe('Wave-1 parity ledger projection', () => {
  it('projects exactly 105 uniquely identified pass/fail rows', () => {
    const rows = wave1ParityRows(report());

    expect(rows).toHaveLength(105);
    expect(new Set(rows.map((row) => row.id))).toHaveLength(105);
    expect(rows.filter((row) => row.status === 'passed')).toHaveLength(40);
    expect(rows.filter((row) => row.status === 'failed')).toHaveLength(65);
  });

  it('canonicalizes executor-dependent file and test scheduling order', () => {
    const forward = report();
    const reversed = report();
    reversed.files.reverse();
    for (const file of reversed.files) {
      file.tests?.reverse();
    }

    expect(wave1ParityRows(reversed)).toEqual(wave1ParityRows(forward));
  });

  it('rejects skipped rows', () => {
    const input = report();
    input.files[0]!.tests![0]!.status = 'skipped';

    expect(() => wave1ParityRows(input)).toThrow("has forbidden status 'skipped'");
  });

  it('rejects duplicate identifiers', () => {
    const input = report();
    input.files[0]!.tests![1]!.name = input.files[0]!.tests![0]!.name;

    expect(() => wave1ParityRows(input)).toThrow('identifiers must be unique');
  });
});
