import { expectTypeOf } from 'vitest';
import type { ExpandPluginMachines } from '@taucad/runtime/plugin';

import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import { plugin, grbl, grblMachine } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginMachines<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof grblMachine>]
>();

expectTypeOf(grbl).toEqualTypeOf(plugin);

const machineDefinition = await resolveRuntimePluginDefinition('machine', grblMachine());
type MachineBinding = Parameters<typeof machineDefinition.connect>[0]['configuration'];
expectTypeOf<MachineBinding>().toEqualTypeOf<{ logicalId: string; baudRate: number }>();
// @ts-expect-error -- connection receives the admitted binding-schema output.
const invalidMachineBinding: MachineBinding = { logicalId: 42 };
void invalidMachineBinding;
