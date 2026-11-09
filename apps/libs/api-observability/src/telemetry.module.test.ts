import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { TelemetryModule } from '#telemetry.module.js';
import { TracerService } from '#tracer.service.js';
import { MetricsService } from '#metrics.js';

const { mockShutdown, mockStartedOtelSdk } = vi.hoisted(() => ({
  mockShutdown: vi.fn(),
  mockStartedOtelSdk: vi.fn(),
}));

vi.mock('#otel-sdk.js', () => ({
  startedOtelSdk: mockStartedOtelSdk,
}));

describe('TelemetryModule', () => {
  let module: TestingModule;
  let telemetryModule: TelemetryModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockShutdown.mockResolvedValue(undefined);
    mockStartedOtelSdk.mockReturnValue({ shutdown: mockShutdown });

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

    it('should start nothing and stop nothing when this process never started the SDK', async () => {
      mockStartedOtelSdk.mockReturnValue(undefined);
      await expect(telemetryModule.onApplicationShutdown()).resolves.toBeUndefined();
      expect(mockShutdown).not.toHaveBeenCalled();
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
