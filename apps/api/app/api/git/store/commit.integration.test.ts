import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { getEnvironment } from '#config/environment.config.js';
import { assertDestructiveTestBucketAllowed } from '#storage/destructive-test-bucket-guard.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { StorageModule } from '#storage/storage.module.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import type { CommitToken, RepositoryLocator, RepositoryStore } from '#api/git/store/port.js';
import { commitLease, commitTombstone } from '#api/git/store/commit.js';
import { RepositoryStoreError } from '#api/git/store/errors.js';
import { hydrateLease } from '#api/git/store/lease.js';
import { decodeManifest, encodeManifest, succeedManifest } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';
import { livePackBound, orphanThresholdMilliseconds, retentionWindowMilliseconds } from '#api/git/store/limits.js';
import { faultPoints } from '#api/git/store/fault-points.js';
import type { FaultPoint } from '#api/git/store/fault-points.js';
import { repositoryLocator } from '#api/git/store/locator.js';

// === harness =============================================================

const committedBy = 'user_w2';

const scratchDirectories: string[] = [];

const scratch = (label: string): string => {
  const directory = mkdtempSync(path.join(tmpdir(), `tau-w2-${label}-`));
  scratchDirectories.push(directory);
  return directory;
};

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
/** The hook's fail-closed admission flag, as the smart-HTTP route sets it on the child. */
const admitted = (value: string): NodeJS.ProcessEnv => {
  const environment: Record<string, string> = {
    PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    HOME: tmpdir(),
    LANG: 'C',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    TAU_GIT_PUSH_ADMITTED: value,
  };
  return environment as NodeJS.ProcessEnv;
};
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

