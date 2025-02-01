import { Module } from '@nestjs/common';

import { ModelController } from './model.controller';
import { ModelService } from './model.service';

@Module({
  imports: [],
  controllers: [ModelController],
  providers: [ModelService],
  exports: [ModelService],
})
export class ModelModule {}
