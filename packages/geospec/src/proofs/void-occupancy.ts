/**
 * Hybrid void-occupancy engine (throughput blueprint R6 move 3, per the
 * hybrid-wasm-matcher architecture doc).
 *
 * Replaces the bulk of per-voxel exact BRep classification with mesh-derived
 * occupancy, reserving exact classification for the verdict-bearing boundary
 * band (geospec-policy §17/§19: mesh CSG where topology is bulk work, exact
 * BRep where sub-tolerance exactness governs):
 *
 * 1. Tessellate the occurrence's AP242-read BRep (§21 substrate) at a
 *    deterministic density tied to the claim resolution; the native facet
 *    reports the achieved deflection floored at the request.
 * 2. Band = every cell whose centre lies within `2·deflection + slack` of
 *    the mesh surface (triangle-AABB candidates, then true point-to-triangle
 *    distance so the band stays one surface-shell thin). These cells are the
 *    only place mesh and exact classification can disagree, and the caller
 *    classifies them EXACTLY through the unchanged native path.
 * 3. Every other cell is farther from the mesh surface than the mesh↔BRep
 *    Hausdorff bound, so its exact membership equals its mesh membership:
 *    decided by even-odd parity against Manifold's robust planar slice of
 *    the watertight mesh, one slice per grid layer, 2-D scanline fill in JS.
 *
 * The result is exact-equivalent per cell — the downstream flood /
 * cross-section machinery and every verdict stay bit-identical to the pure
 * exact engine — while exact classification cost drops from O(range volume)
 * to O(surface area).
 *
 * Every failure mode here returns `{ fallback }`: the caller runs the pure
 * exact scan instead. The hybrid path can only ever reduce cost, never
 * change a verdict; fallback choice is a pure function of the claim and the
 * subject (§16 determinism), never of timing or load.
 *
 * @module
 */

import type { Manifold as ManifoldSolid } from 'manifold-3d';
import { getManifoldModuleSync } from '#mesh/manifold-module.js';
import type { OccurrenceMeshResult, Vec3 } from '#mesh/types.js';
import { chargeBudget } from '#runner/matcher-budget.js';
import { forensicCount } from '#runner/forensic.js';

/** Uniform voxel grid (subject frame, mm) — structurally the proof grid. */
export type VoidOccupancyGrid = {
  origin: Vec3;
  resolution: number;
  dims: [number, number, number];
};

/** Inclusive integer cell sub-box of the grid scanned for one occurrence. */
export type VoidOccupancyRange = {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
};

/**
 * Mesh-derived occupancy for one occurrence over one cell range.
 *
 * `meshClosed` and `bandCells` are disjoint, each ascending in grid linear
 * index. The caller classifies `bandCells` exactly and merges the two closed
 * streams so the final closed set is bit-identical to a pure exact scan.
 */
export type VoidMeshOccupancy = {
  meshClosed: number[];
  bandCells: number[];
  triangleCount: number;
  deflection: number;
  band: number;
};

/**
 * Deterministic tessellation density for the hybrid engine, tied to the
 * claim's sampling resolution (hybrid-architecture R6).
 *
 * The band's exact-classification cost dominates on heavy castings (~10–17 ms
 * per `classifyPoints` point on the block / intake manifold), and band cell
 * count scales ~linearly with the band width (≈ 2·deflection). Occupancy
 * (tessellate + Manifold slice + distance marking) is only ~1–4 s per
 * occurrence and scales with triangle count (≈ 1/deflection), so a fine
 * deflection trades cheap occupancy for a much thinner, far cheaper band.
 * Measured: the tessellation is LINEAR-limited (achieved == requested at the
 * default 15° angular tolerance), so `resolution/96` on a 2 mm claim hits
 * ~0.021 mm (band ~0.043 mm) and cut the block's REQ-006 band from ~32 k exact
 * points to ~11 k. Floored at 0.02 mm so a fine claim cannot explode a heavy
 * part's mesh.
 */
export const voidMeshDeflection = (resolution: number): number => Math.min(0.1, Math.max(0.02, resolution / 96));

/** Angular tessellation tolerance (degrees) — the loader's own default. */
export const voidMeshAngularToleranceDegrees = 15;

/**
 * Work-unit pricing (R13): mesh occupancy costs roughly two orders of
 * magnitude less per cell than exact BRep classification, and its unit
 * charges say so — one unit per 64 rasterized cells, one per 64 triangles
 * fed to Manifold. Exact band classification keeps charging 1 unit per
 * point through the caller's unchanged native path.
 */
