/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
/* eslint-disable @typescript-eslint/member-ordering -- metrics grouped by domain, not by visibility */
/**
 * OTEL Metrics Catalog for Tau API.
 *
 * All metric definitions are derived from the canonical `TauMetrics` registry
 * in `@taucad/telemetry`, ensuring names, units, descriptions, and bucket
 * boundaries are always in sync across the stack.
 */
import { Injectable } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';
import { TauMetrics } from '@taucad/telemetry';

@Injectable()
export class MetricsService {
  private readonly apiMeter = metrics.getMeter('tau-api');
  private readonly clientMeter = metrics.getMeter('tau-client');

  // WebSocket / RPC
  public readonly rpcCallDuration = this.apiMeter.createHistogram(TauMetrics.rpcCallDuration.name, {
    description: TauMetrics.rpcCallDuration.description,
    unit: TauMetrics.rpcCallDuration.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.rpcCallDuration.buckets] },
  });

  public readonly rpcActiveCalls = this.apiMeter.createUpDownCounter(TauMetrics.rpcActiveCalls.name, {
    description: TauMetrics.rpcActiveCalls.description,
    unit: TauMetrics.rpcActiveCalls.unit,
  });

  public readonly wsActiveConnections = this.apiMeter.createUpDownCounter(TauMetrics.wsActiveConnections.name, {
    description: TauMetrics.wsActiveConnections.description,
    unit: TauMetrics.wsActiveConnections.unit,
  });

  public readonly wsDisconnections = this.apiMeter.createCounter(TauMetrics.wsDisconnections.name, {
    description: TauMetrics.wsDisconnections.description,
    unit: TauMetrics.wsDisconnections.unit,
  });

  public readonly wsMessageSize = this.apiMeter.createHistogram(TauMetrics.wsMessageSize.name, {
    description: TauMetrics.wsMessageSize.description,
    unit: TauMetrics.wsMessageSize.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.wsMessageSize.buckets] },
  });

  // AI / LLM (GenAI semantic conventions)
  public readonly genAiTokenUsage = this.apiMeter.createHistogram(TauMetrics.genAiTokenUsage.name, {
    description: TauMetrics.genAiTokenUsage.description,
    unit: TauMetrics.genAiTokenUsage.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.genAiTokenUsage.buckets] },
  });

  public readonly genAiOperationDuration = this.apiMeter.createHistogram(TauMetrics.genAiOperationDuration.name, {
    description: TauMetrics.genAiOperationDuration.description,
    unit: TauMetrics.genAiOperationDuration.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.genAiOperationDuration.buckets] },
  });

  public readonly genAiTimeToFirstToken = this.apiMeter.createHistogram(TauMetrics.genAiTimeToFirstToken.name, {
    description: TauMetrics.genAiTimeToFirstToken.description,
    unit: TauMetrics.genAiTimeToFirstToken.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.genAiTimeToFirstToken.buckets] },
  });

  public readonly genAiCost = this.apiMeter.createCounter(TauMetrics.genAiCost.name, {
    description: TauMetrics.genAiCost.description,
    unit: TauMetrics.genAiCost.unit,
  });

  public readonly genAiToolInvocations = this.apiMeter.createCounter(TauMetrics.genAiToolInvocations.name, {
    description: TauMetrics.genAiToolInvocations.description,
    unit: TauMetrics.genAiToolInvocations.unit,
  });

  public readonly genAiAgentIterations = this.apiMeter.createHistogram(TauMetrics.genAiAgentIterations.name, {
    description: TauMetrics.genAiAgentIterations.description,
    unit: TauMetrics.genAiAgentIterations.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.genAiAgentIterations.buckets] },
  });

  public readonly genAiAgentSafeguardInterventions = this.apiMeter.createCounter(
    TauMetrics.genAiAgentSafeguardInterventions.name,
    {
      description: TauMetrics.genAiAgentSafeguardInterventions.description,
      unit: TauMetrics.genAiAgentSafeguardInterventions.unit,
    },
  );

  public readonly genAiInterruptRecoveryReminders = this.apiMeter.createCounter(
    TauMetrics.genAiInterruptRecoveryReminders.name,
    {
      description: TauMetrics.genAiInterruptRecoveryReminders.description,
      unit: TauMetrics.genAiInterruptRecoveryReminders.unit,
    },
  );

  public readonly chatToolResultOffloaded = this.apiMeter.createCounter(TauMetrics.chatToolResultOffloaded.name, {
    description: TauMetrics.chatToolResultOffloaded.description,
    unit: TauMetrics.chatToolResultOffloaded.unit,
  });

  public readonly genAiPromptSectionSize = this.apiMeter.createHistogram(TauMetrics.genAiPromptSectionSize.name, {
    description: TauMetrics.genAiPromptSectionSize.description,
    unit: TauMetrics.genAiPromptSectionSize.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.genAiPromptSectionSize.buckets] },
  });

  // Infrastructure
  public readonly redisConnectionState = this.apiMeter.createGauge(TauMetrics.redisConnectionState.name, {
    description: TauMetrics.redisConnectionState.description,
  });

  public readonly sseActiveConnections = this.apiMeter.createUpDownCounter(TauMetrics.sseActiveConnections.name, {
    description: TauMetrics.sseActiveConnections.description,
    unit: TauMetrics.sseActiveConnections.unit,
  });

  public readonly sseEvents = this.apiMeter.createCounter(TauMetrics.sseEvents.name, {
    description: TauMetrics.sseEvents.description,
    unit: TauMetrics.sseEvents.unit,
  });

  public readonly publicationViewsTotal = this.apiMeter.createCounter(TauMetrics.publicationViewsTotal.name, {
    description: TauMetrics.publicationViewsTotal.description,
    unit: TauMetrics.publicationViewsTotal.unit,
  });

  public readonly publicationViewsRejectedTotal = this.apiMeter.createCounter(
    TauMetrics.publicationViewsRejectedTotal.name,
    {
      description: TauMetrics.publicationViewsRejectedTotal.description,
      unit: TauMetrics.publicationViewsRejectedTotal.unit,
    },
  );

  // Client-reported metrics (ingested via TelemetryController)
  public readonly kernelExecutionDuration = this.clientMeter.createHistogram(TauMetrics.kernelExecutionDuration.name, {
    description: TauMetrics.kernelExecutionDuration.description,
    unit: TauMetrics.kernelExecutionDuration.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.kernelExecutionDuration.buckets] },
  });

  public readonly kernelExecutions = this.clientMeter.createCounter(TauMetrics.kernelExecutions.name, {
    description: TauMetrics.kernelExecutions.description,
    unit: TauMetrics.kernelExecutions.unit,
  });

  public readonly kernelExportDuration = this.clientMeter.createHistogram(TauMetrics.kernelExportDuration.name, {
    description: TauMetrics.kernelExportDuration.description,
    unit: TauMetrics.kernelExportDuration.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.kernelExportDuration.buckets] },
  });

  // Client-reported: extended telemetry
  public readonly wsReconnectionDuration = this.clientMeter.createHistogram(TauMetrics.wsReconnectionDuration.name, {
    description: TauMetrics.wsReconnectionDuration.description,
    unit: TauMetrics.wsReconnectionDuration.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.wsReconnectionDuration.buckets] },
  });

  public readonly editorLoadDuration = this.clientMeter.createHistogram(TauMetrics.editorLoadDuration.name, {
    description: TauMetrics.editorLoadDuration.description,
    unit: TauMetrics.editorLoadDuration.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.editorLoadDuration.buckets] },
  });

  public readonly wasmModuleLoadDuration = this.clientMeter.createHistogram(TauMetrics.wasmModuleLoadDuration.name, {
    description: TauMetrics.wasmModuleLoadDuration.description,
    unit: TauMetrics.wasmModuleLoadDuration.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.wasmModuleLoadDuration.buckets] },
  });

  public readonly indexeddbOperationDuration = this.clientMeter.createHistogram(
    TauMetrics.indexeddbOperationDuration.name,
    {
      description: TauMetrics.indexeddbOperationDuration.description,
      unit: TauMetrics.indexeddbOperationDuration.unit,
      advice: { explicitBucketBoundaries: [...TauMetrics.indexeddbOperationDuration.buckets] },
    },
  );
}
