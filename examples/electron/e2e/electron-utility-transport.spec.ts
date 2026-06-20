/**
 * Playwright `_electron` e2e for the `electronUtilityTransport`
 * (Topology C: Renderer ↔ utilityProcess kernel host).
 *
 * Conformance contract (per
 * docs/research/runtime-transport-architecture-v6.md §"Conformance
 * tests" C8):
 *
 * - Renderer mounts and exposes the same `data-testid="app-root"` surface
 *   that `render.spec.ts` exercises, so the rest of the contract
 *   (rename, bbox, glTF props) keeps reading from the same selectors.
 * - First render returns a non-empty `Geometry` payload. The transport
 *   delivers it via the wire as a structured-clone copy (Electron's
 *   `MessagePortMain` cannot transfer `ArrayBuffer` or `SharedArrayBuffer`
 *   across the renderer↔utility boundary, so the descriptor advertises
 *   `geometryDelivery: 'inline'` and `memory: 'inline'`).
 * - Renderer ↔ utility wire never carries `'main'` on the data path
 *   (main only forwards the `MessagePort` once during bootstrap).
 */

import { test, expect, _electron as electron } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const filename = fileURLToPath(import.meta.url);
const APP_ROOT = resolve(dirname(filename), '..');
const MAIN_ENTRY = resolve(APP_ROOT, 'dist/main/index.js');

test.describe('Tau Electron Example transport (Topology C)', () => {
  test('renderer mounts via electronUtilityTransport and renders a non-empty Geometry', async () => {
    const app = await electron.launch({
      args: [MAIN_ENTRY],
      cwd: APP_ROOT,
      /* The renderer gates `__taucadTransportDescriptor` behind
       * `TAU_ELECTRON_DEBUG=1` so production builds don't ship the
       * descriptor. The descriptor probe below requires the flag, so
       * launch electron with the same env that `render.spec.ts` uses. */
      env: { ...process.env, TAU_ELECTRON_DEBUG: '1' },
    });
    try {
      const window = await app.firstWindow();
      await window.waitForSelector('[data-testid="app-root"]');

      // (1) Renderer mounts.
      await expect(window.getByTestId('app-root')).toBeVisible();
      const scrollMetrics = await window.evaluate(() => {
        const scrollingElement = document.scrollingElement ?? document.documentElement;
        return {
          clientHeight: scrollingElement.clientHeight,
          clientWidth: scrollingElement.clientWidth,
          scrollHeight: scrollingElement.scrollHeight,
          scrollWidth: scrollingElement.scrollWidth,
        };
      });
      expect(scrollMetrics.scrollHeight).toBeLessThanOrEqual(scrollMetrics.clientHeight + 1);
      expect(scrollMetrics.scrollWidth).toBeLessThanOrEqual(scrollMetrics.clientWidth + 1);

      // (2) First render delivers a non-empty Geometry. The vertex
      // count is 36 (per-face duplicated for normals) and triangles
      // is 12 (2 per face × 6 faces) — matches the v5 baseline in
      // `render.spec.ts` step (4).
      await expect(window.getByTestId('count-vertices')).toHaveText('36');
      await expect(window.getByTestId('count-triangles')).toHaveText('12');

      // (3) Wire-shape probe: the renderer exposes a debug accessor
      // `__taucadTransportDescriptor` that surfaces
      // `client.transport.descriptor`. Topology C must report
      // `'electron-utility'` with copy-tier delivery (Electron
      // `MessagePortMain` cannot carry SAB or non-port transferables)
      // and `host-local` filesystem (the utility owns its own FS).
      const descriptor = await window.evaluate(
        () => (globalThis as { __taucadTransportDescriptor?: unknown }).__taucadTransportDescriptor,
      );
      expect(descriptor).toMatchObject({
        id: 'electron-utility',
        wire: 'electron-utility',
        geometryDelivery: 'copy',
        fileDelivery: 'copy',
        abortSignal: 'wire-notify',
        fileSystem: 'host-local',
      });
    } finally {
      await app.close();
    }
  });
});
