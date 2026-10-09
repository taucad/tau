/**
 * A virtual Grbl 1.1h controller on a LongMill MK2 30×30, reached through an in-memory duplex instead of a serial
 * port, so the real session code runs end to end: realtime bytes, character counting, planner timing, status
 * reports in either position mode, alarms, hard limits, homing, probing against a virtual touch plate, jog segments
 * and overrides.
 *
 * ponytail: motion is constant speed per block (no acceleration) and arcs run as their chord; good enough for the
 * session's timing and the person's eye, not for cycle-time estimates.
 *
 * @module
 */

import { defineConfiguration } from '@taucad/runtime/configuration';
import { defineMachine, machineManifestOf } from '@taucad/runtime/machine';
import type { MachineNetworkStream } from '@taucad/runtime/machine';
import { z } from 'zod';

import { grblSubmissionConfiguration } from '#grbl.machine.js';
import {
  grblSimulatorLid,
  grblSimulationProfile,
  grblTravel,
  grblWorkOffsets,
  longMillManifest,
  longMillTravel,
} from '#grbl.manifest.js';
import { grblRealtime } from '#grbl.protocol.js';
import { openGrblSession } from '#grbl.session.js';

type Axis = 'x' | 'y' | 'z';
const axes: readonly Axis[] = ['x', 'y', 'z'];
type Position = Record<Axis, number>;
const zero = (): Position => ({ x: 0, y: 0, z: 0 });

type Block = {
  target: Position;
  /** Millimetres per minute before overrides. */
  feed: number;
  kind: 'rapid' | 'feed' | 'jog' | 'probe';
};

/** Work waiting on the planner or a timer before its line is answered. */
type Pending =
  | Readonly<{ kind: 'sync'; resume: () => void }>
  | { kind: 'dwell'; remaining: number }
  | { kind: 'home'; remaining: number }
  | Readonly<{ kind: 'probe' }>
  | Readonly<{ kind: 'pause' }>;

/** Options for one virtual controller. @internal */
export type VirtualGrblOptions = Readonly<{
  /** Simulated milliseconds per real millisecond. */
  speed?: number;
  /** Real milliseconds between simulation steps. */
  tick?: number;
  /** `$10`: 1 reports machine positions, 0 work positions; add 2 for `Bf:`. */
  statusMask?: number;
  /** Where the gantry physically is at power-up, in homed machine coordinates. */
  physical?: Partial<Position>;
  /** Physical Z of the stock top under the plate; the plate's top is this plus the plate thickness. */
  stockTop?: number;
  plateThickness?: number;
  /** Homing and limit switches fitted (`$21=1`, `$22=1`): the controller powers up locked until homed. A stock LongMill has none. */
  homingSwitches?: boolean;
}>;

const homingRate = 1500;
const rapidRate = 4000;
const plannerBlocks = 15;
const rxBytes = 128;

const settingsOf = (statusMask: number, switches: number): Map<number, number> =>
  new Map([
    [0, 10],
    [1, 255],
    [2, 0],
    [3, 6],
    [4, 0],
    [5, 0],
    [6, 0],
    [10, statusMask],
    [11, 0.01],
    [12, 0.002],
    [13, 0],
    [20, 0],
    [21, switches],
    [22, switches],
    [23, 3],
    [24, 50],
    [25, homingRate],
    [26, 250],
    [27, 1],
    [30, 30_000],
    [31, 0],
    [32, 0],
    [100, 200],
    [101, 200],
    [102, 200],
    [110, rapidRate],
    [111, rapidRate],
    [112, rapidRate],
    [120, 750],
    [121, 750],
    [122, 750],
    [130, 810],
    [131, 855],
    [132, 120],
  ]);

const format = (value: number): string => value.toFixed(3);
const words = /([A-Z])(-?\d*\.?\d+)/gu;

/**
 * The virtual controller. Bytes go in through `receive`; lines come out through `output`.
 * @internal
 */
export class VirtualGrbl {
  public state: 'Idle' | 'Run' | 'Hold' | 'Jog' | 'Home' | 'Alarm' = 'Alarm';
  public holdPhase = 0;
  /** What Grbl believes; the gantry is at `machine + drift`. */
  public machine: Position = zero();
  public drift: Position;
  public isPlatePresent = true;
  public stockTop: number;
  public plateThickness: number;
  public spindle = false;
  public spindleSpeed = 0;
  public flood = false;
  public overrides = { feed: 100, rapid: 100, spindle: 100 };
  public readonly settings: Map<number, number>;
  public readonly offsets: Record<string, Position> = Object.fromEntries(
    grblWorkOffsets.map((offset) => [offset, zero()]),
  );
  /** Bytes Grbl dropped because its serial buffer was full; a correct sender never causes any. */
  public droppedBytes = 0;
  /** Every line processed, in order, for tests. */
  public readonly lines: string[] = [];

