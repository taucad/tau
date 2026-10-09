import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { keepAwakeWhileStreaming } from '#main/keep-awake.js';

describe('keepAwakeWhileStreaming', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should hold the computer awake while a program streams and release it when none does', async () => {
    let streaming: readonly string[] = [];
    let isUnanswered = false;
    const blocker = { start: vi.fn(() => 7), stop: vi.fn() };
    const log = vi.fn();
    const stop = keepAwakeWhileStreaming({
      streamingMachines: async () => {
        if (isUnanswered) {
          throw new Error('The desktop machine host did not say whether a program is streaming.');
        }
        return streaming;
      },
      blocker,
      intervalMilliseconds: 1000,
      log,
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(blocker.start).not.toHaveBeenCalled();

    streaming = ['Router'];
    await vi.advanceTimersByTimeAsync(1000);
    expect(blocker.start).toHaveBeenCalledExactlyOnceWith('prevent-app-suspension');
    /* Held once, however many times it is asked. */
    await vi.advanceTimersByTimeAsync(3000);
    expect(blocker.start).toHaveBeenCalledOnce();

    /* Unknown is not "none": what is held stays held. */
    isUnanswered = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(blocker.stop).not.toHaveBeenCalled();

    isUnanswered = false;
    streaming = [];
    await vi.advanceTimersByTimeAsync(1000);
    expect(blocker.stop).toHaveBeenCalledExactlyOnceWith(7);

    streaming = ['Router'];
    await vi.advanceTimersByTimeAsync(1000);
    expect(blocker.start).toHaveBeenCalledTimes(2);
    /* Quitting releases it. */
    stop();
    expect(blocker.stop).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(blocker.start).toHaveBeenCalledTimes(2);
  });
});
