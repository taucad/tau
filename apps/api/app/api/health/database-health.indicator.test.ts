import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { HealthIndicatorService } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from '#api/health/database-health.indicator.js';
import { DatabaseService } from '#database/database.service.js';

describe('DatabaseHealthIndicator', () => {
  let indicator: DatabaseHealthIndicator;
  let mockExecute: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- PostgreSQL column name
    mockExecute = vi.fn().mockResolvedValue([{ '?column?': 1 }]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseHealthIndicator,
        HealthIndicatorService,
        {
          provide: DatabaseService,
          useValue: { database: { execute: mockExecute } },
        },
      ],
    }).compile();

    indicator = module.get(DatabaseHealthIndicator);
  });

  it('should report up when database responds within threshold', async () => {
    const result = await indicator.isHealthy();
    expect(result['database']?.status).toBe('up');
    expect(result['database']).toHaveProperty('responseTimeMs');
  });

  it('should report down when database connection fails', async () => {
    mockExecute.mockRejectedValue(new Error('Connection refused'));

    const result = await indicator.isHealthy();
    expect(result['database']?.status).toBe('down');
    expect(result['database']?.['message']).toBe('Connection refused');
    // A failed probe still says how long it waited, so a timeout reads differently from a refusal.
    expect(result['database']?.['responseTimeMs']).toEqual(expect.any(Number));
  });
});
