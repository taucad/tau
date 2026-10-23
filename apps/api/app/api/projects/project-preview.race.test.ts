import { randomUUID } from 'node:crypto';
import { ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import { ProjectPreviewController } from '#api/projects/project-preview.controller.js';
import { ProjectPreviewService } from '#api/projects/project-preview.service.js';
import { requestProjectDeletion } from '#api/projects/project-deletion.js';
import type { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import type { DatabaseService } from '#database/database.service.js';
import type { Database } from '#database/owner-lock.js';
import { lockProjectLifecycle, readProjectDeletion } from '#database/project-lifecycle.js';
import * as schema from '#database/schema.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import { createDeletionDatabase, seedDeletionProject } from '#testing/project-deletion.fixture.js';

// oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Node Buffer fixture encodes the WebP envelope.
const image = (): Buffer<ArrayBuffer> => {
  const bytes = Buffer.alloc(30);
  bytes.write('RIFF');
  bytes.writeUInt32LE(22, 4);
  bytes.write('WEBP', 8);
  bytes.write('VP8 ', 12);
  bytes.writeUInt32LE(10, 16);
  bytes.set([0x9d, 0x01, 0x2a], 23);
  bytes.writeUInt16LE(768, 26);
  bytes.writeUInt16LE(576, 28);
  return bytes;
};

/** Real independent PostgreSQL sessions; keep migrated fixture databases as acceptance evidence. */
describe.skipIf(!process.env['CPD_ACCEPTANCE_POSTGRES_CONTAINER'])('preview PUT lifecycle serialization', () => {
  let observer: postgres.Sql | undefined;
  let previewClient: postgres.Sql | undefined;
  let deletionClient: postgres.Sql | undefined;
  let database: Database;
  let deletionDatabase: Database;
  const previewName = `cpd-preview-${randomUUID()}`;
  const deletionName = `cpd-delete-${randomUUID()}`;

  beforeAll(async () => {
    // This fixture refuses port 5432 and any connection without the owned-container marker.
    const fixture = await createDeletionDatabase();
    observer = fixture.client;
    /* eslint-disable @typescript-eslint/naming-convention -- PostgreSQL startup parameter. */
    previewClient = postgres(fixture.url, { max: 3, connection: { application_name: previewName } });
    deletionClient = postgres(fixture.url, { max: 1, connection: { application_name: deletionName } });
    /* eslint-enable @typescript-eslint/naming-convention -- PostgreSQL startup parameter. */
    database = drizzle(previewClient, { schema });
    deletionDatabase = drizzle(deletionClient, { schema });
  });

  afterAll(async () => {
    await Promise.all([previewClient?.end(), deletionClient?.end(), observer?.end()]);
  });

  const waiting = async (name: string): Promise<boolean> => {
    if (!observer) {
      throw new Error('PostgreSQL fixture not initialized');
    }
    const rows = await observer<Array<{ waiting: boolean }>>`
      select exists (
        select 1 from pg_stat_activity
        where application_name = ${name} and cardinality(pg_blocking_pids(pid)) > 0
      ) as waiting`;
    return rows[0]?.waiting === true;
  };

  const setup = async () => {
    const fixture = await seedDeletionProject(database);
    const databaseService = Object.assign(mock<DatabaseService>(), { database });
    const storage = mock<ObjectStorageService>();
    storage.putBlob.mockResolvedValue({ lost: false, alreadyExisted: false, etag: 'fixture' });
    const budget = mock<PublicationRateLimiterService>();
    budget.consumeDailyBudget.mockResolvedValue({ allowed: true, count: 1 });
    const controller = new ProjectPreviewController(
      new ProjectAccessService(databaseService),
      new ProjectPreviewService(storage),
      budget,
      databaseService,
    );
    const body = { image: image().toString('base64') };
    return { ...fixture, controller, storage, body };
  };

  it('should keep deletion intent behind an admitted collaborator write until the stored bytes settle', async () => {
    const fixture = await setup();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const events: string[] = [];
    let stored: Uint8Array<ArrayBuffer> | undefined;
    fixture.storage.putBlob.mockImplementation(async (input) => {
      entered.resolve();
      await release.promise;
      expect(await readProjectDeletion(database, fixture.projectId)).toBeUndefined();
      expect(input.signal).toBeInstanceOf(AbortSignal);
      expect(input.key).toBe(`${fixture.ownerId}/repos/${fixture.projectId}/catalog-preview.webp`);
      // The observable storage effect happens after the barrier, not on entering putBlob.
      expect(input.body).toEqual(image());
      if (!(input.body instanceof Uint8Array)) {
        throw new Error('Expected preview bytes');
      }
      stored = new Uint8Array(input.body);
      events.push('stored');
      return { lost: false, alreadyExisted: false, etag: 'fixture' };
    });
    const upload = fixture.controller.put(fixture.projectId, fixture.writerId, fixture.body);
    let deletion: Promise<void> | undefined;
    try {
      await entered.promise;
      deletion = (async () => {
        await requestProjectDeletion({
          database: deletionDatabase,
          projectId: fixture.projectId,
          userId: fixture.ownerId,
          enabled: true,
        });
        events.push('intent');
      })();
      await expect.poll(async () => waiting(deletionName), { timeout: 2000 }).toBe(true);
      expect(stored).toBeUndefined();
      expect(await readProjectDeletion(database, fixture.projectId)).toBeUndefined();
      release.resolve();
      await upload;
      await deletion;
      expect(stored).toEqual(new Uint8Array(image()));
      expect(events).toEqual(['stored', 'intent']);
      expect(await readProjectDeletion(database, fixture.projectId)).toBeDefined();
    } finally {
      release.resolve();
      await Promise.allSettled([upload, deletion]);
    }
  });

  it.each(['owner', 'writer'] as const)(
    'should refuse the %s before storage when intent commits while its upload waits for the project lock',
    async (role) => {
      const fixture = await setup();
      const locked = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      // Keep intent uncommitted so both ordinary authorize reads see an active project.
      const intent = deletionDatabase.transaction(async (transaction) => {
        await lockProjectLifecycle(transaction, fixture.projectId);
        await transaction.insert(schema.projectDeletion).values({
          projectId: fixture.projectId,
          ownerId: fixture.ownerId,
          requestedBy: fixture.ownerId,
        });
        locked.resolve();
        await release.promise;
      });
      let upload: Promise<unknown> | undefined;
      try {
        await locked.promise;
        const userId = role === 'owner' ? fixture.ownerId : fixture.writerId;
        upload = (async () => {
          try {
            return await fixture.controller.put(fixture.projectId, userId, fixture.body);
          } catch (error) {
            return error;
          }
        })();
        await expect.poll(async () => waiting(previewName), { timeout: 2000 }).toBe(true);
        expect(fixture.storage.putBlob).not.toHaveBeenCalled();
        release.resolve();
        await intent;
        expect(await upload).toBeInstanceOf(role === 'owner' ? GoneException : NotFoundException);
        expect(fixture.storage.putBlob).not.toHaveBeenCalled();
      } finally {
        release.resolve();
        await Promise.allSettled([upload, intent]);
      }
    },
  );

  it('should release the lifecycle lock on storage failure and preserve read-only authorization', async () => {
    const fixture = await setup();
    await expect(fixture.controller.put(fixture.projectId, fixture.readerId, fixture.body)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(fixture.storage.putBlob).not.toHaveBeenCalled();
    fixture.storage.putBlob.mockRejectedValueOnce(new Error('Fixture storage failure'));
    await expect(fixture.controller.put(fixture.projectId, fixture.writerId, fixture.body)).rejects.toThrow(
      'Fixture storage failure',
    );
    await requestProjectDeletion({
      database: deletionDatabase,
      projectId: fixture.projectId,
      userId: fixture.ownerId,
      enabled: true,
    });
    expect(await readProjectDeletion(database, fixture.projectId)).toBeDefined();
  });
});
