/* oxlint-disable new-cap, typescript-eslint/consistent-type-imports -- NestJS DI requires runtime imports for constructor injection */
import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import { RedisService } from '#redis/redis.service.js';

@Injectable()
export class RedisHealthIndicator {
  public constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly redisService: RedisService,
  ) {}

  public async isHealthy(): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check('redis');
    const start = performance.now();

    try {
      const result = await this.redisService.client.ping();
      const responseTimeMs = Math.round(performance.now() - start);

      if (result !== ('PONG' as string)) {
        return indicator.down({ responseTimeMs, message: `Unexpected PING response: ${result}` });
      }

      if (responseTimeMs > 500) {
        return indicator.down({ responseTimeMs, message: 'Response time exceeds 500ms threshold' });
      }

      return indicator.up({ responseTimeMs });
    } catch (error) {
      return indicator.down({
        responseTimeMs: Math.round(performance.now() - start),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
