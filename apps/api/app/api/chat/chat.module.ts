import { Module } from '@nestjs/common';
import { ModelModule } from '#api/models/model.module.js';
import { ToolModule } from '#api/tools/tool.module.js';
import { FileEditModule } from '#api/file-edit/file-edit.module.js';
import { ChatController } from '#api/chat/chat.controller.js';
import { ChatService } from '#api/chat/chat.service.js';
import { ChatRpcService } from '#api/chat/chat-rpc.service.js';
import { ChatRpcGateway } from '#api/chat/chat-rpc.gateway.js';
import { CheckpointerService } from '#api/chat/checkpointer.service.js';
import { StoreService } from '#api/chat/store.service.js';
import { CompactionService } from '#api/chat/compaction.service.js';
import { TauRpcBackendFactory } from '#api/chat/tau-rpc-backend.js';
import { TokenBudgetService } from '#api/chat/token-budget.service.js';
import { ProviderRequestRecorder } from '#api/chat/utils/provider-request-recorder.js';

@Module({
  imports: [ModelModule, ToolModule, FileEditModule],
  controllers: [ChatController],
  providers: [
    CheckpointerService,
    StoreService,
    ChatService,
    ChatRpcService,
    ChatRpcGateway,
    CompactionService,
    TokenBudgetService,
    TauRpcBackendFactory,
    ProviderRequestRecorder,
  ],
  exports: [ChatService, ChatRpcService, StoreService, ProviderRequestRecorder],
})
export class ChatModule {}
