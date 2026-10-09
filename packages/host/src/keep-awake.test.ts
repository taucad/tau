import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { keepAwakeWhileStreaming, platformKeepAwakeBlocker } from '#keep-awake.js';

/* Nothing here may hold a real computer awake: every spawn is a stub child. */
const spawned = vi.hoisted(() => [] as Array<{ command: string; args: readonly string[]; kill: () => void }>);
vi.mock('node:child_process', () => ({
  spawn: (command: string, args: readonly string[]) => {
    const child = { once: vi.fn(), kill: vi.fn() };
    spawned.push({ command, args, kill: child.kill });
    return child;
  },
}));

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
    const release = vi.fn();
    const blocker = { hold: vi.fn(() => release) };
    const stop = keepAwakeWhileStreaming({
      streamingMachines: async () => {
        if (isUnanswered) {
          throw new Error('The desktop machine host did not say whether a program is streaming.');
        }
        return streaming;
      },
      blocker,
      intervalMilliseconds: 1000,
      log: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(blocker.hold).not.toHaveBeenCalled();

    streaming = ['Router'];
    await vi.advanceTimersByTimeAsync(1000);
    expect(blocker.hold).toHaveBeenCalledOnce();
    /* Held once, however many times it is asked. */
    await vi.advanceTimersByTimeAsync(3000);
    expect(blocker.hold).toHaveBeenCalledOnce();

    /* Unknown is not "none": what is held stays held. */
    isUnanswered = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(release).not.toHaveBeenCalled();

    isUnanswered = false;
    streaming = [];
    await vi.advanceTimersByTimeAsync(1000);
    expect(release).toHaveBeenCalledOnce();

    streaming = ['Router'];
    await vi.advanceTimersByTimeAsync(1000);
    expect(blocker.hold).toHaveBeenCalledTimes(2);
    /* Stopping releases it. */
    stop();
    expect(release).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(blocker.hold).toHaveBeenCalledTimes(2);
  });
});

describe('platformKeepAwakeBlocker', () => {
  afterEach(() => {
    spawned.length = 0;
  });

  it('should run caffeinate on macOS until released or until this process exits', () => {
    const warn = vi.fn();
    const exitListeners = process.listenerCount('exit');
    const release = platformKeepAwakeBlocker({ platform: 'darwin', warn }).hold();
    expect(spawned).toMatchObject([{ command: 'caffeinate', args: ['-i', '-w', String(process.pid)] }]);
    expect(process.listenerCount('exit')).toBe(exitListeners + 1);
    release();
    expect(spawned[0]?.kill).toHaveBeenCalledOnce();
    expect(process.listenerCount('exit')).toBe(exitListeners);
    expect(warn).not.toHaveBeenCalled();
  });

  it('should inhibit idle sleep on Linux for as long as this process lives', () => {
    platformKeepAwakeBlocker({ platform: 'linux', warn: vi.fn() }).hold()();
    expect(spawned).toMatchObject([
      {
        command: 'systemd-inhibit',
        args: expect.arrayContaining(['--what=idle:sleep', 'tail', `--pid=${String(process.pid)}`]) as unknown,
      },
    ]);
  });

  it('should warn once and hold nothing where it has no keep-awake command', () => {
    const warn = vi.fn();
    const blocker = platformKeepAwakeBlocker({ platform: 'win32', warn });
    blocker.hold()();
    blocker.hold()();
    expect(spawned).toEqual([]);
    expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('cannot keep this computer awake'));
  });
});
