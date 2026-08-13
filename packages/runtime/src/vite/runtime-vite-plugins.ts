/**
 * Implementation for the `@taucad/runtime/vite` entry. Kept in this sibling
 * module (imported by `index.ts` via the same-package `#vite/*` map) so the
 * entry stays a pure barrel.
 *
 * The canonical header set and the WASM asset-inline callback are still
 * duplicated here (as tiny frozen values) rather than imported from
 * `../cross-origin-isolation/index.js` or `../runtime-invariants.js`: the Vite
 * config graph resolver that Nx uses to analyse `vite.config.ts` consumers does
 * not follow specifiers back to `.ts` sources across the runtime's *public
 * subpath entries*, so this module must not import from another
 * `@taucad/runtime/*` entry. Parity with the canonical modules is enforced by
 * `runtime.test.ts`.
 *
 * @see https://vite.dev/guide/api-plugin.html
 */

import type { Plugin, PreviewServer, ResolvedConfig, ViteDevServer } from 'vite';
import { runtimeSsrAssetsPlugin } from '#vite/runtime-ssr-assets.vite-plugin.js';

/**
 * Version-neutral public shape of a Vite plugin returned by Tau factories.
 * Hook types remain internal so consumers can use the same factory with every
 * supported Vite major without importing Tau's development-time Vite types.
 *
 * @public
 */
export type RuntimeVitePlugin = {
  readonly name: string;
};

type AssetsInlineLimit = ResolvedConfig['build']['assetsInlineLimit'];
type AssetContent = Parameters<Exclude<AssetsInlineLimit, number | boolean>>[1];
const gitLfsPrefix = new TextEncoder().encode('version https://git-lfs.github.com');

const isGitLfsPlaceholder = (content: AssetContent): boolean =>
  content.length >= gitLfsPrefix.length && gitLfsPrefix.every((byte, index) => content[index] === byte);

const withWasmInlineInvariant =
  (consumerLimit: AssetsInlineLimit): AssetsInlineLimit =>
  (filePath, content): boolean | undefined => {
    if (filePath.endsWith('.wasm')) {
      return false;
    }
    if (typeof consumerLimit === 'function') {
      return consumerLimit(filePath, content);
    }
    return !isGitLfsPlaceholder(content) && content.length < Number(consumerLimit);
  };
const nodeRuntimeExternals = ['esbuild', 'esbuild-wasm'] as const;
const browserNodeBuiltinSources = new Set(['fs', 'node:fs', 'node:fs/promises', 'node:url']);
const browserNodeBuiltinId = '\0taucad-runtime:browser-node-builtins';
const browserNodeBuiltinModule = `
const unavailable = (name) => () => {
  throw new Error('Node ' + name + '() is unavailable in a browser runtime. A Node-only code path was executed in the client graph.');
};
export const fileURLToPath = unavailable('url.fileURLToPath');
export const readFile = unavailable('fs.readFile');
export const readFileSync = unavailable('fs.readFileSync');
export const writeFileSync = unavailable('fs.writeFileSync');
export const promises = { readFile };
export default { promises, readFile, readFileSync, writeFileSync };
`;

const browserNodeBuiltins = (): Plugin => ({
  name: 'taucad-runtime:browser-node-builtins',
  enforce: 'pre',
  resolveId(source) {
    if (this.environment.config.consumer === 'client' && browserNodeBuiltinSources.has(source)) {
      return browserNodeBuiltinId;
    }
    return null;
  },
  load(id) {
    return id === browserNodeBuiltinId ? browserNodeBuiltinModule : null;
  },
});

const documentHeaders: Readonly<Record<string, string>> = Object.freeze({
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
});

/**
 * Vite plugin that sets the canonical cross-origin isolation headers on every
 * dev and preview server response. Required for `SharedArrayBuffer` (used by
 * multi-threaded OpenCASCADE, the file pool, the geometry pool, and the
 * signal-buffer abort channel).
 *
 * Uses `configureServer` middleware (not `server.headers`) so headers apply
 * to all responses including those served by framework plugins like React
 * Router SSR.
 *
 * @returns A Vite `Plugin` that registers the isolation middleware.
 *
 * @public
 *
 * @see https://github.com/vitejs/vite/issues/3909#issuecomment-934044912
 *
 * @example <caption>Register the plugin in vite.config.ts</caption>
 * ```typescript
 * import { crossOriginIsolation } from '@taucad/runtime/vite';
 * import { defineConfig } from 'vite';
 *
 * export default defineConfig({
 *   plugins: [crossOriginIsolation()],
 * });
 * ```
 */
export function crossOriginIsolation(): RuntimeVitePlugin {
  const applyHeaders = (server: ViteDevServer | PreviewServer): void => {
    server.middlewares.use((_request, response, next) => {
      for (const [name, value] of Object.entries(documentHeaders)) {
        response.setHeader(name, value);
      }
      next();
    });
  };

  const plugin: Plugin = {
    name: 'taucad-runtime:cross-origin-isolation',
    configureServer: applyHeaders,
    configurePreviewServer: applyHeaders,
  };
  return plugin;
}

/**
 * Options for the {@link tauRuntime} Vite plugin.
 *
 * @public
 */
export type RuntimePluginOptions = {
  /**
   * Skip the cross-origin-isolation middleware. Set to `false` when the host
   * already serves COOP/COEP headers (e.g. via Express middleware or platform
   * headers). Defaults to `true`.
   */
  readonly crossOriginIsolation?: boolean;
};

/**
 * One-line Vite integration for `@taucad/runtime` consumers. Bundles every
 * non-negotiable invariant the runtime requires:
 *
 * - registers {@link crossOriginIsolation} (toggleable via
 *   {@link RuntimePluginOptions.crossOriginIsolation})
 * - prevents `.wasm` assets from being inlined as base64 (kills V8 caching
 *   and breaks Worker bootstrap)
 * - forces `worker.format: 'es'` so workers preserve `import.meta.url`
 * - emits runtime-owned static assets in SSR/Electron builds
 * - keeps native Node runtime helpers such as `esbuild` external in SSR /
 *   Electron utility builds so they can resolve their package-owned binaries
 *
 * Any consumer that needs to override these invariants should compose their
 * own plugin set; this helper exists to remove the gap between "install
 * `@taucad/runtime`" and "it works".
 *
 * @param options - Optional toggles for the bundled invariants.
 *
 * @returns An array of Vite plugins implementing the runtime contract.
 *
 * @public
 *
 * @example <caption>Drop-in usage in vite.config.ts</caption>
 * ```typescript
 * import { tauRuntime } from '@taucad/runtime/vite';
 * import { defineConfig } from 'vite';
 *
 * export default defineConfig({
 *   plugins: [tauRuntime()],
 * });
 * ```
 */
export function tauRuntime(options: RuntimePluginOptions = {}): RuntimeVitePlugin[] {
  const { crossOriginIsolation: includeCoi = true } = options;

  const invariants: Plugin = {
    ...browserNodeBuiltins(),
    name: 'taucad-runtime:invariants',
    config: () => ({
      worker: {
        format: 'es',
        plugins: () => [browserNodeBuiltins()],
      },
      ssr: {
        external: [...nodeRuntimeExternals],
      },
    }),
    configResolved(config) {
      config.build.assetsInlineLimit = withWasmInlineInvariant(config.build.assetsInlineLimit);
    },
  };

  const plugins = [runtimeSsrAssetsPlugin(), invariants];
  return includeCoi ? [crossOriginIsolation(), ...plugins] : plugins;
}
