import { expectTypeOf, it } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';

import { plugin, manifold } from '#index.js';
import type { manifoldKernel } from '#index.js';

it('preserves the complete manifold.plugin type contracts', () => {
  const selected = plugin();

  expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
    readonly [ReturnType<typeof manifoldKernel>]
  >();

  expectTypeOf(manifold).toEqualTypeOf(plugin);
});
