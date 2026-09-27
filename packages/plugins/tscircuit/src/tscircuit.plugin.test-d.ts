import { expectTypeOf } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';

import { plugin, tscircuit } from '#index.js';
import type { tscircuitKernel } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof tscircuitKernel>]
>();

expectTypeOf(tscircuit).toEqualTypeOf(plugin);
