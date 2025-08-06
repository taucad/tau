import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reactRouter } from '@react-router/dev/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import devtoolsJson from 'vite-plugin-devtools-json';
import tsconfigPaths from 'vite-tsconfig-paths';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
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
    if (query !== 'base64' || !path) {
      return;
    }

    const data = fs.readFileSync(path);
    const base64 = data.toString('base64');

    return `export default '${base64}';`;
  },
};

export default defineConfig(({ mode }) => {
  const isTest = mode === 'test';

  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/apps/ui',
    plugins: [
      base64Loader,
      // Only include React Router plugin for non-test modes
      ...(isTest ? [] : [reactRouter()]),
      nxViteTsPaths(),
      tsconfigPaths(),
      // RemixPWA(), // TODO: add PWA back after https://github.com/remix-pwa/monorepo/issues/284
      tailwindcss(),
      devtoolsJson(),
      visualizer({
        exclude: [{ file: '**/*?raw' }], // ignore raw files that are used for editor typings
      }),
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
      plugins: () => [nxViteTsPaths(), tsconfigPaths()],
      format: 'es',
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
      globals: true, // Required by @testing-library/jest-dom, which uses `expect` implicitly
      environment: 'jsdom',
      typecheck: {
        enabled: true,
        include: ['**/*.test-d.ts'],
        tsconfig: './tsconfig.spec.json',
        ignoreSourceErrors: true,
      },
      setupFiles: ['./vitest.setup.ts'],
      reporters: ['verbose'],
      coverage: {
        reportsDirectory: '../../coverage/apps/ui',
        provider: 'v8',
        include: ['app/**/*'],
        exclude: ['app/**/*.{test,spec}.{ts,tsx}', 'app/**/index.ts'],
      },
    },
  };
});
