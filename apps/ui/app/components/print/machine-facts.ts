/**
 * Plain readings of the machine contract that every machine surface shares: the material system and its slots,
 * the toolhead's nozzles, and halt outcomes in words. Pure; no I/O.
 *
 * @module
 */

import { bambuSlotOf } from '@taucad/bambu/settings';
import { componentValue } from '@taucad/runtime/machine';
import type { Quantity } from '@taucad/units/quantity';
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
export const sameSlot = (
  left: MaterialSlotAddress,
  right: NonNullable<MaterialSystemValue>['routes'][number]['current'] | undefined,
): boolean => right?.unitId === left.unitId && right.slotId === left.slotId;

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

/** One material slot as a Bambu printer numbers its trays, the vocabulary of Bambu Studio and the submission. @public */
export type ObservedTray = Readonly<{
  /** The Bambu tray number, as the provider encodes it (`bambuSlotOf`). */
  slot: number;
  address: MaterialSlotAddress;
  label: string;
  /** On an external holder: it feeds one-filament prints only. */
  isExternal: boolean;
  state: MaterialSlotSnapshot['state'];
  /** The material type the slot reports, such as `PLA`. */
  materialId?: string;
  /** The vendor filament profile, such as `GFA01`. */
  profileId?: string;
  /** `#RRGGBBAA`. */
  color?: string;
}>;

/**
 * The machine's declared material slots as Bambu tray numbers, with what each reports. The provider owns the
 * numbering; a slot it cannot number is left out.
 *
 * @param entry - The machine as observed.
 * @returns Every declared slot in manifest order; none on a machine without a material system.
 * @public
 */
export const observedTrays = (entry: MachineDirectoryEntry): readonly ObservedTray[] => {
  const system = materialSystemOf(entry.descriptor.capabilities);
  return declaredSlots(system, materialSystemValue(entry)).flatMap((slot): ObservedTray[] => {
    const index = bambuSlotOf(slot.slot);
    return index === undefined
      ? []
      : [
          {
            slot: index,
            address: slot.slot,
            label: slotLabel(system, slot.slot),
            isExternal: isExternalSlot(system, slot.slot),
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
  const address = (system?.units ?? [])
    .flatMap((unit) => unit.slots.map((slot) => ({ unitId: unit.id, slotId: slot.id })))
    .find((candidate) => bambuSlotOf(candidate) === index);
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

const unitSymbols: ReadonlyMap<string, string> = new Map([
  ['Cel', '°C'],
  ['mm', 'mm'],
  ['m', 'm'],
  ['%', '%'],
]);

/** A snapshot quantity or a manifest quantity: both carry a value and a UCUM unit code. @public */
export type PrintQuantity = Quantity | Readonly<{ value: number; unit: string }>;

/**
 * A native quantity in its own unit, rounded for reading: "215 °C", "0.4 mm".
 *
 * @param quantity - Any admitted quantity.
 * @returns The value and its unit symbol.
 * @public
 */
export const formatQuantity = (quantity: PrintQuantity): string => {
  const code = typeof quantity.unit === 'string' ? quantity.unit : quantity.unit.code;
  const value = typeof quantity.value === 'number' ? Math.round(quantity.value * 100) / 100 : quantity.value;
  return `${String(value)} ${unitSymbols.get(code) ?? code}`;
};
