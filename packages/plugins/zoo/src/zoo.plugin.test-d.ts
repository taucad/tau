import { expectTypeOf, it } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';

import { plugin, zoo } from '#index.js';
import type { zooKernel } from '#index.js';

it('preserves the complete zoo.plugin type contracts', () => {
  const selected = plugin();

  expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
    readonly [ReturnType<typeof zooKernel>]
  >();

  expectTypeOf(zoo).toEqualTypeOf(plugin);
});
