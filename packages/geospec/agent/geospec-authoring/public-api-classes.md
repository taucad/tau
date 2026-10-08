# geospec — Classes

2 top-level symbols. Signatures are verbatim typescript.

// Error thrown by {@link import ('./load-model.js').loadModel} when geometry cannot be loaded
GeoSpecModelLoadError: export declare class GeoSpecModelLoadError extends Error

  // Structured diagnostics explaining why model loading failed
  readonly diagnostics: readonly GeometryDiagnostic[]

  // GeoSpecModelLoadError.constructor (constructor)
  constructor(diagnostics: readonly GeometryDiagnostic[]);
  //   diagnostics: Geometry diagnostics to expose to callers

// Assertion error thrown by GeoSpec matchers when an expectation does not hold
// Remarks: Runner, CLI, and tool adapters unwrap this error to preserve structured diagnostics instead of collapsing them into a single string.
GeoSpecAssertionError: export declare class GeoSpecAssertionError extends Error

  readonly diagnostics: readonly GeometryDiagnostic[]

  // GeoSpecAssertionError.constructor (constructor)
  constructor(diagnostics: readonly GeometryDiagnostic[]);
