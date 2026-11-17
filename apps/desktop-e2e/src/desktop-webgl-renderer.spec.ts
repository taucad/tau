/* eslint-disable @typescript-eslint/naming-convention -- WebGL constants and GPU feature keys keep their wire names. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, expect, test } from 'vitest';

import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';

/**
 * Measurement, not a gate on any one renderer (Windows readiness R5): which WebGL the packaged app's renderer gets on
 * this host. A hosted Windows runner has no GPU, so Chromium may fall back to WARP (Direct3D's software rasteriser
 * through ANGLE), to SwiftShader, or to nothing. The CAD viewer needs WebGL 2, so the row fails only when the renderer
 * has none; the rest is written to `out/test-results/desktop-e2e/webgl-renderer.json` and the job summary for the
 * readiness record.
 */
const reportPath = join(import.meta.dirname, '../../../out/test-results/desktop-e2e/webgl-renderer.json');

let session: DesktopSession | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
});

test('records the WebGL renderer the packaged app gets on this host', async () => {
  session = await launchDesktopApp({
    token: 'unused',
    packaged: true,
    env: { TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE: '1' },
  });
  const renderer = await session.page.evaluate(() => {
    const describe = (kind: 'webgl' | 'webgl2') => {
      const canvas = document.createElement('canvas');
      const context = kind === 'webgl2' ? canvas.getContext('webgl2') : canvas.getContext('webgl');
      if (!context) {
        return { available: false } as const;
      }
      const debug = context.getExtension('WEBGL_debug_renderer_info');
      return {
        available: true,
        version: String(context.getParameter(context.VERSION)),
        vendor: String(context.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : context.VENDOR)),
        renderer: String(context.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : context.RENDERER)),
        maxTextureSize: Number(context.getParameter(context.MAX_TEXTURE_SIZE)),
      } as const;
    };
    return { webgl: describe('webgl'), webgl2: describe('webgl2'), webgpu: 'gpu' in navigator };
  });
  const gpu = await session.application.evaluate(async ({ app }) => ({
    featureStatus: app.getGPUFeatureStatus(),
    info: await app.getGPUInfo('basic'),
  }));
  const report = {
    platform: process.platform,
    arch: process.arch,
    runner: process.env['RUNNER_NAME'] ?? null,
    image: process.env['ImageOS'] ?? null,
    imageVersion: process.env['ImageVersion'] ?? null,
    measuredAt: new Date().toISOString(),
    renderer,
    gpu,
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`WebGL renderer report: ${JSON.stringify({ renderer, featureStatus: gpu.featureStatus })}`);
  expect(renderer.webgl2.available, 'The CAD viewer needs WebGL 2').toBe(true);
}, 300_000);
