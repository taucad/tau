import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { reactRouter } from '@react-router/dev/vite';
import netlifyReactRouter from '@netlify/vite-plugin-react-router';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import devtoolsJson from '@silvenon/vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import mdx from 'fumadocs-mdx/vite';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
// oxlint-disable-next-line no-restricted-imports, import/extensions -- allowed for Fumadocs; .js for ESM
import * as MdxConfig from './app/lib/fumadocs/source.config.js';
import { tauRuntime } from '@taucad/runtime/vite';
import { base64Loader } from '@taucad/vite/base64-loader';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testScriptsAlias = '#scripts';

const toOriginOrRaw = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
};

const resolveBuildFrontendUrl = (environment: NodeJS.ProcessEnv): string | undefined => {
  if (environment['TAU_FRONTEND_URL']) {
    return undefined;
  }

  if (environment['NETLIFY'] !== 'true' || environment['CONTEXT'] === 'production') {
    return undefined;
  }

  return (
    toOriginOrRaw(environment['DEPLOY_PRIME_URL']) ??
    toOriginOrRaw(environment['DEPLOY_URL']) ??
    toOriginOrRaw(environment['NETLIFY_AI_GATEWAY_URL'])
  );
};

const createUiSourceAliasPlugin = (): Plugin => ({
  name: 'tau-ui-source-alias',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!source.startsWith('#')) {
      return null;
    }

    const uiRoot = `${path.resolve(__dirname)}${path.sep}`;
    if (importer !== undefined && !path.resolve(importer).startsWith(uiRoot)) {
      return null;
    }

    const [specifier, query] = source.split('?', 2);
    if (specifier === undefined) {
      return null;
    }

    const appPath = path.resolve(__dirname, 'app', specifier.slice(1));
    const candidatePaths = [appPath];
    if (specifier.endsWith('.js')) {
      const sourceBasePath = appPath.slice(0, -'.js'.length);
      candidatePaths.push(
        `${sourceBasePath}.ts`,
        `${sourceBasePath}.tsx`,
        `${sourceBasePath}.js`,
        `${sourceBasePath}.jsx`,
      );
    }

    for (const candidatePath of candidatePaths) {
      if (existsSync(candidatePath)) {
        return query === undefined ? candidatePath : `${candidatePath}?${query}`;
      }
    }

    return null;
  },
});

export default defineConfig(({ mode }) => {
  const isTest = mode === 'test';
  const isNetlify = process.env['NETLIFY'] === 'true';
  const buildFrontendUrl = resolveBuildFrontendUrl(process.env);

  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/apps/ui',
    define: {
      tauBuildFrontendUrl: JSON.stringify(buildFrontendUrl ?? ''),
      // Ordered build identity for the stale-tab skew guard (blueprint DF20).
      // Evaluated once per build / dev-server start, which is exactly the
      // granularity at which a tab's app-logic vintage can diverge.
      tauBuildId: JSON.stringify(Date.now()),
    },
    plugins: [
      createUiSourceAliasPlugin(),

      /*
       * @taucad/runtime contract: COOP/COEP for SharedArrayBuffer, keep .wasm
       * out of the inline path, and force module-worker output.
       */
      tauRuntime(),

      // Base64 Loader
      base64Loader,

      // oxlint-disable-next-line max-nested-callbacks -- vite config structure
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
      mdx(MdxConfig, {
        configPath: path.resolve(__dirname, './app/lib/fumadocs/source.config.ts'),
        outDir: path.resolve(__dirname, '../../node_modules/.cache/fumadocs/apps/ui'),
      }), // Fumadocs

      // Browser DevTools JSON plugin.
      devtoolsJson(),

      ...(process.env['STATS'] === '1'
        ? [
            visualizer({
              exclude: [{ file: '**/*?raw' }], // ignore raw files that are used for editor typings
            }),
          ]
        : []),
    ],
    worker: {
      // Workers need their own plugins.
      // https://vite.dev/config/worker-options.html#worker-plugins
      plugins: () => [createUiSourceAliasPlugin(), nxViteTsPaths()],
    },
    resolve: {
      alias: isTest ? [{ find: testScriptsAlias, replacement: path.resolve(__dirname, 'scripts') }] : [],
    },

    /*
     * Externalise only the three packages that emit sibling SSR chunks via
     * static `new URL('./<file>.js', import.meta.url)` patterns (kernel plugins,
     * worker bootstraps, middleware factories). Bundling those re-emits many
     * `build/server/assets/*` chunks SSR never executes. Other `@taucad/*`
     * packages bundle into the SSR output.
     *
     * Audit first-party sources: rg -n "new URL\(['\"]\.\..*\.(?:js|ts)['\"], import\.meta\.url\)" packages/
     */
    ssr: {
      noExternal: ['@headless-tree/core', '@headless-tree/react', 'posthog-js'],
      external: ['@taucad/runtime', '@taucad/openrscad', '@taulabs/openrscad-engine'],
    },

    server: {
      port: 3000,
      // Permit LAN previews (e.g. `nx dev ui --host`); production deploys terminate TLS upstream.
      // HTTPS is intentionally a `nx serve ui --https` concern (handled by `apps/ui/server.ts`),
      // not a `nx dev ui` concern; dev is plain HTTP regardless of TTY/--host.
      allowedHosts: true,
    },
    build: {
      /*
       * Source maps: client uses `react-router build --sourcemapClient hidden`
       * (apps/ui/project.json). Omit server maps by not passing `--sourcemapServer`
       * so the SSR `sourcemap` option stays unset (Rolldown rejects boolean `false`).
       */
      /*
       * SVGs are forced out of the base64 inline path so the icon sprite
       * pipeline can fingerprint them. `tauRuntime()` composes its WASM rule with
       * this application-owned SVG policy.
       */
      assetsInlineLimit(file) {
        if (file.endsWith('.svg')) {
          return false;
        }
        return undefined;
      },
      target: 'es2022',
    },

    test: {
      globals: true, // Required by @testing-library/jest-dom, which uses `expect` implicitly
      environment: 'jsdom',
      exclude: ['**/node_modules/**', '**/dist/**'],
      typecheck: {
        enabled: true,
        include: ['**/*.test-d.ts'],
        tsconfig: './tsconfig.spec.json',
        ignoreSourceErrors: true,
      },
      setupFiles: ['./vitest.setup.ts'],
      reporters: ['verbose'],
      coverage: {
        reportsDirectory: '../../out/reports/coverage/apps/ui',
        provider: 'v8',
        include: ['app/**/*'],
        exclude: ['app/**/*.{test,spec}.{ts,tsx}', 'app/**/index.ts'],
      },
    },
  };
});
