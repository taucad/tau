/**
 * Default preset selection from a catalog and what the bound printer reports.
 *
 * Pure: it reads only the catalog summaries, so the renderer can run it on a
 * catalog it received over IPC.
 *
 * @module
 */

import { BambuStudioError, bambuPlates } from '#bambu-studio/types.js';
import type {
  BambuMachineHints,
  BambuPresetSummary,
  BambuStudioCatalog,
  BambuStudioSelection,
} from '#bambu-studio/types.js';

/** Layer height, in millimetres, each quality preset selects. */
const presetLayerHeights = { fast: 0.28, standard: 0.2, fine: 0.12 } as const;
const defaultNozzleDiameter = 0.4;
const tolerance = 1e-6;

const byName = (a: BambuPresetSummary, b: BambuPresetSummary): number =>
  a.name.length - b.name.length || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/**
 * Whether a model hint names a Bambu `printer_model`.
 *
 * Accepts the full name (`Bambu Lab X1 Carbon`), the name without the vendor
 * (`X1 Carbon`) and Tau's short code: the first word plus the initials of the
 * rest (`X1C`, `A1M`, `H2DP`).
 *
 * @internal
 * @param hint - Model as Tau or the printer names it.
 * @param printerModel - Bambu Studio `printer_model`.
 * @returns Whether they name the same model.
 */
export const matchesPrinterModel = (hint: string, printerModel: string): boolean => {
  const wanted = hint.trim().toLowerCase();
  const full = printerModel.toLowerCase();
  const short = full.replace(/^bambu lab /u, '');
  // ponytail: initialism heuristic; add a model-id table when a model breaks it.
  const [first = '', ...rest] = short.split(/\s+/u);
  const code = first + rest.map((word) => word[0] ?? '').join('');
  return wanted === full || wanted === short || wanted === code;
};

const compatibleWith = (preset: BambuPresetSummary, printer: string): boolean =>
  preset.compatiblePrinters === undefined || preset.compatiblePrinters.includes(printer);

const requirePreset = (presets: readonly BambuPresetSummary[], name: string, kind: string): string => {
  if (!presets.some((preset) => preset.name === name)) {
    throw new BambuStudioError('BAMBU_STUDIO_PRESET_NOT_FOUND', `Bambu Studio has no ${kind} preset "${name}".`);
  }
  return name;
};

const pickPrinter = (catalog: BambuStudioCatalog, hints: BambuMachineHints): string => {
  const nozzle = hints.nozzleDiameter ?? defaultNozzleDiameter;
  const [printer] = catalog.printers
    .filter(
      (preset) =>
        preset.source === 'system' &&
        preset.printerModel !== undefined &&
        matchesPrinterModel(hints.model, preset.printerModel) &&
        Math.abs((preset.nozzleDiameter ?? Number.NaN) - nozzle) < tolerance,
    )
    .toSorted(byName);
  if (printer === undefined) {
    throw new BambuStudioError(
      'BAMBU_STUDIO_PRESET_NOT_FOUND',
      `Bambu Studio has no printer preset for ${hints.model} with a ${nozzle} mm nozzle.`,
    );
  }
  return printer.name;
};

const pickProcess = (catalog: BambuStudioCatalog, printer: string, hints: BambuMachineHints): string => {
  const target = presetLayerHeights[hints.preset ?? 'standard'];
  const candidates = catalog.processes.filter(
    (preset) => preset.source === 'system' && preset.layerHeight !== undefined && compatibleWith(preset, printer),
  );
  // Exact layer height first, then the nearest; within a height prefer "Standard", then the shortest name.
  const [process] = candidates.toSorted(
    (a, b) =>
      Math.abs(a.layerHeight! - target) - Math.abs(b.layerHeight! - target) ||
      Number(!a.name.includes('Standard')) - Number(!b.name.includes('Standard')) ||
      byName(a, b),
  );
  if (process === undefined) {
    throw new BambuStudioError('BAMBU_STUDIO_PRESET_NOT_FOUND', `Bambu Studio has no process preset for ${printer}.`);
  }
  return process.name;
};

// Rank of a filament preset for a tray type: Bambu's "Basic" line first, then
// the generic preset, then any other preset of that type.
const filamentRank = (name: string, type: string): number => {
  const lower = name.toLowerCase();
  if (lower.startsWith(`bambu ${type} basic @`)) {
    return 0;
  }
  if (lower === `generic ${type}` || lower.startsWith(`generic ${type} @`)) {
    return 1;
  }
  return 2;
};

