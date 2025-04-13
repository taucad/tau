import { Module } from '@nestjs/common';
import { ModelModule } from '../models/model-module.js';
import { ToolModule } from '../tools/tool-module.js';
import { ChatController } from './chat-controller.js';
import { ChatService } from './chat-service.js';

@Module({
  imports: [ModelModule, ToolModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
