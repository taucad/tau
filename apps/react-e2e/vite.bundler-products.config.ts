import { resolve } from 'node:path';

import { tauRuntime } from '@taucad/runtime/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  root: resolve(import.meta.dirname, 'apps/react-router/bundler-benchmark'),
  plugins: [tauRuntime({ crossOriginIsolation: true })],
  resolve: {
    alias: {
      '#benchmark-bundler': resolve(
        import.meta.dirname,
        `apps/react-router/bundler-benchmark/bundler-${mode === 'rolldown' ? 'rolldown' : 'esbuild'}.ts`,
      ),
    },
  },
  build: {
    target: 'esnext',
    sourcemap: true,
  },
  preview: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  },
}));
