/* oxlint-disable new-cap -- NestJS parameter decorators */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ZodSerializerDto } from 'nestjs-zod';
import { AuthGuard, OptionalAuth, OptionalUser, UseAuth, User } from '@taucad/api-auth';
import { MetricsService } from '@taucad/api-observability/metrics';
import { PublishRequestDto, PublishResponseDto } from '#publications/publications.dto.js';
import { PublicationsService } from '#publications/publications.service.js';
import { ViewerIdentity } from '#publications/viewer-identity.decorator.js';
import { ViewerIdentityInterceptor } from '#publications/viewer-identity.interceptor.js';
import type { ResolvedViewerIdentity } from '#publications/viewer-identity.types.js';

/**
 * Matches an `If-None-Match` request header against a strong ETag. Handles
 * comma-separated candidate lists, weak validators (`W/`), and `*`.
 */
export const ifNoneMatchSatisfied = (headerValue: string, etag: string): boolean =>
  headerValue.split(',').some((candidate) => {
    const normalized = candidate.trim().replace(/^W\//u, '');
    return normalized === '*' || normalized === etag;
  });

const deniedStatuses = new Set<number>([HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN]);
const notFoundStatuses = new Set<number>([HttpStatus.NOT_FOUND, HttpStatus.GONE]);

/** Telemetry outcome for a failed publication file request. */
export const fileRequestFailureOutcome = (error: unknown): 'denied' | 'not_found' | 'error' => {
  if (error instanceof HttpException) {
    const status = error.getStatus();
    if (deniedStatuses.has(status)) {
      return 'denied';
    }

    if (notFoundStatuses.has(status)) {
      return 'not_found';
    }
  }

  return 'error';
};

@Controller({ path: 'publications', version: '1' })
@UseGuards(AuthGuard)
export class PublicationsController {
  public constructor(
    private readonly publicationsService: PublicationsService,
    private readonly metrics: MetricsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseAuth()
  @ZodSerializerDto(PublishResponseDto)
  public async publish(@User('id') ownerId: string, @Body() body: PublishRequestDto): Promise<PublishResponseDto> {
    return this.publicationsService.publishFromRevision({ ownerId, request: body });
  }

  /**
   * Authenticated, publication-scoped file proxy for the bytes of a private
   * cloud link, authorized through the publication's project link.
   * `Cache-Control: private, no-cache` + strong sha ETags let clients cache
   * bodies while revalidating on every use, so removing access or stopping the
   * link takes effect immediately without forfeiting client caching.
   */
  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- NestJS parameter decorators bind five independent request facets (route param, query, session user, conditional header, reply); an object-bundling decorator would obscure the route contract
  @Get(':id/files')
  @OptionalAuth()
  public async getPublicationFile(
    @Param('id') publicationId: string,
    @Query('path') path: string | undefined,
    @OptionalUser('id') viewerUserId: string | undefined,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile | undefined> {
    try {
      const resolved = await this.publicationsService.resolvePublicationFile({
        publicationId,
        viewerUserId,
        path: path ?? '',
      });

      void reply.header('etag', resolved.etag);
      void reply.header('cache-control', 'private, no-cache');

      if (ifNoneMatch !== undefined && ifNoneMatchSatisfied(ifNoneMatch, resolved.etag)) {
        this.metrics.publicationFileRequestsTotal.add(1, { outcome: 'revalidated' });
        void reply.status(HttpStatus.NOT_MODIFIED);
        return undefined;
      }

      const file = await this.publicationsService.openPublicationFile(resolved.sha256Hex, resolved.path, resolved.key);
      this.metrics.publicationFileRequestsTotal.add(1, { outcome: 'served' });

      return new StreamableFile(file.body, {
        type: file.contentType,
        ...(file.contentLength === undefined ? {} : { length: file.contentLength }),
      });
    } catch (error) {
      this.metrics.publicationFileRequestsTotal.add(1, { outcome: fileRequestFailureOutcome(error) });
      throw error;
    }
  }

  @Patch(':id/views')
  @HttpCode(HttpStatus.NO_CONTENT)
  @OptionalAuth()
  @UseInterceptors(ViewerIdentityInterceptor)
  public async recordView(
    @Param('id') publicationId: string,
    @ViewerIdentity() identity: ResolvedViewerIdentity,
  ): Promise<void> {
    await this.publicationsService.recordView({ publicationId, identity });
  }
}
