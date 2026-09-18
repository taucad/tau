import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PinoLogger } from 'nestjs-pino';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { getEnvironment } from '#config/environment.config.js';
import type { Environment } from '#config/environment.config.js';
import { DatabaseService } from '#database/database.service.js';
import { project, projectGit, projectGitLfsObject, user } from '#database/schema.js';
import * as schema from '#database/schema.js';
import { assertDestructiveTestBucketAllowed } from '#storage/destructive-test-bucket-guard.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { StorageModule } from '#storage/storage.module.js';
import { gitLfsObjectKey } from '#api/git/git.constants.js';
import { commitLease } from '#api/git/store/commit.js';
import { hydrateLease } from '#api/git/store/lease.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import type { RepositoryLocator } from '#api/git/store/port.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import type { GitAccess, GitRepositoryService } from '#api/git/git.service.js';
import { GitLfsService } from '#api/git/git-lfs.service.js';
import { relocateLegacyLfsObjects, tenantLfsObjectKey } from '#api/git/lfs-keys.js';
import { retireDueLfsObjects, retireLfsObjects } from '#api/git/lfs-retirement.js';

/**
 * D18: an object is retired only when its unreachable mark is older than the
 * window *and* a fresh walk of the repository still does not reach it, and the
 * delete serializes on the owner lock. Plus D24's key move: new bytes land
 * under the tenant prefix, legacy bytes are read where they are and relocated
 * once.
 *
 * Real MinIO, real git and a real PostgreSQL; needs `pnpm infra:up` and a
 * migrated database.
 */

// === harness =============================================================

const databaseUrl = process.env.DATABASE_URL;

const retentionWindowMilliseconds = 30 * 24 * 60 * 60 * 1000;

const scratchDirectories: string[] = [];

const scratch = (label: string): string => {
  const directory = mkdtempSync(path.join(tmpdir(), `tau-w4b-${label}-`));
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

/**
 * Every fixture child runs with the same isolation a lease's children get: a
 * developer's global `commit.gpgsign` would otherwise make `git commit` block
 * on a passphrase prompt here.
 */
const git = (cwd: string, ...args: readonly string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: admitted() });

/** A git-lfs pointer blob and the bytes it stands for. */
const pointerFor = (content: string): { text: string; oid: string; size: number; body: Uint8Array<ArrayBuffer> } => {
  const bytes = Buffer.from(content, 'utf8');
  const oid = createHash('sha256').update(bytes).digest('hex');
  return {
    text: `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${String(bytes.byteLength)}\n`,
    oid,
    size: bytes.byteLength,
    body: Uint8Array.from(bytes),
  };
};

