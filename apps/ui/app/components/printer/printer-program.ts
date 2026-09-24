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
import { extractGcode } from '#components/printer/printer-file.js';
import type { PrinterFileKind } from '#components/printer/printer-file.js';

/** Parse the G-code inside a printer file. */
export const loadPrinterProgram = (bytes: Uint8Array<ArrayBuffer>, kind: PrinterFileKind): ToolpathProgram =>
  parseGcode(extractGcode(bytes, kind));
