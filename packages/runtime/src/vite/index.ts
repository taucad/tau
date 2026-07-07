/**
 * Vite integrations for `@taucad/runtime` consumers.
 *
 * Barrel entry: the plugin implementations live in
 * `#vite/runtime-vite-plugins.js` (a same-package internal module resolved via
 * the `#vite/*` imports map, exactly like `#vite/ts-module-url.vite-plugin.js`)
 * so this entry stays a pure re-export. This module must NOT import from another
 * `@taucad/runtime/*` public subpath entry — the Nx Vite config-graph resolver
 * does not follow those cross-entry specifiers to their `.ts` sources; see the
 * duplication note in `runtime-vite-plugins.ts`.
 *
 * @public
 *
 * @see https://vite.dev/guide/api-plugin.html
 */

export { crossOriginIsolation, runtime } from '#vite/runtime-vite-plugins.js';
export type { RuntimePluginOptions } from '#vite/runtime-vite-plugins.js';
