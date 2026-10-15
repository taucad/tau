/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- Nest decorators and runtime DI metadata. */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpException,
  HttpStatus,
  Param,
  Put,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import { isProjectRepositoryId } from '#api/git/git.constants.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import { ProjectPreviewDto } from '#api/projects/project-preview.dto.js';
import { ProjectPreviewService } from '#api/projects/project-preview.service.js';

@Controller({ path: 'projects', version: '1' })
@UseAuth()
export class ProjectPreviewController {
  public constructor(
    private readonly access: ProjectAccessService,
    private readonly previews: ProjectPreviewService,
    private readonly rateLimiter: PublicationRateLimiterService,
  ) {}

  @Get(':projectId/preview')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  public async get(
    @Param('projectId') projectId: string,
    @User('id') userId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile | undefined> {
    this.validateId(projectId);
    const { ownerId } = await this.access.authorize(projectId, userId, 'read');
    const bytes = await this.previews.get({ ownerId, projectId });
    if (!bytes) {
      void reply.status(HttpStatus.NO_CONTENT);
      return undefined;
    }
    void reply.header('etag', `"${createHash('sha256').update(bytes).digest('hex')}"`);
    return new StreamableFile(bytes, { type: 'image/webp', length: bytes.length });
  }

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- Nest parameter decorators bind project, session, body and conditional header independently.
  @Put(':projectId/preview')
  @Header('Cache-Control', 'private, no-store')
  public async put(
    @Param('projectId') projectId: string,
    @User('id') userId: string,
    @Body() body: ProjectPreviewDto,
    @Headers('if-none-match') ifNoneMatch?: string,
  ): Promise<{ version: string }> {
    this.validateId(projectId);
    const { ownerId } = await this.access.authorize(projectId, userId, 'write');
    const budget = await this.rateLimiter.consumeDailyBudget({ key: `project:preview:${userId}`, limit: 1000 });
    if (!budget.allowed) {
      throw new HttpException('Too many preview updates today', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (ifNoneMatch !== undefined && ifNoneMatch !== '*') {
      throw new BadRequestException('Expected If-None-Match: *');
    }
    return this.previews.put({ ownerId, projectId, image: body.image, createOnly: ifNoneMatch === '*' });
  }

  private validateId(projectId: string): void {
    if (!isProjectRepositoryId(projectId)) {
      throw new BadRequestException('Not a project id');
    }
  }
}
