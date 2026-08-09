/**
 * Shared Manifold WASM module loader.
 *
 * One initialization per process, shared by every Manifold consumer (mesh
 * overlap, hybrid void occupancy). The import is dynamic so subpaths that
 * merely type against Manifold never pull its JS glue into their static
 * graph; the module only loads when a consumer actually needs mesh CSG.
 *
 * The sync getter exists for the sync proof path (void continuity runs under
 * the sync matcher budget, so it cannot await): `loadStep` awaits
 * {@link ensureManifoldModule} while it is still in an async context, making
 * the proof-time engine choice deterministic — ready or permanently failed,
 * never timing-dependent.
 *
 * @module
 */

import type { ManifoldToplevel } from 'manifold-3d';

let modulePromise: Promise<ManifoldToplevel> | undefined;
let readyModule: ManifoldToplevel | undefined;

/**
 * Initialize (once) and return the Manifold WASM module.
 *
 * @returns The initialized top-level Manifold module.
 * @public
 */
export const ensureManifoldModule = async (): Promise<ManifoldToplevel> => {
  modulePromise ??= (async () => {
    const { default: initManifold } = await import('manifold-3d');
    const wasm = await initManifold();
    wasm.setup();
    readyModule = wasm;
    return wasm;
  })();
  return modulePromise;
};

/**
 * The Manifold module if a prior {@link ensureManifoldModule} completed, else
 * `undefined`. Sync consumers must treat `undefined` as a deterministic
 * fallback signal, never as an error.
 *
 * @public
 */
export const getManifoldModuleSync = (): ManifoldToplevel | undefined => readyModule;
