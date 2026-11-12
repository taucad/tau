/**
 * Update checks beyond the launch check and the four-hour interval: when the machine wakes, when the screen is
 * unlocked, and when the network returns. A laptop that slept through the interval, or was offline at launch,
 * otherwise waits for the next tick or runs out of retries.
 */
import type { DesktopUpdateSnapshot } from '@taucad/types/desktop-updates';

/** Milliseconds a wake or a returning network is given to settle; requests inside it become one check. */
export const updateTriggerSettleDelay = 10_000;
/** Milliseconds between two checks started here, so a flapping link or repeated unlocks cannot hammer the feed. */
export const updateTriggerMinimumGap = 5 * 60_000;
/** Milliseconds between reads of the connectivity state. Electron's main process has no `online` event. */
export const updateOnlinePollInterval = 30_000;

export type UpdateTriggerReason = 'resume' | 'unlock-screen' | 'online';

export type UpdateTriggerOptions = {
  /** Electron's `powerMonitor`. `unlock-screen` exists on macOS and Windows only; elsewhere it never fires. */
  readonly powerMonitor: { on(event: 'resume' | 'unlock-screen', listener: () => void): unknown };
  /** Electron's `net.isOnline()`: `false` is reliable, `true` only means some link is up. */
  readonly isOnline: () => boolean;
  /** Starts the updater's own serialized check; its failures use the updater's retry delays. */
  readonly check: () => void;
  readonly phase: () => DesktopUpdateSnapshot['phase'];
  readonly log: (level: 'info', event: string, detail?: unknown) => void;
  readonly now?: () => number;
  /** One-shot timer in milliseconds; defaults to an unreferenced `setTimeout`. */
  readonly scheduleOnce?: (callback: () => void, milliseconds: number) => unknown;
  /** Repeating timer in milliseconds; defaults to an unreferenced `setInterval`. */
  readonly poll?: (callback: () => void, milliseconds: number) => unknown;
};

/**
 * Ask the updater to check after a wake, an unlock or the network's return.
 *
 * Requests that arrive together (a wake is usually followed by an unlock and then by the network) become one
 * check, {@link updateTriggerSettleDelay} after the first, and no sooner than {@link updateTriggerMinimumGap}
 * after the previous one. A check due while offline is skipped, because the network's return asks again. Nothing
 * is asked while updates are disabled or while Tau saves or restarts into an update.
 *
 * @param options - The power and connectivity sources, the updater's check and its current phase.
 */
export const startUpdateTriggers = (options: UpdateTriggerOptions): void => {
  const now = options.now ?? Date.now;
  const scheduleOnce =
    options.scheduleOnce ??
    ((callback: () => void, milliseconds: number): void => {
      setTimeout(callback, milliseconds).unref();
    });
  const poll =
    options.poll ??
    ((callback: () => void, milliseconds: number): void => {
      setInterval(callback, milliseconds).unref();
    });
  let online = options.isOnline();
  let scheduled = false;
  let lastCheck = Number.NEGATIVE_INFINITY;
  const fire = (reason: UpdateTriggerReason): void => {
    scheduled = false;
    const phase = options.phase();
    if (phase === 'disabled' || phase === 'saving' || phase === 'restarting') {
      return;
    }
    if (!options.isOnline()) {
      /* The check would only fail. Remember the outage so the network's return asks again. */
      online = false;
      return;
    }
    lastCheck = now();
    options.log('info', 'updater.triggered', { reason });
    options.check();
  };
  const request = (reason: UpdateTriggerReason): void => {
    if (scheduled) {
      return;
    }
    scheduled = true;
    scheduleOnce(
      () => {
        fire(reason);
      },
      Math.max(updateTriggerSettleDelay, lastCheck + updateTriggerMinimumGap - now()),
    );
  };
  options.powerMonitor.on('resume', () => {
    request('resume');
  });
  options.powerMonitor.on('unlock-screen', () => {
    request('unlock-screen');
  });
  poll(() => {
    const next = options.isOnline();
    if (next && !online) {
      request('online');
    }
    online = next;
  }, updateOnlinePollInterval);
};
