/**
 * The Grbl 1.1 serial protocol: line framing, response parsing, realtime bytes, character-counting streaming and the
 * code tables. Pure: no I/O, no timers. grblHAL speaks the same protocol with more states and codes; its extra
 * codes fall back to a generic sentence here.
 *
 * Sources: gnea/grbl 1.1h `doc/markdown/interface.md`, `doc/csv/{error,alarm}_codes_en_US.csv` and `grbl/report.c`
 * (lanes/grbl-router §3.1–§3.8 in the machine-actions research).
 *
 * @module
 */

/** Realtime command bytes: acted on as soon as they arrive, never buffered and never acknowledged. @internal */
export const grblRealtime = Object.freeze({
  status: 0x3f,
  cycleStart: 0x7e,
  feedHold: 0x21,
  reset: 0x18,
  jogCancel: 0x85,
  feedReset: 0x90,
  feedUp10: 0x91,
  feedDown10: 0x92,
  feedUp1: 0x93,
  feedDown1: 0x94,
  rapid100: 0x95,
  rapid50: 0x96,
  rapid25: 0x97,
  spindleReset: 0x99,
  spindleUp10: 0x9a,
  spindleDown10: 0x9b,
  spindleUp1: 0x9c,
  spindleDown1: 0x9d,
  spindleStop: 0x9e,
  floodToggle: 0xa0,
  mistToggle: 0xa1,
});

/** Bytes Grbl 1.1 receives into its serial buffer; character counting must never exceed it. @internal */
export const grblRxBufferBytes = 128;
/** Characters per line Grbl 1.1 accepts, including the newline; longer lines get `error:11`. @internal */
export const grblMaximumLineLength = 80;

/** One parsed `<…>` status report. Positions are in the controller's report unit (`$13`). @internal */
export type GrblStatus = Readonly<{
  /** `Idle`, `Run`, `Hold`, `Jog`, `Home`, `Alarm`, `Door`, `Check`, `Sleep`, and grblHAL's `Tool`. */
  state: string;
  substate?: number;
  /** The raw state token, `Hold:0`. */
  native: string;
  machine?: readonly number[];
  work?: readonly number[];
  workOffset?: readonly number[];
  /** Planner blocks and serial bytes free. */
  buffer?: Readonly<{ blocks: number; bytes: number }>;
  line?: number;
  feed?: number;
  spindle?: number;
  /** Input pins active now: `X`, `Y`, `Z` limits, `P` probe, `D` door, `H` hold, `R` reset, `S` start. */
  pins?: string;
  overrides?: Readonly<{ feed: number; rapid: number; spindle: number }>;
  /** Output states: `S` spindle clockwise, `C` counterclockwise, `F` flood, `M` mist. Present with `Ov:`. */
  accessories?: string;
}>;

/** One line the controller sent. @internal */
export type GrblMessage =
  | Readonly<{ type: 'ok' }>
  | Readonly<{ type: 'error'; code: number }>
  | Readonly<{ type: 'alarm'; code: number }>
  | Readonly<{ type: 'welcome'; firmware: string; version: string }>
  | Readonly<{ type: 'status'; status: GrblStatus }>
  | Readonly<{ type: 'message'; text: string }>
  | Readonly<{ type: 'parser'; words: readonly string[] }>
  | Readonly<{ type: 'probe'; position: readonly number[]; isSuccess: boolean }>
  | Readonly<{ type: 'offset'; name: string; values: readonly number[] }>
  | Readonly<{ type: 'setting'; id: number; value: number }>
  | Readonly<{ type: 'feedback'; key: string; value: string }>
  | Readonly<{ type: 'other'; text: string }>;

const numbers = (text: string): number[] => text.split(',').map(Number);

