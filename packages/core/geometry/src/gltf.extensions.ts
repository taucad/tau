import type { Extension } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { tauCadGltfExtensions } from '#extensions/registry.js';

/**
 * Combined set of all Khronos extensions plus vendor stubs required for lossless round-tripping.
 *
 * @public
 */
export const allExtensions: Array<typeof Extension> = [...KHRONOS_EXTENSIONS, ...tauCadGltfExtensions];
