import { describe, expect, it, vi } from 'vitest';
import type { RedisService } from '#redis/redis.service.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';

function createServiceWithEvalReturns(values: number[]): {
  service: PublicationRateLimiterService;
  evalSpy: ReturnType<typeof vi.fn>;
} {
  const evalSpy = vi.fn();
  for (const value of values) {
    evalSpy.mockResolvedValueOnce(value);
  }

  const redisService = { client: { eval: evalSpy } } as unknown as RedisService;
  return { service: new PublicationRateLimiterService(redisService), evalSpy };
}

describe('PublicationRateLimiterService', () => {
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

  it('should allow an invite-email batch that lands on the daily cap and reject the batch that crosses it', async () => {
    const { service } = createServiceWithEvalReturns([200, 201]);

    const atCap = await service.consumeInviteEmailSlots({ ownerId: 'user_1', count: 50 });
    const overCap = await service.consumeInviteEmailSlots({ ownerId: 'user_1', count: 1 });

    expect(atCap).toEqual({ allowed: true, count: 200 });
    expect(overCap).toEqual({ allowed: false, count: 201 });
  });

  it('should pass the owner-scoped key, 86400s TTL, and batch count to the INCRBY script', async () => {
    const { service, evalSpy } = createServiceWithEvalReturns([7]);

    await service.consumeInviteEmailSlots({ ownerId: 'user_42', count: 7 });

    const lastCall = evalSpy.mock.calls[0];
    expect(lastCall).toBeDefined();

    // Eval signature: eval(script, numberKeys, ...keys, ...argv)
    const script = lastCall?.[0] as string;
    const numberKeys = lastCall?.[1] as number;
    const key = lastCall?.[2] as string;
    const expirySeconds = lastCall?.[3] as string;
    const count = lastCall?.[4] as string;

    expect(script).toContain('INCRBY');
    expect(script).toContain('EXPIRE');
    expect(numberKeys).toBe(1);
    expect(key).toMatch(/^pub:invite-email:rl:user_42:\d{8}$/u);
    expect(expirySeconds).toBe('86400');
    expect(count).toBe('7');
  });

  /* D22: the git routes' budgets are fixed windows, and a refusal owes the
     client the seconds until the window ends as `Retry-After`. */
  it('should key a window budget by its window, expire it with the window and say when it ends', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-25T10:00:45.000Z') });
    try {
      const { service, evalSpy } = createServiceWithEvalReturns([60, 61]);

      const within = await service.consumeWindowBudget({ key: 'git:user_1:proj_1', limit: 60, windowSeconds: 60 });
      const over = await service.consumeWindowBudget({ key: 'git:user_1:proj_1', limit: 60, windowSeconds: 60 });

      expect(within).toEqual({ allowed: true, count: 60, retryAfterSeconds: 15 });
      expect(over).toEqual({ allowed: false, count: 61, retryAfterSeconds: 15 });
      const window = Math.floor(Date.parse('2026-09-25T10:00:45.000Z') / 60_000);
      expect(evalSpy.mock.calls[0]?.[2]).toBe(`git:user_1:proj_1:w60:${String(window)}`);
      expect(evalSpy.mock.calls[0]?.[3]).toBe('60');
    } finally {
      vi.useRealTimers();
    }
  });

  it('should end a day-long window at UTC midnight', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-25T23:59:00.000Z') });
    try {
      const { service } = createServiceWithEvalReturns([1]);

      await expect(
        service.consumeWindowBudget({ key: 'git:hydrate:owner_1', limit: 10, windowSeconds: 86_400 }),
      ).resolves.toMatchObject({ allowed: true, retryAfterSeconds: 60 });
    } finally {
      vi.useRealTimers();
    }
  });
});
