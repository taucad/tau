/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names are snake_case. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LaunchMode } from '#main/boot-health.js';
import { autoInstallCountdownMilliseconds, createAutoInstall } from '#main/update-auto-install.js';
import type { AutoInstallState } from '#main/update-auto-install.js';

type Signal = { readonly fingerprint: readonly string[]; readonly tags: Record<string, string> };

const setup = (
  options: {
    mode?: LaunchMode;
    blockedTarget?: string;
    recoveryShowing?: boolean;
    /** The recovery window cannot show (its native fallback replaces it), so no Cancel is on screen. */
    recoveryFails?: boolean;
    /** Whether `install()` reports that the restart into the update went ahead, or throws. */
    installProceeds?: boolean | 'throws';
  } = {},
) => {
  let recoveryShowing = options.recoveryShowing ?? false;
  let quitting = false;
  const calls: string[] = [];
  const noteAutoInstall = vi.fn((target: string) => {
    calls.push(`note:${target}`);
  });
  const withdrawAutoInstall = vi.fn((target: string) => {
    calls.push(`withdraw:${target}`);
  });
  const install = vi.fn(async (): Promise<boolean> => {
    calls.push('install');
    if (options.installProceeds === 'throws') {
      throw new Error('prepare failed');
    }
    return options.installProceeds ?? true;
  });
  const published: Array<AutoInstallState | undefined> = [];
  const report = vi.fn<(signal: Signal) => void>();
  const showCountdown = vi.fn(() => {
    recoveryShowing = options.recoveryFails !== true;
  });
  const autoInstall = createAutoInstall({
    mode: options.mode ?? 'safe-auto',
    blockedTarget: options.blockedTarget,
    recoveryShowing: () => recoveryShowing,
    quitting: () => quitting,
    showCountdown,
    noteAutoInstall,
    withdrawAutoInstall,
    install,
    publish: (state) => {
      published.push(state);
    },
    report,
    log: vi.fn(),
  });
  const outcomes = (): string[] => report.mock.calls.map(([signal]) => signal.tags['outcome']!);
  return {
    autoInstall,
    calls,
    noteAutoInstall,
    install,
    published,
    report,
    outcomes,
    showCountdown,
    withdrawAutoInstall,
    openRecovery: () => {
      recoveryShowing = true;
      autoInstall.reevaluate();
    },
    /* The person closed the recovery window, or it failed and its native fallback replaced it. */
    closeRecovery: () => {
      recoveryShowing = false;
      autoInstall.reevaluate();
    },
    startQuitting: () => {
      quitting = true;
      autoInstall.reevaluate();
    },
  };
};
const ready = { phase: 'ready', version: '1.15.1' } as const;