const cellsPerWorkUnit = 64;
const trianglesPerWorkUnit = 64;

type LayerRasterInput = {
  grid: VoidOccupancyGrid;
  range: VoidOccupancyRange;
  bandMask: Uint8Array<ArrayBuffer>;
  meshClosed: number[];
};

const localDims = (range: VoidOccupancyRange): [number, number, number] => [
  range.x1 - range.x0 + 1,
  range.y1 - range.y0 + 1,
  range.z1 - range.z0 + 1,
];

/**
 * Squared distance from point P to triangle ABC (Ericson, Real-Time Collision
 * Detection §5.1.5: closest point by Voronoi-region classification). Exact
 * over all seven regions — verdict-bearing: an under-estimate here would let
 * a near-surface cell be decided by the mesh where mesh and exact BRep can
 * disagree, so this must be the true distance, not a plane/AABB proxy.
 */
const distanceSquaredPointTriangle = (
  point: readonly [number, number, number],
  triangles: Float64Array<ArrayBuffer>,
  base: number,
): number => {
  const [px, py, pz] = point;
  const ax = triangles[base]!;
  const ay = triangles[base + 1]!;
  const az = triangles[base + 2]!;
  const bx = triangles[base + 3]!;
  const by = triangles[base + 4]!;
  const bz = triangles[base + 5]!;
  const cx = triangles[base + 6]!;
  const cy = triangles[base + 7]!;
  const cz = triangles[base + 8]!;
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) {
    return apx * apx + apy * apy + apz * apz; // Vertex A.
  }
  const bpx = px - bx;
  const bpy = py - by;
  const bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) {
    return bpx * bpx + bpy * bpy + bpz * bpz; // Vertex B.
  }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const t = d3 === d1 ? 0 : d1 / (d1 - d3); // Edge AB (degenerate-safe).
    const dx = apx - t * abx;
    const dy = apy - t * aby;
    const dz = apz - t * abz;
    return dx * dx + dy * dy + dz * dz;
  }
  const cpx = px - cx;
  const cpy = py - cy;
  const cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) {
    return cpx * cpx + cpy * cpy + cpz * cpz; // Vertex C.
  }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const t = d6 === d2 ? 0 : d2 / (d2 - d6); // Edge AC (degenerate-safe).
    const dx = apx - t * acx;
    const dy = apy - t * acy;
    const dz = apz - t * acz;
    return dx * dx + dy * dy + dz * dz;
  }
  const va = d3 * d6 - d5 * d4;
  const d43 = d4 - d3;
  const d56 = d5 - d6;
  if (va <= 0 && d43 >= 0 && d56 >= 0) {
    const t = d43 + d56 === 0 ? 0 : d43 / (d43 + d56); // Edge BC (degenerate-safe).
    const ex = px - (bx + t * (cx - bx));
    const ey = py - (by + t * (cy - by));
    const ez = pz - (bz + t * (cz - bz));
    return ex * ex + ey * ey + ez * ez;
  }
  const denominator = va + vb + vc;
  if (denominator === 0) {
    // Fully degenerate triangle: fall back to the nearest vertex (over-marks).
    const aSq = apx * apx + apy * apy + apz * apz;
    const bSq = bpx * bpx + bpy * bpy + bpz * bpz;
    const cSq = cpx * cpx + cpy * cpy + cpz * cpz;
    return Math.min(aSq, bSq, cSq);
  }
  const v = vb / denominator;
  const w = vc / denominator;
  const qx = ax + abx * v + acx * w; // Face interior.
  const qy = ay + aby * v + acy * w;
  const qz = az + abz * v + acz * w;
  const fx = px - qx;
  const fy = py - qy;
  const fz = pz - qz;
  return fx * fx + fy * fy + fz * fz;
};

/**
 * Mark every cell whose centre lies within `band` of a triangle. Candidates
 * come from each triangle's band-inflated AABB (cell centres at
 * origin + (i + 0.5)·resolution, ±1e-9 float-tie widening), then the TRUE
 * point-to-triangle distance keeps the mark tight: on a 2 mm grid with a
 * ~0.5 mm band the AABB alone over-marks ~4×, and every over-marked cell is
 * a needless exact classification — the hybrid engine's residual cost.
 * Distance slack only ever widens the band (over-marking is safe).
 */
