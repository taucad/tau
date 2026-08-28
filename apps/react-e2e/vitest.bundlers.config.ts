import { resolve } from 'node:path';

import { playwright } from '@vitest/browser-playwright';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { tauRuntime } from '@taucad/runtime/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: resolve(import.meta.dirname, 'apps/react-router'),
  plugins: [nxViteTsPaths(), tauRuntime({ crossOriginIsolation: true })],
  optimizeDeps: {
    include: [
      '@gltf-transform/core',
      '@gltf-transform/extensions',
      '@gltf-transform/functions',
      '@taucad/rolldown > @rolldown/browser',
      'cdn-resolve',
      'culori',
      'deepmerge',
      'es-module-lexer',
      'esbuild-wasm',
      'replicad',
      'replicad-opencascadejs/multi/init',
      'replicad-opencascadejs/single/init',
      'source-map-js',
      'uint8array-extras',
    ],
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  },
  test: {
    include: ['app/bundlers.browser.test.ts'],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ actionTimeout: 120_000, launchOptions: { channel: 'chrome' } }),
      instances: [{ browser: 'chromium', name: 'bundlers-isolated' }],
    },
  },
});
