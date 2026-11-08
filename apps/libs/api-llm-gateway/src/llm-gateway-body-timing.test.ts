import fastify from 'fastify';
import type { HttpAdapterHost } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { gatewayWireOf, LlmGatewayBodyTiming, requestEncodingOf } from '#llm-gateway-body-timing.js';
import type { MetricsService } from '@taucad/api-observability/metrics';

const fakeMetrics = () => {
  const receive = vi.fn();
  const parse = vi.fn();
  const size = vi.fn();
  return {
    receive,
    parse,
    size,
    metrics: {
      llmGatewayRequestReceiveDuration: { record: receive },
      llmGatewayRequestParseDuration: { record: parse },
      llmGatewayRequestSize: { record: size },
    } as unknown as MetricsService,
  };
};

describe('gatewayWireOf', () => {
  it('should name each gateway route family and ignore every other path', () => {
    expect(gatewayWireOf('/v1/llm/anthropic/v1/messages')).toBe('anthropic');
    expect(gatewayWireOf('/v1/llm/openai/v1/chat/completions')).toBe('openai-completions');
    expect(gatewayWireOf('/v1/llm/openai/v1/responses?x=1')).toBe('openai-responses');
    expect(gatewayWireOf('/v1/llm/unknown')).toBe('other');
    expect(gatewayWireOf('/v1/chat')).toBeUndefined();
    expect(gatewayWireOf('/v1/llmx/anthropic/v1/messages')).toBeUndefined();
  });
});

describe('requestEncodingOf', () => {
  it('should bound the content coding to identity, gzip or other', () => {
    expect(requestEncodingOf(undefined)).toBe('identity');
    expect(requestEncodingOf('identity')).toBe('identity');
    expect(requestEncodingOf(' GZIP ')).toBe('gzip');
    expect(requestEncodingOf('br')).toBe('other');
    expect(requestEncodingOf(['gzip', 'br'])).toBe('other');
  });
});

describe('LlmGatewayBodyTiming', () => {
  it('should record upload, parse and wire bytes for a gateway route declared before the hooks', async () => {
    const { receive, parse, size, metrics } = fakeMetrics();
    const app = fastify();
    const handler = vi.fn(async (request: { body: unknown }) => ({ echoed: request.body }));
    // Nest declares its routes before module init adds the hooks; the hooks must still apply.
    app.post('/v1/llm/anthropic/v1/messages', handler);
    app.post('/v1/other', handler);
    new LlmGatewayBodyTiming({} as HttpAdapterHost, metrics).register(app);
    await app.ready();

    const body = JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'x'.repeat(4096) }] });
    const answer = await app.inject({
      method: 'POST',
      url: '/v1/llm/anthropic/v1/messages',
      headers: { 'content-type': 'application/json' },
      payload: body,
    });
    expect(answer.statusCode).toBe(200);
    // The pass-through keeps the body byte-exact for the handler.
    expect(answer.json()).toEqual({ echoed: JSON.parse(body) as unknown });
    expect(size).toHaveBeenCalledWith(Buffer.byteLength(body), {
      'tau.llm.wire': 'anthropic',
      'http.request.encoding': 'identity',
    });
    expect(receive).toHaveBeenCalledWith(expect.any(Number), {
      'tau.llm.wire': 'anthropic',
      'http.request.encoding': 'identity',
    });
    const [seconds] = (receive.mock.calls as Array<[number, unknown]>)[0] ?? [-1];
    expect(seconds).toBeGreaterThanOrEqual(0);
    expect(parse).toHaveBeenCalledWith(expect.any(Number), { 'tau.llm.wire': 'anthropic' });

    await app.inject({
      method: 'POST',
      url: '/v1/other',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(size).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('should still refuse a body over the limit', async () => {
    const { size, metrics } = fakeMetrics();
    const app = fastify({ bodyLimit: 64 });
    app.post('/v1/llm/openai/v1/responses', async () => ({ ok: true }));
    new LlmGatewayBodyTiming({} as HttpAdapterHost, metrics).register(app);
    await app.ready();
    const answer = await app.inject({
      method: 'POST',
      url: '/v1/llm/openai/v1/responses',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ input: 'y'.repeat(256) }),
    });
    expect(answer.statusCode).toBe(413);
    expect(size).not.toHaveBeenCalled();
    await app.close();
  });

  it('should register nothing without metrics', () => {
    const addHook = vi.fn();
    const adapterHost = { httpAdapter: { getInstance: () => ({ addHook }) } } as unknown as HttpAdapterHost;
    new LlmGatewayBodyTiming(adapterHost).onModuleInit();
    expect(addHook).not.toHaveBeenCalled();
  });
});
