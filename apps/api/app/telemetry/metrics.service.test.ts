/* oxlint-disable @typescript-eslint/no-confusing-void-expression -- expect(() => fn()).not.toThrow() pattern */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { metrics } from '@opentelemetry/api';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { metrics as sdkMetrics } from '@opentelemetry/sdk-node';
import { MetricsService } from '#telemetry/metrics.js';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    service = module.get(MetricsService);
  });

  it('should be injectable via NestJS DI', () => {
    expect(service).toBeInstanceOf(MetricsService);
  });

  describe('WebSocket metrics', () => {
    it('should create wsActiveConnections up-down counter', () => {
      expect(service.wsActiveConnections).toBeDefined();
    });

    it('should create wsDisconnections counter', () => {
      expect(service.wsDisconnections).toBeDefined();
    });
  });

  describe('AI/LLM metrics', () => {
    it('should create genAiTokenUsage histogram', () => {
      expect(service.genAiTokenUsage).toBeDefined();
    });

    it('should create genAiOperationDuration histogram', () => {
      expect(service.genAiOperationDuration).toBeDefined();
    });

    it('should create genAiTimeToFirstToken histogram', () => {
      expect(service.genAiTimeToFirstToken).toBeDefined();
    });

    it('should create genAiCost counter', () => {
      expect(service.genAiCost).toBeDefined();
    });

    it('should create genAiToolInvocations counter', () => {
      expect(service.genAiToolInvocations).toBeDefined();
    });

    it('should create genAiToolDuration histogram', () => {
      expect(service.genAiToolDuration).toBeDefined();
    });

    it('should create genAiToolInputRepairs counter', () => {
      expect(service.genAiToolInputRepairs).toBeDefined();
      expect(() => service.genAiToolInputRepairs.add(1)).not.toThrow();
    });

    it('should create tool-result media preservation counter', () => {
      expect(service.chatToolResultMediaPreserved).toBeDefined();
      expect(() => service.chatToolResultMediaPreserved.add(1)).not.toThrow();
    });

    it('should create genAiAgentIterations histogram', () => {
      expect(service.genAiAgentIterations).toBeDefined();
    });

    it('should create genAiPromptSectionSize histogram', () => {
      expect(service.genAiPromptSectionSize).toBeDefined();
      expect(() => service.genAiPromptSectionSize.record(1234)).not.toThrow();
    });

    it('should create context budget and compaction metrics', () => {
      expect(service.genAiContextBudgetTokens).toBeDefined();
      expect(service.genAiContextCompactionDecisions).toBeDefined();
      expect(() => service.genAiContextBudgetTokens.record(1234)).not.toThrow();
      expect(() => service.genAiContextCompactionDecisions.add(1)).not.toThrow();
    });

    it('should create content-free funded-operation metrics', () => {
      expect(() =>
        service.billingFundedOperationRecoveries.add(1, {
          'deployment.environment': 'staging',
          'tau.billing.capacity_pool': 'primary',
          'tau.billing.recovery.outcome': 'attempted',
        }),
      ).not.toThrow();
      expect(() =>
        service.billingFundedOperationDenials.add(1, {
          'deployment.environment': 'staging',
          'tau.billing.capacity_pool': 'primary',
          'tau.billing.denial.reason': 'recovery_failed',
        }),
      ).not.toThrow();
      expect(() =>
        service.billingFundedOperationTerminals.add(1, {
          'deployment.environment': 'staging',
          'tau.billing.capacity_pool': 'helper',
          'tau.billing.terminal.kind': 'final_usage',
          'tau.billing.terminal.incomplete_reason': 'max_output_tokens',
        }),
      ).not.toThrow();
      expect(() =>
        service.billingFundedOperationCurrent.record(1, {
          'deployment.environment': 'staging',
          'tau.billing.capacity_pool': 'primary',
          'tau.billing.pending.state': 'pending',
        }),
      ).not.toThrow();
      expect(() =>
        service.billingFundedOperationOldestDueAge.record(0, {
          'deployment.environment': 'staging',
          'tau.billing.capacity_pool': 'primary',
        }),
      ).not.toThrow();
      expect(() =>
        service.billingFundedOperationRecoveryBatchDuration.record(0.1, {
          'deployment.environment': 'staging',
          'tau.billing.capacity_pool': 'primary',
          'tau.billing.recovery.batch.outcome': 'succeeded',
        }),
      ).not.toThrow();
      expect(() =>
        service.billingFundedOperationRecoveryProviderExecutions.record(0, {
          'deployment.environment': 'staging',
          'tau.billing.capacity_pool': 'primary',
        }),
      ).not.toThrow();
    });
  });

  describe('Infrastructure metrics', () => {
    it('should create redisConnectionState gauge', () => {
      expect(service.redisConnectionState).toBeDefined();
    });
  });

  describe('Publication metrics', () => {
    it('should create publicationViewsTotal counter', () => {
      expect(service.publicationViewsTotal).toBeDefined();
      expect(() => service.publicationViewsTotal.add(1, { deduped: 'unique' })).not.toThrow();
    });

    it('should create publicationViewsRejectedTotal counter', () => {
      expect(service.publicationViewsRejectedTotal).toBeDefined();
      expect(() => service.publicationViewsRejectedTotal.add(1, { reason: 'cap_exceeded' })).not.toThrow();
    });
  });

  describe('Client-reported metrics', () => {
    it('should create kernelExecutionDuration histogram', () => {
      expect(service.kernelExecutionDuration).toBeDefined();
    });

    it('should create kernelExecutions counter', () => {
      expect(service.kernelExecutions).toBeDefined();
    });

    it('should create kernelExportDuration histogram', () => {
      expect(service.kernelExportDuration).toBeDefined();
    });
  });

  describe('metric operations', () => {
    it('should record values on histograms without error', () => {
      expect(() => service.wsMessageSize.record(512)).not.toThrow();
      expect(() => service.genAiTokenUsage.record(100)).not.toThrow();
      expect(() => service.kernelExecutionDuration.record(1.2)).not.toThrow();
    });

    it('should add values on counters without error', () => {
      expect(() => service.wsDisconnections.add(1)).not.toThrow();
      expect(() => service.genAiCost.add(0.01)).not.toThrow();
      expect(() => service.kernelExecutions.add(1)).not.toThrow();
      expect(() => service.publicationViewsTotal.add(1)).not.toThrow();
      expect(() => service.publicationViewsRejectedTotal.add(1)).not.toThrow();
    });

    it('should add/subtract values on up-down counters without error', () => {
      expect(() => service.wsActiveConnections.add(1)).not.toThrow();
      expect(() => service.wsActiveConnections.add(-1)).not.toThrow();
    });

    it('should record gauge values without error', () => {
      expect(() => service.redisConnectionState.record(1)).not.toThrow();
      expect(() => service.redisConnectionState.record(0)).not.toThrow();
    });
  });

  /* Hosted Remote Storage DA2/OB2: the series the W14 catalogue names are the series a scrape returns. */
  describe('git execution metrics', () => {
    afterEach(() => {
      metrics.disable();
    });

    it('should export the git edge, admission, lease, hydrate and commit series under their catalogue names', async () => {
      const exporter = new PrometheusExporter({ preventServerStart: true });
      const provider = new sdkMetrics.MeterProvider({ readers: [exporter] });
      metrics.setGlobalMeterProvider(provider);
      const git = new MetricsService();

      git.syncRefusals.add(1, {
        'tau.sync.operation': 'push',
        'tau.sync.refusal.code': 'GIT_LEASE_OWNER_BUSY',
        'http.response.status_code': 503,
      });
      git.gitAdmissions.add(1, {
        'tau.git.operation': 'receive_pack',
        outcome: 'admitted',
      });
      git.gitLeasesActive.add(1, { 'tau.git.operation': 'receive_pack' });
      git.gitLeaseReservedBytes.record(2_684_354_560);
      git.gitDiskFreeBytes.record(7_838_315_315);
      git.gitHydrateBytes.record(1024, {
        'tau.git.hydrate.source': 'object_store',
      });
      git.gitCommitAttempts.add(1, {
        outcome: 'committed',
        'tau.git.commit.kind': 'push',
      });
      git.gitCommitDuration.record(0.2, {
        'tau.git.commit.phase': 'total',
        'tau.git.commit.kind': 'push',
      });
      git.gitRepositorySize.record(1024);
      git.gitHotProjectCommitRate.addCallback((result) => {
        result.observe(0.5, { rank: '1' });
      });
      git.gitHotProjectWriters.addCallback((result) => {
        result.observe(3, { rank: '1' });
      });

      const body = await new Promise<string>((resolve) => {
        const response = {
          statusCode: 0,
          setHeader: () => response,
          end: (text: string) => {
            resolve(text);
          },
        };
        exporter.getMetricsRequestHandler({} as IncomingMessage, response as unknown as ServerResponse);
      });
      await provider.shutdown();

      for (const series of [
        'tau_sync_refusals_total{',
        'tau_git_admissions_total{',
        'tau_git_leases_active{',
        'tau_git_lease_reserved_bytes{',
        'tau_git_disk_free_bytes{',
        'tau_git_hydrate_bytes_bucket{',
        'tau_git_commit_attempts_total{',
        'tau_git_commit_duration_bucket{',
        'tau_git_repository_size_bucket{',
        'tau_git_hot_project_commit_rate{',
        'tau_git_hot_project_writers{',
      ]) {
        expect(body, series).toContain(series);
      }
      expect(body).toContain('tau_sync_refusal_code="GIT_LEASE_OWNER_BUSY"');
      expect(body).toMatch(/tau_git_hot_project_writers\{[^}]*rank="1"[^}]*\} 3/u);
    });
  });
});