// oxlint-disable-next-line eslint/complexity -- One case per status report field.
const parseStatus = (body: string): GrblStatus => {
  const [native = '', ...fields] = body.split('|');
  const [state = native, sub] = native.split(':');
  const status: {
    -readonly [Key in keyof GrblStatus]: GrblStatus[Key];
  } = { state, native, ...(sub === undefined ? {} : { substate: Number(sub) }) };
  for (const field of fields) {
    const separator = field.indexOf(':');
    const key = field.slice(0, separator);
    const value = field.slice(separator + 1);
    switch (key) {
      case 'MPos': {
        status.machine = numbers(value);
        break;
      }
      case 'WPos': {
        status.work = numbers(value);
        break;
      }
      case 'WCO': {
        status.workOffset = numbers(value);
        break;
      }
      case 'Bf': {
        const [blocks = 0, bytes = 0] = numbers(value);
        status.buffer = { blocks, bytes };
        break;
      }
      case 'Ln': {
        status.line = Number(value);
        break;
      }
      case 'F': {
        status.feed = Number(value);
        break;
      }
      case 'FS': {
        const [feed = 0, spindle = 0] = numbers(value);
        status.feed = feed;
        status.spindle = spindle;
        break;
      }
      case 'Pn': {
        status.pins = value;
        break;
      }
      case 'Ov': {
        const [feed = 100, rapid = 100, spindle = 100] = numbers(value);
        status.overrides = { feed, rapid, spindle };
        // `A:` is omitted when every output is off, and always follows `Ov:` when any is on.
        status.accessories ??= '';
        break;
      }
      case 'A': {
        status.accessories = value;
        break;
      }
      default: {
        break;
      }
    }
  }
  return status;
};

/**
 * Parse one line from the controller, without its line ending.
 * @internal
 * @param line - One received line.
 * @returns What the line says.
 */
export const parseGrblLine = (line: string): GrblMessage => {
  const text = line.trim();
  if (text === 'ok') {
    return { type: 'ok' };
  }
  const coded = /^(error|ALARM):(\d+)$/u.exec(text);
  if (coded) {
    return { type: coded[1] === 'error' ? 'error' : 'alarm', code: Number(coded[2]) };
  }
  if (text.startsWith('<') && text.endsWith('>')) {
    return { type: 'status', status: parseStatus(text.slice(1, -1)) };
  }
  const welcome = /^(Grbl|GrblHAL) (\S+)/u.exec(text);
  if (welcome) {
    return { type: 'welcome', firmware: welcome[1] ?? 'Grbl', version: welcome[2] ?? '' };
  }
  const setting = /^\$(\d+)=(-?[\d.]+)/u.exec(text);
  if (setting) {
    return { type: 'setting', id: Number(setting[1]), value: Number(setting[2]) };
  }
  const bracket = /^\[([A-Z0-9.]+):(.*)\]$/u.exec(text);
  if (bracket) {
    const key = bracket[1] ?? '';
    const value = bracket[2] ?? '';
    if (key === 'MSG') {
      return { type: 'message', text: value };
    }
    if (key === 'GC') {
      return { type: 'parser', words: value.split(' ').filter(Boolean) };
    }
    if (key === 'PRB') {
      const [position = '', success = '0'] = value.split(':');
      return { type: 'probe', position: numbers(position), isSuccess: success === '1' };
    }
    if (/^(?:G5[4-9]|G28|G30|G92|TLO)$/u.test(key)) {
      return { type: 'offset', name: key, values: numbers(value) };
    }
    return { type: 'feedback', key, value };
  }
  return { type: 'other', text };
};

/**
 * Split a byte stream into lines. Grbl ends lines with `\r\n`; bytes are ASCII.
 * @internal
 * @returns A function that takes the next chunk and returns the complete lines it finished.
 */
export const createGrblLineSplitter = (): ((chunk: Uint8Array<ArrayBuffer>) => string[]) => {
  const decoder = new TextDecoder('latin1');
  let pending = '';
  return (chunk) => {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    return lines.map((line) => line.replace(/\r$/u, '')).filter((line) => line.length > 0);
  };
};

