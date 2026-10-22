/* oxlint-disable new-cap, typescript-eslint/consistent-type-imports -- NestJS DI requires runtime imports for constructor injection */
import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '#database/database.service.js';

@Injectable()
export class DatabaseHealthIndicator {
  public constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly databaseService: DatabaseService,
  ) {}

  public async isHealthy(): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check('database');
    const start = performance.now();

    try {
      await this.databaseService.database.execute(sql`SELECT 1`);
      const responseTimeMs = Math.round(performance.now() - start);

      if (responseTimeMs > 300) {
        return indicator.down({ responseTimeMs, message: 'Response time exceeds 300ms threshold' });
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
