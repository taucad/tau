import path from 'node:path';
import { cpSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { tauRuntime } from '@taucad/runtime/vite';
import { base64Loader } from '@taucad/vite/base64-loader';
/*
 * Extensionless and relative on purpose: the `#` alias only reaches `app/`, an
 * `.mjs`-style `.js` specifier has no file to resolve to at config-load time,
 * and a `.ts` specifier needs `allowImportingTsExtensions`. Sharing the web
 * plugin beats duplicating 40 lines that would then drift.
 */
// oxlint-disable-next-line eslint/no-restricted-imports, import/extensions -- see above.
import { createUiReactCompilerPlugin, createUiSourceAliasPlugin, uiResolveAlias, uiSsrOptions } from '../vite.config';
// oxlint-disable-next-line eslint/no-restricted-imports, import/extensions -- config-load seam is outside the app alias root.
import { resolveTauCloudBuildEnabled } from '../build-environment';
// oxlint-disable-next-line eslint/no-restricted-imports, import/extensions -- Shared config-load asset gate.
import { createGeoSpecMtAssets } from '../geospec-mt-assets.vite-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// oxlint-disable-next-line eslint/dot-notation -- ProcessEnv is index-signature-only with noPropertyAccessFromIndexSignature.
const tauCloudEnabled = resolveTauCloudBuildEnabled(process.env['TAU_CLOUD_ENABLED']);
const mtAssets = createGeoSpecMtAssets(process.env['GEOSPEC_MT_STAGED_PACKAGE_ROOT']);

/** Copy public display assets only for the actual client output, keeping native resources outside the SPA. */
const createDesktopStaticAssetsPlugin = (): Plugin => ({
  name: 'vite:desktop-static-assets',
  apply: 'build',
  // Vite prepares/empties output in renderStart(pre); copy before generated files are written.
  renderStart: {
    order: 'post',
    handler() {
      const { config } = this.environment;
      if (config.consumer !== 'client' || !config.build.write) {
        return;
      }
      const publicRoot = config.publicDir;
      if (!publicRoot) {
        throw new Error('Desktop client build requires its public asset directory.');
      }
      const nativeSubtree = 'assets/engines/replicad/density-single-v1';
      const nativeInput = path.join(publicRoot, nativeSubtree);
      // These are the fixed delivered closure, not a consumer-selectable asset registry.
      // Finish preflight before mutation; keep the copy owned by this hook invocation.
      for (const name of [
        'replicad_single.wasm',
        'replicad_single.mjs',
        'provenance.json',
        'LICENSE',
        'LICENSE.OCCT-Exception',
        'LICENSE.Replicad',
        'NOTICE',
      ]) {
        const entry = statSync(path.join(nativeInput, name));
        if (!entry.isFile() || entry.size === 0) {
          throw new Error(`Missing desktop native resource: ${name}`);
        }
      }
      const clientOutDirectory = path.resolve(config.root, config.build.outDir);
      const nativeClientOutput = path.join(clientOutDirectory, nativeSubtree);
      const nativeHostOutput = path.join(
        path.dirname(clientOutDirectory),
        'host-assets/engines/replicad/density-single-v1',
      );
      rmSync(nativeClientOutput, { recursive: true, force: true });
      cpSync(publicRoot, clientOutDirectory, { recursive: true, filter: (source) => source !== nativeInput });
      rmSync(nativeHostOutput, { recursive: true, force: true });
      cpSync(nativeInput, nativeHostOutput, { recursive: true });
    },
  },
});

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
    tauCloudBuildEnabled: JSON.stringify(tauCloudEnabled),
    tauGeoSpecMtReceipts: JSON.stringify(mtAssets.receipts),
    // oxlint-disable-next-line @typescript-eslint/naming-convention -- Vite define key is a member expression.
    'import.meta.env.TAU_TARGET': '"desktop"',
  },
  plugins: [
    createDesktopStaticAssetsPlugin(),
    mtAssets.plugin,
    createUiSourceAliasPlugin({
      emitModuleGraph: true,
      target: 'desktop',
      tauCloudEnabled,
    }),
    tauRuntime(),
    base64Loader,
    createUiReactCompilerPlugin(),
    reactRouter(),
    tailwindcss(),
  ],
  worker: {
    // https://vite.dev/config/worker-options.html#worker-plugins
    plugins: () => [createUiSourceAliasPlugin({ emitModuleGraph: true, target: 'desktop', tauCloudEnabled })],
  },
  resolve: { alias: [...uiResolveAlias] },
  ssr: uiSsrOptions,
  server: {
    // 3000 is the web dev server; 3001 keeps both runnable side by side.
    port: 3001,
    fs: { allow: [path.resolve(__dirname, '../../..')] },
  },
  build: {
    copyPublicDir: false,
    assetsInlineLimit(file) {
      if (file.endsWith('.svg')) {
        return false;
      }
      return undefined;
    },
    target: 'es2022',
  },
});
