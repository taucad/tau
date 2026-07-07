/**
 * Void-continuity proof engine (SB4 frontier: negative-space topology).
 *
 * A whole-assembly claim, not a pairwise relationship: the declared `path`
 * waypoints must all lie in ONE connected open-void component, that component
 * must not reach any `isolatedFrom` space, and its tightest sampled
 * cross-section must meet `minCrossSection`.
 *
 * Method — a deterministic 6-connectivity flood-fill over a uniform voxel grid
 * bounding the declared region. A cell is "open void" iff exact point-in-solid
 * classification (`classifyPoints`, exact per point) reports `out` of EVERY
 * material occurrence at the cell centre. Each occurrence is classified only
 * over the voxels inside its own inflated AABB — a voxel outside a solid's
 * bounding box is trivially `out` of that solid — so the verdict is identical
 * to classifying every voxel against every solid, at a fraction of the native
 * calls. The scan is chunked and checks the matcher budget between chunks, so a
 * heavy claim fails bounded rather than stalling the run.
 *
 * Guarantees (stated honestly, not "never approximated"):
 * - Connectivity uses 6-connectivity, which is *conservative*: a path proven
 *   connected under 6-connectivity is connected under any richer adjacency, and
 *   `on` (on a wall) is treated as closed.
 * - The cross-section is a sampled estimate measured perpendicular to the
 *   void's *local* axis — estimated by PCA of the nearby lumen, not the raw
 *   path chord — so an oblique cut cannot over-report a tight throat; it is
 *   failed only when the estimate clears its quantization band, and reported
 *   `unsupported` (never a silent pass) when the band swamps the measurement or
 *   the declared section is finer than the grid can resolve.
 * - Isolation floods a small region around each probe and reports `unsupported`
 *   when the probe lands in material, so it is not decided vacuously.
 *
 * @module
 */

import type { GeometryDiagnostic, Vec3 } from '#mesh/types.js';
import type { GeoSpecVoidContinuityExpectation, GeoSpecVoidWaypoint } from '#runner/types.js';
import { selectorDiagnosticCodes } from '#selector/diagnostics.js';
import type { SelectorIndex } from '#selector/index-builder.js';
import { dot, normalize, subtract } from '#selector/vector-math.js';
import type { RelationshipProofContext } from '#proofs/relationship-proofs.js';
import { checkBudget } from '#runner/matcher-budget.js';

/**
 * Voxel budget ceiling. At the 2 mm default resolution this covers roughly a
 * 200 mm cube; the proof returns `unsupported` (never a silent coarsening)
 * when the declared region and resolution would exceed it, so the sample count
 * stays bounded and the verdict deterministic.
 *
 * ponytail: fixed ceiling; raise it (or add adaptive banding) only if a real
 * subject needs a finer grid over a larger region than this covers.
 */
const maxVoxels = 4_000_000;

/** Default voxel edge (mm) when the expectation declares none. */
const defaultResolution = 2;

/**
 * Points per native classification chunk. The per-occurrence scan is batched so
 * the matcher budget (WS-C) can preempt a heavy claim between chunks; a
 * monolithic native call over all voxels cannot be interrupted.
 *
 * ponytail: fixed batch; tune only if marshalling overhead or preemption
 * latency measurably matters.
 */
const classifyChunk = 16_384;

type ClassificationPayload = { states: Array<'in' | 'out' | 'on'> };

const parse = <Payload>(raw: string): Payload | { error: string } => {
  const parsed = JSON.parse(raw) as Payload & { error?: unknown };
  return typeof parsed.error === 'string' ? { error: parsed.error } : parsed;
};

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

type Grid = {
  origin: Vec3;
  resolution: number;
  dims: [number, number, number];
};

/** Integer (ix,iy,iz) cell coordinate. */
type Cell = [number, number, number];

/** Cell (ix,iy,iz) of the cell containing `point`, clamped to the grid. */
const cellOf = (grid: Grid, point: Vec3): Cell => {
  const axisIndex = (value: number, origin: number, dim: number): number => {
    const raw = Math.floor((value - origin) / grid.resolution);
    return Math.min(Math.max(raw, 0), dim - 1);
  };
  return [
    axisIndex(point[0], grid.origin[0], grid.dims[0]),
    axisIndex(point[1], grid.origin[1], grid.dims[1]),
    axisIndex(point[2], grid.origin[2], grid.dims[2]),
  ];
};

