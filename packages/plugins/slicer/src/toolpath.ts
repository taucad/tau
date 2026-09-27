/**
 * Toolpath program: the parsed, timed form of one G-code file.
 *
 * Struct-of-arrays so a hundred thousand segments upload to the GPU as one
 * buffer and scrub without allocation. Every consumer (printer viewer, Print
 * pane summary, agent summaries) reads this shape; only `parseGcode` writes it.
 *
 * @module
 */

import { sha256Hex } from '#hashes.js';

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
  positions: Float32Array<ArrayBuffer>;
  /** Index into {@link toolpathSegmentKinds} per segment. */
  kinds: Uint8Array<ArrayBuffer>;
  /**
   * Segments before the first layer annotation: the start sequence's homing, bed levelling, nozzle
   * wipe and purge lines. They share layer 0 with the first printed layer; zero when the source
   * annotates no layers.
   */
  preambleSegmentCount: number;
  /** Layer index per segment. */
  layers: Uint32Array<ArrayBuffer>;
  /** `[start, end]` seconds per segment. */
  times: Float32Array<ArrayBuffer>;
  /** Millimetres of filament per segment; zero for travel. */
  extrusion: Float32Array<ArrayBuffer>;
  /** Millimetres per second per segment. */
  feedrates: Float32Array<ArrayBuffer>;
  /**
   * Active tool per segment: `n` from the last `T<n>` below 64, which selects filament `n + 1`, and 0 before
   * any. A larger `T<n>` is a machine command and leaves it.
   */
  tools: Uint8Array<ArrayBuffer>;
  layerTable: readonly ToolpathLayer[];
  events: readonly ToolpathEvent[];
  bounds: Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number] }>;
  /** Seconds, including trailing dwells. */
  duration: number;
  /** Net millimetres of filament fed, retractions included. */
  filamentLength: number;
  coverage: ToolpathCoverage;
  /**
   * The slicer's own print-time estimate, when the source states one: the Bambu Studio header's
   * `total estimated time`, else the first `M73` remaining-minutes word. Absent otherwise; `duration`
   * stays this parser's simulation clock.
   */
  headerEstimate?: Readonly<{ seconds: number; source: 'bambu-header' | 'm73' }>;
}>;

/**
 * Locate the segment active at one program time.
 *
 * @param program - Segment times and count.
 * @param time - Seconds from program start.
 * @returns The active segment index, `-1` before the first segment or `segmentCount` after the last.
 * @public
 */
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
    const middle = Math.floor((low + high) / 2);
    if (program.times[middle * 2 + 1]! <= time) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
};

// =============================================================================
// Parser
// =============================================================================

/** Tunables for {@link parseGcode}. @public */
export type ParseGcodeOptions = Readonly<{
  /** Millimetres per second squared for printing, travel and extruder-only moves; defaults follow the X1C reference profile. */
  acceleration?: Readonly<{ print?: number; travel?: number; extruder?: number }>;
  /** Millimetres per second; commanded feedrates above this are clamped. */
  maximumFeedrate?: number;
  /** Bytes; larger sources are refused. Defaults to 64 MiB, about 1.9 million segments of Bambu Studio output. */
  maximumBytes?: number;
  /** Source lines; longer sources are refused. No limit by default: the byte limit already bounds them. */
  maximumRecords?: number;
}>;

/** Stable refusal codes raised by {@link parseGcode}. @public */
export const toolpathParseErrorCodes = [
  'TOOLPATH_SOURCE_TOO_LARGE',
  'TOOLPATH_RECORD_LIMIT',
  'TOOLPATH_SEGMENT_LIMIT',
  'TOOLPATH_UNINITIALIZED_MOTION',
  'TOOLPATH_INVALID_RECORD',
] as const;

/** One refusal code. @public */
export type ToolpathParseErrorCode = (typeof toolpathParseErrorCodes)[number];

/** Typed refusal raised by {@link parseGcode}; `record` is the one-based source line when one record is at fault. @public */
export class ToolpathParseError extends Error {
  public readonly code: ToolpathParseErrorCode;
  public readonly record: number | undefined;

  public constructor(code: ToolpathParseErrorCode, message: string, record?: number) {
    super(message);
    this.name = 'ToolpathParseError';
    this.code = code;
    this.record = record;
  }
}

