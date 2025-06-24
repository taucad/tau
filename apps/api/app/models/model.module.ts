import { Module } from '@nestjs/common';
import { ProviderModule } from '~/providers/provider.module.js';
import { ModelController } from '~/models/model.controller.js';
import { ModelService } from '~/models/model.service.js';

@Module({
  imports: [ProviderModule],
  controllers: [ModelController],
  providers: [ModelService],
  exports: [ModelService],
})
export class ModelModule {}
