/** Native GeoSpec runner host. @module */

export { createNativeGeoSpecRunner } from '#runner/native/native-serial-runner.js';
export { allocateNativePoolGrants } from '#runner/native/native-pool-grants.js';
export type { GeoSpecNativeRunnerAssertions, GeoSpecNativeRunnerOptions } from '#runner/native/native-serial-runner.js';
export { createGeoSpecNativeModelLoader } from '#model/native-model-loader.js';
export type {
  CreateGeoSpecNativeModelLoaderOptions,
  GeoSpecNativeLoadModelOptions,
  GeoSpecNativeModelEngine,
  GeoSpecNativeModelLoader,
  GeoSpecNativeModelSubject,
  GeoSpecNativeModelResource,
  GeoSpecNativeSourceReader,
  ManagedGeoSpecNativeModelLoader,
} from '#model/native-model-loader.js';
