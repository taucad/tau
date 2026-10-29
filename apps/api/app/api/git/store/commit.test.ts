import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { buffer } from 'node:stream/consumers';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { commitLease } from '#api/git/store/commit.js';
import type { CommitPhase, CommitResult } from '#api/git/store/commit.js';
import { RepositoryStoreError } from '#api/git/store/errors.js';
import { hydrateLease } from '#api/git/store/lease.js';
import type { RepositoryLease } from '#api/git/store/lease.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import {
  compactionCommitter,
  decodeManifest,
  encodeManifest,
  indexKeyFor,
  succeedManifest,
} from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';
import type { ObjectBody, RepositoryLocator, RepositoryStore } from '#api/git/store/port.js';
import { createMemoryRepositoryStore } from '#testing/publication-lease.fixture.js';

/**
 * The commit's object uploads and its phase timings, against the in-memory
 * store: the order and overlap of port calls is the behaviour under test, and
 * what the port does with bytes is proved against MinIO by the commit suite.
 *
 * The invariant every test here keeps explicit: the conditional manifest write
 * is the commit point, so it starts only after every object it names is
 * durable, and a commit that fails before it leaves garbage and never a
 * manifest naming a missing key.
 */

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
const admittedGit = {
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

const temporary = (label: string): string => {
  const directory = mkdtempSync(path.join(tmpdir(), `tau-commit-${label}-`));
  scratch.push(directory);
  return directory;
};

const git = (cwd: string, ...args: readonly string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: admittedGit, stdio: ['ignore', 'pipe', 'pipe'] });

/** A client repository; `revise` adds one commit. */
const newClient = (): { directory: string; revise: (n: number) => void } => {
  const directory = temporary('client');
  git(directory, 'init', '--quiet', '--initial-branch=main', '.');
  git(directory, 'config', 'user.name', 'Commit');
  git(directory, 'config', 'user.email', 'commit@tau.test');
  const revise = (n: number): void => {
    writeFileSync(path.join(directory, 'main.scad'), `cube(${String(n)});\n`);
    git(directory, 'add', '.');
    git(directory, 'commit', '--quiet', '-m', `rev ${String(n)}`);
  };
  revise(1);
  return { directory, revise };
};

/** Commits `mebibytes` of incompressible bytes as `name`, so the next pack is at least that large. */
const writeLarge = (directory: string, name: string, mebibytes: number): void => {
  writeFileSync(path.join(directory, name), randomBytes(mebibytes * 1024 * 1024));
  git(directory, 'add', name);
  git(directory, 'commit', '--quiet', '-m', `add ${name}`);
};

/**
 * Deletes the index of the lease's newest pack, standing in for a lease file
 * that vanished between compaction and hashing. The lease is found from the
 * pack directory git just wrote; `events` must hold no put yet.
 */
const removeNewestIndex = (events: readonly PortEvent[]): string => {
  expect(events.filter((event) => event.kind === 'put-start')).toStrictEqual([]);
  const leases = scratch.filter((directory) => path.basename(directory).startsWith('tau-commit-lease-'));
  const newest = leases.at(-1);
  if (newest === undefined) {
    return '';
  }
  for (const entry of readdirSync(newest)) {
    const packs = path.join(newest, entry, 'objects/pack');
    if (!existsSync(packs)) {
      continue;
    }
    const indexes = readdirSync(packs)
      .filter((name) => name.endsWith('.idx'))
      .map((name) => path.join(packs, name))
      .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
    const victim = indexes[0];
    if (victim !== undefined) {
      rmSync(victim);
      return victim;
    }
  }
  return '';
};

type PortEvent =
  | { readonly kind: 'put-start' | 'put-end'; readonly key: string; readonly body: ObjectBody; readonly sha256: string }
  | { readonly kind: 'put-failed' | 'put-aborted'; readonly key: string }
  | { readonly kind: 'manifest' };

/**
 * The memory store, journaled: each object put takes `putMilliseconds` as a
 * remote PUT would, so puts made one after another never overlap, and
 * `failPut` turns a key's put into a rejection after the same delay. With
 * `honourSignal`, a put whose signal aborts mid-flight rejects at once with
 * the signal's reason, as the S3 adapter's request does.
 */
const journaledStore = (
  options: {
    putMilliseconds?: number | ((key: string) => number);
    failPut?: (key: string) => Error | undefined;
    honourSignal?: boolean;
  } = {},
): {
  store: RepositoryStore;
  events: PortEvent[];
  tally: { inFlight: number; mostInFlight: number; manifestWrites: number };
} => {
  const inner = createMemoryRepositoryStore();
  const events: PortEvent[] = [];
  const tally = { inFlight: 0, mostInFlight: 0, manifestWrites: 0 };
  const store: RepositoryStore = {
    capabilities: inner.capabilities,
    readManifest: async (locator) => inner.readManifest(locator),
    commitManifest: async (locator, next, expected) => {
      tally.manifestWrites += 1;
      events.push({ kind: 'manifest' });
      return inner.commitManifest(locator, next, expected);
    },
    // oxlint-disable-next-line max-params -- the port's own signature
    putObject: async (locator, key, body, putOptions, signal) => {
      events.push({ kind: 'put-start', key, body, sha256: putOptions.sha256 });
      tally.inFlight += 1;
      tally.mostInFlight = Math.max(tally.mostInFlight, tally.inFlight);
      try {
        const milliseconds =
          typeof options.putMilliseconds === 'function'
            ? options.putMilliseconds(key)
            : (options.putMilliseconds ?? 25);
        try {
          await delay(milliseconds, undefined, options.honourSignal === true && signal !== undefined ? { signal } : {});
        } catch (error) {
          events.push({ kind: 'put-aborted', key });
          throw error;
        }
        const failure = options.failPut?.(key);
        if (failure !== undefined) {
          events.push({ kind: 'put-failed', key });
          throw failure;
        }
        await inner.putObject(locator, key, body, putOptions);
        events.push({ kind: 'put-end', key, body, sha256: putOptions.sha256 });
      } finally {
        tally.inFlight -= 1;
      }
    },
    getObject: async (locator, key, range) => inner.getObject(locator, key, range),
    listObjects: (locator, prefix) => inner.listObjects(locator, prefix),
    deleteObjects: async (locator, keys) => inner.deleteObjects(locator, keys),
  };
  return { store, events, tally };
};

