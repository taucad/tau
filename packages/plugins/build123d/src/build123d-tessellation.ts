/**
 * Build123d tessellation: the shared OCCT preset-or-explicit request, resolved here and meshed by the Python worker in
 * OCCT's absolute mode (I4). Presets read the shapes' bounding-box diagonal once; explicit tolerances never do.
 */
import {
  coarsenOcctTessellation,
  createTessellationBudgetExceededIssue,
  createTessellationDowngradedIssue,
  occtMaxTessellationDowngrades,
  resolveOcctTessellation,
} from '@taucad/occt-core';
import type {
  OcctResolvedTessellation,
  OcctTessellation,
  OcctTessellationQuality,
  OcctTessellationTolerances,
} from '@taucad/occt-core';
import type { KernelIssue, TessellationReport } from '@taucad/runtime/types';

import type { Build123dMesh } from '#build123d.protocol.js';

const producer = 'build123d';

/**
 * Before absolute meshing, build123d's `angularTolerance` was radians, at most π, and `linearTolerance` a ratio of
 * each edge's size. An explicit angle at or below this many degrees is read as such a stored value.
 */
const staleAngularToleranceLimit = Math.PI;

/** Mesh the retained shapes at absolute tolerances; with `maxTriangles`, an over-budget mesh comes back as counts. */
type MeshRequest = (tolerances: OcctTessellationTolerances, maxTriangles?: number) => Promise<Build123dMesh>;

/** A request with its lane's fallback, defaults and budget. */
type TessellationLane = Readonly<{
  tessellation: OcctTessellation;
  /** The preset a stale value falls back to: the lane's default. */
  fallback: OcctTessellationQuality;
  explicitDefaults: OcctTessellationTolerances;
  budget: number;
  /** Code of the warning a stale value reports. */
  staleCode: 'VIEW_OPTIONS_INVALID' | 'EXPORT_OPTIONS_INVALID';
  /** The shapes' bounding-box diagonal in millimetres; requested only for a preset. */
  measureDiagonal: () => Promise<number>;
}>;

/** A mesh the worker wrote, with what it cost. */
type MeshedArtifact = Readonly<{
  artifact: Readonly<{ artifactPath: string; byteLength: number }>;
  tessellation: TessellationReport;
  issues: KernelIssue[];
}>;

const isStale = (tessellation: OcctTessellation): boolean =>
  typeof tessellation !== 'string' &&
  tessellation.angularTolerance !== undefined &&
  tessellation.angularTolerance <= staleAngularToleranceLimit;

const staleIssue = (lane: TessellationLane): KernelIssue => ({
  message:
    `Tessellation ${JSON.stringify(lane.tessellation)} has an angularTolerance of at most π, which reads as a radian ` +
    `value saved before build123d meshed in millimetres and degrees; it was meshed at the '${lane.fallback}' preset ` +
    `instead. Choose a preset, or explicit tolerances with angularTolerance in degrees above ${String(Math.PI)}.`,
  code: lane.staleCode,
  type: 'kernel',
  severity: 'warning',
  details: { producer, stale: lane.tessellation, effective: lane.fallback },
});

/**
 * Resolve the request: a stale radian value falls back to the lane's preset with a warning, a preset measures the
 * shapes once, and explicit tolerances fill an omitted field from the lane's defaults.
 *
 * @param lane - The request, its fallback, defaults and diagonal measurement.
 * @returns Absolute tolerances with the requested form, and the stale-value warning when one applied.
 */
const resolveLane = async (
  lane: TessellationLane,
): Promise<{ requested: OcctResolvedTessellation; issues: KernelIssue[] }> => {
  const stale = isStale(lane.tessellation);
  const tessellation = stale ? lane.fallback : lane.tessellation;
  const diagonal = typeof tessellation === 'string' ? await lane.measureDiagonal() : Number.NaN;
  return {
    requested: resolveOcctTessellation({
      tessellation,
      explicitDefaults: lane.explicitDefaults,
      measureDiagonal: () => diagonal,
    }),
    issues: stale ? [staleIssue(lane)] : [],
  };
};

