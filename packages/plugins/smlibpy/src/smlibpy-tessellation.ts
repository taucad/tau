/**
 * SMLibPy tessellation: the shared OCCT preset-or-explicit request, resolved here and meshed by the Python worker with
 * smlibpy's chordal and angular tolerances. Presets read the shapes' bounding-box diagonal once; explicit tolerances
 * never do.
 */
import { resolveOcctTessellation } from '@taucad/occt-core';
import type { OcctResolvedTessellation, OcctTessellation, OcctTessellationTolerances } from '@taucad/occt-core';
import type { KernelIssue, TessellationReport } from '@taucad/runtime/types';

import type { SmlibpyArtifact, SmlibpyMesh } from '#smlibpy.protocol.js';

/** Mesh the retained shapes at absolute tolerances. */
export type SmlibpyMeshRequest = (tolerances: OcctTessellationTolerances) => Promise<SmlibpyMesh>;

/** A request with its lane's defaults. */
export type SmlibpyTessellationLane = Readonly<{
  tessellation: OcctTessellation;
  explicitDefaults: OcctTessellationTolerances;
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

/**
 * Mesh the retained shapes once, at the requested tolerances. Nothing coarsens the mesh and nothing refuses it for
 * its size: there is no triangle budget for previews or exports.
 *
 * @param lane - The request, its defaults and diagonal measurement.
 * @param mesh - The worker's mesh request.
 * @returns The mesh bundle, its tessellation report and any warnings.
 */
export const meshTessellation = async (
  lane: SmlibpyTessellationLane,
  mesh: SmlibpyMeshRequest,
): Promise<MeshedArtifact> => {
  const started = performance.now();
  const requested = await resolveSmlibpyTessellation(lane);
  const { artifactPath, byteLength, triangles, vertices } = await mesh(requested);
  return {
    artifact: { artifactPath, byteLength },
    tessellation: {
      triangles,
      vertices,
      elapsed: performance.now() - started,
      requested: requested.requested,
      linearTolerance: requested.linearTolerance,
      angularTolerance: requested.angularTolerance,
    },
    issues: [],
  };
};
