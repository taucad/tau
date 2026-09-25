/**
 * Bambu Studio's preset pickers: printer, process and one filament per used
 * slot, as Bambu Studio offers them for the bound printer (blueprint U2, D9).
 *
 * @module
 */

import type { BambuPresetSummary } from '@taucad/slicer/bambu-studio';
import type { BambuStudioMode } from '#components/print/use-bambu-studio.js';

const selectClass = 'h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground';

/** One used material slot as the printer reports it. @public */
export type BambuTray = Readonly<{ slot: number; label: string; materialId?: string; color?: string }>;

function PresetOptions({ presets }: { readonly presets: readonly BambuPresetSummary[] }): React.JSX.Element {
  const own = presets.filter((preset) => preset.source === 'user');
  const system = presets.filter((preset) => preset.source === 'system');
  const options = (group: readonly BambuPresetSummary[]): React.JSX.Element[] =>
    group.map((preset) => (
      <option key={preset.name} value={preset.name}>
        {preset.name}
      </option>
    ));
  return own.length === 0 ? (
    <>{options(system)}</>
  ) : (
    <>
      <optgroup label='Your presets'>{options(own)}</optgroup>
      <optgroup label='System presets'>{options(system)}</optgroup>
    </>
  );
}

function PresetSelect({
  label,
  value,
  presets,
  onChange,
  children,
}: {
  readonly label: string;
  readonly value: string;
  readonly presets: readonly BambuPresetSummary[];
  readonly onChange: (name: string) => void;
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  // The selected preset stays listed even when the catalog narrows past it.
  const listed = presets.some((preset) => preset.name === value)
    ? presets
    : [{ name: value, kind: 'process', source: 'system' } satisfies BambuPresetSummary, ...presets];
  return (
    <label className='flex min-w-0 flex-col gap-1 text-xs text-muted-foreground'>
      <span className='flex min-w-0 items-center gap-1.5'>{children ?? label}</span>
      <select
        aria-label={label}
        className={selectClass}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        <PresetOptions presets={listed} />
      </select>
    </label>
  );
}

/**
 * Printer, process and per-slot filament presets for Bambu Studio.
 *
 * @param properties - The Bambu Studio mode and the used trays in slot order.
 * @returns The pickers, or nothing until a selection has resolved.
 * @public
 */
export function BambuStudioPresets({
  studio,
  trays,
}: {
  readonly studio: BambuStudioMode;
  readonly trays: readonly BambuTray[];
}): React.JSX.Element | undefined {
  const { selection } = studio;
  if (!selection) {
    return undefined;
  }
  return (
    <div role='group' aria-label='Bambu Studio presets' className='flex min-w-0 flex-col gap-2'>
      <PresetSelect
        label='Printer preset'
        value={selection.printer}
        presets={studio.printers}
        onChange={studio.choosePrinter}
      />
      <PresetSelect
        label='Process preset'
        value={selection.process}
        presets={studio.processes}
        onChange={studio.chooseProcess}
      />
      {selection.filaments.map((filament, index) => {
        const tray = trays[index];
        if (!tray) {
          return null;
        }
        return (
          <PresetSelect
            key={tray.slot}
            label={`Filament preset for ${tray.label}`}
            value={filament}
            presets={studio.filaments}
            onChange={(name) => {
              studio.chooseFilament(tray.slot, name);
            }}
          >
            {`Filament ${tray.label}`}
            {tray.color ? (
              <span
                aria-hidden
                className='size-2.5 rounded-full border border-border/70'
                // Observed filament color is user data, not chrome (ui-policy §5).
                style={{ backgroundColor: tray.color }}
              />
            ) : null}
            {tray.materialId ? <span className='text-foreground'>{tray.materialId}</span> : null}
          </PresetSelect>
        );
      })}
    </div>
  );
}