const newLocator = (): RepositoryLocator =>
  repositoryLocator({
    ownerId: `owner-${randomBytes(4).toString('hex')}`,
    projectId: `proj-${randomBytes(4).toString('hex')}`,
  });

const readBack = async (store: RepositoryStore, locator: RepositoryLocator): Promise<Manifest | undefined> => {
  const read = await store.readManifest(locator);
  return read === undefined ? undefined : decodeManifest(read.manifest);
};

/** Hydrates, pushes `main` and commits, the way the write path does. */
const pushAndCommit = async (args: {
  store: RepositoryStore;
  locator: RepositoryLocator;
  client: string;
  overrides?: Partial<Parameters<typeof commitLease>[0]>;
}): ReturnType<typeof commitLease> => {
  const lease = await hydrateLease({ store: args.store, locator: args.locator, parentDirectory: temporary('lease') });
  try {
    git(args.client, 'push', '--quiet', lease.directory, 'main');
    return await commitLease({ store: args.store, lease, committedBy: 'user_commit', ...args.overrides });
  } finally {
    await lease.dispose();
  }
};

/**
 * {@link pushAndCommit} that keeps the lease, as the push path does while a
 * deferred compaction runs over it after the reply. The caller disposes it.
 */
const pushKeepingLease = async (args: {
  store: RepositoryStore;
  locator: RepositoryLocator;
  client: string;
  overrides?: Partial<Parameters<typeof commitLease>[0]>;
}): Promise<{ lease: RepositoryLease; outcome: CommitResult }> => {
  const lease = await hydrateLease({
    store: args.store,
    locator: args.locator,
    parentDirectory: temporary('lease'),
  });
  try {
    git(args.client, 'push', '--quiet', lease.directory, 'main');
    return {
      lease,
      outcome: await commitLease({ store: args.store, lease, committedBy: 'user_commit', ...args.overrides }),
    };
  } catch (error) {
    await lease.dispose();
    throw error;
  }
};

/** Commits `count` pushes of `client`, one revision each, so the repository holds `count` packs. */
const pushRevisions = async (args: {
  store: RepositoryStore;
  locator: RepositoryLocator;
  client: ReturnType<typeof newClient>;
  count: number;
}): Promise<void> => {
  const { store, locator, client, count } = args;
  for (let n = 2; n < count + 2; n += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each push builds on the generation before it
    await pushAndCommit({ store, locator, client: client.directory });
    client.revise(n);
  }
};

/** Every key a committed manifest makes a reader depend on. */
const keysNamedBy = (manifest: Manifest | undefined): string[] =>
  manifest === undefined
    ? []
    : [
        ...manifest.packs.flatMap((pack) => (pack.indexStored ? [pack.key, indexKeyFor(pack.key)] : [pack.key])),
        ...(manifest.earlierPushes === null ? [] : [manifest.earlierPushes]),
      ];

/** Index of the first manifest write in the journal, failing the test when there is none. */
const manifestWriteAt = (events: readonly PortEvent[]): number => {
  const at = events.findIndex((event) => event.kind === 'manifest');
  expect(at).toBeGreaterThanOrEqual(0);
  return at;
};

const putEndedBefore = (events: readonly PortEvent[], key: string, index: number): boolean =>
  events.slice(0, index).some((event) => event.kind === 'put-end' && event.key === key);

/**
 * Pads the stored push log until the next commit spills it into a segment
 * (EQ11): the next successor then has a segment to store before its manifest.
 */
const padPushLog = async (store: RepositoryStore, locator: RepositoryLocator): Promise<void> => {
  const read = await store.readManifest(locator);
  if (read === undefined) {
    throw new Error('padPushLog needs a committed repository');
  }
  let manifest = decodeManifest(read.manifest);
  const at = new Date(manifest.committedAt);
  for (;;) {
    const padded = succeedManifest(
      manifest,
      { refs: manifest.refs, packs: manifest.packs, committedBy: 'user_pad' },
      at,
    );
    if (padded.earlierPushes !== null) {
      break;
    }
    manifest = padded;
  }
  const written = await store.commitManifest(locator, encodeManifest(manifest), read.token);
  expect(written).not.toBe('lost');
};

