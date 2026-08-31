import { expect, test } from 'vitest';
import * as target from '#support/external-target.js';

test.describe('required WebGPU runtime qualification', () => {
  test('executes WGSL and exact compute work on the promised adapter class', async ({ annotate }) => {
    const profile = target.currentWebGpuProfile();
    expect(profile).not.toBe('disabled');
    await target.navigate('/__e2e/shader-fixture?backend=common-webgl');

    const report = await target.qualifyWebGpu(profile);
    await annotate('WebGPU qualification', {
      body: `${JSON.stringify(report, null, 2)}\n`,
      // oxlint-disable-next-line unicorn/text-encoding-identifier-case -- Vitest's annotation API accepts this spelling.
      bodyEncoding: 'utf-8',
      contentType: 'application/json',
    });

    expect(report.targetUrl).not.toBe('about:blank');
    expect(report.secureContext).toBe(true);
    expect(report.browserGpuDiagnostics).toBeTruthy();
    expect(report.browserVersion).not.toBe('unknown');
    expect(report.hostPlatform).toBeTruthy();
    expect(report.adapterClass).toBe(profile);
    expect(report.deviceAvailable).toBe(true);
    expect(report.validShaderErrors).toBe(0);
    expect(report.invalidShaderErrors).toBeGreaterThan(0);
    expect(report.expectedValidationError).toBeTruthy();
    expect(report.computeReadback).toBe(42);
    expect(report.expectedDeviceLossReason).toBe('destroyed');
    expect(report.uncapturedErrors).toEqual([]);
    expect(report.qualificationErrors).toEqual([]);
  });

  test('rejects a deliberately mismatched adapter profile', async () => {
    const profile = target.currentWebGpuProfile();
    expect(profile).not.toBe('disabled');
    await target.navigate('/__e2e/shader-fixture?backend=common-webgl');

    const mismatch = profile === 'software' ? 'hardware' : 'software';
    const report = await target.qualifyWebGpu(mismatch);

    expect(report.adapterClass).toBe(profile);
    expect(report.qualificationErrors).toContain(`Expected ${mismatch} WebGPU, received ${profile} adapter.`);
  });
});
