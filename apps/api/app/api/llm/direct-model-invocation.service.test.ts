/* eslint-disable @typescript-eslint/naming-convention -- LangChain usage metadata and provider wire fields use snake_case. */
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AIMessageChunk } from '@langchain/core/messages';
import { DefaultChatTransport, readUIMessageStream } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatService } from '#api/chat/chat.service.js';
import { DirectModelInvocationService } from '#api/llm/direct-model-invocation.service.js';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import type { ModelInvocationIntent } from '#api/llm/model-invocation.types.js';
import type { ModelService } from '#api/models/model.service.js';
import type { Environment } from '#config/environment.config.js';

const providerMessage =
  'You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.';
const exhaustedBody = {
  error: {
    type: 'insufficient_quota',
    code: 'credit_balance_exhausted',
    message: providerMessage,
    param: null,
  },
};

const keyedConfig = { get: vi.fn(() => 'provider-key') } as unknown as ConfigService<Environment, true>;

const gatewayIntent = (): ModelInvocationIntent => ({
  authUserId: 'user',
  surface: 'gateway',
  attempt: { version: 1, key: 'attempt_0000000001' },
  providerWire: 'openai-responses',
  body: { model: 'openai-gpt-5.6-luna', input: 'fixture', stream: true, max_output_tokens: 16 },
  priceHeaders: {},
  activity: 'agent',
  signal: new AbortController().signal,
});

const helperIntent = (): ModelInvocationIntent => ({
  ...gatewayIntent(),
  surface: 'project_name',
  activity: 'title',
  directPrompt: {
    system: 'Name it.',
    messages: [{ role: 'user', content: 'Name this part' }],
    maximumOutputTokens: 64,
  },
});

const errorDetails = (error: unknown): { type?: string; message?: string; details?: unknown } =>
  error instanceof LlmGatewayError
    ? (error.getResponse() as { error: { type?: string; message?: string; details?: unknown } }).error
    : {};

/** A provider stream that fails on its first pull, the way an exhausted account does. */
const refusingStream = (failure: Error): AsyncIterable<AIMessageChunk> => ({
  [Symbol.asyncIterator]: () => ({
    next: async (): Promise<IteratorResult<AIMessageChunk>> => {
      await Promise.resolve();
      throw failure;
    },
  }),
});

const helperModels = (stream: () => unknown): ModelService =>
  ({
    getModels: vi.fn(async () => [{ id: 'openai-gpt-5.6-luna', recommended: true, provider: { id: 'openai' } }]),
    buildModel: vi.fn(() => ({ model: { stream: vi.fn(async () => stream()) } })),
  }) as unknown as ModelService;

