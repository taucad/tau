export {
  projectGeoSpecFile,
  projectGeoSpecTest,
  runnerResultToTestModelOutput,
  type GeoSpecFileProjection,
  type GeoSpecKernelEvidence,
  type GeoSpecProjectedTest,
  type GeoSpecProjectionOptions,
  type GeoSpecTestCounts,
  type TestModelOutput,
} from '#geospec/result.js';
export { queryDirectAp242MinimumDistance } from '#geospec/exact-ap242-minimum.js';
export {
  createGeoSpecRunProgress,
  markGeoSpecRunTimeout,
  observeGeoSpecRunProgress,
  type GeoSpecRunProgress,
  type GeoSpecRunProgressEvent,
  type GeoSpecRunTimeoutFacts,
} from '#geospec/run-progress.js';
export { hasGeoSpecSelectionFilters, runGeoSpecTests, type RunGeoSpecTestsOptions } from '#geospec/run-tests.js';
