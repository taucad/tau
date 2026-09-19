import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getEnvironment } from '#config/environment.config.js';
import { project, projectGit, projectGitLfsObject, user } from '#database/schema.js';
import * as schema from '#database/schema.js';
import { assertDestructiveTestBucketAllowed } from '#storage/destructive-test-bucket-guard.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { StorageModule } from '#storage/storage.module.js';
import { commitLease } from '#api/git/store/commit.js';
import { hydrateLease } from '#api/git/store/lease.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import type { RepositoryLocator } from '#api/git/store/port.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import { markLfsReachability, referencedLfsOids } from '#api/git/lfs-reachability.js';
import { databaseReachable } from '#testing/database-reachable.js';

/**
 * D6/D18 at push time: the objects a repository still reaches lose their
 * unreachable mark, everything else gains one, and the first moment of
 * unreachability survives every later pass.
 *
 * Real git, a real lease over MinIO and a real PostgreSQL: the walk is the
 * thing under test, and a mocked `git` would test the mock. Needs
 * `pnpm infra:up` and a migrated database.
 */

// === harness =============================================================

const databaseUrl = process.env.DATABASE_URL;

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

/** A git-lfs pointer blob, byte-for-byte as `git lfs` writes one. */
const pointerFor = (content: string): { text: string; oid: string; size: number } => {
  const bytes = Buffer.from(content, 'utf8');
  const oid = createHash('sha256').update(bytes).digest('hex');
  return {
    text: `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${String(bytes.byteLength)}\n`,
    oid,
    size: bytes.byteLength,
  };
};

