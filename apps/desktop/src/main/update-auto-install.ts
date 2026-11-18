/**
 * The guarded automatic install (desktop resilient startup blueprint, decision N1; R15).
 *
 * A launch that never reached `home-ready` has nothing unsaved. When such a launch is in automatic safe mode, or the
 * recovery window is showing, and the updater has a downloaded, verified update ready, Tau shows "Installing an update
 * to repair Tau…" with **Cancel** for ten seconds, then installs and restarts. This narrows the updater's rule that a
 * background download never grants install consent (`update-controller.ts`) to this one case.
 *
 * Each target version is tried once: the ledger records the attempt before the install starts, and a later launch that
 * is still on the old version blocks that target (`boot-health.ts`). It then offers the manual **Install update and
 * restart** and **Download Tau** instead, so an installer that fails quietly cannot restart the app in a loop.
 *
 * Everything here takes its effects as arguments; `main.ts` wires it to the updater, the ledger and the recovery
 * window.
 */
import type { DesktopUpdateSnapshot } from '@taucad/types/desktop-updates';

import type { LaunchMode } from '#main/boot-health.js';
import type { DesktopSignal } from '#main/desktop-signals.js';
import { autoInstallSignal } from '#main/desktop-signals.js';

/** How long the person has to cancel before the install starts. */
export const autoInstallCountdownMilliseconds = 10_000;

/** What the recovery window shows about the automatic install. */
export type AutoInstallState =
  /** Counting down to installing `targetVersion`; the page counts the `milliseconds` itself. */
  | { readonly status: 'counting'; readonly targetVersion: string; readonly milliseconds: number }
  /** An automatic install of `targetVersion` did not take before: it is offered by hand instead. */
  | { readonly status: 'skipped-repeat'; readonly targetVersion: string };

/** The automatic install of one launch. */
export type AutoInstall = {
  /** The updater published a new snapshot. */
  readonly updateChanged: (snapshot: Pick<DesktopUpdateSnapshot, 'phase' | 'version'>) => void;
  /** Something the conditions read changed, such as the recovery window opening. */
  readonly reevaluate: () => void;
  /** The launch reached `home-ready`: it is healthy, and nothing installs by itself. */
  readonly homeReady: () => void;
  /** The person pressed Cancel. */
  readonly cancel: () => void;
  /** What the recovery window shows now. */
  readonly state: () => AutoInstallState | undefined;
};

/**
 * Create the automatic install for one launch.
 *
 * @param host - The launch's mode and the target its ledger blocks, whether the recovery window is showing, how to show
 * the countdown, how to record the attempt in the ledger and install, and where to publish, report and log.
 * @returns The automatic install.
 */
export const createAutoInstall = (host: {
  readonly mode: LaunchMode;
  /** A target whose automatic install did not take in an earlier launch. */
  readonly blockedTarget: string | undefined;
  readonly recoveryShowing: () => boolean;
  /** Make the countdown and its Cancel visible: main opens the recovery window. */
  readonly showCountdown: () => void;
  /** Write `autoInstall` to the ledger. */
  readonly noteAutoInstall: (targetVersion: string) => void;
  readonly install: () => Promise<void>;
  readonly publish: (state: AutoInstallState | undefined) => void;
  readonly report: (signal: DesktopSignal) => void;
  readonly log: (level: 'info' | 'warn' | 'error', event: string, detail?: unknown) => void;
  readonly setTimeout?: (callback: () => void, milliseconds: number) => unknown;
  readonly clearTimeout?: (timer: unknown) => void;
}): AutoInstall => {
  const schedule =
    host.setTimeout ??
    ((callback: () => void, milliseconds: number): unknown => {
      const timer = setTimeout(callback, milliseconds);
      timer.unref();
      return timer;
    });
  const unschedule =
    host.clearTimeout ??
    ((timer: unknown): void => {
      clearTimeout(timer as ReturnType<typeof setTimeout>);
    });
  let homeReady = false;
  let update: Pick<DesktopUpdateSnapshot, 'phase' | 'version'> | undefined;
  let countdown: { readonly targetVersion: string; readonly timer: unknown } | undefined;
  let state: AutoInstallState | undefined;
  /* Targets this launch will not count down for again: started, cancelled, or skipped. */
  const settled = new Set<string>();

  const setState = (next: AutoInstallState | undefined): void => {
    if (state === next) {
      return;
    }
    state = next;
    host.publish(next);
  };
  const stop = (reason: string): void => {
    if (countdown === undefined) {
      return;
    }
    host.log('info', 'updater.auto-install-stopped', { reason, targetVersion: countdown.targetVersion });
    unschedule(countdown.timer);
    countdown = undefined;
    setState(undefined);
  };
  const run = (targetVersion: string): void => {
    countdown = undefined;
    settled.add(targetVersion);
    setState(undefined);
    /* Recorded first, so a launch that comes back on the old version knows this target did not take. */
    host.noteAutoInstall(targetVersion);
    host.log('warn', 'updater.auto-install-started', { targetVersion });
    host.report(autoInstallSignal('started', targetVersion));
    // async-iife: bootstrap -- an install that fails is published by the updater as its own state.
    void (async (): Promise<void> => {
      try {
        await host.install();
      } catch (error) {
        host.log('error', 'updater.auto-install-failed', { message: String(error) });
      }
    })();
  };
  const evaluate = (): void => {
    const target = update?.phase === 'ready' ? update.version : undefined;
    if (countdown !== undefined) {
      if (homeReady || target !== countdown.targetVersion) {
        stop(homeReady ? 'home-ready' : 'update-changed');
      }
      return;
    }
    if (target === undefined || homeReady || settled.has(target)) {
      return;
    }
    if (target === host.blockedTarget) {
      settled.add(target);
      host.log('warn', 'updater.auto-install-skipped-repeat', { targetVersion: target });
      host.report(autoInstallSignal('skipped-repeat', target));
      setState({ status: 'skipped-repeat', targetVersion: target });
      return;
    }
    if (host.mode !== 'safe-auto' && !host.recoveryShowing()) {
      return;
    }
    countdown = {
      targetVersion: target,
      timer: schedule(() => {
        run(target);
      }, autoInstallCountdownMilliseconds),
    };
    host.log('warn', 'updater.auto-install-countdown', { targetVersion: target, mode: host.mode });
    setState({ status: 'counting', targetVersion: target, milliseconds: autoInstallCountdownMilliseconds });
    host.showCountdown();
  };

  return {
    updateChanged: (snapshot) => {
      update = { phase: snapshot.phase, version: snapshot.version };
      evaluate();
    },
    reevaluate: evaluate,
    homeReady: () => {
      homeReady = true;
      evaluate();
    },
    cancel: () => {
      if (countdown === undefined) {
        return;
      }
      const { targetVersion } = countdown;
      settled.add(targetVersion);
      host.report(autoInstallSignal('cancelled', targetVersion));
      stop('cancelled');
    },
    state: () => state,
  };
};
