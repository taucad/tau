/**
 * The filaments of a slice that prints several (blueprint D8): one row each, its colour in the model and the
 * loaded slot it prints from.
 *
 * @module
 */

import { useId } from 'react';
import { MaterialSwatch } from '#components/geometry/cad/model-component-action-menu.js';
import type { BambuTray } from '#components/print/bambu-studio-presets.js';

const selectClass = 'h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground';

/** A colour as a matte plastic swatch; filament colours are user data, not chrome (ui-policy §5). */
function Swatch({ color }: { readonly color: string }): React.JSX.Element {
  return <MaterialSwatch materials={[{ color, roughness: 1, metalness: 0 }]} />;
}

function FilamentRow({
  filament,
  color,
  slot,
  trays,
  onChange,
}: {
  /** Counted from 1, as the printer viewer's legend names it. */
  readonly filament: number;
  readonly color: string;
  /** The slot it prints from; `-1` for none yet. */
  readonly slot: number;
  readonly trays: readonly BambuTray[];
  readonly onChange: (slot: number) => void;
}): React.JSX.Element {
  const id = useId();
  const tray = trays.find((candidate) => candidate.slot === slot);
  const name = `Filament ${String(filament)}`;
  return (
    <div className='flex min-w-0 items-center gap-2 text-xs text-muted-foreground'>
      <Swatch color={color} />
      <label htmlFor={id} className='shrink-0'>
        {name}
      </label>
      <select
        id={id}
        aria-label={`Slot for ${name}`}
        className={selectClass}
        value={tray === undefined ? '' : String(slot)}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
      >
        {tray === undefined ? (
          <option value='' disabled>
            Choose a slot
          </option>
        ) : null}
        {trays.map((candidate) => (
          <option key={candidate.slot} value={candidate.slot}>
            {[candidate.label, candidate.materialId, candidate.color].filter(Boolean).join(' · ')}
          </option>
        ))}
      </select>
      {tray?.color === undefined ? null : <Swatch color={tray.color} />}
    </div>
  );
}

/**
 * One row per filament a slice prints: its colour and a select of the loaded trays.
 *
 * @param properties - The filaments' colours and slots in filament order, the loaded trays, and what a new
 *   choice does.
 * @returns The rows.
 * @public
 */
export function FilamentSlots({
  colors,
  mapping,
  trays,
  onChange,
}: {
  readonly colors: readonly string[];
  /** The slot each filament prints from, in filament order; `-1` for none. */
  readonly mapping: readonly number[];
  /** The loaded trays, as the printer labels them. */
  readonly trays: readonly BambuTray[];
  /** Print a filament (its index in `colors`) from a slot. */
  readonly onChange: (filament: number, slot: number) => void;
}): React.JSX.Element {
  const rows = colors.map((color, index) => ({ filament: index + 1, color, slot: mapping[index] ?? -1 }));
  return (
    <div role='group' aria-label='Filaments' className='flex min-w-0 flex-col gap-1.5'>
      {rows.map(({ filament, color, slot }) => (
        <FilamentRow
          key={filament}
          filament={filament}
          color={color}
          slot={slot}
          trays={trays}
          onChange={(next) => {
            onChange(filament - 1, next);
          }}
        />
      ))}
    </div>
  );
}