/**
 * Character counting: keep the bytes sent but not yet acknowledged within the controller's serial buffer, so the
 * planner never starves and the buffer never overflows (Grbl drops overflowing bytes without a word).
 * @internal
 */
export class GrblCharacterCounter {
  /** The controller's serial buffer size. Grbl 1.1 has 128 bytes; grblHAL reports its own in `Bf:`. */
  public capacity = grblRxBufferBytes;
  private readonly inFlight: number[] = [];

  /**
   * Bytes sent and not yet acknowledged.
   * @returns The count.
   */
  public get used(): number {
    return this.inFlight.reduce((sum, length) => sum + length, 0);
  }

  /**
   * Lines sent and not yet acknowledged.
   * @returns The count.
   */
  public get pending(): number {
    return this.inFlight.length;
  }

  /**
   * Whether a line fits now.
   * @param line - The line without its newline.
   * @returns True when sending it keeps the buffer within capacity.
   */
  public fits(line: string): boolean {
    return this.used + line.length + 1 <= this.capacity;
  }

  /**
   * Count a sent line.
   * @param line - The line without its newline.
   */
  public sent(line: string): void {
    this.inFlight.push(line.length + 1);
  }

  /** Release the oldest line on its `ok` or `error:n`. */
  public acknowledged(): void {
    this.inFlight.shift();
  }

  /** Forget every line in flight: a reset empties the controller's buffer and answers none of them. */
  public clear(): void {
    this.inFlight.length = 0;
  }

  /**
   * Learn the buffer size from a `Bf:` report taken while nothing is in flight, when the whole buffer is free.
   * @param status - A status report.
   */
  public learn(status: GrblStatus): void {
    if (status.buffer !== undefined && this.inFlight.length === 0 && status.buffer.bytes > 0) {
      this.capacity = status.buffer.bytes;
    }
  }
}

/**
 * The realtime bytes that move the feed override from its reported level to a target, in Grbl's steps of 10 % and
 * 1 %, clamped to 10–200 %.
 * @internal
 * @param current - The reported feed override, percent.
 * @param target - The wanted feed override, percent.
 * @returns The bytes to send, in order.
 */
export const grblFeedOverrideBytes = (current: number, target: number): number[] => {
  const goal = Math.min(200, Math.max(10, Math.round(target)));
  if (goal === 100) {
    return [grblRealtime.feedReset];
  }
  const bytes: number[] = [];
  let level = current;
  while (Math.abs(goal - level) >= 10) {
    bytes.push(goal > level ? grblRealtime.feedUp10 : grblRealtime.feedDown10);
    level += goal > level ? 10 : -10;
  }
  while (level !== goal) {
    bytes.push(goal > level ? grblRealtime.feedUp1 : grblRealtime.feedDown1);
    level += goal > level ? 1 : -1;
  }
  return bytes;
};

/** The rapid override levels Grbl 1.1 offers, percent, with their bytes. @internal */
export const grblRapidOverrides: Readonly<Record<string, number>> = Object.freeze({
  '100': grblRealtime.rapid100,
  '50': grblRealtime.rapid50,
  '25': grblRealtime.rapid25,
});

