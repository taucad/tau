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
  /** `#RRGGBB` of the first filament the file was sliced with; `undefined` when it records none. */
  filamentColor: string | undefined;
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

/** The first colour of a `filament_colour` list such as `#F5A623;#FFFFFF`, as `#RRGGBB`. */
const firstFilamentColor = (value: string | undefined): string | undefined => {
  const hex = value && /#([\da-f]{6})/iu.exec(value)?.[1];
  return hex ? `#${hex.toUpperCase()}` : undefined;
};

/** The G-code bytes of a printer file, the plate it was sliced for and its filament colour. */
export const readPrinterFile = (bytes: Uint8Array<ArrayBuffer>, kind: PrinterFileKind): PrinterFileContents => {
  const container = kind === 'container' ? readBambuContainer(bytes) : undefined;
  const gcode = container?.gcode ?? bytes;
  return {
    gcode,
    slicedPlate: plateForBedType(container?.bedType) ?? plateForBedType(readGcodeSetting(gcode, 'curr_bed_type')),
    filamentColor: firstFilamentColor(readGcodeSetting(gcode, 'filament_colour')),
  };
};
