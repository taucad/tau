/** Bambu Studio's selected process; the printer and filament presets are overrides in More settings. */
import type { BambuPresetSummary } from '@taucad/slicer/bambu-studio';
import { ParameterSelect } from '#components/geometry/parameters/parameter-select.js';
import type { ParameterSelectGroup } from '#components/geometry/parameters/parameter-select.js';
import { PrintSetupRow } from '#components/print/print-setup-row.js';
import type { BambuStudioMode } from '#components/print/use-bambu-studio.js';

/** One used material slot as the printer reports it. @public */
export type BambuTray = Readonly<{ slot: number; label: string; materialId?: string; color?: string }>;

/**
 * A preset's name without the printer suffix every X1C preset carries.
 *
 * @param name - The Bambu Studio preset name.
 * @returns The short name.
 * @public
 */
export const shortPresetName = (name: string): string => name.replace(/ @BBL X1C$/u, '');

const presetGroups = (presets: readonly BambuPresetSummary[], selected: string): readonly ParameterSelectGroup[] => {
  const listed = presets.some(({ name }) => name === selected)
    ? presets
    : [{ name: selected, kind: 'process', source: 'system' } satisfies BambuPresetSummary, ...presets];
  const options = (source: BambuPresetSummary['source']) =>
    listed
      .filter((preset) => preset.source === source)
      // Process names already lead with their layer height.
      .map((preset) => ({ value: preset.name, label: shortPresetName(preset.name) }));
  const own = options('user');
  const system = options('system');
  return own.length === 0
    ? [{ options: system }]
    : [
        { label: 'Your presets', options: own },
        { label: 'System presets', options: system },
      ];
};

function PresetRow({
  label,
  value,
  presets,
  swatch,
  isModified,
  onChange,
  onReset,
}: {
  readonly label: string;
  readonly value: string;
  readonly presets: readonly BambuPresetSummary[];
  readonly swatch?: string;
  readonly isModified: boolean;
  readonly onChange: (name: string) => void;
  readonly onReset: () => void;
}): React.JSX.Element {
  return (
    <PrintSetupRow label={label} swatch={swatch} isModified={isModified} onReset={onReset}>
      <ParameterSelect label={label} value={value} groups={presetGroups(presets, value)} onChange={onChange} />
    </PrintSetupRow>
  );
}

/**
 * Primary mode: the process. Printer mode, in More settings: the printer preset and a filament
 * preset per used tray, each an override of what the printer reports. The selected presets are
 * written through the root-owned machine settings profile.
 *
 * @public
 */
export function BambuStudioPresets({
  studio,
  trays,
  mode = 'primary',
}: {
  readonly studio: BambuStudioMode;
  readonly trays: readonly BambuTray[];
  readonly mode?: 'primary' | 'printer';
}): React.JSX.Element | undefined {
  const { selection, chosen, resetChoice } = studio;
  if (!selection) {
    return undefined;
  }
  if (mode === 'printer') {
    return (
      <div role='group' aria-label='Bambu Studio overrides' className='flex min-w-0 flex-col gap-1'>
        <PresetRow
          label='Printer preset'
          value={selection.printer}
          presets={studio.printers}
          isModified={chosen.printer !== undefined}
          onChange={studio.choosePrinter}
          onReset={() => {
            resetChoice('printer');
          }}
        />
        {selection.filaments.map((filament, index) => {
          const tray = trays[index];
          if (!tray) {
            return null;
          }
          return (
            <PresetRow
              key={tray.slot}
              label={`Filament ${tray.label}`}
              value={filament}
              presets={studio.filaments}
              swatch={tray.color}
              isModified={chosen.filaments?.[tray.slot] !== undefined}
              onChange={(name) => {
                studio.chooseFilament(tray.slot, name);
              }}
              onReset={() => {
                studio.resetFilament(tray.slot);
              }}
            />
          );
        })}
      </div>
    );
  }
  return (
    <div role='group' aria-label='Bambu Studio presets' className='flex min-w-0 flex-col gap-1'>
      <PresetRow
        label='Process'
        value={selection.process}
        presets={studio.processes}
        isModified={chosen.process !== undefined || chosen.preset !== undefined}
        onChange={studio.chooseProcess}
        onReset={() => {
          resetChoice('process');
        }}
      />
    </div>
  );
}
