import { describe, expect, it } from 'vitest';
import { isResumableRun } from '#log/resumable.js';

const stopped = { message: 'You stopped this turn.', code: 'USER_STOPPED' };

describe('isResumableRun', () => {
  it.each([
    ['a committed native Stop', { lifecycle: 'cancelled', failure: stopped, committed: true, kind: 'tau' }, true],
    [
      'an external Stop after its prompt was issued',
      { lifecycle: 'cancelled', failure: stopped, committed: true, kind: 'external', externalPrompted: true },
      true,
    ],
    [
      'an external Stop before its prompt was issued',
      { lifecycle: 'cancelled', failure: stopped, committed: true, kind: 'external', externalPrompted: false },
      false,
    ],
    [
      'a Stop before the turn committed',
      { lifecycle: 'cancelled', failure: stopped, committed: false, kind: 'tau' },
      false,
    ],
    ['any other cancel', { lifecycle: 'cancelled', committed: true, kind: 'tau' }, false],
    [
      'a resumable failure',
      { lifecycle: 'failed', failure: { message: 'gone', code: 'RUN_ABANDONED' }, committed: true, kind: 'tau' },
      true,
    ],
    [
      'a fatal failure',
      { lifecycle: 'failed', failure: { message: 'no', code: 'FATAL_TEST' }, committed: true, kind: 'tau' },
      false,
    ],
    [
      'an external run whose host is gone',
      { lifecycle: 'failed', failure: { message: 'gone', code: 'RUN_ABANDONED' }, committed: true, kind: 'external' },
      true,
    ],
    [
      'a gateway failure on an external run, which ACP never continues',
      { lifecycle: 'failed', failure: { message: 'net', code: 'NETWORK_ERROR' }, committed: true, kind: 'external' },
      false,
    ],
    [
      "an external agent's stop that says retry",
      {
        lifecycle: 'failed',
        failure: { message: 'busy', code: 'EXTERNAL_AGENT_FAILED', details: { failure: { actions: ['retry'] } } },
        committed: true,
        kind: 'external',
      },
      true,
    ],
    [
      "an agent stop's code on a Tau run",
      {
        lifecycle: 'failed',
        failure: { message: 'busy', code: 'EXTERNAL_AGENT_FAILED', details: { failure: { actions: ['retry'] } } },
        committed: true,
        kind: 'tau',
      },
      false,
    ],
    ['a paused run', { lifecycle: 'paused', committed: true, kind: 'tau' }, false],
    ['no run', undefined, false],
  ] as const)('should rule %s', (_name, run, expected) => {
    expect(isResumableRun(run)).toBe(expected);
  });
});
