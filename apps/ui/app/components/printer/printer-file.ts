/**
 * Printer file recognition and G-code extraction.
 *
 * A `*.gcode.3mf` is a Bambu container whose `Metadata/plate_1.gcode` member
 * holds the program and `Metadata/plate_1.json` the plate it was sliced for;
 * a `*.gcode` is the program itself.
 *
 * @module
 */

import { readBambuContainer } from '@taucad/slicer/container';
import { plateForBedType } from '#components/printer/printer-plates.js';
import type { PrinterPlateModel } from '#components/printer/printer-plates.js';

/** Which printer file a name and its leading bytes describe. */
export type PrinterFileKind = 'container' | 'gcode';

/** Whether a name is a printer file the viewer opens. */
export const isPrinterFileName = (name: string): boolean => /\.gcode(?:\.3mf)?$/iu.test(name);

/** Whether bytes start with a zip local file header. */
export const hasZipSignature = (bytes: Uint8Array<ArrayBuffer>): boolean =>
  bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

/** Classify a file by name and leading bytes; a `.gcode.3mf` must also be a zip. */
export const printerFileKind = (name: string, head: Uint8Array<ArrayBuffer>): PrinterFileKind | undefined => {
  const lower = name.toLowerCase();
  if (lower.endsWith('.gcode.3mf')) {
    return hasZipSignature(head) ? 'container' : undefined;
  }
  return lower.endsWith('.gcode') ? 'gcode' : undefined;
};

/** What the viewer reads out of a printer file. */
export type PrinterFileContents = Readonly<{
  gcode: Uint8Array<ArrayBuffer>;
  /**
   * The X1C plate the file was sliced for: the container's `plate_1.json` when it names one Tau knows,
   * else the G-code's `curr_bed_type`; `undefined` when neither does.
   */
  slicedPlate: PrinterPlateModel | undefined;
  /** Preserve unknown recorded names instead of presenting them as missing. */
  recordedBedType: string | undefined;
  /**
   * `#RRGGBB` per filament the file was sliced with, in filament order: entry *i* is the colour tool `T<i>`
   * prints. The container's own list, else the G-code's `filament_colour` setting read by the same rules;
   * empty when it records none or an entry is not a colour.
   */
  filamentColors: readonly string[];
}>;

/** Bytes at each end of the G-code searched for a setting: Bambu Studio writes its config block first, Orca last. */
const configScanBytes = 64 * 1024;

/**
 * A `; <name> = …` setting from a slicer's config block, read from the first
 * and last 64 KiB of the G-code only.
 *
 * @param gcode - The plate G-code.
 * @param name - The setting's key, e.g. `curr_bed_type`.
 * @returns The recorded value, or `undefined` when neither end states one.
 */
export const readGcodeSetting = (gcode: Uint8Array<ArrayBuffer>, name: string): string | undefined => {
  const setting = new RegExp(`^;\\s*${name}\\s*=\\s*(.+?)\\s*$`, 'mu');
  const decoder = new TextDecoder();
  const head = decoder.decode(gcode.subarray(0, configScanBytes));
  const tail = gcode.byteLength > configScanBytes ? decoder.decode(gcode.subarray(-configScanBytes)) : '';
  return (setting.exec(head) ?? setting.exec(tail))?.[1];
};

// As `readBambuContainer` reads the setting: an alpha byte some slicers append is dropped, and at most 64 entries.
const filamentColorEntry = /^#([\da-f]{6})(?:[\da-f]{2})?$/iu;
const maximumFilamentColors = 64;

/** Each colour of a `filament_colour` list such as `#F5A623;#FFFFFF`, as `#RRGGBB`; none when one is not a colour. */
const filamentColorsOf = (value: string | undefined): readonly string[] => {
  const hexes = value?.split(';').map((entry) => filamentColorEntry.exec(entry.trim())?.[1]) ?? [];
  return hexes.length <= maximumFilamentColors && hexes.every((hex): hex is string => hex !== undefined)
    ? hexes.map((hex) => `#${hex.toUpperCase()}`)
    : [];
};

/** The G-code bytes of a printer file, the plate it was sliced for and its filament colours. */
export const readPrinterFile = (bytes: Uint8Array<ArrayBuffer>, kind: PrinterFileKind): PrinterFileContents => {
  const container = kind === 'container' ? readBambuContainer(bytes) : undefined;
  const gcode = container?.gcode ?? bytes;
  const containerBedType = container?.bedType === 'unspecified' ? undefined : container?.bedType;
  const recordedBedType = containerBedType ?? readGcodeSetting(gcode, 'curr_bed_type');
  return {
    gcode,
    recordedBedType,
    slicedPlate: plateForBedType(recordedBedType),
    filamentColors: container?.filamentColors ?? filamentColorsOf(readGcodeSetting(gcode, 'filament_colour')),
  };
};
