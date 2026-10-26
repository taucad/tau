/**
 * Adaptive display meshing for PicoVoxel views: which requests may run, the typed refusal for those
 * that may not, and what a delivered mesh reports about it.
 */
import type { TessellationReport } from '@taucad/runtime/kernel';
import type { KernelIssue } from '@taucad/runtime/types';
import type { Mesh, Voxels } from 'picovoxel';

import type { PicovoxelLane } from '#picovoxel.schemas.js';

/** Adaptive meshing for one build: OpenVDB adaptivity in (0, 1) and its relax pass. */
export type PicovoxelMeshing = { readonly adaptivity: number; readonly relax: boolean };

/**
 * PicoVoxel releases whose `Voxels.toMesh()` takes no options. They would ignore `{ adaptivity, relax }`
 * and return the uniform mesh, so Tau refuses an adaptive request under them rather than mislabel it.
 */
const withoutAdaptiveMeshing: ReadonlySet<string> = new Set(['0.1.0']);

/**
 * Balanced adaptivity: what a fast-lane preview of a release that meshes adaptively would mesh at when the
 * view sets no `meshAdaptivity`. An explicit value always wins, and an export meshes at its own value, 0 by default.
 */
export const picovoxelPreviewAdaptivity = 0.25;

/**
 * Whether an unset `meshAdaptivity` takes {@link picovoxelPreviewAdaptivity}: the gate of the preview
 * watertightness obligation of the Balanced-adaptivity ruling. It is on because adaptive previews keep the in-line
 * seam triangles that stitch merged cells (D36, `dropZeroAreaTriangles`), which measured base-box and helix-heat-x
 * at 0.25 with no boundary and no non-manifold edges. Turn it off again if an adaptive preview opens. Under
 * PicoVoxel 0.1.0 it changes nothing: that release resolves every unset view to 0. PicoVoxel 0.2.0, the first
 * release that meshes adaptively, moved the kernel version, the cache key, by itself.
 */
export const picovoxelAdaptivePreviewsWatertight = true;

/**
 * The adaptivity an unset `meshAdaptivity` resolves to: {@link picovoxelPreviewAdaptivity} on the fast lane of a
 * release whose `toMesh()` takes options while `previewDefault` is on, else 0, the uniform mesh. It applies only
 * where an explicit request of the same value would run, so the default never trips a refusal.
 *
 * @param lane - The build's lane.
 * @param version - The installed PicoVoxel version.
 * @param previewDefault - Whether an unset adaptivity may take the preview default; the watertightness gate.
 * @returns The adaptivity in [0, 1) the view meshes at.
 */
export const picovoxelDefaultAdaptivity = (
  lane: PicovoxelLane,
  version: string,
  previewDefault: boolean = picovoxelAdaptivePreviewsWatertight,
): number =>
  previewDefault && lane === 'fast' && !withoutAdaptiveMeshing.has(version) ? picovoxelPreviewAdaptivity : 0;

/**
 * Decide the meshing a build runs with. An unset `meshAdaptivity` takes {@link picovoxelDefaultAdaptivity}; an
 * explicit value is checked as given.
 *
 * @param options - The view's construction options.
 * @param options.meshAdaptivity - Requested adaptivity in [0, 1), 0 for the uniform mesh; absent for the default.
 * @param options.meshRelax - Whether to relax an adaptive mesh.
 * @param lane - The build's lane.
 * @param version - The installed PicoVoxel version.
 * @returns The meshing to apply (absent for the uniform mesh), or the issue refusing the request.
 */
export const resolvePicovoxelMeshing = (
  {
    meshAdaptivity: requested,
    meshRelax,
  }: { readonly meshAdaptivity?: number | undefined; readonly meshRelax: boolean },
  lane: PicovoxelLane,
  version: string,
): { readonly meshing?: PicovoxelMeshing } | { readonly refusal: KernelIssue } => {
  const meshAdaptivity = requested ?? picovoxelDefaultAdaptivity(lane, version);
  if (meshAdaptivity <= 0) {
    return {};
  }
  const details = { producer: { kernelId: 'picovoxel' }, meshAdaptivity, meshRelax, lane, version };
  if (lane === 'exact') {
    return {
      refusal: {
        message: `PicoVoxel meshes the exact lane uniformly: adaptive meshing (meshAdaptivity ${String(meshAdaptivity)}) changes the bytes the exact lane reproduces. Use lane: 'fast' for an adaptive view, or meshAdaptivity: 0.`,
        code: 'REPRESENTATION_UNSUPPORTED',
        type: 'runtime',
        severity: 'error',
        details: { ...details, refusal: 'PICOVOXEL_MESHING_EXACT_LANE' },
      },
    };
  }
  if (withoutAdaptiveMeshing.has(version)) {
    return {
      refusal: {
        message: `PicoVoxel ${version} cannot mesh adaptively (meshAdaptivity ${String(meshAdaptivity)}): its toMesh() takes no options. Use meshAdaptivity: 0 for the uniform mesh.`,
        code: 'KERNEL_CAPABILITY_MISSING',
        type: 'runtime',
        severity: 'error',
        details: { ...details, capability: 'PICOVOXEL_ADAPTIVE_MESHING' },
      },
    };
  }
  return { meshing: { adaptivity: meshAdaptivity, relax: meshRelax } };
};

/**
 * Mesh a Voxels field with the build's meshing; without one, exactly `toMesh()`.
 *
 * @param field - The field to mesh.
 * @param meshing - The build's adaptive meshing, when it has one.
 * @returns The field's mesh.
 */
export const meshPicovoxelField = (field: Voxels, meshing: PicovoxelMeshing | undefined): Mesh =>
  // PicoVoxel 0.2.0 added the option form; resolvePicovoxelMeshing never passes it under 0.1.0.
  field.toMesh(meshing);

/**
 * The tessellation fields an adaptive mesh adds; none for the uniform mesh.
 *
 * @param meshing - The build's adaptive meshing, when it has one.
 * @returns `adaptivity` and `relax`, or nothing.
 */
export const picovoxelMeshingReport = (
  meshing: PicovoxelMeshing | undefined,
): Pick<TessellationReport, 'adaptivity' | 'relax'> =>
  meshing === undefined ? {} : { adaptivity: meshing.adaptivity, relax: meshing.relax };

/**
 * Restore the meshing fields of a serialized tessellation report at the snapshot trust boundary.
 *
 * @param value - The serialized report.
 * @returns `adaptivity` and `relax` when both are present and valid, nothing when both are absent.
 */
export const snapshotPicovoxelMeshingReport = (value: unknown): Pick<TessellationReport, 'adaptivity' | 'relax'> => {
  const read = (key: string): unknown =>
    typeof value === 'object' && value !== null ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
  const adaptivity = read('adaptivity');
  const relax = read('relax');
  if (adaptivity === undefined && relax === undefined) {
    return {};
  }
  if (typeof adaptivity !== 'number' || !(adaptivity > 0 && adaptivity < 1) || typeof relax !== 'boolean') {
    throw new TypeError(
      'Invalid PicoVoxel serialized tessellation: adaptivity in (0, 1) and a boolean relax must appear together.',
    );
  }
  return { adaptivity, relax };
};
