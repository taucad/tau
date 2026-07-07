/**
 * Implementation for the `@taucad/runtime/vite` entry. Kept in this sibling
 * module (imported by `index.ts` via the same-package `#vite/*` map, exactly
 * like `#vite/ts-module-url.vite-plugin.js`) so the entry stays a pure barrel.
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

import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { tsModuleUrlPlugin } from '#vite/ts-module-url.vite-plugin.js';

const wasmAssetsInlineLimit = (filePath: string): false | undefined => (filePath.endsWith('.wasm') ? false : undefined);
const nodeRuntimeExternals = ['esbuild', 'esbuild-wasm'] as const;

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
export function crossOriginIsolation(): Plugin {
  const applyHeaders = (server: ViteDevServer | PreviewServer): void => {
    server.middlewares.use((_request, response, next) => {
      for (const [name, value] of Object.entries(documentHeaders)) {
        response.setHeader(name, value);
      }
      next();
    });
  };

  return {
    name: 'taucad-runtime:cross-origin-isolation',
    configureServer: applyHeaders,
    configurePreviewServer: applyHeaders,
  };
}

/**
 * Options for the {@link runtime} Vite plugin.
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
 * - bundles TypeScript files referenced via `new URL(..., import.meta.url)`
 *   as module chunks instead of raw `.ts` assets
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
 * import { runtime } from '@taucad/runtime/vite';
 * import { defineConfig } from 'vite';
 *
 * export default defineConfig({
 *   plugins: [runtime()],
 * });
 * ```
 */
export function runtime(options: RuntimePluginOptions = {}): Plugin[] {
  const { crossOriginIsolation: includeCoi = true } = options;

  const invariants: Plugin = {
    name: 'taucad-runtime:invariants',
    enforce: 'pre',
    config: () => ({
      build: {
        assetsInlineLimit: wasmAssetsInlineLimit,
      },
      worker: {
        format: 'es',
      },
      ssr: {
        external: [...nodeRuntimeExternals],
      },
    }),
  };

  const plugins = [...tsModuleUrlPlugin(), invariants];
  return includeCoi ? [crossOriginIsolation(), ...plugins] : plugins;
}