const linearIndex = (grid: Grid, [ix, iy, iz]: Cell): number => (iz * grid.dims[1] + iy) * grid.dims[0] + ix;

/** Cell-centre point for cell (ix,iy,iz). */
const cellCenter = (grid: Grid, [ix, iy, iz]: Cell): Vec3 => [
  grid.origin[0] + (ix + 0.5) * grid.resolution,
  grid.origin[1] + (iy + 0.5) * grid.resolution,
  grid.origin[2] + (iz + 0.5) * grid.resolution,
];

/** Resolve a waypoint to a subject-frame point (occurrence -> bounds centre). */
const resolveWaypoint = (waypoint: GeoSpecVoidWaypoint, index: SelectorIndex): { point: Vec3 } | { error: string } => {
  if (Array.isArray(waypoint)) {
    return { point: waypoint as Vec3 };
  }
  const named = waypoint as { occurrence: string };
  const row = index.occurrences.find((occurrence) => occurrence.path === named.occurrence);
  if (!row) {
    return { error: `waypoint occurrence '${named.occurrence}' is not present in the subject.` };
  }
  if (!row.bounds) {
    return { error: `waypoint occurrence '${named.occurrence}' carries no bounds to take a centre from.` };
  }
  return {
    point: [
      (row.bounds.min[0] + row.bounds.max[0]) / 2,
      (row.bounds.min[1] + row.bounds.max[1]) / 2,
      (row.bounds.min[2] + row.bounds.max[2]) / 2,
    ],
  };
};

/** Union AABB of the material occurrences, inflated by one resolution step. */
const materialBounds = (
  materialPaths: string[],
  index: SelectorIndex,
  resolution: number,
): { min: Vec3; max: Vec3 } | undefined => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let found = false;
  for (const path of materialPaths) {
    const row = index.occurrences.find((occurrence) => occurrence.path === path);
    if (!row?.bounds) {
      continue;
    }
    found = true;
    const { min: rowMin, max: rowMax } = row.bounds;
    min[0] = Math.min(min[0], rowMin[0]);
    min[1] = Math.min(min[1], rowMin[1]);
    min[2] = Math.min(min[2], rowMin[2]);
    max[0] = Math.max(max[0], rowMax[0]);
    max[1] = Math.max(max[1], rowMax[1]);
    max[2] = Math.max(max[2], rowMax[2]);
  }
  if (!found) {
    return undefined;
  }
  // One-step margin so through-void openings on the boundary faces are sampled.
  return {
    min: [min[0] - resolution, min[1] - resolution, min[2] - resolution],
    max: [max[0] + resolution, max[1] + resolution, max[2] + resolution],
  };
};

/**
 * Occurrence paths whose (one-step-inflated) AABB overlaps `region` — the
 * neighbourhood material set used when a claim declares `bounds` but no explicit
 * `material` (Finding 2: never default to all occurrences).
 */
const occurrencesIntersecting = (
  region: { min: Vec3; max: Vec3 },
  index: SelectorIndex,
  resolution: number,
): string[] => {
  const overlaps = (bounds: { min: Vec3; max: Vec3 }): boolean =>
    bounds.min[0] - resolution <= region.max[0] &&
    bounds.max[0] + resolution >= region.min[0] &&
    bounds.min[1] - resolution <= region.max[1] &&
    bounds.max[1] + resolution >= region.min[1] &&
    bounds.min[2] - resolution <= region.max[2] &&
    bounds.max[2] + resolution >= region.min[2];
  return index.occurrences
    .filter((occurrence) => occurrence.bounds !== undefined && overlaps(occurrence.bounds))
    .map((occurrence) => occurrence.path);
};

/** Inclusive integer cell sub-box. */
type CellRange = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };

/**
 * Inclusive cell range whose centres may fall inside `bbox`, clamped to the
 * grid, with a one-cell margin so a solid's boundary voxels are never skipped
 * (keeps AABB pruning verdict-preserving). Returns `undefined` when the box
 * lies entirely outside the grid.
 */
