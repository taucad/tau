/**
 * SMLibPy tessellation: the shared OCCT preset-or-explicit request, resolved here and meshed by the Python worker with
 * smlibpy's chordal and angular tolerances. Presets read the shapes' bounding-box diagonal once; explicit tolerances
 * never do.
 */
import {
  coarsenOcctTessellation,
  createTessellationBudgetExceededIssue,
  createTessellationDowngradedIssue,
  occtMaxTessellationDowngrades,
  resolveOcctTessellation,
} from '@taucad/occt-core';
import type { OcctResolvedTessellation, OcctTessellation, OcctTessellationTolerances } from '@taucad/occt-core';
import type { KernelIssue, TessellationReport } from '@taucad/runtime/types';

import type { SmlibpyArtifact, SmlibpyMesh } from '#smlibpy.protocol.js';

const producer = 'smlibpy';

/** Mesh the retained shapes at absolute tolerances; with `maxTriangles`, an over-budget mesh comes back as counts. */
export type SmlibpyMeshRequest = (
  tolerances: OcctTessellationTolerances,
  maxTriangles?: number,
) => Promise<SmlibpyMesh>;

/** A request with its lane's defaults and budget. */
export type SmlibpyTessellationLane = Readonly<{
  tessellation: OcctTessellation;
  explicitDefaults: OcctTessellationTolerances;
  budget: number;
  /** The shapes' bounding-box diagonal in millimetres; requested only for a preset. */
  measureDiagonal: () => Promise<number>;
}>;

/** A mesh bundle the worker wrote, with what it cost. */
type MeshedArtifact = Readonly<{
  artifact: SmlibpyArtifact;
  tessellation: TessellationReport;
  issues: KernelIssue[];
}>;

/**
 * Resolve the request: a preset measures the shapes once, and explicit tolerances fill an omitted field from the
 * lane's defaults.
 *
 * @param lane - The request, its defaults and diagonal measurement.
 * @returns Absolute tolerances with the requested form.
 */
export const resolveSmlibpyTessellation = async (lane: SmlibpyTessellationLane): Promise<OcctResolvedTessellation> => {
  const diagonal = typeof lane.tessellation === 'string' ? await lane.measureDiagonal() : Number.NaN;
  return resolveOcctTessellation({
    tessellation: lane.tessellation,
    explicitDefaults: lane.explicitDefaults,
    measureDiagonal: () => diagonal,
  });
};

const delivered = (mesh: SmlibpyMesh): SmlibpyArtifact => {
  if (mesh.artifactPath === undefined || mesh.byteLength === undefined) {
    throw new Error('SMLibPy worker answered an unbounded mesh request without a mesh bundle.');
  }
  return { artifactPath: mesh.artifactPath, byteLength: mesh.byteLength };
};

/**
 * Mesh a preview within its triangle budget. While the mesh exceeds the budget it is re-meshed one step coarser, at
 * most {@link occtMaxTessellationDowngrades} times, and the last step is delivered whatever it costs with a
 * `TESSELLATION_DOWNGRADED` warning.
 *
 * @param lane - The request, its defaults, budget and diagonal measurement.
 * @param mesh - The worker's mesh request.
 * @returns The mesh bundle, its tessellation report and any warnings.
 */
export const meshPreviewWithinBudget = async (
  lane: SmlibpyTessellationLane,
  mesh: SmlibpyMeshRequest,
): Promise<MeshedArtifact> => {
  const started = performance.now();
  const requested = await resolveSmlibpyTessellation(lane);
  const issues: KernelIssue[] = [];
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
export class SmlibpyTessellationRefusal extends Error {
  public readonly issue: KernelIssue;

  public constructor(issue: KernelIssue) {
    super(issue.message);
    this.issue = issue;
    this.name = 'SmlibpyTessellationRefusal';
  }
}

/**
 * Refuse an export whose mesh exceeds the export budget, with `RESOURCE_LIMIT` and a suggested tolerance.
 *
 * @param requested - The resolved request the export meshed with.
 * @param triangles - Triangles the export produced.
 * @param budget - The export budget.
 * @throws {SmlibpyTessellationRefusal} When `triangles` exceeds `budget`.
 */
export const assertExportWithinBudget = (
  requested: OcctResolvedTessellation,
  triangles: number,
  budget: number,
): void => {
  if (triangles > budget) {
    throw new SmlibpyTessellationRefusal(
      createTessellationBudgetExceededIssue({ producer, requested, triangles, budget }),
    );
  }
};

/**
 * Mesh an export at the requested tolerances, refusing with `RESOURCE_LIMIT` and a suggested tolerance when the mesh
 * exceeds the export budget.
 *
 * @param lane - The request, its defaults, budget and diagonal measurement.
 * @param mesh - The worker's mesh request.
 * @returns The mesh bundle, its tessellation report and any warnings.
 * @throws {SmlibpyTessellationRefusal} When the mesh exceeds the export budget.
 */
export const meshExportWithinBudget = async (
  lane: SmlibpyTessellationLane,
  mesh: SmlibpyMeshRequest,
): Promise<MeshedArtifact> => {
  const started = performance.now();
  const requested = await resolveSmlibpyTessellation(lane);
  const result = await mesh(requested, lane.budget);
  if (result.artifactPath === undefined) {
    assertExportWithinBudget(requested, result.triangles, lane.budget);
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
    issues: [],
  };
};
