import { Reflector } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { Environment } from '@taucad/api-core';
import { LlmGatewayAuthGuard } from '#llm-gateway.guard.js';
import { LlmGatewayError } from '#llm-gateway.error.js';
import { WebResearchController } from '#web-research/web-research.controller.js';
import type { WebResearchDependencies } from '#web-research/web-research.js';

const request = {
  query: {},
  raw: { once: () => undefined },
} as unknown as FastifyRequest;
const reply = {
  raw: { once: () => undefined, writableFinished: false },
} as unknown as FastifyReply;

const controllerWith = (key: string | undefined, dependencies: Partial<WebResearchDependencies> = {}) =>
  new WebResearchController(
    {
      get: (name: string) => (name === 'TAVILY_API_KEY' ? key : undefined),
    } as unknown as ConfigService<Environment, true>,
    {
      fetch: vi.fn(async () => Response.json({ results: [] })),
      lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
      ...dependencies,
    },
  );

describe('WebResearchController', () => {
  it('should sit behind the gateway authentication guard', () => {
    expect(new Reflector().get<unknown[]>('__guards__', WebResearchController)).toContain(LlmGatewayAuthGuard);
  });

  it('should search with the configured Tavily key', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        results: [{ title: 't', url: 'https://x.test', content: 'c' }],
      }),
    );

    const outcome = await controllerWith('tvly-key', { fetch }).search(request, reply, { query: 'gear module' });

    expect(outcome).toEqual({
      success: true,
      results: [{ title: 't', url: 'https://x.test', content: 'c' }],
    });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tvly-key');
  });

  it('should answer a coded refusal when the deployment has no search key', async () => {
    const outcome = await controllerWith(undefined).search(request, reply, {
      query: 'gear module',
    });

    expect(outcome).toMatchObject({
      success: false,
      errorCode: 'WEB_SEARCH_UNAVAILABLE',
    });
  });

  it('should refuse a malformed body as an invalid request', async () => {
    await expect(controllerWith('k').browse(request, reply, { urls: [] })).rejects.toBeInstanceOf(LlmGatewayError);
    await expect(controllerWith('k').search(request, reply, { query: '' })).rejects.toBeInstanceOf(LlmGatewayError);
  });
});
