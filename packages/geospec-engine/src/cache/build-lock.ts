/**
 * Content-keyed build lock.
 *
 * Two processes asked for the same expensive artifact should not both build
 * it. The rendezvous is a directory whose name is the content key: `mkdir` is
 * atomic on every POSIX filesystem, so exactly one process creates it and the
 * others poll.
 *
 * **No result crosses the lock.** A waiter never receives the holder's
 * in-memory value; it re-peeks the content-addressed cache after acquiring.
 * That is why {@link withBuildLock} takes a `peek` as well as a `build` — the
 * shape makes the rule unforgettable. It also means a crashed holder costs one
 * stale-lock timeout, not a wrong answer.
 *
 * Lock waiting is deliberately excluded from load budgets: the work-unit
 * budget charges computation, and waiting is not computation (§16).
 *
 * @module
 */

import { mkdir, rmdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** Poll interval while another process holds the lock. Milliseconds. */
export const buildLockPollInterval = 250;

/** A lock directory older than this is assumed abandoned by a crashed holder. Milliseconds. */
export const buildLockStaleAfter = 60_000;

const sleep = async (duration: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, duration);
  });

/**
 * Options for {@link withBuildLock}.
 *
 * @public
 */
export type BuildLockOptions<Value> = {
  /** Cache root the lock directory lives under. */
  root: string;
  /** Content key identifying the artifact being built. */
  key: string;
  /** Re-read the content-addressed cache. Runs before and after acquiring. */
  peek: () => Value | undefined | Promise<Value | undefined>;
  /** Build the artifact. Runs only for the process holding the lock. */
  build: () => Value | Promise<Value>;
  /** Poll interval override, for tests. Milliseconds. */
  pollInterval?: number;
  /** Staleness threshold override, for tests. Milliseconds. */
  staleAfter?: number;
};

/**
 * Build an artifact at most once across concurrent processes.
 *
 * @param options - Root, content key, peek and build.
 * @returns The peeked or built value.
 * @public
 */
export const withBuildLock = async <Value>(options: BuildLockOptions<Value>): Promise<Value> => {
  const { root, key, peek, build } = options;
  const pollInterval = options.pollInterval ?? buildLockPollInterval;
  const staleAfter = options.staleAfter ?? buildLockStaleAfter;
  const lockPath = join(root, 'locks', key);

  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- A lock is a sequence of attempts by definition; there is nothing to parallelize.
    const existing = await peek();
    if (existing !== undefined) {
      return existing;
    }
    let acquired = false;
    try {
      // The parent is shared; only the leaf `mkdir` is the atomic rendezvous.
      // oxlint-disable-next-line no-await-in-loop -- Each attempt must observe the previous one's outcome.
      await mkdir(join(root, 'locks'), { recursive: true });
      // oxlint-disable-next-line no-await-in-loop -- Each attempt must observe the previous one's outcome.
      await mkdir(lockPath, { recursive: false });
      acquired = true;
    } catch {
      acquired = false;
    }
    if (acquired) {
      try {
        // Re-peek under the lock: the previous holder may have just finished.
        // oxlint-disable-next-line no-await-in-loop -- One acquisition per iteration; there is nothing to parallelize.
        const fresh = await peek();
        // oxlint-disable-next-line no-await-in-loop -- Building is the terminal step of this iteration.
        return fresh ?? (await build());
      } finally {
        // oxlint-disable-next-line no-await-in-loop -- The lock must be released before this call returns.
        await releaseLock(lockPath);
      }
    }
    // oxlint-disable-next-line no-await-in-loop -- Each attempt must observe the previous one's outcome.
    const age = await lockAge(lockPath);
    if (age !== undefined && age > staleAfter) {
      // The holder crashed: reclaim rather than poll forever.
      // oxlint-disable-next-line no-await-in-loop -- Reclaiming the stale lock has to finish before the retry.
      await releaseLock(lockPath);
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- Polling is the algorithm.
    await sleep(pollInterval);
  }
};

const releaseLock = async (lockPath: string): Promise<void> => {
  try {
    await rmdir(lockPath);
  } catch {
    // Someone else already reclaimed it; nothing to undo.
  }
};

const lockAge = async (lockPath: string): Promise<number | undefined> => {
  try {
    const stats = await stat(lockPath);
    return Date.now() - stats.mtimeMs;
  } catch {
    // Vanished between the failed mkdir and the stat: poll once more.
    return undefined;
  }
};
