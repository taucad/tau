import { readFileSync } from 'node:fs';
import process from 'node:process';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
// oxlint-disable-next-line no-restricted-imports -- Vitest config bootstraps this server-side command before test aliases exist.
import { uiBrowserCommands } from './src/support/browser-command.ts';
// oxlint-disable-next-line no-restricted-imports -- Vitest config owns the browser launch profile before aliases exist.
import { resolveRequiredWebGpuProfile, webGpuLaunchArguments } from './src/support/webgpu-profile.ts';

const isCi = Boolean(process.env['CI']);
const browserChannel = process.env['TAU_E2E_BROWSER_CHANNEL'] ?? 'chromium';
if (browserChannel !== 'chromium' && browserChannel !== 'chrome') {
  throw new Error(`TAU_E2E_BROWSER_CHANNEL must be 'chromium' or 'chrome'; received '${browserChannel}'.`);
}
const requiredWebGpuProfile = resolveRequiredWebGpuProfile(process.env['TAU_E2E_WEBGPU_PROFILE']);
const chromiumArguments = ['--enable-automation', ...webGpuLaunchArguments(requiredWebGpuProfile)];
const chromiumDisabledArguments = ['--enable-automation', ...webGpuLaunchArguments('disabled')];
/** The opt-in specs that spend real provider credit; excluded from every default run. */
const liveProviderSpecs = ['src/gemini-browser-agent-host.live.spec.ts', 'src/provider-switch.live.spec.ts'];
const liveProvidersEnabled = process.env['TAU_E2E_LIVE_GEMINI'] === 'true';
/**
 * The agent-host specs run only in `test:e2e:browser-host` and `test:e2e:daemon-host`, which set
 * `TAU_E2E_HOST_TIER`, so each spec runs in exactly one CI target (north star P7).
 */
const hostSpecs = [
  'src/browser-agent-host.spec.ts',
  'src/chat-isolated-workspace.spec.ts',
  'src/chat-questions.spec.ts',
  'src/chat-todo-list.spec.ts',
  'src/daemon-agent-host.spec.ts',
];
const hostExcluded = process.env['TAU_E2E_HOST_TIER'] === 'true' ? [] : hostSpecs;
/* Only the snapshot production server honours TAU_E2E_DISABLE_COI (`production-server.ts`): the
 * development server and `apps/ui/server.ts` stay isolated, so the specs would assert a
 * non-isolated page against an isolated one. Refuse the combination instead. */
const disableCoi = process.env['TAU_E2E_DISABLE_COI'] === 'true';
const snapshotServer =
  process.env['TAU_E2E_SERVER_MODE'] !== 'development' && process.env['TAU_E2E_UI_SNAPSHOT'] === 'true';
if (disableCoi && !snapshotServer) {
  throw new Error(
    'TAU_E2E_DISABLE_COI=true needs the snapshot production server: set TAU_E2E_UI_SNAPSHOT=true and leave TAU_E2E_SERVER_MODE unset.',
  );
}
/* DP18: the exact STL and GLB bytes every host must export for `picovoxel.sphere-minus-beams`, read
 * from the pins tau-examples owns (runtime-e2e asserts the same pins in Node). */
type ExactPin = { readonly sha256: string; readonly bytes: number };
const picovoxelExactPins = (
  JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../libs/tau-examples/src/kernels/picovoxel/exact-pins.json'), 'utf8'),
  ) as { readonly 'sphere-minus-beams': { readonly stl: ExactPin; readonly glb: ExactPin } }
)['sphere-minus-beams'];

export default defineConfig({
  root: import.meta.dirname,
  optimizeDeps: { include: ['axe-core', 'jszip', 'zod', 'esbuild'] },
  resolve: {
    alias: [
      {
        find: /^#support\/(.*)\.js$/u,
        replacement: `${resolve(import.meta.dirname, 'src/support')}/$1.ts`,
      },
    ],
  },
  test: {
    attachmentsDir: resolve(import.meta.dirname, '../../out/test-results/vitest-browser/apps/ui-e2e/attachments'),
    coverage: {
      reportsDirectory: '../../out/reports/coverage/apps/ui-e2e',
    },
    include: ['src/**/*.spec.ts'],
    exclude: ['src/global-setup-preflight.spec.ts'],
    globalSetup: [resolve(import.meta.dirname, 'global-setup.ts')],
    setupFiles: [resolve(import.meta.dirname, 'src/support/test-lifecycle.ts')],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    retry: isCi ? 2 : 0,
    fileParallelism: false,
    provide: {
      crossOriginIsolation: !disableCoi,
      picovoxelExactPins,
      scaleCpuDiagnostic: process.env['TAU_E2E_SCALE_CPU_DIAGNOSTIC'] === '1',
    },
    browser: {
      enabled: true,
      headless: true,
      // Artifact requirement: browser-side evidence writes and child-context trace attachments need Vitest write access.
      api: { allowWrite: true },
      provider: playwright({ actionTimeout: 10_000 }),
      commands: uiBrowserCommands,
      screenshotFailures: false,
      screenshotDirectory: resolve(
        import.meta.dirname,
        '../../out/test-results/vitest-browser/apps/ui-e2e/screenshots',
      ),
      instances: [
        {
          browser: 'chromium',
          name: 'chromium',
          exclude: [
            'src/headless-chat-image-capture.no-webgpu.spec.ts',
            ...(liveProvidersEnabled ? [] : liveProviderSpecs),
            ...hostExcluded,
          ],
          provider: playwright({
            actionTimeout: 10_000,
            launchOptions: {
              args: [...chromiumArguments],
              channel: browserChannel,
            },
          }),
          provide: {
            webGpuProfile: requiredWebGpuProfile,
            acpLiveEnabled: process.env['TAU_ACP_LIVE_TESTS'] === 'true',
          },
        },
        {
          browser: 'chromium',
          name: 'chromium-no-webgpu',
          include: ['src/headless-chat-image-capture.no-webgpu.spec.ts'],
          provider: playwright({
            actionTimeout: 10_000,
            launchOptions: {
              args: [...chromiumDisabledArguments],
              channel: browserChannel,
            },
          }),
          provide: { webGpuProfile: 'disabled' },
        },
        {
          browser: 'chromium',
          name: 'chromium-touch',
          include: ['src/revision-ux-visual-matrix.spec.ts'],
          provider: playwright({
            actionTimeout: 10_000,
            contextOptions: { hasTouch: true, isMobile: true },
            launchOptions: {
              args: [...chromiumArguments],
              channel: browserChannel,
            },
          }),
          provide: { webGpuProfile: requiredWebGpuProfile },
        },
        {
          browser: 'firefox',
          name: 'firefox',
          include: [
            'src/browser-agent-host.spec.ts',
            'src/chat-isolated-workspace.spec.ts',
            'src/picovoxel-multi.spec.ts',
            'src/remote-host.spec.ts',
          ],
          exclude: hostExcluded,
        },
        {
          browser: 'webkit',
          name: 'webkit-smoke',
          include: [
            'src/preview.spec.ts',
            'src/birdhouse-preview.spec.ts',
            'src/browser-agent-host.spec.ts',
            'src/project-creation-location-unsupported.spec.ts',
            'src/chat-isolated-workspace.spec.ts',
            'src/picovoxel-multi.spec.ts',
            'src/remote-host.spec.ts',
          ],
          exclude: hostExcluded,
        },
      ],
    },
  },
});
