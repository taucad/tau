/**
 * Plain readings of the machine contract that every machine surface shares: the material system and its slots,
 * the toolhead's nozzles, and halt outcomes in words. Pure; no I/O.
 *
 * @module
 */

import { componentValue } from '@taucad/runtime/machine';
import type {
  MachineComponent,
  MachineDirectoryEntry,
  MachineHaltOutcome,
  MachineManifest,
  MaterialSlotAddress,
  MaterialSlotSnapshot,
} from '@taucad/runtime/machine';

/** A material-system component as a manifest declares it. @public */
export type MaterialSystemComponent = Extract<MachineComponent, { kind: 'material-system' }>;
/** A toolhead component as a manifest declares it. @public */
export type ToolheadComponent = Extract<MachineComponent, { kind: 'toolhead' }>;
/** What a material system reports. @public */
export type MaterialSystemValue = NonNullable<ReturnType<typeof componentValue<'material-system'>>>;

type WithComponents = Pick<MachineManifest, 'components'>;

/**
 * The first material system a machine declares.
 *
 * @param capabilities - A manifest or installed capabilities.
 * @returns The component, or nothing on a machine without one.
 * @public
 */
export const materialSystemOf = (capabilities: WithComponents): MaterialSystemComponent | undefined =>
  capabilities.components.find(
    (component): component is MaterialSystemComponent => component.kind === 'material-system',
  );

/**
 * The first toolhead a machine declares.
 *
 * @param capabilities - A manifest or installed capabilities.
 * @returns The component, or nothing on a machine without one.
 * @public
 */
export const toolheadOf = (capabilities: WithComponents): ToolheadComponent | undefined =>
  capabilities.components.find((component): component is ToolheadComponent => component.kind === 'toolhead');

/**
 * What the machine's material system reports now.
 *
 * @param entry - The machine as observed.
 * @returns The value, or nothing while unknown or undeclared.
 * @public
 */
export const materialSystemValue = (entry: MachineDirectoryEntry): MaterialSystemValue | undefined => {
  const system = materialSystemOf(entry.descriptor.capabilities);
  return system === undefined ? undefined : componentValue(entry.snapshot.components, system.id, 'material-system');
};

/**
 * Whether two slot addresses name the same slot.
 *
 * @param left - One address.
 * @param right - Another, or nothing.
 * @returns True for the same unit and slot.
 * @public
 */
export const sameSlot = (left: MaterialSlotAddress, right: MaterialSlotAddress | null | undefined): boolean =>
  right !== null && right !== undefined && left.unitId === right.unitId && left.slotId === right.slotId;

/**
 * A slot's label as the manifest names it: "A1", "Ext".
 *
 * @param system - The material system.
 * @param address - The slot.
 * @returns The slot's label, or its id when the manifest does not declare it.
 * @public
 */
export const slotLabel = (system: MaterialSystemComponent | undefined, address: MaterialSlotAddress): string =>
  system?.units.find((unit) => unit.id === address.unitId)?.slots.find((slot) => slot.id === address.slotId)?.label ??
  address.slotId;

/**
 * Whether a slot sits on an external holder rather than in a feeder.
 *
 * @param system - The material system.
 * @param address - The slot.
 * @returns True for an external unit's slot.
 * @public
 */
export const isExternalSlot = (system: MaterialSystemComponent | undefined, address: MaterialSlotAddress): boolean =>
  system?.units.find((unit) => unit.id === address.unitId)?.kind === 'external';

/**
 * Every slot the manifest declares, in order, with what the machine reports for it.
 *
 * @param system - The material system.
 * @param value - What it reports.
 * @returns The slots; one the machine does not report reads as unknown.
 * @public
 */
export const declaredSlots = (
  system: MaterialSystemComponent | undefined,
  value: MaterialSystemValue | undefined,
): readonly MaterialSlotSnapshot[] =>
  (system?.units ?? []).flatMap((unit) =>
    unit.slots.map(
      (slot): MaterialSlotSnapshot =>
        value?.slots.find((candidate) => sameSlot(candidate.slot, { unitId: unit.id, slotId: slot.id })) ?? {
          slot: { unitId: unit.id, slotId: slot.id },
          state: 'unknown',
          identifiedBy: 'unknown',
          editing: { allowed: false, duringRun: false },
        },
    ),
  );

/**
 * The Bambu tray index a submission names a slot by: feeder units four trays each, in manifest order, and 254 for
 * the external holder. Only the Bambu submission form carries these numbers; actions use slot addresses.
 *
 * @param system - The material system.
 * @param address - The slot.
 * @returns The tray index, or nothing for an undeclared slot.
 * @public
 */
export const bambuTrayIndex = (
  system: MaterialSystemComponent | undefined,
  address: MaterialSlotAddress,
): number | undefined => {
  if (isExternalSlot(system, address)) {
    return 254;
  }
  const feeders = system?.units.filter((unit) => unit.kind === 'feeder') ?? [];
  const unitIndex = feeders.findIndex((unit) => unit.id === address.unitId);
  const slotIndex = feeders[unitIndex]?.slots.findIndex((slot) => slot.id === address.slotId) ?? -1;
  // ponytail: Bambu numbers trays four per AMS; a six-slot feeder would need its own stride.
  return unitIndex < 0 || slotIndex < 0 ? undefined : unitIndex * 4 + slotIndex;
};

