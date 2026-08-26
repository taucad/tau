import { expectTypeOf } from 'vitest';
import type { ExpandPluginBundlers } from '@taucad/runtime/plugin';

import { plugin, esbuild } from '#index.js';
import type { esbuildBundler } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginBundlers<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof esbuildBundler>]
>();

expectTypeOf(esbuild).toEqualTypeOf(plugin);
