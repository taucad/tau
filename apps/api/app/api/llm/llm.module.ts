import { Module } from '@nestjs/common';
import { HostsModule } from '#api/hosts/hosts.module.js';
import { LlmGatewayBodyTiming } from '#api/llm/llm-gateway-body-timing.js';
import { LlmGatewayController } from '#api/llm/llm-gateway.controller.js';
import { LlmGatewayAuthGuard } from '#api/llm/llm-gateway.guard.js';
import { LlmGatewayService } from '#api/llm/llm-gateway.service.js';

@Module({
  imports: [HostsModule],
  controllers: [LlmGatewayController],
  providers: [LlmGatewayAuthGuard, LlmGatewayService, LlmGatewayBodyTiming],
})
export class LlmModule {}
