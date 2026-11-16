import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { fastify } from 'fastify';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resendWebhookRoute } from '#resend-webhook.route.js';
import type { ResendWebhookService } from '#resend-webhook.service.js';

const basePath = '/v1/auth';

const serve = async (receive: ResendWebhookService['receive']): Promise<FastifyInstance> => {
  const app = fastify();
  resendWebhookRoute({ receive }).register(app, basePath);
  // The auth wildcard the route must register ahead of; it would re-serialise a JSON body.
  app.all(`${basePath}/*`, async () => ({ reachedBetterAuth: true }));
  await app.ready();
  return app;
};

const signedHeaders = {
  'content-type': 'application/json',
  'svix-id': 'msg_1',
  'svix-timestamp': '1763193600',
  'svix-signature': 'v1,c2lnbmF0dXJl',
};

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('POST /v1/auth/resend/webhook', () => {
  it('hands the service the body exactly as delivered, whitespace and key order included', async () => {
    const receive = vi.fn<ResendWebhookService['receive']>(async () => 'stored');
    app = await serve(receive);
    const body = '{ "type":"email.sent",\n  "data": {"b":1,"a":2} }';

    const response = await app.inject({
      method: 'POST',
      url: `${basePath}/resend/webhook`,
      headers: signedHeaders,
      body,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      received: true,
      outcome: 'stored',
    });
    expect(receive).toHaveBeenCalledExactlyOnceWith({
      payload: body,
      headers: {
        id: 'msg_1',
        timestamp: '1763193600',
        signature: 'v1,c2lnbmF0dXJl',
      },
    });
  });

  it('passes absent svix headers through as undefined for the service to refuse', async () => {
    const receive = vi.fn<ResendWebhookService['receive']>(async () => {
      throw new BadRequestException('invalid_resend_webhook');
    });
    app = await serve(receive);

    const response = await app.inject({
      method: 'POST',
      url: `${basePath}/resend/webhook`,
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toStrictEqual({ code: 'invalid_resend_delivery' });
    expect(receive.mock.calls[0]?.[0].headers).toStrictEqual({
      id: undefined,
      timestamp: undefined,
      signature: undefined,
    });
  });

  it('answers 503 while the secret is unset, so Resend retries until it arrives', async () => {
    app = await serve(async () => {
      throw new ServiceUnavailableException('resend_webhook_not_configured');
    });

    const response = await app.inject({
      method: 'POST',
      url: `${basePath}/resend/webhook`,
      headers: signedHeaders,
      body: '{}',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toStrictEqual({ code: 'resend_inbox_unavailable' });
  });

  it('answers 503 when the inbox cannot be written, so Resend retries the delivery', async () => {
    app = await serve(async () => {
      throw new Error('connection refused');
    });

    const response = await app.inject({
      method: 'POST',
      url: `${basePath}/resend/webhook`,
      headers: signedHeaders,
      body: '{}',
    });

    expect(response.statusCode).toBe(503);
  });

  it('refuses a body over 256 KiB before the service sees it', async () => {
    const receive = vi.fn<ResendWebhookService['receive']>(async () => 'stored');
    app = await serve(receive);

    const response = await app.inject({
      method: 'POST',
      url: `${basePath}/resend/webhook`,
      headers: signedHeaders,
      body: JSON.stringify({ padding: 'x'.repeat(300 * 1024) }),
    });

    expect(response.statusCode).toBe(413);
    expect(receive).not.toHaveBeenCalled();
  });

  it('leaves every other auth path to the wildcard', async () => {
    app = await serve(async () => 'stored');

    const response = await app.inject({
      method: 'POST',
      url: `${basePath}/sign-in/email`,
      payload: { a: 1 },
    });

    expect(response.json()).toStrictEqual({ reachedBetterAuth: true });
  });
});
