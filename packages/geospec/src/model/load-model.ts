/**
 * CAD model-loading contract. The substrate declares the shapes; the
 * registered engine drives the Tau runtime export and parses the bytes
 * (split-doc D-S1).
 *
 * @module
 */

import { getRegisteredGeoSpecHostBinding, geoSpecEngineUnavailableDiagnostic } from '#engine/registry.js';
import { createGeoSpecAssertionClient } from '#assertion-client/client.js';
import { bindGeoSpecSubject, resolveGeoSpecSubject } from '#model/subject.js';
import type { GeoSpecSubject } from '#model/subject.js';
import { createGeoSpecNativeModelLoader } from '#model/native-model-loader.js';
import { GeoSpecModelLoadError } from '#model/errors.js';
import type { CreateModelLoaderOptions, ManagedGeoSpecModelLoader, LoadModelOptions } from '#model/types.js';

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
): Promise<GeoSpecSubject> {
  const engine = getRegisteredGeoSpecHostBinding<typeof loadModel>('loadModel');
  if (!engine) {
    throw new GeoSpecModelLoadError([geoSpecEngineUnavailableDiagnostic('loadModel')]);
  }
  const subject = await engine(options);
  resolveGeoSpecSubject(subject);
  return subject;
}

/**
 * Create a {@link loadModel} function with shared defaults.
 *
 * @param defaults - Model loading defaults.
 * @returns A configured model loader.
 * @public
 */
export const createModelLoader = (defaults: CreateModelLoaderOptions = {}): ManagedGeoSpecModelLoader => {
  if (defaults.engine !== undefined) {
    const { engine, readSource, format, ...hostDefaults } = defaults;
    const modelDefaults = { ...hostDefaults, ...(format === undefined ? {} : { format }) };
    const raw = createGeoSpecNativeModelLoader({
      ...hostDefaults,
      engine,
      ...(readSource === undefined ? {} : { readSource }),
    });
    const client = createGeoSpecAssertionClient({ engine });
    let generation = 0;
    const loader = async (options: LoadModelOptions): Promise<GeoSpecSubject> => {
      const current = generation;
      const identity = await raw({ ...modelDefaults, ...options });
      return bindGeoSpecSubject({
        client,
        engine,
        identity: { subjectHash: identity.subjectHash },
        ...(identity.load === undefined ? {} : { load: identity.load }),
        isLive: () => generation === current,
      });
    };
    return Object.assign(loader, {
      async dispose() {
        try {
          await raw.releaseAll();
        } finally {
          generation += 1;
        }
      },
    });
  }
  const engine =
    getRegisteredGeoSpecHostBinding<(options: CreateModelLoaderOptions) => ManagedGeoSpecModelLoader>(
      'createModelLoader',
    );
  if (engine) {
    const configured = engine(defaults);
    return Object.assign(
      async (options: LoadModelOptions) => {
        const subject = await configured(options);
        resolveGeoSpecSubject(subject);
        return subject;
      },
      { dispose: async () => configured.dispose() },
    );
  }
  return Object.assign(async (options: LoadModelOptions) => loadModel({ ...defaults, ...options }), {
    dispose: async () => undefined,
  });
};
