import { describe, expect, it } from 'vitest';
import { pairedCaseVerdict } from '#routes/debug.geospec/paired-result.js';

const cell = (run: number, hashes: readonly string[]) => ({
  run,
  result: {
    perCase: hashes.map((canonicalResultSha256, repeat) => ({
      caseId: 'bounds',
      repeat,
      status: 'passed',
      canonicalResultSha256,
    })),
  },
});

describe('debug ST/MT parity', () => {
  it('does not compare an MT-only run with an earlier ST run', () => {
    expect(pairedCaseVerdict(cell(2, ['same']), [cell(1, ['same'])], 'bounds')).toBe('unpaired');
  });

  it('compares the same run and corresponding repeats', () => {
    expect(pairedCaseVerdict(cell(2, ['a', 'b']), [cell(1, ['wrong']), cell(2, ['a', 'b'])], 'bounds')).toBe('same');
    expect(pairedCaseVerdict(cell(2, ['a', 'changed']), [cell(2, ['a', 'b'])], 'bounds')).toBe('different');
  });
});
