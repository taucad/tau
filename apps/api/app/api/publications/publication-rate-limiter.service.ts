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
