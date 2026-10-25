import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commitLease } from '#api/git/store/commit.js';
import { hydrateLease } from '#api/git/store/lease.js';
import type { RepositoryLease } from '#api/git/store/lease.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { decodeManifest, encodeManifest, indexKeyFor } from '#api/git/store/manifest.js';
import { PackCache } from '#api/git/store/pack-cache.js';
import type { PackCacheEvents } from '#api/git/store/pack-cache.js';
import type { RepositoryLocator, RepositoryStore } from '#api/git/store/port.js';
import { createMemoryRepositoryStore, seedLease } from '#testing/publication-lease.fixture.js';

/**
 * DC2's pack cache, against real git: packs pushed by stock `receive-pack`,
 * committed by W2's `commitLease`, hydrated by `hydrateLease`, read by stock
 * git out of the lease. The store is in memory and counts its reads, so a hit
 * is a read that did not happen.
 */

const scratch = mkdtempSync(path.join(tmpdir(), 'tau-dc2-cache-'));

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
const gitEnvironment = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: scratch,
  LANG: 'C',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
  TAU_GIT_PUSH_ADMITTED: '1',
  /* Cast, not annotated: the repository augments `ProcessEnv` with every required
     environment key, which a git child's minimal environment does not carry. */
} as unknown as NodeJS.ProcessEnv;
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

const git = (cwd: string, ...args: readonly string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: gitEnvironment });

let sources = 0;

/** A working repository with one commit of `content` in `model.ts`. */
const source = (content: string): string => {
  sources += 1;
  const directory = path.join(scratch, `source-${String(sources)}`);
  mkdirSync(directory);
  git(directory, 'init', '--quiet', '--initial-branch=main');
  writeFileSync(path.join(directory, 'model.ts'), content);
  git(directory, 'add', '.');
  git(directory, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'one');
  return directory;
};

