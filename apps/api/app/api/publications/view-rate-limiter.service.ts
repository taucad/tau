import { Injectable } from '@nestjs/common';
import { RedisService } from '#redis/redis.service.js';

/** Daily publication view PATCH cap per viewer identity (rolling bucket via Redis TTL). */
const publishViewRateLimitMaxPerDay = 5;

/** Seconds — aligns with calendar-day bucket key + Redis expiry. */
const publishViewRateLimitExpirySeconds = 86_400;

const incrExpireLua = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

@Injectable()
export class ViewRateLimiterService {
  public constructor(private readonly redisService: RedisService) {}

  public async consumePublicationViewSlot(args: {
    publicationId: string;
    viewerHash: string;
  }): Promise<{ allowed: boolean; count: number }> {
    const yyyymmdd = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const key = `pub:${args.publicationId}:rl:${args.viewerHash}:${yyyymmdd}`;
    const countRaw = await this.redisService.client.eval(
      incrExpireLua,
      1,
      key,
      publishViewRateLimitExpirySeconds.toString(),
    );
    const count = typeof countRaw === 'number' ? countRaw : Number(countRaw);

    return {
      allowed: count <= publishViewRateLimitMaxPerDay,
      count,
    };
  }
}
