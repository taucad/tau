/**
 * Topological contact-patch engine (spatial-relationship blueprint R1).
 *
 * Replaces the sampling lattice with the subject face's EXACT trimmed
 * triangulation (the `occurrenceFaceMesh` native facet): the footprint is the
 * face's own triangles, and seating is decided per triangle by the shared
 * membership oracle plus a tolerance-probe bracket ({@link classifySeating} —
 * the same seating rule the lattice uses). The contact patch is the seating
 * area fraction times the exact `faceFacts` area — no `G²` grid, and with the
 * fast winding-number oracle no OCCT `C(target)` explosion, so a face's cost
 * collapses from `O(G²·C(target))` to `O(triangles · log n)`.
 *
 * Returns `{ fallback }` when the per-face mesh is unavailable (pre-facet native
 * build) or degenerate — the caller then drops to the winding/classify lattice.
 * The choice is a pure function of the subject (§16 determinism), never of
 * timing or load, exactly like the void hybrid engine's fallback.
 *
 * @module
 */

import type { OccurrenceFaceMeshFetcher, Vec3 } from '#mesh/types.js';
import type { GeometryFacts } from '#selector/types.js';
import { chargeBudget } from '#runner/matcher-budget.js';
import { classifySeating } from '#proofs/contact-classifier.js';
import type { ClassificationState, ContactClassifier } from '#proofs/contact-classifier.js';
import type { ContactPatch, NativeShapeRef } from '#proofs/types.js';

type ContactTopologyInput = {
  expectation: { tolerance?: number };
  context: {
    occurrenceFaceMesh?: OccurrenceFaceMeshFetcher;
    tolerances: { linearMm: number };
  };
};

/**
 * Tessellation deflection for the subject face footprint: fine enough that the
 * triangulated area tracks the exact face and the ±tolerance probes clear the
 * mesh, clamped to the void engine's sane band.
 */
const faceMeshDeflection = (tolerance: number): number => Math.min(0.1, Math.max(0.005, tolerance / 2));

/** Angular tessellation tolerance for the face footprint (loader default). */
const faceMeshAngularToleranceDegrees = 15;

/**
 * Quantization-band divisor, matched to the sampling lattice's grid density
 * (`contactPatchGrid = 40`): the grid band is `faceArea / sqrt(footprint)` ≈
 * `faceArea / 40` for a covered face, so the topological band is that same
 * magnitude. It must NOT scale with triangle count — a flat face tessellates to
 * ~2 triangles yet its exact area carries no sampling noise, so a
 * `faceArea / sqrt(triangleCount)` band would balloon and weaken the verdict.
 */
const contactBandDivisor = 40;

/**
 * Estimate the contact-patch area between subject face A and target solid B
 * from A's exact trimmed triangulation (R1), classifying each triangle centroid
 * (plus two tolerance probes along the triangle normal) against B through the
 * shared membership oracle. The patch is the seating-area fraction times the
 * exact `faceFacts` area; penetration (`in` B) is measured separately and never
 * seats. Returns `{ fallback }` when the per-face mesh is missing/degenerate so
 * the caller drops to the lattice, `undefined` when the face carries no area
 * (an honest `unsupported`, mirroring the lattice estimator).
 *
 * @param options - Endpoints, subject face facts, the shared target oracle, and
 *   the R3 broad-phase `assumeNoContact` flag.
 * @returns The contact patch, a fallback signal, a native error, or undefined.
 * @public
 */
