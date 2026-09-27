import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reactRouter } from '@react-router/dev/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import tailwindcss from '@tailwindcss/vite';
import mdx from 'fumadocs-mdx/vite';
import { defineConfig } from 'vite';
// oxlint-disable-next-line no-restricted-imports, import/extensions -- Vite loads the Fumadocs config before app aliases are active.
import * as MdxConfig from './app/lib/fumadocs/source.config.js';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const isNxGraphCreation =
  (globalThis as typeof globalThis & { NX_GRAPH_CREATION?: boolean }).NX_GRAPH_CREATION === true;

export default defineConfig({
  root: projectRoot,
  cacheDir: '../../node_modules/.vite/apps/docs',
  plugins: [
    // Nx resolves every Vite config concurrently while creating the project graph.
    // React Router stores its app directory globally, so a second instance can make
    // the existing UI app discover this app's routes. The task process still loads it.
    ...(isNxGraphCreation ? [] : [reactRouter()]),
    tailwindcss(),
    nxViteTsPaths(),
    mdx(MdxConfig, {
      configPath: path.resolve(projectRoot, 'app/lib/fumadocs/source.config.ts'),
      outDir: path.resolve(projectRoot, '../../node_modules/.cache/fumadocs/apps/docs'),
    }),
  ],
  build: {
    target: 'es2022',
  },
  ssr: {
    external: ['fumadocs-mdx'],
  },
  server: {
    allowedHosts: true,
    port: 3002,
  },
});
