import { expectTypeOf } from 'vitest';
import type { ExpandPluginMiddleware } from '@taucad/runtime/plugin';

import { plugin, middleware } from '#index.js';
import type { geometryCache, gltfEdgeDetection, parameterCache, parameterFileResolver } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginMiddleware<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [
    ReturnType<typeof parameterFileResolver>,
    ReturnType<typeof parameterCache>,
    ReturnType<typeof geometryCache>,
    ReturnType<typeof gltfEdgeDetection>,
  ]
>();

expectTypeOf(middleware).toEqualTypeOf(plugin);
