import { Module } from '@nestjs/common';
import { financialEnvironmentSchema } from '@taucad/billing';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '@taucad/api-core';
import { DatabaseModule, DatabaseService } from '@taucad/api-database';
import { RedisService } from '@taucad/api-redis';
import { MetricsService } from '@taucad/api-observability/metrics';
import { accountingTasks, r2SourceOf } from '#storage-accounting/accounting-tasks.js';
import { StorageAccountingScheduler, redisSnapshotStore } from '#storage-accounting/storage-accounting.scheduler.js';

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
          /* Plans resolve in SQL as `BillingService` projects them, never through Stripe. */
          plans: {
            tauCloudEnabled: config.get('TAU_CLOUD_ENABLED', { infer: true }),
            environment: environment.success ? environment.data : undefined,
          },
          r2: r2SourceOf({
            accountId: config.get('TAU_CLOUDFLARE_ACCOUNT_ID', { infer: true }),
            token: config.get('TAU_CLOUDFLARE_ANALYTICS_TOKEN', {
              infer: true,
            }),
            publicBucket: config.get('TAU_S3_BUCKET', { infer: true }),
            privateBucket: config.get('TAU_S3_PRIVATE_BUCKET', { infer: true }),
            downloadsBucket: config.get('TAU_CLOUDFLARE_DOWNLOADS_BUCKET', { infer: true }),
            dependenciesBucket: config.get('TAU_CLOUDFLARE_DEPENDENCIES_BUCKET', { infer: true }),
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
