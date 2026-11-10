/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { buffer } from 'node:stream/consumers';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { hostDeviceOf, UseAuth, User } from '@taucad/api-auth';
import { ProjectAccessService } from '@taucad/api-projects/collaboration/project-access.service';
import { repositoryStoreKey } from '@taucad/api-git-core/git.constants';
import { decodeManifest, isTombstoned, pushRecordsAfter } from '@taucad/api-git-core/store/manifest';
import type { RepositoryStore } from '@taucad/api-git-core/store/port';
import { PublicationRateLimiterService } from '@taucad/api-redis';
import { GitRepositoryService } from '#api/git/git.service.js';
import { buildPushPage, parsePushAfter, pushersOf, pushReadsPerWindow, visiblePushes } from '#api/git/pushes.js';
import type { PushPage } from '#api/git/pushes.js';

const pushReadWindowSeconds = 60;

/**
 * `GET /v1/projects/:projectId/git/pushes[?after=<generation>]` (A3).
 *
 * Readable by any member, beside the catalogue route and from the same
 * manifest. A caller with no relation to the project is told it does not
 * exist (`404`, D27), as on every git surface. A project with no commit yet
 * answers an empty page with its directory.
 */
@Controller({ path: 'projects', version: '1' })
@UseAuth()
export class GitPushesController {
  public constructor(
    private readonly repositories: GitRepositoryService,
    private readonly projectAccess: ProjectAccessService,
    private readonly rateLimiter: PublicationRateLimiterService,
    @Inject(repositoryStoreKey) private readonly store: RepositoryStore,
  ) {}

  /**
   * One page of a project's push records, oldest first.
   *
   * @param projectId - The project.
   * @param afterQuery - The generation to read after; `0` or absent from the start.
   * @param userId - The authenticated caller.
   * @param request - Carries the cloud host a device call came through.
   * @param reply - Carries `Retry-After` on a refused read.
   * @returns The page.
   */
  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- NestJS parameter decorators bind independent request facets
  @Get(':projectId/git/pushes')
  public async pushes(
    @Param('projectId') projectId: string,
    @Query('after') afterQuery: unknown,
    @User('id') userId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<PushPage> {
    const after = parsePushAfter(afterQuery);
    if (after === undefined) {
      throw new BadRequestException({
        code: 'GIT_PUSHES_AFTER_INVALID',
        message: 'after names a generation: a whole number from 0.',
      });
    }
    const budget = await this.rateLimiter.consumeWindowBudget({
      key: `git:pushes:${userId}`,
      limit: pushReadsPerWindow,
      windowSeconds: pushReadWindowSeconds,
    });
    if (!budget.allowed) {
      void reply.header('retry-after', String(budget.retryAfterSeconds));
      throw new HttpException(
        { code: 'GIT_PUSHES_RATE_LIMITED', message: 'Too many requests; retry shortly.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    void reply.header('cache-control', 'no-store');
    const viaDevice = hostDeviceOf(request.raw)?.deviceId;
    const access = await this.repositories.authorize({ projectId, userId, mode: 'read', viaDevice });
    /* Q3: only the owner's own session sees who backed up an anonymous entry; a host device reads as a member. */
    const owner = access.role === 'owner' && access.viaDevice === undefined;
    const locator = await this.repositories.resolveActiveLocator(access);
    const read = await this.store.readManifest(locator);
    const manifest = read === undefined ? undefined : decodeManifest(read.manifest);
    const page =
      manifest === undefined || isTombstoned(manifest)
        ? { records: [] }
        : await pushRecordsAfter({
            manifest,
            after,
            readSegment: async (key) => new Uint8Array(await buffer(await this.store.getObject(locator, key))),
          });
    const entries = visiblePushes(page.records, { owner });
    const members = await this.projectAccess.directory(projectId, pushersOf(entries));
    return buildPushPage({ entries, members, ...(page.next === undefined ? {} : { next: page.next }) });
  }
}
