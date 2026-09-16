/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
/* eslint-disable @typescript-eslint/naming-convention -- git hook environment variables are SCREAMING_SNAKE_CASE */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseFilters,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Environment } from '#config/environment.config.js';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import {
  dumbHttpContentType,
  isGitService,
  negotiationInputLimitBytes,
  noCacheHeaders,
  projectIdFromRepository,
  quotaOverrunSlackBytes,
  serviceAdvertisementPrefix,
} from '#api/git/git.constants.js';
import type { GitService as GitSmartService } from '#api/git/git.constants.js';
import { LfsBatchDto, LfsVerifyDto } from '#api/git/git.dto.js';
import { GitLfsService } from '#api/git/git-lfs.service.js';
import type { LfsBatchResponse, LfsQuotaRefusal } from '#api/git/git-lfs.service.js';
import { GitProtocolExceptionFilter } from '#api/git/git-protocol-exception.filter.js';
import { GitRepositoryService } from '#api/git/git.service.js';

const applyHeaders = (reply: FastifyReply, headers: Readonly<Record<string, string>>): void => {
  for (const [name, value] of Object.entries(headers)) {
    void reply.header(name, value);
  }
};

/**
 * The Tau Hosted Remote (A16, D15, S25): one bare repository per project on the
 * volume, served by git's own `upload-pack`/`receive-pack --stateless-rpc`,
 * with the git-LFS batch API in front of presigned R2 transfers and a
 * read-only dumb-HTTP layout kept current by `update-server-info`.
 *
 * The API never parses what a client pushes (D25): chats are refs like any
 * other, and their bytes go into the pack unread.
 */
@Controller({ path: 'git', version: '1' })
@UseAuth()
export class GitController {
  /**
   * This API's own browser-facing origin, which is where a git-lfs `verify`
   * action has to point. Never `request.protocol`/`request.host`: behind Fly
   * TLS terminates at the proxy and the container is reached over plain HTTP,
   * so the derived href was `http://` — and `git-lfs.service.ts` attaches the
   * caller's own Tau bearer to that action (review C24, charter I8). The
   * `Host` header is the client's, so the same line let a caller retarget its
   * own credential. `git-proxy.controller.ts` already reads the validated
   * config value exactly this way.
   */
  readonly #apiUrl: string;

  public constructor(
    configService: ConfigService<Environment, true>,
    private readonly repositories: GitRepositoryService,
    private readonly lfs: GitLfsService,
  ) {
    this.#apiUrl = configService.get('TAU_API_URL', { infer: true }).replace(/\/+$/u, '');
  }

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- NestJS parameter decorators bind independent request facets; bundling them would obscure the route contract
  @UseFilters(GitProtocolExceptionFilter)
  @Get(':repo/info/refs')
  public async infoRefs(
    @Param('repo') repository: string,
    @Query('service') service: string | undefined,
    @User('id') userId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const projectId = this.requireProjectId(repository);
    applyHeaders(reply, noCacheHeaders);

    if (service === undefined) {
      // Dumb-HTTP read: the `info/refs` file that `update-server-info` wrote.
      const access = await this.repositories.authorize({
        projectId,
        userId,
        mode: 'read',
      });
      const file = this.repositories.openDumbHttpFile(access.repositoryPath, 'info/refs');
      if (file === undefined) {
        throw new NotFoundException({
          code: 'GIT_OBJECT_NOT_FOUND',
          message: 'Not found',
        });
      }
      return new StreamableFile(file, { type: 'text/plain' });
    }

    if (!isGitService(service)) {
      throw new BadRequestException({
        code: 'GIT_SERVICE_UNKNOWN',
        message: 'Unknown git service',
      });
    }

    const access = await this.repositories.authorize({
      projectId,
      userId,
      mode: service === 'git-receive-pack' ? 'write' : 'read',
    });
    const advertisement = await this.repositories.advertiseRefs(access.repositoryPath, service);
    return new StreamableFile(
      Buffer.concat([Buffer.from(serviceAdvertisementPrefix(service), 'utf8'), advertisement]),
      { type: `application/x-${service}-advertisement` },
    );
  }

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- NestJS parameter decorators bind independent request facets; bundling them would obscure the route contract
  @UseFilters(GitProtocolExceptionFilter)
  @Post(':repo/git-upload-pack')
  @HttpCode(200)
  public async uploadPack(
    @Param('repo') repository: string,
    @User('id') userId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    return this.rpc({
      repository,
      userId,
      request,
      reply,
      service: 'git-upload-pack',
    });
  }

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- NestJS parameter decorators bind independent request facets; bundling them would obscure the route contract
  @UseFilters(GitProtocolExceptionFilter)
  @Post(':repo/git-receive-pack')
  @HttpCode(200)
  public async receivePack(
    @Param('repo') repository: string,
    @User('id') userId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    return this.rpc({
      repository,
      userId,
      request,
      reply,
      service: 'git-receive-pack',
    });
  }