  private active = 'G54';
  private g92 = zero();
  private isAbsolute = true;
  private scale = 1;
  private motion = '0';
  private feed = 0;
  private isCritical = false;
  private rx = '';
  private readonly planner: Block[] = [];
  private pending?: Pending;
  private lastProbe: Readonly<{ position: Position; isSuccess: boolean }> = { position: zero(), isSuccess: false };
  private wcoCounter = 0;
  private overrideCounter = 0;
  private timer?: ReturnType<typeof setInterval>;
  private readonly listeners = new Set<(line: string) => void>();
  private readonly speed: number;
  private readonly tickInterval: number;

  public constructor(options: VirtualGrblOptions = {}) {
    this.speed = options.speed ?? 1;
    this.tickInterval = options.tick ?? 10;
    this.settings = settingsOf(options.statusMask ?? 1, options.homingSwitches === true ? 1 : 0);
    this.drift = { x: 400, y: 420, z: -30, ...options.physical };
    this.stockTop = options.stockTop ?? -40;
    this.plateThickness = options.plateThickness ?? 15;
  }

  /**
   * The gantry's physical position.
   * @returns Where it is, in homed machine coordinates.
   */
  public get physical(): Position {
    return { x: this.machine.x + this.drift.x, y: this.machine.y + this.drift.y, z: this.machine.z + this.drift.z };
  }

  /**
   * Listen to every line the controller sends.
   * @param listener - Called with each line, without its newline.
   * @returns Unsubscribe.
   */
  public onLine(listener: (line: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Power up: the welcome line, and the homing lock when homing is enabled (`$22` bit 0, as grblHAL reads it too). */
  public powerOn(): void {
    this.state = (this.settings.get(22) ?? 0) % 2 === 1 ? 'Alarm' : 'Idle';
    this.say("Grbl 1.1h ['$' for help]", ...(this.state === 'Alarm' ? ["[MSG:'$H'|'$X' to unlock]"] : []));
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.step(this.tickInterval * this.speed);
    }, this.tickInterval);
  }

  /** Stop simulating; a closed port leaves the machine where it is. */
  public powerOff(): void {
    clearInterval(this.timer);
  }

  /**
   * Bytes from the sender: realtime bytes act at once; the rest fill the 128-byte serial buffer.
   * @param bytes - The bytes.
   */
  public receive(bytes: Uint8Array<ArrayBuffer>): void {
    for (const byte of bytes) {
      if (this.realtime(byte)) {
        continue;
      }
      if (this.isCritical) {
        continue;
      }
      if (this.rx.length >= rxBytes) {
        this.droppedBytes += 1;
        continue;
      }
      this.rx += String.fromCodePoint(byte);
    }
    this.process();
  }

  /**
   * Press a button on the LongBoard's lid.
   * @param button - Play, Pause or Stop.
   */
  public press(button: 'start' | 'hold' | 'reset'): void {
    this.realtime(
      button === 'start' ? grblRealtime.cycleStart : button === 'hold' ? grblRealtime.feedHold : grblRealtime.reset,
    );
    this.process();
  }

  /**
   * Whether a line waits on the planner or a timer.
   * @returns True while one does.
   */
  private get isWaiting(): boolean {
    return this.pending !== undefined;
  }

  /**
   * The work coordinate offset in force: the active system plus `G92`.
   * @returns The offset, millimetres.
   */
  private get workOffset(): Position {
    const origin = this.offsets[this.active] ?? zero();
    return { x: origin.x + this.g92.x, y: origin.y + this.g92.y, z: origin.z + this.g92.z };
  }

  /**
   * Whether the bit touches the plate.
   * @returns True while the plate is present and the bit is on it.
   */
  private get isTouching(): boolean {
    return this.isPlatePresent && this.physical.z <= this.stockTop + this.plateThickness + 1e-9;
  }

  private say(...lines: string[]): void {
    for (const line of lines) {
      for (const listener of this.listeners) {
        listener(line);
      }
    }
  }

