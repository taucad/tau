/**
 * Toolpath program: the parsed, timed form of one G-code file.
 *
 * Struct-of-arrays so a hundred thousand segments upload to the GPU as one
 * buffer and scrub without allocation. Every consumer (printer viewer, Print
 * pane summary, agent summaries) reads this shape; only `parseGcode` writes it.
 *
 * @module
 */

/** What a segment lays down, in the order the kind palette is indexed. @public */
export const toolpathSegmentKinds = [
  'travel',
  'outer-wall',
  'inner-wall',
  'infill',
  'support',
  'skirt',
  'brim',
  'purge',
  'retract',
  'wipe',
  'unknown',
] as const;

/** One segment kind. @public */
export type ToolpathSegmentKind = (typeof toolpathSegmentKinds)[number];

/** Per-layer window into the segment arrays. @public */
export type ToolpathLayer = Readonly<{
  index: number;
  /** Millimetres. */
  z: number;
  firstSegment: number;
  segmentCount: number;
  /** Seconds from program start. */
  startTime: number;
  /** Seconds from program start. */
  endTime: number;
}>;

/** A non-motion event the simulation reacts to. @public */
export type ToolpathEvent = Readonly<{
  /** Seconds from program start. */
  time: number;
  kind:
    | 'nozzle-temperature'
    | 'bed-temperature'
    | 'chamber-temperature'
    | 'fan'
    | 'tool-change'
    | 'layer-change'
    | 'pause'
    | 'vendor';
  /** Target value in the event's native unit (°C, percent, tool index, layer index). */
  value?: number;
  /** The raw record for `vendor` events, bounded to one line. */
  record?: string;
}>;

/** How much of the program the parser understood. @public */
export type ToolpathCoverage = Readonly<{
  records: number;
  known: number;
  vendor: number;
  unknown: number;
  /** True only when every executable record was understood. */
  complete: boolean;
}>;

/** Parsed and timed toolpath. @public */
export type ToolpathProgram = Readonly<{
  version: 1;
  source: Readonly<{ digest: string; parser: Readonly<{ id: string; version: string }> }>;
  units: 'mm';
  /** Whether the first motion started from a homed origin or an unknown pose. */
  initialPosition: 'homed' | 'unknown';
  segmentCount: number;
  /** `[x0, y0, z0, x1, y1, z1]` per segment, millimetres. */
  positions: Float32Array;
  /** Index into {@link toolpathSegmentKinds} per segment. */
  kinds: Uint8Array;
  /** Layer index per segment. */
  layers: Uint32Array;
  /** `[start, end]` seconds per segment. */
  times: Float32Array;
  /** Millimetres of filament per segment; zero for travel. */
  extrusion: Float32Array;
  /** Millimetres per second per segment. */
  feedrates: Float32Array;
  /** Active tool index per segment. */
  tools: Uint8Array;
  layerTable: readonly ToolpathLayer[];
  events: readonly ToolpathEvent[];
  bounds: Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number] }>;
  /** Seconds. */
  duration: number;
  /** Millimetres of filament. */
  filamentLength: number;
  coverage: ToolpathCoverage;
}>;

/** Locate the segment active at one program time; `-1` before the first, `segmentCount` after the last. @public */
export const segmentAtTime = (program: Pick<ToolpathProgram, 'times' | 'segmentCount'>, time: number): number => {
  if (program.segmentCount === 0 || time < program.times[0]!) {
    return -1;
  }
  let low = 0;
  let high = program.segmentCount - 1;
  if (time >= program.times[high * 2 + 1]!) {
    return program.segmentCount;
  }
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (program.times[middle * 2 + 1]! <= time) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
};
