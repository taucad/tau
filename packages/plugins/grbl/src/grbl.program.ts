/**
 * Read a G-code program before anyone approves it: what it reaches, which tools, speeds, feeds and work offsets it
 * uses, which pauses it asks for, and which of its codes Grbl 1.1 refuses.
 *
 * @module
 */

import type { MachineCheck, MachineProgramSummary } from '@taucad/runtime/machine';

import type { GrblTravel } from '#grbl.manifest.js';

import { cleanGcodeLine, grblMaximumLineLength } from '#grbl.protocol.js';

type Axis = 'x' | 'y' | 'z';
const axes: readonly Axis[] = ['x', 'y', 'z'];
type Extents = Partial<Record<Axis, { min: number; max: number }>>;

/** What reading a program found, beyond the summary every surface shows. @internal */
export type GrblProgram = Readonly<{
  summary: MachineProgramSummary & Readonly<{ facts: Extract<MachineProgramSummary['facts'], { process: 'milling' }> }>;
  /** Extents of `G53` moves, which are in machine coordinates. */
  machineExtents: Readonly<Record<string, Readonly<{ min: number; max: number }>>>;
  /** Lines Grbl would refuse, with their 1-based line numbers. */
  refused: ReadonlyArray<Readonly<{ line: number; text: string; reason: string }>>;
  /** 1-based line numbers of each `M6`, in order, with the tool it asks for. */
  toolChanges: ReadonlyArray<Readonly<{ line: number; tool: number }>>;
}>;

/** G codes Grbl 1.1 runs. `G38.x` probes; everything else here is motion, units, planes, offsets or modes. */
const supportedG = new Set([
  '0',
  '1',
  '2',
  '3',
  '4',
  '10',
  '17',
  '18',
  '19',
  '20',
  '21',
  '28',
  '28.1',
  '30',
  '30.1',
  '38.2',
  '38.3',
  '38.4',
  '38.5',
  '40',
  '43.1',
  '49',
  '53',
  '54',
  '55',
  '56',
  '57',
  '58',
  '59',
  '61',
  '80',
  '90',
  '91',
  '91.1',
  '92',
  '92.1',
  '93',
  '94',
]);
/** M codes Grbl 1.1 runs; `M6` is intercepted by the session into a person tool change. */
const supportedM = new Set(['0', '1', '2', '30', '3', '4', '5', '6', '7', '8', '9', '56']);
const words = /([A-Z])(-?\d*\.?\d+)/gu;

/** Maximum rapid rate assumed for the duration estimate: the LongMill's `$110`–`$112`. Millimetres per minute. */
const rapidRate = 4000;

type State = {
  absolute: boolean;
  /** Millimetres per program unit. */
  scale: number;
  motion: string;
  feed: number;
  position: Record<Axis, number | undefined>;
  plane: string;
};

const widen = (extents: Extents, axis: Axis, value: number): void => {
  const current = extents[axis];
  extents[axis] =
    current === undefined
      ? { min: value, max: value }
      : { min: Math.min(current.min, value), max: Math.max(current.max, value) };
};

/**
 * The extremes an XY arc sweeps through, beyond its end points. G17 only; other planes count their end points.
 * @param arc - The start and end points, the centre and the direction.
 * @returns The quadrant points the arc passes.
 */
const arcExtremes = (
  arc: Readonly<{
    start: Readonly<{ x: number; y: number }>;
    end: Readonly<{ x: number; y: number }>;
    centre: Readonly<{ x: number; y: number }>;
    isClockwise: boolean;
  }>,
): Array<Readonly<{ x: number; y: number }>> => {
  const { start, end, centre, isClockwise } = arc;
  const radius = Math.hypot(start.x - centre.x, start.y - centre.y);
  const angle = (point: Readonly<{ x: number; y: number }>): number =>
    Math.atan2(point.y - centre.y, point.x - centre.x);
  const from = angle(start);
  let sweep = angle(end) - from;
  if (isClockwise) {
    sweep = sweep >= 0 ? sweep - 2 * Math.PI : sweep;
  } else {
    sweep = sweep <= 0 ? sweep + 2 * Math.PI : sweep;
  }
  const extremes: Array<Readonly<{ x: number; y: number }>> = [];
  for (let quarter = -8; quarter <= 8; quarter += 1) {
    const at = (quarter * Math.PI) / 2;
    const offset = at - from;
    if ((sweep > 0 && offset > 0 && offset < sweep) || (sweep < 0 && offset < 0 && offset > sweep)) {
      extremes.push({ x: centre.x + radius * Math.cos(at), y: centre.y + radius * Math.sin(at) });
    }
  }
  return extremes;
};

/**
 * Read one G-code program.
 * @internal
 * @param text - The whole G-code file as text.
 * @param name - The program's name for surfaces.
 * @returns The summary and what Grbl would refuse.
 */
