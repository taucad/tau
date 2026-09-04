import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reactRouter } from '@react-router/dev/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { tauRuntime } from '@taucad/runtime/vite';
import { base64Loader } from '@taucad/vite/base64-loader';
/*
 * Extensionless and relative on purpose: the `#` alias only reaches `app/`, an
 * `.mjs`-style `.js` specifier has no file to resolve to at config-load time,
 * and a `.ts` specifier needs `allowImportingTsExtensions`. Sharing the web
 * plugin beats duplicating 40 lines that would then drift.
 */
// oxlint-disable-next-line eslint/no-restricted-imports, import/extensions -- see above.
import { createUiReactCompilerPlugin, createUiSourceAliasPlugin, uiSsrOptions } from '../vite.config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Desktop (Electron) build of `apps/ui`.
 *
 * Deliberately the web plugin list minus the two host-specific plugins:
 * `netlifyReactRouter()` (targets Netlify Functions, which the desktop bundle
 * has no deploy target for) and `devtoolsJson()` (a dev-server convenience
 * that serves `/.well-known/appspecific/...` from an origin the shell does not
 * use). Everything else is kept in step with `../vite.config.ts` on purpose —
 * divergence between the two builds is the failure mode this seam exists to
 * avoid.
 */
export default defineConfig({
  root: __dirname,
  // `publicDir` is resolved against `root`, which moved down one directory.
  publicDir: '../public',
  cacheDir: '../../../node_modules/.vite/apps/ui-desktop',
  define: {
    // No Netlify deploy-preview origin exists for a desktop bundle.
    tauBuildFrontendUrl: JSON.stringify(''),
    tauBuildId: JSON.stringify(Date.now()),
    // oxlint-disable-next-line @typescript-eslint/naming-convention -- Vite define key is a member expression.
    'import.meta.env.TAU_TARGET': '"desktop"',
  },
  plugins: [
    createUiSourceAliasPlugin(),
    tauRuntime(),
    base64Loader,
    createUiReactCompilerPlugin(),
    reactRouter(),
    tailwindcss(),
    nxViteTsPaths(),
  ],
  worker: {
    // https://vite.dev/config/worker-options.html#worker-plugins
    plugins: () => [createUiSourceAliasPlugin(), nxViteTsPaths()],
  },
  ssr: uiSsrOptions,
  server: {
    // 3000 is the web dev server; 3001 keeps both runnable side by side.
    port: 3001,
    fs: { allow: [path.resolve(__dirname, '../../..')] },
  },
  build: {
    assetsInlineLimit(file) {
      if (file.endsWith('.svg')) {
        return false;
      }
      return undefined;
    },
    target: 'es2022',
  },
});