/**
 * The slot address of a Bambu tray index, the inverse of {@link bambuTrayIndex}.
 *
 * @param system - The material system.
 * @param index - The tray index a submission names.
 * @returns The address, or nothing for an index the manifest does not declare.
 * @public
 */
export const slotOfBambuTray = (
  system: MaterialSystemComponent | undefined,
  index: number,
): MaterialSlotAddress | undefined => {
  if (index === 254) {
    const external = system?.units.find((unit) => unit.kind === 'external');
    const slot = external?.slots[0];
    return external === undefined || slot === undefined ? undefined : { unitId: external.id, slotId: slot.id };
  }
  const unit = system?.units.filter((candidate) => candidate.kind === 'feeder')[Math.floor(index / 4)];
  const slot = unit?.slots[index % 4];
  return unit === undefined || slot === undefined ? undefined : { unitId: unit.id, slotId: slot.id };
};

/**
 * A halt outcome in one sentence, shown beside Stop, Pause and Cancel before they are pressed.
 *
 * @param outcome - What halting leaves the machine doing.
 * @returns "Motion halts at once, heaters turn off, the position is kept."
 * @public
 */
export const describeOutcome = (outcome: MachineHaltOutcome): string => {
  const motion = {
    halts: 'Motion halts at once',
    decelerates: 'Motion slows to a stop',
    'finishes-queued': 'Moves already sent still run',
  }[outcome.motion];
  const spindle = { stops: 'the spindle stops', 'keeps-turning': 'the spindle keeps turning', none: undefined }[
    outcome.spindle
  ];
  const heaters = { off: 'heaters turn off', unchanged: 'heaters stay on', none: undefined }[outcome.heaters];
  const position = outcome.position === 'kept' ? 'the position is kept' : 'the position may be lost';
  return `${[motion, spindle, heaters, position].filter((part) => part !== undefined).join(', ')}.`;
};

/**
 * Whether a provider is a simulator, which every surface marks as simulated.
 *
 * @param providerId - The provider id.
 * @returns True for a simulator provider.
 * @public
 */
export const isSimulatedProvider = (providerId: string): boolean => providerId.includes('simulator');

/** One material slot as a Bambu printer numbers its trays, the vocabulary of Bambu Studio and the submission. @public */
export type ObservedTray = Readonly<{
  /** The Bambu tray index ({@link bambuTrayIndex}). */
  slot: number;
  address: MaterialSlotAddress;
  label: string;
  state: MaterialSlotSnapshot['state'];
  /** The material type the slot reports, such as `PLA`. */
  materialId?: string;
  /** The vendor filament profile, such as `GFA01`. */
  profileId?: string;
  /** `#RRGGBBAA`. */
  color?: string;
}>;

/**
 * The machine's declared material slots as Bambu tray numbers, with what each reports.
 *
 * @param entry - The machine as observed.
 * @returns Every declared slot in manifest order; none on a machine without a material system.
 * @public
 */
export const observedTrays = (entry: MachineDirectoryEntry): readonly ObservedTray[] => {
  const system = materialSystemOf(entry.descriptor.capabilities);
  return declaredSlots(system, materialSystemValue(entry)).flatMap((slot): ObservedTray[] => {
    const index = bambuTrayIndex(system, slot.slot);
    return index === undefined
      ? []
      : [
          {
            slot: index,
            address: slot.slot,
            label: slotLabel(system, slot.slot),
            state: slot.state,
            ...(slot.material === undefined
              ? {}
              : {
                  materialId: slot.material.materialType,
                  profileId: slot.material.preset.profileId,
                  color: slot.material.color,
                }),
          },
        ];
  });
};

/**
 * The slot label of a Bambu tray index: "A1", "Ext".
 *
 * @param capabilities - A manifest or installed capabilities.
 * @param index - The tray index.
 * @returns The label, or "Slot n" for an index the manifest does not declare.
 * @public
 */
export const trayLabel = (capabilities: WithComponents | undefined, index: number): string => {
  const system = capabilities === undefined ? undefined : materialSystemOf(capabilities);
  const address = slotOfBambuTray(system, index);
  return address === undefined ? `Slot ${String(index + 1)}` : slotLabel(system, address);
};

/**
 * The build plate the machine reports: a `plate` reading on any component, naming a manifest plate id.
 *
 * @param entry - The machine as observed.
 * @returns The plate id, when reported.
 * @public
 */
export const observedPlate = (entry: MachineDirectoryEntry): string | undefined => {
  for (const observation of entry.snapshot.components) {
    if (observation.knowledge === 'known' && observation.value.kind === 'readings') {
      const plate = observation.value.values.find(({ id }) => id === 'plate')?.value;
      if (typeof plate === 'string') {
        return plate;
      }
    }
  }
  return undefined;
};
