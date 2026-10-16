import { expectTypeOf } from 'vitest';
import type { ExpandPluginMiddleware } from '@taucad/runtime/plugin';

import { plugin, middleware } from '#index.js';
import type {
  displaySimplification,
  geometryCache,
  gltfEdgeDetection,
  parameterFileResolver,
  parameterUnits,
} from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginMiddleware<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [
    ReturnType<typeof parameterFileResolver>,
    ReturnType<typeof parameterUnits>,
    ReturnType<typeof geometryCache>,
    ReturnType<typeof gltfEdgeDetection>,
    ReturnType<typeof displaySimplification>,
  ]
>();

const units = plugin({ preset: 'units' });
expectTypeOf<ExpandPluginMiddleware<readonly [typeof units]>>().toEqualTypeOf<
  readonly [ReturnType<typeof parameterUnits>]
>();

expectTypeOf(middleware).toEqualTypeOf(plugin);
