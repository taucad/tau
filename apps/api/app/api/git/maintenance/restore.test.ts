import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getEnvironment } from '#config/environment.config.js';
import { assertDestructiveTestBucketAllowed } from '#storage/destructive-test-bucket-guard.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { StorageModule } from '#storage/storage.module.js';
import { commitLease, commitTombstone } from '#api/git/store/commit.js';
import { hydrateLease } from '#api/git/store/lease.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { decodeManifest } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';
import type { RepositoryLocator } from '#api/git/store/port.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import { restoreRepository } from '#api/git/maintenance/restore.js';

/**
 * S6/S10, proven locally: a repository is rebuilt into the primary from a
 * manifest and the packs it names held in a **second bucket alone**, with a
 * fresh incarnation and a higher generation, and the primary's own bytes are
 * never removed. The same code DG1 points at B2; only the source account
 * changes.
 *
 * The source bucket is `tau-content-restore` on the same local MinIO. W8 adds
 * it to `infra/docker-compose.yml`'s bootstrap; until then this suite creates
 * it, which is idempotent.
 */

// === harness =============================================================

const restoreBucket = 'tau-content-restore';

const scratchDirectories: string[] = [];

const scratch = (label: string): string => {
  const directory = mkdtempSync(path.join(tmpdir(), `tau-w6-${label}-`));
  scratchDirectories.push(directory);
  return directory;
};

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
const admitted = (): NodeJS.ProcessEnv => {
  const environment: Record<string, string> = {
    PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    HOME: tmpdir(),
    LANG: 'C',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    TAU_GIT_PUSH_ADMITTED: '1',
  };
  return environment as NodeJS.ProcessEnv;
};
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

