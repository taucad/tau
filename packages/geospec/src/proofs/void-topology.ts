/**
 * Topological void engine — SPIKE (research V2+V3, `GEOSPEC_VOID_ENGINE=topological`).
 *
 * The voxel engine answers a 1-D (path) + 2-D (cross-section) question on a 3-D
 * grid; that dimensional mismatch is its superlinear cost. This spike answers
 * the same claim with mesh topology, O(surface) not O(volume):
 *
 * 1. `void = regionBox − ⋃material` — one Manifold Boolean over the tessellated
 *    occurrences (the same tessellation the hybrid engine already uses).
 * 2. `void.decompose()` → the void's boundary shells. The generalized winding
 *    number (V3, {@link generalizedWindingNumber}) then decides membership:
 *    openness from the signed sum over shells, and connected-body identity from
 *    the per-shell sign vector. Connectivity/isolation are body-membership
 *    questions: all path waypoints in ONE body, no `isolatedFrom` point in it.
 * 3. Minimum cross-section — `void.slice(z)` at path stations, narrowed to the
 *    lumen piece around the path (`CrossSection.decompose()` + point-in-polygon),
 *    so the surrounding shell void never inflates the throat.
 *
 * WHY THE WINDING NUMBER (V3) — decompose returns SHELLS, not bodies, for
 * interior material: when a material occurrence is fully interior to the region
 * (the voxel engine's one-cell-inflated region always makes a single material
 * so), `subtract` produces a solid-with-cavity and `decompose` returns its
 * boundary shells — one positive outer shell spanning the whole region, plus a
 * negative shell per material cavity. The V2 probe-argmax mapped every interior
 * point to that one positive shell, so two DISCONNECTED sealed voids read as
 * connected. The winding number fixes this exactly: it is additive over
 * surfaces, so `Σ GWN(p, shell)` is `GWN(p, ∂void)` (1 in the void, 0 in
 * material — openness), and the per-shell sign vector is the cell id for the
 * arrangement of disjoint closed shells (connected-body identity). No probe
 * cubes, no watertight requirement.
 *
 * This is a VERDICT-MODEL MIGRATION, gated by the differential parity corpus:
 * connectivity/isolation should agree with the voxel engine at fine
 * tessellation, but the cross-section *number* is a continuous mesh area, not a
 * voxel-quantized estimate, so §16 semantics are re-vetted before it can ship.
 * It is never the default. Any soundness gap (Manifold unresolved, a
 * non-watertight occurrence, a degenerate region) returns `unsupported` with a
 * clear reason rather than silently running the voxel engine, so a forced-engine
 * parity run always knows which engine produced the verdict.
 *
 * Known spike limitations (tracked before graduation):
 * - Winding number is computed directly (O(triangles) per query); the Barnes-Hut
 *   tree that makes it O(log n) — the "Fast" in Barill 2018 — is deferred (V3
 *   perf productionization). Correctness does not depend on it.
 * - Cross-section slices along Z only; a path not aligned to Z needs
 *   rotate-to-axis (V4). The Z-bore parity fixtures exercise the real throat.
 *
 * @module
 */

import type { Manifold as ManifoldSolid, ManifoldToplevel } from 'manifold-3d';
import { getGeoSpecEvidenceCache } from '#cache/evidence-cache.js';
import type { GeoSpecEvidenceCodec } from '#cache/evidence-cache.js';
import {
  decodeSectionedPayload,
  encodeSectionedPayload,
  sectionToFloat64,
  sectionToUint32,
  typedArrayBytes,
} from '#cache/section-codec.js';
import { getManifoldModuleSync } from '#mesh/manifold-module.js';
import type { GeometryDiagnostic, OccurrenceMeshFetcher, Vec3 } from '#mesh/types.js';
import { selectorDiagnosticCodes } from '#selector/diagnostics.js';
import { chargeBudget } from '#runner/matcher-budget.js';
import { forensicCount, forensicEnabled, forensicSync } from '#runner/forensic.js';
import type { RelationshipProofContext } from '#proofs/relationship-proofs.js';
import type { ResolvedVoidClaim } from '#proofs/types.js';
import { voidMeshAngularToleranceDegrees, voidMeshDeflection } from '#proofs/void-occupancy.js';
import { generalizedWindingNumber } from '#proofs/winding-number.js';

