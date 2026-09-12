import { Module } from '@nestjs/common';
import { KernelsGateway } from '#api/kernels/kernels.gateway.js';
import { KernelsService } from '#api/kernels/kernels.service.js';

@Module({
  providers: [KernelsGateway, KernelsService],
  exports: [KernelsService],
})
export class KernelsModule {}
