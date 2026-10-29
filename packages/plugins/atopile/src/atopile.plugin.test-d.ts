import { expectTypeOf } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';

import { plugin, atopile } from '#index.js';
import type { atopileKernel } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof atopileKernel>]
>();

expectTypeOf(atopile).toEqualTypeOf(plugin);
