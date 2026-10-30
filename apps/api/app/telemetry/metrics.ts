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

  public readonly healthReadinessFailures = this.apiMeter.createCounter(TauMetrics.healthReadinessFailures.name, {
    description: TauMetrics.healthReadinessFailures.description,
    unit: TauMetrics.healthReadinessFailures.unit,
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

  // --- Client-reported: agent context ---

  public readonly agentCallsBeforeFirstWrite = this.clientMeter.createHistogram(
    TauMetrics.agentCallsBeforeFirstWrite.name,
    {
      description: TauMetrics.agentCallsBeforeFirstWrite.description,
      unit: TauMetrics.agentCallsBeforeFirstWrite.unit,
      advice: { explicitBucketBoundaries: [...TauMetrics.agentCallsBeforeFirstWrite.buckets] },
    },
  );

  public readonly agentTimeToFirstWrite = this.clientMeter.createHistogram(TauMetrics.agentTimeToFirstWrite.name, {
    description: TauMetrics.agentTimeToFirstWrite.description,
    unit: TauMetrics.agentTimeToFirstWrite.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.agentTimeToFirstWrite.buckets] },
  });

  public readonly agentReferenceLookups = this.clientMeter.createCounter(TauMetrics.agentReferenceLookups.name, {
    description: TauMetrics.agentReferenceLookups.description,
    unit: TauMetrics.agentReferenceLookups.unit,
  });

  public readonly agentReferenceBytes = this.clientMeter.createHistogram(TauMetrics.agentReferenceBytes.name, {
    description: TauMetrics.agentReferenceBytes.description,
    unit: TauMetrics.agentReferenceBytes.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.agentReferenceBytes.buckets] },
  });

  public readonly agentSkillActivations = this.clientMeter.createCounter(TauMetrics.agentSkillActivations.name, {
    description: TauMetrics.agentSkillActivations.description,
    unit: TauMetrics.agentSkillActivations.unit,
  });

  public readonly agentEvaluations = this.clientMeter.createCounter(TauMetrics.agentEvaluations.name, {
    description: TauMetrics.agentEvaluations.description,
    unit: TauMetrics.agentEvaluations.unit,
  });

  public readonly agentCorrectionsAfterError = this.clientMeter.createHistogram(
    TauMetrics.agentCorrectionsAfterError.name,
    {
      description: TauMetrics.agentCorrectionsAfterError.description,
      unit: TauMetrics.agentCorrectionsAfterError.unit,
      advice: { explicitBucketBoundaries: [...TauMetrics.agentCorrectionsAfterError.buckets] },
    },
  );

  public readonly agentGeospecAssertions = this.clientMeter.createCounter(TauMetrics.agentGeospecAssertions.name, {
    description: TauMetrics.agentGeospecAssertions.description,
    unit: TauMetrics.agentGeospecAssertions.unit,
  });

  public readonly agentGeospecRuns = this.clientMeter.createCounter(TauMetrics.agentGeospecRuns.name, {
    description: TauMetrics.agentGeospecRuns.description,
    unit: TauMetrics.agentGeospecRuns.unit,
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

  public readonly syncRefusals = this.apiMeter.createCounter(TauMetrics.syncRefusals.name, {
    description: TauMetrics.syncRefusals.description,
    unit: TauMetrics.syncRefusals.unit,
  });

  // --- Git execution (lease admission, hydrate, manifest commit) ---

  public readonly gitAdmissions = this.apiMeter.createCounter(TauMetrics.gitAdmissions.name, {
    description: TauMetrics.gitAdmissions.description,
    unit: TauMetrics.gitAdmissions.unit,
  });

  public readonly gitLeasesActive = this.apiMeter.createUpDownCounter(TauMetrics.gitLeasesActive.name, {
    description: TauMetrics.gitLeasesActive.description,
    unit: TauMetrics.gitLeasesActive.unit,
  });

  public readonly gitLeaseReservedBytes = this.apiMeter.createGauge(TauMetrics.gitLeaseReservedBytes.name, {
    description: TauMetrics.gitLeaseReservedBytes.description,
    unit: TauMetrics.gitLeaseReservedBytes.unit,
  });

  public readonly gitDiskFreeBytes = this.apiMeter.createGauge(TauMetrics.gitDiskFreeBytes.name, {
    description: TauMetrics.gitDiskFreeBytes.description,
    unit: TauMetrics.gitDiskFreeBytes.unit,
  });

  public readonly gitHydrateBytes = this.apiMeter.createHistogram(TauMetrics.gitHydrateBytes.name, {
    description: TauMetrics.gitHydrateBytes.description,
    unit: TauMetrics.gitHydrateBytes.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.gitHydrateBytes.buckets] },
  });

  public readonly gitCommitAttempts = this.apiMeter.createCounter(TauMetrics.gitCommitAttempts.name, {
    description: TauMetrics.gitCommitAttempts.description,
    unit: TauMetrics.gitCommitAttempts.unit,
  });

  public readonly gitCommitDuration = this.apiMeter.createHistogram(TauMetrics.gitCommitDuration.name, {
    description: TauMetrics.gitCommitDuration.description,
    unit: TauMetrics.gitCommitDuration.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.gitCommitDuration.buckets] },
  });

  public readonly gitRepositorySize = this.apiMeter.createHistogram(TauMetrics.gitRepositorySize.name, {
    description: TauMetrics.gitRepositorySize.description,
    unit: TauMetrics.gitRepositorySize.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.gitRepositorySize.buckets] },
  });

  /** Observed at collection from the last full minute, so an idle minute reads 0 rather than a stale rate. */
  public readonly gitHotProjectCommitRate = this.apiMeter.createObservableGauge(
    TauMetrics.gitHotProjectCommitRate.name,
    {
      description: TauMetrics.gitHotProjectCommitRate.description,
      unit: TauMetrics.gitHotProjectCommitRate.unit,
    },
  );

  public readonly gitHotProjectWriters = this.apiMeter.createObservableGauge(TauMetrics.gitHotProjectWriters.name, {
    description: TauMetrics.gitHotProjectWriters.description,
    unit: TauMetrics.gitHotProjectWriters.unit,
  });

  // --- Git route table and freeze answer (DW1, DW2) ---

  /** Observed at collection from the route table, so a lapsed freeze reads 0 rather than a stale count. */
  public readonly gitRouteFrozen = this.apiMeter.createObservableGauge(TauMetrics.gitRouteFrozen.name, {
    description: TauMetrics.gitRouteFrozen.description,
    unit: TauMetrics.gitRouteFrozen.unit,
  });

  public readonly gitRouteFrozenOldest = this.apiMeter.createObservableGauge(TauMetrics.gitRouteFrozenOldest.name, {
    description: TauMetrics.gitRouteFrozenOldest.description,
    unit: TauMetrics.gitRouteFrozenOldest.unit,
  });

  public readonly gitRouteHolds = this.apiMeter.createCounter(TauMetrics.gitRouteHolds.name, {
    description: TauMetrics.gitRouteHolds.description,
    unit: TauMetrics.gitRouteHolds.unit,
  });

  public readonly gitRouteHoldDuration = this.apiMeter.createHistogram(TauMetrics.gitRouteHoldDuration.name, {
    description: TauMetrics.gitRouteHoldDuration.description,
    unit: TauMetrics.gitRouteHoldDuration.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.gitRouteHoldDuration.buckets] },
  });

  public readonly gitRouteLookupDuration = this.apiMeter.createHistogram(TauMetrics.gitRouteLookupDuration.name, {
    description: TauMetrics.gitRouteLookupDuration.description,
    unit: TauMetrics.gitRouteLookupDuration.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.gitRouteLookupDuration.buckets] },
  });

  // --- Pack cache and rendezvous affinity (DC2) ---

  public readonly gitCacheLookups = this.apiMeter.createCounter(TauMetrics.gitCacheLookups.name, {
    description: TauMetrics.gitCacheLookups.description,
    unit: TauMetrics.gitCacheLookups.unit,
  });

  public readonly gitCacheBytes = this.apiMeter.createGauge(TauMetrics.gitCacheBytes.name, {
    description: TauMetrics.gitCacheBytes.description,
    unit: TauMetrics.gitCacheBytes.unit,
  });

  public readonly gitCacheBudgetBytes = this.apiMeter.createGauge(TauMetrics.gitCacheBudgetBytes.name, {
    description: TauMetrics.gitCacheBudgetBytes.description,
    unit: TauMetrics.gitCacheBudgetBytes.unit,
  });

  public readonly gitCacheEvictions = this.apiMeter.createCounter(TauMetrics.gitCacheEvictions.name, {
    description: TauMetrics.gitCacheEvictions.description,
    unit: TauMetrics.gitCacheEvictions.unit,
  });

  public readonly gitCacheEvictedBytes = this.apiMeter.createCounter(TauMetrics.gitCacheEvictedBytes.name, {
    description: TauMetrics.gitCacheEvictedBytes.description,
    unit: TauMetrics.gitCacheEvictedBytes.unit,
  });

  public readonly gitCacheFallbacks = this.apiMeter.createCounter(TauMetrics.gitCacheFallbacks.name, {
    description: TauMetrics.gitCacheFallbacks.description,
    unit: TauMetrics.gitCacheFallbacks.unit,
  });

  public readonly gitSpills = this.apiMeter.createCounter(TauMetrics.gitSpills.name, {
    description: TauMetrics.gitSpills.description,
    unit: TauMetrics.gitSpills.unit,
  });

  public readonly gitMembers = this.apiMeter.createGauge(TauMetrics.gitMembers.name, {
    description: TauMetrics.gitMembers.description,
    unit: TauMetrics.gitMembers.unit,
  });

  // --- tau-api to tau-storage (DC1) ---

  public readonly gitGrantsRejected = this.apiMeter.createCounter(TauMetrics.gitGrantsRejected.name, {
    description: TauMetrics.gitGrantsRejected.description,
    unit: TauMetrics.gitGrantsRejected.unit,
  });

  public readonly gitForwardErrors = this.apiMeter.createCounter(TauMetrics.gitForwardErrors.name, {
    description: TauMetrics.gitForwardErrors.description,
    unit: TauMetrics.gitForwardErrors.unit,
  });

  public readonly gitReceipts = this.apiMeter.createCounter(TauMetrics.gitReceipts.name, {
    description: TauMetrics.gitReceipts.description,
    unit: TauMetrics.gitReceipts.unit,
  });

  public readonly gitSlowBodyAborts = this.apiMeter.createCounter(TauMetrics.gitSlowBodyAborts.name, {
    description: TauMetrics.gitSlowBodyAborts.description,
    unit: TauMetrics.gitSlowBodyAborts.unit,
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

  public readonly syncClientAttemptDuration = this.clientMeter.createHistogram(
    TauMetrics.syncClientAttemptDuration.name,
    {
      description: TauMetrics.syncClientAttemptDuration.description,
      unit: TauMetrics.syncClientAttemptDuration.unit,
      advice: { explicitBucketBoundaries: [...TauMetrics.syncClientAttemptDuration.buckets] },
    },
  );

  public readonly syncClientPending = this.clientMeter.createHistogram(TauMetrics.syncClientPending.name, {
    description: TauMetrics.syncClientPending.description,
    unit: TauMetrics.syncClientPending.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.syncClientPending.buckets] },
  });

  public readonly syncClientLfsDuration = this.clientMeter.createHistogram(TauMetrics.syncClientLfsDuration.name, {
    description: TauMetrics.syncClientLfsDuration.description,
    unit: TauMetrics.syncClientLfsDuration.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.syncClientLfsDuration.buckets] },
  });

  public readonly syncClientLfsObjects = this.clientMeter.createCounter(TauMetrics.syncClientLfsObjects.name, {
    description: TauMetrics.syncClientLfsObjects.description,
    unit: TauMetrics.syncClientLfsObjects.unit,
  });

  public readonly syncClientLfsBytes = this.clientMeter.createCounter(TauMetrics.syncClientLfsBytes.name, {
    description: TauMetrics.syncClientLfsBytes.description,
    unit: TauMetrics.syncClientLfsBytes.unit,
  });

  public readonly projectOpenDuration = this.clientMeter.createHistogram(TauMetrics.projectOpenDuration.name, {
    description: TauMetrics.projectOpenDuration.description,
    unit: TauMetrics.projectOpenDuration.unit,
    advice: { explicitBucketBoundaries: [...TauMetrics.projectOpenDuration.buckets] },
  });

  // --- Storage accounting scheduler (W14 OB3) ---

  /* Observed at collection from the scheduler's shared snapshot, so every Machine exports the same figures. */
  public readonly storageUsageBytes = this.apiMeter.createObservableGauge(TauMetrics.storageUsageBytes.name, {
    description: TauMetrics.storageUsageBytes.description,
    unit: TauMetrics.storageUsageBytes.unit,
  });

  public readonly storageUsageRepositories = this.apiMeter.createObservableGauge(
    TauMetrics.storageUsageRepositories.name,
    {
      description: TauMetrics.storageUsageRepositories.description,
      unit: TauMetrics.storageUsageRepositories.unit,
    },
  );

  public readonly gitRepositorySizeDistribution = this.apiMeter.createObservableGauge(
    TauMetrics.gitRepositorySizeDistribution.name,
    {
      description: TauMetrics.gitRepositorySizeDistribution.description,
      unit: TauMetrics.gitRepositorySizeDistribution.unit,
    },
  );

  public readonly gitRepositoryCeilingProximity = this.apiMeter.createObservableGauge(
    TauMetrics.gitRepositoryCeilingProximity.name,
    {
      description: TauMetrics.gitRepositoryCeilingProximity.description,
      unit: TauMetrics.gitRepositoryCeilingProximity.unit,
    },
  );

  public readonly storageQuotaOwners = this.apiMeter.createObservableGauge(TauMetrics.storageQuotaOwners.name, {
    description: TauMetrics.storageQuotaOwners.description,
    unit: TauMetrics.storageQuotaOwners.unit,
  });

  public readonly databaseConnections = this.apiMeter.createObservableGauge(TauMetrics.databaseConnections.name, {
    description: TauMetrics.databaseConnections.description,
    unit: TauMetrics.databaseConnections.unit,
  });

  public readonly databaseConnectionBudget = this.apiMeter.createObservableGauge(
    TauMetrics.databaseConnectionBudget.name,
    {
      description: TauMetrics.databaseConnectionBudget.description,
      unit: TauMetrics.databaseConnectionBudget.unit,
    },
  );

  public readonly r2Requests = this.apiMeter.createObservableGauge(TauMetrics.r2Requests.name, {
    description: TauMetrics.r2Requests.description,
    unit: TauMetrics.r2Requests.unit,
  });

  public readonly r2StoredBytes = this.apiMeter.createObservableGauge(TauMetrics.r2StoredBytes.name, {
    description: TauMetrics.r2StoredBytes.description,
    unit: TauMetrics.r2StoredBytes.unit,
  });

  public readonly r2Objects = this.apiMeter.createObservableGauge(TauMetrics.r2Objects.name, {
    description: TauMetrics.r2Objects.description,
    unit: TauMetrics.r2Objects.unit,
  });

  public readonly r2BandwidthBytes = this.apiMeter.createObservableGauge(TauMetrics.r2BandwidthBytes.name, {
    description: TauMetrics.r2BandwidthBytes.description,
    unit: TauMetrics.r2BandwidthBytes.unit,
  });

  public readonly storageAccountingPasses = this.apiMeter.createCounter(TauMetrics.storageAccountingPasses.name, {
    description: TauMetrics.storageAccountingPasses.description,
    unit: TauMetrics.storageAccountingPasses.unit,
  });

  public readonly storageAccountingLastSuccess = this.apiMeter.createObservableGauge(
    TauMetrics.storageAccountingLastSuccess.name,
    {
      description: TauMetrics.storageAccountingLastSuccess.description,
      unit: TauMetrics.storageAccountingLastSuccess.unit,
    },
  );

  // --- Billing workers ---

  public readonly billingWorkerPasses = this.apiMeter.createCounter(TauMetrics.billingWorkerPasses.name, {
    description: TauMetrics.billingWorkerPasses.description,
    unit: TauMetrics.billingWorkerPasses.unit,
  });

  // --- Agent evidence ---

  public readonly agentEvidenceAdmissions = this.apiMeter.createCounter(TauMetrics.agentEvidenceAdmissions.name, {
    description: TauMetrics.agentEvidenceAdmissions.description,
    unit: TauMetrics.agentEvidenceAdmissions.unit,
  });

  public readonly agentEvidenceDeliveries = this.apiMeter.createCounter(TauMetrics.agentEvidenceDeliveries.name, {
    description: TauMetrics.agentEvidenceDeliveries.description,
    unit: TauMetrics.agentEvidenceDeliveries.unit,
  });

  public readonly agentEvidenceBacklogRows = this.apiMeter.createGauge(TauMetrics.agentEvidenceBacklogRows.name, {
    description: TauMetrics.agentEvidenceBacklogRows.description,
    unit: TauMetrics.agentEvidenceBacklogRows.unit,
  });

  public readonly agentEvidenceBacklogHeldBytes = this.apiMeter.createGauge(
    TauMetrics.agentEvidenceBacklogHeldBytes.name,
    {
      description: TauMetrics.agentEvidenceBacklogHeldBytes.description,
      unit: TauMetrics.agentEvidenceBacklogHeldBytes.unit,
    },
  );

  public readonly agentEvidenceErasureTraces = this.apiMeter.createCounter(TauMetrics.agentEvidenceErasureTraces.name, {
    description: TauMetrics.agentEvidenceErasureTraces.description,
    unit: TauMetrics.agentEvidenceErasureTraces.unit,
  });

  public readonly agentEvidenceLifecycleRecords = this.apiMeter.createCounter(
    TauMetrics.agentEvidenceLifecycleRecords.name,
    {
      description: TauMetrics.agentEvidenceLifecycleRecords.description,
      unit: TauMetrics.agentEvidenceLifecycleRecords.unit,
    },
  );

  public readonly agentEvidencePasses = this.apiMeter.createCounter(TauMetrics.agentEvidencePasses.name, {
    description: TauMetrics.agentEvidencePasses.description,
    unit: TauMetrics.agentEvidencePasses.unit,
  });
}

