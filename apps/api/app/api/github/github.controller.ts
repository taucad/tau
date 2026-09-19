/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators require runtime metadata. */
/* eslint-disable max-params-no-constructor/max-params-no-constructor -- Nest parameter decorators expose independent request facets. */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PublicAuth, UseAuth, User } from '#auth/decorators/auth.decorator.js';
import { GithubService } from '#api/github/github.service.js';
import type { Environment } from '#config/environment.config.js';

type AuthenticatedRequest = FastifyRequest & { session: { session: { id: string } } };
const pageOf = (value: string | undefined): number => {
  const page = Number(value ?? '1');
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) {
    throw new BadRequestException({ code: 'PAGE_INVALID' });
  }
  return page;
};
const idOf = (value: string): number => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new BadRequestException({ code: 'GITHUB_ID_INVALID' });
  }
  return id;
};

@Controller({ path: 'github', version: '1' })
@UseAuth()
export class GithubController {
  private readonly frontendOrigin: string;

  public constructor(
    private readonly github: GithubService,
    config: ConfigService<Environment, true>,
  ) {
    this.frontendOrigin = new URL(config.get('TAU_FRONTEND_URL', { infer: true })).origin;
  }

  @Post('connections/start')
  public async start(
    @User('id') userId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: { returnTo?: string; completionMode?: 'browser' | 'desktop-poll' },
  ): ReturnType<GithubService['start']> {
    const { origin } = request.headers;
    if (origin !== this.frontendOrigin && origin !== 'app://tau') {
      throw new BadRequestException({ code: 'ORIGIN_INVALID' });
    }
    return this.github.start(userId, request.session.session.id, body.returnTo, body.completionMode);
  }

  @Get('callback')
  @PublicAuth()
  public async callback(
    @Query('state') state: string,
    @Query('code') code: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const result = await this.github.callback(state, code);
    void reply.redirect(this.github.completionUrl(result.attemptId, result.returnTo, result.completionMode));
  }

  @Get('configuration')
  @Header('Cache-Control', 'no-store')
  public configuration(): ReturnType<GithubService['configuration']> {
    return this.github.configuration();
  }

  @Post('connections/complete')
  @Header('Cache-Control', 'no-store')
  public async complete(
    @User('id') userId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: { attemptId: string },
  ): ReturnType<GithubService['complete']> {
    return this.github.complete(userId, request.session.session.id, body.attemptId);
  }

  @Get('connections')
  @Header('Cache-Control', 'no-store')
  public async list(@User('id') userId: string): ReturnType<GithubService['list']> {
    return this.github.list(userId);
  }

  @Post('connections/:id/token')
  public async token(
    @User('id') userId: string,
    @Param('id') id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): ReturnType<GithubService['token']> {
    void reply.header('cache-control', 'no-store');
    return this.github.token(userId, id);
  }

  @Delete('connections/:id')
  public async remove(@User('id') userId: string, @Param('id') id: string): ReturnType<GithubService['remove']> {
    return this.github.remove(userId, id);
  }

  @Delete('connection-attempts/:attemptId')
  public async cancel(
    @User('id') userId: string,
    @Req() request: AuthenticatedRequest,
    @Param('attemptId') attemptId: string,
  ): ReturnType<GithubService['cancel']> {
    return this.github.cancel(userId, request.session.session.id, attemptId);
  }

  @Get('installations')
  @Header('Cache-Control', 'no-store')
  public async installations(
    @User('id') userId: string,
    @Query('connectionId') connectionId: string,
    @Query('page') page?: string,
  ): ReturnType<GithubService['installations']> {
    return this.github.installations(userId, connectionId, pageOf(page));
  }

  @Get('repositories')
  @Header('Cache-Control', 'no-store')
  public async repositories(
    @User('id') userId: string,
    @Query('connectionId') connectionId: string,
    @Query('installationId') installationId: string,
    @Query('page') page?: string,
  ): ReturnType<GithubService['repositories']> {
    return this.github.repositories(userId, connectionId, idOf(installationId), pageOf(page));
  }

  @Get('repositories/:id/branches')
  @Header('Cache-Control', 'no-store')
  public async branches(
    @User('id') userId: string,
    @Param('id') id: string,
    @Query('connectionId') connectionId: string,
    @Query('page') page?: string,
  ): ReturnType<GithubService['branches']> {
    return this.github.branches(userId, connectionId, idOf(id), pageOf(page));
  }

  @Get('repositories/:id/tree')
  @Header('Cache-Control', 'no-store')
  public async tree(
    @User('id') userId: string,
    @Param('id') id: string,
    @Query('connectionId') connectionId: string,
    @Query('head') head: string,
  ): ReturnType<GithubService['tree']> {
    return this.github.tree(userId, connectionId, idOf(id), head);
  }
}
