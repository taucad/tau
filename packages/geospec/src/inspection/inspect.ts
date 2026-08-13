/**
 * Geometry inspection helpers for advanced GeoSpec matchers.
 *
 * @module
 */

import {
  geoSpecClaimDiagnostics,
  geoSpecClaimJson,
  geoSpecProtocolViolation,
  geoSpecSubjectId,
  isGeoSpecJsonRecord,
  submitGeoSpecClaim,
} from '#engine/client.js';
import { geoSpecEngineUnavailableDiagnostic } from '#engine/registry.js';
import type { AabbMeters, GeometryDiagnostic, GeometrySubject, Vec3 } from '#mesh/types.js';
import type { GeoSpecGeometrySelector } from '#runner/types.js';

/**
 * One inspected geometry entity.
 *
 * @public
 */
export type GeometryInspectionEntity =
  | {
      kind: 'occurrence';
      name: string;
      color?: string;
      bounds: AabbMeters;
      center: Vec3;
      triangleCount?: number;
      source: 'mesh' | 'step';
    }
  | {
      kind: 'axis';
      name: string;
      axis?: 'x' | 'y' | 'z';
      center?: Vec3;
      direction?: Vec3;
      radius?: number;
      bounds?: AabbMeters;
      source: 'selector' | 'brep';
    }
  | {
      kind: 'plane';
      name: string;
      normal?: Vec3;
      offset?: number;
      bounds?: AabbMeters;
      source: 'selector' | 'brep';
    };

/**
 * Result of one selector inspection.
 *
 * @public
 */
export type GeometryInspectionSelection = {
  selector: GeoSpecGeometrySelector;
  matches: GeometryInspectionEntity[];
};

/**
 * Options for {@link inspectGeometry}.
 *
 * @public
 */
export type InspectGeometryOptions = {
  subject: GeometrySubject;
  selectors: GeoSpecGeometrySelector[];
  evidence?: Array<'bounds' | 'facts' | 'frames'>;
};

/**
 * Structured inspection result used by relationship and occurrence matchers.
 *
 * @public
 */
export type InspectGeometryResult = {
  selections: GeometryInspectionSelection[];
  diagnostics: GeometryDiagnostic[];
};

/**
 * Resolve selectors against a subject and report the matched entities.
 *
 * @param options - Subject, selectors, and requested evidence kinds.
 * @returns The per-selector selections with diagnostics.
 * @public
 */
export const inspectGeometry = (options: InspectGeometryOptions): InspectGeometryResult => {
  let submitted;
  try {
    submitted = submitGeoSpecClaim({
      capability: 'inspectGeometry',
      subjectIds: [geoSpecSubjectId(options.subject)],
      payload: geoSpecClaimJson({ selectors: options.selectors, evidence: options.evidence }),
    });
  } catch (error) {
    return {
      selections: [],
      diagnostics: [geoSpecProtocolViolation(error instanceof Error ? error.message : String(error))],
    };
  }
  if (submitted === undefined) {
    return { selections: [], diagnostics: [geoSpecEngineUnavailableDiagnostic('inspectGeometry')] };
  }
  if (submitted instanceof Promise) {
    return {
      selections: [],
      diagnostics: [
        {
          code: 'GEOSPEC_ENGINE_CONTRACT_VIOLATION',
          severity: 'error',
          message: "The engine returned an asynchronous result for synchronous 'inspectGeometry'.",
        },
      ],
    };
  }
  const { evidence } = submitted;
  if (!isGeoSpecJsonRecord(evidence) || !Array.isArray(evidence['selections'])) {
    return {
      selections: [],
      diagnostics: [geoSpecProtocolViolation("The engine returned malformed 'inspectGeometry' evidence.")],
    };
  }
  return {
    selections: evidence['selections'] as unknown as GeometryInspectionSelection[],
    diagnostics: geoSpecClaimDiagnostics(submitted),
  };
};
