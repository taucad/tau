/**
 * Selector diagnostic codes and payload builders (SB3-R4).
 *
 * Failure payloads are the agent-facing repair loop: every one carries the
 * serialized selector, its stability class, ranked candidates/near-misses
 * with facts, and a repair suggestion, on the existing
 * {@link import('#mesh/types.js').GeometryDiagnostic} shape.
 *
 * @module
 */

import type { GeometryDiagnostic } from '#mesh/types.js';
import { serializeSelector } from '#selector/types.js';
import type { CandidateEntity, GeometrySelectionStability, GeometrySelector } from '#selector/types.js';

/**
 * Diagnostic codes emitted by selector resolution.
 *
 * @public
 */
export const selectorDiagnosticCodes = {
  unmatched: 'GEOSPEC_SELECTOR_UNMATCHED',
  ambiguous: 'GEOSPEC_SELECTOR_AMBIGUOUS',
  unsupportedEvidence: 'GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE',
} as const;

/**
 * Payload accepted by the selector diagnostic builders.
 *
 * @public
 */
export type SelectorDiagnosticOptions = {
  selector: GeometrySelector;
  stability: GeometrySelectionStability;
  message: string;
  suggestion: string;
  /** Ranked candidates or near-misses with disambiguating facts. */
  candidates?: CandidateEntity[];
  /** Extra structured payload merged into `details`. */
  details?: Record<string, unknown>;
};

const buildDiagnostic = (code: string, options: SelectorDiagnosticOptions): GeometryDiagnostic => ({
  code,
  severity: 'error',
  message: options.message,
  suggestion: options.suggestion,
  details: {
    selector: serializeSelector(options.selector),
    stability: options.stability,
    candidates: options.candidates ?? [],
    ...options.details,
  },
});

/**
 * Build a `GEOSPEC_SELECTOR_UNMATCHED` diagnostic.
 *
 * @param options - Selector context, near-misses, and repair suggestion.
 * @returns The structured diagnostic.
 * @public
 */
export const unmatchedDiagnostic = (options: SelectorDiagnosticOptions): GeometryDiagnostic =>
  buildDiagnostic(selectorDiagnosticCodes.unmatched, options);

/**
 * Build a `GEOSPEC_SELECTOR_AMBIGUOUS` diagnostic.
 *
 * @param options - Selector context and ranked candidates with facts.
 * @returns The structured diagnostic.
 * @public
 */
export const ambiguousDiagnostic = (options: SelectorDiagnosticOptions): GeometryDiagnostic =>
  buildDiagnostic(selectorDiagnosticCodes.ambiguous, options);

/**
 * Build a `GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE` diagnostic.
 *
 * @param options - Selector context and fallback suggestion.
 * @returns The structured diagnostic.
 * @public
 */
export const unsupportedEvidenceDiagnostic = (options: SelectorDiagnosticOptions): GeometryDiagnostic =>
  buildDiagnostic(selectorDiagnosticCodes.unsupportedEvidence, options);
