import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from '#api/health/health.controller.js';
import { RedisHealthIndicator } from '#api/health/redis-health.indicator.js';
import { DatabaseHealthIndicator } from '#api/health/database-health.indicator.js';
import { S3HealthIndicator } from '#api/health/s3-health.indicator.js';

describe('HealthController', () => {
  let controller: HealthController;
  let redisHealth: RedisHealthIndicator;
  let databaseHealth: DatabaseHealthIndicator;
  let s3Health: S3HealthIndicator;

  beforeEach(async () => {
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
      ],
    }).compile();

    controller = module.get(HealthController);
    redisHealth = module.get(RedisHealthIndicator);
    databaseHealth = module.get(DatabaseHealthIndicator);
    s3Health = module.get(S3HealthIndicator);
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

    it('should return error status when S3 is down', async () => {
      vi.spyOn(s3Health, 'isHealthy').mockResolvedValue({
        s3: { status: 'down', message: 'Access denied' },
      });

      await expect(controller.checkReady()).rejects.toThrow();
    });
  });

  describe('GET /health/startup', () => {
    it('should return ok status with uptime', () => {
      const result = controller.checkStartup();
      expect(result.status).toBe('ok');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });
  });
});
