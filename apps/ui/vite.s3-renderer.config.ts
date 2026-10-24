import path from 'node:path';
import { defineConfig } from 'vite';

/**
 * S3 renderer comparison harness build (Q3, D18). Local-only: an optimized
 * production bundle of `s3-renderer-harness.html` into `out/s3-renderer/app`,
 * served by the desktop fixture under Tau's `app://` protocol and CSP. It
 * shares nothing with the product build and ships in no package.
 */
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  publicDir: false,
  cacheDir: '../../node_modules/.vite/s3-renderer',
  logLevel: 'warn',
  build: {
    outDir: path.resolve(import.meta.dirname, '../../out/s3-renderer/app'),
    emptyOutDir: true,
    target: 'es2024',
    sourcemap: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: { index: path.resolve(import.meta.dirname, 's3-renderer-harness.html') },
    },
  },
});
