import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { completeProjectDeletion, requestProjectDeletion } from '#api/projects/project-deletion.js';
import { storeTombstoneFence } from '#api/git/store/tombstone-fence.js';
import { releaseDeletedProjectPublicationReferences } from '#api/publications/publication-deletion.js';
import type { Database } from '#database/owner-lock.js';
import { readProjectDeletion } from '#database/project-lifecycle.js';
import * as schema from '#database/schema.js';
import type { ObjectStorageServiceContract } from '#storage/object-storage.service.js';
import { createDeletionDatabase, seedDeletionProject } from '#testing/project-deletion.fixture.js';
import { createMemoryRepositoryStore } from '#testing/publication-lease.fixture.js';

describe.skipIf(!process.env['CPD_ACCEPTANCE_POSTGRES_CONTAINER'])('project deletion during account closure', () => {
  let observer: postgres.Sql;
  let intentClient: postgres.Sql;
  let closureClient: postgres.Sql;
  let gate: postgres.Sql;
  let database: Database;
  let closureDatabase: Database;
  const clients: postgres.Sql[] = [];
  const intentName = `cpd-intent-${randomUUID()}`;
  const closureName = `cpd-closure-${randomUUID()}`;

  beforeAll(async () => {
    const fixture = await createDeletionDatabase();
    observer = fixture.client;
    clients.push(observer);
    /* eslint-disable @typescript-eslint/naming-convention -- PostgreSQL startup parameter. */
    intentClient = postgres(fixture.url, { max: 1, connection: { application_name: intentName } });
    clients.push(intentClient);
    closureClient = postgres(fixture.url, { max: 1, connection: { application_name: closureName } });
    clients.push(closureClient);
    /* eslint-enable @typescript-eslint/naming-convention -- PostgreSQL startup parameter. */
    gate = postgres(fixture.url, { max: 1 });
    clients.push(gate);
    database = drizzle(intentClient, { schema });
    closureDatabase = drizzle(closureClient, { schema });
  });

  afterAll(async () => {
    await Promise.all(clients.map(async (client) => client.end()));
  });

  const waiting = async (name: string): Promise<boolean> => {
    const [row] = await observer<Array<{ waiting: boolean }>>`
      select exists(select 1 from pg_stat_activity
        where application_name = ${name} and cardinality(pg_blocking_pids(pid)) > 0) as waiting`;
    return row?.waiting === true;
  };

  it('should retain cleanup references and byte totals when account closure waits on intent capture', async () => {
    const fixture = await seedDeletionProject(database);
    const publicationId = `pub_${randomUUID()}`;
    const manifestKey = `publications/${publicationId}/${'a'.repeat(40)}.json`;
    const digest = 'b'.repeat(64);
    await database.insert(schema.publication).values({
      id: publicationId,
      projectId: fixture.projectId,
      ownerId: fixture.ownerId,
      tag: 'v1',
      revisionId: 'a'.repeat(40),
      visibility: 'public',
      manifestKey,
      runtimePin: '0.1.0',
      kernels: [],
      entryPath: 'main.ts',
      title: 'Account closure fixture',
    });
    await database.insert(schema.blobRef).values({ sha256: digest, sizeBytes: 10n, refcount: 1 });
    const body = Buffer.from(
      JSON.stringify({
        version: 1,
        projectId: fixture.projectId,
        entryPath: 'main.ts',
        files: { 'main.ts': `sha256:${digest}` },
        kernels: [],
        runtime: '@taucad/runtime@0.1.0',
        parameters: {},
        createdAt: new Date().toISOString(),
      }),
    );
    const storage = mock<Pick<ObjectStorageServiceContract, 'getBlob'>>();
    storage.getBlob.mockImplementation(async () => ({
      body: Readable.from([body]),
      contentLength: body.length,
      contentType: 'application/json',
      etag: 'fixture',
    }));
    // Pause the actual insert after the ownership read, without replacing the core or Drizzle handle.
    await gate`select pg_advisory_lock(81977602)`;
    await observer.unsafe(`create function cpd_capture_gate() returns trigger language plpgsql as $$
      begin perform pg_advisory_xact_lock(81977602); return NEW; end $$`);
    await observer.unsafe(
      'create trigger cpd_capture_gate before insert on project_deletion for each row execute function cpd_capture_gate()',
    );
    const requested = requestProjectDeletion({
      database,
      projectId: fixture.projectId,
      userId: fixture.ownerId,
      enabled: true,
    });
    let closed: Promise<unknown> | undefined;
    try {
      await expect.poll(async () => waiting(intentName), { timeout: 5000 }).toBe(true);
      closed = Promise.resolve(closureDatabase.delete(schema.user).where(eq(schema.user.id, fixture.ownerId)));
      await expect.poll(async () => waiting(closureName), { timeout: 5000 }).toBe(true);
      await gate`select pg_advisory_unlock(81977602)`;
      await requested;
      await closed;
    } finally {
      await gate`select pg_advisory_unlock_all()`;
      await Promise.allSettled([requested, closed]);
      await observer.unsafe('drop trigger cpd_capture_gate on project_deletion');
      await observer.unsafe('drop function cpd_capture_gate()');
    }
    const captured = await database
      .select()
      .from(schema.projectDeletionManifest)
      .where(eq(schema.projectDeletionManifest.projectId, fixture.projectId));
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ manifestKey, releasedAt: null });
    expect(await database.select().from(schema.project).where(eq(schema.project.id, fixture.projectId))).toEqual([]);
    expect(await readProjectDeletion(database, fixture.projectId)).toMatchObject({
      retainedBytes: 1370,
      deletedAt: null,
    });
    const completed = await completeProjectDeletion({
      database,
      fence: storeTombstoneFence(createMemoryRepositoryStore()),
      projectId: fixture.projectId,
    });
    expect(completed.state).toBe('deleted');
    expect(await readProjectDeletion(database, fixture.projectId)).toMatchObject({ retainedBytes: 1370 });
    // A durable retry still works after the owner row has disappeared and admission is disabled.
    await requestProjectDeletion({ database, projectId: fixture.projectId, userId: fixture.ownerId, enabled: false });
    const release = { database, storage, projectId: fixture.projectId, at: new Date(Date.now() + 31 * 86_400_000) };
    expect(await releaseDeletedProjectPublicationReferences(release)).toBe(1);
    expect(await releaseDeletedProjectPublicationReferences(release)).toBe(0);
    const [blob] = await database.select().from(schema.blobRef).where(eq(schema.blobRef.sha256, digest));
    expect(blob?.refcount).toBe(0);
    expect(storage.getBlob).toHaveBeenCalledTimes(1);
  });

  it('should refuse a new intent when account closure has already removed the owner', async () => {
    const fixture = await seedDeletionProject(database);
    await closureDatabase.delete(schema.user).where(eq(schema.user.id, fixture.ownerId));
    await expect(
      requestProjectDeletion({ database, projectId: fixture.projectId, userId: fixture.ownerId, enabled: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await readProjectDeletion(database, fixture.projectId)).toBeUndefined();
  });
});
