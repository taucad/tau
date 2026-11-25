/**
 * Desktop safe mode in the renderer (desktop resilient startup blueprint, D0; R12).
 *
 * Main decides safe mode before `ready` and hands it to the page through the preload (`window.tau.safeMode`), with the
 * recovery exits on `window.tau.troubleshooting`. Read here, renderer-locally, as optional members: a shell built
 * before them has neither, and its page starts normally.
 */
/** Why this load started in safe mode. `requested`: the person asked for it; `unhealthy-launches`: the watchdog did. */
export type SafeModeReason = 'requested' | 'unhealthy-launches';

/** The preload's troubleshooting calls; each is optional, and a missing one hides its button. */
export type DesktopTroubleshooting = Readonly<{
  showLogs?: () => Promise<void>;
  open?: () => Promise<void>;
  restartInSafeMode?: () => Promise<void>;
  restartNormally?: () => Promise<void>;
  copyDiagnostics?: () => Promise<void>;
}>;

type DesktopSafeModeShell = {
  tau?: { safeMode?: { reason?: unknown }; troubleshooting?: DesktopTroubleshooting };
};

/**
 * This desktop launch's safe mode, when it started in one.
 *
 * @returns Why it started in safe mode, or `undefined` for a normal launch and on the web.
 * @public
 */
export function desktopSafeMode(): { readonly reason: SafeModeReason } | undefined {
  const reason = (globalThis as DesktopSafeModeShell).tau?.safeMode?.reason;
  return reason === 'requested' || reason === 'unhealthy-launches' ? { reason } : undefined;
}

/**
 * The desktop shell's troubleshooting calls, when it has them.
 *
 * @returns The calls, or `undefined` on the web.
 * @public
 */
export function desktopTroubleshooting(): DesktopTroubleshooting | undefined {
  return (globalThis as DesktopSafeModeShell).tau?.troubleshooting;
}
