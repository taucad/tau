import { expectTypeOf } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { plugin, openrscad, openrscadKernel } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof openrscadKernel>]
>();

expectTypeOf(openrscad).toEqualTypeOf(plugin);

const registration = openrscadKernel();
const definition = await resolveRuntimePluginDefinition('kernel', registration);
expectTypeOf(registration.id).toEqualTypeOf<'openrscad'>();
expectTypeOf<keyof typeof registration.views>().toEqualTypeOf<'model'>();
expectTypeOf<keyof typeof registration.exports>().toEqualTypeOf<'glb' | '3mf'>();
expectTypeOf<Parameters<NonNullable<typeof definition.render>>[0]['view']>().toEqualTypeOf<'model'>();
expectTypeOf<Parameters<NonNullable<typeof definition.export>>[0]['exportId']>().toEqualTypeOf<'glb' | '3mf'>();
