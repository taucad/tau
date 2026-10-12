# geospec — Classes

1 top-level symbols. Signatures are verbatim typescript.

// Error thrown by {@link import ('./load-model.js').loadModel} when geometry cannot be loaded
GeoSpecModelLoadError: export declare class GeoSpecModelLoadError extends Error

  // Structured diagnostics explaining why model loading failed
  readonly diagnostics: readonly GeometryDiagnostic[]

  // GeoSpecModelLoadError.constructor (constructor)
  constructor(diagnostics: readonly GeometryDiagnostic[]);
  //   diagnostics: Geometry diagnostics to expose to callers