const parserIdentity = Object.freeze({ id: 'tau.slicer.toolpath', version: '4' });
const defaultAcceleration = Object.freeze({ print: 10_000, travel: 20_000, extruder: 5000 });
const defaultMaximumFeedrate = 500;
// The two ceilings that stay bound memory: a 64 MiB Bambu Studio plate holds about 1.9 million segments, and each
// costs 46 bytes of columns here and about 80 more in the viewer. A line costs a byte at least, so no line limit.
// ponytail: larger plates are refused, not previewed; a decimated preview (far layers, travel) if they must show.
const defaultMaximumBytes = 64 * 1024 * 1024;
const maximumSegments = 2_000_000;
const tooLargeToPreview =
  'This G-code is too large to preview. The printer can still print it as it is; to preview it, slice a smaller ' +
  'model or with a larger layer height.';
const maximumCoordinate = 10_000;
const maximumVendorRecordLength = 256;
const arcChordTolerance = 0.02;
const maximumArcSteps = 256;
const fanFullScale = 255;
// A selection names one of at most 64 filaments, as many as a container records colours for. Bambu Studio's
// start and end sequences also write T255, T1000 and T1100, which are machine commands, not selections.
const maximumFilaments = 64;
const axisLetters = ['X', 'Y', 'Z'] as const;

const kindIndex = Object.fromEntries(toolpathSegmentKinds.map((kind, index) => [kind, index])) as Record<
  ToolpathSegmentKind,
  number
>;

const commandPattern = /^([GMT])(\d+(?:\.\d+)?)(?=\s|$)/u;
// A letter alone is a flag word (`G28 X`, `M221 S`); it is present but carries no value.
const wordPattern = /^([A-Z])([-+]?(?:\d+\.?\d*|\.\d+)(?:[Ee][-+]?\d+)?)?$/u;
// Bambu vendor families: stepper power, motion sync, AMS and calibration, timelapse, flow and chamber records.
const vendorPattern = /^M(?:1[78]|142|400|412|(?:6\d\d|9\d\d|1\d{3})(?:\.\d+)?|201\.2)$/u;
// Orca/Prusa spell `;LAYER_CHANGE`, `;Z:` and `;TYPE:`; Bambu Studio spells `; CHANGE_LAYER`, `; Z_HEIGHT:` and `; FEATURE:`.
const layerChangePattern = /^\s*(?:LAYER_CHANGE|CHANGE_LAYER)\s*$/u;
const layerHeightPattern = /^\s*(?:Z|Z_HEIGHT):\s*([-+]?\d*\.?\d+)/u;
const inlineLayerPattern = /^\s*LAYER\s+\d+\s+Z\s*([-+]?\d*\.?\d+)/u;
const typePattern = /^\s*(?:TYPE|FEATURE):\s*(.+?)\s*$/u;
// Bambu Studio states its own estimate inside `; HEADER_BLOCK_START … ; HEADER_BLOCK_END`, e.g. `total estimated time: 1h 2m 3s`.
const headerEstimatePattern = /total estimated time:\s*((?:\d+[dhms]\s*)+)/u;
const durationUnitSeconds: Readonly<Record<string, number>> = { d: 86_400, h: 3600, m: 60, s: 1 };
const secondsPerMinute = 60;

const readHeaderDuration = (text: string): number => {
  let seconds = 0;
  for (const [, amount, unit] of text.matchAll(/(\d+)([dhms])/gu)) {
    seconds += Number(amount) * durationUnitSeconds[unit!]!;
  }
  return seconds;
};

const typeKind = (label: string): ToolpathSegmentKind => {
  const value = label.toLowerCase();
  if (value === 'outer wall') {
    return 'outer-wall';
  }
  // Bambu Studio lays its floating vertical shell behind the inner wall, never on the part's surface.
  if (value === 'inner wall' || value === 'overhang wall' || value === 'floating vertical shell') {
    return 'inner-wall';
  }
  if (value.includes('infill') || value.includes('surface') || value === 'bridge' || value === 'ironing') {
    return 'infill';
  }
  if (value.startsWith('support')) {
    return 'support';
  }
  if (value === 'skirt' || value === 'brim' || value === 'purge') {
    return value;
  }
  if (value === 'custom' || value === 'prime tower') {
    return 'purge';
  }
  return 'unknown';
};