/** `ws.gateway` on the `ws.*` connection series: one value per upgrade route. */
export type WsGateway = NonNullable<z.infer<typeof TauMetrics.wsActiveConnections.attributes>['ws.gateway']>;

/** Bounded `ws.close.reason`, bound to the registry's enum so a new reason must be declared there. */
export type WsCloseReason = NonNullable<z.infer<typeof TauMetrics.wsDisconnections.attributes>['ws.close.reason']>;

/** Attributes of one `ws.upgrade.rejections` increment. */
export type WsUpgradeRejection = z.infer<typeof TauMetrics.wsUpgradeRejections.attributes>;

/** Attributes of one `tau.agent_evidence.admissions` increment. */
export type AgentEvidenceAdmissionAttributes = z.infer<typeof TauMetrics.agentEvidenceAdmissions.attributes>;

/** `outcome` of one `tau.agent_evidence.deliveries` increment. */
export type AgentEvidenceDeliveryOutcome = z.infer<typeof TauMetrics.agentEvidenceDeliveries.attributes>['outcome'];

/** `outcome` of one `tau.agent_evidence.erasure_traces` increment. */
export type AgentEvidenceErasureOutcome = z.infer<typeof TauMetrics.agentEvidenceErasureTraces.attributes>['outcome'];

/** `tau.agent_evidence.state` of one backlog row-count sample. */
export type AgentEvidenceBacklogState = z.infer<
  typeof TauMetrics.agentEvidenceBacklogRows.attributes
