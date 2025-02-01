import { Module } from '@nestjs/common';

import { ChatController } from './chat.controller';
import { ModelModule } from './model.module';

@Module({
  imports: [ModelModule],
  controllers: [ChatController],
  providers: [],
})
export class ChatModule {}
