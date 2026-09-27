import { expectTypeOf } from 'vitest';
import type { ExpandPluginTranscoders } from '@taucad/runtime/plugin';

import type * as bambuStudioEngine from '#bambu-studio/engine.js';
import type * as bambuStudioStub from '#bambu-studio/engine.stub.js';
import { plugin, slicer } from '#index.js';
import type { slicerTranscoder } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginTranscoders<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof slicerTranscoder>]
>();

expectTypeOf(slicer).toEqualTypeOf(plugin);

// Browser builds get the stub under the same names, callable wherever the Node engine is.
expectTypeOf<typeof bambuStudioStub>().toExtend<typeof bambuStudioEngine>();
expectTypeOf<keyof typeof bambuStudioEngine>().toEqualTypeOf<keyof typeof bambuStudioStub>();
