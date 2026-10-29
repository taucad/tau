/* oxlint-disable no-restricted-imports -- `#*.js` maps to TypeScript sources, so the checked-in glue is reached relatively */
/**
 * The one import site for the package's own libcascade build: glue JS, WASM and types under `wasm/`, built by
 * `libcascade/build.sh` with only the bindings the engine calls plus the TauOffline native helpers.
 */
import type { OpenCascadeInstance } from './wasm/libcascade_kcl.js';

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- the engine's libcascade types come from this one site
export type * from './wasm/libcascade_kcl.js';

// A static URL lets bundlers emit the WASM as an asset beside the glue chunk.
const wasmUrl = new URL('wasm/libcascade_kcl.wasm', import.meta.url).href;

/**
 * Loads the package's libcascade build, fetching the glue only on first use.
 *
 * @returns an initialized libcascade instance
 */
export const loadLibcascade = async (): Promise<OpenCascadeInstance> => {
  const { default: init } = await import('./wasm/libcascade_kcl.js');
  return init({ locateFile: () => wasmUrl });
};
