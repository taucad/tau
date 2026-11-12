// oxlint-disable-next-line eslint/no-restricted-imports, import/no-empty-named-blocks -- Type-only augmentation import for config consumers before aliases are installed.
import type {} from '../../test/webgpu-profile.test-utils.js';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/*
 * Viewer parity capture (charter `nanoraster-viewer-parity-charter`, W6). Writes the production viewer's frame and
 * camera for each parity fixture; `libs/tau-examples` compares nanoraster against them. Inputs:
 *   PARITY_CONFIG           fixture manifest, `{ fixtures: [{ name, glb }], outDir?, backends? }`; a relative `glb` is
 *                           relative to the workspace root (default: libs/tau-examples/fixtures/viewer-parity/fixtures.json)
 *   PARITY_VIEWER_OUT       output directory (default: out/test-results/viewer-parity/viewer)
 *   PARITY_FIXTURES         comma-separated fixture names to capture (default: every fixture), for reruns and for the
 *                           CI shards, which viewer-parity.yml deals by measured capture seconds
 *   PARITY_SHARD            `<index>/<count>`: capture every count-th fixture from the index-th (1-based), for a split by count
 *   TAU_E2E_WEBGPU_PROFILE  software (SwiftShader, CI) | hardware
 *   PARITY_HEADED           1 runs Chromium headed (under xvfb-run on Linux) with --ignore-gpu-blocklist. Headless
 *                           Chromium on SwiftShader loses the WebGPU device on its first canvas present and the viewer
 *                           falls back to WebGL2; the test refuses such a capture.
 *   PARITY_CHROMIUM         Chromium executable (default: Playwright's Chromium)
 */
const webGpuProfile = process.env['TAU_E2E_WEBGPU_PROFILE'] ?? 'hardware';
if (webGpuProfile !== 'hardware' && webGpuProfile !== 'software') {
  throw new TypeError(`Unsupported TAU_E2E_WEBGPU_PROFILE: ${webGpuProfile}`);
}
const workspaceRoot = fileURLToPath(new URL('../../../../..', import.meta.url));
const manifestPath = resolve(
  workspaceRoot,
  process.env['PARITY_CONFIG'] ?? 'libs/tau-examples/fixtures/viewer-parity/fixtures.json',
);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  outDir?: string;
  fixtures: Array<{ name: string; glb: string }>;
  backends?: Array<'webgpu' | 'webgl'>;
};
const only = new Set((process.env['PARITY_FIXTURES'] ?? '').split(',').filter(Boolean));
const unknown = [...only].filter((name) => !manifest.fixtures.some((fixture) => fixture.name === name));
if (unknown.length > 0) {
  throw new TypeError(`PARITY_FIXTURES names unknown fixtures: ${unknown.join(', ')}`);
}
const shard = /^(?<index>\d+)\/(?<count>\d+)$/.exec(process.env['PARITY_SHARD'] ?? '1/1')?.groups;
const shardIndex = Number(shard?.['index']);
const shardCount = Number(shard?.['count']);
if (!(shardCount >= 1 && shardIndex >= 1 && shardIndex <= shardCount)) {
  throw new TypeError(`PARITY_SHARD must be <index>/<count> with 1 <= index <= count: ${process.env['PARITY_SHARD']}`);
}
const fixtures = manifest.fixtures
  .filter((_fixture, position) => position % shardCount === shardIndex - 1)
  .filter((fixture) => only.size === 0 || only.has(fixture.name))
  .map((fixture) => ({
    name: fixture.name,
    glb: isAbsolute(fixture.glb) ? fixture.glb : resolve(workspaceRoot, fixture.glb),
  }));
const outputDirectory = resolve(
  workspaceRoot,
  process.env['PARITY_VIEWER_OUT'] ?? manifest.outDir ?? 'out/test-results/viewer-parity/viewer',
);
const backends = manifest.backends ?? ['webgpu'];
const executablePath = process.env['PARITY_CHROMIUM'];
const headed = process.env['PARITY_HEADED'] === '1';
const fixtureDirectories = [...new Set(fixtures.map((fixture) => dirname(fixture.glb)))];

export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  plugins: [tailwindcss()],
  cacheDir: '../../node_modules/.cache/viewer-parity-capture-browser',
  resolve: { dedupe: ['react', 'react-dom', 'three'] },
  optimizeDeps: {
    include: [
      '@testing-library/react',
      '@react-three/fiber',
      'xstate',
      'react',
      'react-dom',
      'react-dom/client',
      'three',
      'three/webgpu',
    ],
  },
  server: {
    host: '127.0.0.1',
    fs: {
      allow: [workspaceRoot, outputDirectory, ...fixtureDirectories],
    },
  },
  test: {
    provide: { webGpuProfile, surfaceAa: 'on', parity: { outDir: outputDirectory, fixtures, backends } },
    include: ['src/graphics/three/viewer-parity-capture.browser.test.tsx'],
    testTimeout: 600_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: !headed,
      provider: playwright({
        launchOptions: {
          ...(executablePath ? { executablePath } : { channel: 'chromium' }),
          args: [
            '--enable-unsafe-webgpu',
            ...(webGpuProfile === 'software' ? ['--use-webgpu-adapter=swiftshader'] : []),
            ...(headed ? ['--ignore-gpu-blocklist'] : []),
          ],
        },
      }),
      instances: [{ browser: 'chromium', viewport: { width: 1024, height: 768 } }],
      screenshotDirectory: `${outputDirectory}/screenshots`,
    },
  },
});
