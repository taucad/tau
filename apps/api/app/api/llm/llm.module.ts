import { Module } from '@nestjs/common';
import { BillingModule } from '#api/billing/billing.module.js';
import { HostsModule } from '#api/hosts/hosts.module.js';
import { TokenBudgetService } from '#api/chat/token-budget.service.js';
import { LlmGatewayController } from '#api/llm/llm-gateway.controller.js';
import { LlmGatewayAuthGuard } from '#api/llm/llm-gateway.guard.js';
import { LlmGatewayLimiter } from '#api/llm/llm-gateway-limiter.service.js';
import { llmGatewayOptionsKey, loadLlmGatewayOptions } from '#api/llm/llm-gateway.options.js';
import { LlmGatewayService } from '#api/llm/llm-gateway.service.js';

@Module({
  imports: [BillingModule, HostsModule],
  controllers: [LlmGatewayController],
  providers: [
    { provide: llmGatewayOptionsKey, useFactory: loadLlmGatewayOptions },
    TokenBudgetService,
    LlmGatewayAuthGuard,
    LlmGatewayLimiter,
    LlmGatewayService,
  ],
})
export class LlmModule {}
