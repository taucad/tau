import process from 'node:process';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from '#api/health/health.controller.js';
import { RedisHealthIndicator } from '#api/health/redis-health.indicator.js';
import { DatabaseHealthIndicator } from '#api/health/database-health.indicator.js';
import { S3HealthIndicator } from '#api/health/s3-health.indicator.js';
import { GitToolchainHealthIndicator } from '#api/health/git-toolchain-health.indicator.js';
import { ReadinessRefusalException } from '#api/health/readiness-refusal.exception.js';
import { MetricsService } from '#telemetry/metrics.js';
import { reportReadinessFailure } from '#telemetry/sentry.js';

vi.mock('#telemetry/sentry.js', () => ({ reportReadinessFailure: vi.fn() }));

describe('HealthController', () => {
  let controller: HealthController;
  let redisHealth: RedisHealthIndicator;
  let databaseHealth: DatabaseHealthIndicator;
  let s3Health: S3HealthIndicator;
  let readinessFailureCount: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    readinessFailureCount = vi.fn();
    const module: TestingModule = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        {
          provide: RedisHealthIndicator,
          useValue: { isHealthy: vi.fn().mockResolvedValue({ redis: { status: 'up', responseTimeMs: 1 } }) },
        },
        {
          provide: DatabaseHealthIndicator,
          useValue: {
            isHealthy: vi.fn().mockResolvedValue({ database: { status: 'up', responseTimeMs: 2 } }),
          },
        },
        {
          provide: S3HealthIndicator,
          useValue: {
            isHealthy: vi.fn().mockResolvedValue({ s3: { status: 'up', responseTimeMs: 3 } }),
          },
        },
        {
          provide: GitToolchainHealthIndicator,
          useValue: {
            isHealthy: vi.fn().mockResolvedValue({ git: { status: 'up', git: 'git version 2.55.0' } }),
          },
        },
        { provide: MetricsService, useValue: { healthReadinessFailures: { add: readinessFailureCount } } },
      ],
    }).compile();

    controller = module.get(HealthController);
    redisHealth = module.get(RedisHealthIndicator);
    databaseHealth = module.get(DatabaseHealthIndicator);
    s3Health = module.get(S3HealthIndicator);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(reportReadinessFailure).mockClear();
  });

  describe('GET /health/live', () => {
    it('should return healthy status when heap is within limits', async () => {
      const result = await controller.checkLive();
      expect(result.status).toBe('ok');
      expect(result.details).toHaveProperty('memory_heap');
    });
  });

  describe('GET /health/ready', () => {
    it('should return healthy status when all dependencies are up', async () => {
      const result = await controller.checkReady();
      expect(result.status).toBe('ok');
      expect(result.details).toHaveProperty('redis');
      expect(result.details).toHaveProperty('database');
      expect(result.details).toHaveProperty('s3');
      expect(result.details).toHaveProperty('git');
      expect(result.details).toHaveProperty('memory_heap');
    });

    it('should return error status when Redis is down', async () => {
      vi.spyOn(redisHealth, 'isHealthy').mockResolvedValue({
        redis: { status: 'down', message: 'Connection refused' },
      });

      await expect(controller.checkReady()).rejects.toThrow();
    });

    it('should return error status when database is down', async () => {
      vi.spyOn(databaseHealth, 'isHealthy').mockResolvedValue({
        database: { status: 'down', message: 'Connection refused' },
      });

      await expect(controller.checkReady()).rejects.toThrow();
    });

    it('should name each down indicator in a warning, a per-indicator count and a per-indicator report', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      vi.spyOn(redisHealth, 'isHealthy').mockResolvedValue({
        redis: { status: 'down', message: 'Connection refused', responseTimeMs: 5 },
      });
      vi.spyOn(databaseHealth, 'isHealthy').mockResolvedValue({
        database: { status: 'down', message: 'Response time exceeds 300ms threshold', responseTimeMs: 412 },
      });
      const failures = [
        { indicator: 'redis', message: 'Connection refused', responseTimeMs: 5 },
        { indicator: 'database', message: 'Response time exceeds 300ms threshold', responseTimeMs: 412 },
      ];

      const refusal = await controller.checkReady().catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(ReadinessRefusalException);
      expect((refusal as ReadinessRefusalException).getStatus()).toBe(503);
      expect((refusal as ReadinessRefusalException).failures).toEqual(failures);
      expect(warn).toHaveBeenCalledWith({ failures }, 'Readiness refused: dependency check down');
      expect(readinessFailureCount.mock.calls).toEqual([
        [1, { 'health.indicator': 'redis' }],
        [1, { 'health.indicator': 'database' }],
      ]);
      expect(vi.mocked(reportReadinessFailure).mock.calls).toEqual([[failures[0]], [failures[1]]]);
    });

    it('should not count or report a ready probe', async () => {
      await controller.checkReady();

      expect(readinessFailureCount).not.toHaveBeenCalled();
      expect(reportReadinessFailure).not.toHaveBeenCalled();
    });

    it('should return error status when S3 is down', async () => {
      vi.spyOn(s3Health, 'isHealthy').mockResolvedValue({
        s3: { status: 'down', message: 'Access denied' },
      });

      await expect(controller.checkReady()).rejects.toThrow();
    });
  });

  it.each(['checkLive', 'checkReady'] as const)('refuses %s before heap reaches the 1 GiB VM limit', async (method) => {
    const usage = process.memoryUsage();
    const memoryUsage = vi.spyOn(process, 'memoryUsage').mockReturnValue({ ...usage, heapUsed: 900 * 1024 * 1024 });
    try {
      await expect(controller[method]()).rejects.toThrow();
    } finally {
      memoryUsage.mockRestore();
    }
  });

  describe('GET /health/startup', () => {
    it('should return ok status with uptime', () => {
      const result = controller.checkStartup();
      expect(result.status).toBe('ok');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });
  });
});
