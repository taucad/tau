import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { DatabaseService } from '#database/database.service.js';
import type { CommercialEntitlementsService } from '#api/entitlements/commercial-entitlements.js';
import { project } from '#database/schema.js';
import { registeredProjectLimitPerOwner } from '#api/git/git.constants.js';
import type { GitRepositoryService } from '#api/git/git.service.js';
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
  const table = [
    { id: 'proj_ownerbracket00000', ownerId, name: 'Bracket', updatedAt: new Date('2026-09-13T02:00:00.000Z') },
    { id: 'proj_ownerhinge0000000', ownerId, name: 'Hinge', updatedAt: new Date('2026-09-13T01:00:00.000Z') },
    {
      id: 'proj_strangerpart00000',
      ownerId: strangerId,
      name: 'Theirs',
      updatedAt: new Date('2026-09-13T03:00:00.000Z'),
    },
  ];
  let rows: Array<{ ownerId: string }>;
  /** What the owner's project count answers, for the R5 ceiling. */
  let owned: number;
  /** Whether the daily registration budget has room left (review R5). */
  let withinBudget: boolean;
  let inserted: Array<Record<string, unknown>>;
  let conditions: SQL[];
  let ensureRepository: ReturnType<typeof vi.fn>;
  /** What the caller's plan entitles, which N5 checks before either write. */
  let canSyncFiles: boolean;
  let controller: ProjectsController;

  const entitlements = (): CommercialEntitlementsService => ({
    getEntitlements: async () => ({
      canSyncFiles,
      canCreatePrivateShares: canSyncFiles,
      canUseProKernels: canSyncFiles,
    }),
  });

  /** The one string a `column = $1` condition carries: the owner being asked for. */
  const ownerOf = (condition: SQL | undefined): string | undefined =>
    condition?.queryChunks
      .map((chunk) => (chunk as Readonly<{ value?: unknown }>).value)
      .find((value): value is string => typeof value === 'string');

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
    ensureRepository = vi.fn(async (id: string) => `/git/${id}.git`);
    const databaseStub = {
      database: {
        /* The projection says which query this is: `{ value: count() }` is the
           R5 ceiling's count, anything else is a row read. */
        select: (projection?: Record<string, unknown>) => ({
          from: () => ({
            where: (condition: SQL) => {
              conditions.push(condition);
              const mine = table.filter((row) => row.ownerId === ownerOf(condition));
              const counting = projection !== undefined && 'value' in projection;
              return {
                limit: async (): Promise<unknown[]> => (counting ? [{ value: owned }] : rows),
                orderBy: async (): Promise<typeof mine> => mine,
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
      databaseStub as unknown as DatabaseService,
      { ensureRepository } as unknown as GitRepositoryService,
      {
        consumeDailyBudget: async () => ({ allowed: withinBudget, count: 1 }),
      } as unknown as PublicationRateLimiterService,
      entitlements(),
    );
  });

  it('creates the caller’s project row and its bare repository', async () => {
    await expect(controller.register(projectId, body('Bracket'), ownerId)).resolves.toEqual({ id: projectId });
    expect(inserted).toEqual([{ id: projectId, ownerId, name: 'Bracket', origin: 'local-mirror' }]);
    expect(ensureRepository).toHaveBeenCalledWith(projectId);
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
    expect(ensureRepository).not.toHaveBeenCalled();
  });

  it('is idempotent for the owner and still reconciles the repository', async () => {
    rows = [{ ownerId }];
    await expect(controller.register(projectId, body('Bracket'), ownerId)).resolves.toEqual({ id: projectId });
    expect(inserted).toEqual([]);
    expect(ensureRepository).toHaveBeenCalledWith(projectId);
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
    expect(ensureRepository).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
  });

  /* Review R6: the loser of a race on one id inserts nothing, so the re-read is
     the only thing that can tell it the id is not its own. Without it the loser
     is answered `200` for somebody else's project. */
  it('answers 404 when it loses the insert race for the id', async () => {
    const stranger = [{ ownerId: strangerId }];
    let reads = 0;
    const racing = {
      database: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async (): Promise<Array<{ ownerId: string }>> => {
                reads += 1;
                /* Absent when the route looks, another account's by the time the
                   insert has been attempted. */
                return reads === 1 ? [] : stranger;
              },
            }),
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
      { ensureRepository } as unknown as GitRepositoryService,
      { consumeDailyBudget: async () => ({ allowed: true, count: 1 }) } as unknown as PublicationRateLimiterService,
      entitlements(),
    );

    await expect(contested.register(projectId, body(), ownerId)).rejects.toMatchObject({
      response: { code: 'PROJECT_NOT_FOUND' },
    });
    expect(ensureRepository).not.toHaveBeenCalled();
  });

  /* Review R5: P51 made bare-repository creation reachable without a publish, so
     it needs a ceiling. The cap counts projects, not calls, so an owner at the
     cap can still re-register what it already has. */
  it('refuses the registration past the per-account project ceiling', async () => {
    owned = registeredProjectLimitPerOwner;
    await expect(controller.register(projectId, body(), ownerId)).rejects.toMatchObject({
      response: { code: 'PROJECT_LIMIT_REACHED' },
    });
    expect(inserted).toEqual([]);
    expect(ensureRepository).not.toHaveBeenCalled();

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
    expect(ensureRepository).not.toHaveBeenCalled();
  });

  it('refuses an id that cannot name a repository before it writes anything', async () => {
    await expect(controller.register('../escape', body(), ownerId)).rejects.toBeInstanceOf(BadRequestException);
    expect(ensureRepository).not.toHaveBeenCalled();
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
  it('lists only the caller’s own projects', async () => {
    await expect(controller.list(ownerId)).resolves.toEqual([
      { id: 'proj_ownerbracket00000', name: 'Bracket', updatedAt: '2026-09-13T02:00:00.000Z' },
      { id: 'proj_ownerhinge0000000', name: 'Hinge', updatedAt: '2026-09-13T01:00:00.000Z' },
    ]);
    expect(conditions.at(-1)).toEqual(eq(project.ownerId, ownerId));

    await expect(controller.list(strangerId)).resolves.toEqual([
      { id: 'proj_strangerpart00000', name: 'Theirs', updatedAt: '2026-09-13T03:00:00.000Z' },
    ]);
    expect(conditions.at(-1)).toEqual(eq(project.ownerId, strangerId));
  });
});
