import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { HealthIndicatorService } from '@nestjs/terminus';
import { S3HealthIndicator } from '#api/health/s3-health.indicator.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';

const probeResult = { etag: 'abc', size: 2, contentType: 'text/plain', cacheControl: 'no-store' };

describe('S3HealthIndicator', () => {
  let indicator: S3HealthIndicator;
  let mockHeadProbe: ReturnType<typeof vi.fn>;
  let mockHeadPrivateBucket: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockHeadProbe = vi.fn().mockResolvedValue(probeResult);
    mockHeadPrivateBucket = vi.fn().mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3HealthIndicator,
        HealthIndicatorService,
        {
          provide: ObjectStorageService,
          useValue: { headProbeObject: mockHeadProbe, headPrivateBucket: mockHeadPrivateBucket },
        },
      ],
    }).compile();

    indicator = module.get(S3HealthIndicator);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should report up when the probe object and private bucket are reachable', async () => {
    const result = await indicator.isHealthy();
    expect(result['s3']?.status).toBe('up');
    expect(result['s3']).toHaveProperty('responseTimeMs');
  });

  it('should keep slow successful storage ready and reports the complete probe duration', async () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(700).mockReturnValueOnce(1200);

    const result = await indicator.isHealthy();

    expect(result['s3']).toEqual({ status: 'up', responseTimeMs: 1200 });
    const signal: unknown = mockHeadProbe.mock.calls[0]?.[0];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(mockHeadPrivateBucket).toHaveBeenCalledWith(signal);
  });

  it('should bound SDK retry backoff and abort the transport at the shared deadline', async () => {
    vi.useFakeTimers();
    const entered = Promise.withResolvers<void>();
    const settled = vi.fn();
    const handler = vi.fn(async (_request: unknown, options?: { abortSignal?: AbortSignal }) => {
      options?.abortSignal?.throwIfAborted();
      entered.resolve();
      return { response: { statusCode: 503, headers: { 'retry-after': '5' }, body: new Uint8Array() } };
    });
    const client = new S3Client({
      region: 'auto',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      maxAttempts: 2,
      requestHandler: { handle: handler },
    });
    mockHeadPrivateBucket.mockImplementation(async (signal: AbortSignal) => {
      try {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- AWS SDK command fields use PascalCase.
        await client.send(new HeadObjectCommand({ Bucket: 'test', Key: 'probe' }), { abortSignal: signal });
      } finally {
        settled();
      }
      return true;
    });

    try {
      const pending = indicator.isHealthy();
      await entered.promise;
      expect(handler).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1500);
      expect(settled).not.toHaveBeenCalled();
      expect(await pending).toEqual({ s3: { status: 'down', message: 'Storage readiness timed out after 1500 ms' } });
      const signal: unknown = mockHeadProbe.mock.calls[0]?.[0];
      expect(signal).toBeInstanceOf(AbortSignal);
      if (!(signal instanceof AbortSignal)) {
        throw new Error('Expected transport cancellation signal');
      }
      expect(signal.aborted).toBe(true);
      // The SDK may finish its retry sleep later; its rejection must remain handled.
      await vi.advanceTimersByTimeAsync(5000);
      expect(settled).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledTimes(2);
    } finally {
      client.destroy();
    }
  });

  it('should report down with message when probe object is missing', async () => {
    mockHeadProbe.mockResolvedValue(undefined);

    const result = await indicator.isHealthy();
    expect(result['s3']?.status).toBe('down');
    expect(typeof result['s3']?.['message']).toBe('string');
    expect(result['s3']?.['message']).toContain('Probe object missing');
  });

  it('should report down when the fail-closed private bucket is unprovisioned', async () => {
    mockHeadPrivateBucket.mockResolvedValue(false);

    const result = await indicator.isHealthy();
    expect(result['s3']?.status).toBe('down');
    expect(result['s3']?.['message']).toContain('Private bucket missing');
  });

  it('should report down when headProbeObject throws', async () => {
    mockHeadProbe.mockRejectedValue(new Error('Connection refused'));

    const result = await indicator.isHealthy();
    expect(result['s3']?.status).toBe('down');
    expect(result['s3']?.['message']).toBe('Connection refused');
  });
});
