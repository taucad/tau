import { EventEmitter } from 'node:events';
import type { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { Environment } from '#config/environment.config.js';
import type { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { TokenBudgetService } from '#api/chat/token-budget.service.js';
import type { LlmGatewayLimiter } from '#api/llm/llm-gateway-limiter.service.js';
import type { LlmGatewayOptions } from '#api/llm/llm-gateway.options.js';
import { LlmGatewayService } from '#api/llm/llm-gateway.service.js';

const liveEnabled = Boolean(process.env.OPENAI_API_KEY) && process.env['TAU_LLM_GATEWAY_LIVE_TESTS'] === 'true';

class LiveRawResponse extends EventEmitter {
  public destroyed = false;
  public writableEnded = false;
  public readonly chunks: Uint8Array<ArrayBuffer>[] = [];
  public readonly trailers: Record<string, string> = {};

  public writeHead(): this {
    return this;
  }

  public write(chunk: Uint8Array<ArrayBuffer>): boolean {
    this.chunks.push(chunk);
    return true;
  }

  public addTrailers(trailers: Record<string, string>): void {
    Object.assign(this.trailers, trailers);
  }

  public end(): this {
    this.writableEnded = true;
    this.emit('finish');
    return this;
  }

  public destroy(): this {
    this.destroyed = true;
    this.emit('close');
    return this;
  }
}

describe.skipIf(!liveEnabled)('live OpenAI gateway (NOT EVIDENCE when skipped)', () => {
  it('streams a catalog model and receives terminal billable usage', async () => {
    let committedMicro: bigint | undefined;
    const ledger = {
      reserve: async () => ({ ok: true, reservationId: 'live-reservation' }) as const,
      commit: async (input: { actualMicro: bigint }) => {
        committedMicro = input.actualMicro;
        return { committed: true, balanceMicro: 0n };
      },
      release: async () => undefined,
    } as unknown as CreditLedgerService;
    const config = {
      get(key: string) {
        if (key === 'OPENAI_API_KEY') return process.env.OPENAI_API_KEY;
        if (key === 'TAU_CREDIT_MARKUP_FRACTION') return 0.3;
        return undefined;
      },
    } as unknown as ConfigService<Environment, true>;
    const limiter = {
      acquire: async () => ({ release: async () => undefined }),
    } as unknown as LlmGatewayLimiter;
    const options: LlmGatewayOptions = {
      requestsPerMinute: 60,
      maxConcurrentRequests: 4,
      maxProviderConcurrentRequests: 100,
      upstreamIdleTimeoutMs: 30_000,
      postAbortSettlementTimeoutMs: 120_000,
      concurrencyLeaseMs: 300_000,
      concurrencyHeartbeatMs: 60_000,
      maxSseEventBytes: 256 * 1024,
    };
    const raw = new LiveRawResponse();
    const service = new LlmGatewayService(ledger, new TokenBudgetService(), config, limiter, options);

    await service.relay({
      provider: 'openai',
      principalId: 'live-user',
      reply: { raw, hijack: () => undefined, getHeaders: () => ({}) } as unknown as FastifyReply,
      body: {
        model: 'openai-gpt-5.6-luna',
        messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
        stream: true,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI wire field.
        max_completion_tokens: 8,
      },
    });

    expect(new TextDecoder().decode(Buffer.concat(raw.chunks.map((chunk) => Buffer.from(chunk))))).toContain('[DONE]');
    expect(committedMicro).toBeTypeOf('bigint');
    expect(raw.trailers['x-tau-usage-microdollars']).toBe(String(committedMicro));
  }, 120_000);
});
