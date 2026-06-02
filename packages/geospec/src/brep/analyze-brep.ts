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
 * @returns Existing BRep evidence or an unsupported-evidence diagnostic.
 * @public
 */
export const analyzeBrep = (options: AnalyzeBrepOptions): AnalyzeBrepResult => {
  if (!options.subject.brep) {
    return {
      success: false,
      diagnostics: [
        {
          code: 'UNSUPPORTED_GEOMETRY_EVIDENCE',
          severity: 'error',
          message: 'analyzeBrep requires BRep evidence, but this geometry subject does not include it.',
          suggestion: 'Load a STEP/BRep-capable subject with loadStep(...) or loadModel({ format: "step" }).',
        },
      ],
    };
  }

  return {
    success: true,
    brep: options.subject.brep,
    diagnostics: options.subject.diagnostics.filter((diagnostic) => diagnostic.code.startsWith('BREP_')),
  };
};
