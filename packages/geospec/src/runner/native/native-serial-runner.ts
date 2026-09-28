/** Opt-in protocol-3 serial runner over the existing GeoSpec VM. @module */

import type { GeoSpecAssertionClientOptions } from '#assertion-client/index.js';
import { createGeoSpecNativeModelLoader } from '#model/native-model-loader.js';
import type {
  CreateGeoSpecNativeModelLoaderOptions,
  GeoSpecNativeModelEngine,
  ManagedGeoSpecNativeModelLoader,
} from '#model/native-model-loader.js';
import { createSerialGeoSpecRunner } from '#runner/worker/serial-runner.js';
import type { GeoSpecRunner, GeoSpecRunnerOptions } from '#runner/worker/index.js';

/** Native assertion options whose engine can also admit and release subjects. @public */
export type GeoSpecNativeRunnerAssertions = Omit<GeoSpecAssertionClientOptions, 'engine'> & {
  readonly engine: GeoSpecNativeModelEngine;
};

/** Options for the native serial runner. @public */
export type GeoSpecNativeRunnerOptions = Omit<
  GeoSpecRunnerOptions,
  'modelLoader' | 'nativeAssertions' | 'nativeModelLoader' | 'stepLoader'
> & {
  /** Actual protocol-3 engine used by authored assertions. */
  readonly nativeAssertions: GeoSpecNativeRunnerAssertions;
  /** Optional managed loader; the runner releases its subjects after every run. */
  readonly nativeModelLoader?: ManagedGeoSpecNativeModelLoader;
  /** Defaults used when the runner constructs its own native loader. */
  readonly model?: Omit<CreateGeoSpecNativeModelLoaderOptions, 'engine'>;
};

/**
 * Create an opt-in native runner using the SDK's existing serial lifecycle.
 *
 * @param options - VM filesystem, native engine/client options and model defaults.
 * @returns The ordinary GeoSpec runner lifecycle and event contract.
 * @public
 */
export const createNativeGeoSpecRunner = (options: GeoSpecNativeRunnerOptions): GeoSpecRunner => {
  const nativeModelLoader =
    options.nativeModelLoader ??
    createGeoSpecNativeModelLoader({
      ...options.model,
      engine: options.nativeAssertions.engine,
    });
  return createSerialGeoSpecRunner({
    filesystem: options.filesystem,
    nativeAssertions: options.nativeAssertions,
    nativeModelLoader,
    ...(options.builtinModules === undefined ? {} : { builtinModules: options.builtinModules }),
    ...(options.internalProfile === undefined ? {} : { internalProfile: options.internalProfile }),
  });
};
