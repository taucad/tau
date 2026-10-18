import { expectTypeOf, it } from 'vitest';
import type { ExpandPluginTranscoders } from '@taucad/runtime/plugin';

import { plugin, image } from '#index.js';
import type { imageTranscoder, svgTranscoder } from '#index.js';

it('preserves the complete image.plugin type contracts', () => {
  const selected = plugin();

  expectTypeOf<ExpandPluginTranscoders<readonly [typeof selected]>>().toEqualTypeOf<
    readonly [ReturnType<typeof imageTranscoder>, ReturnType<typeof svgTranscoder>]
  >();

  expectTypeOf(image).toEqualTypeOf(plugin);
});
