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
import type { z } from 'zod';

@Injectable()
export class MetricsService {
  private readonly apiMeter = metrics.getMeter('tau-api');
  private readonly clientMeter = metrics.getMeter('tau-client');

  // WebSocket
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

  public readonly wsUpgradeRejections = this.apiMeter.createCounter(TauMetrics.wsUpgradeRejections.name, {
    description: TauMetrics.wsUpgradeRejections.description,
    unit: TauMetrics.wsUpgradeRejections.unit,
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

  public readonly genAiToolDuration = this.apiMeter.createHistogram(TauMetrics.genAiToolDuration.name, {
    description: TauMetrics.genAiToolDuration.description,
    unit: TauMetrics.genAiToolDuration.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.genAiToolDuration.buckets] },
  });

  public readonly genAiToolInputRepairs = this.apiMeter.createCounter(TauMetrics.genAiToolInputRepairs.name, {
    description: TauMetrics.genAiToolInputRepairs.description,
    unit: TauMetrics.genAiToolInputRepairs.unit,
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

  public readonly chatToolResultMediaPreserved = this.apiMeter.createCounter(
    TauMetrics.chatToolResultMediaPreserved.name,
    {
      description: TauMetrics.chatToolResultMediaPreserved.description,
      unit: TauMetrics.chatToolResultMediaPreserved.unit,
    },
  );

  public readonly genAiPromptSectionSize = this.apiMeter.createHistogram(TauMetrics.genAiPromptSectionSize.name, {
    description: TauMetrics.genAiPromptSectionSize.description,
    unit: TauMetrics.genAiPromptSectionSize.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.genAiPromptSectionSize.buckets] },
  });

