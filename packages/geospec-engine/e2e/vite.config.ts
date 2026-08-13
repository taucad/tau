import { fileURLToPath } from 'node:url';
import { tauRuntime } from '@taucad/runtime/vite';
import { defineConfig } from 'vite';

/**
 * Builds the browser fixture with the same plugin set `apps/ui` uses, so this
 * suite fails on exactly the bundling regressions the app would hit — most
 * importantly a Node-only module reachable from
 * `@taucad/geospec-engine/register`.
 */
export default defineConfig({
  root: fileURLToPath(new URL('fixture', import.meta.url)),
  plugins: [...tauRuntime()],
  build: {
    outDir: fileURLToPath(new URL('dist-fixture', import.meta.url)),
    emptyOutDir: true,
    target: 'esnext',
  },
  preview: {
    port: 4330,
    strictPort: true,
  },
});
