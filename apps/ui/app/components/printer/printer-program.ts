import { createToolpathEventIndex } from '#components/printer/printer-playback.js';
import { createBeadData } from '#components/printer/printer-bead-data.js';
import type { BeadData } from '#components/printer/printer-bead-data.js';
import { groupToolpath, extrudingTools } from '#components/printer/printer-toolpath-groups.js';
/**
 * Turn printer file bytes into a toolpath program.
 *
 * The only module that touches the slicer parser, so tests and the viewer
 * substitute fixture programs at one seam.
 *
 * @module
 */

import { summarizePreparedProgram, summarizeHeader } from '#components/printer/printer-summary.js';
import type { SliceSummary } from '#components/printer/printer-summary.js';
import { parseGcode, ToolpathParseError } from '@taucad/slicer/toolpath';
import type { ToolpathProgram } from '@taucad/slicer/toolpath';
import { readPrinterFile } from '#components/printer/printer-file.js';
import type { PrinterFileContents, PrinterFileKind } from '#components/printer/printer-file.js';
import type { PrinterPlateModel } from '#components/printer/printer-plates.js';

/** A parsed printer file. */
export type PrinterProgram = Readonly<{
  program: ToolpathProgram;
  summary: SliceSummary;
  beads: BeadData;
  grouping: ReturnType<typeof groupToolpath>;
  prefix: Float64Array<ArrayBuffer>;
  eventIndex: ReturnType<typeof createToolpathEventIndex>;
  tools: readonly number[];
  maximums: Readonly<{ width: number; speed: number; flow: number }>;
  /** The X1C plate the file was sliced for; `undefined` when it names none Tau knows. */
  slicedPlate: PrinterPlateModel | undefined;
  /** Original name, including unsupported bed types. */
  recordedBedType?: string;
  /** `#RRGGBB` per filament the file was sliced with, in filament order; empty when it records none. */
  filamentColors: readonly string[];
}>;

/** Parse the G-code inside a printer file and resolve the plate it was sliced for. */
export const loadPrinterProgram = (bytes: Uint8Array<ArrayBuffer>, kind: PrinterFileKind): PrinterProgram => {
  return derivePrinterProgram(readPrinterFile(bytes, kind));
};

type PreparationStage = 'extract' | 'parse' | 'index' | 'beads' | 'summary';
type StageObserver = (stage: PreparationStage, duration: number) => void;
const derivePrinterProgram = (file: PrinterFileContents, observe?: StageObserver): PrinterProgram => {
  let started = performance.now();
  const program = parseGcode(file.gcode);
  observe?.('parse', performance.now() - started);
  started = performance.now();
  const grouping = groupToolpath(program);
  const eventIndex = createToolpathEventIndex(program.events);
  const tools = extrudingTools(program);
  observe?.('index', performance.now() - started);
  started = performance.now();
  const beads = createBeadData(program, grouping.groupOf);
  const prefix = new Float64Array(program.segmentCount + 1);
  for (let i = 0; i < program.segmentCount; i += 1) {
    prefix[i + 1] = prefix[i]! + program.extrusion[i]!;
  }
  const maximums = { width: 0, speed: 0, flow: 0 };
  for (const chunk of beads.chunks) {
    for (let i = 0; i < chunk.segments.length; i += 1) {
      maximums.width = Math.max(maximums.width, chunk.dimensions[i * 4]!);
      maximums.speed = Math.max(maximums.speed, chunk.metrics[i * 2]!);
      maximums.flow = Math.max(maximums.flow, chunk.metrics[i * 2 + 1]!);
    }
  }
  observe?.('beads', performance.now() - started);
  started = performance.now();
  const summary = summarizePreparedProgram(program, file);
  observe?.('summary', performance.now() - started);
  return {
    program,
    grouping,
    beads,
    prefix,
    eventIndex,
    tools,
    maximums,

    summary,
    slicedPlate: file.slicedPlate,
    filamentColors: file.filamentColors,
    recordedBedType: file.recordedBedType,
  };
};

/** One extraction and parse attempt, including header-only fallback for an oversized preview. */
export const preparePrinterProgram = (
  bytes: Uint8Array<ArrayBuffer>,
  kind: PrinterFileKind,
  observe?: StageObserver,
): Readonly<{ kind: 'ready'; value: PrinterProgram }> | Readonly<{ kind: 'refused'; summary: SliceSummary }> => {
  const started = performance.now();
  const file = readPrinterFile(bytes, kind);
  observe?.('extract', performance.now() - started);
  try {
    return { kind: 'ready', value: derivePrinterProgram(file, observe) };
  } catch (error) {
    if (
      !(error instanceof ToolpathParseError) ||
      !['TOOLPATH_SOURCE_TOO_LARGE', 'TOOLPATH_SEGMENT_LIMIT', 'TOOLPATH_RECORD_LIMIT'].includes(error.code)
    ) {
      throw error;
    }
    return { kind: 'refused', summary: summarizeHeader(file, file.producer, error.message) };
  }
};
