/**
 * CR2 rung B — the arrangement engine's containment branch
 * (`GEOSPEC_OVERLAP_ENGINE=arrangement`, default stays Manifold).
 *
 * The CR1 census split the 2,826 computed pair booleans into outcome classes;
 * this branch resolves the CONTAINMENT class in pure TS: when the two
 * surfaces provably never touch ({@link disjointBeyondMargin} — the same
 * rung-1 certificate the disjointness pre-filter uses) and every island of
 * one closed, consistently-oriented component probes inside the other, the
 * intersection volume is exactly the contained component's own volume — one
 * divergence-theorem sum, no boolean.
 *
 * Verdict-safety (class ii): every exit except a computed volume returns
 * `undefined`, and the caller falls back to the Manifold boolean — under the
 * arrangement engine's own evidence-family version, so payload provenance is
 * never cache-history-dependent (F-g). Every guard is a pure function of the
 * pair's geometry (F-a): closed/oriented flags, the deterministic rung-1
 * budget, and island classification. The rung-1 separation certificate also
 * guarantees every island probe sits more than the margin from the other
 * surface, where the exact winding evaluation is unconditionally
 * trustworthy — near-surface probes (the F-b confidently-wrong failure mode)
 * cannot occur here by construction.
 *
 * ponytail: mixed multi-island containment (one island in, one out) falls
 * back to Manifold — per-island volume splitting lands only if the census
 * ever shows the mixed class matters.
 */

import { disjointBeyondMargin, disjointnessMargin } from '#mesh/overlap-prefilter.js';
import type { ComponentDisjointnessData } from '#mesh/overlap-prefilter.js';
import { generalizedWindingNumber } from '#proofs/winding-number.js';
import type { AabbMeters, Vec3 } from '#mesh/types.js';

/** One side's island classification: every island in, every island out, or mixed. */
type IslandPlacement = 'all-inside' | 'all-outside' | 'mixed';

const classifyIslands = (
  subject: ComponentDisjointnessData,
  otherAabb: AabbMeters,
  other: ComponentDisjointnessData,
): IslandPlacement => {
  let inside = 0;
  let outside = 0;
  for (const island of subject.islands) {
    // A point set inside the other solid has its AABB inside the other's AABB
    // exactly — islands escaping the box are provably outside, probe-free.
    const escapes =
      island.min[0] < otherAabb.min[0] ||
      island.min[1] < otherAabb.min[1] ||
      island.min[2] < otherAabb.min[2] ||
      island.max[0] > otherAabb.max[0] ||
      island.max[1] > otherAabb.max[1] ||
      island.max[2] > otherAabb.max[2];
    if (escapes) {
      outside += 1;
    } else if (
      Math.abs(generalizedWindingNumber([island.probe[0], island.probe[1], island.probe[2]], other.winding)) >= 0.5
    ) {
      inside += 1;
    } else {
      outside += 1;
    }
    if (inside > 0 && outside > 0) {
      return 'mixed';
    }
  }
  return inside > 0 ? 'all-inside' : 'all-outside';
};

/**
 * Signed volume of a closed, consistently-oriented triangle soup by the
 * divergence theorem: `V = (1/6) Σ (a × b) · c`, accumulated in triangle
 * index order (deterministic FP).
 */
const signedSoupVolume = (soup: Float32Array): number => {
  let sum = 0;
  for (let base = 0; base + 8 < soup.length; base += 9) {
    const ax = soup[base]!;
    const ay = soup[base + 1]!;
    const az = soup[base + 2]!;
    const bx = soup[base + 3]!;
    const by = soup[base + 4]!;
    const bz = soup[base + 5]!;
    const cx = soup[base + 6]!;
    const cy = soup[base + 7]!;
    const cz = soup[base + 8]!;
    sum += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return sum / 6;
};

/**
 * The arrangement engine's pair volume: a containment-class exact volume, or
 * `undefined` when this pair is not (provably) in the containment class and
 * the Manifold boolean must decide.
 *
 * @internal
 */
export const arrangementPairVolume = (options: {
  leftAabb: AabbMeters;
  rightAabb: AabbMeters;
  left: ComponentDisjointnessData;
  right: ComponentDisjointnessData;
}): { volume: number; witnessPoint: Vec3 } | undefined => {
  // The divergence integral needs consistent orientation on BOTH sides (the
  // winding oracle needs closure on the container side anyway).
  if (!options.left.orientedClosed || !options.right.orientedClosed) {
    return undefined;
  }
  const margin = disjointnessMargin(options.leftAabb, options.rightAabb);
  if (disjointBeyondMargin(options.left, options.right, margin) !== true) {
    return undefined;
  }
  const leftPlacement = classifyIslands(options.left, options.rightAabb, options.right);
  const rightPlacement = classifyIslands(options.right, options.leftAabb, options.left);
  // The pre-filter's winding mesh carries each component's own soup.
  const contained =
    leftPlacement === 'all-inside' && rightPlacement === 'all-outside'
      ? { soup: options.left.winding.vertProperties as Float32Array, aabb: options.leftAabb }
      : rightPlacement === 'all-inside' && leftPlacement === 'all-outside'
        ? { soup: options.right.winding.vertProperties as Float32Array, aabb: options.rightAabb }
        : undefined;
  if (!contained) {
    // Disjoint pairs belong to the pre-filter's zero proof; mixed or mutually
    // undecidable placements go to the boolean.
    return undefined;
  }
  const volume = signedSoupVolume(contained.soup);
  if (volume <= 0) {
    // A non-positive signed sum means globally inverted orientation — let the
    // incumbent decide what such a solid's volume is.
    return undefined;
  }
  return {
    volume,
    // The intersection IS the contained solid, so its box centre matches the
    // boolean's `intersection.boundingBox()` witness semantics.
    witnessPoint: [
      (contained.aabb.min[0] + contained.aabb.max[0]) / 2,
      (contained.aabb.min[1] + contained.aabb.max[1]) / 2,
      (contained.aabb.min[2] + contained.aabb.max[2]) / 2,
    ],
  };
};