const pickFilament = (
  catalog: BambuStudioCatalog,
  printer: string,
  material: BambuMachineHints['materials'][number] | undefined,
): string => {
  const compatible = catalog.filaments.filter(
    (preset) => preset.source === 'system' && compatibleWith(preset, printer),
  );
  const [exact] = compatible.filter((preset) => preset.filamentId === material?.profileId).toSorted(byName);
  if (material?.profileId !== undefined && exact !== undefined) {
    return exact.name;
  }
  const type = (material?.materialId ?? 'PLA').toLowerCase();
  const [typed] = compatible
    .filter((preset) => preset.filamentType?.toLowerCase() === type)
    .toSorted((a, b) => filamentRank(a.name, type) - filamentRank(b.name, type) || byName(a, b));
  if (typed === undefined) {
    throw new BambuStudioError(
      'BAMBU_STUDIO_PRESET_NOT_FOUND',
      `Bambu Studio has no ${type.toUpperCase()} filament preset for ${printer}.`,
    );
  }
  return typed.name;
};

/**
 * Complete a selection from the printer's hints, keeping every preset the caller chose.
 *
 * Defaults: the system printer preset for the model and nozzle (0.4 mm when
 * unknown); the process for the quality preset's layer height (fast 0.28,
 * standard 0.20, fine 0.12 mm), preferring "Standard" then the shortest name;
 * per used slot, the filament whose Bambu id equals the tray's `profileId`,
 * else by tray type preferring "Bambu <type> Basic", then "Generic <type>",
 * then the shortest name (PLA when the slot reports nothing); the textured PEI
 * plate. Ties break by name, so the result is deterministic.
 *
 * The returned `filaments` are `partial.filaments` as the caller ordered them,
 * else one preset per hinted slot in ascending slot order (one PLA preset when
 * no slot is hinted). That tray order is not a part order: to slice several
 * parts, map each part to a tray and pass the presets in part order as
 * `partial.filaments`.
 *
 * @param catalog - Catalog from `loadBambuStudioCatalog`.
 * @param hints - What the bound printer reports.
 * @param partial - Presets the person or agent already chose.
 * @returns A complete selection.
 * @throws BambuStudioError - `BAMBU_STUDIO_PRESET_NOT_FOUND` when a named or needed preset is missing.
 * @public
 * @example <caption>Default presets for an X1 Carbon with PETG in slot 1</caption>
 * ```typescript
 * import { findBambuStudio, loadBambuStudioCatalog, resolveBambuStudioSelection } from '@taucad/slicer/bambu-studio';
 *
 * const install = await findBambuStudio();
 * if (install) {
 *   const catalog = await loadBambuStudioCatalog(install, { model: 'X1C', nozzleDiameter: 0.4 });
 *   const selection = resolveBambuStudioSelection(catalog, {
 *     model: 'X1C',
 *     plate: 'high-temperature',
 *     materials: [{ slot: 0, materialId: 'PETG', profileId: 'GFG00' }],
 *   });
 * }
 * ```
 */
export const resolveBambuStudioSelection = (
  catalog: BambuStudioCatalog,
  hints: BambuMachineHints,
  partial: Partial<BambuStudioSelection> = {},
): BambuStudioSelection => {
  const printer =
    partial.printer === undefined
      ? pickPrinter(catalog, hints)
      : requirePreset(catalog.printers, partial.printer, 'printer');
  const process =
    partial.process === undefined
      ? pickProcess(catalog, printer, hints)
      : requirePreset(catalog.processes, partial.process, 'process');
  const materials = hints.materials.toSorted((a, b) => a.slot - b.slot);
  const filaments =
    partial.filaments === undefined
      ? (materials.length === 0 ? [undefined] : materials).map((material) => pickFilament(catalog, printer, material))
      : partial.filaments.map((name) => requirePreset(catalog.filaments, name, 'filament'));
  const plate = partial.plate ?? hints.plate ?? 'textured-pei';
  if (!bambuPlates.some(({ id }) => id === plate)) {
    throw new BambuStudioError('BAMBU_STUDIO_PRESET_NOT_FOUND', `Bambu Studio has no plate "${plate}".`);
  }
  return {
    printer,
    process,
    filaments,
    plate,
    ...(partial.settings === undefined ? {} : { settings: partial.settings }),
  };
};
