import { expectTypeOf } from 'vitest';
import type { ExpandPluginTranscoders } from '@taucad/runtime/plugin';

import { plugin, heif } from '#index.js';
import type { heifTranscoder } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginTranscoders<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof heifTranscoder>]
>();

expectTypeOf(heif).toEqualTypeOf(plugin);
