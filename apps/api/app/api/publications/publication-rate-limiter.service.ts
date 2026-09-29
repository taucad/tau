import { Injectable } from '@nestjs/common';
import { RedisService } from '#redis/redis.service.js';

/** Daily publication view PATCH cap per viewer identity (rolling bucket via Redis TTL). */
const publishViewRateLimitMaxPerDay = 5;

/** Daily invite/notification email cap per owner across all their publications. */
const inviteEmailRateLimitMaxPerOwnerPerDay = 200;

/** Seconds — aligns with calendar-day bucket key + Redis expiry. */
const rateLimitExpirySeconds = 86_400;

const incrByExpireLua = `
local current = redis.call('INCRBY', KEYS[1], ARGV[2])
if current == tonumber(ARGV[2]) then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

/** UTC calendar-day bucket (yyyymmdd) shared by every daily rate-limit key. */
const dayBucket = (): string => new Date().toISOString().slice(0, 10).replaceAll('-', '');

@Injectable()
export class PublicationRateLimiterService {
  public constructor(private readonly redisService: RedisService) {}

  public async consumePublicationViewSlot(args: {
    publicationId: string;
    viewerHash: string;
  }): Promise<{ allowed: boolean; count: number }> {
    const count = await this.consumeSlots({
      key: `pub:${args.publicationId}:rl:${args.viewerHash}:${dayBucket()}`,
      count: 1,
    });

    return { allowed: count <= publishViewRateLimitMaxPerDay, count };
  }

  /**
   * Consumes `count` slots from the owner's daily invite-email budget. Callers pass the
   * batch size (one per recipient) so a single publish debits every recipient at once.
   */
  public async consumeInviteEmailSlots(args: {
    ownerId: string;
    count: number;
  }): Promise<{ allowed: boolean; count: number }> {
    const count = await this.consumeSlots({
      key: `pub:invite-email:rl:${args.ownerId}:${dayBucket()}`,
      count: args.count,
    });

    return { allowed: count <= inviteEmailRateLimitMaxPerOwnerPerDay, count };
  }

  /**
   * Consume slots from any daily per-caller budget.
   *
   * The two methods above are publication budgets; this one is the same Redis
   * bucket with the caller naming its own key and ceiling, so a second route
   * does not have to re-implement the Lua or the calendar-day expiry. The day
   * is appended here, so a caller cannot get the bucketing wrong.
   *
   * ponytail: this service is the API's only rate limiter and lives under
   * `publications` for historical reasons; moving it is a rename, not a fix,
   * and belongs to whoever next owns both modules.
   *
   * @param args - The key prefix, the daily ceiling, and how many slots to take.
   * @returns Whether the call is within budget, and the running count.
   */
  public async consumeDailyBudget(args: {
    key: string;
    limit: number;
    count?: number;
  }): Promise<{ allowed: boolean; count: number }> {
    const count = await this.consumeSlots({
      key: `${args.key}:${dayBucket()}`,
      count: args.count ?? 1,
    });

    return { allowed: count <= args.limit, count };
  }

  /**
   * Consume slots from a fixed window aligned to the Unix epoch.
   *
   * The same Redis bucket as the daily budgets, with a window the caller names
   * and the seconds until it ends, which is what a `429` owes the client as
   * `Retry-After`. A window of 86 400 seconds is the UTC day, because epoch
   * seconds carry no leap seconds.
   *
   * @param args - The key prefix, the ceiling per window, the window length and how many slots to take.
   * @returns Whether the call is within budget, the running count, and the seconds left in the window.
   */
  public async consumeWindowBudget(args: {
    key: string;
    limit: number;
    windowSeconds: number;
    count?: number;
  }): Promise<{ allowed: boolean; count: number; retryAfterSeconds: number }> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const window = Math.floor(nowSeconds / args.windowSeconds);
    const count = await this.consumeSlots({
      key: `${args.key}:w${String(args.windowSeconds)}:${String(window)}`,
      count: args.count ?? 1,
      expirySeconds: args.windowSeconds,
    });

    return {
      allowed: count <= args.limit,
      count,
      retryAfterSeconds: Math.max(1, (window + 1) * args.windowSeconds - nowSeconds),
    };
  }

  private async consumeSlots(args: { key: string; count: number; expirySeconds?: number }): Promise<number> {
    const countRaw = await this.redisService.client.eval(
      incrByExpireLua,
      1,
      args.key,
      (args.expirySeconds ?? rateLimitExpirySeconds).toString(),
      args.count.toString(),
    );

    return typeof countRaw === 'number' ? countRaw : Number(countRaw);
  }
}