  /**
   * Git-lfs's batch API (S49). `upload` hands out presigned R2 PUTs for the
   * objects the store is missing and refuses the whole batch with the file list
   * when they do not fit in the plan (D16); `download` hands out presigned GETs.
   */
  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- NestJS parameter decorators bind independent request facets; bundling them would obscure the route contract
  @Post(':repo/info/lfs/objects/batch')
  public async lfsBatch(
    @Param('repo') repository: string,
    @Body() body: LfsBatchDto,
    @User('id') userId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LfsBatchResponse | LfsQuotaRefusal> {
    const projectId = this.requireProjectId(repository);
    const access = await this.repositories.authorize({
      projectId,
      userId,
      mode: body.operation === 'upload' ? 'write' : 'read',
    });
    const outcome = await this.lfs.batch({
      access,
      operation: body.operation,
      objects: body.objects,
      authorization: request.headers.authorization,
      endpoint: `${this.#apiUrl}/v1/git/${repository}/info/lfs/objects`,
    });
    void reply.header('content-type', 'application/vnd.git-lfs+json');
    void reply.status(outcome.status);
    return outcome.body;
  }

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- NestJS parameter decorators bind independent request facets; bundling them would obscure the route contract
  @Post(':repo/info/lfs/objects/verify')
  public async lfsVerify(
    @Param('repo') repository: string,
    @Body() body: LfsVerifyDto,
    @User('id') userId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const projectId = this.requireProjectId(repository);
    const access = await this.repositories.authorize({
      projectId,
      userId,
      mode: 'finalize',
    });
    const stored = await this.lfs.verify({
      access,
      oid: body.oid,
      size: body.size,
    });
    if (!stored) {
      throw new NotFoundException({
        code: 'GIT_LFS_OBJECT_MISSING',
        message: 'Object was not stored',
      });
    }
    void reply.header('content-type', 'application/vnd.git-lfs+json');
    void reply.status(200);
  }

  /**
   * The read-only dumb-HTTP layout: `HEAD`, `objects/**`, `refs/**`. Stock git
   * clones from it when smart HTTP is unavailable, and it costs nothing to keep
   * — `post-receive` runs `update-server-info` after every push.
   */
  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- NestJS parameter decorators bind independent request facets; bundling them would obscure the route contract
  @UseFilters(GitProtocolExceptionFilter)
  @Get(':repo/*')
  public async dumbHttp(
    @Param('repo') repository: string,
    @User('id') userId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const projectId = this.requireProjectId(repository);
    const relativePath = (request.params as Record<string, string | undefined>)['*'] ?? '';
    const access = await this.repositories.authorize({
      projectId,
      userId,
      mode: 'read',
    });
    const file = this.repositories.openDumbHttpFile(access.repositoryPath, relativePath);
    if (file === undefined) {
      throw new NotFoundException({
        code: 'GIT_OBJECT_NOT_FOUND',
        message: 'Not found',
      });
    }
    applyHeaders(reply, noCacheHeaders);
    return new StreamableFile(file, {
      type: dumbHttpContentType(relativePath),
    });
  }

  private requireProjectId(repository: string): string {
    const projectId = projectIdFromRepository(repository);
    if (projectId === undefined) {
      throw new NotFoundException({
        code: 'GIT_REPOSITORY_NOT_FOUND',
        message: 'Repository not found',
      });
    }
    return projectId;
  }

  private async rpc(args: {
    repository: string;
    userId: string;
    request: FastifyRequest;
    reply: FastifyReply;
    service: GitSmartService;
  }): Promise<StreamableFile> {
    const projectId = this.requireProjectId(args.repository);
    const write = args.service === 'git-receive-pack';
    const access = await this.repositories.authorize({
      projectId,
      userId: args.userId,
      mode: write ? 'write' : 'read',
    });

    applyHeaders(args.reply, noCacheHeaders);
    // The child outlives neither an incomplete response nor a client that walks
    // away: an upload-pack whose reader disappears would otherwise block on a
    // full stdout pipe. A completed response lets the child finish its hooks.
    const abort = new AbortController();
    args.reply.raw.once('close', () => {
      if (!args.reply.raw.writableFinished) {
        abort.abort();
      }
    });
    /* `authorize` measured this owner's usage on this same request; re-reading
       the account-wide aggregate under the gate answered the same number one
       round-trip later (review C28). */
    const admission = write ? this.repositories.admitGitPush(access) : undefined;
    const remainingBytes = admission?.remainingBytes ?? access.remainingBytes;
    const output = this.repositories.serve({
      abort: abort.signal,
      repositoryPath: access.repositoryPath,
      service: args.service,
      body: args.request.raw,
      gzipped: args.request.headers['content-encoding'] === 'gzip',
      environment: write
        ? {
            // The `pre-receive` hook reads both: it refuses a push that did not come
            // through this admission check, and refuses one whose quarantined
            // objects do not fit in what is left of the plan (D17).
            TAU_GIT_PUSH_ADMITTED: '1',
            TAU_GIT_QUOTA_REMAINING_BYTES: String(remainingBytes),
          }
        : undefined,
      /* A fetch's body is `want`/`have` negotiation rather than a pack, so it
         gets the flat negotiation ceiling instead of the plan's headroom — but
         it gets one: neither Fastify's `bodyLimit` (the git parser streams past
         it) nor git itself bounded `upload-pack`'s stdin (review C32). */
      maximumInputBytes: write ? remainingBytes + quotaOverrunSlackBytes : negotiationInputLimitBytes,
      ...(write
        ? {
            accountFor: projectId,
            releaseStorageAdmission: admission?.release,
          }
        : {}),
    });

    return new StreamableFile(output, {
      type: `application/x-${args.service}-result`,
    });
  }
}
