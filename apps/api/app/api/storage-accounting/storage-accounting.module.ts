import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import { DatabaseModule } from '#database/database.module.js';
import { DatabaseService } from '#database/database.service.js';
import { RedisService } from '#redis/redis.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import { commercialEntitlementsKey } from '#api/entitlements/commercial-entitlements.js';
import type { CommercialEntitlementsService } from '#api/entitlements/commercial-entitlements.js';
import { storageLimitOf } from '#api/git/git.service.js';
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
      inject: [DatabaseService, RedisService, MetricsService, ConfigService, commercialEntitlementsKey],
      // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- Nest resolves five distinct provider tokens.
      useFactory(
        database: DatabaseService,
        redis: RedisService,
        metrics: MetricsService,
        config: ConfigService<Environment, true>,
        entitlements: CommercialEntitlementsService,
      ): StorageAccountingScheduler {
        const tasks = accountingTasks({
          database: database.database,
          /* The plan and allowance `GitRepositoryService.authorize` enforces; a self-host build has no tier
             and the Pro allowance, so it counts as `pro`. */
          async resolvePlan(ownerId) {
            const owner = await entitlements.getEntitlements(ownerId);
            return {
              plan: owner.tier ?? 'pro',
              limitBytes: storageLimitOf(owner),
            };
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
