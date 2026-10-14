import { expectTypeOf, it } from 'vitest';
import type { ExpandPluginBundlers } from '@taucad/runtime/plugin';

import { plugin, rolldown } from '#index.js';
import type { rolldownBundler } from '#index.js';

it('preserves the complete rolldown.plugin type contracts', () => {
  const selected = plugin();

  expectTypeOf<ExpandPluginBundlers<readonly [typeof selected]>>().toEqualTypeOf<
    readonly [ReturnType<typeof rolldownBundler>]
  >();

  expectTypeOf(rolldown).toEqualTypeOf(plugin);
});
