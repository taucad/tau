import { Module } from '@nestjs/common';

import { ModelModule } from '../models/model.module';
import { ChatController } from './chat.controller';

@Module({
  imports: [ModelModule],
  controllers: [ChatController],
  providers: [],
})
export class ChatModule {}
