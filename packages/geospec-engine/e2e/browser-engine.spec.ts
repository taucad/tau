import { expect, test } from '@playwright/test';

type BrowserEngineReport = {
  engine: string;
  capabilities: string[];
  triangles: number;
  watertight: boolean;
  tests: Array<{ name: string; status: string }>;
  error?: string;
};

/**
 * The engine's browser contract, exercised the way `apps/ui`'s GeoSpec worker
 * exercises it: `@taucad/geospec-engine/register` installs the engine, and real
 * matchers execute against real geometry — in a real browser, from a real Vite
 * production build.
 */
test.describe('@taucad/geospec-engine in the browser', () => {
  test('registers and proves a watertight box without a Node runtime', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await page.goto('/');
    await expect(page.getByTestId('report')).not.toBeEmpty({ timeout: 120_000 });

    const report = await page.evaluate<BrowserEngineReport>(
      () => (globalThis as typeof globalThis & { __geospecBrowserReport: BrowserEngineReport }).__geospecBrowserReport,
    );

    expect(report.error, `fixture threw: ${report.error ?? ''}`).toBeUndefined();
    expect(report.engine).toBe('@taucad/geospec-engine');
    // Capability discovery is Contract B: it reports the 23 matchers and four
    // protocol operations, never in-process host bootstrap functions.
    expect(report.capabilities).toContain('toHaveMeshIntegrity');
    expect(report.capabilities).toContain('analyzeBrep');
    expect(report.capabilities).not.toContain('createGeoSpecWebRunner');
    expect(report.capabilities).not.toContain('createGeoSpecNodeRunner');
    expect(report.capabilities).not.toContain('createNodeVmFileSystem');
    expect(report.triangles).toBe(12);
    expect(report.watertight).toBe(true);
    expect(report.tests).toEqual([{ name: 'proves the box mesh is watertight', status: 'passed' }]);
    expect(consoleErrors).toEqual([]);
  });
});
