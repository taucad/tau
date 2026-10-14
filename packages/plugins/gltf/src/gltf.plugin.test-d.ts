import { expectTypeOf, it } from 'vitest';
import type { ExpandPluginKernels, ExpandPluginTranscoders } from '@taucad/runtime/plugin';

import { plugin, gltf } from '#index.js';
import type { gltfKernel, gltfTranscoder } from '#index.js';

it('preserves the complete gltf.plugin type contracts', () => {
  const selected = plugin();

  expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
    readonly [ReturnType<typeof gltfKernel>]
  >();

  expectTypeOf<ExpandPluginTranscoders<readonly [typeof selected]>>().toEqualTypeOf<
    readonly [ReturnType<typeof gltfTranscoder>]
  >();

  expectTypeOf(gltf).toEqualTypeOf(plugin);
});
