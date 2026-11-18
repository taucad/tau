import { expectTypeOf } from 'vitest';
import type { ExpandPluginKernels, ExpandPluginTranscoders } from '@taucad/runtime/plugin';

import { plugin, cadmpeg } from '#index.js';
import type { cadmpegKernel, cadmpegTranscoder } from '#index.js';

const selected = plugin();
const all = plugin({ preset: 'all' });

expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof cadmpegKernel>]
>();

expectTypeOf<ExpandPluginTranscoders<readonly [typeof all]>>().toEqualTypeOf<
  readonly [ReturnType<typeof cadmpegTranscoder>]
>();

expectTypeOf(cadmpeg).toEqualTypeOf(plugin);
