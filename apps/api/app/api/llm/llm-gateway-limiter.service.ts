import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '#redis/redis.service.js';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import { llmGatewayOptionsKey } from '#api/llm/llm-gateway.options.js';
import type { LlmGatewayOptions } from '#api/llm/llm-gateway.options.js';

const acquireLua = `
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', ARGV[1])
local requests = redis.call('INCR', KEYS[1])
if requests == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[4]) end
if requests > tonumber(ARGV[6]) then return {3, requests} end
local active = redis.call('ZCARD', KEYS[2])
if active >= tonumber(ARGV[5]) then return {2, active} end
local providerActive = redis.call('ZCARD', KEYS[3])
if providerActive >= tonumber(ARGV[7]) then return {4, providerActive} end
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[3])
redis.call('ZADD', KEYS[3], ARGV[2], ARGV[3])
redis.call('PEXPIRE', KEYS[2], ARGV[8])
redis.call('PEXPIRE', KEYS[3], ARGV[8])
return {1, requests}
`;

const heartbeatLua = `
if redis.call('ZSCORE', KEYS[1], ARGV[1]) == false or redis.call('ZSCORE', KEYS[2], ARGV[1]) == false then
  redis.call('ZREM', KEYS[1], ARGV[1])
  redis.call('ZREM', KEYS[2], ARGV[1])
  return 0
end
redis.call('ZADD', KEYS[1], 'XX', ARGV[2], ARGV[1])
redis.call('ZADD', KEYS[2], 'XX', ARGV[2], ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[3])
redis.call('PEXPIRE', KEYS[2], ARGV[3])
return 1
`;

const releaseLua = `
redis.call('ZREM', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
return 1
`;

export type LlmGatewayAdmission = { release(): Promise<void> };
export type LlmGatewayProvider = 'anthropic' | 'openai';

@Injectable()
export class LlmGatewayLimiter {
  private readonly logger = new Logger(LlmGatewayLimiter.name);

  public constructor(
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(llmGatewayOptionsKey) private readonly options: LlmGatewayOptions,
  ) {}

  public async acquire(principalId: string, provider: LlmGatewayProvider): Promise<LlmGatewayAdmission> {
    const principalHash = createHash('sha256').update(principalId).digest('base64url');
    const now = Date.now();
    const windowMs = 60_000;
    const rateKey = `tau:llm:rate:${principalHash}:${String(Math.floor(now / windowMs))}`;
    const concurrencyKey = `tau:llm:active:${principalHash}`;
    const providerConcurrencyKey = `tau:llm:active:provider:${provider}`;
    const requestId = randomUUID();
    let result: unknown;
    try {
      result = await this.redis.client.eval(
        acquireLua,
        3,
        rateKey,
        concurrencyKey,
        providerConcurrencyKey,
        String(now),
        String(now + this.options.concurrencyLeaseMs),
        requestId,
        String(windowMs),
        String(this.options.maxConcurrentRequests),
        String(this.options.requestsPerMinute),
        String(this.options.maxProviderConcurrentRequests),
        String(this.options.concurrencyLeaseMs),
      );
    } catch (error) {
      this.logger.error(`Gateway admission unavailable: ${String(error)}`);
      throw new LlmGatewayError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'PROVIDER_UNAVAILABLE',
        'The model gateway is unavailable.',
      );
    }
    const code = Array.isArray(result) ? Number(result[0]) : 0;
    if (code === 2 || code === 3 || code === 4) {
      throw new LlmGatewayError(
        HttpStatus.TOO_MANY_REQUESTS,
        'RATE_LIMITED',
        'The model gateway rate limit was exceeded.',
      );
    }
    if (code !== 1) {
      throw new LlmGatewayError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'PROVIDER_UNAVAILABLE',
        'The model gateway is unavailable.',
      );
    }

    let released = false;
    const heartbeat = setInterval(() => {
      void this.refresh([concurrencyKey, providerConcurrencyKey], requestId);
    }, this.options.concurrencyHeartbeatMs);
    heartbeat.unref();
    return {
      release: async () => {
        if (released) {
          return;
        }
        released = true;
        clearInterval(heartbeat);
        try {
          await this.redis.client.eval(releaseLua, 2, concurrencyKey, providerConcurrencyKey, requestId);
        } catch (error) {
          this.logger.error(`Gateway concurrency release failed: ${String(error)}`);
        }
      },
    };
  }

  private async refresh(keys: readonly [string, string], requestId: string): Promise<void> {
    try {
      const now = Date.now();
      await this.redis.client.eval(
        heartbeatLua,
        2,
        ...keys,
        requestId,
        String(now + this.options.concurrencyLeaseMs),
        String(this.options.concurrencyLeaseMs),
      );
    } catch (error) {
      this.logger.error(`Gateway concurrency heartbeat failed: ${String(error)}`);
    }
  }
}
