import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { HealthIndicatorService } from '@nestjs/terminus';
import { S3HealthIndicator } from '#api/health/s3-health.indicator.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';

const probeResult = { etag: 'abc', size: 2, contentType: 'text/plain', cacheControl: 'no-store' };

describe('S3HealthIndicator', () => {
  let indicator: S3HealthIndicator;
  let mockHeadProbe: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockHeadProbe = vi.fn().mockResolvedValue(probeResult);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3HealthIndicator,
        HealthIndicatorService,
        {
          provide: ObjectStorageService,
          useValue: { headProbeObject: mockHeadProbe },
        },
      ],
    }).compile();

    indicator = module.get(S3HealthIndicator);
  });

  it('should report up when the probe object exists and responds within threshold', async () => {
    const result = await indicator.isHealthy();
    expect(result['s3']?.status).toBe('up');
    expect(result['s3']).toHaveProperty('responseTimeMs');
  });

  it('should report down with message when probe object is missing', async () => {
    mockHeadProbe.mockResolvedValue(undefined);

    const result = await indicator.isHealthy();
    expect(result['s3']?.status).toBe('down');
    expect(typeof result['s3']?.['message']).toBe('string');
    expect(result['s3']?.['message']).toContain('Probe object missing');
  });

  it('should report down when headProbeObject throws', async () => {
    mockHeadProbe.mockRejectedValue(new Error('Connection refused'));

    const result = await indicator.isHealthy();
    expect(result['s3']?.status).toBe('down');
    expect(result['s3']?.['message']).toBe('Connection refused');
  });
});
