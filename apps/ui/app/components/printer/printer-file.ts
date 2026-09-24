/**
 * Printer file recognition and G-code extraction.
 *
 * A `*.gcode.3mf` is a Bambu container whose `Metadata/plate_1.gcode` member
 * holds the program; a `*.gcode` is the program itself.
 *
 * @module
 */

import { readBambuContainer } from '@taucad/slicer/container';

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

/** The G-code bytes of a printer file. */
export const extractGcode = (bytes: Uint8Array<ArrayBuffer>, kind: PrinterFileKind): Uint8Array<ArrayBuffer> =>
  kind === 'container' ? readBambuContainer(bytes).gcode : bytes;
