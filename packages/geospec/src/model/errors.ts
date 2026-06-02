import type { GeometryDiagnostic } from '#mesh/types.js';

/**
 * Error thrown by {@link import('./load-model.js').loadModel} when geometry cannot be loaded.
 *
 * @public
 */
export class GeoSpecModelLoadError extends Error {
  /** Structured diagnostics explaining why model loading failed. */
  public readonly diagnostics: GeometryDiagnostic[];

  /**
   * Create a model-load error from structured diagnostics.
   *
   * @param diagnostics - Geometry diagnostics to expose to callers.
   */
  public constructor(diagnostics: GeometryDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join('\n') || 'GeoSpec model load failed.');
    this.name = 'GeoSpecModelLoadError';
    this.diagnostics = diagnostics;
  }
}
