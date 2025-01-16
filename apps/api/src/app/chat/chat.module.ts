import { Module } from '@nestjs/common';

import { ChatController } from './chat.controller';

@Module({
  imports: [],
  controllers: [ChatController],
  providers: [],
})
export class ChatModule {}
