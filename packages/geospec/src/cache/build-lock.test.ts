import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { withGeoSpecBuildLock } from '#cache/build-lock.js';
import { resolveGeoSpecCacheRoot } from '#cache/cache-root.js';

const temporaryDirectories: string[] = [];

const createCacheDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'geospec-lock-'));
  temporaryDirectories.push(directory);
  process.env['GEOSPEC_CACHE_DIR'] = directory;
  return directory;
};

afterEach(async () => {
  delete process.env['GEOSPEC_CACHE_DIR'];
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('build coordination lock (R14)', () => {
  it('serializes same-key builds: the waiter starts only after the winner releases', async () => {
    await createCacheDirectory();
    const order: string[] = [];
    let releaseWinner: () => void = () => undefined;
    const winnerGate = new Promise<void>((resolve) => {
      releaseWinner = resolve;
    });

    const winner = withGeoSpecBuildLock({
      projectPath: '/project',
      key: 'assembly',
      run: async () => {
        order.push('winner-start');
        await winnerGate;
        order.push('winner-end');
      },
    });
    // Give the winner time to acquire before the waiter races it.
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    const waiter = withGeoSpecBuildLock({
      projectPath: '/project',
      key: 'assembly',
      run: async () => {
        order.push('waiter-start');
      },
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(order).toEqual(['winner-start']); // Waiter is blocked, not started.
    releaseWinner();
    await Promise.all([winner, waiter]);
    expect(order).toEqual(['winner-start', 'winner-end', 'waiter-start']);
  });

  it('runs different keys concurrently', async () => {
    await createCacheDirectory();
    const running = new Set<string>();
    let observedConcurrency = 0;
    const build = async (key: string): Promise<void> =>
      withGeoSpecBuildLock({
        projectPath: '/project',
        key,
        run: async () => {
          running.add(key);
          observedConcurrency = Math.max(observedConcurrency, running.size);
          await new Promise((resolve) => {
            setTimeout(resolve, 30);
          });
          running.delete(key);
        },
      });
    await Promise.all([build('assembly'), build('bracket')]);
    expect(observedConcurrency).toBe(2);
  });

  it('steals a stale lock from a dead owner and recovers', async () => {
    await createCacheDirectory();
    // Plant the lock directory a crashed owner would leave behind, aged past
    // the stale threshold.
    const digest = createHash('sha256').update('assembly').digest('hex').slice(0, 24);
    const planted = join(resolveGeoSpecCacheRoot('/project'), 'build-locks', `${digest}.lock`);
    await mkdir(planted, { recursive: true });
    const past = new Date(Date.now() - 60_000);
    await utimes(planted, past, past);

    const executed: string[] = [];
    await withGeoSpecBuildLock({
      projectPath: '/project',
      key: 'assembly',
      staleness: 100,
      run: async () => {
        executed.push('stolen-and-ran');
      },
    });
    expect(executed).toEqual(['stolen-and-ran']);
  });

  it('releases the lock when the build throws', async () => {
    await createCacheDirectory();
    await expect(
      withGeoSpecBuildLock({
        projectPath: '/project',
        key: 'assembly',
        run: async () => {
          throw new Error('build failed');
        },
      }),
    ).rejects.toThrow('build failed');
    // A second acquisition proceeds immediately (no stale wait needed).
    const startedAt = performance.now();
    await withGeoSpecBuildLock({
      projectPath: '/project',
      key: 'assembly',
      run: async () => undefined,
    });
    expect(performance.now() - startedAt).toBeLessThan(200);
  });
});
