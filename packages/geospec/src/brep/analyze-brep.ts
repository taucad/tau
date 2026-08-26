/**
 * BRep evidence-reading contract (engine-backed).
 *
 * @module
 */

import {
  geoSpecClaimDiagnostics,
  geoSpecProtocolViolation,
  geoSpecSubjectId,
  isGeoSpecJsonRecord,
  submitGeoSpecClaim,
} from '#engine/client.js';
import { geoSpecEngineUnavailableDiagnostic } from '#engine/registry.js';
import type { BrepEvidence, GeometryDiagnostic, GeometrySubject } from '#mesh/types.js';

/**
 * Options for BRep evidence analysis.
 *
 * @public
 */
export type AnalyzeBrepOptions = {
  subject: GeometrySubject;
};

/**
 * Typed result returned by {@link analyzeBrep}.
 *
 * @public
 */
export type AnalyzeBrepResult =
  | {
      success: true;
      brep: BrepEvidence;
      diagnostics: GeometryDiagnostic[];
    }
  | {
      success: false;
      diagnostics: GeometryDiagnostic[];
    };

/**
 * Read BRep evidence from a loaded GeoSpec subject.
 *
 * @param options - BRep subject to inspect.
 * @returns Existing BRep evidence or a structured diagnostic.
 * @public
 */
export const analyzeBrep = (options: AnalyzeBrepOptions): AnalyzeBrepResult => {
  let submitted;
  try {
    submitted = submitGeoSpecClaim({ capability: 'analyzeBrep', subjectIds: [geoSpecSubjectId(options.subject)] });
  } catch (error) {
    return {
      success: false,
      diagnostics: [
        {
          code: 'GEOSPEC_ENGINE_CONTRACT_VIOLATION',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
  if (submitted === undefined) {
    return { success: false, diagnostics: [geoSpecEngineUnavailableDiagnostic('analyzeBrep')] };
  }
  if (submitted instanceof Promise) {
    return {
      success: false,
      diagnostics: [
        {
          code: 'GEOSPEC_ENGINE_CONTRACT_VIOLATION',
          severity: 'error',
          message: "The engine returned an asynchronous result for synchronous 'analyzeBrep'.",
        },
      ],
    };
  }
  const { evidence } = submitted;
  if (!isGeoSpecJsonRecord(evidence) || typeof evidence['success'] !== 'boolean') {
    return {
      success: false,
      diagnostics: [geoSpecProtocolViolation("The engine returned malformed 'analyzeBrep' evidence.")],
    };
  }
  const diagnostics = geoSpecClaimDiagnostics(submitted);
  if (!evidence['success']) {
    return { success: false, diagnostics };
  }
  if (isGeoSpecJsonRecord(evidence['brep'])) {
    return { success: true, brep: evidence['brep'] as unknown as BrepEvidence, diagnostics };
  }
  return {
    success: false,
    diagnostics: [geoSpecProtocolViolation("The engine omitted 'brep' from successful evidence.")],
  };
};
