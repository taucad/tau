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
  let gitToolchainHealth: GitToolchainHealthIndicator;
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
    gitToolchainHealth = module.get(GitToolchainHealthIndicator);
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

    it.each([
      ['redis', 'Connection refused'],
      ['database', 'Response time exceeds 300ms threshold'],
      ['s3', 'Storage readiness timed out after 1500 ms'],
    ] as const)('should stay ready when the shared %s dependency is down', async (indicator, message) => {
      const indicators = { redis: redisHealth, database: databaseHealth, s3: s3Health };
      vi.spyOn(indicators[indicator], 'isHealthy').mockResolvedValue({
        [indicator]: { status: 'down', message },
      });

      const result = await controller.checkReady();

      expect(result.status).toBe('ok');
      expect(result.details[indicator]).toStrictEqual({ status: 'down', message });
      expect(result.error).toStrictEqual({ [indicator]: { status: 'down', message } });
    });

    it('should warn, count and report each down shared dependency without refusing', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      vi.spyOn(redisHealth, 'isHealthy').mockResolvedValue({
        redis: { status: 'down', message: 'Connection refused', responseTimeMs: 5 },
      });
      vi.spyOn(s3Health, 'isHealthy').mockResolvedValue({
        s3: { status: 'down', message: 'Storage readiness timed out after 1500 ms', responseTimeMs: 1500 },
      });
      const failures = [
        { indicator: 'redis', message: 'Connection refused', responseTimeMs: 5 },
        { indicator: 's3', message: 'Storage readiness timed out after 1500 ms', responseTimeMs: 1500 },
      ];

      await expect(controller.checkReady()).resolves.toMatchObject({ status: 'ok' });

      expect(warn).toHaveBeenCalledWith({ failures }, 'Readiness degraded: shared dependency check down');
      expect(readinessFailureCount.mock.calls).toEqual([
        [1, { 'health.indicator': 'redis' }],
        [1, { 'health.indicator': 's3' }],
      ]);
      expect(vi.mocked(reportReadinessFailure).mock.calls).toEqual([[failures[0]], [failures[1]]]);
    });

    it('should refuse when the git toolchain is missing from this Machine', async () => {
      vi.spyOn(gitToolchainHealth, 'isHealthy').mockResolvedValue({
        git: { status: 'down', message: 'git is not installed in this image' },
      });

      const refusal = await controller.checkReady().catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(ReadinessRefusalException);
      expect((refusal as ReadinessRefusalException).getStatus()).toBe(503);
      expect((refusal as ReadinessRefusalException).failures).toEqual([
        { indicator: 'git', message: 'git is not installed in this image' },
      ]);
    });

    it('should name every down indicator in a refusal, its warning, counts and reports', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      vi.spyOn(databaseHealth, 'isHealthy').mockResolvedValue({
        database: { status: 'down', message: 'Response time exceeds 300ms threshold', responseTimeMs: 412 },
      });
      vi.spyOn(gitToolchainHealth, 'isHealthy').mockResolvedValue({
        git: { status: 'down', message: 'git-lfs is not installed in this image' },
      });
      const failures = [
        { indicator: 'database', message: 'Response time exceeds 300ms threshold', responseTimeMs: 412 },
        { indicator: 'git', message: 'git-lfs is not installed in this image' },
      ];

      const refusal = await controller.checkReady().catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(ReadinessRefusalException);
      expect((refusal as ReadinessRefusalException).getStatus()).toBe(503);
      expect((refusal as ReadinessRefusalException).failures).toEqual(failures);
      expect(warn).toHaveBeenCalledWith({ failures }, 'Readiness refused: Machine check down');
      expect(readinessFailureCount.mock.calls).toEqual([
        [1, { 'health.indicator': 'database' }],
        [1, { 'health.indicator': 'git' }],
      ]);
      expect(vi.mocked(reportReadinessFailure).mock.calls).toEqual([[failures[0]], [failures[1]]]);
    });

    it('should not count or report a ready probe', async () => {
      await controller.checkReady();

      expect(readinessFailureCount).not.toHaveBeenCalled();
      expect(reportReadinessFailure).not.toHaveBeenCalled();
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