// oxlint-disable-next-line eslint/complexity -- One pass over a modal language; each branch is one G-code rule.
export const readGrblProgram = (text: string, name: string): GrblProgram => {
  const state: State = {
    absolute: true,
    scale: 1,
    motion: '0',
    feed: 0,
    position: { x: undefined, y: undefined, z: undefined },
    plane: '17',
  };
  const extents: Extents = {};
  const machineExtents: Extents = {};
  const tools = new Set<number>();
  const offsets = new Set<string>();
  const uses = new Set<GrblProgram['summary']['facts']['uses'][number]>();
  const refused: Array<{ line: number; text: string; reason: string }> = [];
  const toolChanges: Array<{ line: number; tool: number }> = [];
  let spindle: { min: number; max: number } | undefined;
  let maximumFeed: number | undefined;
  let lines = 0;
  let seconds = 0;
  let nextTool = 0;
  const rawLines = text.split(/\r?\n/u);
  for (const [index, raw] of rawLines.entries()) {
    const line = cleanGcodeLine(raw);
    if (line.length === 0) {
      continue;
    }
    lines += 1;
    const number = index + 1;
    if (line.length + 1 > grblMaximumLineLength) {
      refused.push({ line: number, text: line, reason: 'The line is longer than Grbl accepts.' });
    }
    const parsed = [...line.matchAll(words)].map((match) => ({ letter: match[1] ?? '', value: match[2] ?? '' }));
    const values = new Map(parsed.map((word) => [word.letter, Number(word.value)]));
    let isMachineFrame = false;
    let isNonModalMove = false;
    for (const word of parsed) {
      const code = String(Number(word.value));
      if (word.letter === 'G') {
        if (!supportedG.has(code)) {
          refused.push({ line: number, text: line, reason: `Grbl does not run G${code}.` });
        }
        if (['0', '1', '2', '3', '38.2', '38.3', '38.4', '38.5'].includes(code)) {
          state.motion = code;
        }
        if (code.startsWith('38')) {
          uses.add('probing');
        }
        if (code === '93') {
          uses.add('inverse-time-feed');
        }
        if (code === '20' || code === '21') {
          state.scale = code === '20' ? 25.4 : 1;
        }
        if (code === '90' || code === '91') {
          state.absolute = code === '90';
        }
        if (['17', '18', '19'].includes(code)) {
          state.plane = code;
        }
        if (/^5[4-9]$/u.test(code)) {
          offsets.add(`G${code}`);
        }
        if (code === '53') {
          isMachineFrame = true;
        }
        if (['4', '10', '28', '30', '92'].includes(code)) {
          isNonModalMove = true;
        }
      }
      if (word.letter === 'M') {
        if (!supportedM.has(code)) {
          refused.push({ line: number, text: line, reason: `Grbl does not run M${code}.` });
        }
        if (code === '6') {
          uses.add('tool-change');
          toolChanges.push({ line: number, tool: values.get('T') ?? nextTool });
        }
        if (code === '0' || code === '1') {
          uses.add('program-stop');
        }
        if (code === '7' || code === '8') {
          uses.add('coolant');
        }
      }
      if (word.letter === 'T') {
        nextTool = Number(word.value);
        tools.add(nextTool);
      }
      if (word.letter === 'S') {
        const speed = Number(word.value);
        if (speed > 0) {
          spindle =
            spindle === undefined
              ? { min: speed, max: speed }
              : { min: Math.min(spindle.min, speed), max: Math.max(spindle.max, speed) };
        }
      }
      if (word.letter === 'F') {
        state.feed = Number(word.value) * state.scale;
        maximumFeed = Math.max(maximumFeed ?? 0, state.feed);
      }
    }
    const hasAxis = axes.some((axis) => values.has(axis.toUpperCase()));
    if (!hasAxis || isNonModalMove) {
      continue;
    }
    const start = { ...state.position };
    const target: Record<Axis, number | undefined> = { ...state.position };
    for (const axis of axes) {
      const value = values.get(axis.toUpperCase());
      if (value !== undefined) {
        const millimetres = value * state.scale;
        target[axis] = isMachineFrame || state.absolute ? millimetres : (state.position[axis] ?? 0) + millimetres;
      }
    }
    const into = isMachineFrame ? machineExtents : extents;
    for (const axis of axes) {
      const value = target[axis];
      if (value !== undefined && values.has(axis.toUpperCase())) {
        widen(into, axis, value);
      }
    }
    const isArc = state.motion === '2' || state.motion === '3';
    if (isArc && state.plane === '17' && !isMachineFrame && start.x !== undefined && start.y !== undefined) {
      const centre = {
        x: start.x + (values.get('I') ?? 0) * state.scale,
        y: start.y + (values.get('J') ?? 0) * state.scale,
      };
      // ponytail: R-format arcs count their end points only; CAM output for Grbl uses I/J.
      if (values.has('I') || values.has('J')) {
        for (const point of arcExtremes({
          start: { x: start.x, y: start.y },
          end: { x: target.x ?? start.x, y: target.y ?? start.y },
          centre,
          isClockwise: state.motion === '2',
        })) {
          widen(extents, 'x', point.x);
          widen(extents, 'y', point.y);
        }
      }
    }
    if (!isMachineFrame) {
      state.position = target;
    }
    const distance = Math.hypot(...axes.map((axis) => (target[axis] ?? 0) - (start[axis] ?? target[axis] ?? 0)));
    const rate = state.motion === '0' || state.feed <= 0 ? rapidRate : state.feed;
    seconds += (distance / rate) * 60;
  }
  return {
    summary: {
      name,
      estimatedDuration: Math.round(seconds * 1000),
      facts: {
        process: 'milling',
        lines,
        extents: Object.fromEntries(Object.entries(extents).map(([axis, range]) => [axis, { ...range }])),
        tools: [...tools].toSorted((left, right) => left - right).map((tool) => ({ number: tool })),
        ...(spindle === undefined ? {} : { spindleSpeed: spindle }),
        ...(maximumFeed === undefined ? {} : { maximumFeed }),
        workOffsets: [...offsets].toSorted(),
        uses: [...uses].toSorted(),
      },
    },
    machineExtents,
    refused,
    toolChanges,
  };
};

