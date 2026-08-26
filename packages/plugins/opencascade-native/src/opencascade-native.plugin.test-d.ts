import { expectTypeOf } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';

// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-import self-reference resolves this package's source alias.
import { plugin, opencascadeNative } from '#index.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-import self-reference resolves this package's source alias.
import type { opencascadeNativeKernel } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof opencascadeNativeKernel>]
>();

expectTypeOf(opencascadeNative).toEqualTypeOf(plugin);