const cellRangeForBounds = (grid: Grid, bbox: { min: Vec3; max: Vec3 }): CellRange | undefined => {
  const axisRange = (lo: number, hi: number, axis: 0 | 1 | 2): [number, number] | undefined => {
    const first = Math.max(0, Math.floor((lo - grid.origin[axis]) / grid.resolution) - 1);
    const last = Math.min(grid.dims[axis] - 1, Math.ceil((hi - grid.origin[axis]) / grid.resolution) + 1);
    return first <= last ? [first, last] : undefined;
  };
  const rangeX = axisRange(bbox.min[0], bbox.max[0], 0);
  const rangeY = axisRange(bbox.min[1], bbox.max[1], 1);
  const rangeZ = axisRange(bbox.min[2], bbox.max[2], 2);
  if (!rangeX || !rangeY || !rangeZ) {
    return undefined;
  }
  return { x0: rangeX[0], x1: rangeX[1], y0: rangeY[0], y1: rangeY[1], z0: rangeZ[0], z1: rangeZ[1] };
};

/**
 * Per-subject cache of each occurrence's closed cells for a given grid, so
 * repeated void claims on the same part in one run reuse the classification.
 * Keyed by the native handle (identity of the loaded subject) so it is scoped
 * to that artifact and released with it.
 *
 * ponytail: run-scoped, one entry per (occurrence, grid); a suite spanning many
 * distinct grids on the same subject could grow it — add an LRU only if that
 * shows up.
 */
const occupancyCache = new WeakMap<RelationshipProofContext['native'], Map<string, readonly number[]>>();

const gridKey = (grid: Grid): string =>
  `${grid.origin[0]},${grid.origin[1]},${grid.origin[2]}|${grid.resolution}|${grid.dims[0]},${grid.dims[1]},${grid.dims[2]}`;

/**
 * Cells that `occurrence` closes over `grid`: those inside its inflated AABB
 * whose centre classifies `in`/`on`. Classifies only AABB voxels (A1), chunked
 * with a matcher-budget check between chunks (A2) so a heavy claim is
 * preemptible. The returned cell indices are in `linearIndex` space regardless
 * of scan order.
 */
const closedCellsForOccurrence = (options: {
  context: RelationshipProofContext;
  grid: Grid;
  occurrence: number;
  bounds: { min: Vec3; max: Vec3 } | undefined;
}): { closed: number[] } | { error: string } => {
  const { context, grid, occurrence, bounds } = options;
  // Without bounds we cannot prune; classify the whole grid for this occurrence.
  const range = bounds
    ? cellRangeForBounds(grid, bounds)
    : { x0: 0, x1: grid.dims[0] - 1, y0: 0, y1: grid.dims[1] - 1, z0: 0, z1: grid.dims[2] - 1 };
  if (!range) {
    return { closed: [] };
  }
  const closed: number[] = [];
  let batch: Vec3[] = [];
  let batchCells: number[] = [];
  const flush = (): string | undefined => {
    if (batch.length === 0) {
      return undefined;
    }
    const payload = parse<ClassificationPayload>(context.native.classifyPoints(occurrence, JSON.stringify(batch)));
    if ('error' in payload) {
      return payload.error;
    }
    for (const [position, cell] of batchCells.entries()) {
      // A cell is void only where it is out of EVERY material solid. `in`/`on`
      // (inside/on the wall of any solid) closes the cell.
      if (payload.states[position] !== 'out') {
        closed.push(cell);
      }
    }
    batch = [];
    batchCells = [];
    return undefined;
  };
  for (let iz = range.z0; iz <= range.z1; iz += 1) {
    for (let iy = range.y0; iy <= range.y1; iy += 1) {
      for (let ix = range.x0; ix <= range.x1; ix += 1) {
        batch.push(cellCenter(grid, [ix, iy, iz]));
        batchCells.push(linearIndex(grid, [ix, iy, iz]));
        if (batch.length >= classifyChunk) {
          const error = flush();
          if (error !== undefined) {
            return { error };
          }
          checkBudget();
        }
      }
    }
  }
  const error = flush();
  if (error !== undefined) {
    return { error };
  }
  return { closed };
};

/**
 * Classify the material occurrences against the grid and return the open-void
 * bitmap (true iff `out` of all material solids). Each occurrence is pruned to
 * its own AABB (A1) and memoized per (subject, grid, occurrence) (A4).
 */
