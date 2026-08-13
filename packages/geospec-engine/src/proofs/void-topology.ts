/**
 * The canonical topological void engine.
 *
 * The claim's void is built exactly once as `region − ⋃material` through
 * Manifold, and then **decomposed**. The V3 lesson is that `decompose()`
 * returns SHELLS, not bodies: interior material yields a `+`outer shell and a
 * `−`cavity shell of the *same* body, and the V2 probe-argmax (membership by
 * the largest-volume shell) therefore read two sealed, disconnected voids as
 * one. The fix is two separate readings of the same per-shell generalized
 * winding numbers:
 *
 * - **openness** = Σ GWN over every shell (the sum is additive over surfaces,
 *   so a cavity's `−1` cancels its enclosing `+1` exactly);
 * - **body identity** = the per-shell SIGN VECTOR (two points are in the same
 *   void body only when every shell agrees about both of them).
 *
 * Any soundness gap — no tessellation fetcher, a soup Manifold rejects, an
 * empty void, a point balanced on a shell — answers `unsupported` with its
 * reason. It never falls back to another proof algorithm.
 *
 * The module top-level-awaits the Manifold instance (measured ~11 ms) so the
 * synchronous matcher path can build a solid without a race. A lazily loaded
 * module would make the FIRST topological claim in a process behave
 * differently from every later one, which §16 forbids.
 *
 * @module
 */

import type { Manifold as ManifoldSolid } from 'manifold-3d';
import { readEvidenceBytes, writeEvidenceBytes } from '#cache/evidence-cache.js';
import { decodeSections, encodeSections } from '#cache/section-codec.js';
import { ensureManifoldModule } from '#mesh/manifold-module.js';
import type { GeometryDiagnostic, Vec3 } from '#mesh/types.js';
import type { RelationshipProofContext } from '#proofs/context.js';
import { generalizedWindingNumber } from '#proofs/winding-number.js';
import { forensicSpan, forensicValue } from '#runner/forensic.js';
import { voidMismatch, voidUnsupported } from '#proofs/void-claim.js';
import type { ResolvedVoidClaim, VoidRegion } from '#proofs/void-claim.js';

const wasm = await ensureManifoldModule();

// oxlint-disable-next-line capitalized-comments -- Ponytail debt markers intentionally use the lowercase `ponytail:` tag.
// ponytail: `manifold-3d` re-exports these from `manifold.d.ts` with an
// extensionless relative specifier, which NodeNext consumers (apps/api resolves
// this package through its source `exports` entry) cannot follow, so the names
// arrive missing. Restate the two structural aliases instead of patching the
// dependency; drop them if manifold-3d ever ships extensioned type re-exports.
type Vec2 = [number, number];
type SimplePolygon = Vec2[];

/**
 * Fixed linear deflection used to tessellate material occurrences.
 */
export const voidTessellationDeflectionMm = 0.02;

/** Maximum distance between consecutive cross-section stations. */
export const voidSectionSpacingMm = 2;

/** A decomposed void shell in the Manifold mesh layout, at full double precision. */
export type VoidShellMesh = {
  vertProperties: Float64Array<ArrayBuffer>;
  triVerts: Uint32Array<ArrayBuffer>;
  stride: number;
};

/**
 * Whether every material sits STRICTLY inside the region on every axis.
 *
 * A material that crosses a region wall makes `region − material` an open
 * shell, and an open shell has no trustworthy inside — so the census records
 * it (CR1). It is telemetry, not a gate: a deliberately clipped region is a
 * legitimate claim.
 *
 * @param materials - The material solids.
 * @param region - The region being proven.
 * @returns True when every material is strictly interior.
 * @public
 */
export const materialsStrictlyInterior = (materials: readonly ManifoldSolid[], region: VoidRegion): boolean => {
  for (const material of materials) {
    const box = material.boundingBox();
    for (let axis = 0; axis < 3; axis++) {
      if (box.min[axis]! <= region.min[axis]! || box.max[axis]! >= region.max[axis]!) {
        return false;
      }
    }
  }
  return true;
};

/**
 * Whether every material pair is separated on at least one axis.
 *
 * @param materials - The material solids.
 * @returns True when no two material AABBs overlap.
 * @public
 */
