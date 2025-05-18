import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reactRouter } from '@react-router/dev/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import tsconfigPaths from 'vite-tsconfig-paths';
import tailwindcss from '@tailwindcss/vite';
// Import viteSvgSpriteWrapper from 'vite-svg-sprite-wrapper';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * A simple plugin to load files as base64 strings.
 *
 * The data encoding for url() imports is not supplied.
 */
const base64Loader: Plugin = {
  name: 'base64-loader',
  transform(_, id) {
    const [path, query] = id.split('?');
    if (query !== 'base64') return;

    const data = fs.readFileSync(path);
    const base64 = data.toString('base64');

    return `export default '${base64}';`;
  },
};

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/ui',
  plugins: [
    base64Loader,
    reactRouter(),
    nxViteTsPaths(),
    tsconfigPaths(),
    // RemixPWA(), // TODO: add PWA back after https://github.com/remix-pwa/monorepo/issues/284
    tailwindcss(),
    // TODO: add back after fixing the recrusive reload issue.
    // ViteSvgSpriteWrapper({
    //   icons: path.resolve(__dirname, './app/components/icons/raw/**/*.svg'),
    //   outputDir: path.resolve(__dirname, './app/components/icons/generated'),
    //   generateType: true,
    //   typeOutputDir: path.resolve(__dirname, './app/components/icons/generated'),
    //   // Ensure the sprite retains the original svg attributes
    //   sprite: { shape: {} },
    // }),
  ],
  worker: {
    // Workers need their own plugins.
    // https://vite.dev/config/worker-options.html#worker-plugins
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- false positive
    plugins: () => [nxViteTsPaths(), tsconfigPaths()],
  },

  server: {
    port: 3000,
    // TODO: set to actual domain
    allowedHosts: true,
  },
  build: {
    assetsInlineLimit(file) {
      // Don't inline SVGs
      return !file.endsWith('.svg');
    },
    target: 'es2022',
  },

  test: {
    setupFiles: [],
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['./tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/ui',
      provider: 'v8',
    },
  },
});
