/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names are snake_case. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LaunchMode } from '#main/boot-health.js';
import { autoInstallCountdownMilliseconds, createAutoInstall } from '#main/update-auto-install.js';
import type { AutoInstallState } from '#main/update-auto-install.js';

type Signal = { readonly fingerprint: readonly string[]; readonly tags: Record<string, string> };

const setup = (options: { mode?: LaunchMode; blockedTarget?: string; recoveryShowing?: boolean } = {}) => {
  let recoveryShowing = options.recoveryShowing ?? false;
  const calls: string[] = [];
  const noteAutoInstall = vi.fn((target: string) => {
    calls.push(`note:${target}`);
  });
  const install = vi.fn(async () => {
    calls.push('install');
  });
  const published: Array<AutoInstallState | undefined> = [];
  const report = vi.fn<(signal: Signal) => void>();
  const showCountdown = vi.fn(() => {
    recoveryShowing = true;
  });
  const autoInstall = createAutoInstall({
    mode: options.mode ?? 'safe-auto',
    blockedTarget: options.blockedTarget,
    recoveryShowing: () => recoveryShowing,
    showCountdown,
    noteAutoInstall,
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
    openRecovery: () => {
      recoveryShowing = true;
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
});
/* eslint-enable @typescript-eslint/naming-convention -- End snake_case tags. */