export const materialsPairwiseAabbDisjoint = (materials: readonly ManifoldSolid[]): boolean => {
  const boxes = materials.map((material) => material.boundingBox());
  for (let left = 0; left < boxes.length; left++) {
    for (let right = left + 1; right < boxes.length; right++) {
      const a = boxes[left]!;
      const b = boxes[right]!;
      let separated = false;
      for (let axis = 0; axis < 3 && !separated; axis++) {
        separated = a.max[axis]! <= b.min[axis]! || b.max[axis]! <= a.min[axis]!;
      }
      if (!separated) {
        return false;
      }
    }
  }
  return true;
};

const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length === 0 ? [0, 0, 1] : [v[0] / length, v[1] / length, v[2] / length];
};

/**
 * Below this `d·z` the rotation taking `d` to `+Z` is antipodal: the Rodrigues
 * cross product vanishes and the formula divides by zero. The answer there is
 * the unique sane one — a 180° flip about X.
 */
const antipodalCosine = -1 + 1e-9;

/**
 * The rotation taking a unit direction onto `+Z`, as a column-major `Mat4`.
 *
 * @param direction - Unit direction to send to `+Z`.
 * @returns The 16-entry column-major affine matrix.
 * @public
 */
export const rotationToZ = (direction: Vec3): number[] => {
  const d = normalize(direction);
  if (d[2] < antipodalCosine) {
    // Antipodal: `d × z` is zero, so pick the canonical 180° X-flip.
    return [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];
  }
  // Rodrigues for v = d × z = (d_y, −d_x, 0), c = d · z = d_z.
  const [vx, vy] = [d[1], -d[0]];
  const c = d[2];
  const k = 1 / (1 + c);
  // [v]_x for v = (vx, vy, 0), then R = I + [v]_x + [v]_x² · k.
  const r00 = 1 + k * -(vy * vy);
  const r01 = k * (vx * vy);
  const r02 = vy;
  const r10 = k * (vx * vy);
  const r11 = 1 + k * -(vx * vx);
  const r12 = -vx;
  const r20 = -vy;
  const r21 = vx;
  const r22 = 1 + k * -(vx * vx + vy * vy);
  // Column-major: [col0, col1, col2, translation].
  return [r00, r10, r20, 0, r01, r11, r21, 0, r02, r12, r22, 0, 0, 0, 0, 1];
};

/**
 * Apply a column-major affine matrix to a point.
 *
 * @param matrix - The 16-entry column-major matrix.
 * @param point - The point.
 * @returns The transformed point.
 * @public
 */
export const applyMatrix = (matrix: readonly number[], point: Vec3): Vec3 => [
  matrix[0]! * point[0] + matrix[4]! * point[1] + matrix[8]! * point[2] + matrix[12]!,
  matrix[1]! * point[0] + matrix[5]! * point[1] + matrix[9]! * point[2] + matrix[13]!,
  matrix[2]! * point[0] + matrix[6]! * point[1] + matrix[10]! * point[2] + matrix[14]!,
];

/**
 * Even-odd point-in-polygon over one cross-section piece's contours.
 *
 * A decomposed piece is one outline plus its holes, so the crossing parity
 * over ALL its contours is the membership test.
 *
 * @param point - The 2D query point.
 * @param contours - The piece's contours.
 * @returns True when the point is inside the piece.
 * @public
 */
export const pointInPolygons = (point: Vec2, contours: readonly SimplePolygon[]): boolean => {
  let inside = false;
  for (const contour of contours) {
    for (let index = 0, previous = contour.length - 1; index < contour.length; previous = index++) {
      const a = contour[index]!;
      const b = contour[previous]!;
      if (
        a[1] > point[1] !== b[1] > point[1] &&
        point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
      ) {
        inside = !inside;
      }
    }
  }
  return inside;
};

/** The piece of a slice that contains the station, and its area. */
const sliceAreaAt = (rotated: ManifoldSolid, station: Vec3): number | undefined => {
  const slice = rotated.slice(station[2]);
  const pieces = slice.decompose();
  slice.delete();
  let area: number | undefined;
  for (const piece of pieces) {
    if (area === undefined && pointInPolygons([station[0], station[1]], piece.toPolygons())) {
      area = piece.area();
    }
    piece.delete();
  }
  return area;
};

