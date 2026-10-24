import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import process from 'node:process';
import { ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  completeProjectDeletion,
  readOwnedProjectDeletion,
  requestProjectDeletion,
} from '#api/projects/project-deletion.js';
import { storeTombstoneFence } from '#api/git/store/tombstone-fence.js';
import { decodeManifest, encodeManifest, succeedManifest } from '#api/git/store/manifest.js';
import { retentionWindowMilliseconds } from '#api/git/store/limits.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import { assertProjectActive, readProjectDeletion } from '#database/project-lifecycle.js';
import { readOwnerUsage, withOwnerLock } from '#database/owner-lock.js';
import type { Database } from '#database/owner-lock.js';
import * as schema from '#database/schema.js';
import { createMemoryRepositoryStore } from '#testing/publication-lease.fixture.js';
import { createDeletionDatabase, seedDeletionProject } from '#testing/project-deletion.fixture.js';

/** Real migrations/transactions plus the existing conditional-write repository port fixture. */
describe('project deletion against isolated PostgreSQL and repository CAS', () => {
  let client: postgres.Sql | undefined;
  let database: Database;
  let databaseUrl: string;
  beforeAll(async () => {
    const fixture = await createDeletionDatabase();
    client = fixture.client;
    database = fixture.database;
    databaseUrl = fixture.url;
  });
  afterAll(async () => {
    await client?.end();
  });

  it('should refuse collaborators, strangers and disabled admission without changing project access', async () => {
    const fixture = await seedDeletionProject(database);
    const before = await database
      .select()
      .from(schema.projectCollaborator)
      .where(eq(schema.projectCollaborator.projectId, fixture.projectId));
    for (const userId of [fixture.readerId, fixture.writerId]) {
      // oxlint-disable-next-line no-await-in-loop -- exercise both independent authorization roles
      await expect(requestProjectDeletion({ database, ...fixture, userId, enabled: true })).rejects.toThrow(
        ForbiddenException,
      );
    }
    await expect(
      requestProjectDeletion({ database, ...fixture, userId: fixture.strangerId, enabled: true }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      requestProjectDeletion({ database, ...fixture, userId: fixture.ownerId, enabled: false }),
    ).rejects.toMatchObject({
      response: { code: 'PROJECT_DELETION_DISABLED' },
    });
    expect(await readProjectDeletion(database, fixture.projectId)).toBeUndefined();
    expect(
      await database
        .select()
        .from(schema.projectCollaborator)
        .where(eq(schema.projectCollaborator.projectId, fixture.projectId)),
    ).toEqual(before);
    expect(await readOwnedProjectDeletion(database, fixture.projectId, fixture.ownerId)).toEqual({
      projectId: fixture.projectId,
      state: 'active',
    });
  });

  it('should atomically retire memberships, invitations and every publication while retaining fork ancestry and neighbors', async () => {
    const fixture = await seedDeletionProject(database);
    const firstId = `pub_${fixture.projectId}`;
    const secondId = `${firstId}_old`;
    const neighborPublicationId = `${firstId}_neighbor`;
    const forkId = `${fixture.projectId}_fork`;
    const oldRetirement = new Date('2026-09-01T00:00:00.000Z');
    await database.insert(schema.publication).values(
      [
        {
          id: firstId,
          projectId: fixture.projectId,
          ownerId: fixture.ownerId,
          tag: 'v2',
          manifestKey: `${firstId}/manifest.json`,
        },
        {
          id: secondId,
          projectId: fixture.projectId,
          ownerId: fixture.ownerId,
          tag: 'v1',
          manifestKey: `${secondId}/manifest.json`,
          unpublishedAt: oldRetirement,
        },
        {
          id: neighborPublicationId,
          projectId: fixture.neighborId,
          ownerId: fixture.ownerId,
          tag: 'v1',
          manifestKey: `${neighborPublicationId}/manifest.json`,
        },
      ].map((row) => ({
        ...row,
        revisionId: 'a'.repeat(40),
        visibility: 'public',
        runtimePin: '~0.1.0',
        kernels: [],
        entryPath: 'main.ts',
        title: 'Preserve metadata',
      })),
    );
    await database
      .update(schema.project)
      .set({ currentPublicationId: firstId })
      .where(eq(schema.project.id, fixture.projectId));
    await database
      .insert(schema.project)
      .values({ id: forkId, ownerId: fixture.strangerId, name: 'Independent fork', forkedFrom: firstId });
    await database.insert(schema.projectInvitation).values({
      projectId: fixture.projectId,
      email: 'invite@example.invalid',
      role: 'write',
      tokenHash: fixture.projectId,
      expiresAt: new Date('2030-01-01'),
    });
    await database.insert(schema.publicationAccess).values({
      id: `access_${fixture.projectId}`,
      publicationId: firstId,
      ownerId: fixture.ownerId,
      recipientEmail: 'invite@example.invalid',
    });
    const neighborBefore = await database
      .select()
      .from(schema.project)
      .where(eq(schema.project.id, fixture.neighborId));
    const forkBefore = await database.select().from(schema.project).where(eq(schema.project.id, forkId));
    await requestProjectDeletion({ database, ...fixture, userId: fixture.ownerId, enabled: true });
    const intent = await readProjectDeletion(database, fixture.projectId);
    expect(intent).toMatchObject({
      ownerId: fixture.ownerId,
      requestedBy: fixture.ownerId,
      deletedAt: null,
      fencedAt: null,
      purgeAfter: null,
    });
    expect(
      await database
        .select()
        .from(schema.projectCollaborator)
        .where(eq(schema.projectCollaborator.projectId, fixture.projectId)),
    ).toEqual([]);
    const [invitation] = await database
      .select()
      .from(schema.projectInvitation)
      .where(eq(schema.projectInvitation.projectId, fixture.projectId));
    expect(invitation?.revokedAt).toEqual(intent?.requestedAt);
    const [grant] = await database
      .select()
      .from(schema.publicationAccess)
      .where(eq(schema.publicationAccess.publicationId, firstId));
    expect(grant).toMatchObject({ status: 'revoked', revokedAt: intent?.requestedAt });
    const publications = await database
      .select()
      .from(schema.publication)
      .where(eq(schema.publication.projectId, fixture.projectId));
    expect(publications.map((row) => row.id).sort()).toEqual([firstId, secondId].sort());
    expect(publications.find((row) => row.id === firstId)?.unpublishedAt).toEqual(intent?.requestedAt);
    expect(publications.find((row) => row.id === secondId)?.unpublishedAt).toEqual(oldRetirement);
    const work = await database
      .select()
      .from(schema.projectDeletionManifest)
      .where(eq(schema.projectDeletionManifest.projectId, fixture.projectId));
    expect(
      work
        .map(({ publicationId, manifestKey, releasedAt }) => ({ publicationId, manifestKey, releasedAt }))
        .sort((a, b) => a.publicationId.localeCompare(b.publicationId)),
    ).toEqual(
      [
        { publicationId: firstId, manifestKey: `${firstId}/manifest.json`, releasedAt: null },
        { publicationId: secondId, manifestKey: `${secondId}/manifest.json`, releasedAt: null },
      ].sort((a, b) => a.publicationId.localeCompare(b.publicationId)),
    );
    const [project] = await database.select().from(schema.project).where(eq(schema.project.id, fixture.projectId));
    expect(project).toMatchObject({ id: fixture.projectId, ownerId: fixture.ownerId, currentPublicationId: null });
    expect(await database.select().from(schema.project).where(eq(schema.project.id, forkId))).toEqual(forkBefore);
    expect(await database.select().from(schema.project).where(eq(schema.project.id, fixture.neighborId))).toEqual(
      neighborBefore,
    );
    const [neighborPublication] = await database
      .select()
      .from(schema.publication)
      .where(eq(schema.publication.id, neighborPublicationId));
    expect(neighborPublication?.unpublishedAt).toBeNull();
    await expect(assertProjectActive(database, fixture.projectId, fixture.ownerId)).rejects.toThrow(GoneException);
    await expect(assertProjectActive(database, fixture.projectId, fixture.readerId)).rejects.toThrow(NotFoundException);
    await expect(readOwnedProjectDeletion(database, fixture.projectId, fixture.strangerId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should complete a registered-only legacy identity with an empty permanent storage fence', async () => {
    const fixture = await seedDeletionProject(database);
    const store = createMemoryRepositoryStore();
    const at = new Date('2026-10-24T00:00:00.000Z');
    expect(await store.readManifest(fixture)).toBeUndefined();
    await requestProjectDeletion({ database, ...fixture, userId: fixture.ownerId, enabled: true });
    expect(await completeProjectDeletion({ database, fence: storeTombstoneFence(store), ...fixture, at })).toEqual({
      projectId: fixture.projectId,
      state: 'deleted',
      deletedAt: at.toISOString(),
    });
    const stored = await store.readManifest(fixture);
    expect(stored).toBeDefined();
    if (!stored) {
      throw new Error('Deletion did not persist its manifest');
    }
    const manifest = decodeManifest(stored.manifest);
    expect(manifest).toMatchObject({
      generation: 1,
      refs: {},
      packs: [],
      tombstone: { tombstonedAt: at.toISOString(), purgeAfter: '2026-11-23T00:00:00.000Z' },
    });
    const recreation = succeedManifest(undefined, { refs: {}, packs: [], committedBy: fixture.ownerId }, at);
    expect(await store.commitManifest(fixture, encodeManifest(recreation), 'absent')).toBe('lost');
    expect(await store.readManifest(fixture)).toEqual(stored);
  });

  it('should preserve the original deadline and receipt across concurrent requests and completion retries', async () => {
    const fixture = await seedDeletionProject(database);
    const store = createMemoryRepositoryStore();
    await Promise.all(
      Array.from({ length: 5 }, async () =>
        requestProjectDeletion({ database, ...fixture, userId: fixture.ownerId, enabled: true }),
      ),
    );
    const intent = await readProjectDeletion(database, fixture.projectId);
    const at = new Date('2026-10-24T01:00:00.000Z');
    const results = await Promise.all(
      Array.from({ length: 3 }, async () =>
        completeProjectDeletion({ database, fence: storeTombstoneFence(store), ...fixture, at }),
      ),
    );
    expect(results).toEqual(
      Array.from({ length: 3 }, () => ({
        projectId: fixture.projectId,
        state: 'deleted',
        deletedAt: at.toISOString(),
      })),
    );
    const receipt = await readProjectDeletion(database, fixture.projectId);
    const fenced = await store.readManifest(fixture);
    await requestProjectDeletion({ database, ...fixture, userId: fixture.ownerId, enabled: false });
    expect(
      await completeProjectDeletion({
        database,
        fence: storeTombstoneFence(store),
        ...fixture,
        at: new Date('2026-11-01'),
      }),
    ).toEqual(results[0]);
    expect(await readProjectDeletion(database, fixture.projectId)).toEqual(receipt);
    expect(await store.readManifest(fixture)).toEqual(fenced);
    expect(receipt?.requestedAt).toEqual(intent?.requestedAt);
    expect(receipt?.purgeAfter?.getTime()).toBe(at.getTime() + retentionWindowMilliseconds);
  });

  it('should recover committed intent after the requesting process is killed', async () => {
    const fixture = await seedDeletionProject(database);
    /* eslint-disable @typescript-eslint/naming-convention -- process environment keys */
    const childEnvironment: Record<string, string | undefined> = {
      PATH: process.env['PATH'],
      DATABASE_URL: databaseUrl,
      CPD_ACCEPTANCE_POSTGRES_CONTAINER: String(Reflect.get(process.env, 'CPD_ACCEPTANCE_POSTGRES_CONTAINER')),
    };
    /* eslint-enable @typescript-eslint/naming-convention -- end process environment keys */
    const child = spawn(
      process.execPath,
      [
        '--import',
        '@oxc-node/core/register',
        resolve(import.meta.dirname, 'project-deletion-process.ts'),
        fixture.projectId,
        fixture.ownerId,
      ],
      {
        cwd: resolve(import.meta.dirname, '../..'),
        // The app globally augments ProcessEnv with its complete validated schema.
        // This child needs only these three raw environment values, not the app environment.
        env: childEnvironment as NodeJS.ProcessEnv,
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      },
    );
    let diagnostic = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      diagnostic += chunk;
    });
    try {
      const message = await Promise.race([
        once(child, 'message'),
        once(child, 'exit').then(([code]) => {
          throw new Error(
            `Requester exited ${String(code)}: ${diagnostic.replaceAll(/postgres(?:ql)?:\/\/\S+/gu, '[database URL]')}`,
          );
        }),
      ]);
      expect(message[0]).toEqual({ state: 'intent-committed' });
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      expect(await exited).toEqual([null, 'SIGKILL']);
      const restartClient = postgres(databaseUrl, { max: 2, prepare: false });
      try {
        const restarted = drizzle(restartClient, { schema });
        expect(await readOwnedProjectDeletion(restarted, fixture.projectId, fixture.ownerId)).toEqual({
          projectId: fixture.projectId,
          state: 'deleting',
        });
        expect(
          await completeProjectDeletion({
            database: restarted,
            fence: storeTombstoneFence(createMemoryRepositoryStore()),
            ...fixture,
          }),
        ).toMatchObject({ projectId: fixture.projectId, state: 'deleted' });
        await expect(assertProjectActive(restarted, fixture.projectId, fixture.ownerId)).rejects.toThrow(GoneException);
      } finally {
        await restartClient.end();
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGKILL');
        await exited;
      }
    }
  });

  it('should leave an inaccessible durable pending receipt on store failure and recover without recording secrets', async () => {
    const fixture = await seedDeletionProject(database);
    const store = createMemoryRepositoryStore();
    const broken: RepositoryStore = {
      ...store,
      readManifest: async () => {
        throw new TypeError('signed URL and credential must not be persisted');
      },
    };
    await requestProjectDeletion({ database, ...fixture, userId: fixture.ownerId, enabled: true });
    const at = new Date();
    expect(await completeProjectDeletion({ database, fence: storeTombstoneFence(broken), ...fixture, at })).toEqual({
      projectId: fixture.projectId,
      state: 'deleting',
    });
    const pending = await readProjectDeletion(database, fixture.projectId);
    expect(pending).toMatchObject({
      deletedAt: null,
      fencedAt: null,
      purgeAfter: null,
      attempts: 1,
      lastError: 'TypeError',
    });
    expect(pending?.nextAttemptAt.getTime()).toBeGreaterThan(at.getTime());
    expect(await store.readManifest(fixture)).toBeUndefined();
    await expect(assertProjectActive(database, fixture.projectId, fixture.ownerId)).rejects.toThrow(GoneException);
    expect(await completeProjectDeletion({ database, fence: storeTombstoneFence(store), ...fixture })).toMatchObject({
      state: 'deleted',
    });
    expect(await readProjectDeletion(database, fixture.projectId)).toMatchObject({ lastError: null, attempts: 2 });
  });

  it('should recover a lost CAS acknowledgement without replacing the committed tombstone or its deadline', async () => {
    const fixture = await seedDeletionProject(database);
    const store = createMemoryRepositoryStore();
    const lostAcknowledgement: RepositoryStore = {
      ...store,
      commitManifest: async (...args) => {
        await store.commitManifest(...args);
        throw new Error('connection lost after durable manifest write');
      },
    };
    await requestProjectDeletion({ database, ...fixture, userId: fixture.ownerId, enabled: true });
    const at = new Date('2026-10-24T02:00:00.000Z');
    expect(
      await completeProjectDeletion({ database, fence: storeTombstoneFence(lostAcknowledgement), ...fixture, at }),
    ).toMatchObject({
      state: 'deleting',
    });
    const tombstone = await store.readManifest(fixture);
    expect(tombstone).toBeDefined();
    expect(await readProjectDeletion(database, fixture.projectId)).toMatchObject({ deletedAt: null });
    expect(
      await completeProjectDeletion({
        database,
        fence: storeTombstoneFence(store),
        ...fixture,
        at: new Date('2026-10-25'),
      }),
    ).toEqual({
      projectId: fixture.projectId,
      state: 'deleted',
      deletedAt: at.toISOString(),
    });
    expect(await store.readManifest(fixture)).toEqual(tombstone);
    const receipt = await readProjectDeletion(database, fixture.projectId);
    expect(receipt?.purgeAfter?.getTime()).toBe(at.getTime() + retentionWindowMilliseconds);
  });

  it('should exclude completed project bytes from quota while preserving retained accounting and neighbor usage', async () => {
    const fixture = await seedDeletionProject(database);
    expect(
      await withOwnerLock(database, fixture.ownerId, async (transaction) =>
        readOwnerUsage(transaction, fixture.ownerId),
      ),
    ).toEqual({ storageBytes: 1400, lfsBytes: 350 });
    await requestProjectDeletion({ database, ...fixture, userId: fixture.ownerId, enabled: true });
    await completeProjectDeletion({ database, fence: storeTombstoneFence(createMemoryRepositoryStore()), ...fixture });
    expect(
      await withOwnerLock(database, fixture.ownerId, async (transaction) =>
        readOwnerUsage(transaction, fixture.ownerId),
      ),
    ).toEqual({ storageBytes: 400, lfsBytes: 50 });
    expect(await readProjectDeletion(database, fixture.projectId)).toMatchObject({ retainedBytes: 1370 });
    const [usage] = await database
      .select()
      .from(schema.projectGit)
      .where(eq(schema.projectGit.projectId, fixture.projectId));
    expect(usage).toMatchObject({ storageBytes: 1000, lfsBytes: 300, retainedBytes: 70 });
  });

  it('should retry lost CAS writes against newer generations and fence the last admitted refs', async () => {
    const fixture = await seedDeletionProject(database);
    const store = createMemoryRepositoryStore();
    const signals: Array<AbortSignal | undefined> = [];
    let competingWrites = 0;
    const racing: RepositoryStore = {
      ...store,
      commitManifest: async (locator, next, expected, signal) => {
        signals.push(signal);
        if (competingWrites < 2) {
          competingWrites += 1;
          const current = await store.readManifest(locator);
          const competing = succeedManifest(
            current ? decodeManifest(current.manifest) : undefined,
            {
              refs: { 'refs/heads/main': { oid: String(competingWrites).repeat(40) } },
              packs: [],
              committedBy: fixture.ownerId,
            },
            new Date(),
          );
          await store.commitManifest(locator, encodeManifest(competing), current?.token ?? 'absent');
        }
        return store.commitManifest(locator, next, expected, signal);
      },
    };
    await requestProjectDeletion({ database, ...fixture, userId: fixture.ownerId, enabled: true });
    expect(await completeProjectDeletion({ database, fence: storeTombstoneFence(racing), ...fixture })).toMatchObject({
      state: 'deleted',
    });
    const stored = await store.readManifest(fixture);
    if (!stored) {
      throw new Error('CAS retry failed to leave a storage fence');
    }
    expect(decodeManifest(stored.manifest)).toMatchObject({
      generation: 3,
      refs: { 'refs/heads/main': { oid: '2'.repeat(40) } },
    });
    expect(decodeManifest(stored.manifest).tombstone).toBeDefined();
    expect(signals).toHaveLength(3);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(new Set(signals).size).toBe(1);
  });

  it('should await the five-second storage cancellation before returning durable pending status', async () => {
    const fixture = await seedDeletionProject(database);
    const store = createMemoryRepositoryStore();
    let canceled = false;
    const stalled: RepositoryStore = {
      ...store,
      readManifest: async (_locator, signal) => {
        if (!signal) {
          throw new Error('Storage cancellation signal is required');
        }
        return new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              canceled = true;
              reject(new DOMException('fixture storage request aborted', 'AbortError'));
            },
            { once: true },
          );
        });
      },
    };
    await requestProjectDeletion({ database, ...fixture, userId: fixture.ownerId, enabled: true });
    const started = performance.now();
    expect(await completeProjectDeletion({ database, fence: storeTombstoneFence(stalled), ...fixture })).toEqual({
      projectId: fixture.projectId,
      state: 'deleting',
    });
    expect(canceled).toBe(true);
    expect(performance.now() - started).toBeGreaterThanOrEqual(4900);
    expect(performance.now() - started).toBeLessThan(10_000);
    expect(await readProjectDeletion(database, fixture.projectId)).toMatchObject({
      deletedAt: null,
      lastError: 'AbortError',
    });
    expect(await store.readManifest(fixture)).toBeUndefined();
  });
});
