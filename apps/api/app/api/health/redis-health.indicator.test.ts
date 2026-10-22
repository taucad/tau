import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { HealthIndicatorService } from '@nestjs/terminus';
import { RedisHealthIndicator } from '#api/health/redis-health.indicator.js';
import { RedisService } from '#redis/redis.service.js';

describe('RedisHealthIndicator', () => {
  let indicator: RedisHealthIndicator;
  let mockPing: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockPing = vi.fn().mockResolvedValue('PONG');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisHealthIndicator,
        HealthIndicatorService,
        {
          provide: RedisService,
          useValue: { client: { ping: mockPing } },
        },
      ],
    }).compile();

    indicator = module.get(RedisHealthIndicator);
  });

  it('should report up when Redis responds with PONG within threshold', async () => {
    const result = await indicator.isHealthy();
    expect(result['redis']?.status).toBe('up');
    expect(result['redis']).toHaveProperty('responseTimeMs');
  });

  it('should report down when Redis returns unexpected response', async () => {
    mockPing.mockResolvedValue('UNEXPECTED');

    const result = await indicator.isHealthy();
    expect(result['redis']?.status).toBe('down');
  });

  it('should report down when Redis connection fails', async () => {
    mockPing.mockRejectedValue(new Error('Connection refused'));

    const result = await indicator.isHealthy();
    expect(result['redis']?.status).toBe('down');
    expect(result['redis']?.['message']).toBe('Connection refused');
    // A failed probe still says how long it waited, so a timeout reads differently from a refusal.
    expect(result['redis']?.['responseTimeMs']).toEqual(expect.any(Number));
  });
});