>['tau.agent_evidence.state'];

/** Attributes of one `tau.sync.operations` increment. */
export type SyncOperationAttributes = z.infer<typeof TauMetrics.syncOperations.attributes>;

/** Attributes of one `tau.sync.operation.duration` sample: the operation's, plus where git ran. */
export type SyncOperationDurationAttributes = z.infer<typeof TauMetrics.syncOperationDuration.attributes>;

/** Attributes of one `tau.sync.refusals` increment. */
export type SyncRefusalAttributes = z.infer<typeof TauMetrics.syncRefusals.attributes>;

/** `tau.git.operation`: what a lease was admitted for. */
export type GitOperation = z.infer<typeof TauMetrics.gitAdmissions.attributes>['tau.git.operation'];

/** Attributes of one `tau.git.admissions` increment. */
export type GitAdmissionAttributes = z.infer<typeof TauMetrics.gitAdmissions.attributes>;

/** `reason` on `tau.git.grants.rejected`. */
export type GitGrantRejectionReason = z.infer<typeof TauMetrics.gitGrantsRejected.attributes>['reason'];

/** `reason` on `tau.git.spills`. */
export type GitSpillReason = z.infer<typeof TauMetrics.gitSpills.attributes>['reason'];

/** `reason` on `tau.git.forward.errors`. */
export type GitForwardErrorReason = z.infer<typeof TauMetrics.gitForwardErrors.attributes>['reason'];

/** `outcome` on `tau.git.receipts`. */
export type GitReceiptOutcome = z.infer<typeof TauMetrics.gitReceipts.attributes>['outcome'];

/** Attributes of one `tau.git.commit.attempts` increment. */
export type GitCommitAttemptAttributes = z.infer<typeof TauMetrics.gitCommitAttempts.attributes>;

/** `rank` on the hot-project gauges. */
export type HotProjectRank = z.infer<typeof TauMetrics.gitHotProjectCommitRate.attributes>['rank'];

/** `tau.storage.accounting.task`: one of the storage accounting scheduler's periodic tasks. */
export type StorageAccountingTask = z.infer<
  typeof TauMetrics.storageAccountingPasses.attributes
>['tau.storage.accounting.task'];
