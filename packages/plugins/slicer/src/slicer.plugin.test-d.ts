import { expectTypeOf } from 'vitest';
import type { ExpandPluginTranscoders } from '@taucad/runtime/plugin';

import { plugin, slicer } from '#index.js';
import type { slicerTranscoder } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginTranscoders<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof slicerTranscoder>]
>();

expectTypeOf(slicer).toEqualTypeOf(plugin);