/** Triangles charged per work unit — mirrors the hybrid occupancy engine (R13). */
const trianglesPerWorkUnit = 64;

const unsupported = (message: string, suggestion: string, details?: Record<string, unknown>): GeometryDiagnostic => ({
  code: selectorDiagnosticCodes.unsupportedEvidence,
  severity: 'error',
  message,
  suggestion,
  ...(details ? { details } : {}),
});

const fail = (
  message: string,
  suggestion: string,
  options: { center?: Vec3; details: Record<string, unknown> },
): GeometryDiagnostic => ({
  code: 'GEOSPEC_VOID_CONTINUITY_MISMATCH',
  severity: 'error',
  message,
  suggestion,
  ...(options.center ? { spatial: { center: options.center } } : {}),
  details: options.details,
});

/**
 * Tessellate one occurrence and heal it into a watertight Manifold solid — the
 * same per-face merge the hybrid occupancy engine relies on.
 *
 * @param options - Manifold module, tessellator, occurrence index, resolution.
 * @returns The healed solid, or a `fallback` reason (never a guess) when the
 *   soup will not close.
 */
const occurrenceSolid = (options: {
  module: ManifoldToplevel;
  fetchMesh: OccurrenceMeshFetcher;
  occurrence: number;
  resolution: number;
}): { manifold: ManifoldSolid } | { fallback: string } => {
  const { module, fetchMesh, occurrence, resolution } = options;
  const mesh = fetchMesh(occurrence, {
    linearDeflection: voidMeshDeflection(resolution),
    angularDeflectionDegrees: voidMeshAngularToleranceDegrees,
  });
  if ('error' in mesh) {
    return { fallback: `tessellation: ${mesh.error}` };
  }
  const triangleCount = mesh.triangles.length / 9;
  if (triangleCount === 0) {
    return { fallback: 'empty-tessellation' };
  }
  chargeBudget(Math.ceil(triangleCount / trianglesPerWorkUnit));
  const vertProperties = new Float32Array(mesh.triangles);
  const triVerts = new Uint32Array(triangleCount * 3);
  for (let index = 0; index < triVerts.length; index += 1) {
    triVerts[index] = index;
  }
  const meshGl = new module.Mesh({ numProp: 3, vertProperties, triVerts });
  meshGl.merge();
  try {
    const manifold = new module.Manifold(meshGl);
    if (manifold.isEmpty()) {
      manifold.delete();
      return { fallback: 'empty-manifold' };
    }
    return { manifold };
  } catch (error) {
    return { fallback: `manifold-construction: ${error instanceof Error ? error.message : String(error)}` };
  }
};

/**
 * Even-odd point-in-polygon over a CrossSection piece's loops (holes excluded).
 *
 * @param polygons - The piece's boundary loops (outer + holes).
 * @param x - Query X.
 * @param y - Query Y.
 * @returns True when (x, y) is inside the piece.
 */