const computeOpenCells = (options: {
  context: RelationshipProofContext;
  grid: Grid;
  materialPaths: string[];
}): boolean[] | { error: string } => {
  const { context, grid, materialPaths } = options;
  const total = grid.dims[0] * grid.dims[1] * grid.dims[2];
  const open: boolean[] = Array.from({ length: total }, () => true);

  const boundsByPath = new Map<string, { min: Vec3; max: Vec3 }>();
  for (const occurrence of context.index.occurrences) {
    if (occurrence.bounds) {
      boundsByPath.set(occurrence.path, occurrence.bounds);
    }
  }

  let cache = occupancyCache.get(context.native);
  if (!cache) {
    cache = new Map<string, readonly number[]>();
    occupancyCache.set(context.native, cache);
  }
  const key = gridKey(grid);

  for (const path of materialPaths) {
    const occurrence = context.occurrenceIndexByPath.get(path);
    if (occurrence === undefined) {
      return { error: `material occurrence '${path}' is not bound to the STEP-XDE structure.` };
    }
    const cacheKey = `${key}|${occurrence}`;
    let closed = cache.get(cacheKey);
    if (!closed) {
      const result = closedCellsForOccurrence({ context, grid, occurrence, bounds: boundsByPath.get(path) });
      if ('error' in result) {
        return { error: `classifyPoints failed for '${path}': ${result.error}` };
      }
      closed = result.closed;
      cache.set(cacheKey, closed);
    }
    for (const cell of closed) {
      open[cell] = false;
    }
  }
  return open;
};

/** 6-connectivity flood fill; returns a component-id per cell (-1 = closed). */
const floodComponents = (grid: Grid, open: boolean[]): { components: Int32Array; count: number } => {
  const [nx, ny, nz] = grid.dims;
  const total = nx * ny * nz;
  const components = new Int32Array(total).fill(-1);
  const stack: number[] = [];
  let count = 0;
  for (let seed = 0; seed < total; seed += 1) {
    if (!open[seed] || components[seed] !== -1) {
      continue;
    }
    const component = count;
    count += 1;
    components[seed] = component;
    stack.push(seed);
    while (stack.length > 0) {
      const cell = stack.pop()!;
      const iz = Math.floor(cell / (nx * ny));
      const iy = Math.floor((cell - iz * nx * ny) / nx);
      const ix = cell - iz * nx * ny - iy * nx;
      const neighbours: Array<[number, number, number]> = [
        [ix - 1, iy, iz],
        [ix + 1, iy, iz],
        [ix, iy - 1, iz],
        [ix, iy + 1, iz],
        [ix, iy, iz - 1],
        [ix, iy, iz + 1],
      ];
      for (const [jx, jy, jz] of neighbours) {
        if (jx < 0 || jy < 0 || jz < 0 || jx >= nx || jy >= ny || jz >= nz) {
          continue;
        }
        const neighbour = linearIndex(grid, [jx, jy, jz]);
        if (open[neighbour] && components[neighbour] === -1) {
          components[neighbour] = component;
          stack.push(neighbour);
        }
      }
    }
  }
  return { components, count };
};

/**
 * Dominant unit direction of the open-cell lumen within `radius` cells of
 * `stationPoint` — the void's *local* axis — by power iteration on the sample
 * covariance. Returns `undefined` when too few samples or the spread is
 * near-isotropic (a junction or blob, where a single axis is ill-defined), so
 * the caller falls back to the declared path tangent. Deterministic: fixed seed
 * and iteration count, fixed sample order (C2).
 */
