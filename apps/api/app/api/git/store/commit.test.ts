import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { commitLease } from '#api/git/store/commit.js';
import type { CommitPhase } from '#api/git/store/commit.js';
import { RepositoryStoreError } from '#api/git/store/errors.js';
import { hydrateLease } from '#api/git/store/lease.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { decodeManifest, encodeManifest, indexKeyFor, succeedManifest } from '#api/git/store/manifest.js';
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

type PortEvent =
  | { readonly kind: 'put-start' | 'put-end'; readonly key: string; readonly body: ObjectBody; readonly sha256: string }
  | { readonly kind: 'put-failed'; readonly key: string }
  | { readonly kind: 'manifest' };

/**
 * The memory store, journaled: each object put takes `putMilliseconds` as a
 * remote PUT would, so puts made one after another never overlap, and
 * `failPut` turns a key's put into a rejection after the same delay.
 */
const journaledStore = (
  options: { putMilliseconds?: number; failPut?: (key: string) => Error | undefined } = {},
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
    putObject: async (locator, key, body, putOptions) => {
      events.push({ kind: 'put-start', key, body, sha256: putOptions.sha256 });
      tally.inFlight += 1;
      tally.mostInFlight = Math.max(tally.mostInFlight, tally.inFlight);
      try {
        await delay(options.putMilliseconds ?? 25);
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
      /* Two puts of 100 ms each, sent together: one round, not two. */
      const puts = phases.find(([phase]) => phase === 'object_puts')?.[1] ?? 0;
      expect(puts).toBeGreaterThanOrEqual(0.09);
      expect(puts).toBeLessThan(0.18);
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
});
