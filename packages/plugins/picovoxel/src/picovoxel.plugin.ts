import { definePlugin } from '@taucad/runtime/plugin';
import type { PluginFactory } from '@taucad/runtime/plugin';

import { picovoxelKernel } from '#picovoxel.kernel.js';

/** Preserve the inferred toolkit's exact capabilities while naming its kernel factory in declarations. */
type PicovoxelPlugin = PluginFactory<
  { readonly name: '@taucad/picovoxel' },
  { readonly default: typeof picovoxelKernel },
  Readonly<Record<never, never>>,
  Readonly<Record<never, never>>,
  Readonly<Record<never, never>>,
  Readonly<Record<never, never>>,
  Readonly<Record<never, never>>,
  { readonly default: readonly ['kernels.default'] }
>;

/** Canonical `@taucad/picovoxel` plugin factory. @public */
export const picovoxel: PicovoxelPlugin = definePlugin({
  meta: {
    name: '@taucad/picovoxel',
  },

  kernels: {
    default: picovoxelKernel,
  },

  presets: {
    default: ['kernels.default'],
  },
});