const localVoidAxis = (options: {
  grid: Grid;
  components: Int32Array;
  component: number;
  stationPoint: Vec3;
  radius: number;
}): Vec3 | undefined => {
  const { grid, components, component, stationPoint, radius } = options;
  const [cx, cy, cz] = cellOf(grid, stationPoint);
  const [nx, ny, nz] = grid.dims;
  const samples: Vec3[] = [];
  for (let iz = Math.max(0, cz - radius); iz <= Math.min(nz - 1, cz + radius); iz += 1) {
    for (let iy = Math.max(0, cy - radius); iy <= Math.min(ny - 1, cy + radius); iy += 1) {
      for (let ix = Math.max(0, cx - radius); ix <= Math.min(nx - 1, cx + radius); ix += 1) {
        if (components[linearIndex(grid, [ix, iy, iz])] === component) {
          samples.push(cellCenter(grid, [ix, iy, iz]));
        }
      }
    }
  }
  if (samples.length < 3) {
    return undefined;
  }
  const mean: [number, number, number] = [0, 0, 0];
  for (const point of samples) {
    mean[0] += point[0];
    mean[1] += point[1];
    mean[2] += point[2];
  }
  mean[0] /= samples.length;
  mean[1] /= samples.length;
  mean[2] /= samples.length;
  let sxx = 0;
  let syy = 0;
  let szz = 0;
  let sxy = 0;
  let sxz = 0;
  let syz = 0;
  for (const point of samples) {
    const dx = point[0] - mean[0];
    const dy = point[1] - mean[1];
    const dz = point[2] - mean[2];
    sxx += dx * dx;
    syy += dy * dy;
    szz += dz * dz;
    sxy += dx * dy;
    sxz += dx * dz;
    syz += dy * dz;
  }
  let vector: Vec3 = [1, 1, 1];
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const nextX = sxx * vector[0] + sxy * vector[1] + sxz * vector[2];
    const nextY = sxy * vector[0] + syy * vector[1] + syz * vector[2];
    const nextZ = sxz * vector[0] + syz * vector[1] + szz * vector[2];
    const length = Math.hypot(nextX, nextY, nextZ);
    if (!(length > 0)) {
      return undefined;
    }
    vector = [nextX / length, nextY / length, nextZ / length];
  }
  // Reject near-isotropic spread: the dominant eigenvalue (Rayleigh quotient)
  // must clearly exceed an isotropic third of the total variance before the
  // axis is trusted as a tube direction.
  const dominant =
    vector[0] * (sxx * vector[0] + sxy * vector[1] + sxz * vector[2]) +
    vector[1] * (sxy * vector[0] + syy * vector[1] + syz * vector[2]) +
    vector[2] * (sxz * vector[0] + syz * vector[1] + szz * vector[2]);
  const trace = sxx + syy + szz;
  if (!(trace > 0) || dominant / trace < 0.55) {
    return undefined;
  }
  return vector;
};

/**
 * Cells of `component` whose centre lies within half a step of the plane
 * through `stationPoint` with the given `normal`, AND that are reachable from
 * the station's own cell by a flood fill confined to that slab. Restricting to
 * the station-connected lumen excludes disconnected pockets sharing the plane —
 * critically the unbounded exterior, which is "out of material" everywhere and
 * would otherwise swamp an interior passage's true cross-section. Returns the
 * cell count, or 0 when the station itself is not in the slab component.
 */
const slabLumenCells = (options: {
  grid: Grid;
  components: Int32Array;
  component: number;
  normal: Vec3;
  stationPoint: Vec3;
}): number => {
  const { grid, components, component, normal, stationPoint } = options;
  const planeOffset = dot(normal, stationPoint);
  const inSlab = (ix: number, iy: number, iz: number): boolean => {
    if (components[linearIndex(grid, [ix, iy, iz])] !== component) {
      return false;
    }
    return Math.abs(dot(normal, cellCenter(grid, [ix, iy, iz])) - planeOffset) <= grid.resolution / 2;
  };
  const [sx, sy, sz] = cellOf(grid, stationPoint);
  if (!inSlab(sx, sy, sz)) {
    return 0;
  }
  const [nx, ny, nz] = grid.dims;
  const seen = new Set<number>();
  const stack: Array<[number, number, number]> = [[sx, sy, sz]];
  seen.add(linearIndex(grid, [sx, sy, sz]));
  while (stack.length > 0) {
    const [ix, iy, iz] = stack.pop()!;
    const neighbours: Array<[number, number, number]> = [
      [ix - 1, iy, iz],
      [ix + 1, iy, iz],
      [ix, iy - 1, iz],
      [ix, iy + 1, iz],
      [ix, iy, iz - 1],
      [ix, iy, iz + 1],
    ];
    for (const [jx, jy, jz] of neighbours) {
      if (jx < 0 || jy < 0 || jz < 0 || jx >= nx || jy >= ny || jz >= nz) {
        continue;
      }
      const key = linearIndex(grid, [jx, jy, jz]);
      if (!seen.has(key) && inSlab(jx, jy, jz)) {
        seen.add(key);
        stack.push([jx, jy, jz]);
      }
    }
  }
  return seen.size;
};

/**
 * Sampled bottleneck cross-section (mm²) along the path: the minimum over
 * stations (one per resolution step) of the station-connected lumen area
 * ({@link slabLumenCells} times the cell area), measured in the plane
 * perpendicular to the void's local axis ({@link localVoidAxis}, with the path
 * tangent as fallback and conservative co-measure). Returns the estimate plus
 * the bottleneck cell count (its quantization band scales with the slice
 * perimeter, bounded below by one cell), or `undefined` when no station's lumen
 * could be sampled.
 */
