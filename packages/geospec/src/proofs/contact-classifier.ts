/**
 * Contact-patch membership oracle (spatial-relationship blueprint R2).
 *
 * The contact-patch estimator classifies many points against the TARGET solid
 * (`in`/`on`/`out`) — the dominant cost, since OCCT `BRepClass3d_SolidClassifier`
 * degrades ~`O(faces_target^1.5..2)` and the target is the large casting
 * (measured 16 µs/point at 5 faces → 2.47 ms/point at 637 faces). This module
 * abstracts that membership behind a {@link ContactClassifier} so the estimator
 * runs either the exact OCCT classifier (default) or a fast generalized-winding
 * -number oracle over the target's own tessellation (reusing the void engine's
 * {@link buildWindingTree}/{@link fastWindingNumber}).
 *
 * FWN *wins* here — the opposite of the void per-claim verdict — because a
 * contact patch issues hundreds-to-thousands of queries per face against one
 * shell, amortising the `O(n log n)` Barnes-Hut build far above its ~log(n)
 * break-even. The winding field's 0.5 level-set maps onto OCCT's `in`/`on`/`out`
 * (see {@link contactWindingEpsilon}); seating verdicts come primarily from the
 * off-surface probe bracket (the crisp FWN region), so the threshold only
 * governs point-coincident and penetration calls. GWN is robust on the raw
 * per-face OCCT soup (no watertight healing), so the occurrence soup feeds the
 * tree directly.
 *
 * @module
 */

import type { OccurrenceMeshResult, Vec3 } from '#mesh/types.js';
import { buildWindingTree, fastWindingNumber, isWithinSurface } from '#proofs/winding-number.js';
import type { WindingMesh } from '#proofs/winding-number.js';

/** Point-in-solid state — matches the native `classifyPoints` payload. */
export type ClassificationState = 'in' | 'out' | 'on';

/** Seating outcome for one footprint sample against the target solid. */
export type SeatingOutcome = 'seat' | 'penetrate' | 'none';

/**
 * Decide seating for one footprint sample from its target state and the two
 * tolerance-probe states bracketing it along the subject surface normal — the
 * single seating rule shared by the sampling lattice (`countContactSamples`)
 * and the topological per-face engine (`estimateContactPatchTopological`), so
 * the two engines seat identically. A sample strictly `in` the target
 * penetrates (never clean seating); otherwise it seats when it is `on` the
 * target, or when the probe pair brackets the target boundary (one probe `on`,
 * or the two probes straddle in/out). `on`-only is a knife edge — two
 * STEP-round-tripped coincident surfaces sit ~1e-7 apart — so the probe bracket
 * carries the robust verdict.
 *
 * @param targetState - The footprint sample's state against the target solid.
 * @param plusState - The +tolerance probe state (undefined when no surface normal).
 * @param minusState - The −tolerance probe state (undefined when no surface normal).
 * @returns Whether the sample seats, penetrates, or neither.
 * @public
 */
export const classifySeating = (
  targetState: ClassificationState | undefined,
  plusState: ClassificationState | undefined,
  minusState: ClassificationState | undefined,
): SeatingOutcome => {
  if (targetState === 'in') {
    return 'penetrate';
  }
  if (targetState === 'on') {
    return 'seat';
  }
  const bracketed =
    plusState === 'on' ||
    minusState === 'on' ||
    (plusState !== minusState && plusState !== undefined && minusState !== undefined);
  return bracketed ? 'seat' : 'none';
};

/**
 * Point-membership oracle against one target solid. `classify` mirrors the
 * native `classifyPoints` contract — a `states` array positionally aligned with
 * the input points — or returns an `{ error }` the caller surfaces as
 * `unsupported`.
 *
 * @public
 */
export type ContactClassifier = {
  classify(points: Vec3[]): ClassificationState[] | { error: string };
};

/**
 * Exact OCCT membership oracle (the default engine): wraps `classifyPoints`
 * for one occurrence, behaviour-identical to the estimator's former inline call.
 *
 * @param native - The proof-time native surface (needs `classifyPoints`).
 * @param occurrence - The target occurrence index.
 * @returns A classifier backed by OCCT `BRepClass3d_SolidClassifier`.
 * @public
 */
export const occtContactClassifier = (
  native: { classifyPoints: (occurrence: number, pointsJson: string) => string },
  occurrence: number,
): ContactClassifier => ({
  classify: (points) => {
    const parsed = JSON.parse(native.classifyPoints(occurrence, JSON.stringify(points))) as {
      states?: ClassificationState[];
      error?: unknown;
    };
    if (typeof parsed.error === 'string') {
      return { error: parsed.error };
    }
    return parsed.states ?? [];
  },
});

/**
 * Fast generalized-winding-number membership oracle (the `winding`/`topological`
 * engines). Builds one Barnes-Hut tree over the target occurrence's raw triangle
 * soup, then classifies each query in `O(log n)`: a point within the `on` band
 * of the target surface (seating tolerance + twice the mesh deflection) is `on`,
 * decided by the tree's distance query ({@link isWithinSurface}) — the winding
 * number is a knife edge at the surface, so a coincident seat point would
 * otherwise read as deeply inside and trip the penetration short-circuit. Beyond
 * the band the winding number is crisp, so a plain 0.5 threshold decides in/out.
 * Returns `{ error }` when the occurrence mesh is unavailable or empty — the
 * caller then falls back to the OCCT oracle.
 *
 * @param mesh - The target occurrence tessellation (from `context.occurrenceMesh`).
 * @param options - `toleranceBand` is the seating tolerance folded into the `on` band.
 * @returns A winding-number classifier, or `{ error }` for the fallback ladder.
 * @public
 */
export const windingContactClassifier = (
  mesh: OccurrenceMeshResult,
  options?: {
    toleranceBand?: number;
    /**
     * CO-R6 (flag-gated): exact signed distance to the analytic target face.
     * When present, the `on` band tests this distance instead of the soup —
     * the target side carries no deflection slack, so the band tightens from
     * `tolerance + 2·deflection` to `tolerance + deflection` (the remaining
     * share covers the subject-side probes, which are still tessellated).
     */
    analyticOnDistance?: (point: Vec3) => number;
  },
): ContactClassifier | { error: string } => {
  if ('error' in mesh) {
    return { error: mesh.error };
  }
  const triangleCount = mesh.triangles.length / 9;
  if (triangleCount === 0) {
    return { error: 'occurrence-mesh-empty' };
  }
  // Un-indexed OCCT soup (9 doubles/triangle) → identity triVerts, stride 3,
  // exactly as the void hybrid engine feeds winding-number.ts.
  const triVerts = new Uint32Array(triangleCount * 3);
  for (let index = 0; index < triVerts.length; index += 1) {
    triVerts[index] = index;
  }
  const windingMesh: WindingMesh = { vertProperties: mesh.triangles, triVerts, stride: 3 };
  const tree = buildWindingTree(windingMesh);
  const onBand = (options?.toleranceBand ?? 0) + 2 * mesh.deflection;
  const analyticOnDistance = options?.analyticOnDistance;
  const analyticBand = (options?.toleranceBand ?? 0) + mesh.deflection;
  return {
    classify: (points) =>
      points.map((point) => {
        const on = analyticOnDistance
          ? Math.abs(analyticOnDistance(point)) <= analyticBand
          : isWithinSurface(point, tree, onBand);
        if (on) {
          return 'on';
        }
        return fastWindingNumber(point, tree) >= 0.5 ? 'in' : 'out';
      }),
  };
};
