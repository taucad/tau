import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { reactRouter } from '@react-router/dev/vite';
import netlifyReactRouter from '@netlify/vite-plugin-react-router';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import mdx from 'fumadocs-mdx/vite';
import svgSpriteWrapper from 'vite-svg-sprite-wrapper';
import { defineConfig } from 'vite';
// eslint-disable-next-line no-restricted-imports -- allowed for Fumadocs.
import * as MdxConfig from './app/lib/fumadocs/source.config';
// eslint-disable-next-line no-restricted-imports -- Vite plugins live outside app/.
import { crossOriginIsolation } from './vite-plugins/cross-origin-isolation.js';
// eslint-disable-next-line no-restricted-imports -- Vite plugins live outside app/.
import { tsModuleUrlPlugin } from './vite-plugins/ts-module-url.js';
// eslint-disable-next-line no-restricted-imports -- Vite plugins live outside app/.
import { base64Loader } from './vite-plugins/base64-loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Sprite generation can slow down the build time, so we disable it by default.
// Enable it when adding a new icon to regenerate the sprite.
const enableSpriteGeneration = false;

export default defineConfig(({ mode }) => {
  const isTest = mode === 'test';
  const isNetlify = process.env['NETLIFY'] === 'true';

  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/apps/ui',
    plugins: [
      // Cross-origin isolation headers for SharedArrayBuffer (multi-threaded WASM)
      crossOriginIsolation(),

      // Emit .ts files referenced via new URL() as bundled chunks (production only)
      tsModuleUrlPlugin(),

      // Base64 Loader
      base64Loader,

      ...(isTest
        ? []
        : // In non-test mode, include the React Router plugin and the Netlify plugin
          [
            reactRouter(),
            // Netlify plugin is only needed for Netlify builds
            ...(isNetlify ? [netlifyReactRouter()] : []),
          ]),
      tailwindcss(),
      // RemixPWA(), // TODO: add PWA back after https://github.com/remix-pwa/monorepo/issues/284

      // Paths - use nxViteTsPaths only (tsconfigPaths is redundant in Nx workspaces)
      nxViteTsPaths(),

      // Fumadocs
      mdx(MdxConfig, { configPath: path.resolve(__dirname, './app/lib/fumadocs/source.config.ts') }), // Fumadocs

      // Browser DevTools JSON plugin.
      devtoolsJson(),

      // This plugin visualizes the bundle size of the build.
      visualizer({
        exclude: [{ file: '**/*?raw' }], // ignore raw files that are used for editor typings
      }),

      // This plugin generates an SVG sprite to reduce the number of requests to the server.
      // An SVG sprite is a single SVG file that contains all the SVG icons,
      // inlined as <use> elements.
      // This provides better caching performance.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- allowed for quick switching of sprite generation.
      ...(enableSpriteGeneration
        ? [
            svgSpriteWrapper({
              icons: path.resolve(__dirname, './app/components/icons/raw/**/*.svg'),
              outputDir: path.resolve(__dirname, './app/components/icons/generated'),
              generateType: true,
              typeOutputDir: path.resolve(__dirname, './app/components/icons/generated'),
              // Ensure the sprite retains the original svg attributes
              sprite: { shape: {} },
            }),
          ]
        : []),
    ],
    worker: {
      // Workers need their own plugins.
      // https://vite.dev/config/worker-options.html#worker-plugins
      plugins: () => [nxViteTsPaths()],
      format: 'es',
    },

    server: {
      port: 3000,
      // TODO: set to actual domain
      allowedHosts: true,
    },
    build: {
      sourcemap: true,
      assetsInlineLimit(file) {
        if (file.endsWith('.svg')) {
          return false;
        }

        if (file.endsWith('.wasm')) {
          // WASM must not be inlined to ensure workers can cache the WASM files via Node V8 bytecode cache,
          // thus enabling WASM compilation caching to ensure fast worker startup times.
          // @see docs/research/dynamic-es-modules.md#42-the-assetsinlinelimit-callback-trap
          return false;
        }

        // Returning `undefined` sets the default 4KB threshold
        return undefined;
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
