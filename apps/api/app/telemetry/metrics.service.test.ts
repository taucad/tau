/* oxlint-disable @typescript-eslint/no-confusing-void-expression -- expect(() => fn()).not.toThrow() pattern */
import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
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

  describe('RPC metrics', () => {
    it('should create rpcCallDuration histogram', () => {
      expect(service.rpcCallDuration).toBeDefined();
    });

    it('should create rpcActiveCalls up-down counter', () => {
      expect(service.rpcActiveCalls).toBeDefined();
    });
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

    it('should create genAiAgentIterations histogram', () => {
      expect(service.genAiAgentIterations).toBeDefined();
    });

    it('should create genAiPromptSectionSize histogram', () => {
      expect(service.genAiPromptSectionSize).toBeDefined();
      expect(() => service.genAiPromptSectionSize.record(1234)).not.toThrow();
    });
  });

  describe('Infrastructure metrics', () => {
    it('should create redisConnectionState gauge', () => {
      expect(service.redisConnectionState).toBeDefined();
    });

    it('should create sseActiveConnections up-down counter', () => {
      expect(service.sseActiveConnections).toBeDefined();
    });

    it('should create sseEvents counter', () => {
      expect(service.sseEvents).toBeDefined();
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
      expect(() => service.rpcCallDuration.record(0.5)).not.toThrow();
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
      expect(() => service.rpcActiveCalls.add(1)).not.toThrow();
      expect(() => service.rpcActiveCalls.add(-1)).not.toThrow();
      expect(() => service.wsActiveConnections.add(1)).not.toThrow();
    });

    it('should record gauge values without error', () => {
      expect(() => service.redisConnectionState.record(1)).not.toThrow();
      expect(() => service.redisConnectionState.record(0)).not.toThrow();
    });
  });
});
