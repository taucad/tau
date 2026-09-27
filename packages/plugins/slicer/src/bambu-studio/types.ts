/**
 * Types shared by the Node engine and the browser stub of `@taucad/slicer/bambu-studio`.
 *
 * Nothing here touches Node, so the stub and the pure selection helper can
 * import it in any host.
 *
 * @module
 */

import type { JSONSchema7 } from '@taucad/runtime/types';

/** A Bambu Studio install found on this machine. @public */
export type BambuStudioInstallation = Readonly<{
  /** Absolute path of the Bambu Studio executable. */
  executable: string;
  /** Version from the first line of `--help`, for example `02.08.02.61`. */
  version: string;
  /** Directory that holds `profiles/BBL.json` and the bundled presets. */
  resourcesDir: string;
  /** Bambu Studio's own data directory (OTA system presets, user presets), when it exists. */
  dataDir?: string;
}>;

/** The three preset kinds Bambu Studio combines into one slice. @public */
export type BambuPresetKind = 'machine' | 'process' | 'filament';

/** One selectable preset, with the resolved facts selection needs. @public */
export type BambuPresetSummary = Readonly<{
  name: string;
  kind: BambuPresetKind;
  /** `system` presets ship with Bambu Studio; `user` presets are the person's own. */
  source: 'system' | 'user';
  settingId?: string;
  /** Filament identity, matching an AMS tray's `tray_info_idx`. */
  filamentId?: string;
  filamentType?: string;
  printerModel?: string;
  /** Millimetres. */
  nozzleDiameter?: number;
  /** Millimetres. */
  layerHeight?: number;
  /** Printer presets this process or filament preset works with; absent means any printer. */
  compatiblePrinters?: readonly string[];
}>;

/** A build plate Bambu Studio can slice for. @public */
export type BambuPlate = Readonly<{
  id: 'cool' | 'engineering' | 'high-temperature' | 'textured-pei';
  /** The name Bambu Studio's `--curr-bed-type` expects. */
  bambuName: string;
}>;

/** Value of one Bambu Studio setting override; `null` asks for the printer value (Bambu's `nil`). @public */
// oxlint-disable-next-line typescript/no-restricted-types -- JSON wire value; `null` is the printer-value choice.
export type BambuSettingValue = string | number | boolean | null | ReadonlyArray<string | number>;

/** Printer, process, filament and plate presets plus setting overrides for one slice. @public */
export type BambuStudioSelection = Readonly<{
  printer: string;
  process: string;
  /** One filament preset per used slot, in slot order. */
  filaments: readonly string[];
  plate: BambuPlate['id'];
  /** Bambu Studio setting keys and values applied over the resolved presets. */
  settings?: Readonly<Record<string, BambuSettingValue>>;
}>;

/** What the bound printer reports, used to pick default presets. @public */
export type BambuMachineHints = Readonly<{
  /** Printer model as Tau or the printer names it: `X1C`, `X1 Carbon` or `Bambu Lab X1 Carbon`. */
  model: string;
  /** Millimetres; defaults to 0.4. */
  nozzleDiameter?: number;
  /** Quality preset; selects the 0.28, 0.20 or 0.12 mm process. */
  preset?: 'fast' | 'standard' | 'fine';
  plate?: BambuPlate['id'];
  /** Loaded material per used slot. `profileId` is the tray's Bambu filament id. */
  materials: ReadonlyArray<Readonly<{ slot: number; materialId?: string; profileId?: string }>>;
}>;

/** Presets Bambu Studio offers, optionally narrowed to one printer. @public */
export type BambuStudioCatalog = Readonly<{
  installation: BambuStudioInstallation;
  printers: readonly BambuPresetSummary[];
  processes: readonly BambuPresetSummary[];
  filaments: readonly BambuPresetSummary[];
  plates: readonly BambuPlate[];
}>;

/** Narrows a catalog to one printer preset, or to a model and nozzle. @public */
export type BambuStudioCatalogFilter = Readonly<{
  printer?: string;
  model?: string;
  /** Millimetres. */
  nozzleDiameter?: number;
}>;

/** A settings group of the schema {@link BambuStudioSettings} describes. @public */
export type BambuSettingsGroup = Readonly<{ id: string; label: string; scope: BambuPresetKind }>;

/** JSON Schema, current values and groups of the settings a selection resolves to. @public */
export type BambuStudioSettings = Readonly<{
  schema: JSONSchema7;
  values: Record<string, unknown>;
  groups: readonly BambuSettingsGroup[];
}>;

/** Input to `sliceWithBambuStudio`. @public */
export type BambuStudioSliceInput = Readonly<{
  install: BambuStudioInstallation;
  selection: BambuStudioSelection;
  /** Binary STL in millimetres. */
  stl: Uint8Array<ArrayBuffer>;
  /**
   * `#RRGGBB` the file records for the first filament, so previews draw the print in the model's
   * colour; the preset's colour when absent.
   */
  filamentColor?: string;
  signal: AbortSignal;
}>;

/** Bambu Studio's archive and what it reported. @public */
export type BambuStudioSliceResult = Readonly<{
  /** The `.gcode.3mf` exactly as Bambu Studio wrote it. */
  archive: Uint8Array<ArrayBuffer>;
  version: string;
  presets: Readonly<{ printer: string; process: string; filaments: readonly string[] }>;
  result: Readonly<{
    returnCode: number;
    errorString: string;
    /** Seconds; Bambu Studio's print time estimate. */
    predictionSeconds?: number;
    weightGrams?: number;
  }>;
}>;

/** Stable refusal codes of `@taucad/slicer/bambu-studio`. @public */
export type BambuStudioErrorCode =
  | 'BAMBU_STUDIO_UNAVAILABLE'
  | 'BAMBU_STUDIO_PRESET_NOT_FOUND'
  | 'BAMBU_STUDIO_SETTINGS_INVALID'
  | 'BAMBU_STUDIO_SLICE_FAILED';

/** Typed refusal raised by `@taucad/slicer/bambu-studio`. @public */
export class BambuStudioError extends Error {
  public readonly code: BambuStudioErrorCode;

  public constructor(code: BambuStudioErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BambuStudioError';
    this.code = code;
  }
}

/** Build plates and the names Bambu Studio uses for them. @public */
export const bambuPlates: readonly BambuPlate[] = Object.freeze([
  Object.freeze({ id: 'cool', bambuName: 'Cool Plate' }),
  Object.freeze({ id: 'engineering', bambuName: 'Engineering Plate' }),
  Object.freeze({ id: 'high-temperature', bambuName: 'High Temp Plate' }),
  Object.freeze({ id: 'textured-pei', bambuName: 'Textured PEI Plate' }),
] as const);
