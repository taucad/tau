import { Module } from '@nestjs/common';
import { ModelModule } from '@taucad/api-llm-gateway';
import { ChatController } from '#api/chat/chat.controller.js';
import { ChatService } from '#api/chat/chat.service.js';

@Module({
  imports: [ModelModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
