/**
 * `inspectGeometry` — the engine half of `geospec/inspection`.
 *
 * The matchers answer "does this claim hold"; inspection answers "what is
 * actually there", which is what an agent needs after a claim fails. It is a
 * READ: it resolves selectors through the same substrate engine the proofs use
 * and reports what each one matched, with the selector's own resolution
 * diagnostics attached. It never decides anything, and it never invents an
 * entity a selector did not match.
 *
 * A subject with no AP242 structure still has named mesh nodes, so occurrence
 * inspection degrades to the mesh inventory rather than answering nothing —
 * and says which source it came from.
 *
 * @module
 */

import type {
  GeometryInspectionEntity,
  GeometryInspectionSelection,
  InspectGeometryOptions as SubstrateInspectGeometryOptions,
  InspectGeometryResult,
} from 'geospec/inspection';
import type { AabbMeters, GeometryDiagnostic, GeometrySubject, Vec3 } from '#mesh/types.js';
import { resolveRelationshipEndpoint } from '#matchers/proof-matchers.js';
import { getSubjectProofContext } from '#proofs/subject-context.js';
import type { ResolvedEntity } from '#selector/types.js';
import type { GeoSpecGeometrySelector } from '#runner/types.js';

/** Engine form of the inspection request after opaque subject resolution. */
export type InspectGeometryOptions = Omit<SubstrateInspectGeometryOptions, 'subject'> & { subject: GeometrySubject };

const boundsOf = (entity: ResolvedEntity): AabbMeters | undefined =>
  entity.facts.bounds
    ? {
        min: [...entity.facts.bounds.min] as [number, number, number],
        max: [...entity.facts.bounds.max] as [number, number, number],
      }
    : undefined;

const centreOf = (entity: ResolvedEntity, bounds: AabbMeters): Vec3 =>
  entity.facts.centroid ?? [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];

/**
 * Map one resolved selector entity to its inspection shape.
 *
 * @param entity - The resolved entity.
 * @returns The inspection entity, or `undefined` when it carries no frame at
 * all (an entity with neither bounds nor an analytic surface is not something
 * inspection can report honestly).
 * @public
 */
export const inspectionEntity = (entity: ResolvedEntity): GeometryInspectionEntity | undefined => {
  const { facts } = entity;
  const bounds = boundsOf(entity);
  if (facts.axisDirection) {
    return {
      kind: 'axis',
      name: entity.id,
      ...(bounds ? { center: centreOf(entity, bounds) } : {}),
      direction: facts.axisDirection,
      ...(facts.radius === undefined ? {} : { radius: facts.radius }),
      ...(bounds ? { bounds } : {}),
      source: 'selector',
    };
  }
  if (facts.normal) {
    return {
      kind: 'plane',
      name: entity.id,
      normal: facts.normal,
      ...(facts.offset === undefined ? {} : { offset: facts.offset }),
      ...(bounds ? { bounds } : {}),
      source: 'selector',
    };
  }
  if (!bounds) {
    return undefined;
  }
  return {
    kind: 'occurrence',
    name: entity.occurrencePath ?? entity.id,
    bounds,
    center: centreOf(entity, bounds),
    source: 'step',
  };
};

/**
 * Resolve selectors against a subject and report what they matched.
 *
 * @param options - Subject and selectors.
 * @returns The per-selector selections plus every resolution diagnostic.
 * @public
 */
export const inspectGeometry = (options: InspectGeometryOptions): InspectGeometryResult => {
  const context = getSubjectProofContext(options.subject);
  if (!context) {
    return {
      selections: options.selectors.map((selector) => ({ selector, matches: [] })),
      diagnostics: [
        {
          code: 'GEOSPEC_EVIDENCE_UNSUPPORTED',
          severity: 'error',
          message:
            'inspectGeometry() needs an AP242 selector index, which this subject does not carry: only STEP-loaded subjects can be inspected by selector.',
          suggestion: 'Load the model as STEP so GeoSpec builds the selector index.',
          details: { selectors: options.selectors },
        },
      ],
    };
  }
  const diagnostics: GeometryDiagnostic[] = [];
  const selections: GeometryInspectionSelection[] = options.selectors.map((selector: GeoSpecGeometrySelector) => {
    const selection = resolveRelationshipEndpoint(selector, context);
    diagnostics.push(...selection.diagnostics);
    const matches: GeometryInspectionEntity[] = [];
    for (const entity of selection.entities) {
      const inspected = inspectionEntity(entity);
      if (inspected) {
        matches.push(inspected);
      }
    }
    return { selector, matches };
  });
  return { selections, diagnostics };
};
