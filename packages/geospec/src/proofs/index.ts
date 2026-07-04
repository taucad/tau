/**
 * GeoSpec relationship evidence engine (SB4): L4 BRep-only proofs — extrema
 * with witnesses, analytic comparison, solid classification, and exact
 * boolean interference — over SB3 selector resolutions, with labeled
 * broad-phase records and the per-subject proof-context adapter.
 *
 * @module
 */

export {
  proveContact,
  proveClearance,
  proveCoaxial,
  proveContainment,
  proveCoplanar,
  proveDirectionAngle,
  proveInsertion,
  proveInterference,
  proveRelationship,
  type RelationshipProofContext,
  type RelationshipProofInput,
  type RelationshipProofNative,
} from '#proofs/relationship-proofs.js';
export { getSubjectProofContext } from '#proofs/subject-context.js';
export type {
  RelationshipBroadPhase,
  RelationshipEndpointReport,
  RelationshipEvidence,
  RelationshipFinalEvidence,
  RelationshipWitness,
} from '#proofs/types.js';
