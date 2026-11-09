import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Environment } from '@taucad/api-core';
import { z } from 'zod';
import { LlmGatewayAuthGuard } from '#llm-gateway.guard.js';
import { LlmGatewayError } from '#llm-gateway.error.js';
import { assertNoQuery, invocationSignal } from '#llm-gateway.headers.js';
import { browseWeb, defaultWebResearchDependencies, searchWeb } from '#web-research/web-research.js';
import type { WebBrowseOutcome, WebResearchDependencies, WebSearchOutcome } from '#web-research/web-research.js';

/** Injection token for the web research I/O, so tests run without the network. */
export const webResearchDependenciesKey = Symbol('webResearchDependencies');

const searchBodySchema = z.object({ query: z.string().trim().min(1).max(400) });
const browseBodySchema = z.object({
  urls: z.array(z.url()).min(1).max(5),
  query: z.string().max(400).optional(),
});

const parseBody = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new LlmGatewayError(HttpStatus.BAD_REQUEST, 'INVALID_REQUEST', z.prettifyError(parsed.error));
  }
  return parsed.data;
};

/**
 * The agent's web tools (`web_search`, `web_browser`), served to signed-in sessions and paired devices through the
 * gateway's own authentication (regression review R1). A tool-level failure answers 200 with `success: false`, so the
 * agent sees a coded tool error instead of a transport failure.
 */
@Controller({ path: 'llm/tools', version: '1' })
@UseGuards(LlmGatewayAuthGuard)
export class WebResearchController {
  public constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
    @Inject(webResearchDependenciesKey)
    private readonly dependencies: WebResearchDependencies,
  ) {}

  @Post('web-search')
  @HttpCode(HttpStatus.OK)
  public async search(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ): Promise<WebSearchOutcome> {
    assertNoQuery(request);
    const { query } = parseBody(searchBodySchema, body);
    return searchWeb(
      {
        query,
        apiKey: this.config.get('TAVILY_API_KEY', { infer: true }),
        signal: invocationSignal(request, reply),
      },
      this.dependencies,
    );
  }

  @Post('web-browser')
  @HttpCode(HttpStatus.OK)
  public async browse(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ): Promise<WebBrowseOutcome> {
    assertNoQuery(request);
    const { urls } = parseBody(browseBodySchema, body);
    return browseWeb({ urls, signal: invocationSignal(request, reply) }, this.dependencies);
  }
}

/** The default provider for {@link webResearchDependenciesKey}. */
export const webResearchDependenciesProvider = {
  provide: webResearchDependenciesKey,
  useValue: defaultWebResearchDependencies,
};
