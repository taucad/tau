import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterAll, describe, expect, it } from 'vitest';
import { commitLease, commitTombstone } from '#api/git/store/commit.js';
import { RepositoryStoreError } from '#api/git/store/errors.js';
import { commitFence, isFenceManifest, migrationFenceCommitter } from '#api/git/store/fence.js';
import { hydrateLease } from '#api/git/store/lease.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { decodeManifest } from '#api/git/store/manifest.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import { createMemoryRepositoryStore, seedLease } from '#testing/publication-lease.fixture.js';

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
const isolatedGit = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: '/nonexistent',
  LANG: 'C',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  TAU_GIT_PUSH_ADMITTED: '1',
} as unknown as NodeJS.ProcessEnv;
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

const scratch: string[] = [];

afterAll(() => {
  for (const directory of scratch) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const git = (cwd: string, ...args: readonly string[]): string => {
  const result = spawnSync('git', ['-c', 'user.name=Tau', '-c', 'user.email=tau@test.invalid', ...args], {
    cwd,
    env: isolatedGit,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${String(result.stderr)}`);
  }
  return result.stdout.toString('utf8');
};

/** A working repository with one commit on `main`. */
const source = (): string => {
  const directory = mkdtempSync(path.join(tmpdir(), 'tau-fence-source-'));
  scratch.push(directory);
  git(directory, 'init', '--initial-branch=main', '.');
  writeFileSync(path.join(directory, 'part.ts'), 'export const part = 1;\n');
  git(directory, 'add', '-A');
  git(directory, 'commit', '-m', 'seed');
  return directory;
};

/** One more commit on `main`, pushed into a lease the way receive-pack would land it. */
const pushInto = (working: string, leaseDirectory: string): void => {
  writeFileSync(path.join(working, 'part.ts'), `export const part = ${String(Math.random())};\n`);
  git(working, 'commit', '-am', 'next');
  git(working, 'push', leaseDirectory, '+refs/heads/main:refs/heads/main');
};

const fresh = (): {
  store: RepositoryStore;
  ownerId: string;
  projectId: string;
} => ({
  store: createMemoryRepositoryStore(),
  ownerId: `user_dw1_${randomBytes(4).toString('hex')}`,
  projectId: `proj_dw1_${randomBytes(4).toString('hex')}`,
});

/**
 * W10 R3, north star risk row "a stale route cache forwards a push during a
 * freeze": the fence is a first-class manifest commit, so a lease hydrated
 * before the freeze holds a token the fence has already replaced, and its
 * conditional write loses whatever any API Machine's route cache said.
 */
describe('the migration fence (DW1, W10 R3)', () => {
  it('makes a lease taken before the freeze lose its compare-and-swap', async () => {
    const { store, ownerId, projectId } = fresh();
    const working = source();
    const seeded = await seedLease({
      store,
      ownerId,
      projectId,
      source: working,
    });
    await seeded.dispose();
    const locator = repositoryLocator({ ownerId, projectId });

    /* A push admitted before the freeze: hydrated, with its pack already received. */
    const straggler = await hydrateLease({ store, locator });
    try {
      pushInto(working, straggler.directory);

      const fenced = await commitFence({ store, locator });

      await expect(commitLease({ store, lease: straggler, committedBy: ownerId })).rejects.toMatchObject({
        code: 'lost',
      });
      const read = await store.readManifest(locator);
      const current = decodeManifest(read!.manifest);
      expect(current.generation).toBe(fenced.manifest.generation);
      expect(current.committedBy).toBe(migrationFenceCommitter);
      expect(current.refs).toStrictEqual(straggler.manifest?.refs);
      expect(current.packs).toStrictEqual(straggler.manifest?.packs);
      expect(current.generation).toBe((straggler.manifest?.generation ?? 0) + 1);
      expect(isFenceManifest(current)).toBe(true);
    } finally {
      await straggler.dispose();
    }
  }, 60_000);

  it('fences a repository that has no manifest yet, so a first push admitted before the freeze loses too', async () => {
    const { store, ownerId, projectId } = fresh();
    const locator = repositoryLocator({ ownerId, projectId });
    const straggler = await hydrateLease({ store, locator });
    try {
      pushInto(source(), straggler.directory);

      const fenced = await commitFence({ store, locator });

      expect(fenced.manifest).toMatchObject({
        generation: 1,
        refs: {},
        packs: [],
        committedBy: 'migration-fence',
      });
      await expect(commitLease({ store, lease: straggler, committedBy: ownerId })).rejects.toBeInstanceOf(
        RepositoryStoreError,
      );
    } finally {
      await straggler.dispose();
    }
  }, 60_000);

  it('lets a lease hydrated after the fence commit on top of it', async () => {
    const { store, ownerId, projectId } = fresh();
    const working = source();
    const seeded = await seedLease({
      store,
      ownerId,
      projectId,
      source: working,
    });
    await seeded.dispose();
    const locator = repositoryLocator({ ownerId, projectId });
    const fenced = await commitFence({ store, locator });

    const after = await hydrateLease({ store, locator });
    try {
      pushInto(working, after.directory);
      const outcome = await commitLease({
        store,
        lease: after,
        committedBy: ownerId,
      });
      expect(outcome).toMatchObject({
        committed: true,
        manifest: { generation: fenced.manifest.generation + 1 },
      });
    } finally {
      await after.dispose();
    }
  }, 60_000);

  it('refuses to fence a tombstoned repository rather than resurrect it', async () => {
    const { store, ownerId, projectId } = fresh();
    const seeded = await seedLease({
      store,
      ownerId,
      projectId,
      source: source(),
    });
    await seeded.dispose();
    const locator = repositoryLocator({ ownerId, projectId });
    await commitTombstone({ store, locator, committedBy: ownerId });

    await expect(commitFence({ store, locator })).rejects.toMatchObject({
      code: 'tombstoned',
    });
    const read = await store.readManifest(locator);
    expect(decodeManifest(read!.manifest).tombstone).not.toBeNull();
  }, 60_000);

  it('loses, rather than overwrites, when another writer commits between its read and its write', async () => {
    const { store: inner, ownerId, projectId } = fresh();
    const seeded = await seedLease({
      store: inner,
      ownerId,
      projectId,
      source: source(),
    });
    await seeded.dispose();
    const locator = repositoryLocator({ ownerId, projectId });
    /* Every conditional write answers `lost`: the race the fence must not paper over. */
    const racing: RepositoryStore = {
      ...inner,
      commitManifest: async () => 'lost',
    };

    await expect(commitFence({ store: racing, locator })).rejects.toMatchObject({ code: 'lost' });
  }, 60_000);
});
