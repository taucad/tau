/**
 * A virtual Carvera C1 behind the real framing: it answers status and diagnose, plays uploaded programs from a
 * virtual SD card, changes tools, probes, suspends, resumes, aborts and halts the way stock firmware 1.0.7 does, so
 * the real session code runs end to end over an in-memory stream. No sockets, no hardware.
 *
 * @module
 */

import { createHash } from 'node:crypto';

import { defineConfiguration } from '@taucad/runtime/configuration';
import { defineMachine } from '@taucad/runtime/machine';
import type { MachineNetworkStream } from '@taucad/runtime/machine';
import { z } from 'zod';

import { carveraWords, summarizeCarveraProgram } from '#carvera.gcode.js';
import { carveraManifest, carveraSimulationProfile, carveraSubmissionConfiguration } from '#carvera.manifest.js';
import {
  carveraFrameType,
  carveraText,
  createCarveraFrameDecoder,
  encodeCarveraFrame,
  formatCarveraDiagnose,
  formatCarveraStatus,
  unescapeCarveraPath,
} from '#carvera.protocol.js';
import type { CarveraFrame, CarveraPosition, CarveraState } from '#carvera.protocol.js';
import { connectCarveraSession } from '#carvera.session.js';

/** Options for one virtual machine. @internal */
export type CarveraSimulatorOptions = Readonly<{
  /** Simulated milliseconds per real millisecond. */
  speed?: number;
  /** Milliseconds a played program takes, however long it would take on the machine. */
  runDuration?: number;
  /** Real milliseconds between simulation steps. */
  tickInterval?: number;
  /** The model the status line reports: 1 is the C1, 2 the Carvera Air. */
  model?: number;
  /** Simulated milliseconds a `play` keeps the machine busy before the run shows, as a slow start might. */
  playDelay?: number;
}>;

/** A virtual Carvera and the levers a test or a demo pulls at the machine. @internal */
export type CarveraSimulator = Readonly<{
  /** One TCP client at a time: a second gets a stream that closes at once, as a busy machine does. */
  open(): MachineNetworkStream;
  /** The discovery broadcast as the machine sends it. */
  broadcast(): Uint8Array<ArrayBuffer>;
  setCover(closed: boolean): void;
  setEstop(pressed: boolean): void;
  /** The machine's own auto-sleep. */
  sleep(): void;
  /** Drop the TCP link, as a Wi-Fi outage does; the machine keeps running. */
  drop(): void;
  /** Play a stored file from the machine's own screen. */
  play(path: string): void;
  /** Store the next upload with one byte changed, as a failing SD card would, while it still reports success. */
  damageNextUpload(): void;
  /** Every command line received, in order. */
  commands(): readonly string[];
  /** Paths on the virtual SD card. */
  files(): readonly string[];
  /** The planner's queued moves now, for checking what a suspend drains. */
  queued(): number;
  dispose(): void;
}>;

type Task = {
  label: string;
  /** Simulated milliseconds. */
  duration: number;
  elapsed: number;
  atc?: number;
  home?: boolean;
  from?: CarveraPosition;
  to?: CarveraPosition;
  /** Buffered pre-job lines run before the file. */
  source: 'file' | 'buffer' | 'console';
  line?: number;
  start?(): void;
  finish?(): void;
};

type Player = {
  name: string;
  lines: readonly string[];
  next: number;
  line: number;
  started: number;
  scale: number;
  suspend: 'none' | 'wait' | 'pause';
  saved?: CarveraPosition;
  aborting: boolean;
};

type Upload = { path: string; md5?: string; packets?: number; chunks: Array<Uint8Array<ArrayBuffer>>; next: number };

const rackTools = 6;
/** Stick-out of each tool, millimetres; T0 is the probe. */
const lengths: Readonly<Record<number, number>> = { 0: 42.1, 1: 37.42, 2: 31.05, 3: 45.8, 4: 28.3, 5: 39.9, 6: 33.33 };
const softMinimum: CarveraPosition = { x: -371, y: -250, z: -135 };
/** The stock top a Z probe finds, machine Z of a zero-length tool. */
const stockTop = -118;
const queueDepth = 4;
const rapid = 5000;
const allowedWhileHalted = new Set(['M2', 'M5', 'M9', 'M30', 'M105', 'M114', 'M115', 'M119']);

/**
 * One virtual machine.
 * @internal
 * @param options - Speed and run length.
 * @returns The in-memory machine and the levers a test pulls at it.
 */
