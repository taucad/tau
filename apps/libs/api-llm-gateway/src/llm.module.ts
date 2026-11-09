import { Module } from '@nestjs/common';
import { HostsModule } from '@taucad/api-hosts';
import { LlmGatewayBodyTiming } from '#llm-gateway-body-timing.js';
import { LlmGatewayController } from '#llm-gateway.controller.js';
import { LlmGatewayAuthGuard } from '#llm-gateway.guard.js';
import { LlmGatewayService } from '#llm-gateway.service.js';
import { WebResearchController, webResearchDependenciesProvider } from '#web-research/web-research.controller.js';

@Module({
  imports: [HostsModule],
  controllers: [LlmGatewayController, WebResearchController],
  providers: [LlmGatewayAuthGuard, LlmGatewayService, LlmGatewayBodyTiming, webResearchDependenciesProvider],
})
export class LlmModule {}
