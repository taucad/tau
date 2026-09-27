/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators require runtime metadata. */
/* eslint-disable max-params-no-constructor/max-params-no-constructor -- Nest parameter decorators expose independent request facets. */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
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
type StartBody = Readonly<{ returnTo?: unknown; completionMode?: unknown }>;
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
/* A missing or repeated `connectionId` reached the database as `undefined` (500). */
const connectionOf = (value: unknown): string => {
  if (typeof value !== 'string' || value === '') {
    throw new BadRequestException({ code: 'GITHUB_CONNECTION_REQUIRED' });
  }
  return value;
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
    @Body() body: unknown,
  ): ReturnType<GithubService['start']> {
    const { origin } = request.headers;
    if (origin !== this.frontendOrigin && origin !== 'app://tau') {
      throw new BadRequestException({ code: 'ORIGIN_INVALID' });
    }
    const { returnTo, completionMode } = typeof body === 'object' && body !== null ? (body as StartBody) : {};
    return this.github.start(userId, request.session.session.id, returnTo, completionMode);
  }

  /** GitHub's redirect target: always answers with a redirect to the completion page, never with JSON. */
  @Get('callback')
  @PublicAuth()
  public async callback(
    @Query() query: Readonly<{ state?: unknown; code?: unknown; error?: unknown }>,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const location = await this.github.callback(query);
    // Explicit status: Nest has already set 200 on the reply, and Fastify's redirect keeps a status set earlier.
    void reply.redirect(location, HttpStatus.FOUND);
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
    @Body() body: unknown,
  ): ReturnType<GithubService['complete']> {
    const attemptId =
      typeof body === 'object' && body !== null ? (body as { attemptId?: unknown }).attemptId : undefined;
    return this.github.complete(userId, request.session.session.id, typeof attemptId === 'string' ? attemptId : '');
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
  @HttpCode(HttpStatus.NO_CONTENT)
  public async remove(@User('id') userId: string, @Param('id') id: string): ReturnType<GithubService['remove']> {
    return this.github.remove(userId, id);
  }

  @Delete('connection-attempts/:attemptId')
  @HttpCode(HttpStatus.NO_CONTENT)
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
    @Query('connectionId') connectionId: unknown,
    @Query('page') page?: string,
  ): ReturnType<GithubService['installations']> {
    return this.github.installations(userId, connectionOf(connectionId), pageOf(page));
  }

  @Get('repositories')
  @Header('Cache-Control', 'no-store')
  public async repositories(
    @User('id') userId: string,
    @Query('connectionId') connectionId: unknown,
    @Query('installationId') installationId: string,
    @Query('page') page?: string,
  ): ReturnType<GithubService['repositories']> {
    return this.github.repositories(userId, connectionOf(connectionId), idOf(installationId), pageOf(page));
  }

  @Get('repositories/:id/branches')
  @Header('Cache-Control', 'no-store')
  public async branches(
    @User('id') userId: string,
    @Param('id') id: string,
    @Query('connectionId') connectionId: unknown,
    @Query('page') page?: string,
  ): ReturnType<GithubService['branches']> {
    return this.github.branches(userId, connectionOf(connectionId), idOf(id), pageOf(page));
  }

  @Get('repositories/:id')
  @Header('Cache-Control', 'no-store')
  public async repository(
    @User('id') userId: string,
    @Param('id') id: string,
    @Query('connectionId') connectionId: unknown,
  ): ReturnType<GithubService['repository']> {
    return this.github.repository(userId, connectionOf(connectionId), idOf(id));
  }

  @Get('repositories/:id/branch')
  @Header('Cache-Control', 'no-store')
  public async branch(
    @User('id') userId: string,
    @Param('id') id: string,
    @Query('connectionId') connectionId: unknown,
    @Query('name') name: unknown,
  ): ReturnType<GithubService['branch']> {
    return this.github.branch(userId, connectionOf(connectionId), idOf(id), name);
  }

  @Get('repositories/:id/tree')
  @Header('Cache-Control', 'no-store')
  public async tree(
    @User('id') userId: string,
    @Param('id') id: string,
    @Query('connectionId') connectionId: unknown,
    @Query('head') head: string,
  ): ReturnType<GithubService['tree']> {
    return this.github.tree(userId, connectionOf(connectionId), idOf(id), head);
  }
}
