import { Module } from '@nestjs/common';
import { DatabaseModule } from '#database/database.module.js';
import { BillingModule } from '#api/billing/billing.module.js';
import { TelemetryPurposeController } from '#api/telemetry-purposes/telemetry-purpose.controller.js';
import { TelemetryPurposeService } from '#api/telemetry-purposes/telemetry-purpose.service.js';

@Module({
  imports: [DatabaseModule, BillingModule],
  controllers: [TelemetryPurposeController],
  providers: [TelemetryPurposeService],
  exports: [TelemetryPurposeService],
})
export class TelemetryPurposeModule {}
