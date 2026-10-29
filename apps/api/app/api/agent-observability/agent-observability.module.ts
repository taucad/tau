import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { DatabaseModule } from '#database/database.module.js';
import { TelemetryPurposeModule } from '#api/telemetry-purposes/telemetry-purpose.module.js';
import { EvidenceIngressController } from '#api/agent-observability/evidence-ingress.controller.js';
import { EvidenceIngressService } from '#api/agent-observability/evidence-ingress.service.js';

/** Agent-evidence ingress, receipt and delivery backlog (blueprint T06). */
@Module({})
export class AgentObservabilityModule {
  public static forRoot(options: { readonly tauCloudEnabled: boolean }): DynamicModule {
    return {
      module: AgentObservabilityModule,
      imports: [DatabaseModule, TelemetryPurposeModule.forRoot(options)],
      controllers: [EvidenceIngressController],
      providers: [EvidenceIngressService],
    };
  }
}
