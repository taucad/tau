import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { buildLockPollInterval, buildLockStaleAfter, withBuildLock } from '#cache/build-lock.js';

const roots: string[] = [];
const freshRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'geospec-lock-'));
  roots.push(root);
  return root;
};

afterAll(async () => {
  await Promise.all(
    roots.map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

describe('content-keyed build lock', () => {
  it('should expose the documented poll and staleness constants', () => {
    expect(buildLockPollInterval).toBe(250);
    expect(buildLockStaleAfter).toBe(60_000);
  });

  it('should skip the lock entirely when the artifact is already cached', async () => {
    const build = vi.fn(() => 'built');
    const value = await withBuildLock({ root: freshRoot(), key: 'k', peek: () => 'cached', build });
    expect(value).toBe('cached');
    expect(build).not.toHaveBeenCalled();
  });

  it('should build once under the lock and release it', async () => {
    const root = freshRoot();
    const value = await withBuildLock({ root, key: 'k', peek: () => undefined, build: () => 'built' });
    expect(value).toBe('built');
    // Released: a second call can acquire again.
    expect(await withBuildLock({ root, key: 'k', peek: () => undefined, build: () => 'again' })).toBe('again');
  });

  it('should never let a result cross the lock — the waiter re-peeks the cache', async () => {
    const root = freshRoot();
    let cached: string | undefined;
    const build = vi.fn(() => {
      cached = 'from-holder';
      return cached;
    });

    // Hold the lock, then release it while the waiter polls.
    mkdirSync(join(root, 'locks', 'k'), { recursive: true });
    const waiter = withBuildLock({
      root,
      key: 'k',
      peek: () => cached,
      build,
      pollInterval: 5,
    });
    setTimeout(() => {
      cached = 'from-holder';
      void rm(join(root, 'locks', 'k'), { recursive: true, force: true });
    }, 20);

    expect(await waiter).toBe('from-holder');
    // The waiter took the cached bytes, not the holder's in-memory value.
    expect(build).not.toHaveBeenCalled();
  });

  it('should re-peek under the lock and skip the build when the previous holder just finished', async () => {
    const build = vi.fn(() => 'built');
    let peeks = 0;
    const value = await withBuildLock({
      root: freshRoot(),
      key: 'k',
      peek: () => {
        peeks += 1;
        // Miss before the lock, hit once we hold it.
        return peeks === 1 ? undefined : 'landed-meanwhile';
      },
      build,
    });
    expect(value).toBe('landed-meanwhile');
    expect(build).not.toHaveBeenCalled();
  });

  it('should reclaim a lock abandoned by a crashed holder', async () => {
    const root = freshRoot();
    const lockPath = join(root, 'locks', 'stale');
    mkdirSync(lockPath, { recursive: true });
    const ancient = new Date(Date.now() - 10_000);
    await utimes(lockPath, ancient, ancient);

    const value = await withBuildLock({
      root,
      key: 'stale',
      peek: () => undefined,
      build: () => 'rebuilt',
      pollInterval: 5,
      staleAfter: 1,
    });
    expect(value).toBe('rebuilt');
  });

  it('should keep polling when the lock cannot even be inspected', async () => {
    // A root that is not a directory: both the mkdir and the staleness stat
    // fail, so the loop must fall through to another poll rather than throw.
    const file = join(freshRoot(), 'not-a-directory');
    writeFileSync(file, 'x');
    let peeks = 0;

    await expect(
      withBuildLock({
        root: join(file, 'nested'),
        key: 'racy',
        peek: () => {
          peeks += 1;
          return peeks === 1 ? undefined : 'landed';
        },
        build: () => 'built',
        pollInterval: 1,
      }),
    ).resolves.toBe('landed');
  });
});
