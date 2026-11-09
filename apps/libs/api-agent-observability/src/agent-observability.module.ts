import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { DatabaseModule } from '@taucad/api-database';
import { HostsModule } from '@taucad/api-hosts';
import { EvidenceIngressController } from '#evidence-ingress.controller.js';
import { EvidenceIngressService } from '#evidence-ingress.service.js';
import { EvidenceDeliveryService } from '#evidence-delivery.service.js';
import { EvidenceErasureService } from '#evidence-erasure.service.js';
import { ModelInvocationEvidenceRecorder } from '#model-invocation-recorder.service.js';

/**
 * Agent-evidence ingress, receipt and delivery backlog (blueprint T06), and
 * its delivery to Langfuse (T08) and erasure from it (T13). Global so the model invocation owner can
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
      providers: [
        EvidenceIngressService,
        EvidenceDeliveryService,
        EvidenceErasureService,
        ModelInvocationEvidenceRecorder,
      ],
      exports: [ModelInvocationEvidenceRecorder],
    };
  }
}
