/* eslint-disable @typescript-eslint/naming-convention -- Metric names use OTEL dot notation. */
import { describe, it, expect } from 'vitest';
import { toPrometheusName } from '#prometheus.js';
import { TauMetrics } from '#registry.js';

describe('TauMetrics', () => {
  const metrics = Object.values(TauMetrics);

  it('should define all canonical metrics', () => {
    expect(metrics).toHaveLength(87);
  });

  /* Hosted Remote Storage DA2/OB2: the W14 catalogue's names, exported as the Prometheus series it lists. */
  it('should declare the git edge, admission, lease, hydrate and commit instruments by their catalogue names', () => {
    const exported = Object.fromEntries(
      [
        TauMetrics.syncRefusals,
        TauMetrics.gitAdmissions,
        TauMetrics.gitLeasesActive,
        TauMetrics.gitLeaseReservedBytes,
        TauMetrics.gitDiskFreeBytes,
        TauMetrics.gitHydrateBytes,
        TauMetrics.gitCommitAttempts,
        TauMetrics.gitCommitDuration,
        TauMetrics.gitRepositorySize,
        TauMetrics.gitHotProjectCommitRate,
        TauMetrics.gitHotProjectWriters,
      ].map((metric) => [toPrometheusName(metric.name, metric.type), { type: metric.type, unit: metric.unit }]),
    );
    expect(exported).toEqual({
      tau_sync_refusals_total: { type: 'counter', unit: '{refusal}' },
      tau_git_admissions_total: { type: 'counter', unit: '{admission}' },
      tau_git_leases_active: { type: 'upDownCounter', unit: '{lease}' },
      tau_git_lease_reserved_bytes: { type: 'gauge', unit: 'By' },
      tau_git_disk_free_bytes: { type: 'gauge', unit: 'By' },
      tau_git_hydrate_bytes: { type: 'histogram', unit: 'By' },
      tau_git_commit_attempts_total: { type: 'counter', unit: '{attempt}' },
      tau_git_commit_duration: { type: 'histogram', unit: 's' },
      tau_git_repository_size: { type: 'histogram', unit: 'By' },
      tau_git_hot_project_commit_rate: { type: 'gauge', unit: '{commit}/s' },
      tau_git_hot_project_writers: { type: 'gauge', unit: '{writer}' },
    });
  });

  it('should split retryable refusals out of error as busy on the sync edge', () => {
    for (const metric of [TauMetrics.syncOperations, TauMetrics.syncOperationDuration]) {
      expect(
        metric.attributes.safeParse({
          'tau.sync.operation': 'push',
          outcome: 'busy',
        }).success,
      ).toBe(true);
    }
  });

  it('should bound a refusal to a declared code, never a free-form one', () => {
    const refusal = (code: string): boolean =>
      TauMetrics.syncRefusals.attributes.safeParse({
        'tau.sync.operation': 'push',
        'tau.sync.refusal.code': code,
        'http.response.status_code': 503,
      }).success;
    expect(refusal('GIT_LEASE_OWNER_BUSY')).toBe(true);
    expect(refusal('GIT_PUSH_RACE_LOST')).toBe(true);
    expect(refusal('other')).toBe(true);
    expect(refusal('GIT_SOMETHING_NEW')).toBe(false);
  });

  it('should label the hot-project gauges by rank alone, never by project or owner', () => {
    for (const metric of [TauMetrics.gitHotProjectCommitRate, TauMetrics.gitHotProjectWriters]) {
      expect(Object.keys(metric.attributes.shape)).toEqual(['rank']);
      expect(metric.attributes.safeParse({ rank: '1' }).success).toBe(true);
      expect(metric.attributes.safeParse({ rank: '10' }).success).toBe(true);
      expect(metric.attributes.safeParse({ rank: '11' }).success).toBe(false);
      expect(metric.attributes.safeParse({ rank: 'proj_123' }).success).toBe(false);
    }
  });

  it('should bound admission, hydrate and commit labels to enums', () => {
    expect(
      TauMetrics.gitAdmissions.attributes.safeParse({
        'tau.git.operation': 'receive_pack',
        outcome: 'owner_busy',
      }).success,
    ).toBe(true);
    expect(
      TauMetrics.gitAdmissions.attributes.safeParse({
        'tau.git.operation': 'receive_pack',
        outcome: 'proj_1',
      }).success,
    ).toBe(false);
    expect(
      TauMetrics.gitHydrateBytes.attributes.safeParse({
        'tau.git.hydrate.source': 'object_store',
      }).success,
    ).toBe(true);
    expect(
      TauMetrics.gitCommitAttempts.attributes.safeParse({
        outcome: 'lost_race',
        'tau.git.commit.kind': 'push',
      }).success,
    ).toBe(true);
    expect(
      TauMetrics.gitCommitDuration.attributes.safeParse({
        'tau.git.commit.phase': 'total',
        'tau.git.commit.kind': 'push',
      }).success,
    ).toBe(true);
    expect(Object.keys(TauMetrics.gitRepositorySize.attributes.shape)).toEqual([]);
    expect(TauMetrics.gitRepositorySize.buckets.at(0)).toBe(64 * 1024);
    expect(TauMetrics.gitRepositorySize.buckets.at(-1)).toBe(1024 ** 3);
  });

  it('should bound funded-operation telemetry to content-free dimensions', () => {
    expect(
      TauMetrics.billingFundedOperationRecoveries.attributes.safeParse({
        'deployment.environment': 'preview-123',
        'tau.billing.capacity_pool': 'primary',
        'tau.billing.recovery.outcome': 'resolved',
      }).success,
    ).toBe(false);
    expect(
      TauMetrics.billingFundedOperationDenials.attributes.safeParse({
        'deployment.environment': 'prod-us',
        'tau.billing.capacity_pool': 'helper',
        'tau.billing.denial.reason': 'operator_route_paused',
      }).success,
    ).toBe(true);
    expect(
      TauMetrics.billingFundedOperationDenials.attributes.safeParse({
        'deployment.environment': 'prod-us',
        'tau.billing.capacity_pool': 'helper',
        'tau.billing.denial.reason': 'supplier_route_paused',
      }).success,
    ).toBe(false);
    expect(
      TauMetrics.billingFundedOperationTerminals.attributes.safeParse({
        'deployment.environment': 'development',
        'tau.billing.capacity_pool': 'primary',
        'tau.billing.terminal.kind': 'final_usage',
        'tau.billing.terminal.incomplete_reason': 'max_output_tokens',
      }).success,
    ).toBe(true);
    expect(
      TauMetrics.billingFundedOperationTerminals.attributes.safeParse({
        'deployment.environment': 'development',
        'tau.billing.capacity_pool': 'primary',
        'tau.billing.terminal.kind': 'final_usage',
        'tau.billing.terminal.incomplete_reason': 'provider supplied text',
      }).success,
    ).toBe(false);
    expect(
      TauMetrics.billingFundedOperationCurrent.attributes.safeParse({
        'deployment.environment': 'prod-us',
        'tau.billing.capacity_pool': 'primary',
        'tau.billing.pending.state': 'due',
      }).success,
    ).toBe(true);
    expect(
      TauMetrics.billingFundedOperationRecoveryBatchDuration.attributes.safeParse({
        'deployment.environment': 'prod-us',
        'tau.billing.capacity_pool': 'primary',
        'tau.billing.recovery.batch.outcome': 'provider supplied text',
      }).success,
    ).toBe(false);
  });

  it('should meter supplier cost per call with the same model and provider labels as the customer charge', () => {
    expect(TauMetrics.billingSupplierCostPicoUsd).toMatchObject({
      name: 'tau.billing.supplier_cost_picousd',
      unit: '{picousd}',
      type: 'counter',
    });
    expect(Object.keys(TauMetrics.billingSupplierCostPicoUsd.attributes.shape).sort()).toEqual([
      'deployment.environment',
      'gen_ai.provider.name',
      'gen_ai.request.model',
    ]);
    const chargeLabels = Object.keys(TauMetrics.genAiCost.attributes.shape);
    expect(chargeLabels).toEqual(expect.arrayContaining(['gen_ai.request.model', 'gen_ai.provider.name']));
    expect(
      TauMetrics.billingSupplierCostPicoUsd.attributes.safeParse({
        'gen_ai.request.model': 'model-a',
        'gen_ai.provider.name': 'provider-a',
        'deployment.environment': 'preview-123',
      }).success,
    ).toBe(false);
  });

  it('should count unpriced operations by environment, provider, sku and a bounded reason', () => {
    expect(TauMetrics.billingSupplierUnpricedOperations).toMatchObject({
      name: 'tau.billing.supplier_unpriced_operations',
      unit: '{operation}',
      type: 'gauge',
    });
    expect(Object.keys(TauMetrics.billingSupplierUnpricedOperations.attributes.shape).sort()).toEqual([
      'deployment.environment',
      'gen_ai.provider.name',
      'tau.billing.sku',
      'tau.billing.unpriced.reason',
    ]);
    for (const reason of ['missing_rate', 'dimension_mismatch', 'absorbed']) {
      expect(
        TauMetrics.billingSupplierUnpricedOperations.attributes.safeParse({
          'deployment.environment': 'staging',
          'gen_ai.provider.name': 'provider-a',
          'tau.billing.sku': 'model:route-a',
          'tau.billing.unpriced.reason': reason,
        }).success,
      ).toBe(true);
    }
    expect(
      TauMetrics.billingSupplierUnpricedOperations.attributes.safeParse({
        'deployment.environment': 'staging',
        'gen_ai.provider.name': 'provider-a',
        'tau.billing.sku': 'model:route-a',
        'tau.billing.unpriced.reason': 'provider supplied text',
      }).success,
    ).toBe(false);
  });

  it('should expose the WebSocket upgrade-rejection counter with a bounded label set', () => {
    expect(TauMetrics.wsUpgradeRejections.name).toBe('ws.upgrade.rejections');
    expect(TauMetrics.wsUpgradeRejections.type).toBe('counter');
    expect(TauMetrics.wsUpgradeRejections.unit).toBe('{connection}');
    expect(
      TauMetrics.wsUpgradeRejections.attributes.safeParse({ 'ws.gateway': 'hosts', reason: 'user-123' }).success,
    ).toBe(false);
    expect(
      TauMetrics.wsDisconnections.attributes.safeParse({ 'ws.gateway': 'hosts', 'ws.close.reason': 'transport close' })
        .success,
    ).toBe(false);
  });

  it('should expose the tool-result offload counter with the canonical OTEL name', () => {
    expect(TauMetrics.chatToolResultOffloaded.name).toBe('chat.tool_result.offloads');
    expect(TauMetrics.chatToolResultOffloaded.type).toBe('counter');
  });

  it('should expose the tool-result media preservation counter with the canonical OTEL name', () => {
    expect(TauMetrics.chatToolResultMediaPreserved.name).toBe('chat.tool_result.media_preservations');
    expect(TauMetrics.chatToolResultMediaPreserved.type).toBe('counter');
    expect(TauMetrics.chatToolResultMediaPreserved.unit).toBe('{preservation}');
  });

  it('should expose the agent-safeguard counter with the canonical OTEL name', () => {
    expect(TauMetrics.genAiAgentSafeguardInterventions.name).toBe('gen_ai.agent.safeguard.interventions');
    expect(TauMetrics.genAiAgentSafeguardInterventions.type).toBe('counter');
  });

  it('should expose the tool-input repair counter with the canonical OTEL name', () => {
    expect(TauMetrics.genAiToolInputRepairs.name).toBe('gen_ai.tool_input.repairs');
    expect(TauMetrics.genAiToolInputRepairs.type).toBe('counter');
    expect(TauMetrics.genAiToolInputRepairs.unit).toBe('{repair}');
  });

  it('should expose the tool-duration histogram with bounded file-edit dimensions', () => {
    expect(TauMetrics.genAiToolDuration.name).toBe('gen_ai.tool.duration');
    expect(TauMetrics.genAiToolDuration.type).toBe('histogram');
    expect(
      TauMetrics.genAiToolDuration.attributes.safeParse({
        'gen_ai.file_edit.interface': 'patch',
        'gen_ai.file_edit.operation_count': 2,
        'gen_ai.file_edit.hunk_count': 1,
      }).success,
    ).toBe(true);
  });

  it('should expose the interrupt-recovery counter with the canonical OTEL name', () => {
    expect(TauMetrics.genAiInterruptRecoveryReminders.name).toBe('gen_ai.agent.interrupt_recovery.reminders');
    expect(TauMetrics.genAiInterruptRecoveryReminders.type).toBe('counter');
  });

  it('should expose the prompt-section-size histogram with the canonical OTEL name', () => {
    expect(TauMetrics.genAiPromptSectionSize.name).toBe('gen_ai.prompt.section.size');
    expect(TauMetrics.genAiPromptSectionSize.type).toBe('histogram');
    expect(TauMetrics.genAiPromptSectionSize.unit).toBe('By');
    expect(TauMetrics.genAiPromptSectionSize.buckets.length).toBeGreaterThan(0);
  });

  it('should expose context-budget metrics with canonical OTEL names', () => {
    expect(TauMetrics.genAiContextBudgetTokens.name).toBe('gen_ai.context_budget.tokens');
    expect(TauMetrics.genAiContextBudgetTokens.type).toBe('histogram');
    expect(TauMetrics.genAiContextCompactionDecisions.name).toBe('gen_ai.context_compaction.decisions');
    expect(TauMetrics.genAiContextCompactionDecisions.type).toBe('counter');
  });

  it('should bound agent context labels to the ingest vocabularies', () => {
    expect(
      TauMetrics.agentEvaluations.attributes.safeParse({
        'agent.id': 'tau',
        'kernel.id': 'replicad',
        'evaluation.class': 'api_misuse',
      }).success,
    ).toBe(true);
    expect(
      TauMetrics.agentReferenceLookups.attributes.safeParse({
        'agent.id': 'codex',
        'kernel.id': 'my-kernel',
        'lookup.outcome': 'ok',
      }).success,
    ).toBe(false);
    expect(
      TauMetrics.agentToolCalls.attributes.safeParse({
        'agent.id': 'codex',
        'tool.kind': 'execute',
        'tool.name': 'Bash',
        status: 'completed',
      }).success,
    ).toBe(false);
    expect(TauMetrics.agentTurns.attributes.shape).toHaveProperty(['kernel.id']);
    expect(TauMetrics.agentErrors.attributes.shape).not.toHaveProperty(['kernel.id']);
  });

  it('should use lowercase dot-delimited names for all metrics', () => {
    for (const metric of metrics) {
      expect(metric.name).toMatch(/^[a-z][\d._a-z]*$/);
    }
  });

  it('should have non-empty descriptions for all metrics', () => {
    for (const metric of metrics) {
      expect(metric.description.length).toBeGreaterThan(0);
    }
  });

  it('should not use .total suffix on counter names (OTEL semconv violation)', () => {
    const counters = metrics.filter((m) => m.type === 'counter');
    for (const counter of counters) {
      expect(counter.name).not.toMatch(/\.total$/);
    }
  });

  it('should use pluralized names or mass nouns for counters', () => {
    const counters = metrics.filter((m) => m.type === 'counter');
    const validSuffixes = /s$|cost$|microusd$|picousd$|flagged$/;
    for (const counter of counters) {
      const lastSegment = counter.name.split('.').at(-1) ?? '';
      expect(lastSegment).toMatch(validSuffixes);
    }
  });

  it('should provide buckets only for histogram metrics', () => {
    for (const metric of metrics) {
      if (metric.type === 'histogram') {
        expect(metric.buckets).toBeDefined();
        expect(metric.buckets.length).toBeGreaterThan(0);
      } else {
        expect(metric.buckets).toBeUndefined();
      }
    }
  });
});
