/**
 * STEP/XDE loading contract. The substrate declares the shapes; the
 * registered engine parses the file (split-doc D-S1).
 *
 * @module
 */

import { requireRegisteredGeoSpecHostBinding } from '#engine/registry.js';
import type { GeometrySubject } from '#mesh/types.js';
import type { CreateStepLoaderOptions, LoadStepOptions, XdeReadResult } from '#step/types.js';

/**
 * A configured STEP loader.
 *
 * @public
 */
export type GeoSpecStepLoader = (options: LoadStepOptions) => Promise<GeometrySubject>;

/**
 * Parse the native reader's JSON payload into a structured XDE read result.
 *
 * @param json - JSON emitted by the engine's XDE reader.
 * @returns The structured read result.
 * @public
 */
export const parseXdeReadResultJson = (json: string): XdeReadResult => {
  const parsed = JSON.parse(json) as Partial<XdeReadResult> & { error?: string };
  if (parsed.error !== undefined) {
    throw new Error(`GeoSpec's AP242 reader failed: ${parsed.error}`);
  }
  return {
    occurrences: parsed.occurrences ?? [],
    subshapeNames: parsed.subshapeNames ?? [],
    datumPlacements: parsed.datumPlacements ?? [],
    semanticDatums: parsed.semanticDatums ?? [],
    datumSystems: parsed.datumSystems ?? [],
    supplementalPlanes: parsed.supplementalPlanes ?? [],
    freeShapeCount: parsed.freeShapeCount ?? 0,
  };
};

/**
 * Load STEP/XDE/BRep evidence into a GeoSpec geometry subject.
 *
 * @param options - STEP source, units, streaming mode, and mesh settings.
 * @returns A GeoSpec geometry subject with BRep and STEP evidence.
 * @public
 */
export const loadStep = async (options: LoadStepOptions): Promise<GeometrySubject> =>
  requireRegisteredGeoSpecHostBinding<GeoSpecStepLoader>('loadStep')(options);

/**
 * Create a {@link loadStep} function with shared defaults.
 *
 * @param defaults - STEP loading defaults.
 * @returns A configured STEP loader.
 * @public
 */
export const createStepLoader =
  (defaults: CreateStepLoaderOptions = {}): GeoSpecStepLoader =>
  async (options) =>
    loadStep({ ...defaults, ...options });
