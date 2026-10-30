/* eslint-disable @typescript-eslint/naming-convention -- Metric names use OTEL dot notation. */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { toPrometheusName } from '#prometheus.js';
import { TauMetrics } from '#registry.js';

describe('TauMetrics', () => {
  const metrics = Object.values(TauMetrics);

  it('should define all canonical metrics', () => {
    expect(metrics).toHaveLength(190);
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

  /* W14 OB3: the storage accounting scheduler's series, exported as the catalogue (N43–N55) lists them. */
  it('should declare the storage accounting instruments by their catalogue names', () => {
    const exported = Object.fromEntries(
      [
        TauMetrics.storageUsageBytes,
        TauMetrics.storageUsageRepositories,
        TauMetrics.gitRepositorySizeDistribution,
        TauMetrics.gitRepositoryCeilingProximity,
        TauMetrics.storageQuotaOwners,
        TauMetrics.databaseConnections,
        TauMetrics.databaseConnectionBudget,
        TauMetrics.r2Requests,
        TauMetrics.r2StoredBytes,
        TauMetrics.r2Objects,
        TauMetrics.r2BandwidthBytes,
        TauMetrics.storageAccountingPasses,
        TauMetrics.storageAccountingLastSuccess,
      ].map((metric) => [toPrometheusName(metric.name, metric.type), { type: metric.type, unit: metric.unit }]),
    );
    expect(exported).toEqual({
      tau_storage_usage_bytes: { type: 'gauge', unit: 'By' },
      tau_storage_usage_repositories: { type: 'gauge', unit: '{repository}' },
      tau_git_repository_size_distribution: {
        type: 'gauge',
        unit: '{repository}',
      },
      tau_git_repository_ceiling_proximity: {
        type: 'gauge',
        unit: '{repository}',
      },
      tau_storage_quota_owners: { type: 'gauge', unit: '{owner}' },
      tau_db_connections: { type: 'gauge', unit: '{connection}' },
      tau_db_connection_budget: { type: 'gauge', unit: '{connection}' },
      tau_r2_requests: { type: 'gauge', unit: '{request}' },
      tau_r2_stored_bytes: { type: 'gauge', unit: 'By' },
      tau_r2_objects: { type: 'gauge', unit: '{object}' },
      tau_r2_bandwidth_bytes: { type: 'gauge', unit: 'By' },
      tau_storage_accounting_passes_total: { type: 'counter', unit: '{pass}' },
      tau_storage_accounting_last_success: { type: 'gauge', unit: 's' },
    });
  });

  it('should bound the R2 bucket label to roles, so a bucket name never becomes a label value', () => {
    const bucket = TauMetrics.r2StoredBytes.attributes.shape['tau.r2.bucket'];
    expect(bucket.options).toEqual(['public', 'private', 'other']);
    expect(bucket.safeParse('tau-content-staging').success).toBe(false);
  });

  /* W13 Finding 8 / W14 OB6: the B2 copier's series, exactly as the catalogue and its rules name them. */
  it('should declare the B2 copier and reconciler instruments by their W13 catalogue names', () => {
    const mirror = Object.values(TauMetrics).filter((metric) => metric.name.startsWith('tau.mirror.'));
    expect(
      Object.fromEntries(mirror.map((metric) => [toPrometheusName(metric.name, metric.type), metric.type])),
    ).toEqual({
      tau_mirror_copy_lag_seconds: 'gauge',
      tau_mirror_copy_lag_generations: 'gauge',
      tau_mirror_backlog_repositories: 'gauge',
      tau_mirror_lfs_backlog_objects: 'gauge',
      tau_mirror_copy_delay_seconds: 'histogram',
      tau_mirror_rounds_total: 'counter',
      tau_mirror_objects_copied_total: 'counter',
      tau_mirror_bytes_copied_total: 'counter',
      tau_mirror_copy_failures_total: 'counter',
      tau_mirror_retention_extensions_total: 'counter',
      tau_mirror_retention_min_remaining_seconds: 'gauge',
      tau_mirror_retention_max_ahead_seconds: 'gauge',
      tau_mirror_destination_up: 'gauge',
      tau_mirror_reconcile_last_success_timestamp_seconds: 'gauge',
      tau_mirror_reconcile_missing_objects: 'gauge',
      tau_mirror_reconcile_hidden_versions: 'gauge',
      tau_mirror_destination_stored_bytes: 'gauge',
      tau_mirror_destination_object_versions: 'gauge',
      tau_mirror_drill_runs_total: 'counter',
      tau_mirror_drill_check_failures_total: 'counter',
      tau_mirror_drill_last_success_timestamp_seconds: 'gauge',
      tau_mirror_drill_duration_seconds: 'histogram',
      tau_mirror_drill_verified_bytes_total: 'counter',
    });
    // The copy's series name the destination; the drill's name the environment it read (W13 Finding 8).
    for (const metric of mirror) {
      expect(Object.keys(metric.attributes.shape)).toContain(
        metric.name.startsWith('tau.mirror.drill_') ? 'environment' : 'destination',
      );
    }
    expect(TauMetrics.mirrorDrillRuns.attributes.shape.outcome.options).toEqual(['pass', 'fail']);
    expect(TauMetrics.mirrorRounds.attributes.shape.outcome.options).toEqual([
      'copied',
      'noop',
      'failed',
      'tombstoned',
    ]);
  });

  /* Hosted Remote Storage DW1/DW2 with OB5: the route table, freeze and hold series by their catalogue names. */
  it('should declare the route table and freeze instruments by their catalogue names', () => {
    const exported = Object.fromEntries(
      [
        TauMetrics.gitRouteFrozen,
        TauMetrics.gitRouteFrozenOldest,
        TauMetrics.gitRouteHolds,
        TauMetrics.gitRouteHoldDuration,
        TauMetrics.gitRouteLookupDuration,
      ].map((metric) => [toPrometheusName(metric.name, metric.type), { type: metric.type, unit: metric.unit }]),
    );
    expect(exported).toEqual({
      tau_git_route_frozen: { type: 'gauge', unit: '{repository}' },
      tau_git_route_frozen_oldest: { type: 'gauge', unit: 's' },
      tau_git_route_holds_total: { type: 'counter', unit: '{request}' },
      tau_git_route_hold_duration: { type: 'histogram', unit: 's' },
      tau_git_route_lookup_duration: { type: 'histogram', unit: 's' },
    });
  });

  it('should bound the route labels to enums, never a repository, owner or migration id', () => {
    for (const metric of [TauMetrics.gitRouteFrozen, TauMetrics.gitRouteFrozenOldest]) {
      expect(metric.attributes.safeParse({ 'tau.git.route.scope': 'repository' }).success).toBe(true);
      expect(metric.attributes.safeParse({ 'tau.git.route.scope': 'global' }).success).toBe(true);
      expect(metric.attributes.safeParse({ 'tau.git.route.scope': 'mig_1' }).success).toBe(false);
    }
    for (const metric of [TauMetrics.gitRouteHolds, TauMetrics.gitRouteHoldDuration]) {
      expect(Object.keys(metric.attributes.shape)).toEqual(['outcome']);
      expect(metric.attributes.safeParse({ outcome: 'released' }).success).toBe(true);
      expect(metric.attributes.safeParse({ outcome: 'timed_out' }).success).toBe(true);
      expect(metric.attributes.safeParse({ outcome: 'proj_1' }).success).toBe(false);
    }
    const lookup = (source: string): boolean =>
      TauMetrics.gitRouteLookupDuration.attributes.safeParse({ 'tau.git.route.source': source }).success;
    expect(lookup('cache')).toBe(true);
    expect(lookup('database')).toBe(true);
    expect(lookup('redis')).toBe(false);
    /* A hold is at most about 5 s, so its buckets end there; a lookup is a cache hit or one indexed read. */
    expect(TauMetrics.gitRouteHoldDuration.buckets.at(-1)).toBeGreaterThanOrEqual(5);
    expect(TauMetrics.gitRouteLookupDuration.buckets.at(0)).toBeLessThanOrEqual(0.0001);
  });

  /* Hosted Remote Storage DC2: the pack cache and the router's spill and membership series (W14 OB4 names). */
  it('should declare the pack cache and router instruments under the W14 catalogue names', () => {
    const exported = Object.fromEntries(
      [
        TauMetrics.gitCacheLookups,
        TauMetrics.gitCacheBytes,
        TauMetrics.gitCacheBudgetBytes,
        TauMetrics.gitCacheEvictions,
        TauMetrics.gitCacheEvictedBytes,
        TauMetrics.gitCacheFallbacks,
        TauMetrics.gitSpills,
        TauMetrics.gitMembers,
      ].map((metric) => [toPrometheusName(metric.name, metric.type), { type: metric.type, unit: metric.unit }]),
    );
    expect(exported).toEqual({
      tau_git_cache_lookups_total: { type: 'counter', unit: '{lookup}' },
      tau_git_cache_bytes: { type: 'gauge', unit: 'By' },
      tau_git_cache_budget_bytes: { type: 'gauge', unit: 'By' },
      tau_git_cache_evictions_total: { type: 'counter', unit: '{entry}' },
      tau_git_cache_evicted_bytes_total: { type: 'counter', unit: 'By' },
      tau_git_cache_fallbacks_total: { type: 'counter', unit: '{lease}' },
      tau_git_spills_total: { type: 'counter', unit: '{request}' },
      tau_git_members: { type: 'gauge', unit: '{member}' },
    });
    expect(TauMetrics.gitCacheLookups.attributes.safeParse({ result: 'proj_1' }).success).toBe(false);
    expect(TauMetrics.gitSpills.attributes.safeParse({ reason: 'admission' }).success).toBe(true);
    expect(TauMetrics.gitSpills.attributes.safeParse({ reason: 'start_wait' }).success).toBe(true);
    expect(TauMetrics.gitCacheFallbacks.attributes.safeParse({ reason: 'over_budget' }).success).toBe(true);
  });

  /* Hosted Remote Storage DC1: the grant, forward and receipt series between tau-api and tau-storage. */
  it('should declare the storage grant, forward and receipt instruments with bounded reasons', () => {
    const exported = Object.fromEntries(
      [
        TauMetrics.gitGrantsRejected,
        TauMetrics.gitForwardErrors,
        TauMetrics.gitReceipts,
        TauMetrics.gitSlowBodyAborts,
      ].map((metric) => [toPrometheusName(metric.name, metric.type), { type: metric.type, unit: metric.unit }]),
    );
    expect(exported).toEqual({
      tau_git_grants_rejected_total: { type: 'counter', unit: '{grant}' },
      tau_git_forward_errors_total: { type: 'counter', unit: '{request}' },
      tau_git_receipts_total: { type: 'counter', unit: '{receipt}' },
      tau_git_slow_body_aborts_total: { type: 'counter', unit: '{request}' },
    });
    for (const reason of ['unknown_kid', 'version', 'iat_skew', 'path', 'replay', 'signature']) {
      expect(TauMetrics.gitGrantsRejected.attributes.safeParse({ reason }).success).toBe(true);
    }
    expect(TauMetrics.gitGrantsRejected.attributes.safeParse({ reason: 'proj_1' }).success).toBe(false);
    for (const reason of ['grant_rejected', 'unreachable', 'timeout', 'aborted', 'malformed_response']) {
      expect(TauMetrics.gitForwardErrors.attributes.safeParse({ reason }).success).toBe(true);
    }
    for (const outcome of ['applied', 'duplicate', 'ledger_unavailable', 'manifest_mismatch', 'rejected', 'stale']) {
      expect(TauMetrics.gitReceipts.attributes.safeParse({ outcome }).success).toBe(true);
    }
    expect(TauMetrics.gitReceipts.attributes.safeParse({ outcome: 'rid_1' }).success).toBe(false);
  });

  it('should split retryable refusals out of error as busy on the sync edge', () => {
    expect(
      TauMetrics.syncOperations.attributes.safeParse({
        'tau.sync.operation': 'push',
        outcome: 'busy',
      }).success,
    ).toBe(true);
    expect(
      TauMetrics.syncOperationDuration.attributes.safeParse({
        'tau.sync.operation': 'push',
        outcome: 'busy',
        'tau.git.execution': 'forwarded',
        'tau.git.affinity': 'rendezvous',
      }).success,
    ).toBe(true);
  });

  it('should label sync request latency by where git ran and how tau-storage was chosen, from enums alone', () => {
    const latency = (execution: string, affinity: string): boolean =>
      TauMetrics.syncOperationDuration.attributes.safeParse({
        'tau.sync.operation': 'push',
        outcome: 'ok',
        'tau.git.execution': execution,
        'tau.git.affinity': affinity,
      }).success;
    expect(latency('in_process', 'off')).toBe(true);
    expect(latency('forwarded', 'off')).toBe(true);
    expect(latency('forwarded', 'rendezvous')).toBe(true);
    expect(latency('storage-1', 'off')).toBe(false);
    expect(latency('forwarded', 'member-2')).toBe(false);
    expect(
      TauMetrics.syncOperationDuration.attributes.safeParse({ 'tau.sync.operation': 'push', outcome: 'ok' }).success,
    ).toBe(false);
  });

  it('should resolve the 3–5 s server push band and the 3–30 s client save band', () => {
    expect(TauMetrics.syncOperationDuration.buckets).toEqual([0.05, 0.1, 0.25, 0.5, 1, 2, 3, 4, 5, 10, 30, 60, 120]);
    expect(TauMetrics.syncClientLag.buckets).toEqual([
      0.5, 1, 2, 3, 4, 5, 7.5, 10, 15, 20, 30, 60, 120, 300, 900, 3600,
    ]);
    expect(TauMetrics.syncClientAttemptDuration.buckets).toEqual([
      0.1, 0.25, 0.5, 1, 2, 3, 4, 5, 7.5, 10, 15, 20, 30, 60, 120, 300, 900,
    ]);
  });

  it('should label client attempt durations as the attempt counter does', () => {
    expect(TauMetrics.syncClientAttemptDuration).toMatchObject({
      name: 'tau.sync.client.attempt.duration',
      type: 'histogram',
      unit: 's',
    });
    expect(Object.keys(TauMetrics.syncClientAttemptDuration.attributes.shape)).toEqual(
      Object.keys(TauMetrics.syncClientAttempts.attributes.shape),
    );
    const attempt = (outcome: string): boolean =>
      TauMetrics.syncClientAttemptDuration.attributes.safeParse({
        direction: 'push',
        outcome,
        'agent.placement': 'browser',
      }).success;
    expect(attempt('retry')).toBe(true);
    expect(attempt('proj_1')).toBe(false);
  });

  /* Load-path audit: an open's hydrate, which the pull attempt settles before. */
  it('should label client large-object fetches by placement, cache state and source only', () => {
    expect(TauMetrics.syncClientLfsDuration).toMatchObject({ name: 'tau.sync.client.lfs.duration', unit: 's' });
    expect(TauMetrics.syncClientLfsDuration.buckets).toEqual([0.5, 1, 2, 3, 5, 7.5, 10, 15, 20, 30, 60, 120, 300, 900]);
    expect(
      TauMetrics.syncClientLfsDuration.attributes.safeParse({ 'agent.placement': 'browser', cache: 'cold' }).success,
    ).toBe(true);
    expect(
      TauMetrics.syncClientLfsDuration.attributes.safeParse({ 'agent.placement': 'browser', cache: 'warm' }).success,
    ).toBe(false);
    for (const metric of [TauMetrics.syncClientLfsObjects, TauMetrics.syncClientLfsBytes]) {
      expect(metric.attributes.safeParse({ 'agent.placement': 'desktop', source: 'local' }).success).toBe(true);
      expect(metric.attributes.safeParse({ 'agent.placement': 'desktop', source: 'proj_1' }).success).toBe(false);
    }
  });

  /* STO-25: a hosted project's open, by phase and by whether it fetched from the network. */
  it('should label project opens by phase and cache state only', () => {
    expect(TauMetrics.projectOpenDuration).toMatchObject({ name: 'tau.project.open.duration', unit: 's' });
    expect(TauMetrics.projectOpenDuration.buckets).toContain(5);
    expect(TauMetrics.projectOpenDuration.attributes.safeParse({ phase: 'first_view', cache: 'cold' }).success).toBe(
      true,
    );
    expect(TauMetrics.projectOpenDuration.attributes.safeParse({ phase: 'fully_fetched', cache: 'warm' }).success).toBe(
      true,
    );
    expect(TauMetrics.projectOpenDuration.attributes.safeParse({ phase: 'first_view', cache: 'partial' }).success).toBe(
      false,
    );
    expect(TauMetrics.projectOpenDuration.attributes.safeParse({ phase: 'proj_1', cache: 'cold' }).success).toBe(false);
    expect(
      TauMetrics.projectOpenDuration.attributes.safeParse({
        phase: 'fully_fetched',
        cache: 'cold',
        'tau.lfs.transport': 'files',
      }).success,
    ).toBe(true);
    expect(
      TauMetrics.syncClientLfsDuration.attributes.safeParse({
        'agent.placement': 'browser',
        cache: 'cold',
        'tau.lfs.transport': 'files.taucad.dev',
      }).success,
    ).toBe(false);
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
    /* Push-latency Task 1: each commitLease phase is a series, and the buckets resolve where commits land. */
    expect(
      ['prepare', 'compaction', 'hash', 'object_puts', 'manifest_write', 'manifest_read'].map(
        (phase) =>
          TauMetrics.gitCommitDuration.attributes.safeParse({
            'tau.git.commit.phase': phase,
            'tau.git.commit.kind': 'push',
          }).success,
      ),
    ).toStrictEqual([true, true, true, true, true, true]);
    expect(TauMetrics.gitCommitDuration.buckets.filter((bound) => bound >= 0.25 && bound <= 5)).toStrictEqual([
      0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5,
    ]);
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

  /* Tau Agent observability T14: evidence health is counts and bounded codes, never a receipt, trace, project or account. */
  it('should declare the agent-evidence instruments with label sets of enums alone', () => {
    const series = [
      TauMetrics.agentEvidenceAdmissions,
      TauMetrics.agentEvidenceDeliveries,
      TauMetrics.agentEvidenceBacklogRows,
      TauMetrics.agentEvidenceBacklogHeldBytes,
      TauMetrics.agentEvidenceErasureTraces,
      TauMetrics.agentEvidenceLifecycleRecords,
      TauMetrics.agentEvidencePasses,
    ];
    expect(
      Object.fromEntries(series.map((metric) => [toPrometheusName(metric.name, metric.type), metric.type])),
    ).toEqual({
      tau_agent_evidence_admissions_total: 'counter',
      tau_agent_evidence_deliveries_total: 'counter',
      tau_agent_evidence_backlog_rows: 'gauge',
      tau_agent_evidence_backlog_held_bytes: 'gauge',
      tau_agent_evidence_erasure_traces_total: 'counter',
      tau_agent_evidence_lifecycle_records_total: 'counter',
      tau_agent_evidence_passes_total: 'counter',
    });
    for (const metric of series) {
      for (const label of Object.values(metric.attributes.shape)) {
        expect(label).toBeInstanceOf(z.ZodEnum);
      }
    }
    expect(
      TauMetrics.agentEvidenceAdmissions.attributes.safeParse({
        'tau.agent_evidence.authority': 'host',
        'tau.agent_evidence.plane': 'content',
        outcome: 'fenced',
      }).success,
    ).toBe(true);
    expect(TauMetrics.agentEvidenceDeliveries.attributes.safeParse({ outcome: 'http-503' }).success).toBe(false);
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
    // `copied`: W13's catalogue fixes `tau_mirror_{objects,bytes}_copied_total` (W14 OB6).
    // `rejected`: the W14 catalogue's `tau_git_grants_rejected_total` (Hosted Remote Storage DC1, OB4).
    // `usage`, `missing`, `attention`, `reuse`, `dropped`, `unavailable`, `partial`: Runtime Observability package §1
    // fixes `tau.runtime.{kernel_usage,facts_missing,job_attention,reuse}` and `tau.telemetry.{client.dropped,
    // spans.dropped,ingest.unavailable,ingest.partial}`; dashboards and named views use those names.
    const validSuffixes =
      /s$|cost$|microusd$|picousd$|flagged$|copied$|rejected$|usage$|missing$|attention$|reuse$|dropped$|unavailable$|partial$/;
    for (const counter of counters) {
      // A `_by_<dimension>` tail names the breakdown, not the counted thing: `operations_by_release`.
      const lastSegment = (counter.name.split('.').at(-1) ?? '').replace(/_by_\w+$/u, '');
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
