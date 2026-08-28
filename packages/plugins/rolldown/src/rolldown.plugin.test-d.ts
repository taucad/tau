import { expectTypeOf } from 'vitest';
import type { ExpandPluginBundlers } from '@taucad/runtime/plugin';

import { plugin, rolldown } from '#index.js';
import type { rolldownBundler } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginBundlers<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof rolldownBundler>]
>();

expectTypeOf(rolldown).toEqualTypeOf(plugin);
