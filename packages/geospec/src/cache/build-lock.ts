/**
 * Content-keyed cross-process build lock (R14).
 *
 * Eight of nine v8 files load the same assembly: a cold pool would have every
 * worker miss the geometry cache simultaneously and each pay the ~97 s cold
 * kernel build (N × 97 s of wasted CPU at N × peak build memory). The lock
 * serializes same-key builds — the winner populates the content-addressed
 * geometry cache, and each waiter's own build then completes as a warm cache
 * hit. No result crosses the lock; the shared filesystem cache is the
 * rendezvous.
 *
 * Node primitive: an atomic `mkdir` lock directory in the out-of-tree cache
 * root, with mtime-based staleness recovery if the winner dies (the model
 * build budget kills healthy builds long before the stale threshold, so a
 * stale lock is always a dead owner). The browser counterpart is the Web
 * Locks API on the same key — same contract, different primitive
 * (cross-platform matrix); browser hosts own their model loaders, so the
 * geospec package ships only the Node side.
 *
 * Lock-WAIT time is excluded from the model-load budget by construction: the
 * caller acquires before starting the budgeted load, so a waiting worker can
 * never trip a spurious `MODEL_LOAD_TIMEOUT` while the winner builds.
 */

import { createHash } from 'node:crypto';
import { mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolveGeoSpecCacheRoot } from '#cache/cache-root.js';

/** Poll interval while waiting for the winner, milliseconds. */
const lockPollInterval = 250;

/**
 * A lock older than this is a dead owner (the 300 s model-load budget kills
 * healthy builds first) and is stolen. Override for tests.
 */
const defaultStaleness = 600_000;

const lockPath = (projectPath: string, key: string): string => {
  const digest = createHash('sha256').update(key).digest('hex').slice(0, 24);
  return join(resolveGeoSpecCacheRoot(projectPath), 'build-locks', `${digest}.lock`);
};

const tryAcquire = async (path: string): Promise<boolean> => {
  try {
    await mkdir(path, { recursive: false });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return false;
    }
    // Parent missing: create it and retry once.
    await mkdir(join(path, '..'), { recursive: true });
    try {
      await mkdir(path, { recursive: false });
      return true;
    } catch {
      return false;
    }
  }
};

const stealIfStale = async (path: string, staleness: number): Promise<void> => {
  try {
    const info = await stat(path);
    if (Date.now() - info.mtimeMs > staleness) {
      await rm(path, { recursive: true, force: true });
    }
  } catch {
    // Already released between the poll and the stat.
  }
};

/**
 * Run `run` while holding the cross-process build lock for `key`. Waiters
 * poll until the winner releases (or the lock goes stale), then acquire and
 * run their own build — which the winner's cache entry makes warm.
 *
 * @internal
 */
export const withGeoSpecBuildLock = async <T>(options: {
  projectPath: string;
  key: string;
  run: () => Promise<T>;
  /** Staleness override for tests. */
  staleness?: number;
}): Promise<T> => {
  const path = lockPath(options.projectPath, options.key);
  const staleness = options.staleness ?? defaultStaleness;
  // Acquire (with staleness recovery). Waiting happens HERE, before the
  // caller starts its budgeted load.
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- lock acquisition is inherently sequential polling.
    if (await tryAcquire(path)) {
      break;
    }
    // oxlint-disable-next-line no-await-in-loop -- see above.
    await stealIfStale(path, staleness);
    // oxlint-disable-next-line no-await-in-loop -- see above.
    await sleep(lockPollInterval);
  }
  try {
    return await options.run();
  } finally {
    await rm(path, { recursive: true, force: true });
  }
};
