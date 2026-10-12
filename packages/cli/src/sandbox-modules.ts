import { registerHooks } from 'node:module';

/**
 * Native addons the runtime graph imports at module load but calls only for work the runtime child never does.
 *
 * `sharp` arrives through `@gltf-transform/functions` → `ndarray-pixels`, whose Node build imports it eagerly for
 * gltf-transform's texture functions (resize, compress, palette) alone; the geometry transforms the kernels use never
 * reach it.
 */
const deferredAddons = new Set(['sharp']);

const refusingModuleUrl = (specifier: string): string => {
  const message = `${specifier} is a native addon, and the Tau Host runtime child runs without --allow-addons.`;
  return `data:text/javascript,${encodeURIComponent(
    `export default function ${specifier}() { throw new Error(${JSON.stringify(message)}); }`,
  )}`;
};

/**
 * Let the runtime graph load where Node refuses native addons.
 *
 * The built child runs under `--permission` without `--allow-addons` (`runtime-child-supervisor.ts` in
 * `@taucad/host`), so loading an addon throws `ERR_DLOPEN_DISABLED`, and an eager import of one fails the whole graph
 * before the child can serve anything. While addons are refused, each deferred addon resolves to a module that throws
 * only when called. Must run before the runtime imports its plugins.
 */
export const installSandboxModuleHooks = (): void => {
  /* `process.permission` exists only under `--permission`; the typings declare it unconditionally. */
  const { permission } = process as { permission?: NodeJS.ProcessPermission };
  if (permission?.has('addon') !== false) {
    return;
  }
  registerHooks({
    resolve: (specifier, context, nextResolve) =>
      deferredAddons.has(specifier)
        ? { url: refusingModuleUrl(specifier), format: 'module', shortCircuit: true }
        : nextResolve(specifier, context),
  });
};