  public readonly genAiContextBudgetTokens = this.apiMeter.createHistogram(TauMetrics.genAiContextBudgetTokens.name, {
    description: TauMetrics.genAiContextBudgetTokens.description,
    unit: TauMetrics.genAiContextBudgetTokens.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.genAiContextBudgetTokens.buckets] },
  });

  public readonly genAiContextCompactionDecisions = this.apiMeter.createCounter(
    TauMetrics.genAiContextCompactionDecisions.name,
    {
      description: TauMetrics.genAiContextCompactionDecisions.description,
      unit: TauMetrics.genAiContextCompactionDecisions.unit,
    },
  );

  // Infrastructure
  public readonly redisConnectionState = this.apiMeter.createGauge(TauMetrics.redisConnectionState.name, {
    description: TauMetrics.redisConnectionState.description,
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

  public readonly publicationInviteEmailsTotal = this.apiMeter.createCounter(
    TauMetrics.publicationInviteEmailsTotal.name,
    {
      description: TauMetrics.publicationInviteEmailsTotal.description,
      unit: TauMetrics.publicationInviteEmailsTotal.unit,
    },
  );

  public readonly publicationInviteEmailsSuppressedTotal = this.apiMeter.createCounter(
    TauMetrics.publicationInviteEmailsSuppressedTotal.name,
    {
      description: TauMetrics.publicationInviteEmailsSuppressedTotal.description,
      unit: TauMetrics.publicationInviteEmailsSuppressedTotal.unit,
    },
  );

  public readonly publicationFileRequestsTotal = this.apiMeter.createCounter(
    TauMetrics.publicationFileRequestsTotal.name,
    {
      description: TauMetrics.publicationFileRequestsTotal.description,
      unit: TauMetrics.publicationFileRequestsTotal.unit,
    },
  );

  // Object storage
  public readonly storageOperationDuration = this.apiMeter.createHistogram(TauMetrics.storageOperationDuration.name, {
    description: TauMetrics.storageOperationDuration.description,
    unit: TauMetrics.storageOperationDuration.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.storageOperationDuration.buckets] },
  });

  public readonly storageTransferBytes = this.apiMeter.createCounter(TauMetrics.storageTransferBytes.name, {
    description: TauMetrics.storageTransferBytes.description,
    unit: TauMetrics.storageTransferBytes.unit,
  });

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

  // --- Billing / credit ledger (C11/C12) ---

  public readonly billingAttemptResolutions = this.apiMeter.createCounter(TauMetrics.billingAttemptResolutions.name, {
    description: TauMetrics.billingAttemptResolutions.description,
    unit: TauMetrics.billingAttemptResolutions.unit,
  });

  public readonly billingVoidedAdmissions = this.apiMeter.createCounter(TauMetrics.billingVoidedAdmissions.name, {
    description: TauMetrics.billingVoidedAdmissions.description,
    unit: TauMetrics.billingVoidedAdmissions.unit,
  });

  public readonly billingLedgerDrift = this.apiMeter.createGauge(TauMetrics.billingLedgerDrift.name, {
    description: TauMetrics.billingLedgerDrift.description,
    unit: TauMetrics.billingLedgerDrift.unit,
  });

  public readonly billingDriftedAccounts = this.apiMeter.createGauge(TauMetrics.billingDriftedAccounts.name, {
    description: TauMetrics.billingDriftedAccounts.description,
    unit: TauMetrics.billingDriftedAccounts.unit,
  });

  public readonly billingOpenFinancialCases = this.apiMeter.createGauge(TauMetrics.billingOpenFinancialCases.name, {
    description: TauMetrics.billingOpenFinancialCases.description,
    unit: TauMetrics.billingOpenFinancialCases.unit,
  });

  public readonly billingFundedOperationRecoveries = this.apiMeter.createCounter(
    TauMetrics.billingFundedOperationRecoveries.name,
    {
      description: TauMetrics.billingFundedOperationRecoveries.description,
      unit: TauMetrics.billingFundedOperationRecoveries.unit,
    },
  );

  public readonly billingSupplierCostPicoUsd = this.apiMeter.createCounter(TauMetrics.billingSupplierCostPicoUsd.name, {
    description: TauMetrics.billingSupplierCostPicoUsd.description,
    unit: TauMetrics.billingSupplierCostPicoUsd.unit,
  });

  public readonly billingSupplierUnpricedOperations = this.apiMeter.createGauge(
    TauMetrics.billingSupplierUnpricedOperations.name,
    {
      description: TauMetrics.billingSupplierUnpricedOperations.description,
      unit: TauMetrics.billingSupplierUnpricedOperations.unit,
    },
  );

  public readonly billingProviderAccountRefusals = this.apiMeter.createCounter(
    TauMetrics.billingProviderAccountRefusals.name,
    {
      description: TauMetrics.billingProviderAccountRefusals.description,
      unit: TauMetrics.billingProviderAccountRefusals.unit,
    },
  );

  public readonly billingFundedOperationDenials = this.apiMeter.createCounter(
    TauMetrics.billingFundedOperationDenials.name,
    {
      description: TauMetrics.billingFundedOperationDenials.description,
      unit: TauMetrics.billingFundedOperationDenials.unit,
    },
  );

  public readonly billingFundedOperationTerminals = this.apiMeter.createCounter(
    TauMetrics.billingFundedOperationTerminals.name,
    {
      description: TauMetrics.billingFundedOperationTerminals.description,
      unit: TauMetrics.billingFundedOperationTerminals.unit,
    },
  );

  public readonly billingFundedOperationCurrent = this.apiMeter.createGauge(
    TauMetrics.billingFundedOperationCurrent.name,
    {
      description: TauMetrics.billingFundedOperationCurrent.description,
      unit: TauMetrics.billingFundedOperationCurrent.unit,
    },
  );

  public readonly billingFundedOperationOldestDueAge = this.apiMeter.createGauge(
    TauMetrics.billingFundedOperationOldestDueAge.name,
    {
      description: TauMetrics.billingFundedOperationOldestDueAge.description,
      unit: TauMetrics.billingFundedOperationOldestDueAge.unit,
    },
  );

  public readonly billingFundedOperationRecoveryBatchDuration = this.apiMeter.createHistogram(
    TauMetrics.billingFundedOperationRecoveryBatchDuration.name,
    {
      description: TauMetrics.billingFundedOperationRecoveryBatchDuration.description,
      unit: TauMetrics.billingFundedOperationRecoveryBatchDuration.unit,
      advice: { explicitBucketBoundaries: [...TauMetrics.billingFundedOperationRecoveryBatchDuration.buckets] },
    },
  );

  public readonly billingFundedOperationRecoveryProviderExecutions = this.apiMeter.createGauge(
    TauMetrics.billingFundedOperationRecoveryProviderExecutions.name,
    {
      description: TauMetrics.billingFundedOperationRecoveryProviderExecutions.description,
      unit: TauMetrics.billingFundedOperationRecoveryProviderExecutions.unit,
    },
  );

  // --- Client-reported: agent usage (W36-C) ---

  public readonly agentSessions = this.clientMeter.createCounter(TauMetrics.agentSessions.name, {
    description: TauMetrics.agentSessions.description,
    unit: TauMetrics.agentSessions.unit,
  });

  public readonly agentTurns = this.clientMeter.createCounter(TauMetrics.agentTurns.name, {
    description: TauMetrics.agentTurns.description,
    unit: TauMetrics.agentTurns.unit,
  });

  public readonly agentTurnDuration = this.clientMeter.createHistogram(TauMetrics.agentTurnDuration.name, {
    description: TauMetrics.agentTurnDuration.description,
    unit: TauMetrics.agentTurnDuration.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.agentTurnDuration.buckets] },
  });

  public readonly agentTimeToFirstUpdate = this.clientMeter.createHistogram(TauMetrics.agentTimeToFirstUpdate.name, {
    description: TauMetrics.agentTimeToFirstUpdate.description,
    unit: TauMetrics.agentTimeToFirstUpdate.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.agentTimeToFirstUpdate.buckets] },
  });

  public readonly agentToolCalls = this.clientMeter.createCounter(TauMetrics.agentToolCalls.name, {
    description: TauMetrics.agentToolCalls.description,
    unit: TauMetrics.agentToolCalls.unit,
  });

  public readonly agentTokens = this.clientMeter.createCounter(TauMetrics.agentTokens.name, {
    description: TauMetrics.agentTokens.description,
    unit: TauMetrics.agentTokens.unit,
  });

  public readonly agentErrors = this.clientMeter.createCounter(TauMetrics.agentErrors.name, {
    description: TauMetrics.agentErrors.description,
    unit: TauMetrics.agentErrors.unit,
  });

  // --- Tau Sync ---

  public readonly syncOperations = this.apiMeter.createCounter(TauMetrics.syncOperations.name, {
    description: TauMetrics.syncOperations.description,
    unit: TauMetrics.syncOperations.unit,
  });

  public readonly syncOperationDuration = this.apiMeter.createHistogram(TauMetrics.syncOperationDuration.name, {
    description: TauMetrics.syncOperationDuration.description,
    unit: TauMetrics.syncOperationDuration.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.syncOperationDuration.buckets] },
  });

  public readonly syncPackBytes = this.apiMeter.createHistogram(TauMetrics.syncPackBytes.name, {
    description: TauMetrics.syncPackBytes.description,
    unit: TauMetrics.syncPackBytes.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.syncPackBytes.buckets] },
  });

  public readonly syncLeaseDuration = this.apiMeter.createHistogram(TauMetrics.syncLeaseDuration.name, {
    description: TauMetrics.syncLeaseDuration.description,
    unit: TauMetrics.syncLeaseDuration.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.syncLeaseDuration.buckets] },
  });

  public readonly syncManifestConflicts = this.apiMeter.createCounter(TauMetrics.syncManifestConflicts.name, {
    description: TauMetrics.syncManifestConflicts.description,
    unit: TauMetrics.syncManifestConflicts.unit,
  });

  public readonly syncSweeps = this.apiMeter.createCounter(TauMetrics.syncSweeps.name, {
    description: TauMetrics.syncSweeps.description,
    unit: TauMetrics.syncSweeps.unit,
  });

  // Client-reported: Tau Sync

  public readonly syncClientAttempts = this.clientMeter.createCounter(TauMetrics.syncClientAttempts.name, {
    description: TauMetrics.syncClientAttempts.description,
    unit: TauMetrics.syncClientAttempts.unit,
  });

  public readonly syncClientLag = this.clientMeter.createHistogram(TauMetrics.syncClientLag.name, {
    description: TauMetrics.syncClientLag.description,
    unit: TauMetrics.syncClientLag.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.syncClientLag.buckets] },
  });

  public readonly syncClientPending = this.clientMeter.createHistogram(TauMetrics.syncClientPending.name, {
    description: TauMetrics.syncClientPending.description,
    unit: TauMetrics.syncClientPending.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.syncClientPending.buckets] },
  });

  // --- Billing workers ---

  public readonly billingWorkerPasses = this.apiMeter.createCounter(TauMetrics.billingWorkerPasses.name, {
    description: TauMetrics.billingWorkerPasses.description,
    unit: TauMetrics.billingWorkerPasses.unit,
  });
}

/** `ws.gateway` on the `ws.*` connection series: one value per upgrade route. */
export type WsGateway = NonNullable<z.infer<typeof TauMetrics.wsActiveConnections.attributes>['ws.gateway']>;

/** Bounded `ws.close.reason`, bound to the registry's enum so a new reason must be declared there. */
export type WsCloseReason = NonNullable<z.infer<typeof TauMetrics.wsDisconnections.attributes>['ws.close.reason']>;

/** Attributes of one `ws.upgrade.rejections` increment. */
export type WsUpgradeRejection = z.infer<typeof TauMetrics.wsUpgradeRejections.attributes>;

/** Attributes of one `tau.sync.operations` increment. */
export type SyncOperationAttributes = z.infer<typeof TauMetrics.syncOperations.attributes>;
