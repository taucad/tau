import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { FastifyReply } from 'fastify';
import { LlmGatewayService } from '#api/llm/llm-gateway.service.js';
import type { ModelInvocationService } from '#api/llm/model-invocation.types.js';

afterEach(() => vi.restoreAllMocks());

describe('LlmGatewayService', () => {
  it('passes one authenticated attempt to the funded owner', async () => {
    const invocations = {
      invoke: vi.fn(async () => ({
        state: 'pending',
        operationId: 'operation',
      })),
    };
    const service = new LlmGatewayService(invocations as unknown as ModelInvocationService);
    const reply = { header: vi.fn(), status: vi.fn(), send: vi.fn() };
    reply.header.mockReturnValue(reply);
    reply.status.mockReturnValue(reply);
    await service.relay({
      provider: 'openai-completions',
      body: { model: 'gpt' },
      principalId: 'user',
      attemptId: 'attempt',
      reply: reply as unknown as FastifyReply,
      signal: new AbortController().signal,
    });
    expect(invocations.invoke).toHaveBeenCalledOnce();
  });

  it('installs the operation header when admission commits even if provider execution rejects', async () => {
    const invocations = {
      invoke: vi.fn(async (input: { onAdmitted?: (operationId: string) => void }) => {
        input.onAdmitted?.('operation');
        throw new Error('provider rejected');
      }),
    };
    const service = new LlmGatewayService(invocations as unknown as ModelInvocationService);
    const reply = { header: vi.fn(), status: vi.fn(), send: vi.fn() };
    reply.header.mockReturnValue(reply);

    await expect(
      service.relay({
        provider: 'openai-responses',
        body: { model: 'openai-gpt-5.6-luna' },
        principalId: 'user',
        attemptId: 'attempt',
        reply: reply as unknown as FastifyReply,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('provider rejected');
    expect(reply.header).toHaveBeenCalledWith('x-tau-operation-id', 'operation');
  });

  it('should log a settlement failure without sending a second response', async () => {
    const settlement = Promise.withResolvers<void>();
    const error = new Error('ledger unavailable');
    const invocations = mock<ModelInvocationService>();
    invocations.invoke.mockResolvedValue({
      state: 'streaming',
      operationId: 'operation',
      response: new Response('data: [DONE]\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      }),
      completion: settlement.promise,
    });
    const service = new LlmGatewayService(invocations);
    const reply = mock<FastifyReply>();
    reply.header.mockReturnValue(reply);
    reply.status.mockReturnValue(reply);
    reply.send.mockReturnValue(reply);
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {
      // Test-local logger sink.
    });

    const relaying = service.relay({
      provider: 'openai-completions',
      body: { model: 'google-gemini-3.8-flash' },
      principalId: 'user',
      attemptId: 'attempt',
      reply,
      signal: new AbortController().signal,
    });
    await vi.waitFor(() => {
      expect(reply.send).toHaveBeenCalledOnce();
    });
    settlement.reject(error);

    await expect(relaying).resolves.toBeUndefined();
    expect(reply.send).toHaveBeenCalledOnce();
    expect(logged).toHaveBeenCalledOnce();
    expect(logged).toHaveBeenCalledWith(
      { err: error, operationId: 'operation' },
      'Model invocation settlement failed after the response stream was sent',
    );
  });
});
