import { describe, expect, test } from 'vitest';
import { server } from 'vitest/browser';

const zipLocalFileHeader = [0x50, 0x4b, 0x03, 0x04];

/**
 * `.scad` → USDZ on both engine payloads.
 *
 * The browser half runs the WebAssembly build in a real Chromium, from a real
 * Vite production build of a fixture that wires `openrscad()` and `assimp()`
 * into a web worker exactly as `apps/ui` does. The native half runs the N-API
 * addon in the Vitest process over the same `.scad` file and the same plugins.
 * Both USDZ archives are round-tripped back to GLB by the same importer, so the
 * geometry comparison isolates the backend and nothing else.
 */
describe('@taucad/openrscad USDZ export', () => {
  test('should produce equivalent USDZ geometry from the browser WebAssembly build and the native addon', async ({
    annotate,
  }) => {
    const result = await server.commands.runOpenrscadUsdzParity();

    if (result.serverLog) {
      await annotate('OpenRSCAD preview server output', {
        body: result.serverLog,
        // oxlint-disable-next-line unicorn/text-encoding-identifier-case -- Vitest's annotation API accepts this spelling.
        bodyEncoding: 'utf-8',
        contentType: 'text/plain',
      });
    }

    // Both artifacts in the run's own record, so a CI failure is diagnosable
    // from the report rather than only from the assertion that tripped.
    await annotate(`USDZ artifacts: ${JSON.stringify({ browser: result.browser, native: result.native })}`);

    expect(result.browserError, `fixture threw: ${result.browserError ?? ''}`).toBeUndefined();
    const { browser, native } = result;
    expect(browser, `browser logs: ${result.browserLogs.join(' | ')}`).toBeDefined();
    if (!browser) {
      throw new Error('The browser fixture produced no USDZ.');
    }

    // Which engine payload each host bound. Without these the suite would pass
    // on a host that ran the same build twice.
    expect(browser.backend, `browser logs: ${result.browserLogs.join(' | ')}`).toBe('wasm');
    expect(native.backend, `native logs: ${result.nativeLogs.join(' | ')}`).toBe('native');

    // A browser bundle that reaches the N-API loader or a Node builtin has
    // resolved the wrong condition of `@taulabs/openrscad-engine`.
    expect(result.nodeOnlyBundleHits).toEqual([]);

    for (const artifact of [browser, native]) {
      expect(artifact.zipMagic).toEqual(zipLocalFileHeader);
      expect(artifact.firstEntryName).toMatch(/\.usd[ac]?$/u);
      expect(artifact.roundtrip.primitives).toBeGreaterThan(0);
      expect(artifact.roundtrip.modes.every((mode) => mode === 4)).toBe(true);
      expect(artifact.roundtrip.triangles).toBeGreaterThan(1000);
    }

    /*
     * The two engine builds are held byte-identical per release by
     * `src/native-wasm-parity.test.ts`, so the meshes entering USD are the same
     * mesh. Assimp's own encoder is the only step that differs between the
     * hosts, which is why this compares triangle counts exactly and bounds to a
     * micrometre rather than comparing the archives byte for byte.
     */
    expect(browser.roundtrip.triangles).toBe(native.roundtrip.triangles);
    for (let axis = 0; axis < 3; axis++) {
      expect(browser.roundtrip.bounds.min[axis]).toBeCloseTo(native.roundtrip.bounds.min[axis], 6);
      expect(browser.roundtrip.bounds.max[axis]).toBeCloseTo(native.roundtrip.bounds.max[axis], 6);
    }

    expect(result.consoleErrors).toEqual([]);
    expect(result.pageErrors).toEqual([]);
  });
});
