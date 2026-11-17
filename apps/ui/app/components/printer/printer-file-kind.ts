/**
 * Printer file recognition by name and leading bytes, without reading the file: what the workbench and the file
 * viewer router ask before a printer viewer opens. The G-code extraction, with the plate models it names (three.js),
 * is `printer-file.ts`, which loads with the viewer (progressive loading PL5).
 *
 * @module
 */

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
