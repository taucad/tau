import { resolve } from 'node:path';

import { playwright } from '@vitest/browser-playwright';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    tauBundlerReportPath: JSON.stringify(
      resolve(
        import.meta.dirname,
        '../../../out/reports/runtime-telemetry/bundler-core-parity/browser-compiler-rolldown.json',
      ),
    ),
  },
  plugins: [nxViteTsPaths()],
  optimizeDeps: {
    include: [
      '@gltf-transform/core',
      '@gltf-transform/extensions',
      '@gltf-transform/functions',
      'cdn-resolve',
      'culori',
      'deepmerge',
      'es-module-lexer',
      'esbuild-wasm',
      'replicad',
      'source-map-js',
      'uint8array-extras',
    ],
    noDiscovery: true,
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  },
  test: {
    include: ['src/bundler-engine.benchmark.test.ts'],
    testTimeout: 900_000,
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      api: { allowWrite: true },
      provider: playwright({ actionTimeout: 120_000, launchOptions: { channel: 'chrome' } }),
      instances: [{ browser: 'chromium', name: 'rolldown-benchmark-isolated' }],
    },
  },
});
