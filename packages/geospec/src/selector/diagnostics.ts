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
  stale: 'GEOSPEC_SELECTOR_STALE',
  unsupportedEvidence: 'GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE',
  /** Informational: authored interface without stamped facts (not staleness). */
  missingStampedFacts: 'GEOSPEC_SELECTOR_MISSING_STAMPED_FACTS',
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
 * Build a `GEOSPEC_SELECTOR_STALE` diagnostic carrying both fact sets.
 *
 * @param options - Selector context plus stamped and observed fact sets in `details`.
 * @returns The structured diagnostic.
 * @public
 */
export const staleDiagnostic = (options: SelectorDiagnosticOptions): GeometryDiagnostic =>
  buildDiagnostic(selectorDiagnosticCodes.stale, options);

/**
 * Build a `GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE` diagnostic.
 *
 * @param options - Selector context and fallback suggestion.
 * @returns The structured diagnostic.
 * @public
 */
export const unsupportedEvidenceDiagnostic = (options: SelectorDiagnosticOptions): GeometryDiagnostic =>
  buildDiagnostic(selectorDiagnosticCodes.unsupportedEvidence, options);

/**
 * Build the informational `missing-stamped-facts` diagnostic. Absence of a
 * stamp is not staleness (profile rule) — the interface resolves normally.
 *
 * @param options - Interface full name and the absence reason.
 * @returns The informational diagnostic.
 * @public
 */
export const missingStampedFactsDiagnostic = (options: {
  interfaceName: string;
  reason: string;
}): GeometryDiagnostic => ({
  code: selectorDiagnosticCodes.missingStampedFacts,
  severity: 'info',
  message: `Authored interface '${options.interfaceName}' has no usable stamped facts: ${options.reason}.`,
  suggestion: 'Re-export with a geospec:facts v1 stamp to enable stale detection; resolution proceeds without it.',
  details: { interfaceName: options.interfaceName, reason: options.reason },
});