const markBandCells = (options: {
  grid: VoidOccupancyGrid;
  range: VoidOccupancyRange;
  triangles: Float64Array<ArrayBuffer>;
  band: number;
  bandMask: Uint8Array<ArrayBuffer>;
}): void => {
  const { grid, range, triangles, band, bandMask } = options;
  const { origin, resolution } = grid;
  const [nx, ny] = localDims(range);
  const triangleCount = triangles.length / 9;
  const bandSquared = (band + 1e-9) * (band + 1e-9);
  // Scratch centre reused across the hot loop — no per-cell allocation.
  const center: [number, number, number] = [0, 0, 0];
  const axisLo = (value: number, originAxis: number): number =>
    Math.ceil((value - originAxis) / resolution - 0.5 - 1e-9);
  const axisHi = (value: number, originAxis: number): number =>
    Math.floor((value - originAxis) / resolution - 0.5 + 1e-9);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const base = triangle * 9;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const x = triangles[base + vertex * 3]!;
      const y = triangles[base + vertex * 3 + 1]!;
      const z = triangles[base + vertex * 3 + 2]!;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }
    const ix0 = Math.max(range.x0, axisLo(minX - band, origin[0]));
    const ix1 = Math.min(range.x1, axisHi(maxX + band, origin[0]));
    if (ix0 > ix1) {
      continue;
    }
    const iy0 = Math.max(range.y0, axisLo(minY - band, origin[1]));
    const iy1 = Math.min(range.y1, axisHi(maxY + band, origin[1]));
    if (iy0 > iy1) {
      continue;
    }
    const iz0 = Math.max(range.z0, axisLo(minZ - band, origin[2]));
    const iz1 = Math.min(range.z1, axisHi(maxZ + band, origin[2]));
    if (iz0 > iz1) {
      continue;
    }
    for (let iz = iz0; iz <= iz1; iz += 1) {
      center[2] = origin[2] + (iz + 0.5) * resolution;
      for (let iy = iy0; iy <= iy1; iy += 1) {
        center[1] = origin[1] + (iy + 0.5) * resolution;
        const rowBase = ((iz - range.z0) * ny + (iy - range.y0)) * nx - range.x0;
        for (let ix = ix0; ix <= ix1; ix += 1) {
          if (bandMask[rowBase + ix] === 1) {
            continue;
          }
          center[0] = origin[0] + (ix + 0.5) * resolution;
          if (distanceSquaredPointTriangle(center, triangles, base) <= bandSquared) {
            bandMask[rowBase + ix] = 1;
          }
        }
      }
    }
  }
};

/**
 * CR8 (audit R16, [minetto-2017]): ONE pass over the healed solid's own
 * triangles computes every layer's per-row x-intercepts — O(total crossings)
 * instead of one O(n) `manifold.slice` per layer, and one wasm mesh
 * marshalling instead of one CrossSection per layer (§18).
 *
 * Robustness is the watertight half-open discipline on BOTH sweep axes: an
 * edge crosses a layer plane iff exactly one endpoint satisfies `z ≤ planeZ`
 * (vertices exactly on a plane count below it), and a segment crosses a row
 * line iff `yLo ≤ rowY < yHi` — so a closed mesh always yields exactly-paired
 * intercepts at shared vertices and edges, the same parity guarantee the
 * polygon path had. Sweep-vs-slice differences are ulp-scale and confined to
 * cells whose centres sit within the band of the surface — band cells by
 * construction, decided by the exact classifier, never by this fill.
 */
