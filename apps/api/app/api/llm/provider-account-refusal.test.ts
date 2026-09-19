import { describe, expect, it } from 'vitest';
import {
  providerErrorMessage,
  readBoundedProviderBody,
  recognizeProviderAccountRefusal,
} from '#api/llm/provider-account-refusal.js';
import type { GatewayProviderId } from '#api/providers/provider-gateway.js';

/* The exact frame OpenAI sent on 2026-09-19 with an exhausted organisation balance. */
const openAiExhausted = {
  type: 'error',
  error: {
    type: 'insufficient_quota',
    code: 'credit_balance_exhausted',
    message:
      'You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.',
    param: null,
  },
};

describe('recognizeProviderAccountRefusal', () => {
  it('should recognize the captured OpenAI exhausted-balance frame with its code and sentence', () => {
    expect(recognizeProviderAccountRefusal({ providerId: 'openai', body: openAiExhausted })).toEqual({
      providerCode: 'credit_balance_exhausted',
      message: openAiExhausted.error.message,
    });
  });

  it.each([
    {
      providerId: 'openai',
      body: { error: { type: 'insufficient_quota', message: 'You exceeded your current quota.' } },
      providerCode: 'insufficient_quota',
    },
    {
      providerId: 'openai',
      body: { error: { type: 'invalid_request_error', code: 'billing_not_active', message: 'Billing is inactive.' } },
      providerCode: 'billing_not_active',
    },
    {
      providerId: 'xai',
      body: { error: { type: 'insufficient_quota', code: 'credit_balance_exhausted', message: 'No credits.' } },
      providerCode: 'credit_balance_exhausted',
    },
    {
      providerId: 'anthropic',
      body: { error: { type: 'billing_error', message: 'Your organization has been disabled.' } },
      providerCode: 'billing_error',
    },
    {
      providerId: 'anthropic',
      body: {
        error: {
          type: 'invalid_request_error',
          message: 'Your credit balance is too low to access the Anthropic API.',
        },
      },
      providerCode: 'invalid_request_error',
    },
    {
      providerId: 'together',
      body: { error: { type: 'invalid_request_error', message: 'You have insufficient credits.' } },
      providerCode: 'invalid_request_error',
    },
    {
      providerId: 'vertexai',
      body: { error: { message: 'Account has no credits remaining.' } },
      providerCode: undefined,
    },
  ] satisfies ReadonlyArray<{
    providerId: GatewayProviderId;
    body: unknown;
    providerCode: string | undefined;
  }>)('should recognize a $providerId refusal as $providerCode', ({ providerId, body, providerCode }) => {
    const refusal = recognizeProviderAccountRefusal({ providerId, status: 400, body });
    expect(refusal?.providerCode).toBe(providerCode);
    expect(refusal?.message).toBe(providerErrorMessage(body));
  });

  it.each([
    {
      name: 'an Anthropic request-shape refusal',
      providerId: 'anthropic',
      body: { error: { type: 'invalid_request_error', message: 'max_tokens is too large.' } },
    },
    {
      name: 'an OpenAI rate limit',
      providerId: 'openai',
      body: { error: { type: 'rate_limit_error', code: 'rate_limit_exceeded', message: 'Slow down.' } },
    },
    {
      name: 'an OpenAI-completions server fault',
      providerId: 'together',
      body: { error: { type: 'server_error', message: 'Internal error.' } },
    },
    { name: 'a body with no error member', providerId: 'openai', body: { type: 'response.created' } },
    { name: 'a non-object body', providerId: 'openai', body: 'Service Unavailable' },
    { name: 'an absent body', providerId: 'openai', body: undefined },
  ] satisfies ReadonlyArray<{ name: string; providerId: GatewayProviderId; body: unknown }>)(
    'should not recognize $name',
    ({ providerId, body }) => {
      expect(recognizeProviderAccountRefusal({ providerId, status: 400, body })).toBeUndefined();
    },
  );

  it('should not recognize an Anthropic credit sentence sent by a different provider shape', () => {
    // The table is per provider: Anthropic's wording only counts on Anthropic's error type.
    expect(
      recognizeProviderAccountRefusal({
        providerId: 'anthropic',
        body: { error: { type: 'authentication_error', message: 'Your credit balance is too low.' } },
      }),
    ).toBeUndefined();
  });
});

describe('readBoundedProviderBody', () => {
  it('should parse a refused JSON body once', async () => {
    const body = await readBoundedProviderBody(new Response(JSON.stringify(openAiExhausted), { status: 429 }));
    expect(body).toEqual(openAiExhausted);
  });

  it('should return undefined for a body that is not JSON', async () => {
    expect(await readBoundedProviderBody(new Response('<html>502</html>', { status: 502 }))).toBeUndefined();
  });

  it('should stop reading an unbounded body at its bound and cancel the rest', async () => {
    let cancelled: unknown;
    let enqueued = 0;
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller) {
        enqueued += 1;
        controller.enqueue(new TextEncoder().encode('x'.repeat(16 * 1024)));
      },
      cancel(reason) {
        cancelled = reason ?? 'cancelled';
      },
    });

    // Without the bound this never resolves: the stream enqueues forever.
    expect(await readBoundedProviderBody(new Response(stream, { status: 502 }))).toBeUndefined();
    // 64 KiB of 16 KiB chunks (plus at most the one the queue reads ahead), then it lets go.
    expect(enqueued).toBeLessThanOrEqual(5);
    expect(cancelled).toBe('cancelled');
  });
});
