import { Module } from '@nestjs/common';
import { financialEnvironmentSchema } from '@taucad/billing';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import { DatabaseModule } from '#database/database.module.js';
import { DatabaseService } from '#database/database.service.js';
import { RedisService } from '#redis/redis.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import { accountingTasks, r2SourceOf } from '#api/storage-accounting/accounting-tasks.js';
import {
  StorageAccountingScheduler,
  redisSnapshotStore,
} from '#api/storage-accounting/storage-accounting.scheduler.js';

/** The storage accounting scheduler (W14 OB3): usage, Postgres connections and R2 analytics as gauges. */
// oxlint-disable-next-line new-cap -- NestJS decorators are factories
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: StorageAccountingScheduler,
      inject: [DatabaseService, RedisService, MetricsService, ConfigService],
      // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- Nest resolves four distinct provider tokens.
      useFactory(
        database: DatabaseService,
        redis: RedisService,
        metrics: MetricsService,
        config: ConfigService<Environment, true>,
      ): StorageAccountingScheduler {
        const environment = financialEnvironmentSchema.safeParse(config.get('BILLING_ENVIRONMENT', { infer: true }));
        const tasks = accountingTasks({
          database: database.database,
          /* Plans resolve in SQL as `BillingService` projects them, never through Stripe (D23's gate included). */
          plans: {
            tauCloudEnabled: config.get('TAU_CLOUD_ENABLED', { infer: true }),
            environment: environment.success ? environment.data : undefined,
            freeTierSync:
              config.get('TAU_FREE_TIER_SYNC_ENABLED', { infer: true }) &&
              config.get('NODE_ENV', { infer: true }) !== 'production',
          },
          r2: r2SourceOf({
            accountId: config.get('TAU_CLOUDFLARE_ACCOUNT_ID', { infer: true }),
            token: config.get('TAU_CLOUDFLARE_ANALYTICS_TOKEN', {
              infer: true,
            }),
            publicBucket: config.get('TAU_S3_BUCKET', { infer: true }),
            privateBucket: config.get('TAU_S3_PRIVATE_BUCKET', { infer: true }),
          }),
        });
        return new StorageAccountingScheduler({
          tasks,
          store: redisSnapshotStore(redis.client),
          metrics,
        });
      },
    },
  ],
})
export class StorageAccountingModule {}
