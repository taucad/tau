/* oxlint-disable no-barrel-files/no-barrel-files -- Public Tau project config subpath. */
/**
 * The Tau project config: the runtime plugins a project adds to the built-in kernels.
 *
 * A project declares it in `tau.config.{ts,mts,js,mjs}` beside `tau.json`:
 *
 * ```typescript
 * import { defineConfig } from '@taucad/runtime/config';
 * import { zoo } from '@taucad/zoo';
 *
 * export default defineConfig({ plugins: [zoo()] });
 * ```
 *
 * It is a declaration a host merges into its own runtime, not a runtime: the host still owns
 * `defineRuntime`. Node hosts read it with `loadTauConfig` from `@taucad/runtime/config/node`.
 *
 * @module
 */

export { defineConfig } from '#config/tau-config.js';
export type { TauConfig } from '#config/tau-config.js';
