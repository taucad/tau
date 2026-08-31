import { expectTypeOf } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';

import { plugin, picovoxel } from '#index.js';
import type { picovoxelKernel } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof picovoxelKernel>]
>();
expectTypeOf(picovoxel).toEqualTypeOf(plugin);