  // oxlint-disable-next-line eslint/complexity -- One switch over the realtime bytes Grbl 1.1 honours.
  private realtime(byte: number): boolean {
    if (this.isCritical && byte !== grblRealtime.reset) {
      return (
        byte >= 0x80 ||
        byte === grblRealtime.status ||
        byte === grblRealtime.feedHold ||
        byte === grblRealtime.cycleStart
      );
    }
    switch (byte) {
      case grblRealtime.status: {
        if (this.state !== 'Home') {
          this.say(this.statusReport());
        }
        return true;
      }
      case grblRealtime.feedHold: {
        if (this.state === 'Run' || this.state === 'Jog') {
          this.state = this.state === 'Jog' ? 'Jog' : 'Hold';
          this.holdPhase = 1;
          if (this.state === 'Jog') {
            this.cancelJog();
          }
        } else if (this.state === 'Idle') {
          this.state = 'Hold';
          this.holdPhase = 0;
        }
        return true;
      }
      case grblRealtime.cycleStart: {
        if (this.state === 'Hold' && this.holdPhase === 0) {
          this.state = this.planner.length > 0 || this.pending?.kind === 'dwell' ? 'Run' : 'Idle';
          if (this.pending?.kind === 'pause') {
            this.answer();
          }
        }
        return true;
      }
      case grblRealtime.reset: {
        this.reset();
        return true;
      }
      case grblRealtime.jogCancel: {
        if (this.state === 'Jog') {
          this.cancelJog();
        }
        return true;
      }
      case grblRealtime.floodToggle: {
        this.flood = !this.flood;
        this.overrideCounter = 0;
        return true;
      }
      default: {
        return this.override(byte);
      }
    }
  }

  private override(byte: number): boolean {
    const steps: Readonly<Record<number, readonly [keyof VirtualGrbl['overrides'], number | 'reset']>> = {
      [grblRealtime.feedReset]: ['feed', 'reset'],
      [grblRealtime.feedUp10]: ['feed', 10],
      [grblRealtime.feedDown10]: ['feed', -10],
      [grblRealtime.feedUp1]: ['feed', 1],
      [grblRealtime.feedDown1]: ['feed', -1],
      [grblRealtime.spindleReset]: ['spindle', 'reset'],
      [grblRealtime.spindleUp10]: ['spindle', 10],
      [grblRealtime.spindleDown10]: ['spindle', -10],
      [grblRealtime.spindleUp1]: ['spindle', 1],
      [grblRealtime.spindleDown1]: ['spindle', -1],
    };
    const rapid: Readonly<Record<number, number>> = {
      [grblRealtime.rapid100]: 100,
      [grblRealtime.rapid50]: 50,
      [grblRealtime.rapid25]: 25,
    };
    const step = steps[byte];
    if (step !== undefined) {
      const [which, change] = step;
      this.overrides[which] = change === 'reset' ? 100 : Math.min(200, Math.max(10, this.overrides[which] + change));
    } else if (rapid[byte] === undefined) {
      // Any other byte at or above 0x80 is discarded; below it is a character.
      return byte >= 0x80;
    } else {
      this.overrides.rapid = rapid[byte];
    }
    this.overrideCounter = 0;
    return true;
  }

  private cancelJog(): void {
    // Decelerate and purge the jog blocks.
    const current = this.planner[0];
    if (current?.kind === 'jog') {
      this.advance(current, 20);
    }
    this.planner.length = 0;
    this.state = 'Idle';
    this.holdPhase = 0;
  }

  private reset(): void {
    const isMoving =
      this.state === 'Run' ||
      this.state === 'Jog' ||
      this.state === 'Home' ||
      (this.state === 'Hold' && this.holdPhase === 1);
    if (isMoving) {
      this.say(this.state === 'Home' ? 'ALARM:6' : 'ALARM:3');
      this.drift = { x: this.drift.x + 0.37, y: this.drift.y - 0.21, z: this.drift.z };
    }
    const wasAlarm = this.state === 'Alarm' || isMoving;
    this.isCritical = false;
    this.rx = '';
    this.planner.length = 0;
    this.pending = undefined;
    this.spindle = false;
    this.flood = false;
    this.overrides = { feed: 100, rapid: 100, spindle: 100 };
    this.active = 'G54';
    this.g92 = zero();
    this.isAbsolute = true;
    this.scale = 1;
    this.motion = '0';
    this.state = wasAlarm ? 'Alarm' : 'Idle';
    this.holdPhase = 0;
    this.wcoCounter = 0;
    this.overrideCounter = 0;
    this.say("Grbl 1.1h ['$' for help]", ...(wasAlarm ? ["[MSG:'$H'|'$X' to unlock]"] : []));
  }

  private alarm(code: number, isCritical: boolean): void {
    this.state = 'Alarm';
    this.holdPhase = 0;
    this.planner.length = 0;
    this.pending = undefined;
    this.spindle = false;
    this.isCritical = isCritical;
    this.say(`ALARM:${String(code)}`, ...(isCritical ? ['[MSG:Reset to continue]'] : []));
    if (isCritical) {
      this.rx = '';
    }
  }

