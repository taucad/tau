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
  Param,
  Put,
} from '@nestjs/common';
import { and, count, desc, eq, or } from 'drizzle-orm';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import { DatabaseService } from '#database/database.service.js';
import { project, projectCollaborator } from '#database/schema.js';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import type { ProjectRole } from '#api/collaboration/project-access.service.js';
import type { CommercialEntitlementsService } from '#api/entitlements/commercial-entitlements.js';
import { commercialEntitlementsKey } from '#api/entitlements/commercial-entitlements.js';
import {
  isProjectRepositoryId,
  projectRegistrationsPerOwnerPerDay,
  registeredProjectLimitPerOwner,
} from '#api/git/git.constants.js';
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
    private readonly rateLimiter: PublicationRateLimiterService,
    @Inject(commercialEntitlementsKey)
    private readonly entitlementsService: CommercialEntitlementsService,
    private readonly access: ProjectAccessService,
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
   * Since D27 this is also where a collaboration is named: the same shape with
   * the caller's `role` on each row, so a second device can open a project
   * somebody else owns exactly as it opens its own.
   *
   * @param userId - The signed-in caller.
   * @returns Every project this account owns or collaborates on, most recently changed first.
   */
  @Get()
  public async list(
    @User('id') userId: string,
  ): Promise<ReadonlyArray<{ id: string; name: string; updatedAt: string; role: ProjectRole }>> {
    const { database } = this.databaseService;
    const rows = await database
      .select({
        id: project.id,
        name: project.name,
        updatedAt: project.updatedAt,
        ownerId: project.ownerId,
        role: projectCollaborator.role,
      })
      .from(project)
      .leftJoin(
        projectCollaborator,
        and(eq(projectCollaborator.projectId, project.id), eq(projectCollaborator.userId, userId)),
      )
      .where(or(eq(project.ownerId, userId), eq(projectCollaborator.userId, userId)))
      .orderBy(desc(project.updatedAt));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      updatedAt: row.updatedAt.toISOString(),
      role: row.ownerId === userId ? 'owner' : row.role === 'write' ? 'write' : 'read',
    }));
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
   * @throws NotFoundException When the id belongs to an account the caller has no relation to (P55).
   * @throws ForbiddenException When the caller is a collaborator rather than the owner, when the plan does not entitle syncing (N5), or when the account is at its project ceiling.
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
    /* D27: the id's existence is this route's question — it may have to create
       the row — but *whose* it is belongs to `ProjectAccessService`, the single
       authority. Registration is the owner's act, so `owner` is the need: a
       caller with no relation to the id gets the ruling-P55 `404`, and a
       collaborator on somebody else's project is refused `403` — they already
       know the project exists, so hiding it would only mislead. */
    const exists = await this.projectExists(projectId);
    if (exists) {
      await this.access.authorize(projectId, userId, 'owner');
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

    if (!exists) {
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
      /* The loser of the race inserted nothing, and `authorize` is what tells it
         so — with the same `404` a stranger's id gets (review R6, ruling P55). */
      await this.access.authorize(projectId, userId, 'owner');
    }

    /* No repository is created here any more (charter D1). A repository *is*
       its manifest, and the first manifest is written by the first push's
       commit — so registration is the row and nothing else. `isProjectRepositoryId`
       above still bounds the id, because that id becomes a storage key. */
    return { id: projectId };
  }

  /**
   * Whether any row holds this project id.
   *
   * Existence only: *whose* it is, and the ruling-P55 `404` that follows from
   * that, is `ProjectAccessService.authorize`'s answer and not this route's.
   *
   * @param projectId - The id to look up.
   * @returns Whether the id is taken.
   */
  private async projectExists(projectId: string): Promise<boolean> {
    const [row] = await this.databaseService.database
      .select({ id: project.id })
      .from(project)
      .where(eq(project.id, projectId))
      .limit(1);
    return row !== undefined;
  }
}
