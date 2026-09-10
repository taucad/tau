import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { FastifyReply } from 'fastify';
import { LlmGatewayService } from '#api/llm/llm-gateway.service.js';
import type { BillableModelInvocationService } from '#api/billing/billable-model-invocation.service.js';

describe('LlmGatewayService', () => {
  it('passes one authenticated attempt to the funded owner', async () => {
    const invocations = { invoke: vi.fn(async () => ({ state: 'pending', operationId: 'operation' })) };
    const service = new LlmGatewayService(
      invocations as unknown as BillableModelInvocationService,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
      new ConfigService({ BILLING_ENVIRONMENT: 'development' }),
    );
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
    const service = new LlmGatewayService(
      invocations as unknown as BillableModelInvocationService,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
      new ConfigService({ BILLING_ENVIRONMENT: 'development' }),
    );
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
});
