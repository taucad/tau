import { expectTypeOf } from 'vitest';
import type { ExpandPluginMachines } from '@taucad/runtime/plugin';

import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import type { z } from 'zod';

import { plugin, bambu, bambuMachine } from '#index.js';
import type { bambuSubmissionConfiguration } from '#bambu.manifest.js';
import type { BambuSubmission } from '#bambu.session.js';
import { bambuAddressOf, bambuSlotOf } from '#bambu.settings.js';
import type { BambuSlotAddress, bambuSettingsConfiguration } from '#bambu.settings.js';

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

// The session reads exactly what the submission schema admits.
expectTypeOf<z.output<typeof bambuSubmissionConfiguration.schema>>().toExtend<BambuSubmission>();

// `./settings` carries the slot encoding consumers map through.
expectTypeOf(bambuSlotOf).toEqualTypeOf<(address: BambuSlotAddress) => number | undefined>();
expectTypeOf(bambuAddressOf).returns.toEqualTypeOf<BambuSlotAddress>();
expectTypeOf<z.output<typeof bambuSettingsConfiguration.schema>['material']>().toExtend<
  { defaultSlot?: number; slotsByColor?: Record<string, number> } | undefined
>();
