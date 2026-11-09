import { Module } from '@nestjs/common';
import { ModelModule } from '@taucad/api-llm-gateway';
import { ChatController } from '#chat.controller.js';
import { ChatService } from '#chat.service.js';

@Module({
  imports: [ModelModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
