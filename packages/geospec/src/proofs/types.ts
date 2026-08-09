/**
 * L4 relationship evidence types (SB4).
 *
 * A relationship proof returns a verdict with its evidence: an optional
 * labeled broad-phase record (AABB/mesh candidates — never a verdict source)
 * and a `final` exact-BRep record (extrema, analytic comparison, solid
 * classification, or boolean intersection) with measured/expected values and
 * witnesses. Units follow the shared selector tolerance contract: millimetres
 * and degrees, no unit suffixes in keys.
 *
 * @module
 */

import type { GeometryDiagnostic, Vec3 } from '#mesh/types.js';
import type { GeometrySelection } from '#selector/types.js';

/**
 * One geometric witness backing a relationship verdict.
 *
 * `value` layout by kind: `point` is `[x, y, z]`; `axis` is
 * `[ox, oy, oz, dx, dy, dz]`; `plane` is `[nx, ny, nz, offset]`.
 * `topologyRef` is the snapshot topology-ref string (`'#o1.2.f7'`) —
 * diagnostics and pinning only, never a durable reference.
 *
 * @public
 */
export type RelationshipWitness = {
  kind: 'point' | 'axis' | 'plane';
  value: number[];
  topologyRef?: string;
  /**
   * Where the witness points came from: absent = the exact BRep evaluator;
   * `'mesh'` = a realizable tessellation pair backing a certified-bound proof
   * (CR4) — honest reporting, never a verdict input.
   */
  provenance?: 'mesh';
};

/**
 * Labeled broad-phase record. Broad phase selects candidate pairs and feeds
 * diagnostics only; it never decides a relationship verdict (D3).
 *
 * @public
 */
export type RelationshipBroadPhase = {
  method: 'aabb' | 'mesh-overlap';
  candidate: boolean;
  detail: string;
};

/**
 * Final exact-evidence record for a relationship verdict.
 *
 * @public
 */
export type RelationshipFinalEvidence = {
  method: 'extrema' | 'analytic' | 'classification' | 'boolean-intersection' | 'mesh-distance-bound';
  /** Measured values in millimetres/degrees (shared unit contract). */
  measured: Record<string, number>;
  /** Expected values in millimetres/degrees (shared unit contract). */
  expected: Record<string, number>;
  witnesses: RelationshipWitness[];
};

/**
 * Structured result of one relationship proof (L4).
 *
 * @public
 */
export type RelationshipEvidence = {
  verdict: 'pass' | 'fail' | 'unsupported';
  broadPhase?: RelationshipBroadPhase;
  final?: RelationshipFinalEvidence;
  /** `GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH` on fail; policy codes otherwise. */
  diagnostics: GeometryDiagnostic[];
};

/**
 * Selector resolution summary attached to relationship diagnostics so every
 * failure names both endpoints with their stability class (R7).
 *
 * @public
 */
export type RelationshipEndpointReport = {
  role: 'subject' | 'target';
  selection: GeometrySelection;
};

/**
 * A native shape address: the occurrence index plus the 0-based face ordinal.
 *
 * @public
 */
export type NativeShapeRef = { occurrence: number; face: number };

/**
 * One subject face's contact-patch estimate against the target solid.
 *
 * @public
 */
export type ContactPatch = {
  /** True face area (mm²) from the resolved face facts. */
  faceArea: number;
  /** Sampled estimate (mm²): contacting fraction × faceArea. */
  patchArea: number;
  /** Quantization band (mm²). */
  band: number;
  /** Sampled footprint size. */
  footprint: number;
  /** Footprint samples within the contact tolerance. */
  contacting: number;
  /** Footprint samples inside the target solid. */
  penetrating: number;
  /** A contacting witness point, when any sample seats. */
  witness?: Vec3;
};

/**
 * Engine-agnostic resolution of a void-continuity claim.
 *
 * @public
 */
export type ResolvedVoidClaim = {
  waypoints: Vec3[];
  materialPaths: string[];
  region: { min: Vec3; max: Vec3 };
  resolution: number;
  isolatedFrom: Vec3[];
  minCrossSection?: number;
};
