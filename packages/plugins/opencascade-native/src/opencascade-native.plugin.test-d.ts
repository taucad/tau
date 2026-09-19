import { expectTypeOf } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';

import { plugin, opencascadeNative } from '#index.js';
import type { opencascadeNativeKernel } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof opencascadeNativeKernel>]
>();

expectTypeOf(opencascadeNative).toEqualTypeOf(plugin);