const git = (cwd: string, ...args: readonly string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** A client repository with `main` and an annotated tag, the shape a Tau project pushes. */
const newClient = (): { directory: string; revise: (n: number) => void } => {
  const directory = scratch('client');
  git(directory, 'init', '--quiet', '--initial-branch=main', '.');
  git(directory, 'config', 'user.name', 'W6');
  git(directory, 'config', 'user.email', 'w6@tau.test');
  const revise = (n: number): void => {
    writeFileSync(path.join(directory, 'main.scad'), `cube(${String(n)});\n`);
    git(directory, 'add', '.');
    git(directory, 'commit', '--quiet', '-m', `rev ${String(n)}`);
  };
  revise(1);
  git(directory, 'tag', '-a', 'v1', '-m', 'v1');
  return { directory, revise };
};

describe('repository restore from a second bucket', () => {
  let moduleRef: TestingModule;
  let primaryDriver: ObjectStorageService;
  let sourceDriver: ObjectStorageService;
  let primary: S3RepositoryStore;
  let source: S3RepositoryStore;
  const written: RepositoryLocator[] = [];

  const newRepository = (): RepositoryLocator => {
    const locator = repositoryLocator({
      ownerId: `user-w6-${randomBytes(6).toString('hex')}`,
      projectId: `proj-${randomBytes(6).toString('hex')}`,
    });
    written.push(locator);
    return locator;
  };

  /** Pushes `client` into a lease over `store` and commits it, as the write path does. */
  const pushAndCommit = async (store: S3RepositoryStore, locator: RepositoryLocator, client: string): Promise<void> => {
    const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
    try {
      execFileSync('git', ['push', lease.directory, 'main', 'v1'], {
        cwd: client,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: admitted(),
      });
      await commitLease({ store, lease, committedBy: 'user_w6' });
    } finally {
      await lease.dispose();
    }
  };

  const readManifest = async (store: S3RepositoryStore, locator: RepositoryLocator): Promise<Manifest | undefined> => {
    const read = await store.readManifest(locator);
    return read === undefined ? undefined : decodeManifest(read.manifest);
  };

  const packKeys = async (store: S3RepositoryStore, locator: RepositoryLocator): Promise<string[]> => {
    const keys: string[] = [];
    for await (const object of store.listObjects(locator, 'packs/')) {
      keys.push(object.key);
    }
    return keys.sort();
  };

  /** `for-each-ref` over a lease hydrated from `store`, plus a strict fsck. */
  const hydrateAndVerify = async (store: S3RepositoryStore, locator: RepositoryLocator): Promise<string> => {
    const lease = await hydrateLease({ store, locator, parentDirectory: scratch('verify') });
    try {
      git(lease.directory, 'fsck', '--strict', '--no-progress');
      return git(lease.directory, 'for-each-ref', '--format=%(refname) %(objectname) %(*objectname)');
    } finally {
      await lease.dispose();
    }
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }), StorageModule],
    }).compile();

    primaryDriver = moduleRef.get(ObjectStorageService);
    assertDestructiveTestBucketAllowed(primaryDriver.bucketFor('private'), 'the W6 restore suite');

    const client = new S3Client({
      region: primaryDriver.account.region,
      endpoint: primaryDriver.account.endpoint,
      forcePathStyle: primaryDriver.account.forcePathStyle,
      credentials: primaryDriver.account.credentials,
    });
    try {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- the S3 wire shape
      await client.send(new CreateBucketCommand({ Bucket: restoreBucket }));
    } catch {
      // Already there: the bucket is the suite's precondition, not its subject.
    } finally {
      client.destroy();
    }

    sourceDriver = primaryDriver.forAccount({
      ...primaryDriver.account,
      id: 'tau-restore-source',
      bucket: restoreBucket,
    });
    primary = new S3RepositoryStore(primaryDriver);
    source = new S3RepositoryStore(sourceDriver);
  }, 60_000);

  afterAll(async () => {
    /*
     * The primary is an allowlisted disposable bucket, so its prefixes go in one
     * call. `tau-content-restore` is not on D32's allowlist — it is created by
     * this suite and W8 adds it to the compose bootstrap — so the source side is
     * cleaned key by key through the port instead of by prefix.
     */
    await Promise.all(
      written.map(async (locator) =>
        primaryDriver.deleteEntirePrefixForPurgeJob({
          namespace: 'tenants',
          keyPrefix: `${locator.ownerId}/`,
          tier: 'private',
        }),
      ),
    );
    await Promise.all(
      written.map(async (locator) => {
        const keys = ['manifest.json', ...(await packKeys(source, locator))];
        await source.deleteObjects(locator, keys);
      }),
    );
    for (const directory of scratchDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it('should rebuild a repository into an empty primary from the source bucket alone', async () => {
    const locator = newRepository();
    const client = newClient();
    await pushAndCommit(source, locator, client.directory);
    const sourceManifest = await readManifest(source, locator);

    const result = await restoreRepository({ source, primary, locator, operator: 'rifont' });

    expect(await readManifest(primary, locator)).toStrictEqual(result.manifest);
    expect(result.manifest.generation).toBe((sourceManifest?.generation ?? 0) + 1);
    expect(result.manifest.incarnation).not.toBe(sourceManifest?.incarnation);
    expect(result.manifest.committedBy).toBe('restore:rifont');
    expect(result.manifest.retired).toStrictEqual([]);
    expect(result.manifest.refs).toStrictEqual(sourceManifest?.refs);
    expect(await hydrateAndVerify(primary, locator)).toBe(await hydrateAndVerify(source, locator));
  }, 120_000);

  it('should roll a populated primary forward without deleting its own bytes', async () => {
    const locator = newRepository();
    const sourceClient = newClient();
    sourceClient.revise(2);
    sourceClient.revise(3);
    await pushAndCommit(source, locator, sourceClient.directory);
    const sourceManifest = await readManifest(source, locator);

    const primaryClient = newClient();
    await pushAndCommit(primary, locator, primaryClient.directory);
    const before = await readManifest(primary, locator);
    const bytesBefore = await packKeys(primary, locator);

    const result = await restoreRepository({ source, primary, locator, operator: 'rifont' });

    expect(result.manifest.generation).toBe(Math.max(before?.generation ?? 0, sourceManifest?.generation ?? 0) + 1);
    expect(result.manifest.incarnation).not.toBe(before?.incarnation);
    expect(result.manifest.incarnation).not.toBe(sourceManifest?.incarnation);
    expect(result.manifest.refs).toStrictEqual(sourceManifest?.refs);
    // The primary's superseded packs are still there: restore never deletes (NI4).
    expect(await packKeys(primary, locator)).toStrictEqual(expect.arrayContaining(bytesBefore));
    expect(await hydrateAndVerify(primary, locator)).toBe(await hydrateAndVerify(source, locator));
  }, 120_000);

  it('should write the restored packs under fresh keys the source never used', async () => {
    const locator = newRepository();
    await pushAndCommit(source, locator, newClient().directory);
    const sourceManifest = await readManifest(source, locator);

    const result = await restoreRepository({ source, primary, locator, operator: 'rifont' });

    const sourceKeys = new Set((sourceManifest?.packs ?? []).map((pack) => pack.key));
    const primaryKeys = new Set(await packKeys(primary, locator));
    for (const pack of result.manifest.packs) {
      expect(sourceKeys.has(pack.key)).toBe(false);
      // W2's committer stores an index beside every pack, so the restore carries it.
      expect(pack.indexStored).toBe(true);
      expect(primaryKeys.has(`${pack.key.slice(0, -'.pack'.length)}.idx`)).toBe(true);
    }
  }, 120_000);

  it('should refuse a source pack whose bytes do not match its key', async () => {
    const locator = newRepository();
    await pushAndCommit(source, locator, newClient().directory);
    const sourceManifest = await readManifest(source, locator);
    const corrupted = sourceManifest?.packs[0]?.key ?? '';
    const body = new Uint8Array(new ArrayBuffer(32));

    await sourceDriver.putBlob({
      namespace: 'tenants',
      key: `${locator.ownerId}/repos/${locator.projectId}/${corrupted}`,
      body,
      contentType: 'application/octet-stream',
      tier: 'private',
      checksumSha256: createHash('sha256').update(body).digest('base64'),
    });

    await expect(restoreRepository({ source, primary, locator, operator: 'rifont' })).rejects.toThrow(corrupted);
    expect(await readManifest(primary, locator)).toBeUndefined();
  }, 120_000);

  it('should refuse to restore over a tombstoned primary', async () => {
    const locator = newRepository();
    await pushAndCommit(source, locator, newClient().directory);
    const primaryClient = newClient();
    await pushAndCommit(primary, locator, primaryClient.directory);
    await commitTombstone({ store: primary, locator, committedBy: 'test' });

    await expect(restoreRepository({ source, primary, locator, operator: 'rifont' })).rejects.toThrow(/tombstoned/u);
  }, 120_000);
});
