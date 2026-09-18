import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import type { DatabaseService } from '#database/database.service.js';
import type { CommercialEntitlementsService } from '#api/entitlements/commercial-entitlements.js';
import { registeredProjectLimitPerOwner } from '#api/git/git.constants.js';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import type { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import { ProjectsController } from '#api/projects/projects.controller.js';
import type { RegisterProjectDto } from '#api/projects/projects.dto.js';

/**
 * W18 DEF-1 / ruling P51: *Connect Tau Cloud* is what registers a project.
 *
 * The wire-level proof (a never-published project's advertisement answering
 * `200` after a connect, and `404` for a stranger) is
 * `apps/api-e2e/src/git/tau-hosted-remote.spec.ts`; these rows pin the
 * decisions the route itself makes.
 */
describe('ProjectsController', () => {
  const ownerId = 'user-owner';
  const strangerId = 'user-someone-else';
  const projectId = 'proj_w18connect';
  /**
   * Every project row the fixture holds, across both accounts.
   *
   * The list stub filters this table by the owner the controller asked for,
   * which is read back out of the `where` condition — so a route that forgot
   * the filter, or filtered on the wrong column, answers with rows that are not
   * the caller's (W18 DEF-2).
   */
  const table: Array<{
    id: string;
    ownerId: string;
    name: string;
    updatedAt: Date;
    /** D27: the project's collaborators, which the listing joins the caller against. */
    collaborators: Record<string, string>;
  }> = [
    {
      id: 'proj_ownerbracket00000',
      ownerId,
      name: 'Bracket',
      updatedAt: new Date('2026-09-13T02:00:00.000Z'),
      collaborators: { [strangerId]: 'write' },
    },
    {
      id: 'proj_ownerhinge0000000',
      ownerId,
      name: 'Hinge',
      updatedAt: new Date('2026-09-13T01:00:00.000Z'),
      collaborators: {},
    },
    {
      id: 'proj_strangerpart00000',
      ownerId: strangerId,
      name: 'Theirs',
      updatedAt: new Date('2026-09-13T03:00:00.000Z'),
      collaborators: {},
    },
  ];
  let rows: Array<{ ownerId: string }>;
  /** What the owner's project count answers, for the R5 ceiling. */
  let owned: number;
  /** Whether the daily registration budget has room left (review R5). */
  let withinBudget: boolean;
  let inserted: Array<Record<string, unknown>>;
  let conditions: SQL[];
  /** What the caller's plan entitles, which N5 checks before either write. */
  let canSyncFiles: boolean;
  let controller: ProjectsController;
  /** The route's own database stub, reused by rows that build a second controller. */
  let databaseStub: unknown;

  const entitlements = (): CommercialEntitlementsService => ({
    getEntitlements: async () => ({
      canSyncFiles,
      canCreatePrivateShares: canSyncFiles,
      canUseProKernels: canSyncFiles,
    }),
  });

  /**
   * D27: the route's ownership decision is `ProjectAccessService.authorize`,
   * not a comparison of its own. The stub answers from the same `rows` fixture
   * the route's existence probe reads, so a registration that is not the
   * caller's still ends in the ruling-P55 `404`.
   *
   * @returns The access authority the controller is constructed with.
   */
  const access = (): ProjectAccessService =>
    ({
      authorize: async (id: string, callerId: string) => {
        const owner = rows[0]?.ownerId;
        if (owner === undefined || owner !== callerId) {
          throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Project not found' });
        }
        return { projectId: id, ownerId: owner, role: 'owner' };
      },
      invalidate: () => undefined,
    }) as unknown as ProjectAccessService;

  /** The one string a `column = $1` condition carries: the owner being asked for. */
  const ownerOf = (condition: SQL | undefined): string | undefined => {
    /* The listing's condition is an `or(...)` of two `eq(...)`s, so the caller's
       id is one level down; the registration route's conditions are flat. */
    const strings = (chunks: unknown[]): string[] =>
      chunks.flatMap((chunk) => {
        const { value } = chunk as Readonly<{ value?: unknown }>;
        if (typeof value === 'string') {
          return [value];
        }
        const nested = (chunk as Readonly<{ queryChunks?: unknown[] }>).queryChunks;
        return nested === undefined ? [] : strings(nested);
      });
    return condition === undefined ? undefined : strings(condition.queryChunks)[0];
  };

  /**
   * The joined read `ProjectAccessService` makes, over the same `rows` fixture
   * the route's own existence probe reads.
   *
   * @param read - Where the project row comes from at call time.
   * @returns A database stub with the one query the access service issues.
   */
  const databaseStubFor = (read: () => Array<{ ownerId: string }>): unknown => ({
    database: {
      select: () => ({
        from: () => ({
          leftJoin: () => ({
            where: () => ({ limit: async (): Promise<unknown[]> => read().map((row) => ({ ...row, role: null })) }),
          }),
        }),
      }),
    },
  });

  const body = (name?: string): RegisterProjectDto => {
    const dto: RegisterProjectDto = { name };
    return dto;
  };

  beforeEach(() => {
    rows = [];
    owned = 0;
    withinBudget = true;
    inserted = [];
    conditions = [];
    canSyncFiles = true;
    databaseStub = {
      database: {
        /* The projection says which query this is: `{ value: count() }` is the
           R5 ceiling's count, anything else is a row read. */
        select: (projection?: Record<string, unknown>) => ({
          from: () => ({
            /* Only the listing joins, so the join is what separates it from the
               registration route's existence probe and its ceiling count. */
            leftJoin: () => ({
              where: (condition: SQL) => {
                conditions.push(condition);
                const caller = ownerOf(condition);
                const visible = table.filter(
                  (row) => row.ownerId === caller || (caller !== undefined && caller in row.collaborators),
                );
                return {
                  orderBy: async (): Promise<unknown[]> =>
                    visible.map((row) => ({
                      id: row.id,
                      name: row.name,
                      updatedAt: row.updatedAt,
                      ownerId: row.ownerId,
                      role: caller === undefined ? null : (row.collaborators[caller] ?? null),
                    })),
                };
              },
            }),
            where: (condition: SQL) => {
              conditions.push(condition);
              const counting = projection !== undefined && 'value' in projection;
              return {
                limit: async (): Promise<unknown[]> => (counting ? [{ value: owned }] : rows),
              };
            },
          }),
        }),
        insert: () => ({
          values: (values: Record<string, unknown>) => ({
            onConflictDoNothing: async (): Promise<void> => {
              inserted.push(values);
              /* What a real insert does, so the route's re-read (review R6) sees
                 the row it just wrote rather than an empty table. */
              if (rows.length === 0) {
                rows = [{ ownerId: String(values['ownerId']) }];
              }
            },
          }),
        }),
      },
    };
    controller = new ProjectsController(
      databaseStub as DatabaseService,
      {
        consumeDailyBudget: async () => ({ allowed: withinBudget, count: 1 }),
      } as unknown as PublicationRateLimiterService,
      entitlements(),
      access(),
    );
  });

  /* F2: registration probes for the id, inserts, then authorizes. With a real
     `ProjectAccessService` in the seat, a miss cached by an earlier lookup would
     answer `404` for the row this call just wrote. */
  it('registers a project the caller asked about moments earlier', async () => {
    const live = new ProjectAccessService(databaseStubFor(() => rows) as DatabaseService);
    const contested = new ProjectsController(
      databaseStub as DatabaseService,
      { consumeDailyBudget: async () => ({ allowed: true, count: 1 }) } as unknown as PublicationRateLimiterService,
      entitlements(),
      live,
    );

    await expect(live.authorize(projectId, ownerId, 'owner')).rejects.toBeInstanceOf(NotFoundException);
    await expect(contested.register(projectId, body('Bracket'), ownerId)).resolves.toEqual({ id: projectId });
  });

  it('creates the caller’s project row, and no repository (D1)', async () => {
    await expect(controller.register(projectId, body('Bracket'), ownerId)).resolves.toEqual({ id: projectId });
    expect(inserted).toEqual([{ id: projectId, ownerId, name: 'Bracket', origin: 'local-mirror' }]);
  });

  /**
   * N5 (review C11): the connect verb refuses before it writes anything.
   *
   * Registration used to spend the daily budget, insert the row and create a
   * bare repository with hooks on the shared volume before anything looked at
   * the plan — and every push that followed was refused at `git.service.ts`
   * with this same sentence. A free account therefore connected successfully,
   * could never use what it connected, and spent a slot of the 200-project
   * ceiling doing it. The wire-level proof (403, no row, no directory) is
   * `apps/api-e2e/src/git/tau-hosted-remote.spec.ts`.
   */
  it('refuses a caller whose plan does not entitle syncing, before the row and the repository', async () => {
    canSyncFiles = false;
    await expect(controller.register(projectId, body('Bracket'), ownerId)).rejects.toMatchObject({
      response: { code: 'GIT_SYNC_NOT_ENTITLED', message: 'Syncing files to Tau Cloud is a paid plan feature.' },
    });
    expect(inserted).toEqual([]);
  });

  it('is idempotent for the owner and still reconciles the repository', async () => {
    rows = [{ ownerId }];
    await expect(controller.register(projectId, body('Bracket'), ownerId)).resolves.toEqual({ id: projectId });
    expect(inserted).toEqual([]);
  });

  /* Ruling P55: the same answer for "no such project" and "not yours", so a
     signed-in caller cannot use this route as an oracle for which ids exist —
     the rule `git.service.ts` already states for the git surface. */
  it('answers an id another account already owns with 404, without touching the volume', async () => {
    rows = [{ ownerId: strangerId }];
    await expect(controller.register(projectId, body(), ownerId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.register(projectId, body(), ownerId)).rejects.toMatchObject({
      response: { code: 'PROJECT_NOT_FOUND' },
    });
    expect(inserted).toEqual([]);
  });

  /* Review R6: the loser of a race on one id inserts nothing, so the re-read is
     the only thing that can tell it the id is not its own. Without it the loser
     is answered `200` for somebody else's project. */
  it('answers 404 when it loses the insert race for the id', async () => {
    const racing = {
      database: {
        select: () => ({
          from: () => ({
            /* Absent when the route looks, so it goes on to insert. */
            where: () => ({ limit: async (): Promise<Array<{ ownerId: string }>> => [] }),
          }),
        }),
        insert: () => ({
          values: (values: Record<string, unknown>) => ({
            onConflictDoNothing: async (): Promise<void> => {
              inserted.push(values);
            },
          }),
        }),
      },
    };
    const contested = new ProjectsController(
      racing as unknown as DatabaseService,
      { consumeDailyBudget: async () => ({ allowed: true, count: 1 }) } as unknown as PublicationRateLimiterService,
      entitlements(),
      /* The winner's row by the time the loser re-checks: `authorize` is what
         tells the loser the id is not its own (review R6). */
      {
        authorize: async () => {
          throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Project not found' });
        },
        invalidate: () => undefined,
      } as unknown as ProjectAccessService,
    );

    await expect(contested.register(projectId, body(), ownerId)).rejects.toMatchObject({
      response: { code: 'PROJECT_NOT_FOUND' },
    });
  });

  /* Review R5: P51 made registration reachable without a publish, so it needs a
     ceiling. The cap counts projects, not calls, so an owner at the cap can
     still re-register what it already has. */
  it('refuses the registration past the per-account project ceiling', async () => {
    owned = registeredProjectLimitPerOwner;
    await expect(controller.register(projectId, body(), ownerId)).rejects.toMatchObject({
      response: { code: 'PROJECT_LIMIT_REACHED' },
    });
    expect(inserted).toEqual([]);

    owned = registeredProjectLimitPerOwner - 1;
    await expect(controller.register(projectId, body(), ownerId)).resolves.toEqual({ id: projectId });

    /* At the cap and already registered: still idempotent, still no new row. */
    owned = registeredProjectLimitPerOwner;
    rows = [{ ownerId }];
    inserted = [];
    await expect(controller.register(projectId, body(), ownerId)).resolves.toEqual({ id: projectId });
    expect(inserted).toEqual([]);
  });

  it('refuses a caller over its daily registration budget before it reads or writes anything', async () => {
    withinBudget = false;
    await expect(controller.register(projectId, body(), ownerId)).rejects.toMatchObject({
      response: { code: 'PROJECT_REGISTRATION_RATE_LIMITED' },
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(conditions).toEqual([]);
    expect(inserted).toEqual([]);
  });

  it('refuses an id that cannot name a repository before it writes anything', async () => {
    await expect(controller.register('../escape', body(), ownerId)).rejects.toBeInstanceOf(BadRequestException);
    expect(inserted).toEqual([]);
  });

  /**
   * W18 DEF-2 red pin (a): a second device cannot open what it cannot name.
   *
   * Two accounts, one table: each caller gets its own rows and nothing else.
   * The filter is asserted twice over — as the condition the query carries, and
   * as the rows that come back — because this is the only route that answers
   * with more than one project id. The `desc(updatedAt)` ordering is the
   * database's and is not asserted here; the fixture is already in that order.
   */
  it('lists the caller’s own projects and the collaborations they hold, each with its role', async () => {
    await expect(controller.list(ownerId)).resolves.toEqual([
      { id: 'proj_ownerbracket00000', name: 'Bracket', updatedAt: '2026-09-13T02:00:00.000Z', role: 'owner' },
      { id: 'proj_ownerhinge0000000', name: 'Hinge', updatedAt: '2026-09-13T01:00:00.000Z', role: 'owner' },
    ]);

    /* D27: the stranger owns one project and collaborates on another, and the
       listing is what a second device names either from. */
    await expect(controller.list(strangerId)).resolves.toEqual([
      { id: 'proj_ownerbracket00000', name: 'Bracket', updatedAt: '2026-09-13T02:00:00.000Z', role: 'write' },
      { id: 'proj_strangerpart00000', name: 'Theirs', updatedAt: '2026-09-13T03:00:00.000Z', role: 'owner' },
    ]);
  });
});
