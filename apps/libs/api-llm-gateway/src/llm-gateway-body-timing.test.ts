import { gzipSync } from 'node:zlib';
import fastify from 'fastify';
import type { HttpAdapterHost } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import {
  gatewayAcceptEncodingHeader,
  gatewayWireOf,
  LlmGatewayBodyTiming,
  requestEncodingOf,
} from '#llm-gateway-body-timing.js';
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

  it('should register the decoding hooks without metrics and record nothing', async () => {
    const app = fastify();
    app.post('/v1/llm/openai/v1/responses', async (request: { body: unknown }) => ({ echoed: request.body }));
    new LlmGatewayBodyTiming({} as HttpAdapterHost).register(app);
    await app.ready();
    const answer = await app.inject({
      method: 'POST',
      url: '/v1/llm/openai/v1/responses',
      headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
      payload: gzipSync(JSON.stringify({ input: 'hi' })),
    });
    expect(answer.json()).toEqual({ echoed: { input: 'hi' } });
    await app.close();
  });
});

/* Chat performance WP-15 step 2 (ruling O-3, gzip only). */
describe('gzip gateway bodies', () => {
  const serve = async (bodyLimit?: number) => {
    const { size, metrics } = fakeMetrics();
    const app = fastify(bodyLimit === undefined ? {} : { bodyLimit });
    const handler = vi.fn(async (request: { body: unknown }) => ({ echoed: request.body }));
    app.post('/v1/llm/openai/v1/responses', handler);
    app.post('/v1/other', handler);
    new LlmGatewayBodyTiming({} as HttpAdapterHost, metrics).register(app);
    await app.ready();
    return { app, size, handler };
  };
  const post = async (
    app: Awaited<ReturnType<typeof serve>>['app'],
    payload: Uint8Array<ArrayBuffer> | string,
    { encoding, url = '/v1/llm/openai/v1/responses' }: { readonly encoding?: string; readonly url?: string } = {},
  ) =>
    app.inject({
      method: 'POST',
      url,
      headers: {
        'content-type': 'application/json',
        ...(encoding === undefined ? {} : { 'content-encoding': encoding }),
      },
      payload: typeof payload === 'string' ? payload : Buffer.from(payload),
    });
  const gzip = (text: string): Uint8Array<ArrayBuffer> => new Uint8Array(gzipSync(text));

  it('should inflate a gzip body, count its wire bytes and advertise gzip', async () => {
    const { app, size } = await serve();
    const body = JSON.stringify({ input: 'z'.repeat(20_000) });
    const wire = gzip(body);
    const answer = await post(app, wire, { encoding: 'gzip' });

    expect(answer.statusCode).toBe(200);
    expect(answer.json()).toEqual({ echoed: JSON.parse(body) as unknown });
    expect(answer.headers[gatewayAcceptEncodingHeader]).toBe('gzip');
    expect(size).toHaveBeenCalledWith(wire.byteLength, {
      'tau.llm.wire': 'openai-responses',
      'http.request.encoding': 'gzip',
    });
    const other = await post(app, '{}', { url: '/v1/other' });
    expect(other.headers[gatewayAcceptEncodingHeader]).toBeUndefined();
    await app.close();
  });

  it('should refuse a small gzip body that inflates past the limit while inflating', async () => {
    const { app, handler } = await serve(4096);
    const bomb = gzip(JSON.stringify({ input: 'a'.repeat(4_000_000) }));
    expect(bomb.byteLength).toBeLessThan(4096);

    const answer = await post(app, bomb, { encoding: 'gzip' });

    expect(answer.statusCode).toBe(413);
    expect(handler).not.toHaveBeenCalled();
    await app.close();
  });

  it('should refuse a body that is not gzip and a coding other than gzip', async () => {
    const { app, handler } = await serve();

    const notGzip = await post(app, '{"input":"hi"}', { encoding: 'gzip' });
    const brotli = await post(app, gzip('{}'), { encoding: 'br' });

    expect(notGzip.statusCode).toBe(400);
    expect(brotli.statusCode).toBe(415);
    expect(handler).not.toHaveBeenCalled();
    await app.close();
  });
});
