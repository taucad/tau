import { expectTypeOf } from 'vitest';
import type { ExpandPluginMachines } from '@taucad/runtime/plugin';

import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import { plugin, bambu, bambuMachine } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginMachines<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof bambuMachine>]
>();

expectTypeOf(bambu).toEqualTypeOf(plugin);

const machineDefinition = await resolveRuntimePluginDefinition('machine', bambuMachine());
type MachineBinding = Parameters<typeof machineDefinition.connect>[0]['configuration'];
expectTypeOf<MachineBinding>().toEqualTypeOf<{
  logicalId: string;
  address?: string;
  serial?: string;
  wireForm?: 'a' | 'b' | 'c';
}>();
// @ts-expect-error -- connection receives the admitted binding-schema output.
const invalidMachineBinding: MachineBinding = { logicalId: 42 };
void invalidMachineBinding;
