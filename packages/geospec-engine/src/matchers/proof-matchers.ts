/**
 * The two proof-backed matcher bodies: spatial relationships and void
 * continuity.
 *
 * Both delegate every verdict to the SB4 proof engines and add nothing of
 * their own except the agent-actionable diagnostic envelope: which
 * relationship, which endpoints, with what stability, what the broad phase
 * recorded, what the final proof measured, and the witnesses. The matcher
 * never re-decides anything the proof already decided (§5): a proof that
 * answers `unsupported` surfaces as an `unsupported` diagnostic, never as a
 * pass and never as a weaker fallback measurement.
 *
 * @module
 */

import type { GeoSpecMatcherImplementation } from '#matchers/types.js';
import type { GeometryDiagnostic } from '#mesh/types.js';
import { getSubjectProofContext } from '#proofs/subject-context.js';
import { proveRelationship } from '#proofs/relationship-proofs.js';
import type { RelationshipProofContext } from '#proofs/context.js';
import { proveVoidContinuity } from '#proofs/void-continuity.js';
import { resolve } from '#selector/resolve.js';
import type { GeometrySelection, GeometrySelector } from '#selector/types.js';
import type {
  GeoSpecGeometrySelector,
  GeoSpecSpatialRelationshipExpectation,
  GeoSpecSpatialRelationshipsExpectation,
  GeoSpecVoidContinuityExpectation,
} from '#runner/types.js';
import { brepSuggestion, evidenceUnsupported, matcherSubject } from '#matchers/support.js';

/**
 * A legacy explicit analytic fixture: an `axis`/`plane` member carrying a
 * hand-supplied frame rather than a query. The production evidence policy
 * rejects these, so they are resolved into an `explicit` selection whose
 * refusal the proof engine already owns — the matcher does not re-implement
 * the policy.
 */
const isExplicitFixture = (selector: GeoSpecGeometrySelector): boolean =>
  typeof selector === 'object' &&
  !(selector instanceof RegExp) &&
  'kind' in selector &&
  (selector.kind === 'axis' || selector.kind === 'plane') &&
  !('query' in selector);

const explicitSelection = (selector: GeoSpecGeometrySelector): GeometrySelection => ({
  selector: selector as GeometrySelector,
  status: 'resolved',
  entities: [{ id: 'explicit:frame', entityType: 'axis', facts: {} }],
  expected: 'one',
  source: 'explicit',
  stability: 'explicit',
  diagnostics: [],
});

/**
 * Resolve one relationship endpoint through the substrate's selector engine.
 *
 * @param selector - The authored endpoint selector.
 * @param context - The subject's proof context.
 * @returns The selection.
 * @public
 */
export const resolveRelationshipEndpoint = (
  selector: GeoSpecGeometrySelector,
  context: RelationshipProofContext,
): GeometrySelection => {
  if (isExplicitFixture(selector)) {
    return explicitSelection(selector);
  }
  // A bare regular expression is the occurrence-name shorthand.
  const asSelector: GeometrySelector =
    selector instanceof RegExp ? { kind: 'occurrence', name: selector } : (selector as GeometrySelector);
  return resolve(asSelector, context.index);
};

const relationshipLabel = (index: number, relationship: GeoSpecSpatialRelationshipExpectation): string =>
  `Spatial relationship ${index}${relationship.id === undefined ? '' : ` (${relationship.id})`} failed`;

const endpointReport = (selection: GeometrySelection): Record<string, unknown> => ({
  status: selection.status,
  stability: selection.stability,
  source: selection.source,
  entities: selection.entities.map((entity) => ({
    id: entity.id,
    entityType: entity.entityType,
    ...(entity.occurrencePath === undefined ? {} : { occurrencePath: entity.occurrencePath }),
  })),
});

/**
 * `expectGeo(...).toHaveSpatialRelationships(...)`.
 *
 * @public
 */
export const toHaveSpatialRelationships: GeoSpecMatcherImplementation = (invocation) => {
  const resolved = matcherSubject(invocation);
  if ('diagnostics' in resolved) {
    return resolved.diagnostics;
  }
  const context = getSubjectProofContext(resolved.subject, invocation.forensic);
  if (!context) {
    // D5 precondition: no BRep/XDE evidence, so no exact proof is possible.
    return evidenceUnsupported({
      matcher: 'toHaveSpatialRelationships',
      missing: 'exact BRep evidence with an AP242 assembly structure',
      suggestion: brepSuggestion,
    });
  }
  const { relationships } = invocation.expected as GeoSpecSpatialRelationshipsExpectation;
  const diagnostics: GeometryDiagnostic[] = [];
  for (const [index, relationship] of relationships.entries()) {
    const subject = resolveRelationshipEndpoint(relationship.subject, context);
    const target = resolveRelationshipEndpoint(relationship.target, context);
    if (subject.status !== 'resolved' || target.status !== 'resolved') {
      // The selection already carries the diagnostic that says *why* it failed,
      // with the right code: `ambiguous` ("matched several") and `unsupported`
      // are materially different repairs from `unmatched` ("matched nothing").
      // Re-coding every unresolved endpoint as UNMATCHED destroyed that
      // distinction and told the author the opposite of what happened.
      for (const [endpoint, role] of [
        [subject, 'subject'],
        [target, 'target'],
      ] as const) {
        if (endpoint.status === 'resolved') {
          continue;
        }
        for (const diagnostic of endpoint.diagnostics) {
          diagnostics.push({
            ...diagnostic,
            message: `${relationshipLabel(index, relationship)}: the ${role} selector did not resolve — ${diagnostic.message}`,
            details: {
              relationship,
              subject: endpointReport(subject),
              target: endpointReport(target),
              selector: diagnostic.details,
            },
          });
        }
      }
      continue;
    }
    const evidence = proveRelationship({ subject, target, expectation: relationship, context });
    if (evidence.verdict === 'pass') {
      continue;
    }
    for (const diagnostic of evidence.diagnostics) {
      diagnostics.push({
        ...diagnostic,
        message: `${relationshipLabel(index, relationship)}: ${diagnostic.message}`,
        details: {
          relationship,
          subject: endpointReport(subject),
          target: endpointReport(target),
          evidence: {
            ...(evidence.broadPhase === undefined ? {} : { broadPhase: evidence.broadPhase }),
            ...(evidence.final === undefined ? {} : { final: evidence.final }),
          },
          measured: evidence.final?.measured ?? {},
          expected: evidence.final?.expected ?? {},
          witnesses: evidence.final?.witnesses ?? [],
        },
      });
    }
  }
  return diagnostics;
};

/**
 * `expectGeo(...).toHaveVoidContinuity(...)`.
 *
 * @public
 */
export const toHaveVoidContinuity: GeoSpecMatcherImplementation = (invocation) => {
  const resolved = matcherSubject(invocation);
  if ('diagnostics' in resolved) {
    return resolved.diagnostics;
  }
  const context = getSubjectProofContext(resolved.subject, invocation.forensic);
  if (!context) {
    return evidenceUnsupported({
      matcher: 'toHaveVoidContinuity',
      missing: 'exact BRep evidence with an AP242 assembly structure',
      suggestion: brepSuggestion,
    });
  }
  return proveVoidContinuity(invocation.expected as GeoSpecVoidContinuityExpectation, context);
};
