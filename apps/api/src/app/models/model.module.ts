import { Module } from '@nestjs/common';

import { ProviderModule } from '../providers/provider.module';
import { ModelController } from './model.controller';
import { ModelService } from './model.service';

@Module({
  imports: [ProviderModule],
  controllers: [ModelController],
  providers: [ModelService],
  exports: [ModelService],
})
export class ModelModule {}
