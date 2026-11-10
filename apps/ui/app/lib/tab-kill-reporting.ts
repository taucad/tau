/**
 * Report a detected tab kill to the error tracker (browser observability SB3, G3, A11).
 *
 * The page that died sent nothing, so the report is synthetic: a {@link TabKilledError} raised on
 * the next load, carrying what the marker kept (`#lib/memory-kill-signal`). It groups by
 * classification and route rather than by its stack, which is the same stack every time, and it
 * replays the dead page's activity trail as the event's breadcrumbs.
 *
 * A kill report is usage and diagnostics data (crash capture blueprint, overturning D1 for this one
 * event): the reporter sends it only when "Share usage and diagnostics" resolves to `granted`
 * (`#components/memory-kill-reporter`), and the event carries no `user`, because the switch promises
 * that such data is not stored against an account. Nothing about reporting is ever shown.
 */

import { reportUiError } from '#lib/error-reporting.js';
import { killLoopThreshold } from '#lib/memory-kill-signal.js';
import type { DetectedMemoryKill, KillClassification } from '#lib/memory-kill-signal.js';
import type { SeverityLevel } from '@sentry/react';

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

const mebibyte = 1024 * 1024;

/** Bytes as MiB, rounded: the report never needs the exact size. */
const toMebibytes = (bytes: number | undefined): number | undefined =>
  bytes === undefined ? undefined : Math.round(bytes / mebibyte);

/** Milliseconds as seconds to one decimal (100 ms). */
const toTenths = (milliseconds: number | undefined): number | undefined =>
  milliseconds === undefined ? undefined : Math.round(milliseconds / 100) / 10;

/**
 * The `tau.work` context: what the page was working on when it died, from the marker's v3 `work` block (crash
 * capture blueprint). Bytes are rounded to MiB and durations to 100 ms.
 *
 * @param kill - The detected kill.
 * @param diedAt - Epoch milliseconds of the marker's last write, the latest the page is known alive.
 * @returns The context's fields; absent ones were never known.
 */
export const killWorkContext = (kill: DetectedMemoryKill, diedAt: number): Readonly<Record<string, unknown>> => {
  const { work } = kill;
  return defined<unknown>({
    kernel: work.kernel,
    builtin: work.builtin,
    shareProvider: work.shareProvider,
    phase: work.phase,
    phaseSeconds: work.phaseStartedAt === undefined ? undefined : toTenths(Math.max(0, diedAt - work.phaseStartedAt)),
    renderCount: work.renderCount,
    lastEvaluateSeconds: toTenths(work.lastEvaluate),
    lastRenderSeconds: toTenths(work.lastRender),
    triangles: work.triangles,
    geometryMiB: toMebibytes(work.geometryBytes),
    gpuGeometries: work.gpuGeometries,
    textures: work.textures,
    peakWasmMiB: toMebibytes(work.peakWasmBytes ?? kill.highWaterWasmBytes),
    backend: work.backend,
    contextLost: work.contextLost,
    lastInteraction: work.lastInteraction,
    interactionSeconds:
      work.interactionAt === undefined ? undefined : Math.round(Math.max(0, diedAt - work.interactionAt) / 1000),
    parameterChanges: work.parameterChanges,
  });
};

/**
 * Report one detected kill, and say whether it was handed over: only then may it leave the marker,
 * so a page that dies again while reporting still reports this kill on the load after that (G17).
 * The caller has already checked consent.
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
      anonymous: true,
      // One issue is one kernel dying at one step (crash capture blueprint).
      fingerprint: [
        'tab-killed',
        kill.classification,
        kill.route ?? 'unknown',
        kill.work.kernel ?? 'unknown',
        kill.work.phase ?? 'unknown',
      ],
      level: killLevel(kill),
      tags: defined({
        classification: kill.classification,
        route: kill.route,
        device_class: kill.deviceClass,
        last_activity: kill.lastActivity,
        consecutive_kills: String(kill.consecutiveKills),
        kernel: kill.work.kernel,
        kill_phase: kill.work.phase,
        builtin: kill.work.builtin,
        ...(kill.work.lastInteraction === undefined ? {} : { last_interaction: kill.work.lastInteraction }),
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
        'tau.work': killWorkContext(kill, kill.diedAt),
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
