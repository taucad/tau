/**
 * OpenRSCAD kernel over the native N-API engine.
 *
 * @public
 * @module
 */

import { createOpenrscadKernel } from '@taucad/openrscad';

/**
 * Engine version, plus the `+native` build metadata that keeps this kernel's
 * artifacts out of the WebAssembly kernel's build cache. The two builds are
 * byte-identical today and a parity gate keeps them so, but the cache key must
 * not *assume* that: a divergence would otherwise be invisible, served from
 * whichever host warmed the cache first.
 */
const version = '0.11.0-beta.1+native';

/**
 * The OpenRSCAD kernel backed by the native addon.
 *
 * Same capability id (`openrscad`), same file extensions, same options and the
 * same artifacts as `@taucad/openrscad` — only the engine module differs. A
 * host recipe registers exactly one of the two; registering both is an id
 * collision, not a fallback pair.
 *
 * @public
 */
export const openrscadNativeKernel = createOpenrscadKernel({
  loadBackend: async () => import('@taulabs/openrscad-engine-native'),
  version,
});