const bottleneckCrossSection = (options: {
  grid: Grid;
  components: Int32Array;
  component: number;
  waypoints: Vec3[];
}): { area: number; cells: number; center: Vec3 } | undefined => {
  const { grid, components, component, waypoints } = options;
  const cellArea = grid.resolution * grid.resolution;
  let best: { area: number; cells: number; center: Vec3 } | undefined;
  for (let segment = 0; segment < waypoints.length - 1; segment += 1) {
    const from = waypoints[segment];
    const to = waypoints[segment + 1];
    if (!from || !to) {
      continue;
    }
    const tangent = normalize(subtract(to, from));
    if (!tangent) {
      continue;
    }
    const spanLength = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const stations = Math.max(1, Math.round(spanLength / grid.resolution));
    for (let station = 0; station <= stations; station += 1) {
      const t = station / stations;
      const stationPoint: Vec3 = [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
      ];
      // Measure perpendicular to the void's local axis so an oblique path chord
      // cannot over-report a tight throat (B1); the raw path tangent is the
      // fallback and a conservative co-measure — take the smaller of the two.
      const axis = localVoidAxis({ grid, components, component, stationPoint, radius: 3 }) ?? tangent;
      const perpendicular = slabLumenCells({ grid, components, component, normal: axis, stationPoint });
      const alongTangent = slabLumenCells({ grid, components, component, normal: tangent, stationPoint });
      const candidates = [perpendicular, alongTangent].filter((count) => count > 0);
      if (candidates.length === 0) {
        continue;
      }
      const cells = Math.min(...candidates);
      if (!best || cells < best.cells) {
        best = { area: cells * cellArea, cells, center: stationPoint };
      }
    }
  }
  return best;
};

/** True if any open cell within `radius` cells of `center` belongs to `component`. */
const regionJoinsComponent = (options: {
  grid: Grid;
  open: boolean[];
  components: Int32Array;
  center: Cell;
  radius: number;
  component: number;
}): boolean => {
  const { grid, open, components, center, radius, component } = options;
  const [cx, cy, cz] = center;
  const [nx, ny, nz] = grid.dims;
  for (let iz = Math.max(0, cz - radius); iz <= Math.min(nz - 1, cz + radius); iz += 1) {
    for (let iy = Math.max(0, cy - radius); iy <= Math.min(ny - 1, cy + radius); iy += 1) {
      for (let ix = Math.max(0, cx - radius); ix <= Math.min(nx - 1, cx + radius); ix += 1) {
        const cell = linearIndex(grid, [ix, iy, iz]);
        if (open[cell] && components[cell] === component) {
          return true;
        }
      }
    }
  }
  return false;
};

/**
 * Prove a void-continuity claim. Emits `GEOSPEC_VOID_CONTINUITY_MISMATCH`
 * (connectivity/isolation/cross-section fail), a `_UNSUPPORTED_EVIDENCE`
 * diagnostic (a sub-claim that cannot be honestly decided at the declared
 * resolution), or an empty array on pass.
 *
 * @param expectation - The declared void-continuity expectation.
 * @param context - Per-subject proof context (native handle + occurrence index).
 * @returns The verdict diagnostics (empty = pass).
 * @public
 */
