/** Map each model filament to a loaded AMS tray before slicing or sending. */
import { ParameterSelect } from '#components/geometry/parameters/parameter-select.js';
import { PrintSetupRow } from '#components/print/print-setup-row.js';
import type { BambuTray } from '#components/print/bambu-studio-presets.js';

/** One row per model filament; external spool eligibility is decided by the caller. @public */
export function FilamentSlots({
  colors,
  mapping,
  trays,
  onChange,
}: {
  readonly colors: readonly string[];
  readonly mapping: readonly number[];
  readonly trays: readonly BambuTray[];
  readonly onChange: (filament: number, slot: number) => void;
}): React.JSX.Element {
  return (
    <div role='group' aria-label='Filaments' className='flex min-w-0 flex-col gap-1'>
      {colors.map((color, index) => {
        const label = `Filament ${String(index + 1)}`;
        const slot = mapping[index] ?? -1;
        return (
          <PrintSetupRow key={label} label={label} swatch={color}>
            <ParameterSelect
              label={`Slot for ${label}`}
              value={slot < 0 ? '' : String(slot)}
              placeholder='Choose a slot'
              groups={[
                {
                  options: trays.map((tray) => ({
                    value: String(tray.slot),
                    label: [tray.label, tray.materialId].filter(Boolean).join(' · '),
                    ...(tray.color === undefined ? {} : { swatch: tray.color }),
                  })),
                },
              ]}
              onChange={(value) => {
                onChange(index, Number(value));
              }}
            />
          </PrintSetupRow>
        );
      })}
    </div>
  );
}