  // oxlint-disable-next-line eslint/complexity -- One branch per optional status field.
  private statusReport(): string {
    const mask = this.settings.get(10) ?? 1;
    const offset = this.workOffset;
    const position =
      mask % 2 === 1
        ? this.machine
        : { x: this.machine.x - offset.x, y: this.machine.y - offset.y, z: this.machine.z - offset.z };
    const block = this.planner[0];
    const isMoving = this.state === 'Run' || this.state === 'Jog' || (this.state === 'Hold' && this.holdPhase === 1);
    const feed = isMoving && block !== undefined ? this.rate(block) : 0;
    const fields = [
      this.state === 'Hold' ? `Hold:${String(this.holdPhase)}` : this.state,
      `${mask % 2 === 1 ? 'MPos' : 'WPos'}:${axes.map((axis) => format(position[axis])).join(',')}`,
      ...(Math.floor(mask / 2) % 2 === 1
        ? [`Bf:${String(plannerBlocks - this.planner.length)},${String(rxBytes - this.rx.length)}`]
        : []),
      `FS:${String(Math.round(feed))},${String(this.spindle ? this.spindleSpeed : 0)}`,
    ];
    const pins = [
      ...axes
        .filter(
          (axis) =>
            this.physical[axis] < longMillTravel[axis].min - 1e-9 ||
            this.physical[axis] > longMillTravel[axis].max + 1e-9,
        )
        .map((axis) => axis.toUpperCase()),
      ...(this.isTouching ? ['P'] : []),
    ].join('');
    if (pins.length > 0) {
      fields.push(`Pn:${pins}`);
    }
    if (this.wcoCounter <= 0) {
      fields.push(`WCO:${axes.map((axis) => format(offset[axis])).join(',')}`);
      this.wcoCounter = isMoving ? 30 : 10;
    } else {
      this.wcoCounter -= 1;
      if (this.overrideCounter <= 0) {
        fields.push(
          `Ov:${String(this.overrides.feed)},${String(this.overrides.rapid)},${String(this.overrides.spindle)}`,
        );
        const accessories = `${this.spindle ? 'S' : ''}${this.flood ? 'F' : ''}`;
        if (accessories.length > 0) {
          fields.push(`A:${accessories}`);
        }
        this.overrideCounter = isMoving ? 20 : 10;
      } else {
        this.overrideCounter -= 1;
      }
    }
    return `<${fields.join('|')}>`;
  }

  /** Read lines from the serial buffer while the planner has room and nothing waits. */
  private process(): void {
    while (this.pending === undefined && !this.isCritical && this.planner.length < plannerBlocks) {
      const end = this.rx.indexOf('\n');
      if (end === -1) {
        return;
      }
      const line = this.rx.slice(0, end).replaceAll(/\s/gu, '').toUpperCase();
      this.rx = this.rx.slice(end + 1);
      if (line.length === 0) {
        this.say('ok');
        continue;
      }
      this.lines.push(line);
      const reply = line.startsWith('$') ? this.system(line) : this.gcode(line);
      if (reply !== undefined) {
        this.say(reply);
      }
    }
  }

  /**
   * Answer the line that was waiting.
   * @param reply - The answer, `ok` unless the line failed.
   */
  private answer(reply = 'ok'): void {
    this.pending = undefined;
    this.say(reply);
    this.process();
  }

  private settingsLines(): string[] {
    return [...this.settings].map(([id, value]) => `$${String(id)}=${String(value)}`);
  }

