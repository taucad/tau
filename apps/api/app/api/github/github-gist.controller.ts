/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS runtime decorators. */
import { BadRequestException, Body, Controller, Get, Header, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { z } from 'zod';
import { UseAuth, User } from '#auth/decorators/auth.decorator.js';
import type { Environment } from '#config/environment.config.js';
import { GithubGistService } from '#api/github/github-gist.service.js';

@Controller({ path: 'github/gists', version: '1' })
@UseAuth()
export class GithubGistController {
  public constructor(
    private readonly gists: GithubGistService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  @Get('capability')
  @Header('Cache-Control', 'no-store')
  public async capability(
    @User('id') userId: string,
    @Req() request: FastifyRequest,
  ): ReturnType<GithubGistService['capability']> {
    return this.gists.capability(userId, fromNodeHeaders(request.headers));
  }

  @Post('use')
  @Header('Cache-Control', 'no-store')
  public async use(
    @User('id') userId: string,
    @Req() request: FastifyRequest,
    @Body() body: unknown,
  ): ReturnType<GithubGistService['setEnabled']> {
    this.checkOrigin(request);
    const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'GITHUB_GIST_SETTING_INVALID' });
    }
    return this.gists.setEnabled(userId, fromNodeHeaders(request.headers), parsed.data.enabled);
  }

  @Post('mutate')
  @Header('Cache-Control', 'no-store')
  public async mutate(
    @User('id') userId: string,
    @Req() request: FastifyRequest,
    @Body() body: unknown,
  ): ReturnType<GithubGistService['mutate']> {
    this.checkOrigin(request);
    const parsed = z
      .object({
        action: z.enum(['create', 'update', 'delete']),
        id: z
          .string()
          .regex(/^[0-9a-f]{1,64}$/u)
          .optional(),
        revision: z
          .string()
          .regex(/^[0-9a-f]{40}$/u)
          .optional(),
        payload: z.unknown().optional(),
      })
      .strict()
      .safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'GITHUB_GIST_PAYLOAD_INVALID' });
    }
    return this.gists.mutate(userId, fromNodeHeaders(request.headers), parsed.data);
  }
  private checkOrigin(request: FastifyRequest): void {
    if (
      request.headers.origin !== new URL(this.config.get('TAU_FRONTEND_URL', { infer: true })).origin &&
      request.headers.origin !== 'app://tau'
    ) {
      throw new BadRequestException({ code: 'ORIGIN_INVALID' });
    }
  }
}
