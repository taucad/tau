import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reactRouter } from '@react-router/dev/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { tauRuntime } from '@taucad/runtime/vite';
import { base64Loader } from '@taucad/vite/base64-loader';
/*
 * Extensionless and relative on purpose, exactly as the desktop config does:
 * the `#` alias only reaches `app/`, an `.mjs`-style `.js` specifier has no
 * file to resolve to at config-load time, and a `.ts` specifier needs
 * `allowImportingTsExtensions`.
 */
// oxlint-disable-next-line eslint/no-restricted-imports, import/extensions -- see above.
import { createUiReactCompilerPlugin, createUiSourceAliasPlugin, uiSsrOptions } from '../vite.config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Serve build of `apps/ui` — the SPA a daemon hands to a browser.
 *
 * The same web plugin list minus the two host-specific plugins the desktop
 * build also drops: `netlifyReactRouter()` (no Netlify deploy target) and
 * `devtoolsJson()` (a dev-server convenience). Everything else is kept in step
 * with `../vite.config.ts`: divergence between the three builds is the failure
 * mode this seam exists to avoid.
 *
 * Tailwind's automatic source detection is rooted at the Vite `root`, which
 * moves down one directory here exactly as it does for desktop. The candidate
 * set is pinned by the `@source` directives in `app/styles/global.css`, which
 * are relative to *that file* and therefore already cover `apps/ui/app` for
 * every build — see the comment there.
 */
export default defineConfig({
  root: __dirname,
  // `publicDir` is resolved against `root`, which moved down one directory.
  publicDir: '../public',
  cacheDir: '../../../node_modules/.vite/apps/ui-serve',
  define: {
    // No Netlify deploy-preview origin exists for a daemon-served bundle.
    tauBuildFrontendUrl: JSON.stringify(''),
    tauBuildId: JSON.stringify(Date.now()),
    /* Not `desktop`: `isDesktopTarget()` must fold to `false` here, or the
     * bundle takes the Electron preload's ENV and IPC paths in a plain tab. */
    // oxlint-disable-next-line @typescript-eslint/naming-convention -- Vite define key is a member expression.
    'import.meta.env.TAU_TARGET': '"web"',
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
    // 3000 is the web dev server and 3001 the desktop one.
    port: 3002,
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
