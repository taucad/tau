import { Module } from '@nestjs/common';
import { EmailDeliverabilityModule } from '@taucad/api-email';
import { EmailDeliverabilityController } from '#api/email-deliverability/email-deliverability.controller.js';

/** `GET /v1/email/deliverability`: the settings banner's read of the caller's own address. */
@Module({
  imports: [EmailDeliverabilityModule],
  controllers: [EmailDeliverabilityController],
})
export class EmailDeliverabilityApiModule {}