/** Adds one commit of `content` to a working repository. */
const commitTo = (directory: string, file: string, content: string): void => {
  writeFileSync(path.join(directory, file), content);
  git(directory, 'add', '.');
  git(directory, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', file);
};

/** A memory store that counts reads per key. */
const countingStore = (): { store: RepositoryStore; reads: Map<string, number>; total: () => number } => {
  const memory = createMemoryRepositoryStore();
  const reads = new Map<string, number>();
  return {
    reads,
    total: () => [...reads.values()].reduce((sum, count) => sum + count, 0),
    store: {
      ...memory,
      getObject: async (locator, key, range) => {
        reads.set(key, (reads.get(key) ?? 0) + 1);
        return memory.getObject(locator, key, range);
      },
    },
  };
};

/** Seeds a repository from `directory` and disposes the seeding lease. */
const seed = async (store: RepositoryStore, locator: RepositoryLocator, directory: string): Promise<void> => {
  const lease = await seedLease({ store, ownerId: locator.ownerId, projectId: locator.projectId, source: directory });
  await lease.dispose();
};

/** Pushes `directory`'s main into a fresh lease and commits it, with an optional pack bound. */
const push = async (args: {
  store: RepositoryStore;
  locator: RepositoryLocator;
  directory: string;
  cache?: PackCache;
  packBound?: number;
}): Promise<void> => {
  const lease = await hydrateLease({
    store: args.store,
    locator: args.locator,
    parentDirectory: scratch,
    ...(args.cache === undefined ? {} : { cache: args.cache }),
  });
  try {
    git(args.directory, 'push', '--quiet', lease.directory, '+refs/heads/main:refs/heads/main');
    await commitLease({
      store: args.store,
      lease,
      committedBy: args.locator.ownerId,
      ...(args.packBound === undefined ? {} : { packBound: args.packBound }),
    });
  } finally {
    await lease.dispose();
  }
};

const recordingEvents = (): PackCacheEvents & {
  readonly lookups: string[];
  readonly fallbacks: string[];
  evictedBytes: number;
} => {
  const recorded = {
    lookups: [] as string[],
    fallbacks: [] as string[],
    evictedBytes: 0,
    lookup: (result: string) => {
      recorded.lookups.push(result);
    },
    evicted: (bytes: number) => {
      recorded.evictedBytes += bytes;
    },
    fallback: (reason: string) => {
      recorded.fallbacks.push(reason);
    },
    occupancy: () => undefined,
  };
  return recorded;
};

let caches = 0;
const newCache = (budgetBytes = 1024 ** 3, events?: PackCacheEvents): PackCache => {
  caches += 1;
  return new PackCache({
    root: path.join(scratch, `cache-${String(caches)}`),
    budgetBytes: async () => budgetBytes,
    ...(events === undefined ? {} : { events }),
  });
};

/** Every regular file under the cache, by path. */
const cachedFiles = (cache: PackCache): string[] => {
  if (!existsSync(cache.root)) {
    return [];
  }
  return readdirSync(cache.root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !file.includes(`${path.sep}.incoming${path.sep}`));
};

const packsIn = (lease: RepositoryLease): string[] =>
  readdirSync(path.join(lease.directory, 'objects/pack'))
    .filter((name) => name.endsWith('.pack'))
    .toSorted();

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('PackCache (DC2)', () => {
  it('should hold the pack bytes once for two concurrent leases of one repository, read once', async () => {
    const { store, reads } = countingStore();
    const locator = repositoryLocator({ ownerId: 'user-dc2-a', projectId: 'proj-dc2-a' });
    await seed(store, locator, source('export const a = 1;\n'));
    reads.clear();
    const cache = newCache();

    const [first, second] = await Promise.all([
      hydrateLease({ store, locator, parentDirectory: scratch, cache }),
      hydrateLease({ store, locator, parentDirectory: scratch, cache }),
    ]);
    try {
      const [pack] = packsIn(first);
      const inode = (lease: RepositoryLease): number => statSync(path.join(lease.directory, 'objects/pack', pack!)).ino;
      expect(inode(first)).toBe(inode(second));
      expect(statSync(path.join(first.directory, 'objects/pack', pack!)).nlink).toBe(3);
      /* Single-flight: two concurrent misses, one store read per object. */
      expect([...reads.values()]).toEqual([1, 1]);
      expect(git(second.directory, 'rev-parse', 'refs/heads/main')).toBe(git(first.directory, 'rev-parse', 'main'));
    } finally {
      await first.dispose();
      await second.dispose();
    }

    const third = await hydrateLease({ store, locator, parentDirectory: scratch, cache });
    await third.dispose();
    expect([...reads.values()]).toEqual([1, 1]);
    expect(third.drawnBytes.objectStore).toBe(0);
    expect(third.drawnBytes.cache).toBeGreaterThan(0);
  });

  it('should never evict a file an open lease is using', async () => {
    const { store } = countingStore();
    const held = repositoryLocator({ ownerId: 'user-dc2-b', projectId: 'proj-dc2-held' });
    const other = repositoryLocator({ ownerId: 'user-dc2-b', projectId: 'proj-dc2-other' });
    await seed(store, held, source('export const held = 1;\n'));
    await seed(store, other, source('export const other = 2;\n'));
    /* Room for one repository's pack and index, not two: set once the first is cached. */
    let budget = 1024 ** 3;
    const events = recordingEvents();
    caches += 1;
    const cache = new PackCache({
      root: path.join(scratch, `cache-${String(caches)}`),
      budgetBytes: async () => budget,
      events,
    });

    const holding = await hydrateLease({ store, locator: held, parentDirectory: scratch, cache });
    const heldFiles = cachedFiles(cache);
    expect(heldFiles.length).toBe(2);
    budget = heldFiles.reduce((total, file) => total + statSync(file).size, 0);
    const passing = await hydrateLease({ store, locator: other, parentDirectory: scratch, cache });
    await passing.dispose();
    try {
      /* Over budget, but every file the open lease linked is still cached. */
      for (const file of heldFiles) {
        expect(existsSync(file)).toBe(true);
      }
      expect(git(holding.directory, 'cat-file', '-p', 'main:model.ts')).toBe('export const held = 1;\n');
    } finally {
      await holding.dispose();
    }

    /* Released, it is the least recently used, and the next fill evicts it. */
    const again = await hydrateLease({ store, locator: other, parentDirectory: scratch, cache });
    await again.dispose();
    const third = repositoryLocator({ ownerId: 'user-dc2-b', projectId: 'proj-dc2-third' });
    await seed(store, third, source('export const third = 3;\n'));
    const filling = await hydrateLease({ store, locator: third, parentDirectory: scratch, cache });
    await filling.dispose();
    expect(heldFiles.some((file) => existsSync(file))).toBe(false);
    expect(events.evictedBytes).toBeGreaterThan(0);
  });

  it('should never link a cached pack the manifest no longer lists', async () => {
    const { store } = countingStore();
    const locator = repositoryLocator({ ownerId: 'user-dc2-c', projectId: 'proj-dc2-c' });
    const working = source('export const c = 1;\n');
    await seed(store, locator, working);
    const cache = newCache();
    const first = await hydrateLease({ store, locator, parentDirectory: scratch, cache });
    const [retiring] = packsIn(first);
    await first.dispose();

    /* A larger second pack, then a third push compacting to two: the
       committer keeps the largest pack and rolls the first one away. */
    commitTo(working, 'large.bin', createHash('sha512').update('x').digest('hex').repeat(4096));
    await push({ store, locator, directory: working, cache });
    commitTo(working, 'next.ts', 'export const next = 2;\n');
    await push({ store, locator, directory: working, cache, packBound: 2 });

    const manifest = decodeManifest((await store.readManifest(locator))!.manifest);
    const listed = manifest.packs.map((pack) => path.posix.basename(pack.key)).toSorted();
    expect(listed).not.toContain(retiring);
    expect(cachedFiles(cache).some((file) => path.basename(file) === retiring)).toBe(true);

    const lease = await hydrateLease({ store, locator, parentDirectory: scratch, cache });
    try {
      expect(packsIn(lease)).toEqual(listed);
      expect(git(lease.directory, 'cat-file', '-p', 'main:next.ts')).toBe('export const next = 2;\n');
    } finally {
      await lease.dispose();
    }
  });

  it('should keep two tenants apart when their packs share one basename', async () => {
    const { store } = countingStore();
    const mine = repositoryLocator({ ownerId: 'user-dc2-d1', projectId: 'proj-dc2-d' });
    const theirs = repositoryLocator({ ownerId: 'user-dc2-d2', projectId: 'proj-dc2-d' });
    await seed(store, mine, source('export const mine = 1;\n'));
    await seed(store, theirs, source('export const theirs = 2;\n'));
    /* Rename their pack to my pack's key: same basename, other bytes. */
    const mineManifest = decodeManifest((await store.readManifest(mine))!.manifest);
    const theirRead = (await store.readManifest(theirs))!;
    const theirManifest = decodeManifest(theirRead.manifest);
    const sharedKey = mineManifest.packs[0]!.key;
    const theirKey = theirManifest.packs[0]!.key;
    await Promise.all(
      [
        [theirKey, sharedKey],
        [indexKeyFor(theirKey), indexKeyFor(sharedKey)],
      ].map(async ([from, to]) => {
        const bytes = new Uint8Array(await buffer(await store.getObject(theirs, from!)));
        await store.putObject(theirs, to!, bytes, {
          contentLength: bytes.byteLength,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
      }),
    );
    const renamed = { ...theirManifest, packs: [{ ...theirManifest.packs[0]!, key: sharedKey }] };
    expect(await store.commitManifest(theirs, encodeManifest(renamed), theirRead.token)).not.toBe('lost');

    const cache = newCache();
    const mineLease = await hydrateLease({ store, locator: mine, parentDirectory: scratch, cache });
    const theirLease = await hydrateLease({ store, locator: theirs, parentDirectory: scratch, cache });
    try {
      expect(git(mineLease.directory, 'cat-file', '-p', 'main:model.ts')).toBe('export const mine = 1;\n');
      expect(git(theirLease.directory, 'cat-file', '-p', 'main:model.ts')).toBe('export const theirs = 2;\n');
    } finally {
      await mineLease.dispose();
      await theirLease.dispose();
    }
    /* Both now cached: each tenant's next lease is linked from its own entry. */
    for (const [locator, expected] of [
      [mine, 'export const mine = 1;\n'],
      [theirs, 'export const theirs = 2;\n'],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one tenant after the other, both from the cache
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch, cache });
      try {
        expect(lease.drawnBytes.objectStore).toBe(0);
        expect(git(lease.directory, 'cat-file', '-p', 'main:model.ts')).toBe(expected);
      } finally {
        // oxlint-disable-next-line no-await-in-loop -- as above
        await lease.dispose();
      }
    }
  });

  it('should serve every round of a storm while the cache is wiped mid-storm', async () => {
    const { store } = countingStore();
    const locator = repositoryLocator({ ownerId: 'user-dc2-e', projectId: 'proj-dc2-e' });
    await seed(store, locator, source('export const e = 1;\n'));
    const events = recordingEvents();
    const cache = newCache(1024 ** 3, events);
    const expected = git(source('export const e = 1;\n'), 'rev-parse', 'HEAD:model.ts');

    for (let round = 0; round < 6; round += 1) {
      // oxlint-disable-next-line no-await-in-loop -- rounds are sequential; each round is concurrent
      const answers = await Promise.all(
        Array.from({ length: 4 }, async (_, index) => {
          if (index === 1 && round % 2 === 1) {
            rmSync(cache.root, { recursive: true, force: true });
          }
          const lease = await hydrateLease({ store, locator, parentDirectory: scratch, cache });
          try {
            return git(lease.directory, 'rev-parse', 'main:model.ts');
          } finally {
            await lease.dispose();
          }
        }),
      );
      expect(answers).toEqual(Array.from({ length: 4 }, () => expected));
    }
    /* Each wipe shows as misses, and the round after it, which no wipe precedes, hits again. */
    expect(events.lookups).toContain('miss');
    expect(events.lookups).toContain('hit');
  });

  it('should hydrate a repository larger than the budget straight from the store and cache none of it', async () => {
    const { store, total } = countingStore();
    const locator = repositoryLocator({ ownerId: 'user-dc2-f', projectId: 'proj-dc2-f' });
    await seed(store, locator, source('export const f = 1;\n'));
    const events = recordingEvents();
    const cache = newCache(1, events);
    const before = total();
    const lease = await hydrateLease({ store, locator, parentDirectory: scratch, cache });
    try {
      expect(git(lease.directory, 'cat-file', '-p', 'main:model.ts')).toBe('export const f = 1;\n');
    } finally {
      await lease.dispose();
    }
    expect(total() - before).toBe(2);
    expect(cachedFiles(cache)).toEqual([]);
    expect(events.fallbacks).toEqual(['over_budget']);
    expect(lease.drawnBytes.cache).toBe(0);
  });

  describe('cached inodes are read-only (FR18)', () => {
    const locator = repositoryLocator({ ownerId: 'user-dc2-g', projectId: 'proj-dc2-g' });
    let store: RepositoryStore;
    let working: string;
    let cache: PackCache;

    beforeAll(async () => {
      ({ store } = countingStore());
      working = source('export const g = 0;\n');
      await seed(store, locator, working);
      cache = newCache();
    });

    /** Every cached file's bytes and mtime, by path. */
    const fingerprint = (): Map<string, { sha: string; mtime: number; mode: number }> =>
      new Map(
        cachedFiles(cache).map((file) => {
          const stats = statSync(file);
          return [
            file,
            {
              sha: createHash('sha256').update(readFileSync(file)).digest('hex'),
              mtime: stats.mtimeMs,
              /* The permission bits: the mode's low nine bits. */
              mode: stats.mode % 0o1000,
            },
          ];
        }),
      );

    /** Three concurrent clones out of cache-hydrated leases, each reading what round `round` pushed. */
    const fetchStorm = async (round: number): Promise<void> => {
      await Promise.all(
        Array.from({ length: 3 }, async (_, index) => {
          const lease = await hydrateLease({ store, locator, parentDirectory: scratch, cache });
          try {
            const clone = path.join(scratch, `clone-${String(round)}-${String(index)}`);
            git(scratch, 'clone', '--quiet', '--bare', lease.directory, clone);
            expect(git(clone, 'cat-file', '-p', 'main:model.ts')).toBe(`export const g = ${String(round)};\n`);
            rmSync(clone, { recursive: true, force: true });
          } finally {
            await lease.dispose();
          }
        }),
      );
    };

    it('should store mode 0444 files, and leave every cached inode unchanged through a push-then-fetch storm', async () => {
      const warm = await hydrateLease({ store, locator, parentDirectory: scratch, cache });
      await warm.dispose();
      const before = fingerprint();
      expect(before.size).toBeGreaterThan(0);
      for (const { mode } of before.values()) {
        expect(mode).toBe(0o444);
      }

      for (let round = 1; round <= 5; round += 1) {
        commitTo(working, 'model.ts', `export const g = ${String(round)};\n`);
        /* Every push hydrates through the cache, receives into the linked
           packs' repository, and compacts on the last round. */
        // oxlint-disable-next-line no-await-in-loop -- one push per round, then the fetches against it
        await push({ store, locator, directory: working, cache, ...(round === 5 ? { packBound: 2 } : {}) });
        // oxlint-disable-next-line no-await-in-loop -- as above
        await fetchStorm(round);
      }

      const after = fingerprint();
      for (const [file, print] of before) {
        expect(after.get(file)).toEqual(print);
      }
      for (const { mode } of after.values()) {
        expect(mode).toBe(0o444);
      }
    });
  });
});

describe('PackCache failure paths (DC2 review)', () => {
  /** A seeded repository and its manifest's pack key. */
  const seeded = async (
    ownerId: string,
    content: string,
  ): Promise<{ store: RepositoryStore; locator: RepositoryLocator; packKey: string }> => {
    const store = createMemoryRepositoryStore();
    const locator = repositoryLocator({ ownerId, projectId: 'proj-dc2-review' });
    await seed(store, locator, source(content));
    const manifest = decodeManifest((await store.readManifest(locator))!.manifest);
    return { store, locator, packKey: manifest.packs[0]!.key };
  };

  const isPack = (file: string): boolean => file.endsWith('.pack');

  it('should not cache a pack whose read came back shorter than the manifest says', async () => {
    const { store, locator, packKey } = await seeded('user-dc2-short', 'export const short = 1;\n');
    const truncating: RepositoryStore = {
      ...store,
      getObject: async (at, key, range) => {
        const whole = await buffer(await store.getObject(at, key, range));
        return Readable.from([key === packKey ? whole.subarray(0, whole.byteLength - 7) : whole]);
      },
    };
    const cache = newCache();
    const lease = await hydrateLease({ store: truncating, locator, parentDirectory: scratch, cache }).catch(
      (error: unknown) => error,
    );
    if (!(lease instanceof Error)) {
      await (lease as RepositoryLease).dispose();
    }
    expect(cachedFiles(cache).filter((file) => isPack(file))).toEqual([]);
  });

  it('should drop a cached pack a failed hydrate used, so the next lease reads it again', async () => {
    const { store, locator, packKey } = await seeded('user-dc2-corrupt', 'export const corrupt = 1;\n');
    /* Same size, wrong bytes, and no stored index: `index-pack` in the lease is what fails. */
    const read = (await store.readManifest(locator))!;
    const manifest = decodeManifest(read.manifest);
    const garbage = new Uint8Array(manifest.packs[0]!.bytes).fill(7);
    await store.putObject(locator, packKey, garbage, {
      contentLength: garbage.byteLength,
      sha256: createHash('sha256').update(garbage).digest('hex'),
    });
    const unindexed = { ...manifest, packs: [{ ...manifest.packs[0]!, indexStored: false }] };
    expect(await store.commitManifest(locator, encodeManifest(unindexed), read.token)).not.toBe('lost');

    const cache = newCache();
    await expect(hydrateLease({ store, locator, parentDirectory: scratch, cache })).rejects.toThrow();
    expect(cachedFiles(cache).filter((file) => isPack(file))).toEqual([]);
    expect(cache.bytes).toBe(0);
  });

  it('should give back the hold when the eviction after a fill fails', async () => {
    const first = await seeded('user-dc2-evict-a', 'export const a = 1;\n');
    const second = await seeded('user-dc2-evict-b', 'export const b = 2;\n');
    let budget = 1024 ** 3;
    caches += 1;
    const cache = new PackCache({
      root: path.join(scratch, `cache-${String(caches)}`),
      budgetBytes: async () => budget,
      events: {
        ...recordingEvents(),
        evicted: () => {
          throw new Error('the eviction failed');
        },
      },
    });
    const warm = await hydrateLease({ store: first.store, locator: first.locator, parentDirectory: scratch, cache });
    await warm.dispose();
    /* Room for the next pack's bytes, not for the idle entries as well: the fill evicts, and that fails. */
    budget = decodeManifest((await second.store.readManifest(second.locator))!.manifest).packs[0]!.bytes;
    const lease = await hydrateLease({ store: second.store, locator: second.locator, parentDirectory: scratch, cache });
    await lease.dispose();
    expect(cache.evictableBytes).toBe(cache.bytes);
  });
});
