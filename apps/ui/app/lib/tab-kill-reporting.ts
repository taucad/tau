/**
 * Report a detected tab kill to the error tracker (browser observability SB3, G3, A11).
 *
 * The page that died sent nothing, so the report is synthetic: a {@link TabKilledError} raised on
 * the next load, carrying what the marker kept (`#lib/memory-kill-signal`). It groups by
 * classification and route rather than by its stack, which is the same stack every time, and it
 * replays the dead page's activity trail as the event's breadcrumbs.
 *
 * Sentry does not wait for consent (D1), so a kill is reported for every user. The PostHog
 * `memory.suspected_kill` event this replaces is gone: a kill is an error signal, not a product one.
 */

import { reportUiError } from '#lib/error-reporting.js';
import type { DetectedMemoryKill, KillClassification } from '#lib/memory-kill-signal.js';
import type { SeverityLevel } from '@sentry/react';

/** How many kills in a row make a kill loop, where Safari starts telling the user (A11). */
export const killLoopThreshold = 2;

/** The synthetic error a detected kill is reported as. @public */
export class TabKilledError extends Error {
  public constructor(classification: KillClassification) {
    super(`The browser ended this tab (${classification})`);
    this.name = 'TabKilledError';
  }
}

/**
 * How loud a kill is: a background discard is housekeeping, one foreground kill is a warning, and a
 * second in a row is an error — the point at which the user is being shown "A problem repeatedly
 * occurred" (D5, A11).
 *
 * @param kill - The detected kill.
 * @returns The level its event carries.
 */
export const killLevel = (kill: DetectedMemoryKill): SeverityLevel => {
  if (kill.consecutiveKills >= killLoopThreshold) {
    return 'error';
  }
  return kill.classification === 'background' ? 'info' : 'warning';
};

/** Drop the `undefined` entries, so a figure this device could not read stays absent. */
const defined = <Value>(record: Readonly<Record<string, Value | undefined>>): Record<string, Value> =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as Record<string, Value>;

/**
 * Report one detected kill, and say whether it was handed over: only then may it leave the marker,
 * so a page that dies again while reporting still reports this kill on the load after that (G17).
 *
 * @param kill - The kill the marker carried into this load.
 * @returns Whether the report reached the error tracker.
 * @public
 */
export const reportDetectedKill = async (kill: DetectedMemoryKill): Promise<boolean> => {
  const error = new TabKilledError(kill.classification);
  /* eslint-disable @typescript-eslint/naming-convention -- Sentry tag and context names, filtered on by operators. */
  try {
    await reportUiError(error, {
      fingerprint: ['tab-killed', kill.classification, kill.route ?? 'unknown'],
      level: killLevel(kill),
      tags: defined({
        classification: kill.classification,
        route: kill.route,
        device_class: kill.deviceClass,
        last_activity: kill.lastActivity,
        consecutive_kills: String(kill.consecutiveKills),
      }),
      contexts: {
        'tau.kill': defined<unknown>({
          classification: kill.classification,
          path: kill.path,
          buildId: kill.buildId,
          uptimeSeconds: Math.round(kill.aliveForMilliseconds / 1000),
          hiddenForSeconds:
            kill.hiddenForMilliseconds === undefined ? undefined : Math.round(kill.hiddenForMilliseconds / 1000),
          consecutiveKills: kill.consecutiveKills,
          liveProjectCount: kill.liveProjectCount,
          chatCount: kill.chatCount,
          highWaterWasmBytes: kill.highWaterWasmBytes,
          ...(kill.sample === undefined ? {} : { memory: kill.sample }),
        }),
      },
      // The dead page's trail, with its own timestamps: Sentry reads `timestamp` in seconds.
      breadcrumbs: kill.trail.map((entry) => ({
        category: 'tau.activity',
        message: entry.name,
        level: 'info',
        timestamp: entry.at / 1000,
      })),
    });
  } catch {
    // `reportUiError` does not reject; a report that somehow fails stays pending for the next load.
    return false;
  }
  /* eslint-enable @typescript-eslint/naming-convention -- Sentry tag and context names, filtered on by operators. */
  return true;
};
