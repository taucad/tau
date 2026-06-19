import { describe, expect, it, vi } from 'vitest';
import type { RedisService } from '#redis/redis.service.js';
import { ViewRateLimiterService } from '#api/publications/view-rate-limiter.service.js';

function createServiceWithEvalReturns(values: number[]): {
  service: ViewRateLimiterService;
  evalSpy: ReturnType<typeof vi.fn>;
} {
  const evalSpy = vi.fn();
  for (const value of values) {
    evalSpy.mockResolvedValueOnce(value);
  }

  const redisService = { client: { eval: evalSpy } } as unknown as RedisService;
  return { service: new ViewRateLimiterService(redisService), evalSpy };
}

describe('ViewRateLimiterService', () => {
  it('should allow first 5 calls and reject the 6th call within the same day', async () => {
    const { service } = createServiceWithEvalReturns([1, 2, 3, 4, 5, 6]);

    const attempts = Array.from({ length: 6 }, async () =>
      service.consumePublicationViewSlot({
        publicationId: 'pub_1',
        viewerHash: 'h-anon',
      }),
    );
    const results = await Promise.all(attempts);
    const outcomes = results.map((r) => r.allowed);

    expect(outcomes).toEqual([true, true, true, true, true, false]);
  });

  it('should pass the canonical key shape and 86400s TTL to the Lua script', async () => {
    const { service, evalSpy } = createServiceWithEvalReturns([1]);

    await service.consumePublicationViewSlot({
      publicationId: 'pub_1',
      viewerHash: 'h-anon',
    });

    const lastCall = evalSpy.mock.calls[0];
    expect(lastCall).toBeDefined();

    // Eval signature: eval(script, numberKeys, ...keys, ...argv)
    const script = lastCall?.[0] as string;
    const numberKeys = lastCall?.[1] as number;
    const key = lastCall?.[2] as string;
    const expirySeconds = lastCall?.[3] as string;

    expect(typeof script).toBe('string');
    expect(script).toContain('INCR');
    expect(script).toContain('EXPIRE');
    expect(numberKeys).toBe(1);
    expect(key).toMatch(/^pub:pub_1:rl:h-anon:\d{8}$/u);
    expect(expirySeconds).toBe('86400');
  });
});
