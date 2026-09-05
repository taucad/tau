import { Module } from '@nestjs/common';
import { KernelsGateway } from '#api/kernels/kernels.gateway.js';
import { KernelsService } from '#api/kernels/kernels.service.js';
import { BillingModule } from '#api/billing/billing.module.js';

@Module({
  imports: [BillingModule],
  providers: [KernelsGateway, KernelsService],
  exports: [KernelsService],
})
export class KernelsModule {}
