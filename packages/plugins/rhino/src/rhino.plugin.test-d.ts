import { expectTypeOf } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';

import { plugin, rhino } from '#index.js';
import type { rhinoKernel } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof rhinoKernel>]
>();

expectTypeOf(rhino).toEqualTypeOf(plugin);