  // oxlint-disable-next-line eslint/complexity -- One switch over Grbl 1.1's $ commands.
  private system(line: string): string | undefined {
    const isIdle = this.state === 'Idle' || this.state === 'Alarm';
    if (line === '$$') {
      this.say(...this.settingsLines());
      return 'ok';
    }
    if (line === '$#') {
      this.say(
        ...grblWorkOffsets.map(
          (name) => `[${name}:${axes.map((axis) => format(this.offsets[name]?.[axis] ?? 0)).join(',')}]`,
        ),
        '[G28:0.000,0.000,0.000]',
        '[G30:0.000,0.000,0.000]',
        `[G92:${axes.map((axis) => format(this.g92[axis])).join(',')}]`,
        '[TLO:0.000]',
        `[PRB:${axes.map((axis) => format(this.lastProbe.position[axis])).join(',')}:${this.lastProbe.isSuccess ? '1' : '0'}]`,
      );
      return 'ok';
    }
    if (line === '$G') {
      this.say(
        `[GC:G${this.motion} ${this.active} G17 ${this.scale === 1 ? 'G21' : 'G20'} ${this.isAbsolute ? 'G90' : 'G91'} G94 M${this.spindle ? '3' : '5'} M${this.flood ? '8' : '9'} T0 F${String(this.feed)} S${String(this.spindleSpeed)}]`,
      );
      return 'ok';
    }
    if (line === '$I') {
      this.say('[VER:1.1h.20190830:LongMill]', '[OPT:V,15,128]');
      return 'ok';
    }
    if (line === '$X') {
      if (this.state === 'Alarm') {
        this.state = 'Idle';
        this.say('[MSG:Caution: Unlocked]');
      }
      return 'ok';
    }
    if (line === '$H') {
      if (!isIdle) {
        return 'error:8';
      }
      const distance = Math.hypot(this.physical.x, this.physical.y, this.physical.z);
      this.state = 'Home';
      this.pending = { kind: 'home', remaining: (distance / homingRate) * 60_000 + 500 };
      return undefined;
    }
    if (line.startsWith('$J=')) {
      return this.jog(line.slice(3));
    }
    const setting = /^\$(\d+)=(-?[\d.]+)$/u.exec(line);
    if (setting) {
      if (!isIdle) {
        return 'error:8';
      }
      this.settings.set(Number(setting[1]), Number(setting[2]));
      return 'ok';
    }
    return 'error:3';
  }

  private jog(body: string): string {
    if (this.state !== 'Idle' && this.state !== 'Jog') {
      return this.state === 'Alarm' ? 'error:9' : 'error:8';
    }
    const values = new Map(
      [...body.matchAll(words)].map((match) => [
        `${match[1] ?? ''}${match[1] === 'G' ? (match[2] ?? '') : ''}`,
        Number(match[2]),
      ]),
    );
    const feed = values.get('F');
    if (feed === undefined || feed <= 0) {
      return 'error:16';
    }
    const isRelative = values.has('G91');
    const isMachine = values.has('G53');
    const scale = values.has('G20') ? 25.4 : 1;
    const start = this.planner.at(-1)?.target ?? this.machine;
    const offset = isMachine ? zero() : this.workOffset;
    const target = { ...start };
    for (const axis of axes) {
      const value = values.get(axis.toUpperCase());
      if (value !== undefined) {
        target[axis] = isRelative ? start[axis] + value * scale : value * scale + offset[axis];
      }
    }
    // Soft limits follow `$130`–`$132`; the hard-limit switches stay where the LongMill's frame puts them.
    const travel = grblTravel(this.settings);
    if (
      this.settings.get(20) === 1 &&
      axes.some((axis) => target[axis] < travel[axis].min || target[axis] > travel[axis].max)
    ) {
      return 'error:15';
    }
    this.planner.push({ target, feed: feed * scale, kind: 'jog' });
    this.state = 'Jog';
    return 'ok';
  }

