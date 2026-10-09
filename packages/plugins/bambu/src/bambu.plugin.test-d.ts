import { expectTypeOf } from 'vitest';
import type { ExpandPluginMachines } from '@taucad/runtime/plugin';

import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import type { z } from 'zod';

import { plugin, bambu, bambuMachine } from '#index.js';
import type {
  bambuDefinitions,
  bambuManifests,
  bambuSubmissionConfiguration,
  bambuSubmissionConfigurations,
} from '#bambu.manifest.js';
import type { BambuModel } from '#bambu.protocol.js';
import { bambuModels } from '#bambu.protocol.js';
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

// Every per-model table covers every model, so a new model fails to compile instead of taking another's values.
expectTypeOf<keyof typeof bambuModels>().toEqualTypeOf<BambuModel>();
expectTypeOf<keyof typeof bambuDefinitions>().toEqualTypeOf<BambuModel>();
expectTypeOf<keyof typeof bambuManifests>().toEqualTypeOf<BambuModel>();
expectTypeOf<keyof typeof bambuSubmissionConfigurations>().toEqualTypeOf<BambuModel>();
// @ts-expect-error -- a table without a model's row does not compile.
const missingRow: typeof bambuModels = { 'A1 mini': bambuModels['A1 mini'] };
void missingRow;
