/** Map each model filament to a loaded material slot before slicing or sending. */
import type { MaterialSlotAddress } from '@taucad/runtime/machine';
import { ParameterSelect } from '#components/geometry/parameters/parameter-select.js';
import { PrintSetupRow } from '#components/print/print-setup-row.js';
import { slotKey } from '#components/print/machine-facts.js';
import type { ObservedSlot } from '#components/print/machine-facts.js';

/** One row per model filament; external spool eligibility is decided by the caller. @public */
export function FilamentSlots({
  colors,
  mapping,
  slots,
  onChange,
}: {
  readonly colors: readonly string[];
  /** The slot each filament prints from, in filament order; undefined for none yet. */
  readonly mapping: ReadonlyArray<MaterialSlotAddress | undefined>;
  /** The slots a filament may print from. */
  readonly slots: readonly ObservedSlot[];
  readonly onChange: (filament: number, slot: MaterialSlotAddress) => void;
}): React.JSX.Element {
  return (
    <div role='group' aria-label='Filaments' className='flex min-w-0 flex-col gap-1'>
      {colors.map((color, index) => {
        const label = `Filament ${String(index + 1)}`;
        const selected = mapping[index];
        return (
          <PrintSetupRow key={label} label={label} swatch={color}>
            <ParameterSelect
              label={`Slot for ${label}`}
              value={selected === undefined ? '' : slotKey(selected)}
              placeholder='Choose a slot'
              groups={[
                {
                  options: slots.map((slot) => ({
                    value: slotKey(slot.address),
                    label: [slot.label, slot.materialId].filter(Boolean).join(' · '),
                    ...(slot.color === undefined ? {} : { swatch: slot.color }),
                  })),
                },
              ]}
              onChange={(value) => {
                const slot = slots.find((candidate) => slotKey(candidate.address) === value);
                if (slot !== undefined) {
                  onChange(index, slot.address);
                }
              }}
            />
          </PrintSetupRow>
        );
      })}
    </div>
  );
}
