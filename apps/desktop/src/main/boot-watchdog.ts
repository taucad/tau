/**
 * The boot watchdog (desktop resilient startup blueprint, D0; R12, B17, B26).
 *
 * The rules of D0's table that decide what main does while a launch has not reached `home-ready`, over injected
 * timers and events, so every rule is testable with fake timers. Main wires the window's events, `powerMonitor` and
 * `child-process-gone` to it.
 *
 * - A slow load is never replaced: the window is shown at 15 s by `createMainWindow`, and nothing here reloads or
 *   closes it.
 * - A first load that fails outright (main-frame `did-fail-load`, a rejected `loadURL`, the renderer dying during the
 *   load) opens the recovery window.
 * - No `shell-mounted` 45 s after the window was created offers the recovery window beside the app.
 * - No `home-ready` 60 s after the launch began marks the deadline as passed, which makes the launch unhealthy.
 * - `suspend` cancels every pending deadline and `resume` starts each again from zero.
 * - The person closing the window before `home-ready` stops every deadline and ends the record as
 *   `user-closed-window`.
 * - A GPU process that exits is reported and noted, so the launch counts as unhealthy unless `home-ready` arrives.
 *
 * The renderer rows (a hang of 30 s, two deaths within 60 s, three within 5 minutes) are the reload policy's (WP8),
 * which uses the `openRecovery` and `restartInSafeMode` hooks of `recovery-window.ts`.
 */
import type { DesktopSignal } from '#main/desktop-signals.js';
import { gpuProcessGoneSignal } from '#main/desktop-signals.js';

/** D0's deadlines, before the test-only scale. */
export const bootDeadlines = {
  /** The window is shown as it is (owned by `createMainWindow`). */
  revealMilliseconds: 15_000,
  /** No `shell-mounted` after the window was created: recovery is offered beside it. */
  shellMountedMilliseconds: 45_000,
  /** No `home-ready` after the launch began: the launch is recorded as unhealthy. */
  launchMilliseconds: 60_000,
} as const;

/** Why main opened or offered the recovery window. */
export type RecoveryTrigger =
  | 'load-failed'
  | 'shell-timeout'
  | 'requested'
  | 'second-instance'
  | 'check-for-updates'
  | 'renderer-deaths'
  /* An update is about to install by itself (N1): the window shows the countdown and its Cancel. */
  | 'auto-install';

/** Chromium's `ERR_ABORTED`: a load replaced by another, not a failure. */
const abortedLoad = -3;

/**
 * Parse `TAU_E2E_BOOT_DEADLINE_SCALE`, a test-only factor on every deadline. Builds that ignore test overrides strip
 * the variable before main reads it.
 *
 * @param value - The variable's value.
 * @returns A positive factor, or 1.
 */
export const bootDeadlineScaleOf = (value: string | undefined): number => {
  const scale = value === undefined ? Number.NaN : Number(value);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
};