const buildLayerRowIntercepts = (options: {
  grid: VoidOccupancyGrid;
  range: VoidOccupancyRange;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
}): Array<number[][] | undefined> => {
  const { grid, range, vertProperties, triVerts } = options;
  const { origin, resolution } = grid;
  const [, ny, nz] = localDims(range);
  const layers: Array<number[][] | undefined> = Array.from({ length: nz });
  const triangleCount = triVerts.length / 3;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const ia = triVerts[triangle * 3]! * 3;
    const ib = triVerts[triangle * 3 + 1]! * 3;
    const ic = triVerts[triangle * 3 + 2]! * 3;
    const zA = vertProperties[ia + 2]!;
    const zB = vertProperties[ib + 2]!;
    const zC = vertProperties[ic + 2]!;
    const zMin = Math.min(zA, zB, zC);
    const zMax = Math.max(zA, zB, zC);
    // Planes with zMin ≤ planeZ < zMax (half-open: a coplanar triangle crosses
    // no plane; its cells are band cells the exact classifier decides).
    const izLo = Math.max(range.z0, Math.ceil((zMin - origin[2]) / resolution - 0.5));
    const izHi = Math.min(range.z1, Math.ceil((zMax - origin[2]) / resolution - 0.5) - 1);
    for (let iz = izLo; iz <= izHi; iz += 1) {
      const planeZ = origin[2] + (iz + 0.5) * resolution;
      // The half-open crossing rule admits exactly zero or two edges.
      let x0 = 0;
      let y0 = 0;
      let x1 = 0;
      let y1 = 0;
      let found = 0;
      const edges: ReadonlyArray<readonly [number, number]> = [
        [ia, ib],
        [ib, ic],
        [ic, ia],
      ];
      for (const [from, to] of edges) {
        const zFrom = vertProperties[from + 2]!;
        const zTo = vertProperties[to + 2]!;
        if (zFrom <= planeZ === zTo <= planeZ) {
          continue;
        }
        const t = (planeZ - zFrom) / (zTo - zFrom);
        const x = vertProperties[from]! + t * (vertProperties[to]! - vertProperties[from]!);
        const y = vertProperties[from + 1]! + t * (vertProperties[to + 1]! - vertProperties[from + 1]!);
        if (found === 0) {
          x0 = x;
          y0 = y;
        } else {
          x1 = x;
          y1 = y;
        }
        found += 1;
      }
      // Within [izLo, izHi] the half-open rule guarantees exactly two
      // crossings (zMin ≤ planeZ < zMax mixes the endpoint states, and
      // crossings around the 3-edge cycle come in pairs), so only the
      // row-horizontal degenerate segment needs skipping.
      if (y0 === y1) {
        continue;
      }
      // Rows with yLo ≤ rowY < yHi.
      const yLo = Math.min(y0, y1);
      const yHi = Math.max(y0, y1);
      const rowLo = Math.max(range.y0, Math.ceil((yLo - origin[1]) / resolution - 0.5));
      const rowHi = Math.min(range.y1, Math.ceil((yHi - origin[1]) / resolution - 0.5) - 1);
      if (rowLo > rowHi) {
        continue;
      }
      const slope = (x1 - x0) / (y1 - y0);
      const layer = (layers[iz - range.z0] ??= Array.from({ length: ny }, () => []));
      for (let row = rowLo; row <= rowHi; row += 1) {
        const rowY = origin[1] + (row + 0.5) * resolution;
        layer[row - range.y0]!.push(x0 + (rowY - y0) * slope);
      }
    }
  }
  return layers;
};

/**
 * Even-odd scanline fill of one grid layer from its swept row intercepts.
 * Non-band inside cells are appended to `meshClosed` in ascending (iy, ix)
 * order. Any centre that could tie with a boundary within float noise is a
 * band cell by construction, so ties here are never verdict-bearing.
 */
const fillLayer = (input: LayerRasterInput, iz: number, rowIntercepts: number[][] | undefined): void => {
  const { grid, range, bandMask, meshClosed } = input;
  const { origin, resolution } = grid;
  const [nx, ny] = localDims(range);
  if (!rowIntercepts) {
    return; // Entire layer outside the solid.
  }
  const layerBase = (iz - range.z0) * ny * nx;
  const globalLayerBase = iz * grid.dims[1];
  for (let iy = range.y0; iy <= range.y1; iy += 1) {
    const intercepts = rowIntercepts[iy - range.y0]!;
    if (intercepts.length === 0) {
      continue; // Entire row outside the solid.
    }
    intercepts.sort((left, right) => left - right);
    const localRowBase = layerBase + (iy - range.y0) * nx - range.x0;
    const globalRowBase = (globalLayerBase + iy) * grid.dims[0];
    let cursor = 0;
    let inside = false;
    for (let ix = range.x0; ix <= range.x1; ix += 1) {
      const centerX = origin[0] + (ix + 0.5) * resolution;
      while (cursor < intercepts.length && intercepts[cursor]! <= centerX) {
        inside = !inside;
        cursor += 1;
      }
      if (inside && bandMask[localRowBase + ix] === 0) {
        meshClosed.push(globalRowBase + ix);
      }
    }
  }
};

/**
 * Compute mesh-derived occupancy for one occurrence over one cell range.
 *
 * Returns `{ fallback }` whenever the hybrid path cannot proceed soundly —
 * Manifold module not resolved, tessellation unavailable/empty, or the
 * healed mesh not watertight — and the caller runs the pure exact scan.
 *
 * @param options - Grid, range, and the pre-bound occurrence tessellator.
 * @returns Occupancy split into mesh-decided and band cells, or a fallback.
 * @public
 */
