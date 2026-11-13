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
    expect(waitPhaseAt(999)).toBe('hidden');
    expect(waitPhaseAt(1000)).toBe('shown');
  });

  it('should turn slow at 10,000 ms', () => {
    expect(waitPhaseAt(9999)).toBe('shown');
    expect(waitPhaseAt(10_000)).toBe('slow');
  });

  it('should never show the indicator for content that arrives at 600 ms', () => {
    for (const elapsed of [0, 600, 999, 1000, 1500, 12_000]) {
      expect(waitPhaseAt(elapsed, 600), `${elapsed} ms`).toBe('hidden');
    }
  });

  it('should keep the indicator to 1,500 ms for content that arrives at 1,100 ms', () => {
    expect(waitPhaseAt(1100, 1100)).toBe('shown');
    expect(waitPhaseAt(1499, 1100)).toBe('shown');
    expect(waitPhaseAt(1500, 1100)).toBe('hidden');
  });

  it('should drop a shown indicator at once when it has already served its minimum', () => {
    expect(waitPhaseAt(1600, 1600)).toBe('hidden');
    expect(waitPhaseAt(11_000, 11_000)).toBe('hidden');
  });
});

describe('the indicator timing', () => {
  it('should measure a running wait from its start, not from the mount', () => {
    expect(waitingTiming(0, 0)).toEqual({
      state: 'waiting',
      revealDelay: '1000ms',
      slowDelay: '10000ms',
      entrance: '150ms',
    });
    expect(waitingTiming(0, 900)).toMatchObject({ revealDelay: '100ms', slowDelay: '9100ms' });
    expect(waitingTiming(2000, 3200)).toMatchObject({ revealDelay: '-200ms', slowDelay: '8800ms' });
  });

  it('should take the server-rendered delays from navigation start through --wait-offset', () => {
    expect(waitingTiming(0)).toEqual({
      state: 'waiting',
      revealDelay: 'calc(1000ms + var(--wait-offset, 0ms))',
      slowDelay: 'calc(10000ms + var(--wait-offset, 0ms))',
      entrance: '150ms',
    });
  });

  it('should hold a shown indicator for the rest of its minimum, and no longer', () => {
    expect(settledTiming(600)).toEqual({ state: 'idle' });
    expect(settledTiming(1000)).toEqual({ state: 'holding', hideDelay: '500ms' });
    expect(settledTiming(1100)).toEqual({ state: 'holding', hideDelay: '400ms' });
    expect(settledTiming(1500)).toEqual({ state: 'idle' });
  });

  it('should count the minimum from when a late-mounted indicator became visible', () => {
    // Mounted 1,200 ms into the wait, so visible from 1,200 ms; content at 1,300 ms holds it to 1,700 ms.
    expect(settledTiming(1300, 1200)).toEqual({ state: 'holding', hideDelay: '400ms' });
    expect(waitPhaseAt(1699, 1300, 1200)).toBe('shown');
    expect(waitPhaseAt(1700, 1300, 1200)).toBe('hidden');
    expect(settledTiming(1460, 1450)).toEqual({ state: 'holding', hideDelay: '490ms' });
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
