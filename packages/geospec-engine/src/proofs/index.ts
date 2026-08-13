/**
 * The GeoSpec proof engine (SB4): exact L4 relationship verdicts over SB3
 * selector resolutions, plus the per-subject proof-context adapter.
 *
 * @module
 */

export {
  proveClearance,
  proveCoaxial,
  proveContact,
  proveContainment,
  proveCoplanar,
  proveDirectionAngle,
  proveInsertion,
  proveInterference,
  proveRelationship,
} from '#proofs/relationship-proofs.js';
export type { ProofEndpoint, RelationshipProofContext, RelationshipProofInput } from '#proofs/context.js';
export { getSubjectProofContext } from '#proofs/subject-context.js';
export type {
  RelationshipBroadPhase,
  RelationshipEvidence,
  RelationshipFinalEvidence,
  RelationshipWitness,
} from '#proofs/types.js';