/** What the watchdog acts through. */
export type BootWatchdogHost = {
  readonly setTimeout: (callback: () => void, milliseconds: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
  /** Open the recovery window, because the first load failed. */
  readonly openRecovery: (trigger: RecoveryTrigger) => void;
  /** Offer the recovery window beside the app, which stays as it is. */
  readonly offerRecovery: (trigger: RecoveryTrigger) => void;
  readonly markDeadlinePassed: () => void;
  readonly endUserClosed: () => void;
  readonly noteGpuProcessGone: () => void;
  readonly report: (signal: DesktopSignal) => void;
  /** Whether this launch is in safe mode, for the GPU report. */
  readonly safeMode: () => boolean;
  /** A factor on every deadline; 1 unless a test asks. */
  readonly scale?: number;
};

/** The watchdog main drives. */
export type BootWatchdog = {
  /** The launch began: its 60 s deadline starts. */
  readonly start: () => void;
  /** The main window was created: its 45 s deadline starts. */
  readonly windowCreated: () => void;
  /** `did-finish-load` on the main window. */
  readonly windowLoaded: () => void;
  /** `did-fail-load` on the main window. */
  readonly loadFailed: (load: { readonly isMainFrame: boolean; readonly errorCode: number }) => void;
  /** The first `loadURL` rejected; `errno` is Chromium's error, when the rejection carries one. */
  readonly loadRejected: (errno?: number) => void;
  /** `render-process-gone` on the main window. */
  readonly rendererGone: () => void;
  /** A boot stage the renderer reported. */
  readonly stage: (stage: 'shell-mounted' | 'home-ready') => void;
  readonly suspend: () => void;
  readonly resume: () => void;
  /** The person closed the main window (not a quit). */
  readonly windowClosed: () => void;
  /** `app` `child-process-gone`. */
  readonly childProcessGone: (details: {
    readonly type: string;
    readonly reason: string;
    readonly exitCode: number;
  }) => void;
  /** Whether the 45 s rule has fired: a second launch then opens recovery as well (B19). */
  readonly pastShellDeadline: () => boolean;
  /** Whether `shell-mounted` arrived, so a quit has a page to ask. */
  readonly shellMounted: () => boolean;
  readonly dispose: () => void;
};

/**
 * Create the boot watchdog.
 *
 * @param host - Timers and the actions the rules take.
 * @returns The watchdog.
 */
export const createBootWatchdog = (host: BootWatchdogHost): BootWatchdog => {
  const scale = host.scale ?? 1;
  type Deadline = 'shell' | 'launch';
  const pending = new Map<Deadline, unknown>();
  /* The deadlines that were running when the computer slept, to start again from zero on resume. */
  const suspended = new Set<Deadline>();
  let isSuspended = false;
  let windowLoaded = false;
  let isShellMounted = false;
  let isHomeReady = false;
  let stopped = false;
  let recoveryShown = false;
  let shellDeadlinePassed = false;

  const fire: Record<Deadline, () => void> = {
    shell: () => {
      shellDeadlinePassed = true;
      if (!isShellMounted) {
        offer('shell-timeout');
      }
    },
    launch: () => {
      if (!isHomeReady) {
        host.markDeadlinePassed();
      }
    },
  };
  const milliseconds: Record<Deadline, number> = {
    shell: bootDeadlines.shellMountedMilliseconds,
    launch: bootDeadlines.launchMilliseconds,
  };
  const arm = (deadline: Deadline): void => {
    if (stopped) {
      return;
    }
    if (isSuspended) {
      suspended.add(deadline);
      return;
    }
    clear(deadline);
    pending.set(
      deadline,
      host.setTimeout(() => {
        pending.delete(deadline);
        fire[deadline]();
      }, milliseconds[deadline] * scale),
    );
  };
  const clear = (deadline: Deadline): void => {
    const handle = pending.get(deadline);
    if (handle !== undefined) {
      host.clearTimeout(handle);
      pending.delete(deadline);
    }
    suspended.delete(deadline);
  };
  const stopAll = (): void => {
    stopped = true;
    clear('shell');
    clear('launch');
  };
  const open = (trigger: RecoveryTrigger): void => {
    if (recoveryShown) {
      return;
    }
    recoveryShown = true;
    host.openRecovery(trigger);
  };
  const offer = (trigger: RecoveryTrigger): void => {
    if (recoveryShown) {
      return;
    }
    recoveryShown = true;
    host.offerRecovery(trigger);
  };
  const firstLoadFailed = (): void => {
    if (!windowLoaded && !isShellMounted) {
      open('load-failed');
    }
  };

  return {
    start: () => {
      arm('launch');
    },
    windowCreated: () => {
      if (!isShellMounted) {
        arm('shell');
      }
    },
    windowLoaded: () => {
      windowLoaded = true;
    },
    loadFailed: ({ isMainFrame, errorCode }) => {
      if (isMainFrame && errorCode !== abortedLoad) {
        firstLoadFailed();
      }
    },
    loadRejected: (errno) => {
      if (errno !== abortedLoad) {
        firstLoadFailed();
      }
    },
    rendererGone: () => {
      firstLoadFailed();
    },
    stage: (stage) => {
      if (stage === 'shell-mounted') {
        isShellMounted = true;
        clear('shell');
        return;
      }
      isShellMounted = true;
      isHomeReady = true;
      stopAll();
    },
    suspend: () => {
      if (isSuspended) {
        return;
      }
      for (const deadline of pending.keys()) {
        clear(deadline);
        suspended.add(deadline);
      }
      isSuspended = true;
    },
    resume: () => {
      if (!isSuspended) {
        return;
      }
      isSuspended = false;
      for (const deadline of suspended) {
        suspended.delete(deadline);
        arm(deadline);
      }
    },
    windowClosed: () => {
      if (isHomeReady || stopped) {
        return;
      }
      stopAll();
      host.endUserClosed();
    },
    childProcessGone: ({ type, reason, exitCode }) => {
      if (type !== 'GPU') {
        return;
      }
      host.report(gpuProcessGoneSignal(reason, exitCode, host.safeMode()));
      if (!isHomeReady) {
        host.noteGpuProcessGone();
      }
    },
    pastShellDeadline: () => shellDeadlinePassed && !isShellMounted,
    shellMounted: () => isShellMounted,
    dispose: stopAll,
  };
};
