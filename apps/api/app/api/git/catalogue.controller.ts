/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthoritativeSession, hostDeviceOf, UseAuth, User } from '@taucad/api-auth';
import { FileLinksService } from '@taucad/api-object-storage/file-links';
import { ObjectStorageService, TAU_DEFAULT_STORAGE_ACCOUNT_ID } from '@taucad/api-object-storage';
import {
  buildCatalogue,
  catalogueFamilies,
  catalogueLinkSeconds,
  catalogueReadsPerWindow,
  catalogueSizes,
  parseCatalogueFamilies,
} from '#api/git/catalogue.js';
import type { Catalogue } from '#api/git/catalogue.js';
import { repositoryStoreKey } from '@taucad/api-git-core/git.constants';
import { GitRepositoryService } from '#api/git/git.service.js';
import { decodeManifest, isTombstoned } from '@taucad/api-git-core/store/manifest';
import type { RepositoryStore } from '@taucad/api-git-core/store/port';
import { repositoryObjectKey } from '@taucad/api-git-core/store/repository-key';
import { PublicationRateLimiterService } from '@taucad/api-redis';

const catalogueWindowSeconds = 60;

/**
 * `GET /v1/projects/:projectId/git/catalogue[?refs=heads,tags,chats]`.
 *
 * Readable by anyone who may fetch the project. Answers `404
 * GIT_CATALOGUE_UNAVAILABLE` when the files host is off or the project's
 * bytes are not on Tau's default storage account — the client then opens
 * over smart HTTP as before — and for a repository with no commit yet.
 */
@Controller({ path: 'projects', version: '1' })
@UseAuth()
export class GitCatalogueController {
  public constructor(
    private readonly repositories: GitRepositoryService,
    private readonly rateLimiter: PublicationRateLimiterService,
    private readonly objectStorage: ObjectStorageService,
    @Inject(repositoryStoreKey) private readonly store: RepositoryStore,
    @Optional() private readonly fileLinks?: FileLinksService,
  ) {}

  /**
   * The catalogue of one project.
   *
   * @param projectId - The project.
   * @param familiesQuery - The families to return (`refs=heads,tags,chats`).
   * @param userId - The authenticated caller.
   * @param request - Carries the cloud host a device call came through.
   * @param reply - Carries `Retry-After` on a refused read.
   * @returns The catalogue.
   */
  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- NestJS parameter decorators bind independent request facets
  @Get(':projectId/git/catalogue')
  // Signs a 900 s link for every object: never from a session snapshot.
  @AuthoritativeSession()
  public async catalogue(
    @Param('projectId') projectId: string,
    @Query('refs') familiesQuery: unknown,
    @User('id') userId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Catalogue> {
    const families = parseCatalogueFamilies(familiesQuery);
    if (families === undefined) {
      throw new BadRequestException({
        code: 'GIT_CATALOGUE_REFS_UNKNOWN',
        message: 'refs names heads, tags or chats.',
      });
    }
    const budget = await this.rateLimiter.consumeWindowBudget({
      key: `git:catalogue:${userId}`,
      limit: catalogueReadsPerWindow,
      windowSeconds: catalogueWindowSeconds,
    });
    if (!budget.allowed) {
      void reply.header('retry-after', String(budget.retryAfterSeconds));
      throw new HttpException(
        { code: 'GIT_CATALOGUE_RATE_LIMITED', message: 'Too many requests; retry shortly.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    void reply.header('cache-control', 'no-store');
    const viaDevice = hostDeviceOf(request.raw)?.deviceId;
    const access = await this.repositories.authorize({ projectId, userId, mode: 'read', viaDevice });
    const locator = await this.repositories.resolveActiveLocator(access);
    const unavailable = new NotFoundException({
      code: 'GIT_CATALOGUE_UNAVAILABLE',
      message: 'This project opens over smart HTTP.',
    });
    const { fileLinks } = this;
    if (fileLinks?.enabled !== true || this.objectStorage.account.id !== TAU_DEFAULT_STORAGE_ACCOUNT_ID) {
      throw unavailable;
    }
    const read = await this.store.readManifest(locator);
    const manifest = read === undefined ? undefined : decodeManifest(read.manifest);
    if (manifest === undefined || isTombstoned(manifest)) {
      throw unavailable;
    }
    const heads = Object.entries(manifest.refs)
      .filter(([name]) => families.includes('heads') && name.startsWith(catalogueFamilies.heads))
      .map(([, tip]) => tip.oid);
    const sizes = await catalogueSizes(this.store, locator, [...new Set(heads)]);
    const expiresInSeconds = catalogueLinkSeconds;
    return buildCatalogue(manifest, {
      families,
      sizes,
      expiresAt: Math.floor(Date.now() / 1000) + expiresInSeconds,
      sign: async (key, bytes) =>
        fileLinks.sign({
          namespace: 'tenants',
          key: repositoryObjectKey(locator, key),
          tier: 'private',
          size: bytes,
          expiresInSeconds,
        }),
    });
  }
}
