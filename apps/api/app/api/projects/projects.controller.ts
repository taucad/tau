/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Put,
} from '@nestjs/common';
import { count, desc, eq } from 'drizzle-orm';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import { DatabaseService } from '#database/database.service.js';
import { project } from '#database/schema.js';
import type { CommercialEntitlementsService } from '#api/entitlements/commercial-entitlements.js';
import { commercialEntitlementsKey } from '#api/entitlements/commercial-entitlements.js';
import {
  isProjectRepositoryId,
  projectRegistrationsPerOwnerPerDay,
  registeredProjectLimitPerOwner,
} from '#api/git/git.constants.js';
import { GitRepositoryService } from '#api/git/git.service.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import { RegisterProjectDto } from '#api/projects/projects.dto.js';

/**
 * Registering a project on Tau Cloud (ruling P51, W18 DEF-1).
 *
 * *Connect Tau Cloud* is the verb that makes a project exist on the remote.
 * Until this route existed, the only production writer of the `project` table
 * was `PublicationsService`, which runs **after** a successful push — so a
 * project that had never been published answered `404` on both git
 * advertisements and could never be connected at all.
 *
 * Publication stays a separate, later writer: it re-points the same row with
 * the name and description a publication carries.
 */
@Controller({ path: 'projects', version: '1' })
@UseAuth()
export class ProjectsController {
  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly repositories: GitRepositoryService,
    private readonly rateLimiter: PublicationRateLimiterService,
    @Inject(commercialEntitlementsKey)
    private readonly entitlementsService: CommercialEntitlementsService,
  ) {}

  /**
   * The caller's own projects, so a second device can name one (W18 DEF-2).
   *
   * A device that has never held a project cannot open it from the Tau Hosted
   * Remote without learning its id, and the id is the repository path. This is
   * the one route that answers with more than one: authenticated, filtered to
   * the caller's own rows, and carrying nothing a project page does not already
   * show. `git.service.ts`'s rule that a *git* client must not learn which
   * repositories exist is about the unauthenticated git surface and is untouched.
   *
   * @param userId - The signed-in caller.
   * @returns Every project this account owns, most recently changed first.
   */
  @Get()
  public async list(
    @User('id') userId: string,
  ): Promise<ReadonlyArray<{ id: string; name: string; updatedAt: string }>> {
    const { database } = this.databaseService;
    const rows = await database
      .select({ id: project.id, name: project.name, updatedAt: project.updatedAt })
      .from(project)
      .where(eq(project.ownerId, userId))
      .orderBy(desc(project.updatedAt));
    return rows.map((row) => ({ id: row.id, name: row.name, updatedAt: row.updatedAt.toISOString() }));
  }

  /**
   * Claim this project id for the caller and give it a bare repository.
   *
   * Idempotent: a second call from the owner is a no-op that still reconciles
   * the repository's hooks, which is what makes *Connect* safe to retry.
   *
   * Bounded twice (review R5), because this route is what made repository
   * creation reachable without a publish: a per-account ceiling on how many
   * projects may exist, and a daily ceiling on how often the route may be
   * called at all.
   *
   * @param projectId - The project id, which is also its repository name.
   * @param body - The name to record when the row is created.
   * @param userId - The signed-in caller, who becomes the owner.
   * @returns The registered project's id.
   * @throws BadRequestException When the id cannot name a repository.
   * @throws NotFoundException When the id is already another account's (P55).
   * @throws ForbiddenException When the plan does not entitle syncing (N5), or when the account is at its project ceiling.
   * @throws HttpException When the account is over its daily registration budget.
   */
  @Put(':projectId')
  public async register(
    @Param('projectId') projectId: string,
    @Body() body: RegisterProjectDto,
    @User('id') userId: string,
  ): Promise<{ id: string }> {
    if (!isProjectRepositoryId(projectId)) {
      throw new BadRequestException({
        code: 'PROJECT_ID_INVALID',
        message: 'Not a project id',
      });
    }

    const budget = await this.rateLimiter.consumeDailyBudget({
      key: `project:register:${userId}`,
      limit: projectRegistrationsPerOwnerPerDay,
    });
    if (!budget.allowed) {
      throw new HttpException(
        { code: 'PROJECT_REGISTRATION_RATE_LIMITED', message: 'Too many project registrations today' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const { database } = this.databaseService;
    const existing = await this.ownerOf(projectId);
    if (existing !== undefined && existing !== userId) {
      throw this.notFound();
    }

    /* Before the row and before the repository (N5). Registration is the write
       *Connect Tau Cloud* makes, and every subsequent push is refused with this
       same sentence at `git.service.ts` — so without this guard a free account
       connected successfully, got a `project` row and a bare repository with
       hooks on the shared volume, and then could never use either. Four such
       orphans exist on the operator's own account; each one spends a slot of
       the 200-project ceiling that a later paid plan would want.

       After the ownership check, not before it: ruling P55 says an id that is
       somebody else's answers `404` on every surface, and a plan refusal that
       preceded it would replace that answer for an un-entitled caller. */
    const entitlements = await this.entitlementsService.getEntitlements(userId);
    if (!entitlements.canSyncFiles) {
      throw new ForbiddenException({
        code: 'GIT_SYNC_NOT_ENTITLED',
        message: 'Syncing files to Tau Cloud is a paid plan feature.',
      });
    }

    if (existing === undefined) {
      const [counted] = await database
        .select({ value: count() })
        .from(project)
        .where(eq(project.ownerId, userId))
        .limit(1);
      if ((counted?.value ?? 0) >= registeredProjectLimitPerOwner) {
        throw new ForbiddenException({
          code: 'PROJECT_LIMIT_REACHED',
          message: `This account has reached its limit of ${String(registeredProjectLimitPerOwner)} projects on Tau Cloud.`,
        });
      }

      /* `onConflictDoNothing` and then read the row back (review R6): two
         callers racing on one id both reach this line, exactly one insert
         lands, and the re-read is what tells the loser whose id it is. Without
         it the loser's insert is a silent no-op and it would be answered `200`
         for somebody else's project. */
      await database
        .insert(project)
        .values({
          id: projectId,
          ownerId: userId,
          name: body.name ?? 'Untitled project',
          origin: 'local-mirror',
        })
        .onConflictDoNothing();
      if ((await this.ownerOf(projectId)) !== userId) {
        throw this.notFound();
      }
    }

    /* Guarded by `isProjectRepositoryId` inside the service for every caller
       (W8 review R1), so nothing outside `TAU_GIT_ROOT` is ever created. */
    await this.repositories.ensureRepository(projectId);
    return { id: projectId };
  }

  /**
   * Who owns this project id, if anybody.
   *
   * @param projectId - The id to look up.
   * @returns The owner's user id, or `undefined` when no row holds the id.
   */
  private async ownerOf(projectId: string): Promise<string | undefined> {
    const [row] = await this.databaseService.database
      .select({ ownerId: project.ownerId })
      .from(project)
      .where(eq(project.id, projectId))
      .limit(1);
    return row?.ownerId;
  }

  /**
   * The one answer a caller who does not own an id ever gets (ruling P55).
   *
   * The same answer for "no such project" and "not yours", which is the rule
   * `git.service.ts` states for the git surface and now holds here too: a
   * signed-in caller must not be able to use this route as an oracle for which
   * project ids exist.
   *
   * @returns The exception to throw.
   */
  private notFound(): NotFoundException {
    return new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Project not found' });
  }
}
