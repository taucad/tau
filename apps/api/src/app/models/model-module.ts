import { Module } from '@nestjs/common';
import { ProviderModule } from '../providers/provider-module.js';
import { ModelController } from './model-controller.js';
import { ModelService } from './model-service.js';

@Module({
  imports: [ProviderModule],
  controllers: [ModelController],
  providers: [ModelService],
  exports: [ModelService],
})
export class ModelModule {}
