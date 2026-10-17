import { expectTypeOf } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';

import { plugin, smlib } from '#index.js';
import type { smlibKernel } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof smlibKernel>]
>();

expectTypeOf(smlib).toEqualTypeOf(plugin);
