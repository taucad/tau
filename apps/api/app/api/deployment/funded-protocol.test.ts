/**
 * Why `GET /v1/deployment` may equate "funded" with `TAU_CLOUD_ENABLED` (Unified Model Transport, open question 1): a
 * self-host API relays gateway calls through the direct invocation owner, which never admits an operation, so its
 * gateway never sends `x-tau-operation-id`; only an owner that admits one (the funded owner) makes the gateway send it.
 */
/* eslint-disable @typescript-eslint/naming-convention -- provider wire fields use snake_case. */
import type { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DirectModelInvocationService, LlmGatewayService } from '@taucad/api-llm-gateway';
import type { ModelInvocationIntent, ModelInvocationService, ModelService } from '@taucad/api-llm-gateway';
import type { Environment } from '@taucad/api-core';

const keyedConfig = { get: vi.fn(() => 'provider-key') } as unknown as ConfigService<Environment, true>;

const providerStream = (): Response =>
  new Response(
    [
      { type: 'response.created', response: { id: 'resp_1' } },
      { type: 'response.output_text.delta', delta: 'Named part' },
      {
        type: 'response.completed',
        response: { id: 'resp_1', usage: { input_tokens: 3, output_tokens: 2 } },
      },
    ]
      .map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`)
      .join(''),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );

/** A reply that records the headers the gateway sets and drains what it sends. */
const recordingReply = () => {
  const headers = new Map<string, string>();
  const reply = {
    header: vi.fn((name: string, value: string) => {
      headers.set(name.toLowerCase(), value);
      return reply;
    }),
    status: vi.fn(() => reply),
    send: vi.fn(async (body: unknown) => {
      if (body !== null && typeof body === 'object' && Symbol.asyncIterator in body) {
        for await (const _chunk of body as AsyncIterable<unknown>) {
          /* Drain the relayed stream, as Fastify would. */
        }
      }
      return reply;
    }),
  };
  return { reply: reply as unknown as FastifyReply, headers };
};

const relay = async (invocations: ModelInvocationService) => {
  const { reply, headers } = recordingReply();
  await new LlmGatewayService(invocations).relay({
    provider: 'openai-responses',
    body: { model: 'openai-gpt-5.6-luna', input: 'fixture', stream: true, max_output_tokens: 16 },
    principalId: 'user',
    attemptId: 'run_1:0:0',
    reply,
    signal: new AbortController().signal,
  });
  return headers;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the funded protocol behind the deployment answer', () => {
  it('should send no x-tau-operation-id from a self-host gateway', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(providerStream());
    const headers = await relay(new DirectModelInvocationService(keyedConfig, {} as unknown as ModelService));
    expect(headers.get('content-type')).toBe('text/event-stream');
    expect(headers.has('x-tau-operation-id')).toBe(false);
  });

  it('should send x-tau-operation-id once an invocation owner admits the operation', async () => {
    const direct = new DirectModelInvocationService(keyedConfig, {} as unknown as ModelService);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(providerStream());
    const admitting: ModelInvocationService = {
      invoke: async (intent: ModelInvocationIntent) => {
        intent.onAdmitted?.('op_fixture');
        return direct.invoke(intent);
      },
    };
    const headers = await relay(admitting);
    expect(headers.get('x-tau-operation-id')).toBe('op_fixture');
  });
});
