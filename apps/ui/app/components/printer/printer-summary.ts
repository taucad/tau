import { slicedFilamentColors, readBambuPreview } from '@taucad/slicer/container';
import type { BambuPreview, BambuContainerProducer } from '@taucad/slicer/container';
import { ToolpathParseError, parseGcode } from '@taucad/slicer/toolpath';
import type { ToolpathProgram } from '@taucad/slicer/toolpath';
import { partBounds } from '#components/printer/printer-geometry.js';

/** Axis-aligned bounds in millimetres, plate origin front-left. @public */
export type SliceBounds = Readonly<{
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}>;

/** What one sliced artifact says about itself, read from its own toolpath. @public */
export type SliceSummary = Readonly<{
  layers: number;
  /** Seconds: the slicer's own estimate when its header carries one, else the toolpath timing. */
  estimatedDuration: number;
  /** Whether `estimatedDuration` is the slicer's own estimate rather than Tau's toolpath timing. */
  isSlicerEstimate: boolean;
  /** The slicer that wrote the container; absent when neither Bambu Studio nor the reference engine did. */
  producer: BambuContainerProducer | undefined;
  /** Millimetres of filament. */
  filamentLength: number;
  /** Grams stated by the slicer header; absent when the artifact supplies no weight. */
  filamentWeightGrams: number | undefined;
  /**
   * Every move the nozzle makes, from home through the printer's start routine to the end lift; the plate-fit
   * check reads these only when the G-code labels no part. Absent when the toolpath is too large to preview.
   */
  bounds: SliceBounds | undefined;
  /**
   * The part alone: wall, infill and support extrusions standing on the plate; absent when the G-code labels none.
   * The plate-fit check reads these.
   */
  partBounds: SliceBounds | undefined;
  /** False when the parser met motion it could not time; the numbers are then a floor. */
  coverageComplete: boolean;
  /**
   * Why the toolpath is not previewed, when it is too large to: the numbers are then the slicer header's, and the
   * printer still prints the file as it is.
   */
  previewRefusal: string | undefined;
  /**
   * `#RRGGBB` per filament the slice prints, in filament order: several when Bambu Studio printed each of the
   * model's colours with its own filament, else at most one.
   */
  filamentColors: readonly string[];
}>;

/** Refusals of a plate too large to preview, which the printer still prints as it is. */
const tooLargeToPreview: ReadonlySet<string> = new Set([
  'TOOLPATH_SOURCE_TOO_LARGE',
  'TOOLPATH_SEGMENT_LIMIT',
  'TOOLPATH_RECORD_LIMIT',
]);
/** Bambu Studio writes its header block first. */
const headerBytes = 65_536;
const durationSeconds: Readonly<Record<string, number>> = { d: 86_400, h: 3600, m: 60, s: 1 };

const filamentWeight = (gcode: Uint8Array<ArrayBuffer>): number | undefined => {
  const header = new TextDecoder().decode(gcode.subarray(0, headerBytes));
  const values = /^;\s*total filament weight \[g\]\s*:\s*([\d.,\s]+)$/mu
    .exec(header)?.[1]
    ?.split(',')
    .map((value) => Number(value.trim()));
  return values?.length && values.every((value) => Number.isFinite(value) && value >= 0)
    ? values.reduce((total, value) => total + value, 0)
    : undefined;
};

/**
 * What a plate too large to preview says about itself: Bambu Studio's header states its layers, time and
 * filament (`; total layer number: 50`, `; total estimated time: 1h 46m 51s`, `; total filament length [mm] :
 * 5655.05,3717.45`); anything it does not state reads as zero.
 */
export const summarizeHeader = (
  container: Pick<BambuPreview, 'gcode' | 'filamentColors'>,
  producer: BambuContainerProducer | undefined,
  previewRefusal: string,
): SliceSummary => {
  const header = new TextDecoder().decode(container.gcode.subarray(0, headerBytes));
  const time = /total estimated time:\s*((?:\d+[dhms]\s*)+)/u.exec(header)?.[1];
  const lengths = /^;\s*total filament length \[mm\]\s*:\s*([\d.,\s]+)$/mu.exec(header)?.[1] ?? '';
  return {
    layers: Number(/^;\s*total layer number:\s*(\d+)/mu.exec(header)?.[1] ?? 0),
    estimatedDuration: [...(time ?? '').matchAll(/(\d+)([dhms])/gu)].reduce(
      (seconds, [, amount, unit]) => seconds + Number(amount) * (durationSeconds[unit ?? ''] ?? 0),
      0,
    ),
    isSlicerEstimate: time !== undefined,
    producer,
    filamentLength: lengths.split(',').reduce((total, length) => total + (Number(length) || 0), 0),
    filamentWeightGrams: filamentWeight(container.gcode),
    bounds: undefined,
    partBounds: undefined,
    coverageComplete: false,
    filamentColors: slicedFilamentColors(container),
    previewRefusal,
  };
};

/**
 * Read the plate G-code out of a `.gcode.3mf` container and time it; a plate too large to preview is summarized
 * from the slicer's header instead.
 *
 * @param bytes - The container the slicer produced.
 * @returns The summary the Prepare step shows before anything is sent.
 * @public
 */
export const summarizeGcodeContainer = (bytes: Uint8Array<ArrayBuffer>): SliceSummary => {
  const container = readBambuPreview(bytes);
  let program: ReturnType<typeof parseGcode>;
  try {
    program = parseGcode(container.gcode);
  } catch (error) {
    if (!(error instanceof ToolpathParseError) || !tooLargeToPreview.has(error.code)) {
      throw error;
    }
    return summarizeHeader(container, container.producer, error.message);
  }
  return summarizePreparedProgram(program, container);
};

/** Summarize an already parsed plate without inflating or parsing again. */
export const summarizePreparedProgram = (
  program: ToolpathProgram,
  container: Pick<BambuPreview, 'gcode' | 'filamentColors' | 'producer'>,
): SliceSummary => {
  return {
    layers: program.layerTable.length,
    estimatedDuration: program.headerEstimate?.seconds ?? program.duration,
    isSlicerEstimate: program.headerEstimate !== undefined,
    producer: container.producer,
    filamentLength: program.filamentLength,
    filamentWeightGrams: filamentWeight(container.gcode),
    bounds: program.bounds,
    partBounds: partBounds(program),
    coverageComplete: program.coverage.complete,
    filamentColors: slicedFilamentColors(container),
    previewRefusal: undefined,
  };
};