describe.skipIf(!(await databaseReachable(databaseUrl)))('LFS reachability over a lease', () => {
  let moduleRef: TestingModule;
  let driver: ObjectStorageService;
  let store: S3RepositoryStore;
  let client: postgres.Sql;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const owners: string[] = [];

  /** A user, a project and its accounting row, all cascading off the user. */
  const newProject = async (): Promise<RepositoryLocator> => {
    const ownerId = `user-w4b-${randomBytes(6).toString('hex')}`;
    const projectId = `proj-${randomBytes(6).toString('hex')}`;
    owners.push(ownerId);
    await database.insert(user).values({ id: ownerId, name: 'W4b', email: `${ownerId}@tau.test` });
    await database.insert(project).values({ id: projectId, ownerId, name: 'reachability' });
    await database.insert(projectGit).values({ projectId });
    return repositoryLocator({ ownerId, projectId });
  };

  /** One finalized reservation, already marked unreachable at `unreachableAt`. */
  const seedObject = async (
    locator: RepositoryLocator,
    object: { oid: string; size: number },
    unreachableAt: Date | undefined,
  ): Promise<void> => {
    await database.insert(projectGitLfsObject).values({
      projectId: locator.projectId,
      oid: object.oid,
      sizeBytes: object.size,
      finalizedAt: new Date(),
      unreachableAt: unreachableAt ?? null,
    });
  };

  const markOf = async (locator: RepositoryLocator, oid: string): Promise<Date | undefined> => {
    const row = await database.query.projectGitLfsObject.findFirst({
      where: and(eq(projectGitLfsObject.projectId, locator.projectId), eq(projectGitLfsObject.oid, oid)),
    });
    return row?.unreachableAt ?? undefined;
  };

  /** Pushes `refs` from `clientDirectory` into a fresh lease and commits it. */
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

  /** Runs the pass the derivation step runs, over a lease of the stored state. */
  const markOverLease = async (
    locator: RepositoryLocator,
    at: Date,
  ): Promise<{ reachable: number; unreachable: number }> => {
    const lease = await hydrateLease({ store, locator, parentDirectory: scratch('mark') });
    try {
      return await markLfsReachability(
        { database },
        { projectId: locator.projectId, ownerId: locator.ownerId, directory: lease.directory, at },
      );
    } finally {
      await lease.dispose();
    }
  };

  /** Server-side retention: the ref goes, and the commit records the new map. */
  const retireRevision = async (locator: RepositoryLocator, ref: string): Promise<void> => {
    const lease = await hydrateLease({ store, locator, parentDirectory: scratch('retention') });
    try {
      git(lease.directory, 'update-ref', '-d', ref);
      await commitLease({ store, lease, committedBy: 'retention' });
    } finally {
      await lease.dispose();
    }
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

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }), StorageModule],
    }).compile();

    driver = moduleRef.get(ObjectStorageService);
    assertDestructiveTestBucketAllowed(driver.bucketFor('private'), 'the W4b reachability suite');
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

  it('should clear the mark for every pointer the pushed repository still reaches', async () => {
    const locator = await newProject();
    const first = pointerFor('first large object');
    const second = pointerFor('second large object');
    const clientDirectory = newClient();
    writeFileSync(path.join(clientDirectory, 'a.stl'), first.text);
    writeFileSync(path.join(clientDirectory, 'b.stl'), second.text);
    commitAll(clientDirectory, 'two pointers');
    await pushAndCommit(locator, clientDirectory, ['main']);
    await seedObject(locator, first, new Date('2026-01-01T00:00:00.000Z'));
    await seedObject(locator, second, new Date('2026-01-01T00:00:00.000Z'));

    const counts = await markOverLease(locator, new Date('2026-09-18T00:00:00.000Z'));

    expect(counts).toStrictEqual({ reachable: 2, unreachable: 0 });
    expect(await markOf(locator, first.oid)).toBeUndefined();
    expect(await markOf(locator, second.oid)).toBeUndefined();
  }, 120_000);

  it('should mark the pointer only a retired revision reached and leave the surviving one clear', async () => {
    const locator = await newProject();
    const kept = pointerFor('kept large object');
    const dropped = pointerFor('dropped large object');
    const clientDirectory = newClient();
    writeFileSync(path.join(clientDirectory, 'kept.stl'), kept.text);
    commitAll(clientDirectory, 'the pointer main keeps');
    git(clientDirectory, 'switch', '--quiet', '-c', 'retired');
    writeFileSync(path.join(clientDirectory, 'dropped.stl'), dropped.text);
    commitAll(clientDirectory, 'a chat retention later drops');
    await pushAndCommit(locator, clientDirectory, ['main', 'retired:refs/tau/chats/r1']);
    await seedObject(locator, kept, undefined);
    await seedObject(locator, dropped, undefined);

    expect(await markOverLease(locator, new Date('2026-09-18T00:00:00.000Z'))).toStrictEqual({
      reachable: 2,
      unreachable: 0,
    });

    /* Retention drops the revision on the server, which is the only way a
       pushed pointer stops being reached: a client may never delete a ref, and
       a later commit that removes the file leaves the history that holds it. */
    await retireRevision(locator, 'refs/tau/chats/r1');
    const counts = await markOverLease(locator, new Date('2026-09-18T01:00:00.000Z'));

    expect(counts).toStrictEqual({ reachable: 1, unreachable: 1 });
    expect(await markOf(locator, kept.oid)).toBeUndefined();
    expect(await markOf(locator, dropped.oid)).toStrictEqual(new Date('2026-09-18T01:00:00.000Z'));
  }, 120_000);

  it('should keep the first unreachable moment when the pass runs again', async () => {
    const locator = await newProject();
    const orphan = pointerFor('never referenced');
    const clientDirectory = newClient();
    writeFileSync(path.join(clientDirectory, 'other.scad'), 'cube(1);\n');
    commitAll(clientDirectory, 'no pointers');
    await pushAndCommit(locator, clientDirectory, ['main']);
    await seedObject(locator, orphan, undefined);

    await markOverLease(locator, new Date('2026-09-18T00:00:00.000Z'));
    const counts = await markOverLease(locator, new Date('2026-09-19T00:00:00.000Z'));

    expect(counts).toStrictEqual({ reachable: 0, unreachable: 1 });
    expect(await markOf(locator, orphan.oid)).toStrictEqual(new Date('2026-09-18T00:00:00.000Z'));
  }, 120_000);

  it('should treat a pointer reachable only from an annotated tag as reachable', async () => {
    const locator = await newProject();
    const tagged = pointerFor('only on the tag');
    const clientDirectory = newClient();
    writeFileSync(path.join(clientDirectory, 'tagged.stl'), tagged.text);
    commitAll(clientDirectory, 'pointer on the tagged commit');
    git(clientDirectory, 'tag', '-a', 'v1', '-m', 'v1');
    unlinkSync(path.join(clientDirectory, 'tagged.stl'));
    commitAll(clientDirectory, 'drop it from main');
    await pushAndCommit(locator, clientDirectory, ['main', 'v1']);
    await seedObject(locator, tagged, new Date('2026-01-01T00:00:00.000Z'));

    const counts = await markOverLease(locator, new Date('2026-09-18T00:00:00.000Z'));

    expect(counts).toStrictEqual({ reachable: 1, unreachable: 0 });
    expect(await markOf(locator, tagged.oid)).toBeUndefined();
  }, 120_000);

  it('should read no pointer from a repository that has no refs', async () => {
    const locator = await newProject();
    const lease = await hydrateLease({ store, locator, parentDirectory: scratch('empty') });
    try {
      await expect(referencedLfsOids(lease.directory)).resolves.toStrictEqual(new Set());
    } finally {
      await lease.dispose();
    }
  }, 120_000);
});
