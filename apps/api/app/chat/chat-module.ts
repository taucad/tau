import { Module } from '@nestjs/common';
import { ModelModule } from '~/models/model-module.js';
import { ToolModule } from '~/tools/tool-module.js';
import { ChatController } from '~/chat/chat-controller.js';
import { ChatService } from '~/chat/chat-service.js';
import { FileEditController } from '~/chat/file-edit-controller.js';
import { FileEditService } from '~/chat/file-edit-service.js';

@Module({
  imports: [ModelModule, ToolModule],
  controllers: [ChatController, FileEditController],
  providers: [ChatService, FileEditService],
  exports: [ChatService, FileEditService],
})
export class ChatModule {}
