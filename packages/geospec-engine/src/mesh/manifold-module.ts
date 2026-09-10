/**
 * The Manifold wasm module.
 *
 * One instance per process, exactly like the OCCT singleton: the module owns a
 * wasm heap and every prepared solid lives in it, so a second instance would
 * double the footprint and hand out handles that cannot meet each other.
 *
 * @module
 */

import initManifold from 'manifold-3d';
import type { ManifoldToplevel } from 'manifold-3d';

const manifoldWasmUrl = new URL(import.meta.resolve('manifold-3d/manifold.wasm')).href;

let modulePromise: Promise<ManifoldToplevel> | undefined;

const instantiate = async (): Promise<ManifoldToplevel> => {
  const module = await initManifold({ locateFile: () => manifoldWasmUrl });
  module.setup();
  return module;
};

/**
 * Load (once) and return the Manifold module.
 *
 * @returns The initialized module with `setup()` already applied.
 * @public
 */
export const ensureManifoldModule = async (): Promise<ManifoldToplevel> => {
  modulePromise ??= instantiate();
  return modulePromise;
};
