/** Canonical topological void-continuity proof. */

import type { GeometryDiagnostic } from '#mesh/types.js';
import type { RelationshipProofContext } from '#proofs/context.js';
import { resolveVoidClaim } from '#proofs/void-claim.js';
import { proveVoidTopological } from '#proofs/void-topology.js';
import type { GeoSpecVoidContinuityExpectation } from '#runner/types.js';

/** Resolve and prove one void-continuity expectation. */
export const proveVoidContinuity = (
  expectation: GeoSpecVoidContinuityExpectation,
  context: RelationshipProofContext,
): GeometryDiagnostic[] => {
  const resolved = resolveVoidClaim(expectation, context);
  return 'diagnostics' in resolved ? resolved.diagnostics : proveVoidTopological(resolved.claim, context);
};
