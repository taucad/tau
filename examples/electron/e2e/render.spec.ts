/**
 * Playwright `_electron` smoke + validation test for the Electron example
 * (TR8 / R11 + p1-electron-validate-rename + p1-electron-validate-bbox).
 *
 * What this asserts end-to-end against a real Electron build:
 *
 * 1. The main process launches and the renderer surface mounts.
 * 2. Renaming the OpenSCAD parameter (`len` → `length`) updates the
 *    parameters-form label live (p1-electron-validate-rename).
 * 3. Changing the cube parameter value updates the displayed glTF
 *    bounding-box dimensions (p1-electron-validate-bbox).
 * 4. The standard glTF properties (asset, mesh / vertex / triangle
 *    counts) are surfaced alongside the bbox.
 *
 * Run order: `pnpm nx build example-electron` then `pnpm nx test:e2e
 * example-electron` (Playwright drives the built app via `_electron`).
 */

import { test, expect, _electron as electron } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');
const MAIN_ENTRY = resolve(APP_ROOT, 'dist/main/index.js');

test.describe('Tau Electron Example end-to-end', () => {
  test('rename `len` -> `length` updates the parameters-form label, and changing the value updates the bbox', async () => {
    const app = await electron.launch({
      args: [MAIN_ENTRY],
      cwd: APP_ROOT,
      /* Forward debug-log env to main + utility processes so failures
       * surface the boot-sequence trail instead of an empty stream. */
      env: { ...process.env, TAU_ELECTRON_DEBUG: '1', NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    /* Surface stderr + renderer console output on failure — without this
     * the only signal a Playwright timeout produces is "selector not
     * found", which collapses every failure mode (kernel boot crash,
     * missing preload bridge, COEP block) into the same vague message. */
    const appLog: string[] = [];
    const proc = app.process();
    proc.stderr?.on('data', (chunk: Uint8Array<ArrayBuffer>) => appLog.push(`[main:stderr] ${chunk.toString()}`));
    proc.stdout?.on('data', (chunk: Uint8Array<ArrayBuffer>) => appLog.push(`[main:stdout] ${chunk.toString()}`));
    try {
      const window = await app.firstWindow();
      window.on('console', (message) => {
        const line = `[renderer:${message.type()}] ${message.text()}\n`;
        appLog.push(line);
        if (process.env['TAU_ELECTRON_DEBUG'] === '1') {
          process.stdout.write(line);
        }
      });
      window.on('pageerror', (error) => {
        const line = `[renderer:pageerror] ${error.message}\n${error.stack ?? ''}\n`;
        appLog.push(line);
        if (process.env['TAU_ELECTRON_DEBUG'] === '1') {
          process.stdout.write(line);
        }
      });
      if (process.env['TAU_ELECTRON_DEBUG'] === '1') {
        proc.stderr?.on('data', (chunk: Uint8Array<ArrayBuffer>) =>
          process.stdout.write(`[main:stderr] ${chunk.toString()}`),
        );
        proc.stdout?.on('data', (chunk: Uint8Array<ArrayBuffer>) =>
          process.stdout.write(`[main:stdout] ${chunk.toString()}`),
        );
      }
      await window.waitForSelector('[data-testid="app-root"]');

      /* (1) Initial state — `len` is the only param. The OpenSCAD
       * source declares a 200-unit cube; the kernel emits glTF in
       * meters per the glTF 2.0 spec, so a 200mm cube renders as a
       * 0.200m bounding box. */
      await expect(window.getByTestId('param-label-len')).toHaveText('len');
      await expect(window.getByTestId('bbox-size')).toHaveText('[0.200, 0.200, 0.200]');

      /* (2) Rename `len` -> `length` in the editor. The parameters form
       * must reflect the rename without an explicit re-parse trigger. */
      const editor = window.getByTestId('editor');
      await editor.fill('length=200;\ncube(length);\n');
      await expect(window.getByTestId('param-label-length')).toHaveText('length');
      await expect(window.getByTestId('param-label-len')).toHaveCount(0);

      /* (3) Change `length` from 200 to 400 — bbox must double along
       * every axis (0.200m → 0.400m). */
      await window.getByTestId('param-input-length').fill('400');
      await expect(window.getByTestId('bbox-size')).toHaveText('[0.400, 0.400, 0.400]');

      /* (4) Standard glTF properties surfaced. The runtime stamps
       * itself as the glTF generator (e.g. `@taucad/runtime@<version>`)
       * so we assert on the prefix rather than the exact version. The
       * cube ships 36 vertices (per-face duplicated for normals/UVs)
       * and 12 triangles (2 per face × 6 faces). */
      await expect(window.getByTestId('asset-version')).toHaveText('2.0');
      await expect(window.getByTestId('asset-generator')).toContainText('@taucad/runtime');
      await expect(window.getByTestId('count-vertices')).toHaveText('36');
      await expect(window.getByTestId('count-triangles')).toHaveText('12');
    } catch (error) {
      const fs = await import('node:fs');
      fs.writeFileSync('/tmp/tau-electron-e2e-debug.log', appLog.join(''));
      console.error('--- electron app log ---');
      console.error(appLog.join(''));
      console.error('--- end electron app log ---');
      try {
        const probeWindow = await app.firstWindow();
        const probe = await probeWindow.evaluate(() => ({
          taucad: typeof (globalThis as { taucad?: unknown }).taucad,
          keys: Object.keys(globalThis).filter((k) => k.toLowerCase().includes('tau')),
          href: location.href,
        }));
        console.error('--- renderer probe ---');
        console.error(JSON.stringify(probe, null, 2));
        console.error('--- end renderer probe ---');
      } catch (error) {
        console.error('renderer probe failed:', error);
      }
      throw error;
    } finally {
      const fs = await import('node:fs');
      fs.writeFileSync('/tmp/tau-electron-e2e-debug.log', appLog.join(''));
      await app.close();
    }
  });
});