/**
 * What a program needs from the machine before it may start: that Grbl runs every line, what its bit changes ask of
 * a person, and that it stays within the travel from the chosen zero.
 * @internal
 * @param input - The program, the start form's choices, the zero's machine position when the position is trusted, and
 *   the travel.
 * @returns One check per fact, each passed, needing attention, blocked or unknown.
 */
export const grblProgramChecks = (
  input: Readonly<{
    program: GrblProgram;
    toolChange: 'pause' | 'refuse';
    workOffset: string;
    /** Machine coordinates of the work zero; undefined while the machine position is not trusted. */
    origin: Readonly<Record<Axis, number>> | undefined;
    /** Whether the machine can home; without homing switches an untrusted position stays unknown. */
    canHome?: boolean;
    /** The travel the controller reports (`$130`–`$132`). */
    travel: GrblTravel;
  }>,
): MachineCheck[] => {
  const { program, toolChange, workOffset, origin, canHome = true, travel } = input;
  const checks: MachineCheck[] = [];
  const [refusal] = program.refused;
  checks.push({
    id: 'dialect',
    label: 'Grbl runs every line',
    state: refusal === undefined ? 'passed' : 'blocked',
    source: 'computed',
    ...(refusal === undefined ? {} : { detail: `Line ${String(refusal.line)}: ${refusal.reason}` }),
  });
  if (program.toolChanges.length > 0) {
    const [first] = program.toolChanges;
    checks.push({
      id: 'tool-changes',
      label: 'Bit changes',
      state: toolChange === 'refuse' ? 'blocked' : 'attention',
      source: 'computed',
      detail:
        toolChange === 'refuse'
          ? 'The program changes bits and the start form refuses that.'
          : `The job pauses at line ${String(first!.line)} for you to change the bit and probe Z again.`,
    });
  }
  if (origin === undefined) {
    checks.push({
      id: 'travel',
      label: 'The program stays within the machine travel',
      state: 'unknown',
      source: 'computed',
      ...(canHome
        ? {
            detail: 'Home the machine so Tau can check the program against its travel.',
            remedy: { type: 'action', componentId: 'motion', action: 'motion.home' } as const,
          }
        : { detail: 'Without homing switches Tau cannot check the program against the travel.' }),
    });
  } else {
    const outside: string[] = [];
    for (const axis of axes) {
      const work = program.summary.facts.extents[axis];
      const machine = program.machineExtents[axis];
      const ranges = [
        ...(work === undefined ? [] : [{ min: work.min + origin[axis], max: work.max + origin[axis] }]),
        ...(machine === undefined ? [] : [machine]),
      ];
      if (ranges.some((range) => range.min < travel[axis].min - 1e-3 || range.max > travel[axis].max + 1e-3)) {
        outside.push(axis.toUpperCase());
      }
    }
    checks.push({
      id: 'travel',
      label: 'The program stays within the machine travel',
      state: outside.length === 0 ? 'passed' : 'blocked',
      source: 'computed',
      ...(outside.length === 0
        ? {}
        : {
            detail: `From the ${workOffset} zero the program leaves the travel in ${outside.join(', ')}.`,
          }),
    });
  }
  return checks;
};