describe('DirectModelInvocationService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs API helper prompts through an advertised non-OpenAI self-host model', async () => {
    async function* chunks(): AsyncGenerator<AIMessageChunk> {
      yield new AIMessageChunk({ content: 'Named part' });
      yield new AIMessageChunk({
        content: '',
        usage_metadata: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
      });
    }
    const buildModel = vi.fn(() => ({ model: { stream: vi.fn(async () => chunks()) } }));
    const models = {
      getModels: vi.fn(async () => [{ id: 'anthropic-claude-fable-5', recommended: true }]),
      buildModel,
    } as unknown as ModelService;
    const config = { get: vi.fn() } as unknown as ConfigService<Environment, true>;
    const chat = new ChatService(new DirectModelInvocationService(config, models));

    const result = await chat.getBuildNameGenerator(
      [{ role: 'user', content: 'Name this part' }],
      'owner',
      'attempt',
      'project',
      new AbortController().signal,
    );
    if (result.state !== 'streaming') {
      throw new Error('Expected stream');
    }
    const stream = await new DefaultChatTransport({
      api: 'http://fixture.invalid/chat',
      fetch: async () => result.response,
    }).sendMessages({
      chatId: 'chat',
      messages: [],
      trigger: 'submit-message',
      messageId: undefined,
      abortSignal: new AbortController().signal,
    });
    let text = '';
    for await (const message of readUIMessageStream({ stream })) {
      text = message.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('');
    }

    expect(text).toBe('Named part');
    expect(buildModel).toHaveBeenCalledWith('anthropic-claude-fable-5', { maximumOutputTokens: 64 });
    await result.completion;
  });
  it('should answer a recognized pre-stream provider refusal as a typed 503 naming the operator account', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(exhaustedBody), { status: 429, headers: { 'content-type': 'application/json' } }),
    );
    const service = new DirectModelInvocationService(keyedConfig, {} as unknown as ModelService);

    try {
      await service.invoke(gatewayIntent());
      expect.fail('The exhausted provider account should refuse the relay');
    } catch (error) {
      expect(error).toBeInstanceOf(LlmGatewayError);
      expect((error as LlmGatewayError).getStatus()).toBe(503);
      expect(errorDetails(error)).toEqual({
        type: 'PROVIDER_ACCOUNT_EXHAUSTED',
        // The operator owns the key, so the provider's own sentence is the message.
        message: providerMessage,
        details: { providerId: 'openai', providerCode: 'credit_balance_exhausted', accountOwner: 'operator' },
      });
    }
  });

  it('should keep the provider reason in an unrecognized self-host rejection', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error: { type: 'invalid_request_error', message: 'max_output_tokens is too large.' } }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    const service = new DirectModelInvocationService(keyedConfig, {} as unknown as ModelService);

    await expect(service.invoke(gatewayIntent())).rejects.toThrow(
      'Configured provider returned HTTP 400. max_output_tokens is too large.',
    );
  });

  it('should replace a recognized in-stream refusal with the Tau-coded frame it relays', async () => {
    const supplierFrame = `event: error\ndata: ${JSON.stringify({ type: 'error', ...exhaustedBody })}\n\n`;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(supplierFrame, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const service = new DirectModelInvocationService(keyedConfig, {} as unknown as ModelService);

    const result = await service.invoke(gatewayIntent());
    if (result.state !== 'streaming') {
      throw new Error('Expected stream');
    }

    expect(await result.response.text()).toBe(
      `event: error\ndata: {"type":"error","code":"PROVIDER_ACCOUNT_EXHAUSTED","message":"${providerMessage}","error":{"type":"tau_gateway","code":"PROVIDER_ACCOUNT_EXHAUSTED","message":"${providerMessage}","details":{"providerId":"openai","providerCode":"credit_balance_exhausted","accountOwner":"operator"}}}\n\n`,
    );
  });

  it.each([
    [
      'response.failed',
      `event: response.failed\ndata: ${JSON.stringify({
        type: 'response.failed',
        response: {
          id: 'resp_1',
          status: 'failed',
          error: { code: 'server_error', message: 'The server had an error while processing your request.' },
        },
      })}\n\n`,
      'The server had an error while processing your request.',
    ],
    [
      'an error event',
      `event: error\ndata: ${JSON.stringify({
        type: 'error',
        code: 'context_length_exceeded',
        message: 'Your input exceeds the context window of this model.',
      })}\n\n`,
      'Your input exceeds the context window of this model.',
    ],
  ])('should log %s as the direct relay evidence of a terminal upstream failure', async (_label, frame, reason) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(frame, {
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'x-request-id': 'req_fixture_1' },
      }),
    );
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new DirectModelInvocationService(keyedConfig, {} as unknown as ModelService);

    const result = await service.invoke(gatewayIntent());
    if (result.state !== 'streaming') {
      throw new Error('Expected stream');
    }

    // The frame reaches the client byte for byte; only the operator's log is new.
    expect(await result.response.text()).toBe(frame);
    expect(logged).toHaveBeenCalledTimes(1);
    const line = String(logged.mock.calls[0]?.[0]);
    expect(line).toContain('Provider stream failed for openai');
    expect(line).toContain('req_fixture_1');
    expect(line).toContain(reason);
  });

  it('should refuse a helper turn before streaming when the provider account is exhausted', async () => {
    const service = new DirectModelInvocationService(
      keyedConfig,
      helperModels(() =>
        refusingStream(
          Object.assign(new Error('429 You have no credits remaining.'), {
            status: 429,
            error: exhaustedBody.error,
          }),
        ),
      ),
    );

    try {
      await service.invoke(helperIntent());
      expect.fail('The helper should refuse before it answers 200');
    } catch (error) {
      expect((error as LlmGatewayError).getStatus()).toBe(503);
      expect(errorDetails(error)).toMatchObject({
        type: 'PROVIDER_ACCOUNT_EXHAUSTED',
        details: { providerId: 'openai', providerCode: 'credit_balance_exhausted', accountOwner: 'operator' },
      });
    }
  });

  it('should report an unrecognized helper first-chunk failure as a provider outage', async () => {
    const service = new DirectModelInvocationService(
      keyedConfig,
      helperModels(() => refusingStream(new Error('socket hang up'))),
    );

    try {
      await service.invoke(helperIntent());
      expect.fail('The helper should refuse before it answers 200');
    } catch (error) {
      expect((error as LlmGatewayError).getStatus()).toBe(503);
      expect(errorDetails(error).type).toBe('PROVIDER_UNAVAILABLE');
      expect(errorDetails(error).details).toBeUndefined();
    }
  });

  it('should let a helper abort through untouched instead of calling it a provider outage', async () => {
    const controller = new AbortController();
    const abort = new Error('aborted');
    const service = new DirectModelInvocationService(
      keyedConfig,
      helperModels(() => ({
        [Symbol.asyncIterator]: () => ({
          next: async (): Promise<IteratorResult<AIMessageChunk>> => {
            controller.abort();
            await Promise.resolve();
            throw abort;
          },
        }),
      })),
    );

    await expect(service.invoke({ ...helperIntent(), signal: controller.signal })).rejects.toBe(abort);
  });
});
