/**
 * Build123d tessellation: the shared OCCT preset-or-explicit request, resolved here and meshed by the Python worker in
 * OCCT's absolute mode (I4). Presets read the shapes' bounding-box diagonal once; explicit tolerances never do.
 */
import { resolveOcctTessellation } from '@taucad/occt-core';
import type {
  OcctResolvedTessellation,
  OcctTessellation,
  OcctTessellationQuality,
  OcctTessellationTolerances,
} from '@taucad/occt-core';
import type { KernelIssue, TessellationReport } from '@taucad/runtime/types';

import type { Build123dArtifact, Build123dMesh } from '#build123d.protocol.js';

const producer = 'build123d';

/**
 * Before absolute meshing, build123d's `angularTolerance` was radians, at most π, and `linearTolerance` a ratio of
 * each edge's size. An explicit angle at or below this many degrees is read as such a stored value.
 */
const staleAngularToleranceLimit = Math.PI;

/** Mesh the retained shapes at absolute tolerances. */
type MeshRequest = (tolerances: OcctTessellationTolerances) => Promise<Build123dMesh>;

/** A request with its lane's fallback and defaults. */
type TessellationLane = Readonly<{
  tessellation: OcctTessellation;
  /** The preset a stale value falls back to: the lane's default. */
  fallback: OcctTessellationQuality;
  explicitDefaults: OcctTessellationTolerances;
  /** Code of the warning a stale value reports. */
  staleCode: 'VIEW_OPTIONS_INVALID' | 'EXPORT_OPTIONS_INVALID';
  /** The shapes' bounding-box diagonal in millimetres; requested only for a preset. */
  measureDiagonal: () => Promise<number>;
}>;

/** A mesh the worker wrote, with what it cost. */
type MeshedArtifact = Readonly<{
  artifact: Build123dArtifact;
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

/**
 * Mesh the retained shapes once, at the requested tolerances. Nothing coarsens the mesh and nothing refuses it for
 * its size: there is no triangle budget for previews or exports.
 *
 * @param lane - The request, its fallback, defaults and diagonal measurement.
 * @param mesh - The worker's mesh request.
 * @returns The GLB artifact, its tessellation report and any warnings.
 */
export const meshTessellation = async (lane: TessellationLane, mesh: MeshRequest): Promise<MeshedArtifact> => {
  const started = performance.now();
  const { requested, issues } = await resolveLane(lane);
  const { triangles, vertices, ...artifact } = await mesh(requested);
  return {
    artifact,
    tessellation: {
      triangles,
      vertices,
      elapsed: performance.now() - started,
      requested: requested.requested,
      linearTolerance: requested.linearTolerance,
      angularTolerance: requested.angularTolerance,
    },
    issues,
  };
};
