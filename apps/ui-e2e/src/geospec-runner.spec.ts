import { expect, test } from 'vitest';
import * as target from '#support/external-target.js';

type GeoSpecProbeResult = {
  result?: {
    success?: boolean;
    passed?: number;
    total?: number;
    failures?: Array<{ reason?: string }>;
  };
};

test('produces GLB evidence through both real workers', async () => {
  await target.navigate('/__e2e/geospec-runner');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  await target.waitFor(
    () => {
      const globals = globalThis as Record<string, unknown>;
      const ready = globals['__tauGeoSpecReady'] as (() => boolean) | undefined;
      return typeof globals['__tauRunGeoSpec'] === 'function' && ready?.() === true;
    },
    undefined,
    { timeout: 60_000 },
  );

  const probe = await target.evaluate(async (): Promise<GeoSpecProbeResult> => {
    const run = (globalThis as Record<string, unknown>)['__tauRunGeoSpec'] as
      | ((args?: Record<string, unknown>) => Promise<GeoSpecProbeResult>)
      | undefined;
    if (!run) {
      throw new Error('GeoSpec browser probe was not installed.');
    }
    return run({ files: ['main.geospec.ts'] });
  });

  expect(probe.result).toMatchObject({ success: true, passed: 2, total: 2, failures: [] });
  expect(JSON.stringify(probe)).not.toContain('Filesystem bridge protocol version mismatch');
});
