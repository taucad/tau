/**
 * CAD model-loading contract. Authored specs call `loadModel` inside a GeoSpec
 * runner, which binds it to the host's native model loader; hosts build their
 * own loaders over a compiled engine with {@link createModelLoader}.
 *
 * @module
 */

import { createGeoSpecAssertionClient } from '#assertion-client/client.js';
import { bindGeoSpecSubject, rawSubjectResidency } from '#model/subject.js';
import type { GeoSpecSubject } from '#model/subject.js';
import { createGeoSpecNativeModelLoader } from '#model/native-model-loader.js';
import { GeoSpecModelLoadError } from '#model/errors.js';
import type { CreateModelLoaderOptions, ManagedGeoSpecModelLoader, LoadModelOptions } from '#model/types.js';

/**
 * Load a CAD model into GeoSpec evidence.
 *
 * This is the authoring declaration: a GeoSpec runner replaces it with the
 * host's native model loader. Called outside a runner it always throws.
 *
 * @param _options - Source, code, or file model load options.
 * @returns A GeoSpec geometry subject ready for `expectGeo`.
 * @throws {@link GeoSpecModelLoadError} with `GEOSPEC_MODEL_LOADER_UNAVAILABLE` when no runner is active.
 * @public
 */
export async function loadModel<Code extends Record<string, string> = Record<string, string>>(
  _options: LoadModelOptions<Code>,
): Promise<GeoSpecSubject> {
  throw new GeoSpecModelLoadError([
    {
      code: 'GEOSPEC_MODEL_LOADER_UNAVAILABLE',
      severity: 'error',
      message: 'No GeoSpec model loader is active outside a GeoSpec runner.',
      suggestion: 'Run this test through the GeoSpec CLI or Tau test runner, or call createModelLoader({ engine }).',
    },
  ]);
}

/**
 * Create a {@link loadModel} function over a host-supplied compiled engine.
 *
 * @param defaults - The compiled engine plus model loading defaults.
 * @returns A configured model loader whose subjects are released by `dispose()`.
 * @public
 */
export const createModelLoader = (defaults: CreateModelLoaderOptions): ManagedGeoSpecModelLoader => {
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
    const ensureResident = rawSubjectResidency(identity);
    return bindGeoSpecSubject({
      client,
      engine,
      identity: { subjectHash: identity.subjectHash },
      ...(identity.load === undefined ? {} : { load: identity.load }),
      isLive: () => generation === current,
      ...(ensureResident === undefined ? {} : { ensureResident }),
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
};