describe('automatic install of a downloaded update on a broken launch (N1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should count down for 10 s in automatic safe mode, write the ledger, then install (T-N1.1)', async () => {
    const { autoInstall, calls, install, noteAutoInstall, published, report, showCountdown } = setup();
    autoInstall.updateChanged({ phase: 'downloading', version: '1.15.1' });
    expect(published).toEqual([]);
    autoInstall.updateChanged(ready);
    expect(autoInstallCountdownMilliseconds).toBe(10_000);
    expect(published.at(-1)).toEqual({
      status: 'counting',
      targetVersion: '1.15.1',
      milliseconds: autoInstallCountdownMilliseconds,
    });
    expect(autoInstall.state()).toEqual(published.at(-1));
    expect(showCountdown).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(9999);
    expect(install).not.toHaveBeenCalled();
    expect(noteAutoInstall).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(['note:1.15.1', 'install']);
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint: ['desktop-update-auto-install', 'started'],
        tags: { outcome: 'started', target_version: '1.15.1' },
      }),
    );
    /* A later snapshot for the same target does not start a second countdown. */
    autoInstall.updateChanged(ready);
    await vi.advanceTimersByTimeAsync(autoInstallCountdownMilliseconds);
    expect(install).toHaveBeenCalledOnce();
  });

  it('should not install when Cancel is sent, and not count down again for that target (T-N1.1)', async () => {
    const { autoInstall, install, noteAutoInstall, published, outcomes } = setup();
    autoInstall.updateChanged(ready);
    await vi.advanceTimersByTimeAsync(4000);
    autoInstall.cancel();
    expect(published.at(-1)).toBeUndefined();
    expect(autoInstall.state()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(autoInstallCountdownMilliseconds);
    autoInstall.updateChanged(ready);
    await vi.advanceTimersByTimeAsync(autoInstallCountdownMilliseconds);
    expect(install).not.toHaveBeenCalled();
    expect(noteAutoInstall).not.toHaveBeenCalled();
    expect(outcomes()).toEqual(['cancelled']);
  });

  it('should not install when home-ready arrives during the countdown (T-N1.1)', async () => {
    const { autoInstall, install, noteAutoInstall, published } = setup();
    autoInstall.updateChanged(ready);
    await vi.advanceTimersByTimeAsync(5000);
    autoInstall.homeReady();
    expect(published.at(-1)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(autoInstallCountdownMilliseconds);
    expect(install).not.toHaveBeenCalled();
    expect(noteAutoInstall).not.toHaveBeenCalled();
  });

  it('should not count down in a launch that reached home-ready (T-N1.1)', async () => {
    const { autoInstall, install, published, openRecovery } = setup();
    autoInstall.homeReady();
    autoInstall.updateChanged(ready);
    openRecovery();
    await vi.advanceTimersByTimeAsync(autoInstallCountdownMilliseconds * 2);
    expect(published).toEqual([]);
    expect(install).not.toHaveBeenCalled();
  });

  it('should not count down in a normal launch with no recovery window, and should once it shows (T-N1.1)', async () => {
    const { autoInstall, install, published, openRecovery, showCountdown } = setup({ mode: 'normal' });
    autoInstall.updateChanged(ready);
    await vi.advanceTimersByTimeAsync(autoInstallCountdownMilliseconds * 2);
    expect(published).toEqual([]);
    expect(install).not.toHaveBeenCalled();
    openRecovery();
    expect(published.at(-1)).toEqual(expect.objectContaining({ status: 'counting', targetVersion: '1.15.1' }));
    expect(showCountdown).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(autoInstallCountdownMilliseconds);
    expect(install).toHaveBeenCalledOnce();
  });

  it('should not count down in a requested safe launch with no recovery window (T-N1.1)', async () => {
    const { autoInstall, install, published } = setup({ mode: 'safe-requested' });
    autoInstall.updateChanged(ready);
    await vi.advanceTimersByTimeAsync(autoInstallCountdownMilliseconds * 2);
    expect(published).toEqual([]);
    expect(install).not.toHaveBeenCalled();
  });

  it('should skip a target whose automatic install did not take, report it once, and leave the manual install (T-N1.2)', async () => {
    const { autoInstall, install, noteAutoInstall, published, outcomes, report } = setup({ blockedTarget: '1.15.1' });
    autoInstall.updateChanged(ready);
    autoInstall.updateChanged(ready);
    await vi.advanceTimersByTimeAsync(autoInstallCountdownMilliseconds * 2);
    expect(install).not.toHaveBeenCalled();
    expect(noteAutoInstall).not.toHaveBeenCalled();
    expect(outcomes()).toEqual(['skipped-repeat']);
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ tags: { outcome: 'skipped-repeat', target_version: '1.15.1' } }),
    );
    /* No countdown: the recovery window keeps Install update and restart and Download Tau. */
    expect(published.at(-1)).toEqual({ status: 'skipped-repeat', targetVersion: '1.15.1' });
    expect(autoInstall.state()).toEqual({ status: 'skipped-repeat', targetVersion: '1.15.1' });
  });

  it('should still count down for a newer target than the one that did not take (T-N1.2)', async () => {
    const { autoInstall, install, noteAutoInstall } = setup({ blockedTarget: '1.15.1' });
    autoInstall.updateChanged({ phase: 'ready', version: '1.15.2' });
    await vi.advanceTimersByTimeAsync(autoInstallCountdownMilliseconds);
    expect(noteAutoInstall).toHaveBeenCalledWith('1.15.2');
    expect(install).toHaveBeenCalledOnce();
  });

  it('should stop the countdown when the update is no longer ready', async () => {
    const { autoInstall, install, published } = setup();
    autoInstall.updateChanged(ready);
    autoInstall.updateChanged({ phase: 'downloading', version: '1.15.2' });
    expect(published.at(-1)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(autoInstallCountdownMilliseconds);
    expect(install).not.toHaveBeenCalled();
  });
  it('should stop the countdown, and not install, when the recovery window that shows Cancel closes', async () => {
    const { autoInstall, install, noteAutoInstall, published, showCountdown, closeRecovery, openRecovery } = setup();
    autoInstall.updateChanged(ready);
    await vi.advanceTimersByTimeAsync(3000);
    closeRecovery();
    expect(published.at(-1)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(autoInstallCountdownMilliseconds * 2);
    expect(install).not.toHaveBeenCalled();
    expect(noteAutoInstall).not.toHaveBeenCalled();
    /* Closing it is a refusal for this launch: the window is not reopened to count down again. */
    autoInstall.updateChanged(ready);
    expect(showCountdown).toHaveBeenCalledOnce();
    openRecovery();
    await vi.advanceTimersByTimeAsync(autoInstallCountdownMilliseconds);
    expect(install).not.toHaveBeenCalled();
  });

  it('should not install behind the native fallback, which has no Cancel', async () => {
    const { autoInstall, install, noteAutoInstall, published, showCountdown } = setup({ recoveryFails: true });
    autoInstall.updateChanged(ready);
    expect(showCountdown).toHaveBeenCalledOnce();
    expect(published.at(-1)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(autoInstallCountdownMilliseconds * 2);
    expect(install).not.toHaveBeenCalled();
    expect(noteAutoInstall).not.toHaveBeenCalled();
    autoInstall.updateChanged(ready);
    expect(showCountdown).toHaveBeenCalledOnce();
  });

  it('should neither start nor finish a countdown while Tau is quitting or restarting', async () => {
    const running = setup({ mode: 'normal', recoveryShowing: true });
    running.autoInstall.updateChanged(ready);
    expect(running.published.at(-1)).toEqual(expect.objectContaining({ status: 'counting' }));
    running.startQuitting();
    expect(running.published.at(-1)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(autoInstallCountdownMilliseconds * 2);
    expect(running.install).not.toHaveBeenCalled();

    const restarting = setup({ mode: 'normal' });
    restarting.startQuitting();
    restarting.autoInstall.updateChanged(ready);
    restarting.openRecovery();
    await vi.advanceTimersByTimeAsync(autoInstallCountdownMilliseconds * 2);
    expect(restarting.published).toEqual([]);
    expect(restarting.showCountdown).not.toHaveBeenCalled();
    expect(restarting.install).not.toHaveBeenCalled();
  });

  it('should withdraw the ledger record when the install did not go ahead, so the target is not blocked', async () => {
    const refused = setup({ installProceeds: false });
    refused.autoInstall.updateChanged(ready);
    await vi.advanceTimersByTimeAsync(autoInstallCountdownMilliseconds);
    expect(refused.calls).toEqual(['note:1.15.1', 'install', 'withdraw:1.15.1']);

    const failed = setup({ installProceeds: 'throws' });
    failed.autoInstall.updateChanged(ready);
    await vi.advanceTimersByTimeAsync(autoInstallCountdownMilliseconds);
    expect(failed.calls).toEqual(['note:1.15.1', 'install', 'withdraw:1.15.1']);

    const proceeded = setup();
    proceeded.autoInstall.updateChanged(ready);
    await vi.advanceTimersByTimeAsync(autoInstallCountdownMilliseconds);
    expect(proceeded.calls).toEqual(['note:1.15.1', 'install']);
    expect(proceeded.withdrawAutoInstall).not.toHaveBeenCalled();
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- End snake_case tags. */
