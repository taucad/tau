import type { Mesh, Voxels } from 'picovoxel';
import type { GlbMaterial, GlbResources } from '@taucad/geometry-core';

/**
 * A delivered part's geometry, display name and standard glTF material.
 * Material colors are linear, rotations are radians, volume distances are metres and
 * iridescence thickness is nanometres. Texture indexes address model-level shared resources.
 * @public
 */
export type PicovoxelPart = Readonly<{ shape: Mesh | Voxels; name?: string; material?: GlbMaterial }>;

type Part = Mesh | Voxels | PicovoxelPart;

/** A flat model with shared indexed images, textures and samplers. @public */
export type PicovoxelModel = GlbResources & Readonly<{ shapes: readonly Part[] }>;

/**
 * A PicoVoxel model's single part, flat list, or model with shared image resources.
 *
 * Raw geometry keeps generated names. Descriptors attach a display name at the output boundary;
 * names are trimmed, blank names fall back to `Shape N`, and duplicates are preserved.
 * Names do not create stable identity, hierarchy or assembly occurrences.
 * Descriptor materials apply to the final geometry and are copied with image bytes when returned.
 * Absent material retains CAD defaults; authored glTF alpha modes and double-sided values are preserved.
 *
 * @public
 * @example <caption>Name a delivered part</caption>
 * ```typescript
 * import type { Pico } from 'picovoxel';
 * import type { PicovoxelResult } from '@taucad/picovoxel';
 *
 * export default function main(pico: Pico): PicovoxelResult {
 *   return { shape: pico.createVoxels({ shape: 'sphere', radius: 10 }), name: 'Housing' };
 * }
 * ```
 */
export type PicovoxelResult = Part | readonly Part[] | PicovoxelModel;

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- Public authoring aliases use the shared glTF contract.
export type { GlbMaterial as Material, GlbImage as Image, GlbResources as Resources } from '@taucad/geometry-core';