const git = (cwd: string, ...args: readonly string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/**
 * A stock `git push` over the local transport, which runs the same
 * `receive-pack` and the same `pre-receive` hook the smart-HTTP route spawns.
 * `TAU_GIT_PUSH_ADMITTED` is the hook's fail-closed admission flag.
 */
const push = (
  clientDirectory: string,
  leaseDirectory: string,
  refspecs: readonly string[],
): { ok: boolean; output: string } => {
  try {
    const output = execFileSync('git', ['push', leaseDirectory, ...refspecs], {
      cwd: clientDirectory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: admitted('1'),
    });
    return { ok: true, output };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
};

/** A client repository with `main` and an annotated tag, the shape a Tau project pushes. */
const newClient = (): { directory: string; revise: (n: number) => void } => {
  const directory = scratch('client');
  git(directory, 'init', '--quiet', '--initial-branch=main', '.');
  git(directory, 'config', 'user.name', 'W2');
  git(directory, 'config', 'user.email', 'w2@tau.test');
  const revise = (n: number): void => {
    writeFileSync(path.join(directory, 'main.scad'), `cube(${String(n)});\n`);
    git(directory, 'add', '.');
    git(directory, 'commit', '--quiet', '-m', `rev ${String(n)}`);
  };
  revise(1);
  return { directory, revise };
};

/** The same push with the hook's admission flag cleared, which must fail closed. */
const pushUnadmitted = (clientDirectory: string, leaseDirectory: string): { ok: boolean; output: string } => {
  try {
    execFileSync('git', ['push', leaseDirectory, 'main'], {
      cwd: clientDirectory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: admitted(''),
    });
    return { ok: true, output: '' };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
};

const packsOf = (leaseDirectory: string): string[] =>
  readdirSync(path.join(leaseDirectory, 'objects/pack'))
    .filter((name) => name.endsWith('.pack'))
    .sort();

const looseCount = (leaseDirectory: string): number => {
  const line = git(leaseDirectory, 'count-objects', '-v')
    .split('\n')
    .find((candidate) => candidate.startsWith('count: '));
  return Number(line?.slice('count: '.length) ?? '0');
};

/**
 * Appends a measured number to the file `TAU_W2_MEASUREMENTS` names, so the
 * charter's "measured hydrate cost at the ruled pack bound" lands in the
 * evidence tree instead of in console output.
 */
const recordMeasurement = (line: string): void => {
  const file = process.env['TAU_W2_MEASUREMENTS'];
  if (file !== undefined && file !== '') {
    appendFileSync(file, `${line}\n`);
  }
};

const advertisement = (repositoryDirectory: string): string =>
  execFileSync('git', ['upload-pack', '--stateless-rpc', '--advertise-refs', repositoryDirectory], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/**
 * Delegates every port member to `inner` and replaces the ones given. Spelled
 * out rather than spread: `inner` is a class instance, and spreading one copies
 * its own properties and none of its prototype's methods.
 */
const wrapStore = (inner: RepositoryStore, overrides: Partial<RepositoryStore>): RepositoryStore => ({
  capabilities: inner.capabilities,
  readManifest: async (locator) => inner.readManifest(locator),
  commitManifest: async (locator, next, expected) => inner.commitManifest(locator, next, expected),
  // oxlint-disable-next-line max-params -- the port's own signature
  putObject: async (locator, key, body, options) => inner.putObject(locator, key, body, options),
  getObject: async (locator, key, range) => inner.getObject(locator, key, range),
  listObjects: (locator, prefix) => inner.listObjects(locator, prefix),
  deleteObjects: async (locator, keys) => inner.deleteObjects(locator, keys),
  ...overrides,
});

/** A store that records every `getObject` key, so a hydrate's reads are observable. */
const countingStore = (inner: RepositoryStore, reads: string[]): RepositoryStore =>
  wrapStore(inner, {
    getObject: async (locator, key, range) => {
      reads.push(key);
      return inner.getObject(locator, key, range);
    },
  });

/** A store whose manifest write fails with the backend's rate-limit status the first `times` calls. */
const rateLimitedStore = (inner: RepositoryStore, times: number, calls: { count: number }): RepositoryStore =>
  wrapStore(inner, {
    commitManifest: async (locator, next, expected) => {
      calls.count += 1;
      if (calls.count <= times) {
        // R2's shape: HTTP 429, surfaced by the AWS SDK under an unrelated name (W0b).
        throw Object.assign(new Error('Reduce your concurrent request rate for the same object'), {
          name: 'ServiceUnavailable',
          $metadata: { httpStatusCode: 429 },
        });
      }
      return inner.commitManifest(locator, next, expected);
    },
  });

// === suite ===============================================================

describe('repository store commit protocol', () => {
  let moduleRef: TestingModule;
  let driver: ObjectStorageService;
  let store: S3RepositoryStore;
  const prefixes: RepositoryLocator[] = [];

  const newRepository = (): RepositoryLocator => {
    const locator = repositoryLocator({
      ownerId: `user-w2-${randomBytes(6).toString('hex')}`,
      projectId: `proj-${randomBytes(6).toString('hex')}`,
    });
    prefixes.push(locator);
    return locator;
  };

  const readManifest = async (locator: RepositoryLocator): Promise<Manifest | undefined> => {
    const read = await store.readManifest(locator);
    return read === undefined ? undefined : decodeManifest(read.manifest);
  };

  /** Bytes under a key no manifest will ever name: what a worker that died after its upload leaves. */
  const putOrphan = async (locator: RepositoryLocator, key: string): Promise<void> => {
    const body = new Uint8Array(new ArrayBuffer(8));
    await store.putObject(locator, key, body, {
      contentLength: body.byteLength,
      sha256: createHash('sha256').update(body).digest('base64'),
    });
  };

  const listPacks = async (locator: RepositoryLocator): Promise<string[]> => {
    const keys: string[] = [];
    for await (const object of store.listObjects(locator, 'packs/')) {
      keys.push(object.key);
    }
    return keys.sort();
  };

  /** Hydrates, pushes and commits in one step, the way the write path does. */
  const pushAndCommit = async (args: {
    locator: RepositoryLocator;
    client: string;
    refspecs?: readonly string[];
    overrides?: Partial<Parameters<typeof commitLease>[0]>;
  }): Promise<Awaited<ReturnType<typeof commitLease>>> => {
    const lease = await hydrateLease({ store, locator: args.locator, parentDirectory: scratch('lease') });
    try {
      push(args.client, lease.directory, args.refspecs ?? ['main']);
      return await commitLease({ store, lease, committedBy, ...args.overrides });
    } finally {
      await lease.dispose();
    }
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }), StorageModule],
    }).compile();

    driver = moduleRef.get(ObjectStorageService);
    assertDestructiveTestBucketAllowed(driver.bucketFor('private'), 'the repository store commit suite');
    store = new S3RepositoryStore(driver);
  }, 60_000);

  afterAll(async () => {
    await Promise.all(
      prefixes.map(async (locator) =>
        driver.deleteEntirePrefixForPurgeJob({
          namespace: 'tenants',
          keyPrefix: `${locator.ownerId}/`,
          tier: 'private',
        }),
      ),
    );
    for (const directory of scratchDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
    await moduleRef.close();
  }, 120_000);

  // === write path ========================================================

  describe('write path', () => {
    it('should create generation 1 from a push into an empty repository', async () => {
      const locator = newRepository();
      const client = newClient();

      const result = await pushAndCommit({ locator, client: client.directory });

      expect(result).toMatchObject({ committed: true });
      const manifest = await readManifest(locator);
      expect(manifest?.generation).toBe(1);
      expect(manifest?.packs).toHaveLength(1);
      expect(manifest?.committedBy).toBe(committedBy);
      expect(Object.keys(manifest?.refs ?? {})).toStrictEqual(['refs/heads/main']);
      expect(await listPacks(locator)).toStrictEqual([
        `${(manifest?.packs[0]?.key ?? '').slice(0, -'.pack'.length)}.idx`,
        manifest?.packs[0]?.key,
      ]);
    }, 60_000);

    it('should advance the generation and add a pack on the next push', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });

      client.revise(2);
      await pushAndCommit({ locator, client: client.directory });

      const manifest = await readManifest(locator);
      expect(manifest?.generation).toBe(2);
      expect(manifest?.packs).toHaveLength(2);
      expect(manifest?.incarnation).toMatch(/^[\da-f]{32}$/u);
    }, 60_000);

    it('should commit nothing when the ref map did not change', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });

      const result = await pushAndCommit({ locator, client: client.directory });

      expect(result).toStrictEqual({ committed: false, reason: 'no-ref-change' });
      const manifest = await readManifest(locator);
      expect(manifest?.generation).toBe(1);
    }, 60_000);

    it('should record the peeled target of an annotated tag', async () => {
      const locator = newRepository();
      const client = newClient();
      git(client.directory, 'tag', '-a', 'v1', '-m', 'release one');

      await pushAndCommit({ locator, client: client.directory, refspecs: ['main', 'v1'] });

      const manifest = await readManifest(locator);
      const tag = manifest?.refs['refs/tags/v1'];
      expect(tag?.peeled).toMatch(/^[\da-f]{40,64}$/u);
      expect(tag?.peeled).not.toBe(tag?.oid);
    }, 60_000);

    it('should commit only the refs git actually moved when it refuses one after the hook (AR-A E3)', async () => {
      const locator = newRepository();
      const client = newClient();
      git(client.directory, 'branch', 'a');
      await pushAndCommit({ locator, client: client.directory, refspecs: ['main', 'a'] });
      // The conflict lives on the server only: `refs/heads/a` is already there,
      // so `refs/heads/a/b` passes `pre-receive` and git refuses it afterwards.
      git(client.directory, 'branch', '-D', 'a');
      client.revise(2);
      git(client.directory, 'branch', 'a/b');

      const conflicting = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      const attempted = push(client.directory, conflicting.directory, ['main', 'a/b']);
      await conflicting.dispose();
      const outcome = await pushAndCommit({ locator, client: client.directory, refspecs: ['main', 'a/b'] });

      // Git's own status says the push failed, and `pre-receive` never refused
      // anything: a committer keyed on either signal would have thrown away the
      // `refs/heads/main` the client was told went through (AR-A E1-C, E3).
      expect(attempted.ok).toBe(false);
      expect(attempted.output).not.toContain('Tau: refused');
      expect(attempted.output).toMatch(/refname conflict|rejected/u);
      expect(outcome).toMatchObject({ committed: true });
      const manifest = await readManifest(locator);
      expect(Object.keys(manifest?.refs ?? {}).sort()).toStrictEqual(['refs/heads/a', 'refs/heads/main']);
    }, 60_000);

    it('should refuse to commit a push whose objects never became a pack (AR-A E1)', async () => {
      const locator = newRepository();
      const client = newClient();
      const lease = await hydrateLease({
        store,
        locator,
        parentDirectory: scratch('lease'),
        // Git's own default: a small push lands as loose objects and no pack exists.
        config: { 'transfer.unpackLimit': '100' },
      });

      push(client.directory, lease.directory, ['main']);

      expect(looseCount(lease.directory)).toBeGreaterThan(0);
      expect(packsOf(lease.directory)).toHaveLength(0);
      await expect(commitLease({ store, lease, committedBy })).rejects.toThrow(
        expect.objectContaining({ code: 'loose-objects' }) as unknown as Error,
      );
      expect(await readManifest(locator)).toBeUndefined();
      await lease.dispose();
    }, 60_000);

    it('should keep every received push as exactly one pack with no loose object (AR-A E1)', async () => {
      const locator = newRepository();
      const client = newClient();
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });

      push(client.directory, lease.directory, ['main']);

      expect(looseCount(lease.directory)).toBe(0);
      expect(packsOf(lease.directory)).toHaveLength(1);
      await lease.dispose();
    }, 60_000);

    it('should commit a push that moves a ref to a commit the server already holds', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });

      // A new branch at an existing commit, a lightweight tag, `git push <sha>:refs/heads/x`:
      // the ref map moves and the client sends no pack at all.
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      const head = git(client.directory, 'rev-parse', 'main').trim();
      const sent = push(client.directory, lease.directory, [`${head}:refs/heads/release`]);
      expect(sent.ok).toBe(true);
      expect(readdirSync(path.join(lease.directory, 'objects/pack')).filter((n) => n.endsWith('.pack'))).toHaveLength(
        1,
      );

      const outcome = await commitLease({ store, lease, committedBy });

      expect(outcome).toMatchObject({ committed: true });
      const manifest = await readManifest(locator);
      expect(Object.keys(manifest?.refs ?? {}).sort()).toStrictEqual(['refs/heads/main', 'refs/heads/release']);
      expect(manifest?.packs).toHaveLength(1);
      expect(manifest?.generation).toBe(2);
      await lease.dispose();
    }, 60_000);

    it('should commit nothing when a push moves no ref and sends no pack', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });

      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      push(client.directory, lease.directory, ['main']);
      const outcome = await commitLease({ store, lease, committedBy });

      expect(outcome).toStrictEqual({ committed: false, reason: 'no-ref-change' });
      await lease.dispose();
    }, 60_000);

    it('should report every ref the push moved, with its previous value', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });
      const before = git(client.directory, 'rev-parse', 'main').trim();
      client.revise(2);
      git(client.directory, 'branch', 'side');

      const outcome = await pushAndCommit({ locator, client: client.directory, refspecs: ['main', 'side'] });
      const after = git(client.directory, 'rev-parse', 'main').trim();

      expect(outcome.committed).toBe(true);
      expect(outcome.committed ? [...outcome.moved].sort((l, r) => (l.ref < r.ref ? -1 : 1)) : []).toStrictEqual([
        { ref: 'refs/heads/main', before, after },
        { ref: 'refs/heads/side', after },
      ]);
    }, 60_000);

    it('should refuse a push that would carry the repository past the byte ceiling (D20)', async () => {
      const locator = newRepository();
      const client = newClient();
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      push(client.directory, lease.directory, ['main']);

      await expect(commitLease({ store, lease, committedBy, byteCeiling: 16 })).rejects.toThrow(
        expect.objectContaining({ code: 'ceiling-exceeded' }) as unknown as Error,
      );
      expect(await readManifest(locator)).toBeUndefined();
      await lease.dispose();
    }, 60_000);
  });

  // === lease =============================================================

  describe('lease (D17)', () => {
    it('should set the four settings git gets wrong for a lease (AR-A E6)', async () => {
      const locator = newRepository();
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });

      expect({
        unpackLimit: git(lease.directory, 'config', '--get', 'transfer.unpackLimit').trim(),
        autogc: git(lease.directory, 'config', '--get', 'receive.autogc').trim(),
        gcAuto: git(lease.directory, 'config', '--get', 'gc.auto').trim(),
        maintenance: git(lease.directory, 'config', '--get', 'maintenance.auto').trim(),
        denyDeletes: git(lease.directory, 'config', '--get', 'receive.denyDeletes').trim(),
        denyNonFastForwards: git(lease.directory, 'config', '--get', 'receive.denyNonFastForwards').trim(),
      }).toStrictEqual({
        unpackLimit: '1',
        autogc: 'false',
        gcAuto: '0',
        maintenance: 'false',
        denyDeletes: 'true',
        denyNonFastForwards: 'true',
      });
      await lease.dispose();
    }, 60_000);

    it('should leave no detached maintenance to rename packs behind the commit (AR-A E6)', async () => {
      const locator = newRepository();
      const client = newClient();
      const lease = await hydrateLease({
        store,
        locator,
        parentDirectory: scratch('lease'),
        // The setting that made E6's detached `git maintenance run --auto` fire at four packs.
        config: { 'gc.autoPackLimit': '2' },
      });

      for (let revision = 2; revision <= 5; revision += 1) {
        client.revise(revision);
        push(client.directory, lease.directory, ['main']);
      }

      const packs = packsOf(lease.directory);
      await new Promise((resolve) => {
        setTimeout(resolve, 3000);
      });
      expect(packsOf(lease.directory)).toStrictEqual(packs);
      expect(packs).toHaveLength(4);
      await lease.dispose();
    }, 60_000);

    it('should install the pre-receive hook so a host-local ref is still refused', async () => {
      const locator = newRepository();
      const client = newClient();
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });

      const refused = push(client.directory, lease.directory, ['main:refs/tau/revisions/x']);

      expect(refused.ok).toBe(false);
      expect(refused.output).toContain('host-local refs never leave a host');
      await lease.dispose();
    }, 60_000);

    it('should refuse loose objects even when this commit would also compact', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });

      // A lease at git's default unpack limit, committing at a bound it already
      // exceeds: `repack -a -d` would roll the loose objects into a pack and the
      // precondition would pass on a state the push never produced.
      const lease = await hydrateLease({
        store,
        locator,
        parentDirectory: scratch('lease'),
        config: { 'transfer.unpackLimit': '100' },
      });
      client.revise(2);
      push(client.directory, lease.directory, ['main']);
      expect(looseCount(lease.directory)).toBeGreaterThan(0);

      await expect(commitLease({ store, lease, committedBy, packBound: 0 })).rejects.toThrow(
        expect.objectContaining({ code: 'loose-objects' }) as unknown as Error,
      );
      const manifest = await readManifest(locator);
      expect(manifest?.generation).toBe(1);
      await lease.dispose();
    }, 60_000);

    it('should refuse a push that is admitted by nothing (fail-closed hook)', async () => {
      const locator = newRepository();
      const client = newClient();
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });

      const refused = pushUnadmitted(client.directory, lease.directory);

      expect(refused.ok).toBe(false);
      expect(refused.output).toContain('accepts pushes only through the Tau API');
      await lease.dispose();
    }, 60_000);

    it('should advertise byte-identically to a repository that holds every object locally (AR-A E9)', async () => {
      const locator = newRepository();
      const client = newClient();
      git(client.directory, 'tag', '-a', 'v1', '-m', 'release one');
      await pushAndCommit({ locator, client: client.directory, refspecs: ['main', 'v1'] });

      const full = scratch('full');
      git(full, 'init', '--bare', '--quiet', '--template=', '--initial-branch=main', '.');
      push(client.directory, full, ['main', 'v1']);
      git(full, 'pack-refs', '--all');
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });

      expect(advertisement(lease.directory)).toStrictEqual(advertisement(full));
      await lease.dispose();
    }, 60_000);

    it('should store the pack index beside every pack it uploads (D33)', async () => {
      const locator = newRepository();
      const client = newClient();

      await pushAndCommit({ locator, client: client.directory });

      const manifest = await readManifest(locator);
      const pack = manifest?.packs[0];
      expect(pack?.indexStored).toBe(true);
      const stored = await listPacks(locator);
      expect(stored).toContain(pack?.key);
      expect(stored).toContain(`${(pack?.key ?? '').slice(0, -'.pack'.length)}.idx`);
    }, 60_000);

    it('should fetch the stored index rather than deriving one, one extra read per pack (D33)', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });

      const reads: string[] = [];
      const counted = countingStore(store, reads);
      const lease = await hydrateLease({ store: counted, locator, parentDirectory: scratch('lease') });

      // One GET for the pack and one for its index; nothing is derived.
      expect(reads.filter((key) => key.endsWith('.pack'))).toHaveLength(1);
      expect(reads.filter((key) => key.endsWith('.idx'))).toHaveLength(1);
      expect(git(lease.directory, 'fsck', '--strict').trim()).toBe('');
      expect(git(lease.directory, 'rev-parse', 'refs/heads/main').trim()).toBe(
        git(client.directory, 'rev-parse', 'main').trim(),
      );
      await lease.dispose();
    }, 60_000);

    it('should use a stored pack index instead of deriving one when the manifest says so', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });
      const committed = await readManifest(locator);
      const pack = committed?.packs[0];
      if (committed === undefined || pack === undefined) {
        throw new Error('unreachable: the push committed a pack');
      }

      // Put the derived index beside the pack and say so in the manifest: the
      // stored-index path the north star reserves for large packs.
      const source = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      const indexFile = path.join(
        source.directory,
        'objects/pack',
        `${path.posix.basename(pack.key).slice(0, -'.pack'.length)}.idx`,
      );
      const index = new Uint8Array(readFileSync(indexFile));
      await store.putObject(locator, `${pack.key.slice(0, -'.pack'.length)}.idx`, index, {
        contentLength: index.byteLength,
        sha256: createHash('sha256').update(index).digest('base64'),
      });
      await source.dispose();
      const withStoredIndex = succeedManifest(committed, {
        refs: committed.refs,
        packs: [{ ...pack, indexStored: true }],
        retired: [],
        committedBy,
      });
      const token = await store.readManifest(locator);
      await store.commitManifest(locator, encodeManifest(withStoredIndex), token?.token ?? 'absent');

      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });

      expect(readdirSync(path.join(lease.directory, 'objects/pack')).sort()).toStrictEqual([
        `${path.posix.basename(pack.key).slice(0, -'.pack'.length)}.idx`,
        path.posix.basename(pack.key),
      ]);
      expect(git(lease.directory, 'fsck', '--strict').trim()).toBe('');
      expect(git(lease.directory, 'rev-parse', 'refs/heads/main').trim()).toBe(
        git(client.directory, 'rev-parse', 'main').trim(),
      );
      await lease.dispose();
    }, 60_000);

    it('should refuse to hydrate a tombstoned repository', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });
      await commitTombstone({ store, locator, committedBy });

      await expect(hydrateLease({ store, locator, parentDirectory: scratch('lease') })).rejects.toThrow(
        expect.objectContaining({ code: 'tombstoned' }) as unknown as Error,
      );
    }, 60_000);
  });

  // === races =============================================================

  describe('races (I2)', () => {
    it('should resolve eight concurrent committers to exactly one winner', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });
      client.revise(2);

      const leases = await Promise.all(
        Array.from({ length: 8 }, async () => hydrateLease({ store, locator, parentDirectory: scratch('lease') })),
      );
      for (const lease of leases) {
        push(client.directory, lease.directory, ['main']);
      }

      const outcomes = await Promise.allSettled(
        leases.map(async (lease) => commitLease({ store, lease, committedBy })),
      );

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      const losses = outcomes.filter((outcome) => outcome.status === 'rejected');
      expect(losses).toHaveLength(7);
      for (const loss of losses) {
        expect(loss.reason).toMatchObject({ code: 'lost' });
      }
      const manifest = await readManifest(locator);
      expect(manifest?.generation).toBe(2);
      await Promise.all(leases.map(async (lease) => lease.dispose()));
    }, 120_000);

    it('should report a win when the store said lost but the bytes it committed are the stored bytes', async () => {
      const locator = newRepository();
      const client = newClient();
      // The AWS SDK retries a PUT on a transport error: the first attempt lands
      // and the retry fails its own precondition, so the driver answers `lost`
      // for a commit that succeeded (W1 hand-off).
      const retried = wrapStore(store, {
        commitManifest: async (target, next, expected) => {
          await store.commitManifest(target, next, expected);
          return 'lost';
        },
      });

      const lease = await hydrateLease({ store: retried, locator, parentDirectory: scratch('lease') });
      push(client.directory, lease.directory, ['main']);
      const result = await commitLease({ store: retried, lease, committedBy });

      expect(result).toMatchObject({ committed: true });
      const manifest = await readManifest(locator);
      expect(manifest?.generation).toBe(1);
      await lease.dispose();
    }, 60_000);
  });

  describe('rate-limited manifest writes (W0b)', () => {
    it('should retry the same conditional write and win when the limit clears', async () => {
      const locator = newRepository();
      const client = newClient();
      const calls = { count: 0 };
      const limited = rateLimitedStore(store, 2, calls);

      const lease = await hydrateLease({ store: limited, locator, parentDirectory: scratch('lease') });
      push(client.directory, lease.directory, ['main']);
      const outcome = await commitLease({ store: limited, lease, committedBy });

      expect(outcome).toMatchObject({ committed: true });
      expect(calls.count).toBe(3);
      const manifest = await readManifest(locator);
      expect(manifest?.generation).toBe(1);
      await lease.dispose();
    }, 60_000);

    it('should answer a lost race rather than a transport error when the retries are exhausted', async () => {
      const locator = newRepository();
      const client = newClient();
      const calls = { count: 0 };
      const limited = rateLimitedStore(store, 99, calls);

      const lease = await hydrateLease({ store: limited, locator, parentDirectory: scratch('lease') });
      push(client.directory, lease.directory, ['main']);

      await expect(commitLease({ store: limited, lease, committedBy })).rejects.toThrow(
        expect.objectContaining({ code: 'lost' }) as unknown as Error,
      );
      expect(calls.count).toBe(3);
      expect(await readManifest(locator)).toBeUndefined();
      await lease.dispose();
    }, 60_000);

    it('should treat a write that threw but landed as the win it was', async () => {
      const locator = newRepository();
      const client = newClient();
      // The write reaches the backend and the response does not reach the worker.
      const flaky = wrapStore(store, {
        commitManifest: async (target, next, expected) => {
          await store.commitManifest(target, next, expected);
          throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
        },
      });

      const lease = await hydrateLease({ store: flaky, locator, parentDirectory: scratch('lease') });
      push(client.directory, lease.directory, ['main']);
      const outcome = await commitLease({ store: flaky, lease, committedBy });

      expect(outcome).toMatchObject({ committed: true });
      const manifest = await readManifest(locator);
      expect(manifest?.generation).toBe(1);
      await lease.dispose();
    }, 60_000);
  });

  // === ABA (AR-A E7) =====================================================

  describe('ETag ABA (AR-A E7)', () => {
    it('should never write byte-identical manifests across two incarnations of one project id', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });
      const first = await store.readManifest(locator);

      // Delete and re-register the same project id: the generation restarts at 1
      // and a deterministic re-push reproduces identical refs and pack bytes.
      await commitTombstone({ store, locator, committedBy });
      await driver.deleteEntirePrefixForPurgeJob({
        namespace: 'tenants',
        keyPrefix: `${locator.ownerId}/`,
        tier: 'private',
      });
      await pushAndCommit({ locator, client: client.directory });
      const second = await store.readManifest(locator);

      expect(decodeManifest(second?.manifest ?? new Uint8Array()).generation).toBe(1);
      expect(second?.token.token).not.toBe(first?.token.token);
      expect(decodeManifest(second?.manifest ?? new Uint8Array()).incarnation).not.toBe(
        decodeManifest(first?.manifest ?? new Uint8Array()).incarnation,
      );
    }, 120_000);

    it('should refuse a commit whose incarnation is no longer the stored one', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      client.revise(2);
      push(client.directory, lease.directory, ['main']);

      // A purge and re-registration between hydrate and commit: same key, same
      // generation, different incarnation. The ETag alone cannot see it.
      const current = await readManifest(locator);
      const reborn: Manifest = succeedManifest(undefined, {
        refs: current?.refs ?? {},
        packs: current?.packs ?? [],
        retired: [],
        committedBy,
      });
      await store.commitManifest(locator, encodeManifest(reborn), lease.token === 'absent' ? 'absent' : lease.token);

      await expect(commitLease({ store, lease, committedBy })).rejects.toThrow(
        expect.objectContaining({ code: 'incarnation-changed' }) as unknown as Error,
      );
      await lease.dispose();
    }, 60_000);
  });

  // === compaction and sweep ==============================================

  describe('compaction (D6, D16)', () => {
    const buildManyPacks = async (args: {
      locator: RepositoryLocator;
      client: ReturnType<typeof newClient>;
      count: number;
    }): Promise<void> => {
      const { locator, client, count } = args;
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      for (let revision = 2; revision <= count + 1; revision += 1) {
        client.revise(revision);
        push(client.directory, lease.directory, ['main']);
      }
      await commitLease({ store, lease, committedBy, packBound: Number.POSITIVE_INFINITY });
      await lease.dispose();
    };

    it('should restore the pack bound, retire what it replaced and keep fsck --strict clean', async () => {
      const locator = newRepository();
      const client = newClient();
      await buildManyPacks({ locator, client, count: livePackBound });
      const before = await readManifest(locator);
      expect(before?.packs).toHaveLength(livePackBound);
      const keptKey = [...(before?.packs ?? [])].sort((left, right) => right.bytes - left.bytes)[0]?.key;

      client.revise(1000);
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      push(client.directory, lease.directory, ['main']);
      const outcome = await commitLease({ store, lease, committedBy });

      expect(outcome).toMatchObject({ committed: true, compacted: true });
      const after = await readManifest(locator);
      // The bound is restored: the kept pack plus the pack that consolidates the rest.
      expect(after?.packs).toHaveLength(2);
      expect(after?.packs.map((pack) => pack.key)).toContain(keptKey);
      expect(after?.retired.map((entry) => entry.key).sort()).toStrictEqual(
        (before?.packs ?? [])
          .map((pack) => pack.key)
          .filter((key) => key !== keptKey)
          .sort(),
      );
      expect(git(lease.directory, 'fsck', '--strict').trim()).toBe('');
      await lease.dispose();

      const rehydrated = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      expect(git(rehydrated.directory, 'fsck', '--strict').trim()).toBe('');
      expect(packsOf(rehydrated.directory)).toHaveLength(2);
      await rehydrated.dispose();
    }, 180_000);

    it('should keep the largest pack, upload only the consolidated tail and retire the rest (D33)', async () => {
      const locator = newRepository();
      const client = newClient();
      // The realistic shape W0a measured: one large base pack, then turn-end packs.
      writeFileSync(path.join(client.directory, 'base.bin'), randomBytes(256 * 1024));
      git(client.directory, 'add', '.');
      git(client.directory, 'commit', '--quiet', '-m', 'base');
      await pushAndCommit({ locator, client: client.directory });
      await buildManyPacks({ locator, client, count: livePackBound });
      const before = await readManifest(locator);
      const base = [...(before?.packs ?? [])].sort((left, right) => right.bytes - left.bytes)[0];
      expect(before?.packs.length).toBeGreaterThan(livePackBound);
      expect(base?.bytes).toBeGreaterThan(200 * 1024);

      client.revise(1000);
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      push(client.directory, lease.directory, ['main']);
      const outcome = await commitLease({ store, lease, committedBy });

      expect(outcome).toMatchObject({ committed: true, compacted: true });
      const after = await readManifest(locator);
      // The base pack survived untouched: still live, never retired, never re-uploaded.
      expect(after?.packs.map((pack) => pack.key)).toContain(base?.key);
      expect(after?.packs).toHaveLength(2);
      expect(after?.retired.map((entry) => entry.key)).not.toContain(base?.key);
      expect(after?.retired).toHaveLength((before?.packs.length ?? 0) - 1);
      // Only the small consolidated pack was uploaded.
      const uploaded = after?.packs.find((pack) => pack.key !== base?.key);
      expect(uploaded?.bytes).toBeLessThan(base?.bytes ?? 0);
      expect(git(lease.directory, 'fsck', '--strict').trim()).toBe('');
      await lease.dispose();

      const rehydrated = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      expect(git(rehydrated.directory, 'fsck', '--strict').trim()).toBe('');
      await rehydrated.dispose();
    }, 180_000);

    it('should hydrate a repository at the pack bound and record the cost', async () => {
      const locator = newRepository();
      const client = newClient();
      await buildManyPacks({ locator, client, count: livePackBound });

      const started = performance.now();
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      const elapsed = performance.now() - started;

      recordMeasurement(`hydrate at the ruled pack bound (${String(livePackBound)} packs): ${elapsed.toFixed(0)} ms`);
      expect(packsOf(lease.directory).length).toBeGreaterThanOrEqual(livePackBound);
      expect(git(lease.directory, 'fsck', '--strict').trim()).toBe('');
      await lease.dispose();
    }, 180_000);
  });

  describe('deletion rules and the in-lease sweep (NI4, AR-A E8)', () => {
    /**
     * A repository whose next compaction genuinely retires something: a large
     * base pack that `--keep-pack` will preserve, and a small one it will roll
     * into the consolidated pack and retire.
     */
    const buildRetiringShape = async (
      locator: RepositoryLocator,
      client: ReturnType<typeof newClient>,
    ): Promise<{ base: string; small: string }> => {
      writeFileSync(path.join(client.directory, 'base.bin'), randomBytes(256 * 1024));
      git(client.directory, 'add', '.');
      git(client.directory, 'commit', '--quiet', '-m', 'base');
      await pushAndCommit({ locator, client: client.directory });
      client.revise(2);
      await pushAndCommit({ locator, client: client.directory });

      const manifest = await readManifest(locator);
      const sorted = [...(manifest?.packs ?? [])].sort((left, right) => right.bytes - left.bytes);
      const base = sorted[0]?.key;
      const small = sorted[1]?.key;
      if (base === undefined || small === undefined) {
        throw new Error('unreachable: two packs were committed');
      }
      return { base, small };
    };

    it('should never delete a key the manifest it just committed names', async () => {
      const locator = newRepository();
      const client = newClient();
      const retiring = await buildRetiringShape(locator, client);

      client.revise(3);
      const outcome = await pushAndCommit({
        locator,
        client: client.directory,
        refspecs: ['main'],
        overrides: {
          packBound: 1,
          now: () => new Date(Date.now() + orphanThresholdMilliseconds * 2),
        },
      });

      expect(outcome).toMatchObject({ committed: true, compacted: true });
      const after = await readManifest(locator);
      const stored = await listPacks(locator);
      for (const pack of after?.packs ?? []) {
        expect(stored).toContain(pack.key);
      }
      // The retired key is inside its window, so the sweep left it alone.
      expect(after?.retired.map((entry) => entry.key)).toContain(retiring.small);
      expect(stored).toContain(retiring.small);
      expect(after?.packs.map((pack) => pack.key)).toContain(retiring.base);
    }, 120_000);

    it('should leave an orphan younger than the threshold and remove it once it is older', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });

      // A worker that died after its pack upload leaves a key no manifest names.
      const orphan = 'packs/pack-orphaned-deadbeef.pack';
      await putOrphan(locator, orphan);

      client.revise(2);
      await pushAndCommit({ locator, client: client.directory, refspecs: ['main'], overrides: { packBound: 1 } });
      expect(await listPacks(locator)).toContain(orphan);

      client.revise(3);
      await pushAndCommit({
        locator,
        client: client.directory,
        refspecs: ['main'],
        overrides: {
          packBound: 1,
          now: () => new Date(Date.now() + orphanThresholdMilliseconds + 60_000),
        },
      });

      expect(await listPacks(locator)).not.toContain(orphan);
    }, 120_000);

    it('should delete a retired key only after the retention window has passed', async () => {
      const locator = newRepository();
      const client = newClient();
      const retiring = await buildRetiringShape(locator, client);
      const original = retiring.small;

      client.revise(3);
      await pushAndCommit({ locator, client: client.directory, refspecs: ['main'], overrides: { packBound: 1 } });
      const second = await readManifest(locator);
      expect(second?.retired.map((entry) => entry.key)).toContain(original);
      expect(await listPacks(locator)).toContain(original);

      client.revise(4);
      await pushAndCommit({
        locator,
        client: client.directory,
        refspecs: ['main'],
        overrides: {
          packBound: 1,
          now: () => new Date(Date.now() + retentionWindowMilliseconds + 60_000),
        },
      });

      const after = await readManifest(locator);
      expect(after?.retired.map((entry) => entry.key)).not.toContain(original);
      // The pack and the index stored beside it go together (D33).
      expect(await listPacks(locator)).not.toContain(original);
      expect(await listPacks(locator)).not.toContain(`${original.slice(0, -'.pack'.length)}.idx`);
    }, 120_000);

    it('should keep the manifest readable through every sweep', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });
      client.revise(2);
      await pushAndCommit({
        locator,
        client: client.directory,
        refspecs: ['main'],
        overrides: {
          packBound: 1,
          now: () => new Date(Date.now() + retentionWindowMilliseconds * 2),
        },
      });

      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      expect(git(lease.directory, 'fsck', '--strict').trim()).toBe('');
      await lease.dispose();
    }, 120_000);
  });

  // === fault injection ===================================================

  describe('fault points (I1, I2, I3)', () => {
    const crashAt = (point: FaultPoint) => (reached: FaultPoint) => {
      if (reached === point) {
        throw new Error(`simulated worker crash at ${point}`);
      }
    };

    it('should name a crash point at every step of the write path', () => {
      expect([...faultPoints]).toStrictEqual([
        'after-pack-upload',
        'before-manifest-commit',
        'after-manifest-commit',
        'mid-compaction',
        'mid-sweep',
      ]);
    });

    it.each(['after-pack-upload', 'before-manifest-commit'] as const)(
      'should acknowledge nothing and advance no ref when the worker dies at %s (I1)',
      async (point) => {
        const locator = newRepository();
        const client = newClient();
        await pushAndCommit({ locator, client: client.directory });
        const before = await readManifest(locator);

        client.revise(2);
        const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
        push(client.directory, lease.directory, ['main']);
        await expect(commitLease({ store, lease, committedBy, faults: crashAt(point) })).rejects.toThrow(
          /simulated worker crash/u,
        );

        const after = await readManifest(locator);
        expect(after?.generation).toBe(before?.generation);
        expect(after?.refs).toStrictEqual(before?.refs);
        // Whatever the dead worker uploaded is under a key no manifest names (I3).
        const stored = await listPacks(locator);
        for (const key of after?.packs.map((pack) => pack.key) ?? []) {
          expect(stored).toContain(key);
        }
        await lease.dispose();
      },
      120_000,
    );

    it('should leave a durable, complete repository when the worker dies after the commit (I1, I3)', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });

      client.revise(2);
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      push(client.directory, lease.directory, ['main']);
      await expect(
        commitLease({ store, lease, committedBy, faults: crashAt('after-manifest-commit') }),
      ).rejects.toThrow(/simulated worker crash/u);
      await lease.dispose();

      const manifest = await readManifest(locator);
      expect(manifest?.generation).toBe(2);
      const stored = await listPacks(locator);
      for (const pack of manifest?.packs ?? []) {
        expect(stored).toContain(pack.key);
      }
      const rehydrated = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      expect(git(rehydrated.directory, 'fsck', '--strict').trim()).toBe('');
      // The client's retry finds its own commit already advertised: a no-op.
      expect(push(client.directory, rehydrated.directory, ['main']).ok).toBe(true);
      expect(git(rehydrated.directory, 'rev-parse', 'refs/heads/main').trim()).toBe(
        git(client.directory, 'rev-parse', 'main').trim(),
      );
      await rehydrated.dispose();
    }, 120_000);

    it('should leave the previous packs live and listed when the worker dies mid-compaction (I3)', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });
      client.revise(2);
      await pushAndCommit({ locator, client: client.directory });
      const before = await readManifest(locator);

      client.revise(3);
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      push(client.directory, lease.directory, ['main']);
      await expect(
        commitLease({ store, lease, committedBy, packBound: 1, faults: crashAt('mid-compaction') }),
      ).rejects.toThrow(/simulated worker crash/u);
      await lease.dispose();

      expect(await readManifest(locator)).toStrictEqual(before);
      const stored = await listPacks(locator);
      for (const pack of before?.packs ?? []) {
        expect(stored).toContain(pack.key);
      }
      const rehydrated = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      expect(git(rehydrated.directory, 'fsck', '--strict').trim()).toBe('');
      await rehydrated.dispose();
    }, 120_000);

    it('should answer the client even when the sweep fails after a durable commit (I1)', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });
      const orphan = 'packs/pack-unsweepable-0123456789ab.pack';
      await putOrphan(locator, orphan);
      client.revise(2);

      // Deleting fails; the manifest is already durable, so the push is not.
      const brokenSweep = wrapStore(store, {
        deleteObjects: async () => {
          throw new Error('storage refused the delete');
        },
      });
      const lease = await hydrateLease({ store: brokenSweep, locator, parentDirectory: scratch('lease') });
      push(client.directory, lease.directory, ['main']);
      const outcome = await commitLease({
        store: brokenSweep,
        lease,
        committedBy,
        packBound: 1,
        now: () => new Date(Date.now() + orphanThresholdMilliseconds * 2),
      });

      expect(outcome).toMatchObject({ committed: true, swept: [] });
      const manifest = await readManifest(locator);
      expect(manifest?.generation).toBe(2);
      // The garbage is still there; the next compacting committer will take it.
      expect(await listPacks(locator)).toContain(orphan);
      await lease.dispose();
    }, 120_000);

    it('should leave a complete repository when the worker dies mid-sweep (I3)', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });
      client.revise(2);

      // A pack no manifest ever named, old enough for the sweep to claim it.
      await putOrphan(locator, 'packs/pack-swept-0123456789ab.pack');

      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      push(client.directory, lease.directory, ['main']);
      // A crash inside the sweep is not a failed push: the manifest is durable
      // before the first DELETE, so the client is told the truth and the
      // garbage waits for the next compacting committer.
      await expect(
        commitLease({
          store,
          lease,
          committedBy,
          packBound: 1,
          now: () => new Date(Date.now() + retentionWindowMilliseconds * 2),
          faults: crashAt('mid-sweep'),
        }),
      ).resolves.toMatchObject({ committed: true, swept: [] });
      await lease.dispose();

      // The sweep runs after the commit, so the manifest is durable and every
      // key it names is present however far the deletes got.
      const manifest = await readManifest(locator);
      expect(manifest?.generation).toBe(2);
      const stored = await listPacks(locator);
      for (const pack of manifest?.packs ?? []) {
        expect(stored).toContain(pack.key);
      }
      const rehydrated = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      expect(git(rehydrated.directory, 'fsck', '--strict').trim()).toBe('');
      await rehydrated.dispose();
    }, 120_000);

    it('should abandon a push whose commit deadline has passed without touching the manifest', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });
      const before = await store.readManifest(locator);

      client.revise(2);
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      push(client.directory, lease.directory, ['main']);
      await expect(commitLease({ store, lease, committedBy, deadlineAt: Date.now() - 1 })).rejects.toThrow(
        expect.objectContaining({ code: 'deadline' }) as unknown as Error,
      );

      const unchanged = await store.readManifest(locator);
      expect(unchanged?.token.token).toBe(before?.token.token);
      await lease.dispose();
    }, 120_000);
  });

  // === tombstone (D10, NI12) =============================================

  describe('tombstone (D10, NI12)', () => {
    it('should fence every writer and refuse a re-registration of the same project id', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });
      const inFlight = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      client.revise(2);
      push(client.directory, inFlight.directory, ['main']);

      const tombstoned = await commitTombstone({ store, locator, committedBy });

      expect(tombstoned.manifest.tombstone?.purgeAfter).toBeDefined();
      // The in-flight writer's token is stale: it loses rather than resurrecting the repository.
      await expect(commitLease({ store, lease: inFlight, committedBy })).rejects.toThrow(
        expect.objectContaining({ code: 'lost' }) as unknown as Error,
      );
      await inFlight.dispose();

      // Delete then re-register with the same project id, before purge.
      await expect(hydrateLease({ store, locator, parentDirectory: scratch('lease') })).rejects.toThrow(
        expect.objectContaining({ code: 'tombstoned' }) as unknown as Error,
      );
      const created = await store.commitManifest(
        locator,
        encodeManifest(succeedManifest(undefined, { refs: {}, packs: [], retired: [], committedBy })),
        'absent',
      );
      expect(created).toBe('lost');
    }, 120_000);

    it('should purge immediately when erasure is verified', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });

      const tombstoned = await commitTombstone({ store, locator, committedBy, erasureVerified: true });

      expect(tombstoned.manifest.tombstone?.purgeAfter).toBe(tombstoned.manifest.tombstone?.tombstonedAt);
    }, 60_000);

    it('should refuse a commit into a repository tombstoned under the lease', async () => {
      const locator = newRepository();
      const client = newClient();
      await pushAndCommit({ locator, client: client.directory });
      const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
      client.revise(2);
      push(client.directory, lease.directory, ['main']);
      const token: CommitToken | 'absent' = lease.token;

      await commitTombstone({ store, locator, committedBy });

      await expect(commitLease({ store, lease, committedBy })).rejects.toThrow(RepositoryStoreError);
      expect(token).not.toBe('absent');
      await lease.dispose();
    }, 120_000);
  });
});