// oxlint-disable-next-line eslint/max-lines-per-function -- one controller closure
export const createCarveraSimulator = (options: CarveraSimulatorOptions = {}): CarveraSimulator => {
  const speed = options.speed ?? 1;
  const runDuration = options.runDuration ?? 60_000;
  let clock = 0;
  let position: CarveraPosition = { x: -1, y: -1, z: -1 };
  let homed = false;
  let halt: number | undefined;
  let sleeping = false;
  let feedHold = false;
  let toolWait = false;
  let atc: number | undefined;
  let tool = 1;
  let referenceLength = lengths[1]!;
  let spindle = { target: 0, current: 0, override: 100, temperature: 26 };
  let feedOverride = 100;
  let relative = false;
  let activeOffset = 'G54';
  const offsets = new Map<string, CarveraPosition>([
    ['G54', { x: -248.5, y: -175.2, z: -75.8 }],
    ['G55', { x: -200, y: -150, z: -80 }],
    ['G56', { x: 0, y: 0, z: 0 }],
    ['G57', { x: 0, y: 0, z: 0 }],
    ['G58', { x: 0, y: 0, z: 0 }],
    ['G59', { x: 0, y: 0, z: 0 }],
  ]);
  let levelling: number | undefined;
  const switches = { light: true, vacuum: false, air: false };
  let coverClosed = true;
  let estopPressed = false;
  let probeVolts: number | undefined = 3.92;
  const queue: Task[] = [];
  let player: Player | undefined;
  const buffer: string[] = [];
  const files = new Map<string, string>();
  let upload: Upload | undefined;
  const log: string[] = [];
  let client: { push(bytes: Uint8Array<ArrayBuffer>): void; end(): void } | undefined;
  let damageUpload = false;

  const tlo = (): number => (lengths[tool] ?? 0) - referenceLength;
  const work = (): CarveraPosition => {
    const offset = offsets.get(activeOffset)!;
    return { x: position.x - offset.x, y: position.y - offset.y, z: position.z - offset.z - tlo() };
  };

  const state = (): CarveraState => {
    if (sleeping) {
      return 'Sleep';
    }
    if (player?.suspend === 'pause') {
      return 'Pause';
    }
    if (player?.suspend === 'wait') {
      return 'Wait';
    }
    if (toolWait) {
      return 'Tool';
    }
    if (halt !== undefined) {
      return 'Alarm';
    }
    if (queue[0]?.home === true) {
      return 'Home';
    }
    if (feedHold) {
      return 'Hold';
    }
    return queue.length === 0 && spindle.current === 0 && player === undefined ? 'Idle' : 'Run';
  };

  const frame = (type: number, payload: string | Uint8Array<ArrayBuffer> = ''): void => {
    client?.push(encodeCarveraFrame(type, typeof payload === 'string' ? new TextEncoder().encode(payload) : payload));
  };
  const say = (text: string): void => {
    frame(carveraFrameType.text, `${text}\n`);
  };

  const status = (): string =>
    formatCarveraStatus({
      state: state(),
      machine: position,
      work: work(),
      feed: { current: queue[0]?.to === undefined ? 0 : 1000, requested: 1000, override: feedOverride },
      spindle: {
        current: spindle.current,
        target: spindle.target,
        override: spindle.override,
        vacuumFollows: false,
        temperature: spindle.temperature,
      },
      tool: { active: tool, lengthOffset: tlo() },
      ...(probeVolts === undefined ? {} : { probeVolts }),
      ...(player === undefined
        ? {}
        : {
            playing: {
              line: player.line,
              percent: Math.round((player.next / Math.max(1, player.lines.length)) * 100),
              elapsed: Math.round((clock - player.started) / 1000),
            },
          }),
      ...(atc === undefined ? {} : { atc }),
      ...(levelling === undefined ? {} : { levelling }),
      ...(halt === undefined ? {} : { halt }),
      model: { model: options.model ?? 1, functions: 4, inches: false, absolute: !relative },
    });

  const stopEverything = (): void => {
    queue.length = 0;
    buffer.length = 0;
    player = undefined;
    atc = undefined;
    toolWait = false;
    feedHold = false;
    spindle = { ...spindle, target: 0, current: 0 };
  };

  const haltWith = (code: number): void => {
    stopEverything();
    halt = code;
    homed = false;
    say(`ALARM: halt ${String(code)}`);
  };

  // ───────────────────────────── G-code ─────────────────────────────

  const move = (target: CarveraPosition, feed: number, origin: Pick<Task, 'source' | 'line'>): Task | undefined => {
    if (
      target.x < softMinimum.x ||
      target.y < softMinimum.y ||
      target.z < softMinimum.z ||
      target.x > 0 ||
      target.y > 0 ||
      target.z > 0
    ) {
      haltWith(10);
      return undefined;
    }
    const from = queue.at(-1)?.to ?? position;
    const distance = Math.hypot(target.x - from.x, target.y - from.y, target.z - from.z);
    return {
      label: 'move',
      duration: (distance / Math.max(1, feed)) * 60_000,
      elapsed: 0,
      to: target,
      ...origin,
    };
  };

  const timed = (spec: Pick<Task, 'label' | 'duration' | 'source'> & Partial<Task>): Task => ({ elapsed: 0, ...spec });

  /**
   * A tool change decided when it runs, not when it is read: the tool in the spindle by then may differ.
   * @param next - The tool to fit; `-1` empties the spindle.
   * @param source - Where the line came from.
   * @returns The changer's steps.
   */
  const changeTool = (next: number, source: Task['source']): Task[] => {
    if (next < -1 || next > rackTools) {
      haltWith(6);
      return [];
    }
    const change = { drop: false, pick: false };
    /**
     * One step of the change that does nothing when the change turns out not to need it.
     * @param spec - The step, its changer phase, whether it applies and what it does at the end.
     * @returns The task.
     */
    const phase = (
      spec: Readonly<{ label: string; duration: number; code: number; applies: () => boolean; finish?: () => void }>,
    ): Task => {
      const task: Task = timed({
        label: spec.label,
        duration: spec.duration,
        source,
        atc: spec.code,
        start: () => {
          if (!spec.applies()) {
            task.duration = 0;
            delete task.atc;
          }
        },
        finish: () => {
          if (spec.applies()) {
            spec.finish?.();
          }
        },
      });
      return task;
    };
    return [
      timed({
        label: 'check',
        duration: 0,
        source,
        start: () => {
          if (next === 0 && (probeVolts === undefined || probeVolts <= 0)) {
            haltWith(12);
            return;
          }
          change.pick = next !== tool && next >= 0;
          change.drop = next !== tool && tool >= 0;
        },
      }),
      phase({
        label: 'drop',
        duration: 2500,
        code: 1,
        applies: () => change.drop,
        finish: () => {
          tool = -1;
        },
      }),
      phase({
        label: 'pick',
        duration: 2500,
        code: 2,
        applies: () => change.pick,
        finish: () => {
          tool = next;
        },
      }),
      phase({ label: 'calibrate', duration: 2000, code: 3, applies: () => change.pick }),
      timed({
        label: 'done',
        duration: 100,
        source,
        finish: () => {
          atc = undefined;
        },
      }),
    ];
  };

  // oxlint-disable-next-line eslint/complexity -- one G-code interpreter
  const execute = (text: string, source: Task['source'], line?: number): Task[] => {
    const words = carveraWords(text);
    const tasks: Task[] = [];
    const has = (letter: string, value?: number): boolean =>
      words.some(([other, number]) => other === letter && (value === undefined || number === value));
    const value = (letter: string): number | undefined => words.find(([other]) => other === letter)?.[1];
    const code = words.find(([letter]) => letter === 'M' || letter === 'G');
    if (halt !== undefined && !(code !== undefined && allowedWhileHalted.has(`${code[0]}${String(code[1])}`))) {
      say('error:Alarm lock');
      return [];
    }
    const now = (label: string, effect: () => void): void => {
      tasks.push(timed({ label, duration: 0, source, finish: effect }));
    };
    // Modal words take effect as the line is read, as a planner reads ahead.
    if (has('G', 90)) {
      relative = false;
    }
    if (has('G', 91)) {
      relative = true;
    }
    for (const offset of ['G54', 'G55', 'G56', 'G57', 'G58', 'G59']) {
      if (has('G', Number(offset.slice(1)))) {
        activeOffset = offset;
      }
    }
    if (has('G', 10) && has('L', 20)) {
      const index = value('P') ?? 0;
      const name = index === 0 ? undefined : `G${String(53 + index)}`;
      now('G10', () => {
        const target = name ?? activeOffset;
        const offset = { ...offsets.get(target)! };
        const x = value('X');
        const y = value('Y');
        const z = value('Z');
        if (x !== undefined) {
          offset.x = position.x - x;
        }
        if (y !== undefined) {
          offset.y = position.y - y;
        }
        if (z !== undefined) {
          // Stock firmware re-bases tool lengths on the tool that sets Z.
          referenceLength = lengths[tool] ?? 0;
          offset.z = position.z - z;
        }
        offsets.set(target, offset);
      });
      return tasks;
    }
    if (has('G', 4)) {
      tasks.push(timed({ label: 'dwell', duration: (value('P') ?? 0) * 1000, source }));
    }
    if (words.some(([letter, number]) => letter === 'G' && Math.floor(number) === 38)) {
      const travel = value('Z') ?? -30;
      const feed = value('F') ?? 150;
      const task: Task = timed({
        label: 'probe',
        duration: (Math.abs(travel) / feed) * 60_000,
        source,
        // Where the probe touches depends on the tool fitted when the move starts.
        start: () => {
          const touch = stockTop + (lengths[tool] ?? 0) - lengths[0]!;
          if (touch < position.z + travel || touch > position.z) {
            haltWith(3);
            return;
          }
          task.to = { ...position, z: touch };
        },
      });
      tasks.push(task);
      return tasks;
    }
    const targets = words.filter(([letter]) => letter === 'X' || letter === 'Y' || letter === 'Z');
    const motion = words.find(([letter, number]) => letter === 'G' && [0, 1, 2, 3].includes(number))?.[1];
    if (targets.length > 0 && (motion !== undefined || has('G', 53))) {
      const from = queue.at(-1)?.to ?? position;
      const machineFrame = has('G', 53);
      const offset = offsets.get(activeOffset)!;
      const target = { ...from };
      for (const [letter, number] of targets) {
        const axis = letter.toLowerCase() as 'x' | 'y' | 'z';
        target[axis] =
          relative && !machineFrame
            ? from[axis] + number
            : machineFrame
              ? number
              : number + offset[axis] + (axis === 'z' ? tlo() : 0);
      }
      const task = move(target, motion === 0 || motion === undefined ? rapid : (value('F') ?? 1000), {
        source,
        ...(line === undefined ? {} : { line }),
      });
      if (task !== undefined) {
        tasks.push(task);
      }
    }
    if (has('M', 3)) {
      if (tool < 1) {
        haltWith(1);
        return [];
      }
      const rpm = value('S') ?? 10_000;
      tasks.push(
        timed({
          label: 'spin-up',
          duration: 1000,
          source,
          finish: () => {
            spindle = { ...spindle, target: rpm, current: rpm };
          },
        }),
      );
    }
    if (has('M', 5)) {
      now('M5', () => {
        spindle = { ...spindle, target: 0, current: 0 };
      });
    }
    if (has('M', 6)) {
      tasks.push(...changeTool(value('T') ?? tool, source));
    }
    if (has('M', 491)) {
      tasks.push(
        timed({ label: 'calibrate', duration: 2000, source, atc: 3 }),
        timed({
          label: 'done',
          duration: 100,
          source,
          finish: () => {
            atc = undefined;
          },
        }),
      );
    }
    if (has('M', 495)) {
      const probing = has('O') || has('A');
      if (has('C')) {
        tasks.push(timed({ label: 'margin', duration: 4000, source, atc: 4 }));
      }
      if (probing) {
        tasks.push(...changeTool(0, source).filter((task) => task.label !== 'done'));
        if (has('O')) {
          tasks.push(
            timed({
              label: 'zprobe',
              duration: 3000,
              source,
              atc: 5,
              finish: () => {
                offsets.set(activeOffset, { ...offsets.get(activeOffset)!, z: stockTop });
              },
            }),
          );
        }
        if (has('A')) {
          tasks.push(
            timed({
              label: 'autolevel',
              duration: 5000,
              source,
              atc: 6,
              finish: () => {
                levelling = 0.042;
              },
            }),
          );
        }
      }
      tasks.push(
        timed({
          label: 'done',
          duration: 300,
          source,
          atc: 9,
          finish: () => {
            atc = undefined;
          },
        }),
      );
    }
    if (has('M', 495.3) || words.some(([letter, number]) => letter === 'M' && Math.floor(number) === 480)) {
      tasks.push(
        ...(tool === 0
          ? [
              timed({ label: 'probe-cycle', duration: 4000, source, atc: 5 }),
              timed({
                label: 'done',
                duration: 100,
                source,
                finish: () => {
                  atc = undefined;
                },
              }),
            ]
          : [
              timed({
                label: 'probe-invalid',
                duration: 100,
                source,
                finish: () => {
                  haltWith(12);
                },
              }),
            ]),
      );
    }
    const switchCodes = new Map<number, () => void>([
      [
        7,
        () => {
          switches.air = true;
        },
      ],
      [
        9,
        () => {
          switches.air = false;
        },
      ],
      [
        801,
        () => {
          switches.vacuum = true;
        },
      ],
      [
        802,
        () => {
          switches.vacuum = false;
        },
      ],
      [
        821,
        () => {
          switches.light = true;
        },
      ],
      [
        822,
        () => {
          switches.light = false;
        },
      ],
      [
        370,
        () => {
          levelling = undefined;
        },
      ],
      [
        561,
        () => {
          levelling = undefined;
        },
      ],
    ]);
    for (const [number, effect] of switchCodes) {
      if (has('M', number)) {
        effect();
      }
    }
    if (has('M', 220)) {
      feedOverride = Math.min(1000, Math.max(10, value('S') ?? 100));
    }
    if (has('M', 223)) {
      spindle = { ...spindle, override: Math.min(200, Math.max(50, value('S') ?? 100)) };
    }
    if (has('M', 471)) {
      tasks.push(
        timed({
          label: 'pair',
          duration: 1500,
          source,
          finish: () => {
            probeVolts = 3.92;
            say('WP PAIR SUCCESS');
          },
        }),
      );
    }
    if (has('M', 600)) {
      now('M600', () => {
        if (player !== undefined) {
          player.suspend = 'wait';
        }
      });
    }
    if (has('M', 490.1)) {
      now('M490.1', () => {
        toolWait = true;
      });
    }
    if (has('M', 30) || has('M', 2)) {
      now('end', () => {
        if (player !== undefined) {
          player.next = player.lines.length;
        }
      });
    }
    return tasks;
  };

  // ───────────────────────────── Console ─────────────────────────────

  const resetMachine = (): void => {
    stopEverything();
    halt = undefined;
    sleeping = false;
    homed = false;
    levelling = undefined;
    // The machine restarts: the link drops, and it homes by itself once it is up.
    client?.end();
    client = undefined;
    queue.push(timed({ label: 'boot', duration: 2000, source: 'console' }), homeTask());
  };

  const homeTask = (): Task =>
    timed({
      label: 'home',
      duration: 4000,
      source: 'console',
      home: true,
      finish: () => {
        position = { x: -1, y: -1, z: -1 };
        homed = true;
      },
    });

  // oxlint-disable-next-line eslint/complexity -- one console dispatcher
  const command = (raw: string): void => {
    const line = raw.trim();
    log.push(line);
    const [verb = '', ...rest] = line.split(/\s+/u);
    const argument = unescapeCarveraPath(rest.join(' '));
    switch (verb) {
      case 'diagnose': {
        frame(
          carveraFrameType.diagnose,
          formatCarveraDiagnose({
            ...switches,
            coverClosed,
            probeTriggered: false,
            toolSetterTriggered: atc === 3,
            estopPressed,
            limits: [],
          }),
        );
        return;
      }
      case 'version': {
        say('version = 1.0.7');
        return;
      }
      case 'model': {
        say('model = C1');
        return;
      }
      case '$G': {
        say(`[G0 ${activeOffset} G17 G21 ${relative ? 'G91' : 'G90'} G94 M0 M5 M9 T${String(tool)} F0 S0]`);
        return;
      }
      case '$#': {
        for (const [name, offset] of offsets) {
          say(`[${name}:${offset.x.toFixed(4)},${offset.y.toFixed(4)},${offset.z.toFixed(4)}]`);
        }
        return;
      }
      case '$X':
      case 'M999': {
        if (halt !== undefined && halt <= 20) {
          halt = undefined;
          say('After HALT you should HOME');
        }
        return;
      }
      case '$H': {
        if (halt !== undefined && halt > 20) {
          say('error:Alarm lock');
          return;
        }
        if (estopPressed) {
          return;
        }
        halt = undefined;
        queue.push(homeTask());
        return;
      }
      case 'reset': {
        resetMachine();
        return;
      }
      case 'sleep': {
        if (state() === 'Idle') {
          sleeping = true;
        }
        return;
      }
      case '$J': {
        if (halt !== undefined || player !== undefined) {
          say('error:Alarm lock');
          return;
        }
        const words = carveraWords(rest.join(' '));
        const feed = words.find(([letter]) => letter === 'F')?.[1] ?? 1000;
        const from = queue.at(-1)?.to ?? position;
        const target = { ...from };
        for (const [letter, number] of words) {
          if (letter === 'X' || letter === 'Y' || letter === 'Z') {
            target[letter.toLowerCase() as 'x' | 'y' | 'z'] += number;
          }
        }
        const task = move(target, feed, { source: 'console' });
        if (task !== undefined) {
          queue.push(task);
        }
        return;
      }
      case 'upload': {
        if (state() !== 'Idle') {
          frame(carveraFrameType.fileCancel);
          return;
        }
        upload = { path: argument, chunks: [], next: 1 };
        frame(carveraFrameType.fileMd5);
        return;
      }
      case 'md5sum': {
        const text = files.get(argument);
        say(
          text === undefined
            ? `File not found: ${argument}`
            : `${createHash('md5').update(text).digest('hex')} ${argument}`,
        );
        return;
      }
      case 'play': {
        if (player !== undefined) {
          say('Currently printing, abort print first');
          return;
        }
        if (!homed) {
          haltWith(15);
          return;
        }
        const text = files.get(argument);
        if (text === undefined) {
          say(`File not found: ${argument}`);
          return;
        }
        const program = summarizeCarveraProgram(text);
        const begin = (): void => {
          player = {
            name: argument,
            lines: text.split(/\r?\n/u),
            next: 0,
            line: 0,
            started: clock,
            scale: runDuration / Math.max(1000, program.estimatedDuration),
            suspend: 'none',
            aborting: false,
          };
          relative = false;
        };
        if (options.playDelay === undefined) {
          begin();
        } else {
          queue.push(
            timed({ label: 'opening the file', duration: options.playDelay, source: 'console', finish: begin }),
          );
        }
        return;
      }
      case 'buffer': {
        buffer.push(rest.join(' '));
        return;
      }
      case 'suspend': {
        if (player?.suspend === 'none') {
          player.suspend = 'wait';
        }
        return;
      }
      case 'resume': {
        if (player?.suspend === 'pause') {
          const saved = player.saved ?? position;
          player.suspend = 'none';
          // Straight back to where it paused, at F1000, whatever is in the way.
          if (saved.x !== position.x || saved.y !== position.y || saved.z !== position.z) {
            const task = move(saved, 1000, { source: 'console' });
            if (task !== undefined) {
              queue.unshift(task);
            }
          }
        } else {
          say('Not suspended');
        }
        return;
      }
      case 'abort': {
        if (player === undefined) {
          say('Not currently playing');
          return;
        }
        // Stock abort closes the file, waits for the queued moves, then stops the spindle.
        player.aborting = true;
        player.suspend = 'none';
        buffer.length = 0;
        return;
      }
      default: {
        if (line.startsWith('M490.2') && toolWait) {
          toolWait = false;
          queue.unshift(
            timed({ label: 'calibrate', duration: 2000, source: 'console', atc: 3 }),
            timed({
              label: 'done',
              duration: 100,
              source: 'console',
              finish: () => {
                atc = undefined;
              },
            }),
          );
          return;
        }
        queue.push(...execute(line, 'console'));
      }
    }
  };

  const realtime = (character: string): void => {
    switch (character) {
      case '?': {
        frame(carveraFrameType.status, status());
        break;
      }
      case '!': {
        feedHold = true;
        break;
      }
      case '~': {
        feedHold = false;
        break;
      }
      case '\u0018': {
        haltWith(1);
        break;
      }
      default:
    }
  };

  const onUpload = (incoming: CarveraFrame): void => {
    const current = upload;
    if (current === undefined) {
      return;
    }
    const view = new DataView(incoming.payload.buffer, incoming.payload.byteOffset, incoming.payload.byteLength);
    if (incoming.type === carveraFrameType.fileMd5) {
      current.md5 = carveraText(incoming.payload);
      frame(carveraFrameType.fileView);
    } else if (incoming.type === carveraFrameType.fileView && incoming.payload.length >= 6) {
      current.packets = view.getUint32(0);
      const request = new Uint8Array(4);
      new DataView(request.buffer).setUint32(0, 1);
      frame(carveraFrameType.fileData, request);
    } else if (
      incoming.type === carveraFrameType.fileData &&
      incoming.payload.length >= 4 &&
      current.packets !== undefined
    ) {
      if (view.getUint32(0) !== current.next) {
        return;
      }
      current.chunks.push(incoming.payload.slice(4));
      current.next += 1;
      if (current.next <= current.packets) {
        const request = new Uint8Array(4);
        new DataView(request.buffer).setUint32(0, current.next);
        frame(carveraFrameType.fileData, request);
        return;
      }
      const bytes = Buffer.concat(current.chunks);
      upload = undefined;
      if (createHash('md5').update(bytes).digest('hex') !== current.md5) {
        frame(carveraFrameType.fileCancel);
        return;
      }
      files.set(current.path, `${bytes.toString('utf8')}${damageUpload ? ' ' : ''}`);
      damageUpload = false;
      frame(carveraFrameType.fileEnd);
    }
  };

  // ───────────────────────────── Time ─────────────────────────────

  const feedPlayer = (): void => {
    const current = player;
    if (
      current === undefined ||
      current.aborting ||
      current.suspend !== 'none' ||
      toolWait ||
      feedHold ||
      halt !== undefined
    ) {
      return;
    }
    if (buffer.length > 0) {
      if (queue.length === 0) {
        queue.push(...execute(buffer.shift()!, 'buffer'));
      }
      return;
    }
    if (queue.some((task) => task.source === 'buffer')) {
      return;
    }
    // A line that halts ends the player, so read the condition afresh each time.
    const feeding = (): boolean =>
      queue.length < queueDepth && current.next < current.lines.length && player === current;
    while (feeding()) {
      const index = current.next;
      current.next += 1;
      const tasks = execute(current.lines[index]!, 'file', index + 1);
      for (const task of tasks) {
        task.duration *= current.scale;
        task.line = index + 1;
      }
      queue.push(...tasks);
    }
  };

  // A task's start or finish can halt or wait for a tool, so these read the state afresh.
  const halted = (): boolean => halt !== undefined;
  const waitingForTool = (): boolean => toolWait;

  // oxlint-disable-next-line eslint/complexity -- one simulation step runs the queue and the player's end states
  const step = (span: number): void => {
    clock += span;
    spindle = {
      ...spindle,
      temperature: spindle.temperature + (26 + spindle.current / 1000 - spindle.temperature) * 0.01,
    };
    if (sleeping || halt !== undefined || feedHold || toolWait) {
      return;
    }
    feedPlayer();
    let budget = span;
    while (budget > 0 && queue.length > 0) {
      const task = queue[0]!;
      if (task.elapsed === 0) {
        task.from = position;
        task.start?.();
        if (halted()) {
          return;
        }
        if (task.atc !== undefined) {
          atc = task.atc;
        }
      }
      const used = Math.min(budget, task.duration - task.elapsed);
      task.elapsed += used;
      budget -= used;
      if (task.from !== undefined && task.to !== undefined) {
        const fraction = task.duration === 0 ? 1 : task.elapsed / task.duration;
        position = {
          x: task.from.x + (task.to.x - task.from.x) * fraction,
          y: task.from.y + (task.to.y - task.from.y) * fraction,
          z: task.from.z + (task.to.z - task.from.z) * fraction,
        };
      }
      if (task.line !== undefined && player !== undefined) {
        player.line = task.line;
      }
      if (task.elapsed >= task.duration) {
        queue.shift();
        task.finish?.();
        if (halted()) {
          return;
        }
        feedPlayer();
      }
    }
    const current = player;
    if (current !== undefined && queue.length === 0) {
      if (current.suspend === 'wait') {
        // Drained: save where it stopped; the spindle keeps turning.
        current.suspend = 'pause';
        current.saved = position;
      } else if (current.aborting) {
        player = undefined;
        spindle = { ...spindle, target: 0, current: 0 };
      } else if (
        current.next >= current.lines.length &&
        buffer.length === 0 &&
        current.suspend === 'none' &&
        !waitingForTool()
      ) {
        // End of file: the progress record goes, and nothing says so.
        player = undefined;
        spindle = { ...spindle, target: 0, current: 0 };
      }
    }
  };

  let last = Date.now();
  const timer = setInterval(() => {
    const at = Date.now();
    step((at - last) * speed);
    last = at;
  }, options.tickInterval ?? 20);
  // Boot: the machine homes by itself.
  queue.push(homeTask());

  return {
    open() {
      const pending: Array<Uint8Array<ArrayBuffer>> = [];
      let wake: (() => void) | undefined;
      let ended = false;
      const busy = client !== undefined;
      const end = (): void => {
        ended = true;
        wake?.();
      };
      const self = {
        push(bytes: Uint8Array<ArrayBuffer>) {
          pending.push(bytes);
          wake?.();
        },
        end,
      };
      if (busy) {
        ended = true;
      } else {
        client = self;
      }
      const decoder = createCarveraFrameDecoder();
      const nextChunk = (resolve: () => void): void => {
        wake = resolve;
      };
      return {
        readable: (async function* () {
          for (;;) {
            while (pending.length > 0) {
              yield pending.shift()!;
            }
            if (ended) {
              return;
            }
            // oxlint-disable-next-line eslint/no-await-in-loop -- bytes are delivered in the order they were sent.
            await new Promise<void>(nextChunk);
            wake = undefined;
          }
        })(),
        async write(chunk) {
          if (ended || client !== self) {
            throw new Error('CARVERA_SIMULATOR_CLOSED');
          }
          for (const incoming of decoder.push(chunk)) {
            if (incoming.type === carveraFrameType.realtime) {
              realtime(carveraText(incoming.payload));
            } else if (incoming.type === carveraFrameType.command) {
              for (const line of carveraText(incoming.payload).split('\n')) {
                if (line.trim().length > 0) {
                  command(line);
                }
              }
            } else {
              onUpload(incoming);
            }
          }
        },
        async close() {
          if (client === self) {
            client = undefined;
          }
          end();
        },
      };
    },
    broadcast: () => new TextEncoder().encode(`Carvera Sim,192.0.2.10,2222,${client === undefined ? '0' : '1'}`),
    setCover(closed) {
      // Stock firmware does not stop a job when the cover opens.
      coverClosed = closed;
    },
    setEstop(pressed) {
      estopPressed = pressed;
      if (pressed) {
        haltWith(13);
      }
    },
    sleep() {
      if (state() === 'Idle') {
        sleeping = true;
      }
    },
    drop() {
      client?.end();
      client = undefined;
    },
    play(path) {
      command(`play ${path}`);
    },
    damageNextUpload() {
      damageUpload = true;
    },
    commands: () => [...log],
    files: () => [...files.keys()],
    queued: () => queue.length,
    dispose() {
      clearInterval(timer);
      client?.end();
      client = undefined;
    },
  };
};