export const proveVoidContinuity = (
  expectation: GeoSpecVoidContinuityExpectation,
  context: RelationshipProofContext,
): GeometryDiagnostic[] => {
  if (!Array.isArray(expectation.path) || expectation.path.length === 0) {
    return [
      unsupported(
        'void-continuity needs at least one path waypoint.',
        'Declare an ordered path of >= 1 waypoints known to lie in the void.',
      ),
    ];
  }
  const resolution = expectation.resolution ?? defaultResolution;
  if (!(resolution > 0)) {
    return [
      unsupported(
        `void-continuity resolution must be positive, got ${resolution}.`,
        'Declare a positive voxel edge (mm), or omit resolution for the 2 mm default.',
      ),
    ];
  }

  // Resolve waypoints.
  const waypoints: Vec3[] = [];
  for (const waypoint of expectation.path) {
    const resolved = resolveWaypoint(waypoint, context.index);
    if ('error' in resolved) {
      return [
        unsupported(
          `void-continuity waypoint could not be resolved: ${resolved.error}`,
          'Use explicit [x, y, z] points, or occurrence names that exist in the subject with bounds.',
        ),
      ];
    }
    waypoints.push(resolved.point);
  }

  // Material set + region. Refuse the degenerate "classify every occurrence
  // over an unbounded region" default (Finding 2): it is O(all-occurrences x V)
  // and no tract needs every solid as material. Require a declared material
  // set, or derive a narrow neighbourhood from declared bounds.
  const declaredBounds = expectation.bounds;
  let materialPaths: string[];
  if (expectation.material) {
    materialPaths = expectation.material;
  } else if (declaredBounds) {
    materialPaths = occurrencesIntersecting(declaredBounds, context.index, resolution);
  } else {
    return [
      unsupported(
        'void-continuity needs a material set or explicit bounds to bound the void; refusing to classify every occurrence over an unbounded region.',
        'Declare `material` occurrence names, or `bounds` { min, max } so the neighbourhood material set can be derived.',
      ),
    ];
  }
  if (materialPaths.length === 0) {
    return [
      unsupported(
        'void-continuity found no material occurrences to bound the void.',
        'Declare material occurrence names, or select bounds that overlap occurrences carrying face bounds.',
      ),
    ];
  }
  const region = declaredBounds ?? materialBounds(materialPaths, context.index, resolution);
  if (!region) {
    return [
      unsupported(
        'void-continuity could not derive a region: the material occurrences carry no bounds.',
        'Declare explicit bounds { min, max }, or select material occurrences that carry face bounds.',
      ),
    ];
  }

  const dims: [number, number, number] = [
    Math.max(1, Math.ceil((region.max[0] - region.min[0]) / resolution)),
    Math.max(1, Math.ceil((region.max[1] - region.min[1]) / resolution)),
    Math.max(1, Math.ceil((region.max[2] - region.min[2]) / resolution)),
  ];
  const totalVoxels = dims[0] * dims[1] * dims[2];
  if (totalVoxels > maxVoxels) {
    return [
      unsupported(
        `void-continuity grid would be ${totalVoxels} voxels (${dims.join('x')}) at ${resolution} mm, over the ${maxVoxels} ceiling.`,
        'Coarsen the resolution or narrow the declared bounds so the sampled grid stays within the deterministic budget.',
        { dims, totalVoxels, resolution, maxVoxels },
      ),
    ];
  }

  const grid: Grid = { origin: region.min, resolution, dims };
  const open = computeOpenCells({ context, grid, materialPaths });
  if ('error' in open) {
    return [
      unsupported(
        `void-continuity classification failed: ${open.error}`,
        'Verify the STEP artifact parses cleanly and the material occurrences resolve to solids.',
        { nativeError: open.error },
      ),
    ];
  }

  // Every waypoint must sit in an open cell to seed the flood fill.
  const waypointCells = waypoints.map((point) => {
    const [ix, iy, iz] = cellOf(grid, point);
    return { point, cell: linearIndex(grid, [ix, iy, iz]) };
  });
  const buried = waypointCells.find((entry) => !open[entry.cell]);
  if (buried) {
    const index = waypointCells.indexOf(buried);
    return [
      fail(
        `void-continuity waypoint ${index} at [${buried.point.join(', ')}] is inside material (not in open void) at ${resolution} mm sampling.`,
        'Move the waypoint into the void it should mark, or refine the resolution if the void is thinner than one cell.',
        { center: buried.point, details: { waypointIndex: index, waypoint: buried.point, resolution } },
      ),
    ];
  }

  const { components } = floodComponents(grid, open);
  const firstCell = waypointCells[0];
  if (!firstCell) {
    return [
      unsupported(
        'void-continuity has no seedable waypoint after resolution.',
        'Declare at least one waypoint that lands in the open void.',
      ),
    ];
  }
  const pathComponent = components[firstCell.cell] ?? -1;

  // Connectivity: all waypoints share the first waypoint's component.
  const disconnected = waypointCells.find((entry) => components[entry.cell] !== pathComponent);
  if (disconnected) {
    const index = waypointCells.indexOf(disconnected);
    return [
      fail(
        `void-continuity path is broken: waypoint ${index} at [${disconnected.point.join(', ')}] is in a different void component than waypoint 0 at ${resolution} mm sampling.`,
        'Ensure the drilled/cast void is continuous between these waypoints, or split the claim into the separately connected runs.',
        { center: disconnected.point, details: { waypointIndex: index, waypoint: disconnected.point, resolution } },
      ),
    ];
  }

  // Isolation: no isolatedFrom space may reach the path component. Probe a small
  // region (not a single cell) so a leak a cell away is caught, and report
  // `unsupported` when the probe lands in material rather than passing vacuously.
  for (const [order, point] of (expectation.isolatedFrom ?? []).entries()) {
    const probeCell = cellOf(grid, point);
    const cell = linearIndex(grid, probeCell);
    if (!open[cell]) {
      return [
        unsupported(
          `void-continuity isolatedFrom point ${order} at [${point.join(', ')}] is inside material, not an open space, so isolation cannot be decided at ${resolution} mm sampling.`,
          'Move the isolatedFrom point into the space it represents, or refine the resolution if that space is thinner than one cell.',
          { isolatedFromIndex: order, point, resolution },
        ),
      ];
    }
    if (regionJoinsComponent({ grid, open, components, center: probeCell, radius: 1, component: pathComponent })) {
      return [
        fail(
          `void-continuity isolation breached: isolatedFrom point ${order} at [${point.join(', ')}] is void-connected to the path (within one cell) at ${resolution} mm sampling.`,
          'Add wall between the path void and this space, or declare the connection as an intended opening (drop it from isolatedFrom).',
          { center: point, details: { isolatedFromIndex: order, point, resolution } },
        ),
      ];
    }
  }

  // Cross-section: sampled bottleneck. Refuse (unsupported) rather than decide
  // when the grid is too coarse to bound the declared section (B3), or when the
  // quantization band swamps the measurement (B2). The band is a fail-side
  // tolerance only — it never manufactures a pass at a tight passage.
  if (expectation.minCrossSection !== undefined && waypoints.length >= 2) {
    const cellArea = grid.resolution * grid.resolution;
    // Resolution guard (B3): a section only a few cells in area cannot be
    // sampled honestly (Nyquist) — require it to span at least ~2x2 cells.
    if (expectation.minCrossSection < 4 * cellArea) {
      return [
        unsupported(
          `void-continuity cannot bound a ${expectation.minCrossSection} mm² section at ${resolution} mm sampling (needs >= ${4 * cellArea} mm², ~2x2 cells).`,
          'Refine the resolution (finer voxels) so the required section spans several cells.',
          { minCrossSection: expectation.minCrossSection, resolution, cellArea },
        ),
      ];
    }
    const bottleneck = bottleneckCrossSection({ grid, components, component: pathComponent, waypoints });
    if (!bottleneck) {
      return [
        unsupported(
          'void-continuity could not sample a cross-section for the path component; the plane sampling found no component cells.',
          'Increase the resolution so the void is at least a few cells across, or verify the waypoints trace the void interior.',
          { minCrossSection: expectation.minCrossSection, resolution },
        ),
      ];
    }
    // Quantization band: a one-cell-thick perimeter ring around the bottleneck
    // slice (bounded below by one cell), the same step-tolerance idea the
    // classification proofs use — never fail inside the sampling's own noise.
    const band = Math.max(cellArea, Math.sqrt(bottleneck.cells) * 4 * cellArea);
    // Band-swamp guard (B2): if the band is >= the measured area the section is
    // unfalsifiable at this resolution — report unsupported, not a vacuous pass.
    if (band >= bottleneck.area) {
      return [
        unsupported(
          `void-continuity cross-section is ${bottleneck.area.toFixed(0)} mm² but its quantization band is ±${band.toFixed(0)} mm² (${bottleneck.cells} cells at ${resolution} mm); too coarse to bound honestly.`,
          'Refine the resolution so the tightest section spans several cells, or declare bounds that isolate the passage.',
          {
            measuredCrossSection: bottleneck.area,
            band,
            cells: bottleneck.cells,
            minCrossSection: expectation.minCrossSection,
            resolution,
          },
        ),
      ];
    }
    if (bottleneck.area + band < expectation.minCrossSection) {
      return [
        fail(
          `void-continuity bottleneck cross-section is ${bottleneck.area.toFixed(0)} mm² (±${band.toFixed(0)} band, ${bottleneck.cells} cells at ${resolution} mm), below the required ${expectation.minCrossSection} mm².`,
          'Widen the tightest section of the void, or lower the declared minimum cross-section.',
          {
            center: bottleneck.center,
            details: {
              measuredCrossSection: bottleneck.area,
              band,
              cells: bottleneck.cells,
              minCrossSection: expectation.minCrossSection,
              resolution,
            },
          },
        ),
      ];
    }
  }

  return [];
};