const delivered = (mesh: Build123dMesh): Readonly<{ artifactPath: string; byteLength: number }> => {
  if (mesh.artifactPath === undefined || mesh.byteLength === undefined) {
    throw new Error('Build123d worker answered an unbounded mesh request without a GLB.');
  }
  return { artifactPath: mesh.artifactPath, byteLength: mesh.byteLength };
};

/**
 * Mesh a preview within its triangle budget. While the mesh exceeds the budget it is re-meshed one step coarser, at
 * most {@link occtMaxTessellationDowngrades} times, and the last step is delivered whatever it costs with a
 * `TESSELLATION_DOWNGRADED` warning.
 *
 * @param lane - The request, its fallback, defaults, budget and diagonal measurement.
 * @param mesh - The worker's mesh request.
 * @returns The GLB artifact, its tessellation report and any warnings.
 */
export const meshPreviewWithinBudget = async (lane: TessellationLane, mesh: MeshRequest): Promise<MeshedArtifact> => {
  const started = performance.now();
  const { requested, issues } = await resolveLane(lane);
  let effective: OcctTessellationTolerances = requested;
  let downgraded = 0;
  let result = await mesh(effective, lane.budget);
  while (result.artifactPath === undefined && downgraded < occtMaxTessellationDowngrades) {
    effective = coarsenOcctTessellation(effective);
    downgraded++;
    // oxlint-disable-next-line no-await-in-loop -- each coarser step depends on the previous step's count.
    result = await mesh(effective, downgraded < occtMaxTessellationDowngrades ? lane.budget : undefined);
  }
  const elapsed = performance.now() - started;
  if (downgraded > 0) {
    issues.push(
      createTessellationDowngradedIssue({
        producer,
        requested,
        effective,
        downgraded,
        triangles: result.triangles,
        budget: lane.budget,
      }),
    );
  }
  return {
    artifact: delivered(result),
    tessellation: {
      triangles: result.triangles,
      vertices: result.vertices,
      elapsed,
      requested: requested.requested,
      linearTolerance: effective.linearTolerance,
      angularTolerance: effective.angularTolerance,
      downgraded,
    },
    issues,
  };
};

/** Raised when an export mesh exceeds its budget; exports are never coarsened silently. */
export class Build123dTessellationRefusal extends Error {
  public readonly issue: KernelIssue;

  public constructor(issue: KernelIssue) {
    super(issue.message);
    this.issue = issue;
    this.name = 'Build123dTessellationRefusal';
  }
}

/**
 * Mesh an export at the requested tolerances, refusing with `RESOURCE_LIMIT` and a suggested tolerance when the mesh
 * exceeds the export budget.
 *
 * @param lane - The request, its fallback, defaults, budget and diagonal measurement.
 * @param mesh - The worker's mesh request.
 * @returns The GLB artifact, its tessellation report and any warnings.
 * @throws {Build123dTessellationRefusal} When the mesh exceeds the export budget.
 */
export const meshExportWithinBudget = async (lane: TessellationLane, mesh: MeshRequest): Promise<MeshedArtifact> => {
  const started = performance.now();
  const { requested, issues } = await resolveLane(lane);
  const result = await mesh(requested, lane.budget);
  if (result.artifactPath === undefined) {
    throw new Build123dTessellationRefusal(
      createTessellationBudgetExceededIssue({ producer, requested, triangles: result.triangles, budget: lane.budget }),
    );
  }
  return {
    artifact: delivered(result),
    tessellation: {
      triangles: result.triangles,
      vertices: result.vertices,
      elapsed: performance.now() - started,
      requested: requested.requested,
      linearTolerance: requested.linearTolerance,
      angularTolerance: requested.angularTolerance,
      downgraded: 0,
    },
    issues,
  };
};