/** Grbl 1.1 `error:n` sentences. @internal */
export const grblErrors: Readonly<Record<number, string>> = Object.freeze({
  1: 'A G-code word is missing its letter.',
  2: 'A number is missing or malformed.',
  3: 'The controller does not know this $ command.',
  4: 'A value that must be positive is negative.',
  5: 'Homing is not enabled in the controller settings.',
  6: 'The step pulse must be longer than 3 microseconds.',
  7: 'The controller could not read its settings and restored the defaults.',
  8: 'This $ command works only while the machine is idle.',
  9: 'G-code is locked out while the machine is in alarm or jogging.',
  10: 'Soft limits need homing to be enabled.',
  11: 'The line is longer than the controller accepts and was not run.',
  12: 'The setting would step faster than the controller can.',
  13: 'The safety door is open.',
  14: 'The startup line is too long to store.',
  15: 'The jog would leave the machine travel and was ignored.',
  16: 'The jog command is malformed or uses a code jogging does not allow.',
  17: 'Laser mode needs PWM spindle output.',
  20: 'The controller does not support a command on this line.',
  21: 'The line has two commands from the same modal group.',
  22: 'No feed rate is set for this move.',
  23: 'A command on this line needs a whole number.',
  24: 'Two commands on this line both need axis words.',
  25: 'A word is repeated on this line.',
  26: 'The command needs axis words and the line has none.',
  27: 'The line number is invalid.',
  28: 'The command is missing a value it needs.',
  29: 'Work coordinate systems G59.1 to G59.3 are not supported.',
  30: 'G53 works only with G0 and G1.',
  31: 'The line has axis words nothing uses.',
  32: 'An arc needs at least one axis word in its plane.',
  33: 'The move target is invalid.',
  34: 'The arc radius is invalid.',
  35: 'An arc needs at least one offset word in its plane.',
  36: 'The line has value words nothing uses.',
  37: 'The tool length offset is not on the tool length axis.',
  38: 'The tool number is larger than the controller supports.',
});

/** What an alarm leaves of the machine position. @internal */
export type GrblAlarm = Readonly<{ sentence: string; position: 'kept' | 'lost'; isCritical: boolean }>;

/** Grbl 1.1 `ALARM:n` meanings. Alarm 10 means an E-stop on grblHAL; the sentence covers both. @internal */
export const grblAlarms: Readonly<Record<number, GrblAlarm>> = Object.freeze({
  1: { sentence: 'A hard limit switch was hit. The position is probably lost.', position: 'lost', isCritical: true },
  2: { sentence: 'A move would leave the machine travel (soft limit).', position: 'kept', isCritical: true },
  3: {
    sentence: 'The controller was reset while moving. The position is probably lost.',
    position: 'lost',
    isCritical: false,
  },
  4: { sentence: 'The probe was already touching before probing started.', position: 'kept', isCritical: false },
  5: { sentence: 'The probe found nothing within its travel.', position: 'kept', isCritical: false },
  6: { sentence: 'Homing was reset before it finished.', position: 'lost', isCritical: false },
  7: { sentence: 'The safety door opened during homing.', position: 'lost', isCritical: false },
  8: { sentence: 'Homing could not pull off the limit switch.', position: 'lost', isCritical: false },
  9: { sentence: 'Homing could not find a limit switch.', position: 'lost', isCritical: false },
  10: {
    sentence: 'Homing failed on a dual-motor axis, or the E-stop is pressed.',
    position: 'lost',
    isCritical: false,
  },
});

/**
 * The sentence for an error code, including grblHAL's codes this table does not carry.
 * @internal
 * @param code - The `error:n` number.
 * @returns A sentence.
 */
export const grblErrorSentence = (code: number): string =>
  grblErrors[code] ?? `The controller refused the line (error ${String(code)}).`;

/**
 * The meaning of an alarm code, including grblHAL's codes this table does not carry.
 * @internal
 * @param code - The `ALARM:n` number.
 * @returns What the alarm means.
 */
export const grblAlarm = (code: number): GrblAlarm =>
  grblAlarms[code] ?? { sentence: `The controller raised alarm ${String(code)}.`, position: 'lost', isCritical: false };

/**
 * Strip comments and whitespace from one program line, as a sender does before streaming it.
 * @internal
 * @param line - One raw program line.
 * @returns The line Grbl should receive, upper case, or the empty string when nothing is left.
 */
export const cleanGcodeLine = (line: string): string =>
  line
    .replaceAll(/\([^)]*\)/gu, '')
    .replace(/;.*$/u, '')
    .replaceAll(/\s+/gu, '')
    .replace(/^%$/u, '')
    .toUpperCase();
