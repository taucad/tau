import { expect, test } from '@playwright/test';

type GeoSpecProbeResult = {
  result?: {
    success?: boolean;
    passed?: number;
    total?: number;
    failures?: Array<{ reason?: string }>;
  };
};

test('produces GLB evidence through both real workers', async ({ page }) => {
  test.setTimeout(180_000);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const outdatedDependency = page
      .waitForResponse((response) => response.status() === 504 && response.url().includes('/node_modules/.vite/'), {
        timeout: 15_000,
      })
      /* oxlint-disable-next-line promise/prefer-await-to-then -- start the response waiter before navigation. */
      .then(
        () => true,
        () => false,
      );
    /* oxlint-disable-next-line eslint/no-await-in-loop -- optimizer retries must navigate sequentially. */
    await page.goto('/__e2e/geospec-runner');
    /* oxlint-disable-next-line eslint/no-await-in-loop -- each navigation races its own response/navigation waiters. */
    const stale = await Promise.race([
      outdatedDependency,
      page.waitForURL(/\/w\/[^/]+\/[^/]+/u, { timeout: 15_000 }).then(
        () => false,
        () => false,
      ),
    ]);
    if (!stale) {
      break;
    }
  }
  await expect(page).toHaveURL(/\/w\/[^/]+\/[^/]+/u, { timeout: 60_000 });

  await page.waitForFunction(
    () => {
      const globals = globalThis as Record<string, unknown>;
      const ready = globals['__tauGeoSpecReady'] as (() => boolean) | undefined;
      return typeof globals['__tauRunGeoSpec'] === 'function' && ready?.() === true;
    },
    { timeout: 60_000 },
  );

  const probe = await page.evaluate(async (): Promise<GeoSpecProbeResult> => {
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
