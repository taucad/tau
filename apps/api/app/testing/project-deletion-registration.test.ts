import { randomUUID } from 'node:crypto';
import { GoneException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import type { CommercialEntitlementsService } from '#api/entitlements/commercial-entitlements.js';
import { registeredProjectLimitPerOwner } from '#api/git/git.constants.js';
import { completeProjectDeletion, requestProjectDeletion } from '#api/projects/project-deletion.js';
import { storeTombstoneFence } from '#api/git/store/tombstone-fence.js';
import { ProjectsController } from '#api/projects/projects.controller.js';
import type { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import type { Environment } from '#config/environment.config.js';
import type { DatabaseService } from '#database/database.service.js';
import type { Database } from '#database/owner-lock.js';
import { readProjectDeletion } from '#database/project-lifecycle.js';
import * as schema from '#database/schema.js';
import { createDeletionDatabase, seedDeletionProject } from '#testing/project-deletion.fixture.js';
import { createMemoryRepositoryStore } from '#testing/publication-lease.fixture.js';

/** Real controller queries and access authority; billing/rate-limit boundaries are deterministic. */
const createController = (database: Database) => {
  const databaseService = Object.assign(mock<DatabaseService>(), { database });
  const access = new ProjectAccessService(databaseService);
  const entitlements = mock<CommercialEntitlementsService>();
  entitlements.getEntitlements.mockResolvedValue({
    canSyncFiles: true,
    canCreatePrivateShares: true,
    canUseProKernels: true,
  });
  const rateLimiter = mock<PublicationRateLimiterService>();
  rateLimiter.consumeDailyBudget.mockResolvedValue({ allowed: true, count: 1 });
  // eslint-disable-next-line @typescript-eslint/naming-convention -- application environment key
  const config = new ConfigService<Environment, true>({ TAU_PROJECT_DELETION_ENABLED: true });
  const controller = new ProjectsController(databaseService, rateLimiter, entitlements, access, config);
  return { controller, entitlements, config, access };
};

describe('project deletion registration and listing on isolated PostgreSQL', () => {
  let client: postgres.Sql | undefined;
  let database: Database;
  beforeAll(async () => {
    ({ client, database } = await createDeletionDatabase());
  });
  afterAll(async () => client?.end());

  it('should expose capability only to owners and keep only their pending entry until completion', async () => {
    const fixture = await seedDeletionProject(database);
    const { controller, config } = createController(database);
    expect(await controller.list(fixture.ownerId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.projectId, role: 'owner', canDeleteCloud: true, cloudState: 'active' }),
        expect.objectContaining({ id: fixture.neighborId, role: 'owner', canDeleteCloud: true, cloudState: 'active' }),
      ]),
    );
    const readerList = await controller.list(fixture.readerId);
    expect(readerList.find((row) => row.id === fixture.projectId)).toMatchObject({
      role: 'read',
      canDeleteCloud: false,
      cloudState: 'active',
    });
    const writerList = await controller.list(fixture.writerId);
    expect(writerList.find((row) => row.id === fixture.projectId)).toMatchObject({
      role: 'write',
      canDeleteCloud: false,
    });
    expect(await controller.list(fixture.strangerId)).toEqual([]);
    config.set('TAU_PROJECT_DELETION_ENABLED', false);
    const disabledList = await controller.list(fixture.ownerId);
    expect(disabledList.every((row) => !row.canDeleteCloud)).toBe(true);
    await requestProjectDeletion({ database, ...fixture, userId: fixture.ownerId, enabled: true });
    const pendingList = await controller.list(fixture.ownerId);
    expect(pendingList.find((row) => row.id === fixture.projectId)?.cloudState).toBe('deleting');
    const retiredReaderList = await controller.list(fixture.readerId);
    expect(retiredReaderList.map((row) => row.id)).toEqual([fixture.neighborId]);
    expect(await controller.list(fixture.writerId)).toEqual([]);
    await completeProjectDeletion({ database, fence: storeTombstoneFence(createMemoryRepositoryStore()), ...fixture });
    const completedList = await controller.list(fixture.ownerId);
    expect(completedList.map((row) => row.id)).toEqual([fixture.neighborId]);
  });

  it('should reject a registration admitted before deletion when it reaches its transaction afterward', async () => {
    const fixture = await seedDeletionProject(database);
    const { controller, entitlements, access } = createController(database);
    await access.authorize(fixture.projectId, fixture.ownerId, 'owner');
    const admitted = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    entitlements.getEntitlements.mockImplementationOnce(async () => {
      admitted.resolve();
      await resume.promise;
      return { canSyncFiles: true, canCreatePrivateShares: true, canUseProKernels: true };
    });
    const registration = controller.register(fixture.projectId, { name: 'Stale overwrite' }, fixture.ownerId);
    const rejected = expect(registration).rejects.toThrow(GoneException);
    await admitted.promise;
    try {
      await requestProjectDeletion({ database, ...fixture, userId: fixture.ownerId, enabled: true });
    } finally {
      resume.resolve();
    }
    await rejected;
    const [row] = await database.select().from(schema.project).where(eq(schema.project.id, fixture.projectId));
    expect(row).toMatchObject({ ownerId: fixture.ownerId, name: 'Delete this fixture' });
    expect(await readProjectDeletion(database, fixture.projectId)).toMatchObject({
      ownerId: fixture.ownerId,
      deletedAt: null,
    });
    await expect(access.authorize(fixture.projectId, fixture.ownerId, 'owner')).rejects.toThrow(GoneException);
  });

  it('should reserve deleted IDs across account cascade and permit a distinct new identity', async () => {
    const fixture = await seedDeletionProject(database);
    const { controller } = createController(database);
    await requestProjectDeletion({ database, ...fixture, userId: fixture.ownerId, enabled: true });
    await completeProjectDeletion({ database, fence: storeTombstoneFence(createMemoryRepositoryStore()), ...fixture });
    const receipt = await readProjectDeletion(database, fixture.projectId);
    await database.delete(schema.user).where(eq(schema.user.id, fixture.ownerId));
    expect(await database.select().from(schema.project).where(eq(schema.project.id, fixture.projectId))).toEqual([]);
    expect(await readProjectDeletion(database, fixture.projectId)).toEqual(receipt);
    await expect(controller.register(fixture.projectId, { name: 'Resurrect' }, fixture.ownerId)).rejects.toThrow(
      GoneException,
    );
    await expect(controller.register(fixture.projectId, { name: 'Steal' }, fixture.strangerId)).rejects.toThrow(
      NotFoundException,
    );
    const freshId = `copy_${randomUUID()}`;
    expect(await controller.register(freshId, { name: 'Independent retained copy' }, fixture.strangerId)).toEqual({
      id: freshId,
    });
    const [copy] = await database.select().from(schema.project).where(eq(schema.project.id, freshId));
    expect(copy).toMatchObject({ ownerId: fixture.strangerId, name: 'Independent retained copy' });
  });

  it('should release a completed project registration slot without deleting the reserved row', async () => {
    const fixture = await seedDeletionProject(database);
    const { controller } = createController(database);
    await database.insert(schema.project).values(
      Array.from({ length: registeredProjectLimitPerOwner - 2 }, (_, index) => ({
        id: `slot_${fixture.projectId}_${String(index)}`,
        ownerId: fixture.ownerId,
        name: 'Capacity control',
      })),
    );
    const freshId = `fresh_${randomUUID()}`;
    await expect(controller.register(freshId, {}, fixture.ownerId)).rejects.toMatchObject({
      response: { code: 'PROJECT_LIMIT_REACHED' },
    });
    await requestProjectDeletion({ database, ...fixture, userId: fixture.ownerId, enabled: true });
    await completeProjectDeletion({ database, fence: storeTombstoneFence(createMemoryRepositoryStore()), ...fixture });
    expect(await controller.register(freshId, {}, fixture.ownerId)).toEqual({ id: freshId });
    expect(await readProjectDeletion(database, fixture.projectId)).toMatchObject({ ownerId: fixture.ownerId });
    const [reserved] = await database.select().from(schema.project).where(eq(schema.project.id, fixture.projectId));
    expect(reserved?.id).toBe(fixture.projectId);
  });
});