type Columns = {
  positions: Float32Array<ArrayBuffer>;
  kinds: Uint8Array<ArrayBuffer>;
  layers: Uint32Array<ArrayBuffer>;
  times: Float32Array<ArrayBuffer>;
  extrusion: Float32Array<ArrayBuffer>;
  feedrates: Float32Array<ArrayBuffer>;
  tools: Uint8Array<ArrayBuffer>;
};

const createColumns = (capacity: number): Columns => ({
  positions: new Float32Array(capacity * 6),
  kinds: new Uint8Array(capacity),
  layers: new Uint32Array(capacity),
  times: new Float32Array(capacity * 2),
  extrusion: new Float32Array(capacity),
  feedrates: new Float32Array(capacity),
  tools: new Uint8Array(capacity),
});

const copyInto = <T extends Float32Array<ArrayBuffer> | Uint8Array<ArrayBuffer> | Uint32Array<ArrayBuffer>>(
  target: T,
  source: T,
): T => {
  target.set(source.subarray(0, Math.min(source.length, target.length)));
  return target;
};

const growColumns = (columns: Columns, capacity: number): Columns => {
  const next = createColumns(capacity);
  return {
    positions: copyInto(next.positions, columns.positions),
    kinds: copyInto(next.kinds, columns.kinds),
    layers: copyInto(next.layers, columns.layers),
    times: copyInto(next.times, columns.times),
    extrusion: copyInto(next.extrusion, columns.extrusion),
    feedrates: copyInto(next.feedrates, columns.feedrates),
    tools: copyInto(next.tools, columns.tools),
  };
};

type MutableLayer = {
  index: number;
  z: number | undefined;
  /** Whether `z` came from an annotation rather than the first motion. */
  zAnnotated: boolean;
  firstSegment: number;
  segmentCount: number;
  startTime: number;
  endTime: number;
  implicit: boolean;
};

/** Word letter to value; a flag word maps to `undefined`, so `has` sees it and `get` treats it as absent. */
type Words = ReadonlyMap<string, number | undefined>;

type SegmentInput = Readonly<{
  from: readonly number[];
  to: readonly number[];
  /** Millimetres of filament this segment feeds. */
  extrusion: number;
  record: number;
}>;

const readWords = (tail: string, record: number): Words => {
  const words = new Map<string, number | undefined>();
  for (const token of tail.trim().split(/\s+/u)) {
    if (token === '') {
      continue;
    }
    const match = wordPattern.exec(token);
    const value = match?.[2] === undefined ? undefined : Number(match[2]);
    if (!match || (value !== undefined && !Number.isFinite(value))) {
      throw new ToolpathParseError(
        'TOOLPATH_INVALID_RECORD',
        `Record ${record} carries the unsupported word "${token}".`,
        record,
      );
    }
    words.set(match[1]!, value);
  }
  return words;
};

const resolveParseOptions = (options: ParseGcodeOptions) => ({
  maximumBytes: options.maximumBytes ?? defaultMaximumBytes,
  maximumRecords: options.maximumRecords ?? Number.POSITIVE_INFINITY,
  maximumFeedrate: options.maximumFeedrate ?? defaultMaximumFeedrate,
  acceleration: {
    print: options.acceleration?.print ?? defaultAcceleration.print,
    travel: options.acceleration?.travel ?? defaultAcceleration.travel,
    extruder: options.acceleration?.extruder ?? defaultAcceleration.extruder,
  },
});

const inert = (): void => {
  // Accepted and understood; no effect on the simulation.
};