  // oxlint-disable-next-line eslint/complexity, max-lines-per-function -- One pass over a G-code line, as Grbl's parser does.
  private gcode(line: string): string | undefined {
    if (this.state === 'Alarm' || this.state === 'Jog') {
      return 'error:9';
    }
    if (line.length > 79) {
      return 'error:11';
    }
    const parsed = [...line.matchAll(words)].map((match) => ({ letter: match[1] ?? '', value: Number(match[2]) }));
    const values = new Map(parsed.map((word) => [word.letter, word.value]));
    let isMachine = false;
    let sync: (() => void) | undefined;
    let dwell: number | undefined;
    let isProbe = false;
    let isPause = false;
    let isEnd = false;
    let l10: number | undefined;
    for (const { letter, value } of parsed) {
      const code = String(value);
      if (letter === 'G' && /^5[4-9]$/u.test(code)) {
        const offset = `G${code}`;
        sync = () => {
          this.active = offset;
          this.wcoCounter = 0;
        };
        continue;
      }
      switch (letter) {
        case 'G': {
          switch (code) {
            case '0':
            case '1':
            case '2':
            case '3': {
              this.motion = code;
              break;
            }
            case '38.2': {
              isProbe = true;
              break;
            }
            case '4': {
              dwell = (values.get('P') ?? 0) * 1000;
              break;
            }
            case '10': {
              l10 = values.get('L');
              break;
            }
            case '20':
            case '21': {
              this.scale = code === '20' ? 25.4 : 1;
              break;
            }
            case '90':
            case '91': {
              this.isAbsolute = code === '90';
              break;
            }
            case '53': {
              isMachine = true;
              break;
            }
            case '92': {
              const { machine } = this;
              sync = () => {
                for (const axis of axes) {
                  const wanted = values.get(axis.toUpperCase());
                  if (wanted !== undefined) {
                    this.g92[axis] = machine[axis] - (this.offsets[this.active]?.[axis] ?? 0) - wanted * this.scale;
                  }
                }
                this.wcoCounter = 0;
              };
              break;
            }
            case '17':
            case '40':
            case '49':
            case '61':
            case '80':
            case '94':
            case '43.1':
            case '91.1': {
              break;
            }
            default: {
              return 'error:20';
            }
          }
          break;
        }
        case 'M': {
          switch (code) {
            case '3':
            case '4':
            case '5':
            case '7':
            case '8':
            case '9': {
              const isOn = code !== '5' && code !== '9';
              const isSpindle = Number(code) <= 5;
              sync = () => {
                if (isSpindle) {
                  this.spindle = isOn;
                } else {
                  this.flood = isOn;
                }
                this.overrideCounter = 0;
              };
              break;
            }
            case '0': {
              isPause = true;
              break;
            }
            case '2':
            case '30': {
              isEnd = true;
              break;
            }
            case '1': {
              break;
            }
            default: {
              return 'error:20';
            }
          }
          break;
        }
        case 'F': {
          this.feed = value * this.scale;
          break;
        }
        case 'S': {
          this.spindleSpeed = value;
          break;
        }
        default: {
          if (!'XYZIJKPLNTR'.includes(letter)) {
            return 'error:20';
          }
        }
      }
    }
    if (l10 !== undefined) {
      const index = values.get('P') ?? 0;
      const name = index === 0 ? this.active : grblWorkOffsets[index - 1];
      if (name === undefined || (l10 !== 2 && l10 !== 20)) {
        return 'error:28';
      }
      return this.whenEmpty(() => {
        const origin = this.offsets[name]!;
        for (const axis of axes) {
          const wanted = values.get(axis.toUpperCase());
          if (wanted !== undefined) {
            origin[axis] = l10 === 2 ? wanted * this.scale : this.machine[axis] - this.g92[axis] - wanted * this.scale;
          }
        }
        this.wcoCounter = 0;
      });
    }
    if (dwell !== undefined) {
      const time = dwell;
      return this.whenEmpty(() => {
        this.pending = { kind: 'dwell', remaining: time };
      }, true);
    }
    const hasAxis = axes.some((axis) => values.has(axis.toUpperCase()));
    if (hasAxis) {
      const start = this.planner.at(-1)?.target ?? this.machine;
      const offset = isMachine ? zero() : this.workOffset;
      const target = { ...start };
      for (const axis of axes) {
        const value = values.get(axis.toUpperCase());
        if (value !== undefined) {
          target[axis] =
            !isMachine && !this.isAbsolute ? start[axis] + value * this.scale : value * this.scale + offset[axis];
        }
      }
      if (isProbe) {
        // Grbl empties the planner before a probe cycle, then checks the pin.
        return this.whenEmpty(() => {
          if (this.isTouching) {
            this.alarm(4, false);
            return;
          }
          this.planner.push({ target, feed: this.feed, kind: 'probe' });
          this.state = 'Run';
          this.pending = { kind: 'probe' };
        }, true);
      }
      if (this.motion !== '0' && this.feed <= 0) {
        return 'error:22';
      }
      sync?.();
      this.planner.push({
        target,
        feed: this.motion === '0' ? rapidRate : this.feed,
        kind: this.motion === '0' ? 'rapid' : 'feed',
      });
      if (this.state === 'Idle') {
        this.state = 'Run';
      }
      return 'ok';
    }
    if (isPause || isEnd) {
      return this.whenEmpty(() => {
        if (isPause) {
          this.state = 'Hold';
          this.holdPhase = 0;
          this.pending = { kind: 'pause' };
          return;
        }
        this.active = 'G54';
        this.isAbsolute = true;
        this.spindle = false;
        this.flood = false;
        this.say('[MSG:Pgm End]');
      }, isPause);
    }
    if (sync !== undefined) {
      return this.whenEmpty(sync);
    }
    return 'ok';
  }

  /**
   * Run something once the planner has emptied, as Grbl synchronizes before modal changes that affect motion.
   * @param then - What to do.
   * @param isDeferred - Whether `then` sets its own pending work that answers the line later.
   * @returns The reply now, or undefined when the line is answered later.
   */
  private whenEmpty(then: () => void, isDeferred = false): string | undefined {
    if (this.planner.length === 0) {
      then();
      return this.isWaiting ? undefined : 'ok';
    }
    this.pending = {
      kind: 'sync',
      resume: () => {
        this.pending = undefined;
        then();
        if (!isDeferred || !this.isWaiting) {
          this.answer();
        }
      },
    };
    return undefined;
  }

