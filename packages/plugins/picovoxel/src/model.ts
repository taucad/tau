import type { Mesh, Voxels } from 'picovoxel';

type Part = Mesh | Voxels | Readonly<{ shape: Mesh | Voxels; name?: string }>;

/**
 * A PicoVoxel model's single part or flat list of independently delivered parts.
 *
 * Raw geometry keeps generated names. Descriptors attach a display name at the output boundary;
 * names are trimmed, blank names fall back to `Shape N`, and duplicates are preserved.
 * Names do not create stable identity, hierarchy or assembly occurrences.
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
export type PicovoxelResult = Part | readonly Part[];
