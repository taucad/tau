import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DatabaseModule } from '#database/database.module.js';
import { HealthController } from '#api/health/health.controller.js';
import { RedisHealthIndicator } from '#api/health/redis-health.indicator.js';
import { DatabaseHealthIndicator } from '#api/health/database-health.indicator.js';
import { S3HealthIndicator } from '#api/health/s3-health.indicator.js';

@Module({
  imports: [TerminusModule, DatabaseModule],
  controllers: [HealthController],
  // StorageModule is @Global() so ObjectStorageService is available without an explicit import.
  providers: [RedisHealthIndicator, DatabaseHealthIndicator, S3HealthIndicator],
})
export class HealthModule {}
