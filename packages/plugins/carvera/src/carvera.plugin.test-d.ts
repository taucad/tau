import { expectTypeOf } from 'vitest';
import type { ExpandPluginMachines } from '@taucad/runtime/plugin';

import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import { plugin, carvera, carveraMachine } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginMachines<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof carveraMachine>]
>();

expectTypeOf(carvera).toEqualTypeOf(plugin);

const machineDefinition = await resolveRuntimePluginDefinition('machine', carveraMachine());
type MachineBinding = Parameters<typeof machineDefinition.connect>[0]['configuration'];
// The address is the discovery endpoint; the binding holds nothing else.
expectTypeOf<MachineBinding>().toEqualTypeOf<Record<string, never>>();
// @ts-expect-error -- connection receives the admitted binding-schema output.
const invalidMachineBinding: MachineBinding = { address: 42 };
void invalidMachineBinding;
