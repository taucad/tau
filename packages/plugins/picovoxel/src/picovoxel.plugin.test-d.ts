import { expectTypeOf } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import { plugin, picovoxel, picovoxelKernel } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof picovoxelKernel>]
>();
expectTypeOf(picovoxel).toEqualTypeOf(plugin);

const registration = picovoxelKernel();
const definition = await resolveRuntimePluginDefinition('kernel', registration);
expectTypeOf(registration.id).toEqualTypeOf<'picovoxel'>();
expectTypeOf<keyof typeof registration.views>().toEqualTypeOf<'model'>();
expectTypeOf<keyof typeof registration.exports>().toEqualTypeOf<'glb' | 'gltf' | 'stl'>();
expectTypeOf<Parameters<NonNullable<typeof definition.render>>[0]['view']>().toEqualTypeOf<'model'>();
expectTypeOf<Parameters<NonNullable<typeof definition.export>>[0]['exportId']>().toEqualTypeOf<
  'glb' | 'gltf' | 'stl'
>();
