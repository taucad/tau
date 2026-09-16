import { expectTypeOf } from 'vitest';
import type { ExpandPluginMiddleware } from '@taucad/runtime/plugin';

import { plugin, middleware } from '#index.js';
import type {
  geometryCache,
  gltfEdgeDetection,
  parameterCache,
  parameterFileResolver,
  parameterUnits,
} from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginMiddleware<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [
    ReturnType<typeof parameterFileResolver>,
    ReturnType<typeof parameterCache>,
    ReturnType<typeof parameterUnits>,
    ReturnType<typeof geometryCache>,
    ReturnType<typeof gltfEdgeDetection>,
  ]
>();

const units = plugin({ preset: 'units' });
expectTypeOf<ExpandPluginMiddleware<readonly [typeof units]>>().toEqualTypeOf<
  readonly [ReturnType<typeof parameterUnits>]
>();

expectTypeOf(middleware).toEqualTypeOf(plugin);