export const estimateContactPatchTopological = (options: {
  input: ContactTopologyInput;
  subject: NativeShapeRef;
  target: NativeShapeRef;
  facts: GeometryFacts;
  /** R2/CO-R1: the target oracle, built only when target work actually runs. */
  getTargetClassifier: () => ContactClassifier;
  assumeNoContact?: boolean;
}): ContactPatch | { fallback: string } | { error: string } | undefined => {
  const { input, subject, facts, assumeNoContact } = options;
  if (facts.area === undefined || facts.area <= 0) {
    return undefined;
  }
  const fetchFaceMesh = input.context.occurrenceFaceMesh;
  if (!fetchFaceMesh) {
    return { fallback: 'no-occurrence-face-mesh' };
  }
  const tolerance = input.expectation.tolerance ?? input.context.tolerances.linearMm;
  const mesh = fetchFaceMesh(subject.occurrence, subject.face, {
    linearDeflection: faceMeshDeflection(tolerance),
    angularDeflectionDegrees: faceMeshAngularToleranceDegrees,
  });
  if ('error' in mesh) {
    return { fallback: `occurrence-face-mesh: ${mesh.error}` };
  }
  const triangleCount = mesh.triangles.length / 9;
  if (triangleCount === 0) {
    return { fallback: 'occurrence-face-mesh-empty' };
  }
  const faceArea = facts.area;
  const band = faceArea / contactBandDivisor;

  const soup = mesh.triangles;
  const centroids: Vec3[] = [];
  const areas: number[] = [];
  const normals: Array<Vec3 | undefined> = [];
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const base = triangle * 9;
    const ax = soup[base]!;
    const ay = soup[base + 1]!;
    const az = soup[base + 2]!;
    const bx = soup[base + 3]!;
    const by = soup[base + 4]!;
    const bz = soup[base + 5]!;
    const cx = soup[base + 6]!;
    const cy = soup[base + 7]!;
    const cz = soup[base + 8]!;
    centroids.push([(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3]);
    // Area-weighted normal = ½ (B−A) × (C−A); its length is the triangle area.
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    areas.push(length / 2);
    normals.push(length > 0 ? [nx / length, ny / length, nz / length] : undefined);
  }
  const totalArea = areas.reduce((sum, area) => sum + area, 0);

  // R3 broad-phase: a face beyond the contact tolerance seats nothing — skip
  // the dominant target classification while keeping footprint/band identical.
  // (The face mesh above is still fetched: `footprint` is its triangle count,
  // so hoisting this return would change the stored patch — and the fetch is
  // memoized on the subject (R4), so a repeat costs nothing.)
  if (assumeNoContact) {
    return { faceArea, patchArea: 0, band, footprint: triangleCount, contacting: 0, penetrating: 0 };
  }

  // R2/CO-R1: the oracle materializes only past the pruned/cached exits.
  const targetClassifier = options.getTargetClassifier();
  chargeBudget(triangleCount);
  const centroidStates = targetClassifier.classify(centroids);
  if (!Array.isArray(centroidStates)) {
    return centroidStates;
  }
  const probePlus: Vec3[] = [];
  const probeMinus: Vec3[] = [];
  const probePosition = new Map<number, number>();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const normal = normals[triangle];
    if (!normal) {
      continue;
    }
    const centroid = centroids[triangle]!;
    probePosition.set(triangle, probePlus.length);
    probePlus.push([
      centroid[0] + normal[0] * tolerance,
      centroid[1] + normal[1] * tolerance,
      centroid[2] + normal[2] * tolerance,
    ]);
    probeMinus.push([
      centroid[0] - normal[0] * tolerance,
      centroid[1] - normal[1] * tolerance,
      centroid[2] - normal[2] * tolerance,
    ]);
  }
  let plusStates: readonly ClassificationState[] = [];
  let minusStates: readonly ClassificationState[] = [];
  if (probePlus.length > 0) {
    chargeBudget(probePlus.length + probeMinus.length);
    const plus = targetClassifier.classify(probePlus);
    if (!Array.isArray(plus)) {
      return plus;
    }
    const minus = targetClassifier.classify(probeMinus);
    if (!Array.isArray(minus)) {
      return minus;
    }
    plusStates = plus;
    minusStates = minus;
  }

  let seatingArea = 0;
  let contacting = 0;
  let penetrating = 0;
  let witness: Vec3 | undefined;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const position = probePosition.get(triangle);
    const outcome = classifySeating(
      centroidStates[triangle],
      position === undefined ? undefined : plusStates[position],
      position === undefined ? undefined : minusStates[position],
    );
    if (outcome === 'penetrate') {
      penetrating += 1;
      continue;
    }
    if (outcome === 'seat') {
      contacting += 1;
      seatingArea += areas[triangle]!;
      witness ??= centroids[triangle];
    }
  }
  // Seating fraction times the EXACT face area (matches the lattice estimator's
  // contacting-fraction × faceArea), area-weighted so large triangles count for
  // proportionally more of the patch.
  const patchArea = totalArea > 0 ? (seatingArea / totalArea) * faceArea : 0;
  return {
    faceArea,
    patchArea,
    band,
    footprint: triangleCount,
    contacting,
    penetrating,
    ...(witness ? { witness } : {}),
  };
};
