import { describe, expect, it } from 'vitest';
import {
  indicatorDelayMilliseconds,
  indicatorMinimumMilliseconds,
  settledTiming,
  slowWaitMilliseconds,
  waitingTiming,
  waitPhaseAt,
} from '#utils/wait-timing.js';

describe('the wait timing ladder', () => {
  it('holds the blueprint constants', () => {
    expect([indicatorDelayMilliseconds, indicatorMinimumMilliseconds, slowWaitMilliseconds]).toEqual([
      1000, 500, 10_000,
    ]);
  });

  it('is hidden at 999 ms and shown at 1,000 ms', () => {
    expect(waitPhaseAt(999)).toBe('hidden');
    expect(waitPhaseAt(1000)).toBe('shown');
  });

  it('turns slow at 10,000 ms', () => {
    expect(waitPhaseAt(9999)).toBe('shown');
    expect(waitPhaseAt(10_000)).toBe('slow');
  });

  it('never shows the indicator for content that arrives at 600 ms', () => {
    for (const elapsed of [0, 600, 999, 1000, 1500, 12_000]) {
      expect(waitPhaseAt(elapsed, 600), `${elapsed} ms`).toBe('hidden');
    }
  });

  it('keeps the indicator to 1,500 ms for content that arrives at 1,100 ms', () => {
    expect(waitPhaseAt(1100, 1100)).toBe('shown');
    expect(waitPhaseAt(1499, 1100)).toBe('shown');
    expect(waitPhaseAt(1500, 1100)).toBe('hidden');
  });

  it('drops a shown indicator at once when it has already served its minimum', () => {
    expect(waitPhaseAt(1600, 1600)).toBe('hidden');
    expect(waitPhaseAt(11_000, 11_000)).toBe('hidden');
  });
});

describe('the indicator timing', () => {
  it('measures a running wait from its start, not from the mount', () => {
    expect(waitingTiming(0, 0)).toEqual({ state: 'waiting', revealDelay: '1000ms', slowDelay: '10000ms' });
    expect(waitingTiming(0, 900)).toEqual({ state: 'waiting', revealDelay: '100ms', slowDelay: '9100ms' });
    expect(waitingTiming(2000, 3200)).toEqual({ state: 'waiting', revealDelay: '-200ms', slowDelay: '8800ms' });
  });

  it('takes the server-rendered delays from navigation start through --wait-offset', () => {
    expect(waitingTiming(0)).toEqual({
      state: 'waiting',
      revealDelay: 'calc(1000ms + var(--wait-offset, 0ms))',
      slowDelay: 'calc(10000ms + var(--wait-offset, 0ms))',
    });
  });

  it('holds a shown indicator for the rest of its minimum, and no longer', () => {
    expect(settledTiming(600)).toEqual({ state: 'idle' });
    expect(settledTiming(1000)).toEqual({ state: 'holding', hideDelay: '500ms' });
    expect(settledTiming(1100)).toEqual({ state: 'holding', hideDelay: '400ms' });
    expect(settledTiming(1500)).toEqual({ state: 'idle' });
  });
});
