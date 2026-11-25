/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names are snake_case. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bootDeadlines, bootDeadlineScaleOf, createBootWatchdog } from '#main/boot-watchdog.js';
import type { BootWatchdogHost } from '#main/boot-watchdog.js';

/**
 * T-R12.5: one case for each row of D0's watchdog table, over fake timers. The three renderer rows (unresponsive for
 * 30 s, two deaths within 60 s, three within 5 minutes) belong to WP8's reload policy, which wires the
 * `openRecovery` and `restartInSafeMode` hooks tested in `recovery-window.test.ts`.
 */
const host = () => {
  const window = { reload: vi.fn(), close: vi.fn(), loadURL: vi.fn() };
  const calls = {
    openRecovery: vi.fn<BootWatchdogHost['openRecovery']>(),
    offerRecovery: vi.fn<BootWatchdogHost['offerRecovery']>(),
    markDeadlinePassed: vi.fn<BootWatchdogHost['markDeadlinePassed']>(),
    endUserClosed: vi.fn<BootWatchdogHost['endUserClosed']>(),
    noteGpuProcessGone: vi.fn<BootWatchdogHost['noteGpuProcessGone']>(),
    report: vi.fn<BootWatchdogHost['report']>(),
  };
  const watchdog = createBootWatchdog({
    ...calls,
    setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimeout: (handle) => {
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
    safeMode: () => false,
  });
  return { ...calls, window, watchdog };
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('boot watchdog rules (T-R12.5)', () => {
  it('should leave a slow load alone: nothing is replaced, reloaded or closed at 15 s', () => {
    const { watchdog, window, openRecovery, offerRecovery } = host();
    watchdog.start();
    watchdog.windowCreated();
    vi.advanceTimersByTime(bootDeadlines.revealMilliseconds);
    vi.advanceTimersByTime(10_000);
    expect(openRecovery).not.toHaveBeenCalled();
    expect(offerRecovery).not.toHaveBeenCalled();
    expect(window.reload).not.toHaveBeenCalled();
    expect(window.close).not.toHaveBeenCalled();
  });

  it('should open recovery when the main frame fails its first load, and not for a sub-frame or an aborted load', () => {
    const { watchdog, openRecovery } = host();
    watchdog.start();
    watchdog.windowCreated();
    watchdog.loadFailed({ isMainFrame: false, errorCode: -105 });
    watchdog.loadFailed({ isMainFrame: true, errorCode: -3 });
    expect(openRecovery).not.toHaveBeenCalled();
    watchdog.loadFailed({ isMainFrame: true, errorCode: -6 });
    expect(openRecovery).toHaveBeenCalledExactlyOnceWith('load-failed');
  });

  it('should open recovery for a rejected loadURL or a renderer that died during the first load', () => {
    const rejected = host();
    rejected.watchdog.start();
    rejected.watchdog.windowCreated();
    rejected.watchdog.loadRejected();
    expect(rejected.openRecovery).toHaveBeenCalledExactlyOnceWith('load-failed');

    const died = host();
    died.watchdog.start();
    died.watchdog.windowCreated();
    died.watchdog.rendererGone();
    expect(died.openRecovery).toHaveBeenCalledExactlyOnceWith('load-failed');

    /* After the load the renderer's deaths are the reload policy's (WP8), not a failed first load. */
    const later = host();
    later.watchdog.start();
    later.watchdog.windowCreated();
    later.watchdog.windowLoaded();
    later.watchdog.rendererGone();
    later.watchdog.loadFailed({ isMainFrame: true, errorCode: -6 });
    expect(later.openRecovery).not.toHaveBeenCalled();
  });

  it('should offer recovery beside the app at 45 s without shell-mounted, and neither reload nor close it', () => {
    const { watchdog, window, offerRecovery, openRecovery } = host();
    watchdog.start();
    watchdog.windowCreated();
    vi.advanceTimersByTime(bootDeadlines.shellMountedMilliseconds - 1);
    expect(offerRecovery).not.toHaveBeenCalled();
    expect(watchdog.pastShellDeadline()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(offerRecovery).toHaveBeenCalledExactlyOnceWith('shell-timeout');
    expect(watchdog.pastShellDeadline()).toBe(true);
    expect(openRecovery).not.toHaveBeenCalled();
    expect(window.reload).not.toHaveBeenCalled();
    expect(window.close).not.toHaveBeenCalled();
  });

  it('should open nothing when shell-mounted arrives without home-ready, and mark the deadline at 60 s', () => {
    const { watchdog, offerRecovery, openRecovery, markDeadlinePassed } = host();
    watchdog.start();
    watchdog.windowCreated();
    watchdog.windowLoaded();
    watchdog.stage('shell-mounted');
    vi.advanceTimersByTime(bootDeadlines.launchMilliseconds - 1);
    expect(markDeadlinePassed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(markDeadlinePassed).toHaveBeenCalledOnce();
    expect(offerRecovery).not.toHaveBeenCalled();
    expect(openRecovery).not.toHaveBeenCalled();
  });

  it('should stop every deadline at home-ready', () => {
    const { watchdog, offerRecovery, markDeadlinePassed } = host();
    watchdog.start();
    watchdog.windowCreated();
    watchdog.stage('shell-mounted');
    watchdog.stage('home-ready');
    vi.advanceTimersByTime(10 * bootDeadlines.launchMilliseconds);
    expect(offerRecovery).not.toHaveBeenCalled();
    expect(markDeadlinePassed).not.toHaveBeenCalled();
  });

  it('should cancel every deadline on suspend and start each again from zero on resume', () => {
    const { watchdog, offerRecovery, markDeadlinePassed } = host();
    watchdog.start();
    watchdog.windowCreated();
    vi.advanceTimersByTime(40_000);
    watchdog.suspend();
    vi.advanceTimersByTime(10 * bootDeadlines.launchMilliseconds);
    expect(offerRecovery).not.toHaveBeenCalled();
    expect(markDeadlinePassed).not.toHaveBeenCalled();
    watchdog.resume();
    vi.advanceTimersByTime(bootDeadlines.shellMountedMilliseconds - 1);
    expect(offerRecovery).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(offerRecovery).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(bootDeadlines.launchMilliseconds - bootDeadlines.shellMountedMilliseconds);
    expect(markDeadlinePassed).toHaveBeenCalledOnce();
  });

  it('should stop the deadlines and end the record as user-closed-window when the person closes the window', () => {
    const { watchdog, offerRecovery, markDeadlinePassed, endUserClosed } = host();
    watchdog.start();
    watchdog.windowCreated();
    vi.advanceTimersByTime(5000);
    watchdog.windowClosed();
    expect(endUserClosed).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10 * bootDeadlines.launchMilliseconds);
    expect(offerRecovery).not.toHaveBeenCalled();
    expect(markDeadlinePassed).not.toHaveBeenCalled();
  });

  it('should not read a closed window as the person closing it once home-ready has arrived', () => {
    const { watchdog, endUserClosed } = host();
    watchdog.start();
    watchdog.windowCreated();
    watchdog.stage('shell-mounted');
    watchdog.stage('home-ready');
    watchdog.windowClosed();
    expect(endUserClosed).not.toHaveBeenCalled();
  });

  it('should report a GPU process that exited and note it for the ledger, and ignore other child processes', () => {
    const { watchdog, report, noteGpuProcessGone } = host();
    watchdog.start();
    watchdog.childProcessGone({ type: 'Utility', reason: 'crashed', exitCode: 1 });
    expect(report).not.toHaveBeenCalled();
    watchdog.childProcessGone({ type: 'GPU', reason: 'crashed', exitCode: 133 });
    expect(noteGpuProcessGone).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        fingerprint: ['desktop-gpu-process-gone', 'crashed'],
        tags: { reason: 'crashed', exit_code: '133', safe_mode: 'false' },
      }),
    );
  });

  it('should scale every deadline by the test-only factor and ignore a malformed one', () => {
    expect(bootDeadlineScaleOf(undefined)).toBe(1);
    expect(bootDeadlineScaleOf('0.01')).toBe(0.01);
    expect(bootDeadlineScaleOf('nope')).toBe(1);
    expect(bootDeadlineScaleOf('-2')).toBe(1);
    expect(bootDeadlineScaleOf('0')).toBe(1);
    const offerRecovery = vi.fn();
    const watchdog = createBootWatchdog({
      openRecovery: vi.fn(),
      offerRecovery,
      markDeadlinePassed: vi.fn(),
      endUserClosed: vi.fn(),
      noteGpuProcessGone: vi.fn(),
      report: vi.fn(),
      setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
      clearTimeout: (handle) => {
        clearTimeout(handle as ReturnType<typeof setTimeout>);
      },
      safeMode: () => false,
      scale: 0.01,
    });
    watchdog.start();
    watchdog.windowCreated();
    vi.advanceTimersByTime(bootDeadlines.shellMountedMilliseconds * 0.01);
    expect(offerRecovery).toHaveBeenCalledOnce();
  });

  it('should offer recovery at most once per launch', () => {
    const { watchdog, offerRecovery, openRecovery } = host();
    watchdog.start();
    watchdog.windowCreated();
    watchdog.loadFailed({ isMainFrame: true, errorCode: -6 });
    watchdog.loadRejected();
    vi.advanceTimersByTime(bootDeadlines.launchMilliseconds);
    expect(openRecovery).toHaveBeenCalledOnce();
    expect(offerRecovery).not.toHaveBeenCalled();
  });
});
