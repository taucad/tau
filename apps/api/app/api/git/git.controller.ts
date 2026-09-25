/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  StreamableFile,
  UseFilters,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Environment } from '#config/environment.config.js';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import {
  gitRequestWindowSeconds,
  gitRequestsPerUserPerWindow,
  gitRequestsPerWindow,
  isGitService,
  negotiationInputLimitBytes,
  noCacheHeaders,
  projectIdFromRepository,
  quotaOverrunSlackBytes,
  serviceAdvertisementPrefix,
} from '#api/git/git.constants.js';
import { LfsBatchDto, LfsVerifyDto } from '#api/git/git.dto.js';
import { GitLfsService } from '#api/git/git-lfs.service.js';
import type { LfsBatchResponse, LfsQuotaRefusal } from '#api/git/git-lfs.service.js';
import { GitProtocolExceptionFilter } from '#api/git/git-protocol-exception.filter.js';
import { GitRepositoryService, gitRetryAfterSeconds } from '#api/git/git.service.js';
import type { AffectedPublication } from '#api/git/git.service.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';

const applyHeaders = (reply: FastifyReply, headers: Readonly<Record<string, string>>): void => {
  for (const [name, value] of Object.entries(headers)) {
    void reply.header(name, value);
  }
};

/**
 * The Tau Hosted Remote (charter D1, D3, D12): one tenant-prefixed repository
 * per project in object storage, served by git's own
 * `upload-pack`/`receive-pack --stateless-rpc` over a lease hydrated per
 * request, with the git-LFS batch API in front of presigned transfers.
 *
 * Smart HTTP only. The dumb-HTTP layout and `update-server-info` are gone
 * (D12): they were a second read path over a directory that no longer exists
 * between requests.
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
    private readonly rateLimiter: PublicationRateLimiterService,
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
    await this.admitRequest(reply, { userId, projectId, family: 'rpc' });

    if (!isGitService(service)) {
      /* A missing `service` used to mean "walk the dumb layout". D12 removed
         that layout, so the only thing an unnamed service can be now is a
         client asking for a protocol this remote does not speak. */
      throw new BadRequestException({
        code: 'GIT_SERVICE_UNKNOWN',
        message: 'This remote speaks git smart HTTP only; name a service.',
      });
    }

    const access = await this.repositories.authorize({
      projectId,
      userId,
      mode: service === 'git-receive-pack' ? 'write' : 'read',
    });
    const advertisement = await this.withRetryAfter(reply, async () =>
      this.repositories.advertiseRefs(access, service),
    );
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
    const projectId = this.requireProjectId(repository);
    await this.admitRequest(reply, { userId, projectId, family: 'rpc' });
    const access = await this.repositories.authorize({ projectId, userId, mode: 'read' });
    applyHeaders(reply, noCacheHeaders);

    const output = await this.withRetryAfter(reply, async () =>
      this.repositories.uploadPack({
        access,
        body: request.raw,
        gzipped: request.headers['content-encoding'] === 'gzip',
        /* A fetch's body is `want`/`have` negotiation rather than a pack, so it
           gets the flat negotiation ceiling — but it gets one: neither
           Fastify's `bodyLimit` (the git parser streams past it) nor git itself
           bounded `upload-pack`'s stdin (review C32). */
        maximumInputBytes: negotiationInputLimitBytes,
        abort: this.abortWhenClientLeaves(reply),
      }),
    );
    return new StreamableFile(output, { type: 'application/x-git-upload-pack-result' });
  }

  /**
   * A push. The whole response — headers included — is withheld until the
   * manifest commit resolves (D4, NI2), and what the client then receives is
   * git's own report-status, relayed verbatim so every per-ref `ok`/`ng` line
   * and every hook sentence reaches it unchanged (NI13).
   */
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
    const projectId = this.requireProjectId(repository);
    await this.admitRequest(reply, { userId, projectId, family: 'rpc' });
    const access = await this.repositories.authorize({ projectId, userId, mode: 'write' });
    applyHeaders(reply, noCacheHeaders);

    const output = await this.withRetryAfter(reply, async () =>
      this.repositories.receivePack({
        access,
        // D28/NI16: the pusher is the authenticated session, never the body.
        committedBy: userId,
        body: request.raw,
        gzipped: request.headers['content-encoding'] === 'gzip',
        maximumInputBytes: access.remainingBytes + quotaOverrunSlackBytes,
        abort: this.abortWhenClientLeaves(reply),
      }),
    );
    return new StreamableFile(Buffer.from(output), { type: 'application/x-git-receive-pack-result' });
  }

  /**
   * Git-lfs's batch API (S49). `upload` hands out presigned PUTs for the
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
    await this.admitRequest(reply, { userId, projectId, family: 'lfs' });
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
    await this.admitRequest(reply, { userId, projectId, family: 'lfs' });
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
   * The audited ref-removal verb (D24, I2): the only way a named version or a
   * conflict line leaves the Hosted Remote, since the push hook refuses every
   * deletion. Owner only.
   *
   * Removing a name a live publication points at answers `409
   * GIT_REF_PUBLISHED` carrying that publication in the body; the caller shows
   * it and asks again with `publication=<id>`, which retires the publication
   * with the name, so the person always sees what a removal affects before it
   * happens. The 409 is rendered here rather than thrown, because the global
   * exception filter keeps only the error envelope and the publication is the
   * point of this answer. `finalize` rather than `write` authorizes it,
   * because a removal must stay possible for an owner whose plan allowance is
   * spent — it is how they free some.
   *
   * @param repository - `<projectId>` or `<projectId>.git`.
   * @param ref - The full ref name, `refs/tags/*` or `refs/heads/conflicts/*`.
   * @param confirmPublicationId - The publication the caller was shown, when the name backs one.
   * @param userId - The authenticated caller.
   * @param reply - The reply, for `Retry-After`.
   * @returns The removed ref, the tip it held and the publication it retired, or the 409 to confirm.
   */
  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- NestJS parameter decorators bind independent request facets; bundling them would obscure the route contract
  @Delete(':repo/refs')
  public async removeRef(
    @Param('repo') repository: string,
    @Query('name') ref: string | undefined,
    @Query('publication') confirmPublicationId: string | undefined,
    @User('id') userId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<
    | { ref: string; tip: string; publication?: AffectedPublication }
    | { statusCode: number; code: 'GIT_REF_PUBLISHED'; error: string; publication: AffectedPublication }
  > {
    const projectId = this.requireProjectId(repository);
    await this.admitRequest(reply, { userId, projectId, family: 'rpc' });
    if (ref === undefined || ref === '') {
      throw new BadRequestException({ code: 'GIT_REF_NOT_REMOVABLE', message: 'Name the ref to remove.' });
    }
    const access = await this.repositories.authorize({ projectId, userId, mode: 'finalize' });
    const removal = await this.withRetryAfter(reply, async () =>
      this.repositories.removeRef({
        access,
        ref,
        committedBy: userId,
        ...(confirmPublicationId === undefined ? {} : { confirmPublicationId }),
      }),
    );
    if (removal.outcome === 'confirm') {
      void reply.status(HttpStatus.CONFLICT);
      return {
        statusCode: HttpStatus.CONFLICT,
        code: 'GIT_REF_PUBLISHED',
        error: `Removing this name retires the publication “${removal.publication.title}”; confirm it to remove the name.`,
        publication: removal.publication,
      };
    }
    return {
      ref: removal.ref,
      tip: removal.tip,
      ...(removal.publication === undefined ? {} : { publication: removal.publication }),
    };
  }

  /**
   * Spends one request of this caller's account-wide budget and of its budget
   * on this project (D22, I11).
   *
   * Before authorization, so a loop — on one project or cycling many — is
   * refused before it costs a database read; the keys are the caller's own,
   * so it cannot drain anybody else's.
   *
   * @throws HttpException `429` with `Retry-After` when the window is spent.
   */
  private async admitRequest(
    reply: FastifyReply,
    args: { userId: string; projectId: string; family: keyof typeof gitRequestsPerWindow },
  ): Promise<void> {
    for (const bucket of [
      { key: `git:user:${args.userId}`, limit: gitRequestsPerUserPerWindow },
      { key: `git:${args.family}:${args.userId}:${args.projectId}`, limit: gitRequestsPerWindow[args.family] },
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- the account-wide budget first, then this project's
      const budget = await this.rateLimiter.consumeWindowBudget({ ...bucket, windowSeconds: gitRequestWindowSeconds });
      if (!budget.allowed) {
        void reply.header('retry-after', String(budget.retryAfterSeconds));
        throw new HttpException(
          { code: 'GIT_RATE_LIMITED', message: 'Too many requests; retry shortly.' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
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

  /**
   * The child outlives neither an incomplete response nor a client that walks
   * away: an upload-pack whose reader disappears would otherwise block on a
   * full stdout pipe. A completed response lets the child finish.
   */
  private abortWhenClientLeaves(reply: FastifyReply): AbortSignal {
    const abort = new AbortController();
    reply.raw.once('close', () => {
      if (!reply.raw.writableFinished) {
        abort.abort();
      }
    });
    return abort.signal;
  }

  /**
   * Attaches `Retry-After` to every 503 and service-raised 429 this controller
   * answers.
   *
   * The 503s all mean the same thing to a client: a lost manifest race (D4), a
   * worker with no lease disk (D33) and an owner already holding this worker's
   * other lease (D22) are all "come back shortly". The 429 is the owner's daily
   * hydrate budget (D22), which carries its own wait. The filter that renders a
   * git-protocol refusal writes status and body onto this same reply, so a
   * header set here survives it.
   */
  private async withRetryAfter<T>(reply: FastifyReply, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        void reply.header('retry-after', String(gitRetryAfterSeconds));
      } else if (error instanceof HttpException) {
        /* The daily hydrate budget's 429 names its own wait in the body. */
        const { retryAfterSeconds } = error.getResponse() as { retryAfterSeconds?: unknown };
        if (typeof retryAfterSeconds === 'number') {
          void reply.header('retry-after', String(retryAfterSeconds));
        }
      }
      throw error;
    }
  }
}