/**
 * Parse one linear FFF G-code program into a timed, struct-of-arrays toolpath.
 *
 * Closed subset: `G0`–`G4`, `G17`, `G21`, `G28`, `G29`, `G90`–`G92`, `M82`–`M84`,
 * `M104`, `M106`, `M107`, `M109`, `M140`, `M141`, `M190`, `M191`, `M201`,
 * `M203`–`M205`, `M220`, `M221`, `M500`, `M73` and `T<n>` below 64, which selects a
 * filament. Bambu vendor families and a larger `T<n>`, a machine command, are
 * retained as `vendor` events; every other executable record counts as
 * `unknown` and never as a comment. A valueless word is a flag: `G28 X` homes only
 * X, and a flag where a value belongs (`G1 X`) carries no target. Arcs are
 * linearised. Undeclared positioning and extrusion modes take the firmware
 * defaults (absolute, absolute); extruder motion before any nozzle temperature
 * was commanded is refused, as the firmware's cold-extrusion lockout would. Times come from a trapezoidal model
 * that starts and stops every segment at rest.
 *
 * @param source - G-code bytes or text.
 * @param options - Acceleration profile and admission limits.
 * @returns The timed program.
 * @throws ToolpathParseError - When the source exceeds a limit or a record cannot be executed.
 * @public
 * @example <caption>Summarise a plate for the Print pane</caption>
 * ```typescript
 * import { parseGcode } from '@taucad/slicer/toolpath';
 *
 * const program = parseGcode('G28\nM104 S220\nG1 X10 Y10 F3000\n');
 * const summary = { layers: program.layerTable.length, seconds: program.duration };
 * ```
 */