/**
 * The tightest cross-section of the lumen the waypoints thread.
 *
 * Slices are perpendicular to the LOCAL segment direction — never the whole
 * path's chord, which would cut an oblique bore at an angle and over-report
 * its throat by `1/cos θ`. The slice is then narrowed to the piece the station
 * itself lies in (`decompose()` + point-in-polygon), so the surrounding void
 * cannot stand in for the lumen.
 *
 * The section is measured on the INSCRIBED tessellation of the wall, so it
 * under-reports a convex bore at every tessellation and converges up as the
 * mesh refines: a bounded, deterministic, fail-safe bias.
 *
 * @param options - The void solid, the ordered waypoints and the station
 * spacing.
 * @returns The tightest section and where it was measured, or `undefined` when
 * no station produced one.
 * @public
 */
export const lumenBottleneck = (options: {
  solid: ManifoldSolid;
  waypoints: readonly Vec3[];
}): { area: number; center: Vec3 } | undefined => {
  const { solid, waypoints } = options;
  let best: { area: number; center: Vec3 } | undefined;
  for (let segment = 0; segment + 1 < waypoints.length; segment++) {
    const from = waypoints[segment]!;
    const to = waypoints[segment + 1]!;
    const delta: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const length = Math.hypot(delta[0], delta[1], delta[2]);
    if (length === 0) {
      continue;
    }
    const matrix = rotationToZ(normalize(delta));
    const rotated = solid.transform(matrix as Parameters<ManifoldSolid['transform']>[0]);
    const steps = Math.max(1, Math.ceil(length / voidSectionSpacingMm));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const station = applyMatrix(matrix, [from[0] + delta[0] * t, from[1] + delta[1] * t, from[2] + delta[2] * t]);
      const area = sliceAreaAt(rotated, station);
      if (area !== undefined && (best === undefined || area < best.area)) {
        best = {
          area,
          center: [from[0] + delta[0] * t, from[1] + delta[1] * t, from[2] + delta[2] * t],
        };
      }
    }
    rotated.delete();
  }
  return best;
};

const shellFromSolid = (shell: ManifoldSolid): VoidShellMesh => {
  const mesh = shell.getMesh();
  return {
    vertProperties: Float64Array.from(mesh.vertProperties),
    triVerts: Uint32Array.from(mesh.triVerts),
    stride: mesh.numProp,
  };
};

const encodeShells = (shells: readonly VoidShellMesh[]): Uint8Array<ArrayBuffer> =>
  encodeSections(
    { shells: shells.map((shell) => ({ stride: shell.stride })) },
    shells.flatMap((shell) => [
      new Uint8Array(shell.vertProperties.buffer, shell.vertProperties.byteOffset, shell.vertProperties.byteLength),
      new Uint8Array(shell.triVerts.buffer, shell.triVerts.byteOffset, shell.triVerts.byteLength),
    ]),
  );

const decodeShells = (bytes: Uint8Array<ArrayBuffer>): VoidShellMesh[] | undefined => {
  const decoded = decodeSections(bytes);
  const header = decoded?.header as { shells?: Array<{ stride: number }> } | undefined;
  if (!decoded || !header?.shells || decoded.sections.length !== header.shells.length * 2) {
    return undefined;
  }
  return header.shells.map((entry, index) => {
    const vertices = decoded.sections[index * 2]!;
    const triangles = decoded.sections[index * 2 + 1]!;
    return {
      vertProperties: new Float64Array(vertices.buffer, vertices.byteOffset, vertices.byteLength / 8),
      triVerts: new Uint32Array(triangles.buffer, triangles.byteOffset, triangles.byteLength / 4),
      stride: entry.stride,
    };
  });
};

/**
 * Per-shell winding numbers, rounded — the sign vector that identifies a body.
 *
 * @param shells - The decomposed shells.
 * @param point - The query point.
 * @returns The rounded per-shell windings, their exact sum, and the residual
 * from the nearest integer (the on-boundary detector).
 * @public
 */
export const shellSignature = (
  shells: readonly VoidShellMesh[],
  point: Vec3,
): { signature: string; open: boolean; residual: number } => {
  let sum = 0;
  const signs: number[] = [];
  for (const shell of shells) {
    const winding = generalizedWindingNumber(point, shell);
    sum += winding;
    signs.push(Math.round(winding));
  }
  return { signature: signs.join(','), open: Math.round(sum) >= 1, residual: Math.abs(sum - Math.round(sum)) };
};

