/**
 * Engine-side L4 evidence vocabulary.
 *
 * The verdict/evidence shapes are substrate contract and are re-published
 * verbatim.
 *
 * @module
 */

import type {
  RelationshipBroadPhase as SubstrateRelationshipBroadPhase,
  RelationshipEvidence as SubstrateRelationshipEvidence,
  RelationshipFinalEvidence as SubstrateRelationshipFinalEvidence,
  RelationshipWitness as SubstrateRelationshipWitness,
} from 'geospec/proofs';

/** Re-published substrate vocabulary: {@link SubstrateRelationshipBroadPhase}. @public */
export type RelationshipBroadPhase = SubstrateRelationshipBroadPhase;
/** Re-published substrate vocabulary: {@link SubstrateRelationshipEvidence}. @public */
export type RelationshipEvidence = SubstrateRelationshipEvidence;
/** Re-published substrate vocabulary: {@link SubstrateRelationshipFinalEvidence}. @public */
export type RelationshipFinalEvidence = SubstrateRelationshipFinalEvidence;
/** Re-published substrate vocabulary: {@link SubstrateRelationshipWitness}. @public */
export type RelationshipWitness = SubstrateRelationshipWitness;
