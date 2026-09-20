import { describe, expect, test } from 'vitest';
import { server as vitestServer } from 'vitest/browser';
import type { GeoSpecPreviewResult } from '#e2e/browser-command.js';

/**
 * `BrowserCommands` reaches this file through the `vitest` copy pnpm installs for
 * `@vitest/browser-playwright`'s peer context, not the one this project resolves, so a
 * `declare module` augmentation of it never merges and every command call types as
 * `any`. Binding the command surface here is the same intersection `apps/ui-e2e` uses.
 */
const server = vitestServer as typeof vitestServer & {
  readonly commands: { runGeospecPreview(): Promise<GeoSpecPreviewResult> };
};

/**
 * The engine's browser contract, exercised the way `apps/ui`'s GeoSpec worker
 * exercises it: `@taucad/geospec-engine/register` installs the engine, and real
 * matchers execute against real geometry — in a real browser, from a real Vite
 * production build.
 */
describe('@taucad/geospec-engine in the browser', () => {
  test('registers and proves a watertight box without a Node runtime', async ({ annotate }) => {
    const result = await server.commands.runGeospecPreview();
    const { report } = result;

    if (result.serverLog) {
      await annotate('GeoSpec preview server output', {
        body: result.serverLog,
        // oxlint-disable-next-line unicorn/text-encoding-identifier-case -- Vitest's annotation API accepts this spelling.
        bodyEncoding: 'utf-8',
        contentType: 'text/plain',
      });
    }

    expect(result.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(result.headers['cross-origin-embedder-policy']).toBe('require-corp');
    expect(result.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(result.crossOriginIsolated).toBe(true);
    expect(result.sharedArrayBuffer).toBe(true);
    expect(report.error, `fixture threw: ${report.error ?? ''}`).toBeUndefined();
    expect(report.engine).toBe('@taucad/geospec-engine');
    // Capability discovery is Contract B: it reports the 24 matchers and four
    // protocol operations, never in-process host bootstrap functions.
    expect(report.capabilities).toContain('toHaveMeshIntegrity');
    expect(report.capabilities).toContain('analyzeBrep');
    expect(report.capabilities).not.toContain('createGeoSpecWebRunner');
    expect(report.capabilities).not.toContain('createGeoSpecNodeRunner');
    expect(report.capabilities).not.toContain('createNodeVmFileSystem');
    expect(report.triangles).toBe(12);
    expect(report.watertight).toBe(true);
    // The STEP row is the OCCT wasm's only browser proof: it fails the moment
    // the adapter's native entry stops resolving inside a bundle.
    expect(report.tests).toEqual([
      { name: 'proves the box mesh is watertight', status: 'passed' },
      { name: 'proves the STEP assembly is an exact BRep', status: 'passed' },
    ]);
    expect(report.worker.error).toBeUndefined();
    expect(report.worker.analysisDetached).toBe(true);
    expect(report.worker.diagnostics.map((diagnostics) => diagnostics.map(({ code }) => code))).toEqual([
      ['EXPORT_FAILED', 'GEOMETRY_INVALID'],
      ['FIRST', 'SECOND'],
      ['GEOSPEC_WATERTIGHT_MISMATCH'],
    ]);
    expect(report.worker.diagnostics[0]?.[0]).toMatchObject({
      spatial: { center: [1, 2, 3] },
      details: { file: 'gear.ts', part: 'tooth' },
    });
    expect(result.consoleErrors).toEqual([]);
    expect(result.pageErrors).toEqual([]);
  });
});
