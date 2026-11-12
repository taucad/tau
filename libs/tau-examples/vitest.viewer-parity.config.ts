import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { tauRuntime } from '@taucad/runtime/vite';
import { defineConfig } from 'vitest/config';
import type { ViewerParityNanorasterEntry } from '#scripts/viewer-parity.js';
import {
  readViewerParityManifest,
  resolveFixturePath,
  resolveViewerParityNanorasterEntry,
} from '#scripts/viewer-parity.js';

/*
 * Viewer parity gate (Tau Brain `research/nanoraster-viewer-parity-charter.md`, W6): nanoraster against the viewer
 * references `viewer:capture:viewer-parity` writes, through both nanoraster builds Tau ships. Two projects, in order:
 *   1. `wasm` (Chromium, group 1): nanoraster's universal entry renders every fixture through its WASM build on the
 *      page's WebGPU, as the web app's image worker does, and writes the PNGs.
 *   2. `gate` (Node, group 2): nanoraster's native addon renders every fixture, and the gate scores both builds.
 * Inputs are documented in scripts/viewer-parity.gate.test.ts. The WASM pass also reads:
 *   TAU_E2E_WEBGPU_PROFILE  software (SwiftShader, CI) | hardware (default)
 *   PARITY_CHROMIUM         Chromium executable (default: Playwright's Chromium)
 *   PARITY_HEADED           1 runs Chromium headed with --ignore-gpu-blocklist, as the real-GPU check
 *                           (scripts/viewer-parity-hardware.sh) does on macOS, where the viewer capture is headed too
 */
const webGpuProfile = process.env['TAU_E2E_WEBGPU_PROFILE'] ?? 'hardware';
if (webGpuProfile !== 'hardware' && webGpuProfile !== 'software') {
  throw new TypeError(`Unsupported TAU_E2E_WEBGPU_PROFILE: ${webGpuProfile}`);
}
const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const manifest = readViewerParityManifest(
  fileURLToPath(new URL('fixtures/viewer-parity/fixtures.json', import.meta.url)),
);
const only = new Set((process.env['PARITY_FIXTURES'] ?? '').split(',').filter(Boolean));
const fixtures = manifest.fixtures
  .filter((fixture) => only.size === 0 || only.has(fixture.name))
  .map((fixture) => ({ name: fixture.name, glb: resolveFixturePath(workspaceRoot, fixture) }));
const viewerDirectory = resolve(
  workspaceRoot,
  process.env['PARITY_VIEWER_OUT'] ?? 'out/test-results/viewer-parity/viewer',
);
const outDirectory = resolve(workspaceRoot, process.env['PARITY_OUT'] ?? 'out/test-results/viewer-parity/nanoraster');
/*
 * Tooling such as knip loads this config too, so an installed nanoraster the gate refuses fails the WASM pass when it
 * runs, not the config.
 */
const resolveWasmEntry = (): ViewerParityNanorasterEntry | Readonly<{ unavailable: string }> => {
  try {
    return resolveViewerParityNanorasterEntry({ workspaceRoot, backend: 'wasm' });
  } catch (error) {
    return { unavailable: error instanceof Error ? error.message : String(error) };
  }
};
const wasm = resolveWasmEntry();
const executablePath = process.env['PARITY_CHROMIUM'];
const headed = process.env['PARITY_HEADED'] === '1';

export default defineConfig({
  test: {
    reporters: ['verbose'],
    projects: [
      {
        // The web app's bundling of runtime packages: package-owned WASM such as `@taucad/image`'s resvg.
        plugins: [tauRuntime()],
        cacheDir: '../../node_modules/.cache/tau-examples-viewer-parity-wasm',
        server: {
          host: '127.0.0.1',
          fs: {
            allow: [
              workspaceRoot,
              ...('entry' in wasm ? [dirname(dirname(wasm.entry))] : []),
              viewerDirectory,
              outDirectory,
              ...new Set(fixtures.map((fixture) => dirname(fixture.glb))),
            ],
          },
        },
        test: {
          name: 'wasm',
          include: ['scripts/viewer-parity.wasm.browser.test.ts'],
          sequence: { groupOrder: 1 },
          provide: { viewerParityWasm: { ...wasm, viewerDirectory, outDirectory, fixtures } },
          testTimeout: 300_000,
          hookTimeout: 120_000,
          fileParallelism: false,
          browser: {
            enabled: true,
            // The renderer reads its frames back from an offscreen target and never presents, so headless SwiftShader
            // WebGPU keeps its device (the viewer capture, which presents to a canvas, needs a headed browser). The
            // real-GPU check runs headed on request, so the WASM build binds the same GPU the viewer capture did.
            headless: !headed,
            provider: playwright({
              launchOptions: {
                ...(executablePath ? { executablePath } : { channel: 'chromium' }),
                args: [
                  '--enable-unsafe-webgpu',
                  ...(webGpuProfile === 'software'
                    ? [
                        '--use-webgpu-adapter=swiftshader',
                        '--use-angle=swiftshader',
                        '--enable-features=Vulkan',
                        '--use-vulkan=swiftshader',
                      ]
                    : []),
                  ...(headed ? ['--ignore-gpu-blocklist'] : []),
                ],
              },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        cacheDir: '../../node_modules/.cache/tau-examples-viewer-parity',
        test: {
          name: 'gate',
          environment: 'node',
          include: ['scripts/viewer-parity.gate.test.ts'],
          sequence: { groupOrder: 2 },
          testTimeout: 300_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
