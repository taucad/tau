import { expectTypeOf, it } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';

import { plugin, smlib } from '#index.js';
import type { smlibKernel } from '#index.js';

it('should preserve the selected kernel contract', () => {
  const selected = plugin();

  expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
    readonly [ReturnType<typeof smlibKernel>]
  >();

  expectTypeOf(smlib).toEqualTypeOf(plugin);
});