export const computeVoidMeshOccupancy = (options: {
  grid: VoidOccupancyGrid;
  range: VoidOccupancyRange;
  fetchMesh: () => OccurrenceMeshResult;
}): VoidMeshOccupancy | { fallback: string } => {
  const { grid, range } = options;
  const module = getManifoldModuleSync();
  if (!module) {
    return { fallback: 'manifold-module-unresolved' };
  }
  const mesh = options.fetchMesh();
  if ('error' in mesh) {
    return { fallback: `occurrence-mesh: ${mesh.error}` };
  }
  const triangleCount = mesh.triangles.length / 9;
  if (triangleCount === 0) {
    return { fallback: 'occurrence-mesh-empty' };
  }
  chargeBudget(Math.ceil(triangleCount / trianglesPerWorkUnit));

  // Band width: 2× the (request-floored) achieved deflection covers the
  // mesh↔BRep Hausdorff bound both ways, plus fixed slack for Manifold's
  // float32 vertex quantization and vertex-merge displacement.
  const band = 2 * mesh.deflection + 1e-3;
  forensicCount('void.mesh.deflectionMicrons', Math.round(mesh.deflection * 1000));
  const [nx, ny, nz] = localDims(range);
  const bandMask = new Uint8Array(nx * ny * nz);
  markBandCells({ grid, range, triangles: mesh.triangles, band, bandMask });

  // Heal the per-face tessellation into a watertight solid: OCCT shares edge
  // polylines between adjacent faces (duplicated vertices, identical
  // coordinates), so merge() closes the soup; anything it cannot close is a
  // deterministic fallback, never a guess.
  const vertProperties = new Float32Array(mesh.triangles);
  const triVerts = new Uint32Array(triangleCount * 3);
  for (let index = 0; index < triVerts.length; index += 1) {
    triVerts[index] = index;
  }
  const meshGl = new module.Mesh({ numProp: 3, vertProperties, triVerts });
  meshGl.merge();
  let manifold: ManifoldSolid;
  try {
    manifold = new module.Manifold(meshGl);
  } catch (error) {
    forensicCount('void.mesh.nonManifold', 1);
    return { fallback: `manifold-construction: ${error instanceof Error ? error.message : String(error)}` };
  }
  try {
    if (manifold.isEmpty()) {
      forensicCount('void.mesh.emptyManifold', 1);
      return { fallback: 'manifold-empty' };
    }
    const meshClosed: number[] = [];
    const layerCells = nx * ny;
    const raster: LayerRasterInput = { grid, range, bandMask, meshClosed };
    // CR8: one healed-mesh marshalling + one triangle sweep replaces a
    // Manifold slice per layer.
    const healed = manifold.getMesh();
    const layerIntercepts = buildLayerRowIntercepts({
      grid,
      range,
      vertProperties: healed.vertProperties,
      triVerts: healed.triVerts,
    });
    for (let iz = range.z0; iz <= range.z1; iz += 1) {
      // Charge per layer so the wall backstop stays responsive mid-claim.
      chargeBudget(Math.ceil(layerCells / cellsPerWorkUnit));
      fillLayer(raster, iz, layerIntercepts[iz - range.z0]);
    }
    // Band cells in ascending linear order — the caller's exact pass then
    // yields an ascending closed stream, merge-ready against meshClosed.
    const bandCells: number[] = [];
    for (let iz = range.z0; iz <= range.z1; iz += 1) {
      for (let iy = range.y0; iy <= range.y1; iy += 1) {
        const localRowBase = ((iz - range.z0) * ny + (iy - range.y0)) * nx - range.x0;
        const globalRowBase = (iz * grid.dims[1] + iy) * grid.dims[0];
        for (let ix = range.x0; ix <= range.x1; ix += 1) {
          if (bandMask[localRowBase + ix] === 1) {
            bandCells.push(globalRowBase + ix);
          }
        }
      }
    }
    return { meshClosed, bandCells, triangleCount, deflection: mesh.deflection, band };
  } finally {
    manifold.delete();
  }
};

/**
 * Merge two ascending, disjoint linear-index streams into one ascending
 * stream — the closed set a single exact scan would have produced.
 *
 * @param left - Ascending cell indices.
 * @param right - Ascending cell indices, disjoint from `left`.
 * @returns The merged ascending closed set.
 * @public
 */
export const mergeAscendingCells = (left: readonly number[], right: readonly number[]): number[] => {
  const merged: number[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex]! < right[rightIndex]!) {
      merged.push(left[leftIndex]!);
      leftIndex += 1;
    } else {
      merged.push(right[rightIndex]!);
      rightIndex += 1;
    }
  }
  while (leftIndex < left.length) {
    merged.push(left[leftIndex]!);
    leftIndex += 1;
  }
  while (rightIndex < right.length) {
    merged.push(right[rightIndex]!);
    rightIndex += 1;
  }
  return merged;
};
