/**
 * Rolldown integration for `@taucad/runtime` consumers.
 *
 * Mirrors the invariants of `@taucad/runtime/vite` (`tauRuntime()`) for projects
 * that build with Rolldown directly (e.g. `tsdown` / library bundles) rather
 * than Vite. Both plugins consume the same shared `runtime-invariants.ts`
 * module so consumer behaviour is identical regardless of bundler.
 *
 * @public
 *
 * @see docs/research/runtime-zero-config-bundling.md (R6)
 */

export { tauRuntime } from '#rolldown/runtime-plugin.js';
export type { RuntimePluginOptions } from '#rolldown/runtime-plugin.js';
