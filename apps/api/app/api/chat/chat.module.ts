import { Module } from '@nestjs/common';
import { ModelModule } from '#api/models/model.module.js';
import { BillingModule } from '#api/billing/billing.module.js';
import { ChatController } from '#api/chat/chat.controller.js';
import { ChatService } from '#api/chat/chat.service.js';

@Module({
  imports: [ModelModule, BillingModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
