/**
 * Turn printer file bytes into a toolpath program.
 *
 * The only module that touches the slicer parser, so tests and the viewer
 * substitute fixture programs at one seam.
 *
 * @module
 */

import { parseGcode } from '@taucad/slicer/toolpath';
import type { ToolpathProgram } from '@taucad/slicer/toolpath';
import { readPrinterFile } from '#components/printer/printer-file.js';
import type { PrinterFileKind } from '#components/printer/printer-file.js';
import type { PrinterPlateModel } from '#components/printer/printer-plates.js';

/** A parsed printer file. */
export type PrinterProgram = Readonly<{
  program: ToolpathProgram;
  /** The X1C plate the file was sliced for; `undefined` when it names none Tau knows. */
  slicedPlate: PrinterPlateModel | undefined;
}>;

/** Parse the G-code inside a printer file and resolve the plate it was sliced for. */
export const loadPrinterProgram = (bytes: Uint8Array<ArrayBuffer>, kind: PrinterFileKind): PrinterProgram => {
  const { gcode, slicedPlate } = readPrinterFile(bytes, kind);
  return { program: parseGcode(gcode), slicedPlate };
};