/** Beyond this distance from an integer the winding sum names no side at all. */
const openResidualLimit = 0.25;

type BuiltVoid = { shells: VoidShellMesh[]; solid?: ManifoldSolid };

const materialSolid = (context: RelationshipProofContext, occurrence: number): ManifoldSolid | undefined => {
  const soup = context.occurrenceMesh?.(occurrence, { deflection: voidTessellationDeflectionMm });
  if (!soup || soup.triangleCount === 0) {
    return undefined;
  }
  const vertProperties = Float32Array.from(soup.positions);
  const triVerts = Uint32Array.from({ length: vertProperties.length / 3 }, (_unused, index) => index);
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties, triVerts });
  mesh.merge();
  try {
    return new wasm.Manifold(mesh);
  } catch {
    // A soup Manifold rejects is a soundness gap, never a silent downgrade.
    return undefined;
  }
};

/**
 * Build the void solid and its decomposed shells.
 *
 * @param claim - The resolved claim.
 * @param context - The proof context.
 * @param keepSolid - Whether the live solid is needed after decomposition (a
 * cross-section claim slices it; a connectivity claim does not).
 * @returns The shells (and the solid when kept), or the refusal diagnostics.
 */
const buildVoid = (
  claim: ResolvedVoidClaim,
  context: RelationshipProofContext,
  keepSolid: boolean,
): BuiltVoid | { diagnostics: GeometryDiagnostic[] } => {
  const materials: ManifoldSolid[] = [];
  for (const occurrence of claim.materials) {
    const solid = materialSolid(context, occurrence);
    if (!solid) {
      for (const built of materials) {
        built.delete();
      }
      return {
        diagnostics: voidUnsupported(
          `The topological void engine could not build a closed solid for material occurrence '${claim.materialPaths[materials.length]}'.`,
          'Repair or re-export the part so its tessellation is a closed oriented surface.',
          { occurrence: claim.materialPaths[materials.length] },
        ),
      };
    }
    materials.push(solid);
  }

  forensicValue('void.census.build', 1, context.forensic);
  forensicValue('void.census.materials', materials.length, context.forensic);
  forensicValue('void.census.needsSolid', keepSolid ? 1 : 0, context.forensic);
  forensicValue('void.census.interior', materialsStrictlyInterior(materials, claim.region) ? 1 : 0, context.forensic);
  forensicValue('void.census.aabbDisjoint', materialsPairwiseAabbDisjoint(materials) ? 1 : 0, context.forensic);

  const size = claim.region.max.map((value, axis) => value - claim.region.min[axis]!) as unknown as Vec3;
  const region = wasm.Manifold.cube([size[0], size[1], size[2]], false).translate([
    claim.region.min[0],
    claim.region.min[1],
    claim.region.min[2],
  ]);
  const union = materials.length === 1 ? materials[0]! : wasm.Manifold.union(materials);
  const solid = region.subtract(union);
  region.delete();
  if (union !== materials[0]) {
    union.delete();
  }
  for (const material of materials) {
    material.delete();
  }

  if (solid.isEmpty()) {
    solid.delete();
    return {
      diagnostics: voidUnsupported(
        'The topological void engine found no void at all: the material fills the region.',
        'Widen `bounds`, or narrow the material set to the occurrences that actually bound the void.',
      ),
    };
  }
  const decomposed = forensicSpan('void.topology.build', () => solid.decompose(), context.forensic);
  const shells = decomposed.map((shell: ManifoldSolid) => shellFromSolid(shell));
  for (const shell of decomposed) {
    shell.delete();
  }
  if (!keepSolid) {
    solid.delete();
    return { shells };
  }
  return { shells, solid };
};

const shellCacheKey = (claim: ResolvedVoidClaim, contentHash: string): Record<string, unknown> => ({
  contentHash,
  materials: claim.materials,
  region: claim.region,
  deflection: voidTessellationDeflectionMm,
});

/**
 * Decide a void claim topologically.
 *
 * @param claim - The resolved claim.
 * @param context - The proof context.
 * @returns The diagnostics (empty = pass).
 * @public
 */
