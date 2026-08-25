import { expectTypeOf } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';

import { plugin, opencascade } from '#index.js';
import type { opencascadeKernel } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof opencascadeKernel>]
>();

expectTypeOf(opencascade).toEqualTypeOf(plugin);
