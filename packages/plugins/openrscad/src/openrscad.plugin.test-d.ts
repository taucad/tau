import { expectTypeOf } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';
import { plugin, openrscad } from '#index.js';
import type { openrscadKernel } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof openrscadKernel>]
>();

expectTypeOf(openrscad).toEqualTypeOf(plugin);