export const proveVoidTopological = (
  claim: ResolvedVoidClaim,
  context: RelationshipProofContext,
): GeometryDiagnostic[] => {
  if (!context.occurrenceMesh) {
    return voidUnsupported(
      'The topological void engine needs per-occurrence tessellation, which this subject does not provide.',
      'Load the subject through loadStep so the native STEP read can provide occurrence tessellation.',
    );
  }
  const needsSolid = claim.minCrossSection !== undefined;
  const cacheKey =
    context.subjectContentHash === undefined ? undefined : shellCacheKey(claim, context.subjectContentHash);

  let built: BuiltVoid | undefined;
  if (!needsSolid && cacheKey) {
    const cached = readEvidenceBytes('void-topology-shells', cacheKey);
    const shells = cached ? decodeShells(cached) : undefined;
    if (shells) {
      built = { shells };
    }
  }
  if (!built) {
    const fresh = buildVoid(claim, context, needsSolid);
    if ('diagnostics' in fresh) {
      return fresh.diagnostics;
    }
    built = fresh;
    if (!needsSolid && cacheKey) {
      writeEvidenceBytes('void-topology-shells', cacheKey, encodeShells(built.shells));
    }
  }

  try {
    return decide(claim, built);
  } finally {
    built.solid?.delete();
  }
};

const decide = (claim: ResolvedVoidClaim, built: BuiltVoid): GeometryDiagnostic[] => {
  const { shells } = built;
  const readings = claim.waypoints.map((point) => shellSignature(shells, point));
  for (const [index, reading] of readings.entries()) {
    if (reading.residual > openResidualLimit) {
      return voidUnsupported(
        `Void waypoint ${index} at [${claim.waypoints[index]!.join(', ')}] sits on a void boundary, so no side can be named.`,
        'Move the waypoint clear of the material surface.',
        { waypoint: claim.waypoints[index] },
      );
    }
    if (!reading.open) {
      return voidMismatch({
        message: `Void waypoint ${index} at [${claim.waypoints[index]!.join(', ')}] is inside material, not in the void.`,
        suggestion: 'Move the waypoint into the cavity, or correct the material set.',
        center: claim.waypoints[index],
        details: { waypoint: claim.waypoints[index] },
      });
    }
  }
  const first = readings[0]!;
  for (const [index, reading] of readings.entries()) {
    if (reading.signature !== first.signature) {
      return voidMismatch({
        message: `The void path is broken: waypoint ${index} at [${claim.waypoints[index]!.join(', ')}] lies in a different void body from waypoint 0.`,
        suggestion: 'Open the passage between the waypoints, or assert the two voids separately.',
        center: claim.waypoints[index],
        details: { waypoint: claim.waypoints[index] },
      });
    }
  }

  for (const probe of claim.isolatedFrom) {
    const reading = shellSignature(shells, probe);
    if (reading.residual > openResidualLimit || !reading.open) {
      return voidUnsupported(
        `The isolation probe [${probe.join(', ')}] is not in the void, so isolation from it would hold vacuously.`,
        'Place the isolation probe in the space that must stay unreachable.',
        { probe },
      );
    }
    if (reading.signature === first.signature) {
      return voidMismatch({
        message: `Void isolation breached: [${probe.join(', ')}] is reachable from the declared path void.`,
        suggestion: 'Seal the passage, or drop the isolation claim.',
        center: probe,
        details: { probe },
      });
    }
  }

  if (claim.minCrossSection === undefined) {
    return [];
  }
  const bottleneck = lumenBottleneck({
    solid: built.solid!,
    waypoints: claim.waypoints,
  });
  if (!bottleneck) {
    return voidUnsupported(
      'The topological void engine could not section the lumen along the declared path.',
      'Move the waypoints inside the passage being measured.',
    );
  }
  if (bottleneck.area >= claim.minCrossSection) {
    return [];
  }
  return voidMismatch({
    message: `The void lumen narrows to ${bottleneck.area.toFixed(3)} mm², below the declared ${claim.minCrossSection} mm² minimum cross-section.`,
    suggestion: 'Open the throat, or lower the declared minimum cross-section.',
    center: bottleneck.center,
    details: { measuredCrossSection: bottleneck.area, minCrossSection: claim.minCrossSection },
  });
};
