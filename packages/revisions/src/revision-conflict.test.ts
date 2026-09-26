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

describe('conflict lines (D14, RV-W6 F7)', () => {
  it('keeps a plain id readable and parses its own line back', () => {
    expect(conflictLineOf('main', 'device-a')).toBe('conflicts/main/device-a');
    expect(conflictLineOf('main', 'host:user')).toBe('conflicts/main/host_3auser');
    expect(parseConflictLine('refs/heads/conflicts/main/host_3auser', 'host:user')).toStrictEqual({
      into: 'main',
      foreign: false,
    });
    expect(parseConflictLine('conflicts/main/host_3auser', 'other:user')?.foreign).toBe(true);
  });

  it('gives ids that differ only in punctuation or case different lines', () => {
    expect(conflictLineOf('main', 'a-b:c')).not.toBe(conflictLineOf('main', 'a:b-c'));
    expect(conflictLineOf('main', 'a_3ab')).not.toBe(conflictLineOf('main', 'a:b'));
    expect(conflictLineOf('main', 'Laptop')).not.toBe(conflictLineOf('main', 'laptop'));
    expect(conflictLineOf('main', 'Laptop').toLowerCase()).toBe(conflictLineOf('main', 'Laptop'));
  });

  it.each(['..', 'a..b', 'x.lock', '.hidden', 'trailing.', 'space here', 'a/b', 'ü', ''])(
    'always yields a valid ref for %j',
    (deviceId) => {
      expect(validRef(conflictLineOf('main', deviceId))).toBe(true);
    },
  );

  it('reserves conflicts and everything under it', () => {
    expect(isReservedBranchName('conflicts')).toBe(true);
    expect(isReservedBranchName('conflicts/x')).toBe(true);
    expect(isReservedBranchName('conflicts-x')).toBe(false);
  });
});
