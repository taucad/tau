/**
 * Read a G-code program the way a Carvera runs it, without running it: its reach, tools, speeds, offsets, the
 * features it uses and how long it should take.
 *
 * @module
 */

import { carveraMaximumLineLength } from '#carvera.protocol.js';

/** A feature a program uses that changes how it must be watched. @internal */
export type CarveraProgramUse = 'tool-change' | 'coolant' | 'probing' | 'program-stop' | 'inverse-time-feed';

const programUses: Readonly<Record<number, CarveraProgramUse>> = {
  0: 'program-stop',
  1: 'program-stop',
  60: 'program-stop',
  600: 'program-stop',
  6: 'tool-change',
  7: 'coolant',
  8: 'coolant',
};

/** What a program needs and will do. Millimetres, millimetres per minute, revolutions per minute. @internal */
export type CarveraProgram = Readonly<{
  lines: number;
  /** Work coordinates per axis id, of every move outside `G53` and `G28`. */
  extents: Readonly<Record<string, Readonly<{ min: number; max: number }>>>;
  /** Tool numbers in the order the program first asks for them. */
  tools: readonly number[];
  spindleSpeed?: Readonly<{ min: number; max: number }>;
  maximumFeed?: number;
  workOffsets: readonly string[];
  uses: readonly CarveraProgramUse[];
  /** Lines the machine would drop for being longer than it reads. */
  longLines: readonly number[];
  /** Feed moves at their feed, rapids at {@link carveraRapidFeed}, dwells as written. Milliseconds. */
  estimatedDuration: number;
}>;

/** The feed this estimate assumes for rapids. Millimetres per minute. @internal */
export const carveraRapidFeed = 3000;

const word = /([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/giu;

/**
 * The words of one line, comments removed, letters upper case.
 * @internal
 * @param line - One G-code line.
 * @returns Its words in order.
 */
export const carveraWords = (line: string): ReadonlyArray<readonly [letter: string, value: number]> =>
  [
    ...line
      .replaceAll(/\([^)]*\)/gu, '')
      .replace(/;.*$/u, '')
      .matchAll(word),
  ].map((match) => [match[1]!.toUpperCase(), Number(match[2])] as const);

const axes = ['x', 'y', 'z'] as const;

/**
 * Summarise one program.
 *
 * ponytail: arcs count as their chord for both reach and time; an axis has no reach until the program first places
 * it. An arc's bulge past its chord is the only reach this misses.
 * @internal
 * @param text - G-code as the machine would read it.
 * @returns Reach, tools, speeds, offsets, uses and an estimated duration.
 */
// oxlint-disable-next-line eslint/complexity -- one modal G-code pass
export const summarizeCarveraProgram = (text: string): CarveraProgram => {
  const sourceLines = text.split(/\r?\n/u);
  const extents: Record<string, { min: number; max: number }> = {};
  const tools: number[] = [];
  const workOffsets: string[] = [];
  const uses = new Set<CarveraProgramUse>();
  const longLines: number[] = [];
  const position: Partial<Record<(typeof axes)[number], number>> = {};
  let speedMin = Number.POSITIVE_INFINITY;
  let speedMax = 0;
  let maximumFeed = 0;
  const modal = { motion: 0, relative: false, scale: 1, feed: 0, duration: 0 };
  let lines = 0;
  /**
   * Apply one G word.
   * @param value - The number after `G`.
   * @param words - The whole line, for a dwell's `P`.
   * @returns True when the line's coordinates are not the work's reach.
   */
  const onG = (value: number, words: ReturnType<typeof carveraWords>): boolean => {
    switch (value) {
      case 0:
      case 1:
      case 2:
      case 3: {
        modal.motion = value;
        return false;
      }
      case 90:
      case 91: {
        modal.relative = value === 91;
        return false;
      }
      case 20:
      case 21: {
        modal.scale = value === 20 ? 25.4 : 1;
        return false;
      }
      case 4: {
        modal.duration += (words.find(([other]) => other === 'P')?.[1] ?? 0) * 1000;
        return false;
      }
      case 93: {
        uses.add('inverse-time-feed');
        return false;
      }
      default: {
        const offset = `G${String(value)}`;
        if (/^G5[4-9]$/u.test(offset) && !workOffsets.includes(offset)) {
          workOffsets.push(offset);
        }
        if (Math.floor(value) === 38) {
          uses.add('probing');
        }
        // Machine-frame moves, returns to fixed positions, probing and offset settings are not the work's reach.
        return [53, 28, 30, 10].includes(value) || [38, 92].includes(Math.floor(value));
      }
    }
  };
  for (const [index, raw] of sourceLines.entries()) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('%')) {
      continue;
    }
    lines += 1;
    if (raw.length > carveraMaximumLineLength) {
      longLines.push(index + 1);
    }
    const words = carveraWords(line);
    let notWork = false;
    for (const [letter, value] of words) {
      switch (letter) {
        case 'G': {
          notWork = onG(value, words) || notWork;
          break;
        }
        case 'M': {
          const use = programUses[value];
          if (use !== undefined) {
            uses.add(use);
          }
          break;
        }
        case 'T': {
          if (!tools.includes(value)) {
            tools.push(value);
          }
          break;
        }
        case 'F': {
          modal.feed = value * modal.scale;
          maximumFeed = Math.max(maximumFeed, modal.feed);
          break;
        }
        case 'S': {
          if (value > 0) {
            speedMin = Math.min(speedMin, value);
            speedMax = Math.max(speedMax, value);
          }
          break;
        }
        default:
      }
    }
    const targets = words.filter(([letter]) => letter === 'X' || letter === 'Y' || letter === 'Z');
    if (targets.length === 0 || notWork) {
      continue;
    }
    const start = { ...position };
    for (const [letter, value] of targets) {
      const axis = letter.toLowerCase() as (typeof axes)[number];
      position[axis] = modal.relative ? (position[axis] ?? 0) + value * modal.scale : value * modal.scale;
    }
    let distance = 0;
    for (const axis of axes) {
      const end = position[axis];
      if (end === undefined) {
        continue;
      }
      const from = start[axis] ?? end;
      distance += (end - from) ** 2;
      extents[axis] ??= { min: end, max: end };
      const reach = extents[axis];
      reach.min = Math.min(reach.min, from, end);
      reach.max = Math.max(reach.max, from, end);
    }
    const rate = modal.motion === 0 ? carveraRapidFeed : modal.feed;
    if (rate > 0) {
      modal.duration += (Math.sqrt(distance) / rate) * 60_000;
    }
  }
  return {
    lines,
    extents,
    tools,
    ...(speedMax > 0 ? { spindleSpeed: { min: speedMin, max: speedMax } } : {}),
    ...(maximumFeed > 0 ? { maximumFeed } : {}),
    workOffsets,
    uses: [...uses],
    longLines,
    estimatedDuration: Math.round(modal.duration),
  };
};
