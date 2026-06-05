import type { GeometryDiagnostic } from '#mesh/types.js';

const stringifyDetails = (details: unknown): string => {
  if (typeof details === 'string') {
    return details;
  }
  try {
    const serialized: unknown = JSON.stringify(details);
    return typeof serialized === 'string' ? serialized : '[unserializable diagnostic details]';
  } catch {
    return '[unserializable diagnostic details]';
  }
};

const cloneDiagnostic = (diagnostic: GeometryDiagnostic): GeometryDiagnostic => {
  try {
    return structuredClone(diagnostic);
  } catch {
    return {
      ...diagnostic,
      ...(diagnostic.details === undefined ? {} : { details: stringifyDetails(diagnostic.details) }),
    };
  }
};

/**
 * Error thrown by {@link import('./load-model.js').loadModel} when geometry cannot be loaded.
 *
 * @public
 */
export class GeoSpecModelLoadError extends Error {
  /** Structured diagnostics explaining why model loading failed. */
  public readonly diagnostics: readonly GeometryDiagnostic[];

  /**
   * Create a model-load error from structured diagnostics.
   *
   * @param diagnostics - Geometry diagnostics to expose to callers.
   */
  public constructor(diagnostics: readonly GeometryDiagnostic[]) {
    const snapshot = diagnostics.map((diagnostic) => cloneDiagnostic(diagnostic));
    super(snapshot.map((diagnostic) => diagnostic.message).join('\n') || 'GeoSpec model load failed.');
    this.name = 'GeoSpecModelLoadError';
    this.diagnostics = Object.freeze(snapshot);
  }
}
