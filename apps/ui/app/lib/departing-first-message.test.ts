import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  arriveFirstMessage,
  departFirstMessage,
  departingFirstMessageLimit,
  departingFirstMessageOf,
} from '#lib/departing-first-message.js';

describe('departing first message', () => {
  afterEach(() => {
    arriveFirstMessage('home/one');
    arriveFirstMessage('home/two');
    vi.useRealTimers();
  });

  it('holds one message for its project until that project draws it', () => {
    departFirstMessage('home/one', 'A bracket');

    expect(departingFirstMessageOf('home/one')).toBe('A bracket');
    expect(departingFirstMessageOf('home/two')).toBeUndefined();
    arriveFirstMessage('home/two');
    expect(departingFirstMessageOf('home/one')).toBe('A bracket');
    arriveFirstMessage('home/one');
    expect(departingFirstMessageOf('home/one')).toBeUndefined();
  });

  it('keeps only the newest', () => {
    departFirstMessage('home/one', 'A bracket');
    departFirstMessage('home/two', 'A hinge');

    expect(departingFirstMessageOf('home/one')).toBeUndefined();
    expect(departingFirstMessageOf('home/two')).toBe('A hinge');
  });

  it('stops standing in for a message its chat never draws', () => {
    vi.useFakeTimers();
    departFirstMessage('home/one', 'A bracket');

    vi.advanceTimersByTime(departingFirstMessageLimit - 1);
    expect(departingFirstMessageOf('home/one')).toBe('A bracket');
    vi.advanceTimersByTime(1);
    expect(departingFirstMessageOf('home/one')).toBeUndefined();
  });
});
