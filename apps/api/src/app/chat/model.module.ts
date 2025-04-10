import { Module } from '@nestjs/common';

import { ModelController } from './model.controller';
import { ModelService } from './model.service';
import { ProviderService } from './provider.service';

@Module({
  imports: [],
  controllers: [ModelController],
  providers: [ModelService, ProviderService],
  exports: [ModelService, ProviderService],
})
export class ModelModule {}
