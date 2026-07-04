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
 * material occurrence at the cell centre. Connectivity and isolation are
 * decided by which cells share a flood-fill component; they are exact-per-point
 * measurements sampled on the grid. The cross-section is a sampled estimate:
 * the minimum, over stations along the path, of the open-cell count in the
 * grid plane perpendicular to the local path tangent, times the cell area —
 * reported with its quantization band and only failed when the estimate clears
 * the band, never approximated to a pass.
 *
 * @module
 */

import type { GeometryDiagnostic, Vec3 } from '#mesh/types.js';
import type { GeoSpecVoidContinuityExpectation, GeoSpecVoidWaypoint } from '#runner/types.js';
import { selectorDiagnosticCodes } from '#selector/diagnostics.js';
import type { SelectorIndex } from '#selector/index-builder.js';
import { dot, normalize, subtract } from '#selector/vector-math.js';
import type { RelationshipProofContext } from '#proofs/relationship-proofs.js';

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
 * Classify every cell centre against every material occurrence and return the
 * open-void bitmap (true iff `out` of all material solids). Batches one
 * `classifyPoints` call per occurrence over the full centre list.
 */
const computeOpenCells = (options: {
  context: RelationshipProofContext;
  grid: Grid;
  materialPaths: string[];
}): boolean[] | { error: string } => {
  const { context, grid, materialPaths } = options;
  const [nx, ny, nz] = grid.dims;
  const total = nx * ny * nz;
  // Fill in linear-index order (iz outer, iy mid, ix inner) so cell N of the
  // classification payload is exactly linearIndex(ix, iy, iz).
  const centers: Vec3[] = [];
  for (let iz = 0; iz < nz; iz += 1) {
    for (let iy = 0; iy < ny; iy += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        centers.push(cellCenter(grid, [ix, iy, iz]));
      }
    }
  }
  const open: boolean[] = Array.from({ length: total }, () => true);
  const centersJson = JSON.stringify(centers);
  for (const path of materialPaths) {
    const occurrence = context.occurrenceIndexByPath.get(path);
    if (occurrence === undefined) {
      return { error: `material occurrence '${path}' is not bound to the STEP-XDE structure.` };
    }
    const payload = parse<ClassificationPayload>(context.native.classifyPoints(occurrence, centersJson));
    if ('error' in payload) {
      return { error: `classifyPoints failed for '${path}': ${payload.error}` };
    }
    for (let cell = 0; cell < total; cell += 1) {
      // A cell is void only where it is out of EVERY material solid. `in`/`on`
      // (inside/on the wall of any solid) closes the cell.
      if (payload.states[cell] !== 'out') {
        open[cell] = false;
      }
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
 * Cells of `component` whose centre lies within half a step of the plane
 * through `stationPoint` with normal `tangent`, AND that are reachable from the
 * station's own cell by a flood fill confined to that slab. Restricting to the
 * station-connected lumen excludes disconnected pockets sharing the plane —
 * critically the unbounded exterior, which is "out of material" everywhere and
 * would otherwise swamp an interior passage's true cross-section. Returns the
 * cell count, or 0 when the station itself is not in the slab component.
 */
const slabLumenCells = (options: {
  grid: Grid;
  components: Int32Array;
  component: number;
  tangent: Vec3;
  stationPoint: Vec3;
}): number => {
  const { grid, components, component, tangent, stationPoint } = options;
  const planeOffset = dot(tangent, stationPoint);
  const inSlab = (ix: number, iy: number, iz: number): boolean => {
    if (components[linearIndex(grid, [ix, iy, iz])] !== component) {
      return false;
    }
    return Math.abs(dot(tangent, cellCenter(grid, [ix, iy, iz])) - planeOffset) <= grid.resolution / 2;
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
 * ({@link slabLumenCells} times the cell area) in the plane perpendicular to
 * the local path tangent. Returns the estimate plus the bottleneck cell count
 * (its quantization band scales with the slice perimeter, bounded below by one
 * cell), or `undefined` when no station's lumen could be sampled.
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
      const cells = slabLumenCells({ grid, components, component, tangent, stationPoint });
      if (cells > 0 && (!best || cells < best.cells)) {
        best = { area: cells * cellArea, cells, center: stationPoint };
      }
    }
  }
  return best;
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

  // Material set + region.
  const materialPaths = expectation.material ?? context.index.occurrences.map((occurrence) => occurrence.path);
  if (materialPaths.length === 0) {
    return [
      unsupported(
        'void-continuity found no material occurrences to bound the void.',
        'Declare material occurrence names, or load a subject whose XDE structure carries occurrences.',
      ),
    ];
  }
  const region = expectation.bounds ?? materialBounds(materialPaths, context.index, resolution);
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

  // Isolation: no isolatedFrom point may share the path component.
  for (const [order, point] of (expectation.isolatedFrom ?? []).entries()) {
    const [ix, iy, iz] = cellOf(grid, point);
    const cell = linearIndex(grid, [ix, iy, iz]);
    if (open[cell] && components[cell] === pathComponent) {
      return [
        fail(
          `void-continuity isolation breached: isolatedFrom point ${order} at [${point.join(', ')}] is void-connected to the path at ${resolution} mm sampling.`,
          'Add wall between the path void and this space, or declare the connection as an intended opening (drop it from isolatedFrom).',
          { center: point, details: { isolatedFromIndex: order, point, resolution } },
        ),
      ];
    }
  }

  // Cross-section: sampled bottleneck, failed only when it clears the band.
  if (expectation.minCrossSection !== undefined && waypoints.length >= 2) {
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
    const band = Math.max(
      grid.resolution * grid.resolution,
      Math.sqrt(bottleneck.cells) * 4 * grid.resolution * grid.resolution,
    );
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
