import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { conflictLineOf, isReservedBranchName, parseConflictLine } from '#revision-conflict.js';

/** Whether stock git takes `refs/heads/<name>` as a valid ref name. */
const validRef = (name: string): boolean => {
  try {
    execFileSync('git', ['check-ref-format', `refs/heads/${name}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

describe('conflict lines (D14, RV-W6 F7, R1)', () => {
  const recorder = '8c2f4a1e-3b5d-4e6f-9a7b-0c1d2e3f4a5b';

  it('names the line by its record device and parses its own line back', () => {
    expect(conflictLineOf('main', recorder)).toBe(`conflicts/main/${recorder}`);
    expect(parseConflictLine(`refs/heads/conflicts/main/${recorder}`, new Set([recorder]))).toStrictEqual({
      into: 'main',
      foreign: false,
    });
    expect(parseConflictLine(`conflicts/feature/x/${recorder}`, new Set([recorder]))?.into).toBe('feature/x');
  });

  it('reads a line as foreign unless one of this host’s record devices recorded it', () => {
    expect(parseConflictLine(`conflicts/main/${recorder}`, new Set(['another']))?.foreign).toBe(true);
    expect(parseConflictLine(`conflicts/main/${recorder}`, undefined)?.foreign).toBe(true);
    expect(parseConflictLine('feature', new Set([recorder]))).toBeUndefined();
  });

  it('yields a valid ref for a record device', () => {
    expect(validRef(conflictLineOf('main', recorder))).toBe(true);
  });

  it('reserves conflicts and everything under it', () => {
    expect(isReservedBranchName('conflicts')).toBe(true);
    expect(isReservedBranchName('conflicts/x')).toBe(true);
    expect(isReservedBranchName('conflicts-x')).toBe(false);
  });
});
