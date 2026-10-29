import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { DatabaseModule } from '#database/database.module.js';
import { EvidenceIngressController } from '#api/agent-observability/evidence-ingress.controller.js';
import { EvidenceIngressService } from '#api/agent-observability/evidence-ingress.service.js';

/**
 * Agent-evidence ingress, receipt and delivery backlog (blueprint T06). Purpose
 * authority comes from the global `TelemetryPurposeModule`, which the API module
 * registers first.
 */
@Module({})
export class AgentObservabilityModule {
  public static forRoot(): DynamicModule {
    return {
      module: AgentObservabilityModule,
      imports: [DatabaseModule],
      controllers: [EvidenceIngressController],
      providers: [EvidenceIngressService],
    };
  }
}
