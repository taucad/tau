import type { WorkerCodeLoadError } from '@taucad/ui-core/lib/module-worker';
import { setWorkerCodeLoadHandler } from '@taucad/ui-core/lib/module-worker';
import { readServerVerdict } from '#filesystem/build-skew.js';
import { recoverFromStaleBuild } from '#lib/stale-build-recovery.js';

/**
 * The page's answer to a module worker whose code failed to load (PL7 staging defects blueprint FP10): a new worker,
 * which is a new realm, within a bound and with a backoff; past the bound, or once the server runs another build, the
 * page's own recovery (FP9), which reloads an untouched page into the live build or leaves Reload offered.
 *
 * The factory (`createModuleWorker`) reports every failure here; a worker's owner asks {@link workerReplacement}
 * before it starts the next worker.
 */

/** Failures of one worker within {@link workerFailureWindow} after which it is not replaced again. */
export const workerReplacementBound = 3;

/** Milliseconds over which {@link workerReplacementBound} counts a worker's failures. */
export const workerFailureWindow = 10 * 60_000;

/** Milliseconds to wait before the replacement after each failure, in order (`replacementDelay`). */
export const workerReplacementBackoff = [0, 1000] as const;

/** Each worker's recent code load failures, by name. */
const failures = new Map<string, number[]>();

const recentFailures = (name: string, now: number): number[] => {
  const recent = (failures.get(name) ?? []).filter((at) => now - at < workerFailureWindow);
  failures.set(name, recent);
  return recent;
};

/** Whether the page has handed a worker's failures to its own recovery: it is not replaced again. */
const handedToPage = new Set<string>();

/**
 * Note one worker's code failing to load. Past the bound, or once a deploy replaced this build (a new worker would
 * meet the same missing files), the page's own recovery decides.
 *
 * @param failure - The worker's failure.
 * @param now - The clock, for tests.
 */
export const noteWorkerCodeLoadFailure = (failure: WorkerCodeLoadError, now = Date.now()): void => {
  const recent = recentFailures(failure.worker, now);
  recent.push(now);
  if (recent.length >= workerReplacementBound || readServerVerdict() === 'replaced') {
    handedToPage.add(failure.worker);
    // async-iife: bootstrap -- the recovery decides, and acts, on its own.
    void recoverFromStaleBuild(failure, 'loader');
  }
};

/** Whether, and after how long, the owner of a worker whose code failed to load may start the next one. */
export type WorkerReplacement = Readonly<{ replace: true; replacementDelay: number }> | Readonly<{ replace: false }>;

/**
 * Whether a worker whose code failed to load may be replaced, and after how long.
 *
 * @param name - The worker's name.
 * @param now - The clock, for tests.
 * @returns Replace after the backoff, or stop: the page's recovery has it.
 */
export const workerReplacement = (name: string, now = Date.now()): WorkerReplacement => {
  const count = recentFailures(name, now).length;
  if (handedToPage.has(name) || count >= workerReplacementBound) {
    return { replace: false };
  }
  return {
    replace: true,
    replacementDelay: workerReplacementBackoff[Math.max(0, count - 1)] ?? workerReplacementBackoff.at(-1) ?? 0,
  };
};

/** Forget every worker's failures; for tests. */
export const resetWorkerRealmRecovery = (): void => {
  failures.clear();
  handedToPage.clear();
};

/**
 * Install the page's handler for module workers whose code failed to load.
 *
 * @returns Removes it.
 */
export const installWorkerRealmRecovery = (): (() => void) =>
  setWorkerCodeLoadHandler((failure) => {
    noteWorkerCodeLoadFailure(failure);
  });
