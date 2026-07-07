/**
 * Rolldown integration for `@taucad/runtime` consumers.
 *
 * Mirrors the invariants of `@taucad/runtime/vite` (`runtime()`) for projects
 * that build with Rolldown directly (e.g. `tsdown` / library bundles) rather
 * than Vite. Both plugins consume the same shared `runtime-invariants.ts`
 * module so consumer behaviour is identical regardless of bundler.
 *
 * @public
 *
 * @see docs/research/runtime-zero-config-bundling.md (R6)
 */

import type { ExternalOption, InputOptions, OutputOptions, Plugin } from 'rolldown';

import { runtimePackages, wasmBearingDeps } from '#vite/runtime-invariants.js';

/**
 * Set of every package that must remain external when a Rolldown consumer
 * bundles their app on top of `@taucad/runtime`. Bundling these copies their
 * `new URL(literal, import.meta.url)` asset references into the consumer
 * bundle, breaking the resolved URLs and 404'ing every WASM/font fetch.
 */
const externalPackages: ReadonlySet<string> = new Set<string>([...runtimePackages, ...wasmBearingDeps]);

const isExternalPackage = (id: string): boolean => {
  if (externalPackages.has(id)) {
    return true;
  }
  for (const package_ of externalPackages) {
    if (id.startsWith(`${package_}/`)) {
      return true;
    }
  }
  return false;
};

const mergeExternal = (existing: ExternalOption | undefined): ExternalOption => {
  if (typeof existing === 'function') {
    return (id, parentId, isResolved) => {
      const previous = existing(id, parentId, isResolved);
      if (previous === true) {
        return true;
      }
      return isExternalPackage(id) || undefined;
    };
  }
  if (Array.isArray(existing)) {
    return [...existing, ...externalPackages];
  }
  if (existing === undefined) {
    return [...externalPackages];
  }
  return [existing, ...externalPackages];
};

/**
 * Options for the {@link runtime} Rolldown plugin.
 *
 * @public
 */
export type RuntimePluginOptions = {
  /**
   * Force the output format to ESM. Workers and asset references rely on
   * `import.meta.url`, which is only valid in ESM output. Defaults to `true`.
   */
  readonly forceEsmOutput?: boolean;
};

/**
 * One-line Rolldown integration for `@taucad/runtime` consumers. Adds the
 * runtime and every WASM-bearing dependency to the bundle's `external`
 * array, and forces ESM output so `import.meta.url` survives the build.
 *
 * @param options - Optional toggles for the bundled invariants.
 *
 * @returns A Rolldown `Plugin` implementing the runtime contract.
 *
 * @public
 *
 * @example <caption>Drop-in usage in rolldown.config.ts</caption>
 * ```typescript
 * import { runtime } from '@taucad/runtime/rolldown';
 * import { defineConfig } from 'rolldown';
 *
 * export default defineConfig({
 *   plugins: [runtime()],
 * });
 * ```
 */
export function runtime(options: RuntimePluginOptions = {}): Plugin {
  const { forceEsmOutput = true } = options;

  return {
    name: 'taucad-runtime:invariants',
    options(input: InputOptions): InputOptions {
      return { ...input, external: mergeExternal(input.external) };
    },
    outputOptions(output: OutputOptions): OutputOptions | undefined {
      if (!forceEsmOutput) {
        return undefined;
      }
      return { ...output, format: 'es' };
    },
  };
}