  private rate(block: Block): number {
    switch (block.kind) {
      case 'rapid': {
        return (rapidRate * this.overrides.rapid) / 100;
      }
      case 'jog': {
        return Math.min(block.feed, rapidRate);
      }
      default: {
        return (Math.min(block.feed, rapidRate) * this.overrides.feed) / 100;
      }
    }
  }

  /**
   * Move along a block for some simulated time.
   * @param block - The block being executed.
   * @param milliseconds - Simulated time to move for.
   * @returns Whether the block finished.
   */
  private advance(block: Block, milliseconds: number): boolean {
    const distance = Math.hypot(...axes.map((axis) => block.target[axis] - this.machine[axis]));
    const travel = (this.rate(block) / 60_000) * milliseconds;
    if (travel >= distance) {
      this.machine = { ...block.target };
      return true;
    }
    const fraction = travel / distance;
    const next = { ...this.machine };
    for (const axis of axes) {
      next[axis] += (block.target[axis] - this.machine[axis]) * fraction;
    }
    this.machine = next;
    return false;
  }

  // oxlint-disable-next-line eslint/complexity -- One simulation step over every timed thing Grbl does.
  private step(milliseconds: number): void {
    const { pending } = this;
    if (pending?.kind === 'home') {
      pending.remaining -= milliseconds;
      if (pending.remaining <= 0) {
        this.machine = zero();
        this.drift = zero();
        this.state = 'Idle';
        this.answer();
      }
      return;
    }
    if (pending?.kind === 'dwell' && this.state !== 'Hold') {
      pending.remaining -= milliseconds;
      if (pending.remaining <= 0) {
        this.answer();
      }
    }
    const isMoving = this.state === 'Run' || this.state === 'Jog' || (this.state === 'Hold' && this.holdPhase === 1);
    const block = this.planner[0];
    if (isMoving && block !== undefined) {
      // A hold decelerates over about a tenth of a second at a reduced pace.
      const isDone = this.advance(block, this.state === 'Hold' ? milliseconds / 2 : milliseconds);
      if (block.kind === 'probe' && this.isTouching) {
        this.planner.shift();
        this.lastProbe = { position: { ...this.machine }, isSuccess: true };
        this.state = 'Idle';
        this.say(`[PRB:${axes.map((axis) => format(this.machine[axis])).join(',')}:1]`);
        this.answer();
        return;
      }
      if (isDone) {
        this.planner.shift();
        if (block.kind === 'probe') {
          this.lastProbe = { position: { ...this.machine }, isSuccess: false };
          this.say(`[PRB:${axes.map((axis) => format(this.machine[axis])).join(',')}:0]`);
          this.alarm(5, false);
          this.say('ok');
          this.process();
          return;
        }
      }
      if (this.settings.get(21) === 1) {
        const { physical } = this;
        const axis = axes.find(
          (candidate) =>
            physical[candidate] < longMillTravel[candidate].min - 1e-9 ||
            physical[candidate] > longMillTravel[candidate].max + 1e-9,
        );
        if (axis !== undefined) {
          this.alarm(1, true);
          return;
        }
      }
    }
    if (this.state === 'Hold' && this.holdPhase === 1) {
      this.holdPhase = 0;
    }
    if ((this.state === 'Run' || this.state === 'Jog') && this.planner.length === 0 && this.pending?.kind !== 'dwell') {
      this.state = 'Idle';
    }
    if (this.pending?.kind === 'sync' && this.planner.length === 0) {
      this.pending.resume();
    }
    this.process();
  }
}

/**
 * An in-memory duplex between a session and a virtual controller, in place of a serial port.
 * @internal
 * @param controller - The virtual controller; it powers on when the stream opens, as an Uno resets.
 * @returns The stream the session reads and writes.
 */
export const createVirtualGrblStream = (controller: VirtualGrbl): MachineNetworkStream => {
  const encoder = new TextEncoder();
  const queue: Array<Uint8Array<ArrayBuffer>> = [];
  const port: { isClosed: boolean; wake?: () => void } = { isClosed: false };
  const unsubscribe = controller.onLine((line) => {
    queue.push(encoder.encode(`${line}\r\n`));
    port.wake?.();
  });
  const arrival = async (): Promise<void> =>
    new Promise<void>((resolve) => {
      port.wake = resolve;
    });
  // Opening the port resets the Uno behind it.
  setTimeout(() => {
    controller.powerOn();
  }, 20);
  return {
    readable: {
      async *[Symbol.asyncIterator]() {
        while (!port.isClosed) {
          const chunk = queue.shift();
          if (chunk === undefined) {
            // oxlint-disable-next-line eslint/no-await-in-loop -- bytes arrive one write at a time.
            await arrival();
            continue;
          }
          yield chunk;
        }
      },
    },
    async write(chunk) {
      if (!port.isClosed) {
        controller.receive(chunk);
      }
    },
    async close() {
      port.isClosed = true;
      unsubscribe();
      controller.powerOff();
      port.wake?.();
    },
  };
};

