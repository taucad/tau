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
    const count = await this.consumeDailySlots({
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
    const count = await this.consumeDailySlots({
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
    const count = await this.consumeDailySlots({
      key: `${args.key}:${dayBucket()}`,
      count: args.count ?? 1,
    });

    return { allowed: count <= args.limit, count };
  }

  private async consumeDailySlots(args: { key: string; count: number }): Promise<number> {
    const countRaw = await this.redisService.client.eval(
      incrByExpireLua,
      1,
      args.key,
      rateLimitExpirySeconds.toString(),
      args.count.toString(),
    );

    return typeof countRaw === 'number' ? countRaw : Number(countRaw);
  }
}
