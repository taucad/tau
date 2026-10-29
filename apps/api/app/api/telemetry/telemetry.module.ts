import { Module } from '@nestjs/common';
import { TelemetryController } from '#api/telemetry/telemetry.controller.js';
import { RuntimeIngestService } from '#api/telemetry/runtime-ingest.service.js';
import { RuntimeMetricsService } from '#api/telemetry/runtime-metrics.service.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';

@Module({
  controllers: [TelemetryController],
  providers: [RuntimeIngestService, RuntimeMetricsService, PublicationRateLimiterService],
})
export class TelemetryIngestModule {}
