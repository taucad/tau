import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DatabaseModule } from '#database/database.module.js';
import { HealthController } from '#api/health/health.controller.js';
import { RedisHealthIndicator } from '#api/health/redis-health.indicator.js';
import { DatabaseHealthIndicator } from '#api/health/database-health.indicator.js';
import { S3HealthIndicator } from '#api/health/s3-health.indicator.js';
import { GitToolchainHealthIndicator } from '#api/health/git-toolchain-health.indicator.js';

@Module({
  // Terminus' own logger prints every failed check at error level as unstructured text. Readiness
  // refusals are logged as structured warnings by HealthController; a liveness failure still reaches
  // the exception filter's error log with the terminus result attached.
  imports: [TerminusModule.forRoot({ logger: false }), DatabaseModule],
  controllers: [HealthController],
  // StorageModule is @Global() so ObjectStorageService is available without an explicit import.
  providers: [RedisHealthIndicator, DatabaseHealthIndicator, S3HealthIndicator, GitToolchainHealthIndicator],
})
export class HealthModule {}
