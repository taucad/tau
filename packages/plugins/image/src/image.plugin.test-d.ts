import { expectTypeOf } from 'vitest';
import type { ExpandPluginTranscoders } from '@taucad/runtime/plugin';

import { plugin, image } from '#index.js';
import type { rasterTranscoder, renderTranscoder, svgTranscoder } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginTranscoders<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof renderTranscoder>, ReturnType<typeof svgTranscoder>, ReturnType<typeof rasterTranscoder>]
>();

expectTypeOf(image).toEqualTypeOf(plugin);
