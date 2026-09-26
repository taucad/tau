import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { inArray } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import { project, projectCollaborator, user } from '#database/schema.js';
import type { DatabaseService } from '#database/database.service.js';
import { databaseReachable } from '#testing/database-reachable.js';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import type { CommercialEntitlementsService } from '#api/entitlements/commercial-entitlements.js';
import type { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import { ProjectsController } from '#api/projects/projects.controller.js';

/**
 * FX2 (E2E-F defect C) against a real PostgreSQL: *Connect Tau Cloud* always
 * registers, so a collaborator opening a shared project sends
 * `PUT /v1/projects/:id` for an id somebody else owns. A member is answered as
 * a registration would be and nothing is written or spent; a stranger keeps
 * the ruling-P55 `404`.
 *
 * Needs `pnpm infra:up` and a migrated database in `DATABASE_URL`.
 */
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!(await databaseReachable(databaseUrl)))('PUT /v1/projects/:id by a member (FX2)', () => {
  const suffix = randomBytes(5).toString('hex');
  const ownerId = `user-fx2-owner-${suffix}`;
  const writerId = `user-fx2-writer-${suffix}`;
  const readerId = `user-fx2-reader-${suffix}`;
  const strangerId = `user-fx2-stranger-${suffix}`;
  const newcomerId = `user-fx2-newcomer-${suffix}`;
  const projectId = `proj_fx2shared${suffix}`;
  const newProjectId = `proj_fx2fresh0${suffix}`;
  /** Collaborators need no plan (D27); only the owner and the would-be owners hold one. */
  const entitled = new Set([ownerId, strangerId, newcomerId]);
  let client: ReturnType<typeof postgres>;
  let controller: ProjectsController;
  /** Daily-budget units spent, by rate-limiter key. */
  let spent: Map<string, number>;

  /**
   * The stored rows as PostgreSQL prints them, every column included, so "changes
   * nothing" is a byte comparison rather than a list of fields someone chose.
   *
   * @returns The project row and its collaborator rows as record text.
   */
  const stored = async (): Promise<string[]> => {
    const rows = await client<Array<{ row: string }>>`
      SELECT p::text AS row FROM project p WHERE p.id = ${projectId}
      UNION ALL
      (SELECT c::text FROM project_collaborator c WHERE c.project_id = ${projectId} ORDER BY c.user_id)`;
    return rows.map(({ row }) => row);
  };

  beforeAll(async () => {
    client = postgres(databaseUrl, { max: 2, prepare: false });
    const database = drizzle(client, { schema });
    await database.insert(user).values(
      [ownerId, writerId, readerId, strangerId, newcomerId].map((id) => ({
        id,
        name: id,
        email: `${id}@tau.test`,
        emailVerified: true,
      })),
    );
    await database
      .insert(project)
      .values({ id: projectId, ownerId, name: 'Shared bracket', description: 'Owner text' });
    await database.insert(projectCollaborator).values([
      { projectId, userId: writerId, role: 'write', invitedBy: ownerId },
      { projectId, userId: readerId, role: 'read', invitedBy: ownerId },
    ]);

    const databaseService = { database } as unknown as DatabaseService;
    controller = new ProjectsController(
      databaseService,
      {
        consumeDailyBudget: async ({ key }: { key: string }) => {
          spent.set(key, (spent.get(key) ?? 0) + 1);
          return { allowed: true, count: spent.get(key) };
        },
      } as unknown as PublicationRateLimiterService,
      {
        getEntitlements: async (userId: string) => ({
          canSyncFiles: entitled.has(userId),
          canCreatePrivateShares: entitled.has(userId),
          canUseProKernels: entitled.has(userId),
        }),
      } as unknown as CommercialEntitlementsService,
      new ProjectAccessService(databaseService),
    );
  }, 60_000);

  beforeEach(() => {
    spent = new Map();
  });

  afterAll(async () => {
    /* Cascades to both projects and the collaborator rows. */
    await drizzle(client, { schema })
      .delete(user)
      .where(inArray(user.id, [ownerId, writerId, readerId, strangerId, newcomerId]));
    await client.end();
  }, 60_000);

  it.each([
    ['write', writerId],
    ['read', readerId],
  ])('answers a %s collaborator as registered and changes nothing', async (_role, memberId) => {
    const before = await stored();

    await expect(controller.register(projectId, { name: 'Renamed by a member' }, memberId)).resolves.toEqual({
      id: projectId,
    });

    expect(await stored()).toEqual(before);
    /* Neither the member's allowance nor the owner's: this was not a registration. */
    expect(spent).toEqual(new Map());
  });

  it('refuses a caller with no relation to the project with 404, as before', async () => {
    const before = await stored();

    await expect(controller.register(projectId, { name: 'Taken' }, strangerId)).rejects.toMatchObject({
      response: { code: 'PROJECT_NOT_FOUND' },
    });

    expect(await stored()).toEqual(before);
    expect(spent).toEqual(new Map());
  });

  it('still re-registers for the owner, spending the owner’s own allowance', async () => {
    await expect(controller.register(projectId, { name: 'Shared bracket' }, ownerId)).resolves.toEqual({
      id: projectId,
    });

    expect(spent).toEqual(new Map([[`project:register:${ownerId}`, 1]]));
  });

  it('registers a new id under the caller', async () => {
    await expect(controller.register(newProjectId, { name: 'Fresh' }, newcomerId)).resolves.toEqual({
      id: newProjectId,
    });

    const [row] = await client<Array<{ ownerId: string; name: string }>>`
      SELECT owner_id AS "ownerId", name FROM project WHERE id = ${newProjectId}`;
    expect(row).toEqual({ ownerId: newcomerId, name: 'Fresh' });
    expect(spent).toEqual(new Map([[`project:register:${newcomerId}`, 1]]));
  });
});