describe('LFS retirement through a lease', () => {
  let moduleRef: TestingModule;
  let driver: ObjectStorageService;
  let store: S3RepositoryStore;
  let client: postgres.Sql;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const owners: string[] = [];

  const deps = (): Parameters<typeof retireLfsObjects>[0] => ({
    database,
    store,
    storage: driver,
    leaseParentDirectory: scratch('retire'),
  });

  const newProject = async (): Promise<RepositoryLocator> => {
    const ownerId = `user-w4r-${randomBytes(6).toString('hex')}`;
    const projectId = `proj-${randomBytes(6).toString('hex')}`;
    owners.push(ownerId);
    await database.insert(user).values({ id: ownerId, name: 'W4b', email: `${ownerId}@tau.test` });
    await database.insert(project).values({ id: projectId, ownerId, name: 'retirement' });
    await database.insert(projectGit).values({ projectId });
    return repositoryLocator({ ownerId, projectId });
  };

  /** A finalized object with its bytes at the tenant key and a chosen mark. */
  const seedObject = async (
    locator: RepositoryLocator,
    object: { oid: string; size: number; body: Uint8Array<ArrayBuffer> },
    unreachableAt: Date | undefined,
  ): Promise<void> => {
    await driver.putBlob({
      namespace: 'tenants',
      key: tenantLfsObjectKey(locator.ownerId, locator.projectId, object.oid),
      body: object.body,
      contentType: 'application/octet-stream',
      tier: 'private',
    });
    await database.insert(projectGitLfsObject).values({
      projectId: locator.projectId,
      oid: object.oid,
      sizeBytes: object.size,
      finalizedAt: new Date(),
      unreachableAt: unreachableAt ?? null,
    });
    await database.update(projectGit).set({ lfsBytes: object.size }).where(eq(projectGit.projectId, locator.projectId));
  };

  const rowFor = async (
    locator: RepositoryLocator,
    oid: string,
  ): Promise<typeof projectGitLfsObject.$inferSelect | undefined> =>
    database.query.projectGitLfsObject.findFirst({
      where: and(eq(projectGitLfsObject.projectId, locator.projectId), eq(projectGitLfsObject.oid, oid)),
    });

  const tenantBytes = async (locator: RepositoryLocator, oid: string): Promise<number | undefined> => {
    const stored = await driver.headBlob({
      namespace: 'tenants',
      key: tenantLfsObjectKey(locator.ownerId, locator.projectId, oid),
      tier: 'private',
    });
    return stored?.size;
  };

  const lfsBytesOf = async (locator: RepositoryLocator): Promise<number | undefined> => {
    const row = await database.query.projectGit.findFirst({ where: eq(projectGit.projectId, locator.projectId) });
    return row?.lfsBytes;
  };

  const newClient = (): string => {
    const directory = scratch('client');
    git(directory, 'init', '--quiet', '--initial-branch=main', '.');
    git(directory, 'config', 'user.name', 'W4b');
    git(directory, 'config', 'user.email', 'w4b@tau.test');
    return directory;
  };

  const commitAll = (directory: string, message: string): void => {
    git(directory, 'add', '--all');
    git(directory, 'commit', '--quiet', '-m', message);
  };

  const pushAndCommit = async (
    locator: RepositoryLocator,
    clientDirectory: string,
    references: readonly string[],
  ): Promise<void> => {
    const lease = await hydrateLease({ store, locator, parentDirectory: scratch('lease') });
    try {
      execFileSync('git', ['push', lease.directory, ...references], {
        cwd: clientDirectory,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: admitted(),
      });
      await commitLease({ store, lease, committedBy: 'user_w4b' });
    } finally {
      await lease.dispose();
    }
  };

  /** Server-side retention drops a revision ref; the commit records the new map. */
  const retireRevision = async (locator: RepositoryLocator, ref: string): Promise<void> => {
    const lease = await hydrateLease({ store, locator, parentDirectory: scratch('retention') });
    try {
      git(lease.directory, 'update-ref', '-d', ref);
      await commitLease({ store, lease, committedBy: 'retention' });
    } finally {
      await lease.dispose();
    }
  };

  /**
   * A project whose repository once referenced `object` and, after a second
   * push, no longer does — the state a due retirement candidate is in.
   */
  const projectWithDroppedPointer = async (
    object: ReturnType<typeof pointerFor>,
    markedAt: Date,
  ): Promise<{ locator: RepositoryLocator; clientDirectory: string }> => {
    const locator = await newProject();
    const clientDirectory = newClient();
    writeFileSync(path.join(clientDirectory, 'main.scad'), 'cube(1);\n');
    commitAll(clientDirectory, 'the revision main keeps');
    git(clientDirectory, 'switch', '--quiet', '-c', 'retired');
    writeFileSync(path.join(clientDirectory, 'part.stl'), object.text);
    commitAll(clientDirectory, 'the chat retention drops');
    await pushAndCommit(locator, clientDirectory, ['main', 'retired:refs/tau/chats/r1']);
    await retireRevision(locator, 'refs/tau/chats/r1');
    git(clientDirectory, 'switch', '--quiet', 'main');
    await seedObject(locator, object, markedAt);
    return { locator, clientDirectory };
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }), StorageModule],
    }).compile();

    driver = moduleRef.get(ObjectStorageService);
    assertDestructiveTestBucketAllowed(driver.bucketFor('private'), 'the W4b retirement suite');
    store = new S3RepositoryStore(driver);
    client = postgres(databaseUrl, { max: 1, prepare: false });
    database = drizzle(client, { schema });
  }, 60_000);

  afterAll(async () => {
    await Promise.all(
      owners.map(async (ownerId) =>
        driver.deleteEntirePrefixForPurgeJob({ namespace: 'tenants', keyPrefix: `${ownerId}/`, tier: 'private' }),
      ),
    );
    if (owners.length > 0) {
      await database.delete(user).where(inArray(user.id, owners));
    }
    await client.end();
    await moduleRef.close();
    for (const directory of scratchDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it('should delete the object and its row when the window has passed and the walk still misses it', async () => {
    const object = pointerFor('retired large object');
    const now = new Date();
    const { locator } = await projectWithDroppedPointer(
      object,
      new Date(now.getTime() - retentionWindowMilliseconds - 1),
    );

    const outcome = await retireLfsObjects(deps(), {
      ownerId: locator.ownerId,
      projectId: locator.projectId,
      now,
      window: retentionWindowMilliseconds,
    });

    expect(outcome.retired).toStrictEqual([object.oid]);
    expect(await tenantBytes(locator, object.oid)).toBeUndefined();
    expect(await rowFor(locator, object.oid)).toBeUndefined();
    expect(await lfsBytesOf(locator)).toBe(0);
  }, 120_000);

  it('should keep an object the repository reached again and clear its stale mark', async () => {
    const object = pointerFor('re-referenced large object');
    const now = new Date();
    const { locator, clientDirectory } = await projectWithDroppedPointer(
      object,
      new Date(now.getTime() - retentionWindowMilliseconds - 1),
    );

    /* The pointer comes back before the pass runs, which is the race the
       fresh walk exists to lose. */
    writeFileSync(path.join(clientDirectory, 'part.stl'), object.text);
    commitAll(clientDirectory, 'bring the pointer back');
    await pushAndCommit(locator, clientDirectory, ['main']);

    const outcome = await retireLfsObjects(deps(), {
      ownerId: locator.ownerId,
      projectId: locator.projectId,
      now,
      window: retentionWindowMilliseconds,
    });

    expect(outcome.retired).toStrictEqual([]);
    expect(await tenantBytes(locator, object.oid)).toBe(object.size);
    const row = await rowFor(locator, object.oid);
    expect(row?.unreachableAt).toBeNull();
  }, 120_000);

  it('should never retire an object an annotated tag still reaches', async () => {
    const object = pointerFor('tagged large object');
    const now = new Date();
    const locator = await newProject();
    const clientDirectory = newClient();
    writeFileSync(path.join(clientDirectory, 'part.stl'), object.text);
    commitAll(clientDirectory, 'add the pointer');
    git(clientDirectory, 'tag', '-a', 'v1', '-m', 'v1');
    unlinkSync(path.join(clientDirectory, 'part.stl'));
    commitAll(clientDirectory, 'drop it from main');
    await pushAndCommit(locator, clientDirectory, ['main', 'v1']);
    await seedObject(locator, object, new Date(now.getTime() - retentionWindowMilliseconds - 1));

    const outcome = await retireLfsObjects(deps(), {
      ownerId: locator.ownerId,
      projectId: locator.projectId,
      now,
      window: retentionWindowMilliseconds,
    });

    expect(outcome.retired).toStrictEqual([]);
    expect(await tenantBytes(locator, object.oid)).toBe(object.size);
  }, 120_000);

  it('should leave an unreachable object whose window has not passed', async () => {
    const object = pointerFor('young large object');
    const now = new Date();
    const { locator } = await projectWithDroppedPointer(object, new Date(now.getTime() - 60_000));

    const outcome = await retireLfsObjects(deps(), {
      ownerId: locator.ownerId,
      projectId: locator.projectId,
      now,
      window: retentionWindowMilliseconds,
    });

    expect(outcome.retired).toStrictEqual([]);
    expect(await tenantBytes(locator, object.oid)).toBe(object.size);
    expect(await rowFor(locator, object.oid)).toBeDefined();
  }, 120_000);

  it('should converge when a kill left the row behind after the object was deleted', async () => {
    const object = pointerFor('half-retired large object');
    const now = new Date();
    const { locator } = await projectWithDroppedPointer(
      object,
      new Date(now.getTime() - retentionWindowMilliseconds - 1),
    );
    await driver.deleteBlob({
      namespace: 'tenants',
      key: tenantLfsObjectKey(locator.ownerId, locator.projectId, object.oid),
      tier: 'private',
    });

    const outcome = await retireLfsObjects(deps(), {
      ownerId: locator.ownerId,
      projectId: locator.projectId,
      now,
      window: retentionWindowMilliseconds,
    });

    expect(outcome.retired).toStrictEqual([object.oid]);
    expect(await rowFor(locator, object.oid)).toBeUndefined();
  }, 120_000);

  it('should leave the bytes of a reachable pointer alone when a kill removed its row', async () => {
    const object = pointerFor('rowless large object');
    const now = new Date();
    const locator = await newProject();
    const clientDirectory = newClient();
    writeFileSync(path.join(clientDirectory, 'part.stl'), object.text);
    commitAll(clientDirectory, 'add the pointer');
    await pushAndCommit(locator, clientDirectory, ['main']);
    await seedObject(locator, object, undefined);
    await database
      .delete(projectGitLfsObject)
      .where(and(eq(projectGitLfsObject.projectId, locator.projectId), eq(projectGitLfsObject.oid, object.oid)));

    const outcome = await retireLfsObjects(deps(), {
      ownerId: locator.ownerId,
      projectId: locator.projectId,
      now,
      window: retentionWindowMilliseconds,
    });

    /* No row to drive a delete, and the reachable pointer still has its bytes:
       the next push re-reserves the object rather than losing it. */
    expect(outcome.retired).toStrictEqual([]);
    expect(await tenantBytes(locator, object.oid)).toBe(object.size);
  }, 120_000);

  it('should retire a reservation whose bytes never arrived after 24 hours', async () => {
    const object = pointerFor('abandoned reservation');
    const now = new Date();
    const locator = await newProject();
    const clientDirectory = newClient();
    writeFileSync(path.join(clientDirectory, 'main.scad'), 'cube(1);\n');
    commitAll(clientDirectory, 'no pointer was ever pushed');
    await pushAndCommit(locator, clientDirectory, ['main']);
    /* Reserved and never finalized: the upload URL was issued, the bytes never
       came, and neither key holds anything. */
    await database.insert(projectGitLfsObject).values({
      projectId: locator.projectId,
      oid: object.oid,
      sizeBytes: object.size,
      createdAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
    });
    await database.update(projectGit).set({ lfsBytes: object.size }).where(eq(projectGit.projectId, locator.projectId));

    const outcome = await retireLfsObjects(deps(), {
      ownerId: locator.ownerId,
      projectId: locator.projectId,
      now,
      window: retentionWindowMilliseconds,
    });

    expect(outcome.retired).toStrictEqual([object.oid]);
    expect(await rowFor(locator, object.oid)).toBeUndefined();
    expect(await lfsBytesOf(locator)).toBe(0);
  }, 120_000);

  it('should keep a reservation whose bytes never arrived for the first 24 hours', async () => {
    const object = pointerFor('young reservation');
    const now = new Date();
    const locator = await newProject();
    const clientDirectory = newClient();
    writeFileSync(path.join(clientDirectory, 'main.scad'), 'cube(1);\n');
    commitAll(clientDirectory, 'no pointer was ever pushed');
    await pushAndCommit(locator, clientDirectory, ['main']);
    await database.insert(projectGitLfsObject).values({
      projectId: locator.projectId,
      oid: object.oid,
      sizeBytes: object.size,
      createdAt: new Date(now.getTime() - 23 * 60 * 60 * 1000),
    });

    const outcome = await retireLfsObjects(deps(), {
      ownerId: locator.ownerId,
      projectId: locator.projectId,
      now,
      window: retentionWindowMilliseconds,
    });

    expect(outcome.retired).toStrictEqual([]);
    expect(await rowFor(locator, object.oid)).toBeDefined();
  }, 120_000);

  it('should hand the client an upload action when retirement lands between the head and the clear', async () => {
    const object = pointerFor('raced large object');
    const now = new Date();
    const { locator } = await projectWithDroppedPointer(
      object,
      new Date(now.getTime() - retentionWindowMilliseconds - 1),
    );

    /* The reviewer's interleaving: the batch takes its unlocked `headBlob`,
       retirement then deletes the bytes and the row under the owner lock, and
       the batch must still not tell git-lfs to skip the upload. */
    let raced = false;
    const racingStorage = mock<ObjectStorageService>({
      headBlob: async (headArgs) => {
        const stored = await driver.headBlob(headArgs);
        if (!raced) {
          raced = true;
          await retireLfsObjects(deps(), {
            ownerId: locator.ownerId,
            projectId: locator.projectId,
            now,
            window: retentionWindowMilliseconds,
          });
        }
        return stored;
      },
      presignPut: async (putArgs) => driver.presignPut(putArgs),
      presignGet: async (getArgs) => driver.presignGet(getArgs),
      getBlob: async (getArgs) => driver.getBlob(getArgs),
    });
    /* Reservation and finalization against the real table rather than canned
       answers: the point of the re-reservation is that the row exists again
       when `verify` finalizes, and a stubbed `finalizeLfsObject` would say so
       whether or not it did. */
    const repositories = mock<GitRepositoryService>({
      reserveLfsObjects: async (reserveArgs) => {
        for (const requested of reserveArgs.objects) {
          // oxlint-disable-next-line no-await-in-loop -- one fixture object
          await database
            .insert(projectGitLfsObject)
            .values({ projectId: locator.projectId, oid: requested.oid, sizeBytes: requested.size })
            .onConflictDoNothing();
        }
        const rows = await database
          .select({
            oid: projectGitLfsObject.oid,
            size: projectGitLfsObject.sizeBytes,
            finalizedAt: projectGitLfsObject.finalizedAt,
          })
          .from(projectGitLfsObject)
          .where(eq(projectGitLfsObject.projectId, locator.projectId));
        return {
          status: 'reserved',
          objects: rows.map((row) => ({ oid: row.oid, size: row.size, finalized: row.finalizedAt !== null })),
        };
      },
      finalizeLfsObject: async (finalizeArgs) => {
        const updated = await database
          .update(projectGitLfsObject)
          .set({ finalizedAt: new Date() })
          .where(
            and(eq(projectGitLfsObject.projectId, locator.projectId), eq(projectGitLfsObject.oid, finalizeArgs.oid)),
          )
          .returning({ oid: projectGitLfsObject.oid });
        return updated.length === 0 ? 'unreserved' : 'finalized';
      },
    });
    const access: GitAccess = {
      projectId: locator.projectId,
      ownerId: locator.ownerId,
      role: 'owner',
      remainingBytes: 1024 * 1024,
      storageLimitBytes: 1024 * 1024,
    };
    /* A real `DatabaseService`, not a mock: `mock<T>({ database })` wraps the
       handle it is given, and an awaited proxy of a drizzle transaction never
       settles. Built directly rather than through a module so nothing runs the
       schema assertion. */
    const databaseService = new DatabaseService(
      new ConfigService<Environment, true>(getEnvironment()),
      mock<PinoLogger>(),
    );
    const service = new GitLfsService(racingStorage, repositories, databaseService);

    try {
      const batch = await service.batch({
        access,
        operation: 'upload',
        objects: [{ oid: object.oid, size: object.size }],
        authorization: 'Bearer token',
        endpoint: 'https://api.test/repo/info/lfs/objects',
      });

      expect(raced).toBe(true);
      expect(await tenantBytes(locator, object.oid)).toBeUndefined();
      expect(batch.status).toBe(200);
      if (batch.status === 200) {
        /* No actions here would be "already stored, skip the upload" for bytes
           retirement just deleted — a reachable pointer without bytes. */
        expect(batch.body.objects[0]?.actions?.['upload']).toBeDefined();
      }

      /* The client does what it was told: it uploads, then calls verify. Both
         have to succeed, or the push fails on an object the server itself
         retired mid-batch. */
      await driver.putBlob({
        namespace: 'tenants',
        key: tenantLfsObjectKey(locator.ownerId, locator.projectId, object.oid),
        body: object.body,
        contentType: 'application/octet-stream',
        tier: 'private',
      });
      await expect(service.verify({ access, oid: object.oid, size: object.size })).resolves.toBe(true);
      expect(await tenantBytes(locator, object.oid)).toBe(object.size);
      const finalized = await rowFor(locator, object.oid);
      expect(finalized?.finalizedAt).toBeInstanceOf(Date);
    } finally {
      await databaseService.onModuleDestroy();
    }
  }, 120_000);

  it('should find every project holding a due candidate and retire there', async () => {
    const object = pointerFor('due through the sweep');
    /* `retireDueLfsObjects` deliberately takes no project filter, and this
       database is shared. A historical clock is the scope: this row is marked
       in 1990 and is due against a year-2000 pass, while every foreign row —
       marked or merely unfinalized at a real 2026 timestamp — is not, so the
       sweep provably touches nothing another lane left behind. */
    const now = new Date('2000-01-01T00:00:00.000Z');
    const { locator } = await projectWithDroppedPointer(object, new Date('1990-01-01T00:00:00.000Z'));

    const outcomes = await retireDueLfsObjects(deps(), { now, window: retentionWindowMilliseconds });

    const outcome = outcomes.find((candidate) => candidate.projectId === locator.projectId);
    expect(outcome?.retired).toStrictEqual([object.oid]);
    expect(await rowFor(locator, object.oid)).toBeUndefined();
  }, 180_000);
});

describe('legacy LFS key relocation', () => {
  let moduleRef: TestingModule;
  let driver: ObjectStorageService;
  let client: postgres.Sql;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const owners: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }), StorageModule],
    }).compile();
    driver = moduleRef.get(ObjectStorageService);
    assertDestructiveTestBucketAllowed(driver.bucketFor('private'), 'the W4b relocation suite');
    client = postgres(databaseUrl, { max: 1, prepare: false });
    database = drizzle(client, { schema });
  }, 60_000);

  afterAll(async () => {
    if (owners.length > 0) {
      await database.delete(user).where(inArray(user.id, owners));
    }
    await Promise.all(
      owners.map(async (ownerId) =>
        driver.deleteEntirePrefixForPurgeJob({ namespace: 'tenants', keyPrefix: `${ownerId}/`, tier: 'private' }),
      ),
    );
    await client.end();
    await moduleRef.close();
  }, 60_000);

  it('should keep the legacy key when an earlier run left a wrong-sized tenant copy', async () => {
    const ownerId = `user-w4l-${randomBytes(6).toString('hex')}`;
    const projectId = `proj-${randomBytes(6).toString('hex')}`;
    owners.push(ownerId);
    await database.insert(user).values({ id: ownerId, name: 'W4b', email: `${ownerId}@tau.test` });
    await database.insert(project).values({ id: projectId, ownerId, name: 'relocation' });
    await database.insert(projectGit).values({ projectId });
    const object = pointerFor('interrupted relocation');
    await driver.putBlob({
      namespace: 'blobs',
      key: gitLfsObjectKey(projectId, object.oid),
      body: object.body,
      contentType: 'application/octet-stream',
      tier: 'private',
    });
    await driver.putBlob({
      namespace: 'tenants',
      key: tenantLfsObjectKey(ownerId, projectId, object.oid),
      body: object.body.slice(0, 3),
      contentType: 'application/octet-stream',
      tier: 'private',
    });
    await database.insert(projectGitLfsObject).values({
      projectId,
      oid: object.oid,
      sizeBytes: object.size,
      finalizedAt: new Date(),
    });

    await expect(relocateLegacyLfsObjects({ database, storage: driver }, { ownerId, projectId })).rejects.toThrow(
      /already at the tenant key/u,
    );

    const legacy = await driver.headBlob({
      namespace: 'blobs',
      key: gitLfsObjectKey(projectId, object.oid),
      tier: 'private',
    });
    expect(legacy?.size).toBe(object.size);
  }, 120_000);

  it('should move a legacy object under the tenant prefix and stay idempotent', async () => {
    const ownerId = `user-w4l-${randomBytes(6).toString('hex')}`;
    const projectId = `proj-${randomBytes(6).toString('hex')}`;
    owners.push(ownerId);
    await database.insert(user).values({ id: ownerId, name: 'W4b', email: `${ownerId}@tau.test` });
    await database.insert(project).values({ id: projectId, ownerId, name: 'relocation' });
    await database.insert(projectGit).values({ projectId });
    const object = pointerFor('legacy large object');
    await driver.putBlob({
      namespace: 'blobs',
      key: gitLfsObjectKey(projectId, object.oid),
      body: object.body,
      contentType: 'application/octet-stream',
      tier: 'private',
    });
    await database.insert(projectGitLfsObject).values({
      projectId,
      oid: object.oid,
      sizeBytes: object.size,
      finalizedAt: new Date(),
    });

    const first = await relocateLegacyLfsObjects({ database, storage: driver }, { ownerId, projectId });
    const second = await relocateLegacyLfsObjects({ database, storage: driver }, { ownerId, projectId });

    expect(first.moved).toStrictEqual([object.oid]);
    expect(second.moved).toStrictEqual([]);
    const relocated = await driver.headBlob({
      namespace: 'tenants',
      key: tenantLfsObjectKey(ownerId, projectId, object.oid),
      tier: 'private',
    });
    expect(relocated?.size).toBe(object.size);
    expect(
      await driver.headBlob({ namespace: 'blobs', key: gitLfsObjectKey(projectId, object.oid), tier: 'private' }),
    ).toBeUndefined();
  }, 120_000);
});
