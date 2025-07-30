import { Module } from '@nestjs/common';
import { ProviderModule } from '#api/providers/provider.module.js';
import { ModelController } from '#api/models/model.controller.js';
import { ModelService } from '#api/models/model.service.js';

@Module({
  imports: [ProviderModule],
  controllers: [ModelController],
  providers: [ModelService],
  exports: [ModelService],
})
export class ModelModule {}
