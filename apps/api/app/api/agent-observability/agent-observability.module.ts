import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { DatabaseModule } from '#database/database.module.js';
import { HostsModule } from '#api/hosts/hosts.module.js';
import { EvidenceIngressController } from '#api/agent-observability/evidence-ingress.controller.js';
import { EvidenceIngressService } from '#api/agent-observability/evidence-ingress.service.js';
import { EvidenceDeliveryService } from '#api/agent-observability/evidence-delivery.service.js';
import { ModelInvocationEvidenceRecorder } from '#api/agent-observability/model-invocation-recorder.service.js';

/**
 * Agent-evidence ingress, receipt and delivery backlog (blueprint T06), and
 * its delivery to Langfuse (T08). Global so the model invocation owner can
 * take the API-reported attempt recorder (T07) without importing this module. Purpose
 * authority comes from the global `TelemetryPurposeModule`, which the API module
 * registers first.
 */
@Module({})
export class AgentObservabilityModule {
  public static forRoot(): DynamicModule {
    return {
      module: AgentObservabilityModule,
      global: true,
      imports: [DatabaseModule, HostsModule],
      controllers: [EvidenceIngressController],
      providers: [EvidenceIngressService, EvidenceDeliveryService, ModelInvocationEvidenceRecorder],
      exports: [ModelInvocationEvidenceRecorder],
    };
  }
}
