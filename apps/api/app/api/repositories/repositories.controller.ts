/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and metadata requires runtime class imports */
import { Controller, Get, Ip, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PublicAuth } from '#auth/decorators/auth.decorator.js';
import { ArchiveQueryDto, BranchesQueryDto } from '#api/repositories/repositories.dto.js';
import type { GithubBranchesResponse } from '#api/repositories/repositories.dto.js';
import { RepositoriesService } from '#api/repositories/repositories.service.js';

@Controller({ path: 'repositories', version: '1' })
export class RepositoriesController {
  public constructor(private readonly repositoriesService: RepositoriesService) {}

  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- NestJS parameter decorators bind four independent request facets.
  @Get('archive')
  @PublicAuth()
  // oxlint-disable-next-line max-params -- NestJS parameter decorators bind four independent request facets.
  public async getArchive(
    @Query() query: ArchiveQueryDto,
    @Ip() ip: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const requestAbort = new AbortController();
    const abort = (): void => {
      requestAbort.abort();
    };
    if (request.raw.destroyed) {
      abort();
    } else {
      request.raw.once('aborted', abort);
    }

    try {
      const response = await this.repositoriesService.getArchive(query, ip, requestAbort.signal);
      void reply.status(response.status);
      for (const [name, value] of response.headers) {
        void reply.header(name, value);
      }
      void reply.send(Buffer.from(await response.arrayBuffer()));
    } finally {
      request.raw.off('aborted', abort);
    }
  }

  @Get('branches')
  @PublicAuth()
  public async listBranches(@Query() query: BranchesQueryDto, @Ip() ip: string): Promise<GithubBranchesResponse> {
    return this.repositoriesService.listBranches(query, ip);
  }
}
