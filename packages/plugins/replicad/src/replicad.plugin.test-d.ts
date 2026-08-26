import { expectTypeOf } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';

import { plugin, replicad } from '#index.js';
import type { replicadKernel } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof replicadKernel>]
>();

expectTypeOf(replicad).toEqualTypeOf(plugin);
