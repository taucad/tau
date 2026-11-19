import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { tauRuntime } from '@taucad/runtime/vite';
import { base64Loader } from '@taucad/vite/base64-loader';
/*
 * Extensionless and relative on purpose, exactly as the desktop config does:
 * the `#` alias only reaches `app/`, an `.mjs`-style `.js` specifier has no
 * file to resolve to at config-load time, and a `.ts` specifier needs
 * `allowImportingTsExtensions`.
 */
/* oxlint-disable eslint/no-restricted-imports, import/extensions -- see above. */
import {
  createUiReactCompilerPlugin,
  createUiSourceAliasPlugin,
  uiBuildTarget,
  uiResolveAlias,
  uiSsrOptions,
} from '../vite.config';
/* oxlint-enable eslint/no-restricted-imports, import/extensions */
// oxlint-disable-next-line eslint/no-restricted-imports, import/extensions -- Shared config-load asset gate.
import { createGeoSpecMtAssets } from '../geospec-mt-assets.vite-plugin';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vite configuration runs outside the app alias resolver.
import { createPicogkBrowserAssets } from '../picogk-browser-assets.vite-plugin.js';
// oxlint-disable-next-line eslint/no-restricted-imports, import/extensions -- Shared config-load asset gate.
import { createCsharpLanguageAssets } from '../csharp-language-assets.vite-plugin';
// oxlint-disable-next-line eslint/no-restricted-imports, import/extensions -- Shared config-load asset gate.
import { createOpenscadLanguageAssets } from '../openscad-language-assets.vite-plugin';
// oxlint-disable-next-line eslint/no-restricted-imports, import/extensions -- Shared config-load integrity plugin.
import { createAssetIntegrity } from '../asset-integrity.vite-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mtAssets = createGeoSpecMtAssets(process.env['GEOSPEC_MT_STAGED_PACKAGE_ROOT']);
const picogkAssets = createPicogkBrowserAssets(process.env['PICOGK_BROWSER_ASSETS_ROOT']);
const csharpAssets = createCsharpLanguageAssets(path.resolve(__dirname, '../../../out/csharp-language/stage'));
const openscadLanguage = createOpenscadLanguageAssets(path.resolve(__dirname, '../../../out/openscad-language/stage'));

/**
 * Where a `tau serve` page fetches the cadmpeg engines (cadmpeg engine delivery charter D12, W6): the daemon mounts the
 * installed `cadmpeg-ts` engine directory here, same-origin, so the build carries no engine and the page works with no
 * network. `@taucad/cadmpeg` fetches `<path><id>_bg.wasm` and verifies it against `cadmpeg-ts/digests`.
 */
const cadmpegEnginesPath = '/cadmpeg-engines/';

/* The `cadmpeg-ts` this build bundles the glue of: the one `@taucad/cadmpeg` resolves. */
const cadmpegTs = createRequire(createRequire(import.meta.url).resolve('@taucad/cadmpeg/package.json'));
const cadmpegTsVersion = (
  JSON.parse(readFileSync(cadmpegTs.resolve('cadmpeg-ts/package.json'), 'utf8')) as { readonly version: string }
).version;
const { digests: cadmpegDigests } = (await import(pathToFileURL(cadmpegTs.resolve('cadmpeg-ts/digests')).href)) as {
  readonly digests: Readonly<
    Record<string, { readonly wasm: { readonly sha256: string; readonly byteLength: number } }>
  >;
};

/**
 * Write `cadmpeg-engines.json` at the client root: the `cadmpeg-ts` version and engine digests this build expects, and
 * the path it fetches them from. `tau serve` reads it to mount its installed engines there, and refuses to when its
 * own `cadmpeg-ts` differs (EQ1 option A, `packages/cli/src/serve-engines.ts`).
 */
const cadmpegEnginesManifest: Plugin = {
  name: 'tau:serve-cadmpeg-engines-manifest',
  apply: 'build',
  generateBundle() {
    if (this.environment.name !== 'client') {
      return;
    }
    this.emitFile({
      type: 'asset',
      fileName: 'cadmpeg-engines.json',
      source: `${JSON.stringify(
        {
          schemaVersion: 1,
          package: 'cadmpeg-ts',
          version: cadmpegTsVersion,
          path: cadmpegEnginesPath,
          modules: Object.fromEntries(Object.entries(cadmpegDigests).map(([id, digest]) => [id, digest.wasm])),
        },
        undefined,
        2,
      )}\n`,
    });
  },
};

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
    /* Never reported: a `tau serve` bundle composes no runtime telemetry reporter. */
    tauBuildRelease: JSON.stringify(''),
    /* A `tau serve` bundle is never a Tau Cloud host, whatever `TAU_TELEMETRY_HOST` says. */
    tauTelemetryHostCloudBuild: 'false',
    tauGeoSpecMtReceipts: JSON.stringify(mtAssets.receipts),
    tauPicogkBrowserAssets: picogkAssets.assets ? JSON.stringify(picogkAssets.assets) : 'undefined',
    tauCsharpLanguageAssets: JSON.stringify(csharpAssets.assets ?? null),
    /* The `@taucad/cadmpeg` engines option of this build: the daemon's same-origin mount, in the package layout. */
    tauCadmpegEngines: JSON.stringify({ baseUrl: cadmpegEnginesPath, layout: 'package' }),
    /* Not `desktop`: `isDesktopTarget()` must fold to `false` here, or the
     * bundle takes the Electron preload's ENV and IPC paths in a plain tab. */
    ...uiBuildTarget('web').define,
  },
  plugins: [
    mtAssets.plugin,
    picogkAssets.plugin,
    csharpAssets.plugin,
    openscadLanguage.plugin,
    cadmpegEnginesManifest,
    /* A `tau serve` bundle pins `self-host`, whatever `TAU_CLOUD_ENABLED` says (adaptive app deployment mode D12). */
    createUiSourceAliasPlugin({ emitModuleGraph: true, deploymentCeiling: 'self-host' }),
    createAssetIntegrity({ receipt: true }),
    tauRuntime(),
    base64Loader,
    createUiReactCompilerPlugin(),
    reactRouter(),
    tailwindcss(),
  ],
  worker: {
    // https://vite.dev/config/worker-options.html#worker-plugins
    plugins: () => [
      createUiSourceAliasPlugin({ emitModuleGraph: true, deploymentCeiling: 'self-host' }),
      createAssetIntegrity({ receipt: false }),
    ],
  },
  // The same browser stubs as the web and desktop builds (`@resvg/resvg-js`).
  resolve: { alias: [...uiResolveAlias] },
  // The server environment's own `resolve`, where the Environment API reads it (the web config's `uiSsrOptions`).
  environments: { ssr: { resolve: { ...uiSsrOptions } } },
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