const simulatorBindingConfiguration = defineConfiguration({
  id: 'makera.carvera.simulator.binding',
  version: '1.0.0',
  schema: z.object({
    speed: z.number().min(1).max(100).default(1).meta({
      title: 'Demo speed',
      description: 'Simulated seconds per real second; at 1 a program takes about a minute.',
    }),
  }),
  ui: { version: 1, rjsf: {} },
});

const defineSimulator = (input: Readonly<{ simulator?: CarveraSimulator; pollInterval?: number }>) =>
  defineMachine({
    id: 'makera-carvera-simulator',
    name: 'Simulated Carvera',
    version: '1.0.0',
    protocolVersion: 2,
    vendor: 'Makera',
    manifest: carveraManifest(carveraSimulationProfile),
    bindingConfiguration: simulatorBindingConfiguration,
    submissionConfiguration: carveraSubmissionConfiguration,
    async *discover(discovery, runtime) {
      discovery.signal.throwIfAborted();
      const observedAt = runtime.clock.now();
      yield {
        type: 'found',
        candidate: {
          id: 'carvera-simulator',
          name: 'Simulated Carvera',
          endpoint: { transport: 'network', address: 'simulator.invalid', interface: 'simulator' },
          claimedIdentity: { model: 'Carvera' },
          observedAt,
          expiresAt: new Date(Date.parse(observedAt) + 5 * 60_000).toISOString(),
        },
      };
    },
    async connect(connection, runtime) {
      const simulator = input.simulator ?? createCarveraSimulator({ speed: connection.configuration.speed });
      const session = await connectCarveraSession({
        id: connection.candidate.id,
        name: connection.candidate.name,
        manifest: carveraManifest(carveraSimulationProfile),
        clock: runtime.clock,
        async *readArtifact(read) {
          yield* runtime.readArtifact(read);
        },
        log: async (entry) => runtime.log(entry),
        open: async () => simulator.open(),
        ...(input.pollInterval === undefined ? {} : { pollInterval: input.pollInterval }),
      });
      if (input.simulator !== undefined) {
        return session;
      }
      const close = async (): Promise<void> => {
        await session.close();
        simulator.dispose();
      };
      return { ...session, close, dispose: close };
    },
  });

/**
 * The simulator provider around one explicit simulator, so a test can pull its levers.
 * @internal
 * @param input - The simulator every connection uses; omitted means one fresh simulator per connection.
 * @returns The `makera-carvera-simulator` provider factory.
 */
export const defineCarveraSimulatorMachine = (
  input: Readonly<{ simulator?: CarveraSimulator; pollInterval?: number }> = {},
): ReturnType<typeof defineSimulator> => defineSimulator(input);

/** A simulated Carvera C1 behind the real protocol code; no sockets, no hardware. @public */
export const carveraSimulatorMachine = defineCarveraSimulatorMachine();