describe('commitLease', () => {
  describe('object uploads', () => {
    it('should upload the pack and its index at once and write the manifest only after both are durable', async () => {
      const { store, events, tally } = journaledStore();
      const locator = newLocator();
      const client = newClient();

      const outcome = await pushAndCommit({ store, locator, client: client.directory });

      expect(outcome.committed).toBe(true);
      expect(tally.mostInFlight).toBe(2);
      const committed = await readBack(store, locator);
      expect(committed?.generation).toBe(1);
      const manifestAt = manifestWriteAt(events);
      const named = keysNamedBy(committed);
      expect(named).toHaveLength(2);
      expect(named.filter((key) => !putEndedBefore(events, key, manifestAt))).toStrictEqual([]);
    }, 60_000);

    it('should put retirement markers beside the compacted pack and its index, all before the manifest', async () => {
      const { store, events, tally } = journaledStore();
      const locator = newLocator();
      const client = newClient();
      for (const n of [2, 3, 4]) {
        // oxlint-disable-next-line no-await-in-loop -- each push builds on the generation before it
        await pushAndCommit({ store, locator, client: client.directory });
        client.revise(n);
      }
      const before = new Set(keysNamedBy(await readBack(store, locator)));
      events.length = 0;
      tally.mostInFlight = 0;

      const outcome = await pushAndCommit({ store, locator, client: client.directory, overrides: { packBound: 2 } });

      expect(outcome.committed && outcome.compacted).toBe(true);
      const manifestAt = manifestWriteAt(events);
      const markers = events
        .slice(0, manifestAt)
        .filter((event) => event.kind === 'put-end' && event.key.startsWith('retired/'));
      expect(markers).toHaveLength(2);
      /* Two markers, the new pack and its index: one round, not four. */
      expect(tally.mostInFlight).toBe(4);
      const committed = await readBack(store, locator);
      expect(committed?.packs).toHaveLength(2);
      /* The kept pack stays under the key an earlier generation stored; everything else is this commit's. */
      const added = keysNamedBy(committed).filter((key) => !before.has(key));
      expect(added).toHaveLength(2);
      expect(added.filter((key) => !putEndedBefore(events, key, manifestAt))).toStrictEqual([]);
    }, 60_000);

    it('should store a spilled push-log segment in the same round as the pack, before the manifest names it', async () => {
      const { store, events, tally } = journaledStore();
      const locator = newLocator();
      const client = newClient();
      await pushAndCommit({ store, locator, client: client.directory });
      await padPushLog(store, locator);
      client.revise(2);
      events.length = 0;
      tally.mostInFlight = 0;

      await pushAndCommit({ store, locator, client: client.directory });

      const committed = await readBack(store, locator);
      expect(committed?.earlierPushes).toMatch(/^pushes\//u);
      const manifestAt = manifestWriteAt(events);
      expect(putEndedBefore(events, committed?.earlierPushes ?? '', manifestAt)).toBe(true);
      /* The segment, the new pack and its index. */
      expect(tally.mostInFlight).toBe(3);
    }, 60_000);

    it('should send a small lease file as the bytes it hashed rather than reading the file again', async () => {
      const { store, events } = journaledStore();
      const locator = newLocator();
      const client = newClient();

      await pushAndCommit({ store, locator, client: client.directory });

      const sent = events.flatMap((event) =>
        event.kind === 'put-end' && event.key.startsWith('packs/')
          ? [
              {
                bytes: event.body instanceof Uint8Array,
                digestMatches:
                  event.body instanceof Uint8Array &&
                  createHash('sha256').update(event.body).digest('base64') === event.sha256,
              },
            ]
          : [],
      );
      expect(sent).toStrictEqual([
        { bytes: true, digestMatches: true },
        { bytes: true, digestMatches: true },
      ]);
    }, 60_000);

    it('should stream a lease file above 4 MiB and store it under the digest of its bytes', async () => {
      const { store, events } = journaledStore({ putMilliseconds: 1 });
      const locator = newLocator();
      const client = newClient();
      writeLarge(client.directory, 'large.bin', 5);

      await pushAndCommit({ store, locator, client: client.directory });

      const packPut = events.find((event) => event.kind === 'put-end' && event.key.endsWith('.pack'));
      expect(packPut?.kind === 'put-end' && typeof packPut.body).toBe('function');
      const stored = await buffer(await store.getObject(locator, packPut?.kind === 'put-end' ? packPut.key : ''));
      expect(stored.byteLength).toBeGreaterThan(4 * 1024 * 1024);
      expect(createHash('sha256').update(stored).digest('base64')).toBe(
        packPut?.kind === 'put-end' ? packPut.sha256 : '',
      );
    }, 60_000);

    it('should hold at most 8 MiB of lease files in memory however many packs one commit uploads', async () => {
      const { store, events } = journaledStore({ putMilliseconds: 1 });
      const locator = newLocator();
      const client = newClient();
      const lease = await hydrateLease({ store, locator, parentDirectory: temporary('lease') });
      try {
        for (const name of ['first.bin', 'second.bin', 'third.bin']) {
          writeLarge(client.directory, name, 3);
          git(client.directory, 'push', '--quiet', lease.directory, 'main');
        }
        await commitLease({ store, lease, committedBy: 'user_commit' });
      } finally {
        await lease.dispose();
      }

      const sent = events.flatMap((event) =>
        event.kind === 'put-end' && event.key.startsWith('packs/') ? [event] : [],
      );
      expect(sent.filter((event) => event.key.endsWith('.pack'))).toHaveLength(3);
      const buffered = sent.reduce(
        (total, event) => total + (event.body instanceof Uint8Array ? event.body.byteLength : 0),
        0,
      );
      expect(buffered).toBeLessThanOrEqual(8 * 1024 * 1024);
      expect(sent.filter((event) => typeof event.body === 'function').length).toBeGreaterThan(0);
      const committed = await readBack(store, locator);
      expect(committed?.packs).toHaveLength(3);
    }, 120_000);
  });

  describe('durability invariant', () => {
    it("should write no manifest when one object put fails, and rethrow that put's own error once every put settled", async () => {
      const refused = new Error('index put refused');
      const tally = { inFlightAtRejection: -1 };
      const journaled = journaledStore({
        failPut: (key) => (key.endsWith('.idx') ? refused : undefined),
      });
      const locator = newLocator();
      const client = newClient();
      await pushAndCommit({ store: journaled.store, locator, client: client.directory })
        .then(() => expect.fail('the commit should have failed'))
        .catch((error: unknown) => {
          tally.inFlightAtRejection = journaled.tally.inFlight;
          expect(error).toBe(refused);
        });

      expect(tally.inFlightAtRejection).toBe(0);
      expect(journaled.tally.manifestWrites).toBe(0);
      expect(await readBack(journaled.store, locator)).toBeUndefined();
    }, 60_000);

    it('should keep the previous generation and leave the uploads as unnamed garbage when the worker dies before the manifest write', async () => {
      const { store, events, tally } = journaledStore();
      const locator = newLocator();
      const client = newClient();
      await pushAndCommit({ store, locator, client: client.directory });
      const before = await readBack(store, locator);
      client.revise(2);
      events.length = 0;
      tally.manifestWrites = 0;

      await expect(
        pushAndCommit({
          store,
          locator,
          client: client.directory,
          overrides: {
            faults: (point) => {
              if (point === 'before-manifest-commit') {
                throw new Error('worker died');
              }
            },
          },
        }),
      ).rejects.toThrow('worker died');

      expect(tally.manifestWrites).toBe(0);
      expect(await readBack(store, locator)).toStrictEqual(before);
      const uploaded = events.flatMap((event) => (event.kind === 'put-end' ? [event.key] : []));
      expect(uploaded).toHaveLength(2);
      const named = new Set(keysNamedBy(before));
      expect(uploaded.filter((key) => named.has(key))).toStrictEqual([]);
    }, 60_000);

    it("should stop a slow sibling put and rethrow the failed put's own error once the sibling settled", async () => {
      const refused = new Error('index put refused');
      const journaled = journaledStore({
        honourSignal: true,
        putMilliseconds: (key) => (key.endsWith('.idx') ? 5 : 30_000),
        failPut: (key) => (key.endsWith('.idx') ? refused : undefined),
      });
      const locator = newLocator();
      const client = newClient();
      const startedAt = performance.now();
      const observed = { error: undefined as unknown, inFlight: -1 };

      try {
        await pushAndCommit({ store: journaled.store, locator, client: client.directory });
        expect.fail('the commit should have failed');
      } catch (error) {
        observed.error = error;
        observed.inFlight = journaled.tally.inFlight;
      }

      expect(observed.error).toBe(refused);
      expect(observed.inFlight).toBe(0);
      /* The 30 s pack put was aborted rather than awaited to the end. */
      expect(performance.now() - startedAt).toBeLessThan(15_000);
      expect(
        journaled.events.flatMap((event) =>
          event.kind === 'put-failed' || event.kind === 'put-aborted' ? [[event.kind, event.key.slice(-4)]] : [],
        ),
      ).toStrictEqual([
        ['put-failed', '.idx'],
        ['put-aborted', 'pack'],
      ]);
      expect(journaled.tally.manifestWrites).toBe(0);
      expect(await readBack(journaled.store, locator)).toBeUndefined();
    }, 60_000);

    it('should write no object and no manifest when a lease file cannot be read for hashing', async () => {
      const { store, events, tally } = journaledStore({ putMilliseconds: 1 });
      const locator = newLocator();
      const client = newClient();
      for (const n of [2, 3, 4]) {
        // oxlint-disable-next-line no-await-in-loop -- each push builds on the generation before it
        await pushAndCommit({ store, locator, client: client.directory });
        client.revise(n);
      }
      writeLarge(client.directory, 'large.bin', 5);
      const before = await readBack(store, locator);
      events.length = 0;
      tally.manifestWrites = 0;
      let removed = '';

      await expect(
        pushAndCommit({
          store,
          locator,
          client: client.directory,
          overrides: {
            packBound: 2,
            // The repack's own index goes missing between compaction and hashing.
            faults: (point) => {
              if (point === 'mid-compaction') {
                removed = removeNewestIndex(events);
              }
            },
          },
        }),
      ).rejects.toMatchObject({ code: 'ENOENT' });

      expect(removed).not.toBe('');
      expect(events.filter((event) => event.kind !== 'manifest')).toStrictEqual([]);
      expect(tally.manifestWrites).toBe(0);
      expect(await readBack(store, locator)).toStrictEqual(before);
    }, 60_000);
  });

  describe('phase timings', () => {
    it('should report each phase of a commit once, in the order it ran', async () => {
      const { store } = journaledStore({ putMilliseconds: 100 });
      const locator = newLocator();
      const client = newClient();
      const phases: Array<[CommitPhase, number]> = [];

      await pushAndCommit({
        store,
        locator,
        client: client.directory,
        overrides: { onPhase: (phase, seconds) => phases.push([phase, seconds]) },
      });

      expect(phases.map(([phase]) => phase)).toStrictEqual(['prepare', 'hash', 'object_puts', 'manifest_write']);
      expect(phases.every(([, seconds]) => Number.isFinite(seconds) && seconds >= 0)).toBe(true);
      /* Two puts of 100 ms each: the round lasts at least one of them. Overlap is asserted on in-flight counts above. */
      expect(phases.find(([phase]) => phase === 'object_puts')?.[1]).toBeGreaterThanOrEqual(0.09);
    }, 60_000);

    it('should report the compaction of a compacting commit as its own phase', async () => {
      const { store } = journaledStore({ putMilliseconds: 1 });
      const locator = newLocator();
      const client = newClient();
      for (const n of [2, 3, 4]) {
        // oxlint-disable-next-line no-await-in-loop -- each push builds on the generation before it
        await pushAndCommit({ store, locator, client: client.directory });
        client.revise(n);
      }
      const phases: CommitPhase[] = [];

      await pushAndCommit({
        store,
        locator,
        client: client.directory,
        overrides: { packBound: 2, onPhase: (phase) => phases.push(phase) },
      });

      expect(phases).toStrictEqual(['prepare', 'compaction', 'hash', 'object_puts', 'manifest_write']);
    }, 60_000);

    it('should report the re-read of a manifest write that did not certainly win, and still refuse it as lost', async () => {
      const { store } = journaledStore({ putMilliseconds: 1 });
      const losing: RepositoryStore = { ...store, commitManifest: async () => 'lost' };
      const locator = newLocator();
      const client = newClient();
      const phases: CommitPhase[] = [];

      await expect(
        pushAndCommit({
          store: losing,
          locator,
          client: client.directory,
          overrides: { onPhase: (phase) => phases.push(phase) },
        }),
      ).rejects.toSatisfy((error) => error instanceof RepositoryStoreError && error.code === 'lost');

      expect(phases).toStrictEqual(['prepare', 'hash', 'object_puts', 'manifest_write', 'manifest_read']);
    }, 60_000);
  });

  describe('deferred compaction (push latency F2)', () => {
    it('should commit only the arrived pack past the bound and leave the compaction owed', async () => {
      const { store, events } = journaledStore();
      const locator = newLocator();
      const client = newClient();
      await pushRevisions({ store, locator, client, count: 3 });
      events.length = 0;
      const phases: CommitPhase[] = [];

      const { lease, outcome } = await pushKeepingLease({
        store,
        locator,
        client: client.directory,
        overrides: { packBound: 2, deferCompaction: true, onPhase: (phase) => phases.push(phase) },
      });
      await lease.dispose();

      expect(outcome).toMatchObject({ committed: true, compacted: false });
      expect(outcome.committed && outcome.compaction).toBeTypeOf('function');
      expect(phases).not.toContain('compaction');
      expect(events.filter((event) => event.kind === 'put-end' && event.key.startsWith('retired/'))).toStrictEqual([]);
      const stored = await readBack(store, locator);
      expect(stored?.packs).toHaveLength(4);
    }, 60_000);

    it('should owe nothing at or under the bound, as a commit that would not compact', async () => {
      const { store } = journaledStore({ putMilliseconds: 1 });
      const locator = newLocator();
      const client = newClient();
      await pushRevisions({ store, locator, client, count: 1 });

      const { lease, outcome } = await pushKeepingLease({
        store,
        locator,
        client: client.directory,
        overrides: { packBound: 2, deferCompaction: true },
      });
      await lease.dispose();

      expect(outcome).toMatchObject({ committed: true, compacted: false });
      expect(outcome.committed && outcome.compaction).toBeUndefined();
    }, 60_000);

    it('should compact after the reply under its own conditional write, retiring before the manifest, refs unmoved', async () => {
      const { store, events } = journaledStore();
      const locator = newLocator();
      const client = newClient();
      await pushRevisions({ store, locator, client, count: 3 });
      const { lease, outcome } = await pushKeepingLease({
        store,
        locator,
        client: client.directory,
        overrides: { packBound: 2, deferCompaction: true },
      });
      if (!outcome.committed || outcome.compaction === undefined) {
        throw new Error('the push owed no compaction');
      }
      events.length = 0;
      const phases: CommitPhase[] = [];
      const compacted = await outcome.compaction({ onPhase: (phase) => phases.push(phase) });
      await lease.dispose();

      expect(compacted.outcome).toBe('committed');
      expect(phases).toStrictEqual(['compaction', 'hash', 'object_puts', 'manifest_write']);
      const stored = await readBack(store, locator);
      expect(stored?.generation).toBe(outcome.manifest.generation + 1);
      expect(stored?.refs).toStrictEqual(outcome.manifest.refs);
      expect(stored?.packs).toHaveLength(2);
      expect(stored?.pushes.at(-1)).toMatchObject({ committedBy: compactionCommitter, refs: [] });
      /* Every pack but the kept one is retired, and every marker and new key is durable before the manifest. */
      const manifestAt = manifestWriteAt(events);
      const markers = events
        .slice(0, manifestAt)
        .filter((event) => event.kind === 'put-end' && event.key.startsWith('retired/'));
      expect(markers).toHaveLength(outcome.manifest.packs.length - 1);
      const added = keysNamedBy(stored).filter((key) => !keysNamedBy(outcome.manifest).includes(key));
      expect(added).toHaveLength(2);
      expect(added.filter((key) => !putEndedBefore(events, key, manifestAt))).toStrictEqual([]);

      /* The compacted repository is whole: a fresh lease of it checks clean. */
      const reread = await hydrateLease({ store, locator, parentDirectory: temporary('lease') });
      try {
        git(reread.directory, 'fsck', '--strict', '--no-progress');
        expect(git(reread.directory, 'rev-parse', 'refs/heads/main').trim()).toBe(
          outcome.manifest.refs['refs/heads/main']?.oid,
        );
      } finally {
        await reread.dispose();
      }
    }, 60_000);

    it('should sweep after its own manifest, never deleting a key that manifest names', async () => {
      const { store } = journaledStore({ putMilliseconds: 1 });
      const locator = newLocator();
      const client = newClient();
      await pushRevisions({ store, locator, client, count: 3 });
      const { lease, outcome } = await pushKeepingLease({
        store,
        locator,
        client: client.directory,
        overrides: { packBound: 2, deferCompaction: true },
      });
      if (!outcome.committed || outcome.compaction === undefined) {
        throw new Error('the push owed no compaction');
      }
      const compacted = await outcome.compaction();
      await lease.dispose();
      if (compacted.outcome !== 'committed') {
        throw new Error(`the compaction ended ${compacted.outcome}`);
      }

      const swept = await compacted.sweep();
      expect(swept?.deleted).toStrictEqual([]);
      /* The retired packs are inside the retention window: kept, and counted. */
      expect(swept?.retainedBytes).toBeGreaterThan(0);
      const named = keysNamedBy(await readBack(store, locator));
      for (const key of named) {
        // oxlint-disable-next-line no-await-in-loop -- one read per named key
        await expect(store.getObject(locator, key)).resolves.toBeDefined();
      }
    }, 60_000);

    it("should stop before the repack once a push committed first, leaving that push's manifest and refs", async () => {
      const { store, events } = journaledStore({ putMilliseconds: 1 });
      const locator = newLocator();
      const client = newClient();
      await pushRevisions({ store, locator, client, count: 3 });
      const { lease, outcome } = await pushKeepingLease({
        store,
        locator,
        client: client.directory,
        overrides: { packBound: 2, deferCompaction: true },
      });
      if (!outcome.committed || outcome.compaction === undefined) {
        throw new Error('the push owed no compaction');
      }
      client.revise(10);
      const next = await pushAndCommit({
        store,
        locator,
        client: client.directory,
        overrides: { packBound: 2, deferCompaction: true },
      });
      events.length = 0;
      const phases: CommitPhase[] = [];

      const compacted = await outcome.compaction({ onPhase: (phase) => phases.push(phase) });
      await lease.dispose();

      expect(compacted.outcome).toBe('superseded');
      expect(phases).toStrictEqual([]);
      expect(events).toStrictEqual([]);
      const stored = await readBack(store, locator);
      expect(next.committed && stored?.generation).toBe(next.committed ? next.manifest.generation : -1);
      expect(stored?.refs['refs/heads/main']?.oid).toBe(git(client.directory, 'rev-parse', 'main').trim());
    }, 60_000);

    it('should stop before any upload or marker when a push commits during its repack', async () => {
      const { store, events } = journaledStore({ putMilliseconds: 1 });
      const locator = newLocator();
      const client = newClient();
      await pushRevisions({ store, locator, client, count: 3 });
      const { lease, outcome } = await pushKeepingLease({
        store,
        locator,
        client: client.directory,
        overrides: { packBound: 2, deferCompaction: true },
      });
      if (!outcome.committed || outcome.compaction === undefined) {
        throw new Error('the push owed no compaction');
      }
      client.revise(10);

      const compacted = await outcome.compaction({
        faults: async (point) => {
          if (point === 'mid-compaction') {
            await pushAndCommit({
              store,
              locator,
              client: client.directory,
              overrides: { packBound: 2, deferCompaction: true },
            });
            events.length = 0;
          }
        },
      });
      await lease.dispose();

      expect(compacted.outcome).toBe('superseded');
      /* No marker lands on a pack the newer manifest still names, and no compacted pack is left behind. */
      expect(events.filter((event) => event.kind === 'put-start' || event.kind === 'put-end')).toStrictEqual([]);
      const stored = await readBack(store, locator);
      expect(stored?.generation).toBe(outcome.manifest.generation + 1);
      expect(stored?.pushes.at(-1)?.committedBy).toBe('user_commit');
    }, 60_000);

    it('should lose to a writer that commits between its last check and its manifest write', async () => {
      const { store } = journaledStore({ putMilliseconds: 1 });
      const locator = newLocator();
      const client = newClient();
      await pushRevisions({ store, locator, client, count: 3 });
      const { lease, outcome } = await pushKeepingLease({
        store,
        locator,
        client: client.directory,
        overrides: { packBound: 2, deferCompaction: true },
      });
      if (!outcome.committed || outcome.compaction === undefined) {
        throw new Error('the push owed no compaction');
      }
      client.revise(10);

      const compacted = await outcome.compaction({
        faults: async (point) => {
          if (point === 'before-manifest-commit') {
            await pushAndCommit({ store, locator, client: client.directory });
          }
        },
      });
      await lease.dispose();

      expect(compacted.outcome).toBe('lost');
      const stored = await readBack(store, locator);
      expect(stored?.generation).toBe(outcome.manifest.generation + 1);
      expect(stored?.refs['refs/heads/main']?.oid).toBe(git(client.directory, 'rev-parse', 'main').trim());
    }, 60_000);

    it('should let a writer that hydrated the push rebase onto the compaction instead of losing its race', async () => {
      const { store } = journaledStore({ putMilliseconds: 1 });
      const locator = newLocator();
      const client = newClient();
      await pushRevisions({ store, locator, client, count: 3 });
      const { lease, outcome } = await pushKeepingLease({
        store,
        locator,
        client: client.directory,
        overrides: { packBound: 2, deferCompaction: true },
      });
      if (!outcome.committed || outcome.compaction === undefined) {
        throw new Error('the push owed no compaction');
      }
      client.revise(10);
      /* A second store client: another storage member's lease of the push's generation. */
      const racing = await hydrateLease({ store, locator, parentDirectory: temporary('lease') });

      const compacted = await outcome.compaction();
      await lease.dispose();
      if (compacted.outcome !== 'committed') {
        throw new Error(`the compaction ended ${compacted.outcome}`);
      }

      let rebased: CommitResult;
      try {
        git(client.directory, 'push', '--quiet', racing.directory, 'main');
        rebased = await commitLease({
          store,
          lease: racing,
          committedBy: 'user_commit',
          packBound: 2,
          deferCompaction: true,
        });
      } finally {
        await racing.dispose();
      }

      expect(rebased).toMatchObject({ committed: true, compacted: false });
      /* It owes nothing: the compaction it rebased over already ran. */
      expect(rebased.committed && rebased.compaction).toBeUndefined();
      expect(rebased.committed && rebased.moved).toStrictEqual([
        {
          ref: 'refs/heads/main',
          before: outcome.manifest.refs['refs/heads/main']?.oid,
          after: git(client.directory, 'rev-parse', 'main').trim(),
        },
      ]);
      const stored = await readBack(store, locator);
      expect(stored?.generation).toBe(outcome.manifest.generation + 2);
      expect(stored?.pushes.slice(-2).map((record) => record.committedBy)).toStrictEqual([
        compactionCommitter,
        'user_commit',
      ]);
      /* The compaction's packs, plus the push's own one; none of the packs the compaction retired. */
      expect(stored?.packs.slice(0, -1)).toStrictEqual(compacted.manifest.packs);
      expect(stored?.packs).toHaveLength(compacted.manifest.packs.length + 1);

      const reread = await hydrateLease({ store, locator, parentDirectory: temporary('lease') });
      try {
        git(reread.directory, 'fsck', '--strict', '--no-progress');
        expect(git(reread.directory, 'rev-parse', 'refs/heads/main').trim()).toBe(
          git(client.directory, 'rev-parse', 'main').trim(),
        );
      } finally {
        await reread.dispose();
      }
    }, 60_000);

    it('should not rebase a writer whose new ref names an object only the old packs held unreferenced', async () => {
      const { store } = journaledStore({ putMilliseconds: 1 });
      const locator = newLocator();
      const client = newClient();
      await pushRevisions({ store, locator, client, count: 3 });
      /* A commit the repository holds but no ref reaches: pushed on a branch that was then removed. */
      git(client.directory, 'switch', '--quiet', '-c', 'side');
      client.revise(50);
      const unreferenced = git(client.directory, 'rev-parse', 'side').trim();
      git(client.directory, 'switch', '--quiet', 'main');
      const sideLease = await hydrateLease({ store, locator, parentDirectory: temporary('lease') });
      try {
        git(client.directory, 'push', '--quiet', sideLease.directory, 'side');
        await commitLease({ store, lease: sideLease, committedBy: 'user_commit' });
      } finally {
        await sideLease.dispose();
      }
      const removing = await hydrateLease({ store, locator, parentDirectory: temporary('lease') });
      try {
        git(removing.directory, 'update-ref', '-d', 'refs/heads/side');
        await commitLease({ store, lease: removing, committedBy: 'user_commit' });
      } finally {
        await removing.dispose();
      }

      const { lease, outcome } = await pushKeepingLease({
        store,
        locator,
        client: client.directory,
        overrides: { packBound: 2, deferCompaction: true },
      });
      if (!outcome.committed || outcome.compaction === undefined) {
        throw new Error('the push owed no compaction');
      }
      const racing = await hydrateLease({ store, locator, parentDirectory: temporary('lease') });
      const compacted = await outcome.compaction();
      await lease.dispose();
      expect(compacted.outcome).toBe('committed');

      try {
        /* The racing writer names the unreferenced commit and uploads nothing for it. */
        git(racing.directory, 'update-ref', 'refs/heads/conflicts/back', unreferenced);
        await expect(commitLease({ store, lease: racing, committedBy: 'user_commit' })).rejects.toSatisfy(
          (error) => error instanceof RepositoryStoreError && error.code === 'lost',
        );
      } finally {
        await racing.dispose();
      }
      const stored = await readBack(store, locator);
      expect(stored?.generation).toBe(outcome.manifest.generation + 1);
    }, 60_000);

    it('should not rebase over a newer generation that is not a compaction', async () => {
      const { store } = journaledStore({ putMilliseconds: 1 });
      const locator = newLocator();
      const client = newClient();
      await pushRevisions({ store, locator, client, count: 3 });
      const racing = await hydrateLease({ store, locator, parentDirectory: temporary('lease') });
      /* A newer generation that moved no ref, written by something other than a deferred compaction. */
      const current = await readBack(store, locator);
      const read = await store.readManifest(locator);
      if (current === undefined || read === undefined) {
        throw new Error('nothing committed');
      }
      const same = succeedManifest(current, { refs: current.refs, packs: current.packs, committedBy: 'user_other' });
      await store.commitManifest(locator, encodeManifest(same), read.token);

      try {
        git(client.directory, 'push', '--quiet', racing.directory, 'main');
        await expect(commitLease({ store, lease: racing, committedBy: 'user_commit' })).rejects.toSatisfy(
          (error) => error instanceof RepositoryStoreError && error.code === 'lost',
        );
      } finally {
        await racing.dispose();
      }
    }, 60_000);

    it('should give way before the repack when told to, writing nothing', async () => {
      const { store, events } = journaledStore({ putMilliseconds: 1 });
      const locator = newLocator();
      const client = newClient();
      await pushRevisions({ store, locator, client, count: 3 });
      const { lease, outcome } = await pushKeepingLease({
        store,
        locator,
        client: client.directory,
        overrides: { packBound: 2, deferCompaction: true },
      });
      if (!outcome.committed || outcome.compaction === undefined) {
        throw new Error('the push owed no compaction');
      }
      events.length = 0;

      const compacted = await outcome.compaction({ shouldAbandon: () => true });
      await lease.dispose();

      expect(compacted.outcome).toBe('abandoned');
      expect(events).toStrictEqual([]);
      const stored = await readBack(store, locator);
      expect(stored?.generation).toBe(outcome.manifest.generation);
    }, 60_000);

    it('should give way before the manifest write when a push arrives mid-compaction, leaving only garbage', async () => {
      const { store, events } = journaledStore({ putMilliseconds: 1 });
      const locator = newLocator();
      const client = newClient();
      await pushRevisions({ store, locator, client, count: 3 });
      const { lease, outcome } = await pushKeepingLease({
        store,
        locator,
        client: client.directory,
        overrides: { packBound: 2, deferCompaction: true },
      });
      if (!outcome.committed || outcome.compaction === undefined) {
        throw new Error('the push owed no compaction');
      }
      events.length = 0;
      let arrived = false;

      const compacted = await outcome.compaction({
        shouldAbandon: () => arrived,
        faults: (point) => {
          if (point === 'after-pack-upload') {
            arrived = true;
          }
        },
      });
      await lease.dispose();

      expect(compacted.outcome).toBe('abandoned');
      expect(events.some((event) => event.kind === 'put-end')).toBe(true);
      expect(events.filter((event) => event.kind === 'manifest')).toStrictEqual([]);
      const stored = await readBack(store, locator);
      expect(stored?.generation).toBe(outcome.manifest.generation);
    }, 60_000);

    it("should compact inline, in the push's own manifest write, past the deferral limit", async () => {
      const { store } = journaledStore({ putMilliseconds: 1 });
      const locator = newLocator();
      const client = newClient();
      await pushRevisions({ store, locator, client, count: 3 });

      const { lease, outcome } = await pushKeepingLease({
        store,
        locator,
        client: client.directory,
        overrides: { packBound: 1, deferCompaction: true, deferredPackLimit: 3 },
      });
      await lease.dispose();

      expect(outcome).toMatchObject({ committed: true, compacted: true });
      expect(outcome.committed && outcome.compaction).toBeUndefined();
      const stored = await readBack(store, locator);
      expect(stored?.packs.length).toBeLessThanOrEqual(2);
    }, 60_000);

    it('should compact inline when only compaction keeps the repository under the byte ceiling', async () => {
      const { store } = journaledStore({ putMilliseconds: 1 });
      const locator = newLocator();
      const client = newClient();
      await pushRevisions({ store, locator, client, count: 3 });
      const lease = await hydrateLease({ store, locator, parentDirectory: temporary('lease') });
      try {
        git(client.directory, 'push', '--quiet', lease.directory, 'main');
        const packs = path.join(lease.directory, 'objects/pack');
        const uncompacted = readdirSync(packs)
          .filter((name) => name.endsWith('.pack'))
          .reduce((total, name) => total + statSync(path.join(packs, name)).size, 0);

        const outcome = await commitLease({
          store,
          lease,
          committedBy: 'user_commit',
          packBound: 2,
          deferCompaction: true,
          byteCeiling: uncompacted - 1,
        });

        expect(outcome).toMatchObject({ committed: true, compacted: true });
        expect(outcome.committed && outcome.compaction).toBeUndefined();
      } finally {
        await lease.dispose();
      }
    }, 60_000);
  });
});
