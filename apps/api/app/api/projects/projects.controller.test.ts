import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { Environment } from '#config/environment.config.js';
import type { DatabaseService } from '#database/database.service.js';
import type { OwnerLockTransaction } from '#database/owner-lock.js';
import { projectDeletion } from '#database/schema.js';
import type { project } from '#database/schema.js';
import type { CommercialEntitlementsService } from '#api/entitlements/commercial-entitlements.js';
import { registeredProjectLimitPerOwner } from '#api/git/git.constants.js';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import type { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import { ProjectsController } from '#api/projects/projects.controller.js';

type ListedRow = Pick<typeof project.$inferSelect, 'id' | 'ownerId' | 'name' | 'updatedAt'> & {
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- SQL left joins return null for an absent collaborator.
  role: string | null;
  deletionRequestedAt: (typeof projectDeletion.$inferSelect)['deletedAt'];
};

// Real lifecycle/access helpers run against typed dependency mocks. PostgreSQL
// lock serialization and SQL result semantics belong to the integration suite.
describe('ProjectsController', () => {
  const ownerId = 'user-owner';
  const strangerId = 'user-someone-else';
  const projectId = 'proj_w18connect';
  const dialect = new PgDialect();
  let rows: Array<{ ownerId: string; role?: 'read' | 'write' }>;
  let deletion: Pick<typeof projectDeletion.$inferSelect, 'ownerId' | 'deletedAt'> | undefined;
  let owned: number;
  let inserted: Array<typeof project.$inferInsert>;
  let listRows: ListedRow[];
  let listCondition: SQL | undefined;
  let countCondition: SQL | undefined;
  let locks: unknown[][];
  let beforeProjectLock: () => void;
  let databaseService: DatabaseService;
  let controller: ProjectsController;
  let access: ProjectAccessService;
  const rateLimiter = mock<PublicationRateLimiterService>();
  const entitlements = mock<CommercialEntitlementsService>();
  const config = mock<ConfigService<Environment, true>>();

  beforeEach(() => {
    vi.resetAllMocks();
    rows = [];
    deletion = undefined;
    owned = 0;
    inserted = [];
    listRows = [];
    listCondition = undefined;
    countCondition = undefined;
    locks = [];
    beforeProjectLock = () => undefined;
    config.get.mockReturnValue(true);
    rateLimiter.consumeDailyBudget.mockResolvedValue({ allowed: true, count: 1 });
    entitlements.getEntitlements.mockResolvedValue({
      canSyncFiles: true,
      canCreatePrivateShares: true,
      canUseProKernels: true,
    });
    const select = vi.fn().mockImplementation((projection?: Record<string, unknown>) => ({
      from: (table: unknown) => {
        const query = {
          leftJoin: () => query,
          where: (condition: SQL) => ({
            limit: async () => {
              if (table === projectDeletion) {
                return deletion ? [deletion] : [];
              }
              if (projection && 'value' in projection) {
                countCondition = condition;
                return [{ value: owned }];
              }
              return rows;
            },
            orderBy: async () => {
              listCondition = condition;
              return listRows;
            },
          }),
        };
        return query;
      },
    }));
    const transaction = mock<OwnerLockTransaction>({
      select,
      execute: vi.fn().mockImplementation(async (statement: SQL) => {
        locks.push(dialect.sqlToQuery(statement).params);
        if (locks.length === 2) {
          beforeProjectLock();
        }
        return [];
      }),
      insert: vi.fn().mockImplementation(() => ({
        values: async (values: typeof project.$inferInsert) => {
          // Every durable registration must hold the owner lock before the project lock.
          expect(locks.slice(-2)).toEqual([[ownerId], [projectId]]);
          inserted.push(values);
          rows = [{ ownerId: values.ownerId }];
        },
      })),
    });
    databaseService = Object.assign(mock<DatabaseService>(), {
      database: mock<DatabaseService['database']>({
        select,
        transaction: vi
          .fn()
          .mockImplementation(async (run: (value: OwnerLockTransaction) => Promise<unknown>) => run(transaction)),
      }),
    });
    access = new ProjectAccessService(databaseService);
    controller = new ProjectsController(databaseService, rateLimiter, entitlements, access, config);
  });

  it('should register a project after an earlier access lookup missed it', async () => {
    const missed = access.authorize(projectId, ownerId, 'owner');
    await expect(missed).rejects.toBeInstanceOf(NotFoundException);
    await expect(missed).rejects.toThrow('Project not found');
    await expect(controller.register(projectId, { name: 'Bracket' }, ownerId)).resolves.toEqual({ id: projectId });
    await expect(access.authorize(projectId, ownerId, 'owner')).resolves.toEqual({ projectId, ownerId, role: 'owner' });
  });

  it('should create the caller’s project row without a repository dependency', async () => {
    await expect(controller.register(projectId, { name: 'Bracket' }, ownerId)).resolves.toEqual({ id: projectId });
    expect(inserted).toEqual([{ id: projectId, ownerId, name: 'Bracket', origin: 'local-mirror' }]);
    expect(rateLimiter.consumeDailyBudget).toHaveBeenCalledOnce();
  });

  it('should default the name when none is supplied', async () => {
    await controller.register(projectId, {}, ownerId);
    expect(inserted).toEqual([{ id: projectId, ownerId, name: 'Untitled project', origin: 'local-mirror' }]);
  });

  it('should reject an unentitled caller before writing or spending registration budget', async () => {
    entitlements.getEntitlements.mockResolvedValue({
      canSyncFiles: false,
      canCreatePrivateShares: false,
      canUseProKernels: false,
    });
    const registration = controller.register(projectId, { name: 'Bracket' }, ownerId);
    await expect(registration).rejects.toBeInstanceOf(ForbiddenException);
    await expect(registration).rejects.toMatchObject({
      response: { code: 'GIT_SYNC_NOT_ENTITLED', message: 'Syncing files to Tau Cloud is a paid plan feature.' },
    });
    expect(inserted).toEqual([]);
    expect(rateLimiter.consumeDailyBudget).not.toHaveBeenCalled();
    expect(databaseService.database.transaction).not.toHaveBeenCalled();
  });

  it('should leave an owner’s existing project unchanged on registration retry', async () => {
    rows = [{ ownerId }];
    await expect(controller.register(projectId, { name: 'Changed' }, ownerId)).resolves.toEqual({ id: projectId });
    expect(inserted).toEqual([]);
    expect(rateLimiter.consumeDailyBudget).toHaveBeenCalledOnce();
    expect(rateLimiter.consumeDailyBudget.mock.calls[0]?.[0].key).toBe(`project:register:${ownerId}`);
  });

  it('should hide another owner’s project before asking for a plan or spending budget', async () => {
    rows = [{ ownerId: strangerId }];
    const registration = controller.register(projectId, {}, ownerId);
    await expect(registration).rejects.toBeInstanceOf(NotFoundException);
    await expect(registration).rejects.toMatchObject({
      response: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
    });
    expect(inserted).toEqual([]);
    expect(entitlements.getEntitlements).not.toHaveBeenCalled();
    expect(rateLimiter.consumeDailyBudget).not.toHaveBeenCalled();
  });

  it('should answer 404 when another owner wins registration before the project lock', async () => {
    beforeProjectLock = () => {
      rows = [{ ownerId: strangerId }];
    };
    const registration = controller.register(projectId, {}, ownerId);
    await expect(registration).rejects.toBeInstanceOf(NotFoundException);
    await expect(registration).rejects.toMatchObject({
      response: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
    });
    expect(locks).toEqual([[ownerId], [projectId]]);
    expect(inserted).toEqual([]);
  });

  it('should enforce the account ceiling while allowing existing owner retries at the limit', async () => {
    owned = registeredProjectLimitPerOwner;
    const registration = controller.register(projectId, {}, ownerId);
    await expect(registration).rejects.toBeInstanceOf(ForbiddenException);
    await expect(registration).rejects.toMatchObject({
      response: {
        code: 'PROJECT_LIMIT_REACHED',
        message: `This account has reached its limit of ${String(registeredProjectLimitPerOwner)} projects on Tau Cloud.`,
      },
    });
    expect(inserted).toEqual([]);
    expect(countCondition).toBeDefined();
    if (!countCondition) {
      throw new Error('Missing account ceiling query');
    }
    expect(dialect.sqlToQuery(countCondition)).toMatchObject({
      sql: '("project"."owner_id" = $1 and "project_deletion"."deleted_at" is null)',
      params: [ownerId],
    });
    owned -= 1;
    await expect(controller.register(projectId, {}, ownerId)).resolves.toEqual({ id: projectId });
    owned = registeredProjectLimitPerOwner;
    inserted = [];
    await expect(controller.register(projectId, {}, ownerId)).resolves.toEqual({ id: projectId });
    expect(inserted).toEqual([]);
  });

  it('should refuse an exhausted daily budget before entering the write transaction', async () => {
    rateLimiter.consumeDailyBudget.mockResolvedValue({ allowed: false, count: 100 });
    const registration = controller.register(projectId, {}, ownerId);
    await expect(registration).rejects.toBeInstanceOf(HttpException);
    await expect(registration).rejects.toMatchObject({
      response: { code: 'PROJECT_REGISTRATION_RATE_LIMITED', message: 'Too many project registrations today' },
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(inserted).toEqual([]);
    expect(databaseService.database.transaction).not.toHaveBeenCalled();
  });

  it.each(['../escape', '', 'repo/other'])(
    'should reject invalid repository id %j before any reads or writes',
    async (id) => {
      const registration = controller.register(id, {}, ownerId);
      await expect(registration).rejects.toBeInstanceOf(BadRequestException);
      await expect(registration).rejects.toMatchObject({
        response: { code: 'PROJECT_ID_INVALID', message: 'Not a project id' },
      });
      expect(databaseService.database.select).not.toHaveBeenCalled();
      expect(inserted).toEqual([]);
      expect(rateLimiter.consumeDailyBudget).not.toHaveBeenCalled();
    },
  );

  it.each(['read', 'write'] as const)(
    'should answer a %s collaborator without writes, entitlement checks or budget',
    async (role) => {
      rows = [{ ownerId: strangerId, role }];
      await expect(controller.register(projectId, { name: 'Member rename' }, ownerId)).resolves.toEqual({
        id: projectId,
      });
      expect(inserted).toEqual([]);
      expect(entitlements.getEntitlements).not.toHaveBeenCalled();
      expect(rateLimiter.consumeDailyBudget).not.toHaveBeenCalled();
      expect(databaseService.database.transaction).not.toHaveBeenCalled();
    },
  );

  it.each([null, new Date('2026-10-24T00:00:00.000Z')])(
    'should reject an owner’s registration with durable deletion progress %s',
    async (deletedAt) => {
      deletion = { ownerId, deletedAt };
      const registration = controller.register(projectId, {}, ownerId);
      await expect(registration).rejects.toBeInstanceOf(GoneException);
      await expect(registration).rejects.toMatchObject({
        response: { code: 'PROJECT_DELETED', message: 'This project has been deleted from Tau Cloud.' },
      });
      expect(inserted).toEqual([]);
      expect(rateLimiter.consumeDailyBudget).not.toHaveBeenCalled();
      expect(entitlements.getEntitlements).not.toHaveBeenCalled();
    },
  );

  it('should hide deletion progress from a former collaborator even with cached access', async () => {
    rows = [{ ownerId: strangerId, role: 'write' }];
    await access.authorize(projectId, ownerId, 'read');
    deletion = { ownerId: strangerId, deletedAt: null };
    const registration = controller.register(projectId, {}, ownerId);
    await expect(registration).rejects.toBeInstanceOf(NotFoundException);
    await expect(registration).rejects.toThrow('Project not found');
    expect(inserted).toEqual([]);
    expect(rateLimiter.consumeDailyBudget).not.toHaveBeenCalled();
  });

  it('should recheck deletion intent after acquiring the owner and project locks', async () => {
    beforeProjectLock = () => {
      deletion = { ownerId, deletedAt: null };
    };
    const registration = controller.register(projectId, {}, ownerId);
    await expect(registration).rejects.toBeInstanceOf(GoneException);
    await expect(registration).rejects.toThrow('This project has been deleted from Tau Cloud.');
    expect(locks).toEqual([[ownerId], [projectId]]);
    expect(inserted).toEqual([]);
  });

  it('should list owned and shared projects with roles and owner-only deletion capability', async () => {
    const bracket = {
      id: 'proj_ownerbracket00000',
      ownerId,
      name: 'Bracket',
      updatedAt: new Date('2026-09-13T02:00:00.000Z'),
      role: null,
      deletionRequestedAt: null,
    };
    const hinge = {
      ...bracket,
      id: 'proj_ownerhinge0000000',
      name: 'Hinge',
      updatedAt: new Date('2026-09-13T01:00:00.000Z'),
    };
    listRows = [bracket, hinge];
    await expect(controller.list(ownerId)).resolves.toEqual([
      {
        id: bracket.id,
        name: 'Bracket',
        updatedAt: bracket.updatedAt.toISOString(),
        role: 'owner',
        canDeleteCloud: true,
        cloudState: 'active',
      },
      {
        id: hinge.id,
        name: 'Hinge',
        updatedAt: hinge.updatedAt.toISOString(),
        role: 'owner',
        canDeleteCloud: true,
        cloudState: 'active',
      },
    ]);
    // These predicates preserve caller isolation, hide completed rows, and
    // retain pending rows only for their owner. PostgreSQL evaluates them in integration tests.
    if (!listCondition) {
      throw new Error('Missing project listing filter');
    }
    expect(dialect.sqlToQuery(listCondition)).toMatchObject({
      sql: '(("project"."owner_id" = $1 or "project_collaborator"."user_id" = $2) and "project_deletion"."deleted_at" is null and ("project_deletion"."requested_at" is null or "project"."owner_id" = $3))',
      params: [ownerId, ownerId, ownerId],
    });
    listRows = [
      { ...bracket, role: 'write' },
      { ...hinge, id: 'proj_strangerpart00000', ownerId: strangerId, name: 'Theirs' },
    ];
    await expect(controller.list(strangerId)).resolves.toEqual([
      {
        id: bracket.id,
        name: 'Bracket',
        updatedAt: bracket.updatedAt.toISOString(),
        role: 'write',
        canDeleteCloud: false,
        cloudState: 'active',
      },
      {
        id: 'proj_strangerpart00000',
        name: 'Theirs',
        updatedAt: hinge.updatedAt.toISOString(),
        role: 'owner',
        canDeleteCloud: true,
        cloudState: 'active',
      },
    ]);
    expect(dialect.sqlToQuery(listCondition).params).toEqual([strangerId, strangerId, strangerId]);
  });

  it('should expose the owner’s pending deletion as deleting', async () => {
    listRows = [
      {
        id: projectId,
        ownerId,
        name: 'Pending',
        updatedAt: new Date('2026-10-24T00:00:00.000Z'),
        role: null,
        deletionRequestedAt: new Date('2026-10-24T00:00:00.000Z'),
      },
    ];
    await expect(controller.list(ownerId)).resolves.toEqual([
      {
        id: projectId,
        name: 'Pending',
        updatedAt: '2026-10-24T00:00:00.000Z',
        role: 'owner',
        canDeleteCloud: true,
        cloudState: 'deleting',
      },
    ]);
  });

  it.each([false, undefined])(
    'should report false deletion capability when the admission flag is %s',
    async (enabled) => {
      const configuration = mock<ConfigService<Environment, true>>();
      configuration.get.mockImplementation((_key, defaultValue) => enabled ?? defaultValue);
      const disabled = new ProjectsController(databaseService, rateLimiter, entitlements, access, configuration);
      listRows = [
        {
          id: projectId,
          ownerId,
          name: 'Bracket',
          updatedAt: new Date('2026-10-24T00:00:00.000Z'),
          role: null,
          deletionRequestedAt: null,
        },
      ];
      const listed = await disabled.list(ownerId);
      expect(listed[0]?.canDeleteCloud).toBe(false);
    },
  );

  it.each(['read', null, 'unexpected'])(
    'should never infer deletion capability from fallback display role %s',
    async (role) => {
      listRows = [
        {
          id: projectId,
          ownerId: strangerId,
          name: 'Shared',
          updatedAt: new Date('2026-10-24T00:00:00.000Z'),
          role,
          deletionRequestedAt: null,
        },
      ];
      const listed = await controller.list(ownerId);
      expect(listed[0]).toMatchObject({ role: 'read', canDeleteCloud: false });
    },
  );
});
