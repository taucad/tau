import { expectTypeOf } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';

import { plugin, jscad } from '#index.js';
import type { jscadKernel } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof jscadKernel>]
>();

expectTypeOf(jscad).toEqualTypeOf(plugin);
