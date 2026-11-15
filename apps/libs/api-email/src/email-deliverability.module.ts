import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '@taucad/api-core';
import { DatabaseModule, DatabaseService } from '@taucad/api-database';
import { MetricsService } from '@taucad/api-observability/metrics';
import { EmailDeliverabilityService } from '#email-deliverability.service.js';
import { ResendWebhookService } from '#resend-webhook.service.js';

/**
 * The Resend webhook inbox and the address-state reader (email bounce blueprint R7, R9). Separate from
 * `EmailModule` because `EmailService` must stay constructible without a database: the billing worker
 * builds it from raw `process.env`. `MetricsService` comes from the global telemetry module.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: EmailDeliverabilityService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService): EmailDeliverabilityService => new EmailDeliverabilityService(database),
    },
    {
      provide: ResendWebhookService,
      inject: [ConfigService, DatabaseService, MetricsService],
      useFactory: (
        config: ConfigService<Environment, true>,
        database: DatabaseService,
        metrics: MetricsService,
      ): ResendWebhookService => new ResendWebhookService(config, database, metrics),
    },
  ],
  exports: [EmailDeliverabilityService, ResendWebhookService],
})
export class EmailDeliverabilityModule {}
