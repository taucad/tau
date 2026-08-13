/**
 * CAD model-loading contract. The substrate declares the shapes; the
 * registered engine drives the Tau runtime export and parses the bytes
 * (split-doc D-S1).
 *
 * @module
 */

import { getRegisteredGeoSpecHostBinding, geoSpecEngineUnavailableDiagnostic } from '#engine/registry.js';
import type { GeometrySubject } from '#mesh/types.js';
import { GeoSpecModelLoadError } from '#model/errors.js';
import type { CreateModelLoaderOptions, GeoSpecModelLoader, LoadModelOptions } from '#model/types.js';

/**
 * Load a CAD model into GeoSpec evidence.
 *
 * Direct geometry sources are parsed immediately. Code and project files are
 * exported through the required `@taucad/runtime` integration on this subpath.
 *
 * @param options - Source, code, or file model load options.
 * @returns A GeoSpec geometry subject ready for `expectGeo`.
 * @throws {@link GeoSpecModelLoadError} when the model cannot be exported or
 * parsed, or when no GeoSpec engine is registered.
 * @public
 */
export async function loadModel<Code extends Record<string, string> = Record<string, string>>(
  options: LoadModelOptions<Code>,
): Promise<GeometrySubject> {
  const engine = getRegisteredGeoSpecHostBinding<typeof loadModel>('loadModel');
  if (!engine) {
    throw new GeoSpecModelLoadError([geoSpecEngineUnavailableDiagnostic('loadModel')]);
  }
  return engine(options);
}

/**
 * Create a {@link loadModel} function with shared defaults.
 *
 * @param defaults - Model loading defaults.
 * @returns A configured model loader.
 * @public
 */
export const createModelLoader = (defaults: CreateModelLoaderOptions = {}): GeoSpecModelLoader => {
  return async (options) => loadModel({ ...defaults, ...options });
};