/** The simulator's binding: which LongMill to simulate. */
const bindingConfiguration = defineConfiguration({
  id: 'grbl-simulator.machine.binding',
  version: '1.0.0',
  schema: z.object({
    logicalId: z.string().min(1).max(64),
    homingSwitches: z.boolean().default(false).meta({
      title: 'Homing switches',
      description: 'Simulate the optional homing kit. A stock LongMill has none and works from the work zero.',
    }),
  }),
  ui: { version: 1, rjsf: {} },
});

const qualification = { status: 'qualified', profileId: grblSimulationProfile.id } as const;
const manifest = longMillManifest(qualification, [grblSimulatorLid(qualification)]);

/**
 * A demonstration program for the simulator: a 100 × 60 mm sign with a rounded border pocket, a bit change and an
 * engraved circle. At the simulator's default speed it runs in about a minute.
 * @returns The G-code.
 * @public
 */
export const grblDemoProgram = (): string => {
  const lines = ['(Tau demo sign)', 'G21 G90 G17 G94', 'T1 M6 (1/4" flat end mill)', 'S18000 M3', 'M8', 'G0 Z5'];
  for (const depth of [1, 2, 3]) {
    lines.push('G0 X0 Y0', `G1 Z-${String(depth)} F300`, 'G1 X100 F1500', 'G1 Y60', 'G1 X0', 'G1 Y0', 'G0 Z5');
  }
  for (let row = 10; row <= 50; row += 5) {
    lines.push(`G0 X10 Y${String(row)}`, 'G1 Z-1 F300', 'G1 X90 F1500', 'G0 Z5');
  }
  lines.push(
    'M5',
    'T2 M6 (1/8" ball end mill)',
    'S18000 M3',
    'G0 X70 Y30',
    'G1 Z-0.5 F200',
    'G2 X70 Y30 I-20 J0 F1200',
    'G0 Z5',
    'M5',
    'M9',
    'G0 X0 Y0',
    'M30',
  );
  return `${lines.join('\n')}\n`;
};

/** Options the simulated machine connects with. @internal */
export const grblSimulatorDefaults: Required<Pick<VirtualGrblOptions, 'speed' | 'tick'>> &
  Readonly<{ pollInterval: number }> = {
  speed: 2,
  tick: 10,
  pollInterval: 100,
};

/**
 * A simulated LongMill MK2 on a virtual Grbl 1.1h controller: the real session over an in-memory duplex, every
 * action qualified under the `simulation` profile. Press Play on its lid with the `grbl-simulator.lid.press` action.
 * @public
 */
export const grblSimulatorMachine = defineMachine({
  id: 'grbl-simulator',
  name: 'Simulated LongMill MK2 (Grbl 1.1h)',
  version: '1.0.0',
  protocolVersion: 2,
  vendor: 'Sienci Labs',
  manifest,
  bindingConfiguration,
  submissionConfiguration: grblSubmissionConfiguration,
  async *discover(_input, runtime) {
    const observedAt = runtime.clock.now();
    yield {
      type: 'found',
      candidate: {
        id: 'grbl-simulator',
        name: 'Simulated LongMill MK2',
        // RFC 6761 `.invalid`: names no real port; the controller is in memory.
        endpoint: { transport: 'serial', path: 'simulator.invalid' },
        claimedIdentity: { serial: 'simulated-longmill', model: 'longmill-mk2-30x30' },
        observedAt,
        expiresAt: new Date(Date.parse(observedAt) + 30_000).toISOString(),
      },
    };
  },
  async connect(input, runtime) {
    const controller = new VirtualGrbl({
      speed: grblSimulatorDefaults.speed,
      tick: grblSimulatorDefaults.tick,
      homingSwitches: input.configuration.homingSwitches,
    });
    return openGrblSession({
      stream: createVirtualGrblStream(controller),
      runtime,
      manifest: machineManifestOf(manifest, grblSubmissionConfiguration.manifest),
      // The host binds the claimed serial as the physical identity; the session must report the same.
      id: input.candidate.claimedIdentity.serial ?? input.candidate.id,
      name: input.candidate.name,
      pollInterval: grblSimulatorDefaults.pollInterval,
      lid: (button) => {
        controller.press(button);
      },
      signal: input.signal,
    });
  },
});
