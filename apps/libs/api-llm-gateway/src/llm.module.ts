import { Module } from '@nestjs/common';
import { HostsModule } from '@taucad/api-hosts';
import { LlmGatewayBodyTiming } from '#llm-gateway-body-timing.js';
import { LlmGatewayController } from '#llm-gateway.controller.js';
import { LlmGatewayAuthGuard } from '#llm-gateway.guard.js';
import { LlmGatewayService } from '#llm-gateway.service.js';

@Module({
  imports: [HostsModule],
  controllers: [LlmGatewayController],
  providers: [LlmGatewayAuthGuard, LlmGatewayService, LlmGatewayBodyTiming],
})
export class LlmModule {}
