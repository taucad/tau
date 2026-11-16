import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  indicatorEntranceMilliseconds,
  indicatorDelayMilliseconds,
  indicatorMinimumMilliseconds,
  settledTiming,
  slowWaitMilliseconds,
  waitingTiming,
  waitPhaseAt,
} from '#utils/wait-timing.js';

describe('the wait timing ladder', () => {
  it('should hold the blueprint constants', () => {
    expect([indicatorDelayMilliseconds, indicatorMinimumMilliseconds, slowWaitMilliseconds]).toEqual([
      1000, 500, 10_000,
    ]);
  });

  it('should hide the indicator at 999 ms and show it at 1,000 ms', () => {
    expect(waitPhaseAt({ elapsed: 999 })).toBe('hidden');
    expect(waitPhaseAt({ elapsed: 1000 })).toBe('shown');
  });

  it('should turn slow at 10,000 ms', () => {
    expect(waitPhaseAt({ elapsed: 9999 })).toBe('shown');
    expect(waitPhaseAt({ elapsed: 10_000 })).toBe('slow');
  });

  it('should never show the indicator for content that arrives at 600 ms', () => {
    for (const elapsed of [0, 600, 999, 1000, 1500, 12_000]) {
      expect(waitPhaseAt({ elapsed, settledAt: 600 }), `${elapsed} ms`).toBe('hidden');
    }
  });

  it('should keep the indicator to 1,500 ms for content that arrives at 1,100 ms', () => {
    expect(waitPhaseAt({ elapsed: 1100, settledAt: 1100 })).toBe('shown');
    expect(waitPhaseAt({ elapsed: 1499, settledAt: 1100 })).toBe('shown');
    expect(waitPhaseAt({ elapsed: 1500, settledAt: 1100 })).toBe('hidden');
  });

  it('should drop a shown indicator at once when it has already served its minimum', () => {
    expect(waitPhaseAt({ elapsed: 1600, settledAt: 1600 })).toBe('hidden');
    expect(waitPhaseAt({ elapsed: 11_000, settledAt: 11_000 })).toBe('hidden');
  });
});

describe('the indicator timing', () => {
  it('should measure a running wait from its start, not from the mount', () => {
    expect(waitingTiming({ startedAt: 0, now: 0 })).toEqual({
      state: 'waiting',
      revealDelay: '1000ms',
      slowDelay: '10000ms',
      entrance: '150ms',
    });
    expect(waitingTiming({ startedAt: 0, now: 900 })).toMatchObject({ revealDelay: '100ms', slowDelay: '9100ms' });
    expect(waitingTiming({ startedAt: 2000, now: 3200 })).toMatchObject({ revealDelay: '-200ms', slowDelay: '8800ms' });
  });

  it('should take the server-rendered delays from navigation start through --wait-offset', () => {
    expect(waitingTiming({ startedAt: 0 })).toEqual({
      state: 'waiting',
      revealDelay: 'calc(1000ms + var(--wait-offset, 0ms))',
      slowDelay: 'calc(10000ms + var(--wait-offset, 0ms))',
      entrance: '150ms',
    });
  });

  it('should hold a shown indicator for the rest of its minimum, and no longer', () => {
    expect(settledTiming({ settledAt: 600 })).toEqual({ state: 'idle' });
    expect(settledTiming({ settledAt: 1000 })).toEqual({ state: 'holding', hideDelay: '500ms', isSlow: false });
    expect(settledTiming({ settledAt: 1100 })).toEqual({ state: 'holding', hideDelay: '400ms', isSlow: false });
    expect(settledTiming({ settledAt: 1500 })).toEqual({ state: 'idle' });
  });

  it('should count the minimum from when a late-mounted indicator became visible', () => {
    // Mounted 1,200 ms into the wait, so visible from 1,200 ms; content at 1,300 ms holds it to 1,700 ms.
    expect(settledTiming({ settledAt: 1300, shownAt: 1200 })).toEqual({
      state: 'holding',
      hideDelay: '400ms',
      isSlow: false,
    });
    expect(waitPhaseAt({ elapsed: 1699, settledAt: 1300, shownAt: 1200 })).toBe('shown');
    expect(waitPhaseAt({ elapsed: 1700, settledAt: 1300, shownAt: 1200 })).toBe('hidden');
    // Before it became visible it is hidden, while running and once content beat it.
    expect(waitPhaseAt({ elapsed: 1100, shownAt: 1200 })).toBe('hidden');
    expect(waitPhaseAt({ elapsed: 1100, settledAt: 1150, shownAt: 1200 })).toBe('hidden');
    expect(waitPhaseAt({ elapsed: 1200, shownAt: 1200 })).toBe('shown');
    expect(settledTiming({ settledAt: 1460, shownAt: 1450 })).toEqual({
      state: 'holding',
      hideDelay: '490ms',
      isSlow: false,
    });
  });

  it('should keep the slow words through a hold that starts after the slow mark', () => {
    // Mounted 9,800 ms in, slow from 10,000 ms, settled at 10,100 ms: held to 10,300 ms with the slow words.
    expect(settledTiming({ settledAt: 10_100, shownAt: 9800 })).toEqual({
      state: 'holding',
      hideDelay: '200ms',
      isSlow: true,
    });
    expect(waitPhaseAt({ elapsed: 10_200, settledAt: 10_100, shownAt: 9800 })).toBe('slow');
    expect(waitPhaseAt({ elapsed: 10_300, settledAt: 10_100, shownAt: 9800 })).toBe('hidden');
  });

  it('should hold an indicator that a new wait took over until the minimum it already owed', () => {
    // Showing since 200 ms before this wait started: content 100 ms in holds it to 300 ms.
    expect(waitPhaseAt({ elapsed: 0, shownAt: -200 })).toBe('shown');
    expect(settledTiming({ settledAt: 100, shownAt: -200 })).toEqual({
      state: 'holding',
      hideDelay: '200ms',
      isSlow: false,
    });
  });

  it('should start a wait that takes over a showing indicator already revealed', () => {
    expect(waitingTiming({ startedAt: 10_300, now: 10_300, isShowing: true })).toMatchObject({
      revealDelay: '-150ms',
      slowDelay: '10000ms',
    });
  });
});

describe('the wait utilities in tokens.css', () => {
  const tokens = readFileSync(join(import.meta.dirname, '../styles/tokens.css'), 'utf8');

  it('should fall back to the constants, so the ladder has one owner', () => {
    expect(tokens).toContain(
      `animation: wait-reveal var(--wait-entrance, ${indicatorEntranceMilliseconds}ms) ease-out var(--wait-reveal-delay, ${indicatorDelayMilliseconds}ms) both;`,
    );
    expect(tokens).toContain(`var(--wait-slow-delay, ${slowWaitMilliseconds}ms) both;`);
  });
});
