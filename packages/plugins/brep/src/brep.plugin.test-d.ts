import { expectTypeOf, it } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';

import { plugin, brep } from '#index.js';
import type { brepKernel } from '#index.js';

it('preserves the complete brep.plugin type contracts', () => {
  const selected = plugin();

  expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
    readonly [ReturnType<typeof brepKernel>]
  >();

  expectTypeOf(brep).toEqualTypeOf(plugin);
});