// ponytail: every segment accelerates from rest and stops at rest; junction speeds and
// per-axis limits belong to a firmware-specific planner, not to this viewer-facing estimate.
export const parseGcode = (
  source: Uint8Array<ArrayBuffer> | string,
  options: ParseGcodeOptions = {},
): ToolpathProgram => {
  const { maximumBytes, maximumRecords, maximumFeedrate, acceleration } = resolveParseOptions(options);
  const bytes = typeof source === 'string' ? new TextEncoder().encode(source) : source;
  if (bytes.byteLength > maximumBytes) {
    throw new ToolpathParseError('TOOLPATH_SOURCE_TOO_LARGE', tooLargeToPreview);
  }
  const text = typeof source === 'string' ? source : new TextDecoder().decode(bytes);
  const digest = `sha256:${sha256Hex(bytes)}`;

  let columns = createColumns(1024);
  let segmentCount = 0;
  const layerTable: MutableLayer[] = [];
  const events: ToolpathEvent[] = [];
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const coverage = { records: 0, known: 0, vendor: 0, unknown: 0 };

  const position = [0, 0, 0];
  const known = [false, false, false];
  const homed = [false, false, false];
  let initialPosition: ToolpathProgram['initialPosition'] = 'unknown';
  // Marlin-family firmware powers on in absolute positioning (G90) and absolute extrusion (M82);
  // real X1C start sequences rely on both before declaring them.
  let absolute = true;
  let relativeExtrusion = false;
  let nozzleTemperatureCommanded = false;
  let logicalExtrusion = 0;
  let feedrate: number | undefined;
  let feedPercent = 1;
  let tool = 0;
  let clock = 0;
  let filamentLength = 0;
  let currentKind: ToolpathSegmentKind = 'unknown';
  let wiping = false;
  let inHeader = false;
  let headerEstimate: ToolpathProgram['headerEstimate'];
  let preambleSegmentCount: number | undefined;

  const startLayer = (z: number | undefined): void => {
    preambleSegmentCount ??= segmentCount;
    const last = layerTable.at(-1);
    if (last?.implicit) {
      // Motion before the first annotated layer (start sequence, purge line) belongs to that layer.
      last.implicit = false;
      last.z = z ?? last.z;
      last.zAnnotated = z !== undefined;
      events.push({ time: clock, kind: 'layer-change', value: last.index });
      return;
    }
    layerTable.push({
      index: layerTable.length,
      z,
      zAnnotated: z !== undefined,
      firstSegment: segmentCount,
      segmentCount: 0,
      startTime: clock,
      endTime: clock,
      implicit: false,
    });
    events.push({ time: clock, kind: 'layer-change', value: layerTable.length - 1 });
  };

  const annotate = (comment: string): void => {
    if (layerChangePattern.test(comment)) {
      startLayer(undefined);
      return;
    }
    const inlineLayer = inlineLayerPattern.exec(comment);
    if (inlineLayer) {
      startLayer(Number(inlineLayer[1]));
      return;
    }
    const layerHeight = layerHeightPattern.exec(comment);
    const last = layerTable.at(-1);
    if (layerHeight && last && !last.zAnnotated) {
      last.z = Number(layerHeight[1]);
      last.zAnnotated = true;
      return;
    }
    const type = typePattern.exec(comment);
    if (type) {
      currentKind = typeKind(type[1]!);
      return;
    }
    const trimmed = comment.trim();
    if (trimmed === 'HEADER_BLOCK_START' || trimmed === 'HEADER_BLOCK_END') {
      inHeader = trimmed === 'HEADER_BLOCK_START';
      return;
    }
    const estimate = inHeader ? headerEstimatePattern.exec(comment) : null;
    if (estimate) {
      headerEstimate = { seconds: readHeaderDuration(estimate[1]!), source: 'bambu-header' };
      return;
    }
    if (trimmed === 'WIPE_START') {
      wiping = true;
    } else if (trimmed === 'WIPE_END') {
      wiping = false;
    }
  };

  const emitSegment = ({ from, to, extrusion, record }: SegmentInput): void => {
    if (feedrate === undefined) {
      throw new ToolpathParseError(
        'TOOLPATH_UNINITIALIZED_MOTION',
        `Record ${record} moves before any feedrate was commanded.`,
        record,
      );
    }
    if (segmentCount >= maximumSegments) {
      throw new ToolpathParseError('TOOLPATH_SEGMENT_LIMIT', tooLargeToPreview, record);
    }
    if (segmentCount * 6 >= columns.positions.length) {
      columns = growColumns(columns, segmentCount * 2);
    }
    if (layerTable.length === 0) {
      layerTable.push({
        index: 0,
        z: undefined,
        zAnnotated: false,
        firstSegment: 0,
        segmentCount: 0,
        startTime: clock,
        endTime: clock,
        implicit: true,
      });
    }
    const length = Math.hypot(to[0]! - from[0]!, to[1]! - from[1]!, to[2]! - from[2]!);
    const distance = length === 0 ? Math.abs(extrusion) : length;
    const speed = Math.min((feedrate / 60) * feedPercent, maximumFeedrate);
    const rate = length === 0 ? acceleration.extruder : extrusion > 0 ? acceleration.print : acceleration.travel;
    let duration = 0;
    if (distance > 0 && speed > 0) {
      duration = distance >= (speed * speed) / rate ? distance / speed + speed / rate : 2 * Math.sqrt(distance / rate);
    }
    const kind: ToolpathSegmentKind =
      length === 0 ? 'retract' : wiping ? 'wipe' : extrusion > 0 ? currentKind : 'travel';
    const layer = layerTable.at(-1)!;
    layer.z ??= to[2]!;
    const index = segmentCount;
    columns.positions.set([from[0]!, from[1]!, from[2]!, to[0]!, to[1]!, to[2]!], index * 6);
    columns.kinds[index] = kindIndex[kind];
    columns.layers[index] = layer.index;
    columns.times[index * 2] = clock;
    columns.times[index * 2 + 1] = clock + duration;
    columns.extrusion[index] = extrusion;
    columns.feedrates[index] = speed;
    columns.tools[index] = tool;
    for (const point of [from, to]) {
      for (let axis = 0; axis < 3; axis += 1) {
        bounds.min[axis] = Math.min(bounds.min[axis]!, point[axis]!);
        bounds.max[axis] = Math.max(bounds.max[axis]!, point[axis]!);
      }
    }
    clock += duration;
    layer.segmentCount += 1;
    layer.endTime = clock;
    segmentCount += 1;
  };

  const requireModes = (words: Words, record: number): void => {
    // Firmware refuses extruder motion while the nozzle is cold; a program that never asked for heat is uninitialised.
    if (words.get('E') !== undefined && !nozzleTemperatureCommanded) {
      throw new ToolpathParseError(
        'TOOLPATH_UNINITIALIZED_MOTION',
        `Record ${record} moves the extruder before any nozzle temperature was commanded.`,
        record,
      );
    }
    const commanded = words.get('F');
    if (commanded !== undefined) {
      if (commanded <= 0) {
        throw new ToolpathParseError(
          'TOOLPATH_INVALID_RECORD',
          `Record ${record} commands a non-positive feedrate.`,
          record,
        );
      }
      feedrate = commanded;
    }
  };

  const readTarget = (words: Words, record: number): { target: number[]; known: boolean[] } => {
    const target = [...position];
    const targetKnown = [...known];
    for (const [axis, letter] of axisLetters.entries()) {
      const value = words.get(letter);
      if (value === undefined) {
        continue;
      }
      if (absolute) {
        target[axis] = value;
        targetKnown[axis] = true;
      } else if (known[axis]) {
        target[axis] = position[axis]! + value;
      }
      if (Math.abs(target[axis]!) > maximumCoordinate) {
        throw new ToolpathParseError(
          'TOOLPATH_INVALID_RECORD',
          `Record ${record} targets ${letter}=${target[axis]} outside ±${maximumCoordinate} mm.`,
          record,
        );
      }
    }
    return { target, known: targetKnown };
  };

  const readExtrusion = (words: Words): number => {
    const value = words.get('E');
    if (value === undefined) {
      return 0;
    }
    const delta = relativeExtrusion ? value : value - logicalExtrusion;
    logicalExtrusion = relativeExtrusion ? logicalExtrusion + value : value;
    // Filament is fed whether or not the move has a known pose to draw.
    filamentLength += delta;
    return delta;
  };

  const commitPose = (target: readonly number[], targetKnown: readonly boolean[]): void => {
    position.splice(0, 3, ...target);
    known.splice(0, 3, ...targetKnown);
  };

  const linearMove = (words: Words, record: number): void => {
    requireModes(words, record);
    const { target, known: targetKnown } = readTarget(words, record);
    const extrusion = readExtrusion(words);
    const moved = target.some((value, axis) => value !== position[axis]);
    const fullyKnown = known.every(Boolean) && targetKnown.every(Boolean);
    if (fullyKnown && (moved || extrusion !== 0)) {
      emitSegment({ from: position, to: target, extrusion, record });
    }
    commitPose(target, targetKnown);
  };

  const arcCenter = ({
    words,
    record,
    clockwise,
    chord: [startX, startY, endX, endY],
  }: Readonly<{
    words: Words;
    record: number;
    clockwise: boolean;
    chord: readonly [number, number, number, number];
  }>): readonly [number, number] => {
    const radiusWord = words.get('R');
    if (radiusWord === undefined) {
      return [startX + (words.get('I') ?? 0), startY + (words.get('J') ?? 0)];
    }
    const chordX = endX - startX;
    const chordY = endY - startY;
    const chordLength = Math.hypot(chordX, chordY);
    if (chordLength === 0 || Math.abs(radiusWord) < chordLength / 2) {
      throw new ToolpathParseError(
        'TOOLPATH_INVALID_RECORD',
        `Record ${record} describes an impossible arc radius.`,
        record,
      );
    }
    const height = Math.sqrt(Math.max(radiusWord * radiusWord - (chordLength * chordLength) / 4, 0));
    const sign = (clockwise ? -1 : 1) * Math.sign(radiusWord);
    return [
      startX + chordX / 2 - (sign * height * chordY) / chordLength,
      startY + chordY / 2 + (sign * height * chordX) / chordLength,
    ];
  };

  const arcMove = (words: Words, record: number, clockwise: boolean): void => {
    requireModes(words, record);
    const { target, known: targetKnown } = readTarget(words, record);
    const extrusion = readExtrusion(words);
    const fullyKnown = known.every(Boolean) && targetKnown.every(Boolean);
    if (fullyKnown) {
      const [startX, startY, startZ] = position as [number, number, number];
      const [endX, endY, endZ] = target as [number, number, number];
      const [centerX, centerY] = arcCenter({ words, record, clockwise, chord: [startX, startY, endX, endY] });
      const radius = Math.hypot(startX - centerX, startY - centerY);
      if (radius === 0) {
        throw new ToolpathParseError(
          'TOOLPATH_INVALID_RECORD',
          `Record ${record} describes an arc without a radius.`,
          record,
        );
      }
      const startAngle = Math.atan2(startY - centerY, startX - centerX);
      const endAngle = Math.atan2(endY - centerY, endX - centerX);
      const direction = clockwise ? -1 : 1;
      let sweep = endAngle - startAngle;
      if (clockwise && sweep >= 0) {
        sweep -= 2 * Math.PI;
      } else if (!clockwise && sweep <= 0) {
        sweep += 2 * Math.PI;
      }
      const turns = Math.max(0, Math.floor(words.get('P') ?? 0));
      const sameEndpoint = startX === endX && startY === endY;
      const total = sameEndpoint ? (turns || 1) * 2 * Math.PI * direction : sweep + turns * 2 * Math.PI * direction;
      const maximumStep = radius > arcChordTolerance ? 2 * Math.acos(1 - arcChordTolerance / radius) : Math.PI / 2;
      const steps = Math.min(maximumArcSteps, Math.max(4, Math.ceil(Math.abs(total) / maximumStep)));
      let previous: readonly number[] = position;
      for (let step = 1; step <= steps; step += 1) {
        const fraction = step / steps;
        const angle = startAngle + total * fraction;
        const point =
          step === steps
            ? [endX, endY, endZ]
            : [
                centerX + radius * Math.cos(angle),
                centerY + radius * Math.sin(angle),
                startZ + (endZ - startZ) * fraction,
              ];
        emitSegment({ from: previous, to: point, extrusion: extrusion / steps, record });
        previous = point;
      }
    }
    commitPose(target, targetKnown);
  };

  const temperature = (kind: ToolpathEvent['kind']) => (words: Words) => {
    const value = words.get('S') ?? words.get('R');
    if (value !== undefined) {
      events.push({ time: clock, kind, value });
      if (kind === 'nozzle-temperature') {
        nozzleTemperatureCommanded = true;
      }
    }
  };

  const handlers = new Map<string, (words: Words, record: number) => void>([
    ['G0', linearMove],
    ['G1', linearMove],
    [
      'G2',
      (words, record) => {
        arcMove(words, record, true);
      },
    ],
    [
      'G3',
      (words, record) => {
        arcMove(words, record, false);
      },
    ],
    [
      'G4',
      (words) => {
        const milliseconds = words.get('P');
        const seconds = words.get('S');
        clock += milliseconds === undefined ? (seconds ?? 0) : milliseconds / 1000;
      },
    ],
    ['G17', inert],
    [
      'G20',
      (_words, record) => {
        throw new ToolpathParseError(
          'TOOLPATH_INVALID_RECORD',
          `Record ${record} selects inch units; only millimetres are supported.`,
          record,
        );
      },
    ],
    ['G21', inert],
    [
      'G28',
      (words) => {
        const axes = axisLetters.filter((letter) => words.has(letter));
        for (const [axis, letter] of axisLetters.entries()) {
          if (axes.length === 0 || axes.includes(letter)) {
            position[axis] = 0;
            known[axis] = true;
            homed[axis] = true;
          }
        }
        if (homed.every(Boolean) && segmentCount === 0) {
          initialPosition = 'homed';
        }
      },
    ],
    ['G29', inert],
    [
      'G90',
      () => {
        absolute = true;
      },
    ],
    [
      'G91',
      () => {
        absolute = false;
      },
    ],
    [
      'G92',
      (words) => {
        for (const [axis, letter] of axisLetters.entries()) {
          const value = words.get(letter);
          if (value !== undefined) {
            position[axis] = value;
            known[axis] = true;
          }
        }
        const extrusion = words.get('E');
        if (extrusion !== undefined) {
          logicalExtrusion = extrusion;
        }
      },
    ],
    [
      'M82',
      () => {
        relativeExtrusion = false;
      },
    ],
    [
      'M83',
      () => {
        relativeExtrusion = true;
      },
    ],
    ['M84', inert],
    ['M500', inert],
    [
      'M73',
      (words) => {
        // The first remaining-minutes report is the slicer's whole-print estimate; the header outranks it.
        const minutes = words.get('R');
        if (minutes !== undefined && headerEstimate === undefined) {
          headerEstimate = { seconds: minutes * secondsPerMinute, source: 'm73' };
        }
      },
    ],
    ['M73.2', inert],
    ['M104', temperature('nozzle-temperature')],
    ['M109', temperature('nozzle-temperature')],
    ['M140', temperature('bed-temperature')],
    ['M190', temperature('bed-temperature')],
    ['M141', temperature('chamber-temperature')],
    ['M191', temperature('chamber-temperature')],
    [
      'M106',
      (words) => {
        const value = Math.min(Math.max(words.get('S') ?? fanFullScale, 0), fanFullScale);
        events.push({ time: clock, kind: 'fan', value: Math.round((value / fanFullScale) * 100) });
      },
    ],
    [
      'M107',
      () => {
        events.push({ time: clock, kind: 'fan', value: 0 });
      },
    ],
    ['M201', inert],
    ['M203', inert],
    [
      'M204',
      (words) => {
        const both = words.get('S');
        const print = words.get('P') ?? both;
        const travel = words.get('T') ?? both;
        if (print !== undefined && print > 0) {
          acceleration.print = print;
        }
        if (travel !== undefined && travel > 0) {
          acceleration.travel = travel;
        }
      },
    ],
    ['M205', inert],
    [
      'M220',
      (words) => {
        const percent = words.get('S');
        if (percent !== undefined && percent > 0) {
          feedPercent = percent / 100;
        }
      },
    ],
    ['M221', inert],
  ]);

  const execute = (executable: string, record: number): void => {
    coverage.records += 1;
    const match = commandPattern.exec(executable);
    const command = match === null ? undefined : `${match[1]}${match[2]}`;
    if (match?.[1] === 'T' && Number(match[2]) < maximumFilaments) {
      coverage.known += 1;
      tool = Number(match[2]);
      events.push({ time: clock, kind: 'tool-change', value: tool });
    } else if (command !== undefined && (command.startsWith('T') || vendorPattern.test(command))) {
      coverage.vendor += 1;
      events.push({ time: clock, kind: 'vendor', record: executable.slice(0, maximumVendorRecordLength) });
      if (command === 'M400' && /\bU1\b/u.test(executable)) {
        events.push({ time: clock, kind: 'pause' });
      }
    } else if (command !== undefined && handlers.has(command)) {
      coverage.known += 1;
      handlers.get(command)!(readWords(executable.slice(match!.index + match![0].length), record), record);
    } else if (command === 'M0' || command === 'M1') {
      coverage.known += 1;
      events.push({ time: clock, kind: 'pause' });
    } else {
      coverage.unknown += 1;
    }
  };

  let lineStart = 0;
  let record = 0;
  while (lineStart <= text.length) {
    let lineEnd = text.indexOf('\n', lineStart);
    if (lineEnd === -1) {
      lineEnd = text.length;
    }
    record += 1;
    if (record > maximumRecords) {
      throw new ToolpathParseError(
        'TOOLPATH_RECORD_LIMIT',
        `G-code source exceeds the ${maximumRecords} record limit.`,
        record,
      );
    }
    let line = text.slice(lineStart, lineEnd);
    if (line.endsWith('\r')) {
      line = line.slice(0, -1);
    }
    lineStart = lineEnd + 1;
    const commentStart = line.indexOf(';');
    const hasComment = commentStart !== -1;
    if (hasComment) {
      annotate(line.slice(commentStart + 1));
    }
    const executable = (hasComment ? line.slice(0, commentStart) : line).trim();
    if (executable !== '') {
      execute(executable, record);
    }
    if (lineEnd === text.length) {
      break;
    }
  }

  const finite = segmentCount > 0;
  return {
    version: 1,
    source: { digest, parser: parserIdentity },
    units: 'mm',
    initialPosition,
    segmentCount,
    positions: columns.positions.slice(0, segmentCount * 6),
    kinds: columns.kinds.slice(0, segmentCount),
    preambleSegmentCount: preambleSegmentCount ?? 0,
    layers: columns.layers.slice(0, segmentCount),
    times: columns.times.slice(0, segmentCount * 2),
    extrusion: columns.extrusion.slice(0, segmentCount),
    feedrates: columns.feedrates.slice(0, segmentCount),
    tools: columns.tools.slice(0, segmentCount),
    layerTable: layerTable.map(({ implicit: _implicit, zAnnotated: _zAnnotated, z, ...layer }) => ({
      ...layer,
      z: z ?? 0,
    })),
    events,
    bounds: finite
      ? {
          min: [bounds.min[0]!, bounds.min[1]!, bounds.min[2]!],
          max: [bounds.max[0]!, bounds.max[1]!, bounds.max[2]!],
        }
      : { min: [0, 0, 0], max: [0, 0, 0] },
    duration: clock,
    filamentLength,
    coverage: { ...coverage, complete: coverage.unknown === 0 },
    ...(headerEstimate === undefined ? {} : { headerEstimate }),
  };
};