const pointInPolygons = (
  polygons: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  x: number,
  y: number,
): boolean => {
  let inside = false;
  for (const polygon of polygons) {
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
      const [xi, yi] = polygon[index]!;
      const [xj, yj] = polygon[previous]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
};

/**
 * CR1 census: whether every material solid sits strictly inside the region box
 * — the α precondition for CR6's boolean-free shell construction (a material
 * crossing the region wall must keep the subtract, which clips it).
 *
 * @internal
 */
export const materialsStrictlyInterior = (
  materials: readonly ManifoldSolid[],
  region: { min: Vec3; max: Vec3 },
): boolean =>
  materials.every((material) => {
    const box = material.boundingBox();
    for (let axis = 0; axis < 3; axis += 1) {
      if (box.min[axis]! <= region.min[axis]! || box.max[axis]! >= region.max[axis]!) {
        return false;
      }
    }
    return true;
  });

/**
 * CR1 census: pairwise material AABB separation — the cheap sufficient screen
 * for CR6's β precondition (touching materials clamshell cavities, so only
 * provably separated material sets may skip the union+subtract).
 *
 * @internal
 */
export const materialsPairwiseAabbDisjoint = (materials: readonly ManifoldSolid[]): boolean => {
  const boxes = materials.map((material) => material.boundingBox());
  for (let index = 0; index < boxes.length; index += 1) {
    for (let other = index + 1; other < boxes.length; other += 1) {
      const a = boxes[index]!;
      const b = boxes[other]!;
      let separated = false;
      for (let axis = 0; axis < 3 && !separated; axis += 1) {
        separated = a.max[axis]! < b.min[axis]! || b.max[axis]! < a.min[axis]!;
      }
      if (!separated) {
        return false;
      }
    }
  }
  return true;
};

/** One decomposed void-boundary shell soup (the winding oracle's input). */
type VoidShellMesh = {
  vertProperties: Float64Array<ArrayBuffer>;
  triVerts: Uint32Array<ArrayBuffer>;
  stride: number;
};

// R5: shells persist as JSON header (strides) + two binary sections per shell.
const voidShellMeshesCodec: GeoSpecEvidenceCodec<VoidShellMesh[]> = {
  encode: (shells) =>
    encodeSectionedPayload(
      { shells: shells.map((shell) => ({ stride: shell.stride })) },
      shells.flatMap((shell) => [typedArrayBytes(shell.vertProperties), typedArrayBytes(shell.triVerts)]),
    ),
  decode: (bytes) => {
    const { header, sections } = decodeSectionedPayload(bytes);
    const meta = (header as { shells: Array<{ stride: number }> }).shells;
    if (sections.length !== meta.length * 2) {
      throw new Error('void-topology-shells payload sections mismatch.');
    }
    return meta.map((shell, index) => ({
      vertProperties: sectionToFloat64(sections[index * 2]!),
      triVerts: sectionToUint32(sections[index * 2 + 1]!),
      stride: shell.stride,
    }));
  },
};

/**
 * Prove a void-continuity claim by mesh topology instead of a voxel flood.
 *
 * @param claim - The engine-agnostic resolved claim (shared with the voxel engine).
 * @param context - Per-subject proof context (occurrence tessellator + index).
 * @returns The verdict diagnostics (empty = pass), matching the voxel contract.
 * @public
 */
export const proveVoidTopology = (
  claim: ResolvedVoidClaim,
  context: RelationshipProofContext,
): GeometryDiagnostic[] => {
  const module = getManifoldModuleSync();
  if (!module) {
    return [
      unsupported(
        'void-topology needs the Manifold module resolved before proof time; it is not.',
        'Load the subject through loadStep (which preloads Manifold), or use the default voxel engine, which needs no preload.',
      ),
    ];
  }
  const fetchMesh = context.occurrenceMesh;
  if (!fetchMesh) {
    return [
      unsupported(
        'void-topology needs per-occurrence tessellation; this native build exposes none.',
        'Use a native BRep subject (occurrenceMeshTriangles), or the default voxel engine.',
      ),
    ];
  }
  const { waypoints, materialPaths, region, resolution, isolatedFrom, minCrossSection } = claim;
  const size: Vec3 = [region.max[0] - region.min[0], region.max[1] - region.min[1], region.max[2] - region.min[2]];
  if (!(size[0] > 0 && size[1] > 0 && size[2] > 0)) {
    return [
      unsupported(
        `void-topology region is degenerate (${size.join(' x ')} mm).`,
        'Declare bounds { min, max } with positive extent on every axis.',
      ),
    ];
  }

  // Own every long-lived Manifold; per-probe/per-slice temporaries free themselves.
  const owned: ManifoldSolid[] = [];
  const own = (manifold: ManifoldSolid): ManifoldSolid => {
    owned.push(manifold);
    return manifold;
  };
  try {
    // R5 (suite audit): the decomposed shell soups are a pure function of
    // (subject content, material paths, region, resolution) — persist them so
    // warm connectivity/isolation claims skip the whole Manifold build. The
    // cross-section branch needs the LIVE void solid, and whether a claim has
    // one is a pure function of the claim itself — those claims always build.
    const cache = getGeoSpecEvidenceCache();
    const shellsKey =
      cache && context.subjectContentHash !== undefined
        ? {
            subjectHash: context.subjectContentHash,
            materialPaths: [...materialPaths],
            region,
            resolution,
          }
        : undefined;
    const needsSolid = minCrossSection !== undefined && waypoints.length >= 2;
    let shellMeshes =
      !needsSolid && cache && shellsKey
        ? cache.getOrCompute<VoidShellMesh[]>({
            family: 'void-topology-shells',
            version: 1,
            key: shellsKey,
            codec: voidShellMeshesCodec,
            compute: () => undefined,
          })
        : undefined;
    let voidSolid: ManifoldSolid | undefined;
    if (!shellMeshes) {
      const build = forensicSync(
        'void.topology.build',
        (): { voidSolid: ManifoldSolid } | { unsupported: GeometryDiagnostic } => {
          chargeBudget(1);
          const regionSolid = own(module.Manifold.cube(size, false).translate(region.min));
          const materials: ManifoldSolid[] = [];
          for (const path of materialPaths) {
            const occurrence = context.occurrenceIndexByPath.get(path);
            if (occurrence === undefined) {
              return {
                unsupported: unsupported(
                  `void-topology material occurrence '${path}' is not bound to the STEP-XDE structure.`,
                  'Select material occurrence names that exist in the subject.',
                ),
              };
            }
            const solid = occurrenceSolid({ module, fetchMesh, occurrence, resolution });
            if ('fallback' in solid) {
              return {
                unsupported: unsupported(
                  `void-topology could not build a watertight solid for material '${path}': ${solid.fallback}.`,
                  'Use the default voxel engine for this subject; the topological engine needs each material to close as a manifold.',
                ),
              };
            }
            materials.push(own(solid.manifold));
          }
          // CR1 census (CR6 go/no-go): count how many builds a boolean-free
          // shell construction could serve — strictly-interior, pairwise-
          // separated materials on a claim that never needs the live solid.
          if (forensicEnabled()) {
            forensicCount('void.census.build', 1);
            forensicCount('void.census.materials', materials.length);
            forensicCount('void.census.needsSolid', needsSolid ? 1 : 0);
            forensicCount('void.census.interior', materialsStrictlyInterior(materials, region) ? 1 : 0);
            forensicCount('void.census.aabbDisjoint', materialsPairwiseAabbDisjoint(materials) ? 1 : 0);
          }
          chargeBudget(materials.length);
          const materialUnion = materials.length === 1 ? materials[0]! : own(module.Manifold.union(materials));
          chargeBudget(1);
          return { voidSolid: own(regionSolid.subtract(materialUnion)) };
        },
      );
      if ('unsupported' in build) {
        return [build.unsupported];
      }

      voidSolid = build.voidSolid;
      const builtSolid = voidSolid;
      // Void boundary SHELLS from decompose — ALL of them (outer + every material
      // cavity), because the winding-number oracle (research V3) needs the full
      // boundary. When material is fully interior to the region (the voxel
      // engine's inflated region always makes a single material so), `subtract`
      // yields a solid-with-cavity whose decompose returns boundary shells: a
      // positive outer shell (the whole region) plus a negative shell per material
      // cavity. Each shell's triangle soup is snapshotted here (getMesh copies out
      // of wasm) so the winding number can be evaluated after the manifolds are
      // disposed.
      const decomposed: VoidShellMesh[] = builtSolid.isEmpty()
        ? []
        : forensicSync('void.topology.decompose', () => {
            chargeBudget(1);
            return builtSolid.decompose().map((shell: ManifoldSolid) => {
              own(shell);
              const mesh = shell.getMesh();
              return {
                vertProperties: new Float64Array(mesh.vertProperties),
                triVerts: new Uint32Array(mesh.triVerts),
                stride: mesh.numProp,
              };
            });
          });
      shellMeshes = decomposed;
      if (cache && shellsKey) {
        cache.getOrCompute({
          family: 'void-topology-shells',
          version: 1,
          key: shellsKey,
          codec: voidShellMeshesCodec,
          compute: () => decomposed,
        });
      }
    }
    forensicCount('void.topology.shells', shellMeshes.length);

    // Winding-number membership (V3): one O(surface) pass per point over the
    // shells decides BOTH openness and body identity, with no probe cubes and no
    // watertight requirement. The winding number is additive over surfaces, so
    // `Σ GWN(p, shell)` is `GWN(p, ∂void)` — round to 1 inside the void, 0 in
    // material. The per-shell sign VECTOR names the connected void body: disjoint
    // closed shells partition space into cells, so two points share a body iff
    // they share the vector. This is exact where the V2 probe-argmax collapsed —
    // a point in a sealed interior void and one in the surrounding shell differ
    // on the cavity shell's sign even though both sit inside the one positive
    // region shell.
    const classify = (point: Vec3): { open: boolean; signature: string } => {
      chargeBudget(1);
      let sum = 0;
      const signs: number[] = [];
      for (const mesh of shellMeshes) {
        const winding = generalizedWindingNumber(point, mesh);
        sum += winding;
        signs.push(Math.round(winding));
      }
      return { open: Math.round(sum) >= 1, signature: signs.join(',') };
    };

    return forensicSync('void.topology.verdict', () => {
      // Connectivity: every waypoint open, all in one body (same shell signature).
      const classified = waypoints.map((point) => ({ point, ...classify(point) }));
      const buried = classified.findIndex((entry) => !entry.open);
      if (buried !== -1) {
        const entry = classified[buried]!;
        return [
          fail(
            `void-topology waypoint ${buried} at [${entry.point.join(', ')}] is inside material (not in open void).`,
            'Move the waypoint into the void it should mark, or refine the region bounds.',
            { center: entry.point, details: { waypointIndex: buried, waypoint: entry.point, engine: 'topological' } },
          ),
        ];
      }
      const pathSignature = classified[0]!.signature;
      const disconnected = classified.findIndex((entry) => entry.signature !== pathSignature);
      if (disconnected !== -1) {
        const entry = classified[disconnected]!;
        return [
          fail(
            `void-topology path is broken: waypoint ${disconnected} at [${entry.point.join(', ')}] is in a different void component than waypoint 0.`,
            'Ensure the void is continuous between these waypoints, or split the claim into the separately connected runs.',
            {
              center: entry.point,
              details: { waypointIndex: disconnected, waypoint: entry.point, engine: 'topological' },
            },
          ),
        ];
      }

      // Isolation: no isolatedFrom point may share the path body.
      for (const [order, point] of isolatedFrom.entries()) {
        const probe = classify(point);
        if (!probe.open) {
          return [
            unsupported(
              `void-topology isolatedFrom point ${order} at [${point.join(', ')}] is inside material, not an open space, so isolation cannot be decided.`,
              'Move the isolatedFrom point into the space it represents, or refine the region bounds.',
              { isolatedFromIndex: order, point, engine: 'topological' },
            ),
          ];
        }
        if (probe.signature === pathSignature) {
          return [
            fail(
              `void-topology isolation breached: isolatedFrom point ${order} at [${point.join(', ')}] is void-connected to the path.`,
              'Add wall between the path void and this space, or drop it from isolatedFrom.',
              { center: point, details: { isolatedFromIndex: order, point, engine: 'topological' } },
            ),
          ];
        }
      }

      // Cross-section: minimum lumen slice over path stations, sliced from the
      // whole void solid (not a decompose shell) and narrowed to the lumen piece
      // around the path (Z-slices; spike).
      if (minCrossSection !== undefined && waypoints.length >= 2) {
        // R5: `needsSolid` was true for exactly this claim shape, so the
        // persisted-shells fast path was skipped and the solid was built.
        const bottleneck = forensicSync('void.topology.crossSection', () =>
          lumenBottleneck({ solid: voidSolid!, waypoints, resolution }),
        );
        if (!bottleneck) {
          return [
            unsupported(
              'void-topology could not sample a lumen cross-section along the path; no slice piece contained a station.',
              'Verify the waypoints trace the void interior, or use a path with varying Z (the spike slices along Z).',
              { minCrossSection, engine: 'topological' },
            ),
          ];
        }
        if (bottleneck.area < minCrossSection) {
          return [
            fail(
              `void-topology bottleneck cross-section is ${bottleneck.area.toFixed(0)} mm², below the required ${minCrossSection} mm².`,
              'Widen the tightest section of the void, or lower the declared minimum cross-section.',
              {
                center: bottleneck.center,
                details: { measuredCrossSection: bottleneck.area, minCrossSection, engine: 'topological' },
              },
            ),
          ];
        }
      }

      return [];
    });
  } finally {
    for (const manifold of owned) {
      manifold.delete();
    }
  }
};

/**
 * Rotation (row-major 3×3) mapping unit direction `d` to +Z. Rodrigues about
 * axis `d × ẑ`, whose coefficient simplifies to `1/(1+d_z)`. The antipodal case
 * (`d ≈ −ẑ`) uses a 180° flip about X.
 */
const rotationAligningToZ = (dx: number, dy: number, dz: number): number[] => {
  if (dz < -1 + 1e-9) {
    return [1, 0, 0, 0, -1, 0, 0, 0, -1];
  }
  const k = 1 / (1 + dz);
  return [1 - dx * dx * k, -dx * dy * k, -dx, -dx * dy * k, 1 - dy * dy * k, -dy, dx, dy, dz];
};

/** Apply a row-major 3×3 rotation to a point. */
const applyRotation = (r: number[], point: Vec3): Vec3 => [
  r[0]! * point[0] + r[1]! * point[1] + r[2]! * point[2],
  r[3]! * point[0] + r[4]! * point[1] + r[5]! * point[2],
  r[6]! * point[0] + r[7]! * point[1] + r[8]! * point[2],
];

/** Column-major rotation Mat4 (no translation) for Manifold.transform. */
const rotationMat4 = (r: number[]): Parameters<ManifoldSolid['transform']>[0] => [
  r[0]!,
  r[3]!,
  r[6]!,
  0,
  r[1]!,
  r[4]!,
  r[7]!,
  0,
  r[2]!,
  r[5]!,
  r[8]!,
  0,
  0,
  0,
  0,
  1,
];

/**
 * Minimum lumen cross-section (mm²) over stations along the path. At each
 * station the void solid is sliced PERPENDICULAR TO THE LOCAL PATH DIRECTION
 * (V4): the segment is rotated to +Z so an oblique bore is measured across its
 * true throat, not an inflated diagonal cut. The slice is decomposed and the
 * piece containing the (rotated) station is the lumen — its `area()` net of
 * holes, rotation-invariant so the number is the true perpendicular section. The
 * surrounding shell void (a different slice piece) never contributes. The common
 * Z-aligned segment skips the transform entirely.
 *
 * Exported for the V4 arbitrary-axis harness (@internal); proof callers go
 * through {@link proveVoidTopology}.
 *
 * @param options - The void solid, path waypoints, and sampling resolution.
 * @returns The tightest lumen area (mm²) and its station (original frame), or
 *   `undefined` when no slice piece contained a station.
 */
export const lumenBottleneck = (options: {
  solid: ManifoldSolid;
  waypoints: Vec3[];
  resolution: number;
}): { area: number; center: Vec3 } | undefined => {
  const { solid, waypoints, resolution } = options;
  let best: { area: number; center: Vec3 } | undefined;
  // Lumen area of the slice piece of `sliced` (the solid rotated so the path is
  // +Z) containing the rotated station (its z is the slice height, x/y the probe).
  const lumenAreaAt = (sliced: ManifoldSolid, rotated: Vec3): number | undefined => {
    chargeBudget(1);
    const cross = sliced.slice(rotated[2]);
    try {
      if (cross.isEmpty()) {
        return undefined;
      }
      const pieces = cross.decompose();
      try {
        for (const piece of pieces) {
          if (pointInPolygons(piece.toPolygons(), rotated[0], rotated[1])) {
            return piece.area();
          }
        }
        return undefined;
      } finally {
        for (const piece of pieces) {
          piece.delete();
        }
      }
    } finally {
      cross.delete();
    }
  };
  for (let segment = 0; segment < waypoints.length - 1; segment += 1) {
    const from = waypoints[segment]!;
    const to = waypoints[segment + 1]!;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    const span = Math.hypot(dx, dy, dz);
    if (span === 0) {
      continue;
    }
    // Rotate so the segment direction becomes +Z (skip when it already is).
    const aligned = dz / span > 1 - 1e-9;
    const rotation = aligned ? undefined : rotationAligningToZ(dx / span, dy / span, dz / span);
    const sliced = rotation ? solid.transform(rotationMat4(rotation)) : solid;
    try {
      const stations = Math.max(1, Math.round(span / resolution));
      for (let station = 0; station <= stations; station += 1) {
        const t = station / stations;
        const point: Vec3 = [from[0] + dx * t, from[1] + dy * t, from[2] + dz * t];
        const rotated = rotation ? applyRotation(rotation, point) : point;
        const area = lumenAreaAt(sliced, rotated);
        if (area !== undefined && area > 0 && (!best || area < best.area)) {
          best = { area, center: point };
        }
      }
    } finally {
      if (rotation) {
        sliced.delete();
      }
    }
  }
  return best;
};
