import type { GeometryDiagnostic } from '#mesh/types.js';
import { isGeoSpecJsonValue } from '#engine/protocol.js';
import { z } from 'zod';

const vector = z.tuple([z.number(), z.number(), z.number()]);
/** Diagnostic shape shared by engine responses and cross-realm load errors. */
export const geometryDiagnosticSchema = z.strictObject({
  code: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  suggestion: z.string().optional(),
  spatial: z.strictObject({ min: vector.optional(), max: vector.optional(), center: vector.optional() }).optional(),
  details: z.unknown().optional(),
});

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

/**
 * Normalize opaque diagnostic details before worker/JSON transport.
 * @param diagnostic - Collected failure with potentially non-serializable details.
 * @returns A detached transport-safe diagnostic.
 */
export const diagnosticForTransport = (diagnostic: GeometryDiagnostic): GeometryDiagnostic => {
  const details =
    diagnostic.details instanceof Error
      ? { name: diagnostic.details.name, message: diagnostic.details.message }
      : diagnostic.details;
  return structuredClone({
    ...diagnostic,
    ...(details === undefined ? {} : { details: isGeoSpecJsonValue(details) ? details : stringifyDetails(details) }),
  });
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
