import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { TelemetryModule } from '#telemetry.module.js';
import { TracerService } from '#tracer.service.js';
import { MetricsService } from '#metrics.js';

const mockShutdown = vi.fn();

vi.mock('#otel.js', () => ({
  sdk: { shutdown: mockShutdown },
}));

describe('TelemetryModule', () => {
  let module: TestingModule;
  let telemetryModule: TelemetryModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockShutdown.mockResolvedValue(undefined);

    module = await Test.createTestingModule({
      imports: [TelemetryModule],
    }).compile();

    telemetryModule = module.get(TelemetryModule);
  });

  it('should provide TracerService', () => {
    expect(module.get(TracerService)).toBeInstanceOf(TracerService);
  });

  it('should provide MetricsService', () => {
    expect(module.get(MetricsService)).toBeInstanceOf(MetricsService);
  });

  describe('onApplicationShutdown', () => {
    it('should call sdk.shutdown()', async () => {
      await telemetryModule.onApplicationShutdown();
      expect(mockShutdown).toHaveBeenCalledOnce();
    });

    it('should not throw when sdk.shutdown() resolves', async () => {
      await expect(telemetryModule.onApplicationShutdown()).resolves.toBeUndefined();
    });

    it('should not throw when sdk.shutdown() rejects', async () => {
      mockShutdown.mockRejectedValueOnce(new Error('shutdown failed'));
      await expect(telemetryModule.onApplicationShutdown()).resolves.toBeUndefined();
    });

    it('should not hang when sdk.shutdown() stalls (timeout protection)', { timeout: 10_000 }, async () => {
      mockShutdown.mockImplementation(
        async () =>
          new Promise<void>((resolve) => {
            setTimeout(resolve, 60_000);
          }),
      );

      const start = Date.now();
      await telemetryModule.onApplicationShutdown();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(8000);
    });
  });
});
