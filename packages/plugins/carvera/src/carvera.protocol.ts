/**
 * The Makera Carvera LAN protocol on stock firmware 1.0.7: frames, status and diagnose grammars, halt codes and the
 * discovery broadcast. Pure functions over bytes and text; no I/O.
 *
 * Frame: `86 68 | length (2, big-endian) = payload + 3 | type | payload | CRC-16/CCITT over length, type and payload |
 * 55 AA`. The firmware checks the CRC only on file packets; this decoder checks it on every frame it receives.
 *
 * @module
 */

/** Frame types. `realtime` and `command` go to the machine; `status`, `diagnose` and `text` come back. @internal */
export const carveraFrameType = {
  realtime: 0xa1,
  command: 0xa2,
  // ponytail: the audit names B0..B6 FILE_START..FILE_RETRY without each value; this ordering is assumed from the
  // enum's documented order and must be confirmed against PublicData.h before hardware qualification.
  fileStart: 0xb0,
  fileMd5: 0xb1,
  fileView: 0xb2,
  fileData: 0xb3,
  fileEnd: 0xb4,
  fileCancel: 0xb5,
  fileRetry: 0xb6,
  status: 0x81,
  diagnose: 0x82,
  text: 0x90,
} as const;

/** One decoded frame. @internal */
export type CarveraFrame = Readonly<{ type: number; payload: Uint8Array<ArrayBuffer> }>;

/** Largest data packet an upload sends. Bytes. @internal */
export const carveraUploadPacketSize = 8192;
/** The TCP port of the machine's command server. @internal */
export const carveraTcpPort = 2222;
/** The UDP port the machine broadcasts its presence to, once a second. @internal */
export const carveraDiscoveryPort = 3333;
/** The machine drops a TCP client this long after its last message. Milliseconds. @internal */
export const carveraIdleDrop = 10_000;
/** The longest line the machine plays; longer lines are dropped silently. Characters. @internal */
export const carveraMaximumLineLength = 128;

const header = [0x86, 0x68] as const;
const footer = [0x55, 0xaa] as const;
const maximumFrameLength = carveraUploadPacketSize + 64;

/* oxlint-disable no-bitwise -- CRC-16/CCITT is defined over bits. */
const crc16 = (bytes: Uint8Array<ArrayBuffer>): number => {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x80_00 ? ((crc << 1) ^ 0x10_21) & 0xff_ff : (crc << 1) & 0xff_ff;
    }
  }
  return crc;
};
/* oxlint-enable no-bitwise */

/**
 * Encode one frame.
 * @internal
 * @param type - One of {@link carveraFrameType}.
 * @param payload - What follows the type byte.
 * @returns Header, length, type, payload, CRC and footer.
 */
export const encodeCarveraFrame = (
  type: number,
  payload: Uint8Array<ArrayBuffer> = new Uint8Array(),
): Uint8Array<ArrayBuffer> => {
  const frame = new Uint8Array(payload.length + 9);
  const view = new DataView(frame.buffer);
  frame.set(header, 0);
  view.setUint16(2, payload.length + 3);
  frame[4] = type;
  frame.set(payload, 5);
  view.setUint16(5 + payload.length, crc16(frame.subarray(2, 5 + payload.length)));
  frame.set(footer, 7 + payload.length);
  return frame;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * A command line as one frame.
 * @internal
 * @param line - G-code, M-code or console command.
 * @returns The framed bytes.
 */
export const carveraCommand = (line: string): Uint8Array<ArrayBuffer> =>
  encodeCarveraFrame(carveraFrameType.command, encoder.encode(`${line}\n`));

/**
 * A realtime character (`?`, `!`, `~`, `\u0018`) as one frame.
 * @internal
 * @param character - `?`, `!`, `~` or `\u0018`.
 * @returns One realtime frame.
 */
export const carveraRealtime = (character: string): Uint8Array<ArrayBuffer> =>
  encodeCarveraFrame(carveraFrameType.realtime, encoder.encode(character));

/**
 * Text of a payload.
 * @internal
 * @param payload - Bytes.
 * @returns The decoded text.
 */
export const carveraText = (payload: Uint8Array<ArrayBuffer>): string => decoder.decode(payload);

/**
 * Incremental frame decoder: push bytes as they arrive, take whole frames out. A frame with a bad CRC or footer is
 * dropped and the decoder resynchronises on the next header.
 * @internal
 * @returns A push function returning every whole frame received so far.
 */
export const createCarveraFrameDecoder = (): Readonly<{
  push(chunk: Uint8Array<ArrayBuffer>): readonly CarveraFrame[];
}> => {
  let buffer = new Uint8Array(0);
  return {
    push(chunk) {
      const joined = new Uint8Array(buffer.length + chunk.length);
      joined.set(buffer, 0);
      joined.set(chunk, buffer.length);
      buffer = joined;
      const frames: CarveraFrame[] = [];
      for (;;) {
        let start = 0;
        while (start + 1 < buffer.length && !(buffer[start] === header[0] && buffer[start + 1] === header[1])) {
          start += 1;
        }
        buffer = buffer.slice(start);
        if (buffer.length < 4) {
          return frames;
        }
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        const length = view.getUint16(2);
        if (length < 3 || length > maximumFrameLength) {
          buffer = buffer.slice(2);
          continue;
        }
        const total = length + 6;
        if (buffer.length < total) {
          return frames;
        }
        const payloadEnd = 2 + length;
        const crc = view.getUint16(payloadEnd);
        const valid =
          buffer[total - 2] === footer[0] &&
          buffer[total - 1] === footer[1] &&
          crc16(buffer.subarray(2, payloadEnd)) === crc;
        if (!valid) {
          buffer = buffer.slice(2);
          continue;
        }
        frames.push({ type: buffer[4]!, payload: buffer.slice(5, payloadEnd) });
        buffer = buffer.slice(total);
      }
    },
  };
};

// ───────────────────────────── Names on the SD card ─────────────────────────────

const pathEscapes: Readonly<Record<string, string>> = {
  ' ': '\u0001',
  '?': '\u0002',
  '*': '\u0003',
  '!': '\u0004',
  '~': '\u0005',
};

/**
 * Escape a path for a console command, as the stock controller does.
 * @internal
 * @param path - The SD-card path.
 * @returns The escaped path.
 */
export const escapeCarveraPath = (path: string): string =>
  path.replaceAll(/[ ?*!~]/gu, (character) => pathEscapes[character]!);

/**
 * Undo {@link escapeCarveraPath}.
 * @internal
 * @param path - A path with the console's escape codes.
 * @returns The path as written on the SD card.
 */
export const unescapeCarveraPath = (path: string): string =>
  [...path]
    .map((character) => Object.entries(pathEscapes).find(([, code]) => code === character)?.[0] ?? character)
    .join('');

// ───────────────────────────── Status `<…>` ─────────────────────────────

/** States in the controller's own words. @internal */
export type CarveraState = 'Sleep' | 'Pause' | 'Wait' | 'Tool' | 'Alarm' | 'Home' | 'Hold' | 'Idle' | 'Run';
const states = new Set<string>(['Sleep', 'Pause', 'Wait', 'Tool', 'Alarm', 'Home', 'Hold', 'Idle', 'Run']);

/** Per-axis millimetres. @internal */
export type CarveraPosition = Readonly<{ x: number; y: number; z: number }>;

/** One parsed status line, converted to millimetres. @internal */
export type CarveraStatus = Readonly<{
  state: CarveraState;
  machine: CarveraPosition;
  work: CarveraPosition;
  /** Millimetres per minute now, millimetres per minute asked, percent override. */
  feed: Readonly<{ current: number; requested: number; override: number }>;
  /** Revolutions per minute now and asked, percent override, degrees Celsius; absent without a spindle module. */
  spindle?: Readonly<{
    current: number;
    target: number;
    override: number;
    vacuumFollows: boolean;
    temperature: number;
  }>;
  /** Active tool (`-1` empty, `0` probe) and its length offset in millimetres. */
  tool: Readonly<{ active: number; lengthOffset: number; target?: number }>;
  /** Wireless probe volts, when the probe reports. */
  probeVolts?: number;
  /** Present only while a file plays: executing line, percent of bytes queued, elapsed seconds. */
  playing?: Readonly<{ line: number; percent: number; elapsed: number }>;
  /** Tool-changer phase: 1 drop, 2 pick, 3 measure, 4 margin, 5 Z probe, 6 levelling, 9 done. */
  atc?: number;
  /** Largest deviation of the active levelling map. Millimetres. */
  levelling?: number;
  halt?: number;
  model: Readonly<{ model: number; functions: number; inches: boolean; absolute: boolean }>;
}>;

/**
 * A comma list as numbers. A field with one garbled value is dropped whole, so its reader falls back to its defaults.
 * @param text - The field's value, if the line carries it.
 * @returns The numbers, or none.
 */
const numbers = (text: string | undefined): readonly number[] => {
  if (text === undefined || text === '') {
    return [];
  }
  const values = text.split(',').map(Number);
  return values.every((value) => Number.isFinite(value)) ? values : [];
};

/**
 * Parse one status line `<Idle|MPos:…|WPos:…|…>`.
 * @internal
 * @param line - The status payload.
 * @returns The status, or undefined when the line is not one.
 */
// oxlint-disable-next-line eslint/complexity -- one positional record with optional fields
export const parseCarveraStatus = (line: string): CarveraStatus | undefined => {
  const match = /^<([^>]*)>\s*$/u.exec(line.trim());
  if (match === null) {
    return undefined;
  }
  const [stateText = '', ...rest] = match[1]!.split('|');
  const state = stateText.split(':')[0]!;
  if (!states.has(state)) {
    return undefined;
  }
  const fields = new Map(
    rest.map((field) => {
      const colon = field.indexOf(':');
      return [field.slice(0, colon), field.slice(colon + 1)] as const;
    }),
  );
  const model = numbers(fields.get('C'));
  const inches = model[2] === 1;
  const scale = inches ? 25.4 : 1;
  const position = (key: string): CarveraPosition | undefined => {
    const [x, y, z] = numbers(fields.get(key));
    return x === undefined || y === undefined || z === undefined
      ? undefined
      : { x: x * scale, y: y * scale, z: z * scale };
  };
  const machine = position('MPos');
  const work = position('WPos');
  if (machine === undefined || work === undefined) {
    return undefined;
  }
  const feed = numbers(fields.get('F'));
  const spindle = numbers(fields.get('S'));
  const tool = numbers(fields.get('T'));
  const playing = numbers(fields.get('P'));
  const probe = numbers(fields.get('W'));
  const atc = numbers(fields.get('A'));
  const levelling = numbers(fields.get('O'));
  const halt = numbers(fields.get('H'));
  return {
    state: state as CarveraState,
    machine,
    work,
    feed: { current: (feed[0] ?? 0) * scale, requested: (feed[1] ?? 0) * scale, override: feed[2] ?? 100 },
    ...(spindle.length >= 3
      ? {
          spindle: {
            current: spindle[0]!,
            target: spindle[1]!,
            override: spindle[2]!,
            vacuumFollows: spindle[3] === 1,
            temperature: spindle[4] ?? 0,
          },
        }
      : {}),
    tool: {
      active: tool[0] ?? -1,
      lengthOffset: (tool[1] ?? 0) * scale,
      ...(tool[2] === undefined ? {} : { target: tool[2] }),
    },
    ...(probe[0] === undefined ? {} : { probeVolts: probe[0] }),
    ...(playing.length >= 3 ? { playing: { line: playing[0]!, percent: playing[1]!, elapsed: playing[2]! } } : {}),
    ...(atc[0] === undefined || atc[0] === 0 ? {} : { atc: atc[0] }),
    ...(levelling[0] === undefined ? {} : { levelling: levelling[0] * scale }),
    ...(halt[0] === undefined || halt[0] === 0 ? {} : { halt: halt[0] }),
    model: { model: model[0] ?? 0, functions: model[1] ?? 0, inches, absolute: model[3] !== 0 },
  };
};

/**
 * Format a status line; the simulator's half of {@link parseCarveraStatus}.
 * @internal
 * @param status - The status, in millimetres.
 * @returns The status payload.
 */
export const formatCarveraStatus = (status: CarveraStatus): string => {
  const axes = (position: CarveraPosition): string =>
    [position.x, position.y, position.z, 0, 0].map((value) => value.toFixed(4)).join(',');
  const fields = [
    status.state,
    `MPos:${axes(status.machine)}`,
    `WPos:${axes(status.work)}`,
    `F:${status.feed.current.toFixed(1)},${status.feed.requested.toFixed(1)},${String(status.feed.override)}`,
    ...(status.spindle === undefined
      ? []
      : [
          `S:${String(status.spindle.current)},${String(status.spindle.target)},${String(status.spindle.override)},${status.spindle.vacuumFollows ? '1' : '0'},${status.spindle.temperature.toFixed(1)},0,0,0,0`,
        ]),
    `T:${String(status.tool.active)},${status.tool.lengthOffset.toFixed(3)}`,
    ...(status.probeVolts === undefined ? [] : [`W:${status.probeVolts.toFixed(2)}`]),
    ...(status.playing === undefined
      ? []
      : [`P:${String(status.playing.line)},${String(status.playing.percent)},${String(status.playing.elapsed)}`]),
    ...(status.atc === undefined ? [] : [`A:${String(status.atc)}`]),
    ...(status.levelling === undefined ? [] : [`O:${status.levelling.toFixed(3)}`]),
    ...(status.halt === undefined ? [] : [`H:${String(status.halt)}`]),
    `C:${String(status.model.model)},${String(status.model.functions)},${status.model.inches ? '1' : '0'},${status.model.absolute ? '1' : '0'}`,
  ];
  return `<${fields.join('|')}>`;
};

// ───────────────────────────── Diagnose `{…}` ─────────────────────────────

/** Switches and inputs from `diagnose`. @internal */
export type CarveraDiagnose = Readonly<{
  light: boolean;
  vacuum: boolean;
  air: boolean;
  /** Both cover switches closed. */
  coverClosed: boolean;
  probeTriggered: boolean;
  toolSetterTriggered: boolean;
  estopPressed: boolean;
  /** Limit switches pressed now, by axis id. */
  limits: readonly string[];
}>;

/**
 * Parse one diagnose line `{S:0,0|V:1,100|G:1|R:0|E:0,0,0,0,0,1|P:0,0|I:0|…}`.
 *
 * ponytail: the cover's polarity (`E` sixth value 1 = closed, both switches AND-ed) and the E-stop's (`I` 1 =
 * pressed) are read from the firmware's switch wiring, not measured; hardware qualification must confirm both.
 * @internal
 * @param line - The diagnose payload.
 * @returns The diagnose record, or undefined when the line is not one.
 */
export const parseCarveraDiagnose = (line: string): CarveraDiagnose | undefined => {
  const match = /^\{([^}]*)\}\s*$/u.exec(line.trim());
  if (match === null) {
    return undefined;
  }
  const fields = new Map(
    match[1]!.split('|').map((field) => {
      const colon = field.indexOf(':');
      return [field.slice(0, colon), numbers(field.slice(colon + 1))] as const;
    }),
  );
  const endstops = fields.get('E') ?? [];
  if (endstops.length < 6) {
    return undefined;
  }
  const limitAxes = ['x', 'x', 'y', 'y', 'z'] as const;
  return {
    light: fields.get('G')?.[0] === 1,
    vacuum: fields.get('V')?.[0] === 1,
    air: fields.get('R')?.[0] === 1,
    coverClosed: endstops[5] === 1,
    probeTriggered: fields.get('P')?.[0] === 1,
    toolSetterTriggered: fields.get('P')?.[1] === 1,
    estopPressed: fields.get('I')?.[0] === 1,
    limits: [...new Set(limitAxes.filter((_, index) => endstops[index] === 1))],
  };
};

/**
 * Format a diagnose line; the simulator's half of {@link parseCarveraDiagnose}.
 * @internal
 * @param diagnose - The record.
 * @returns The diagnose payload.
 */
export const formatCarveraDiagnose = (diagnose: CarveraDiagnose): string => {
  const bit = (value: boolean): string => (value ? '1' : '0');
  const limit = (axis: string): string => bit(diagnose.limits.includes(axis));
  return `{S:0,0|L:0,0|V:${bit(diagnose.vacuum)},${diagnose.vacuum ? '100' : '0'}|F:0,0|G:${bit(diagnose.light)}|T:0|R:${bit(diagnose.air)}|C:0|E:${limit('x')},0,${limit('y')},0,${limit('z')},${bit(diagnose.coverClosed)}|P:${bit(diagnose.probeTriggered)},${bit(diagnose.toolSetterTriggered)}|A:0,0|I:${bit(diagnose.estopPressed)}}`;
};

// ───────────────────────────── Halts ─────────────────────────────

/** How a halt clears: `unlock` (`$X`), `home`, `reset` (restart, which homes) or a power cycle. @internal */
export type CarveraRecovery = 'unlock' | 'home' | 'reset' | 'power-cycle';

const halts: Readonly<Record<number, readonly [label: string, person?: string]>> = {
  1: ['Halted'],
  2: ['Homing failed', 'Check nothing blocks the axes.'],
  3: ['Probing failed', 'Check the probe and the stock.'],
  4: ['Tool measurement failed', 'Check the tool and the tool setter.'],
  5: ['The tool changer could not home', 'Check the collet.'],
  6: ['Tool number outside the rack'],
  7: ['The changer expected a tool and found none', 'Check the rack and the spindle.'],
  8: ['The changer found a tool where it expected none', 'Check the rack and the spindle.'],
  9: ['The spindle overheated', 'Let the spindle cool down.'],
  10: ['A move went past the soft limits'],
  11: ['The cover opened while playing', 'Close the cover.'],
  12: ['The wireless probe is not responding', 'Charge or pair the probe.'],
  13: ['Emergency stop pressed', 'Twist the emergency stop to release it.'],
  14: ['The power supply overheated', 'Let the machine cool down.'],
  15: ['The machine has not been homed'],
  21: ['A limit switch was hit'],
  22: ['X motor error'],
  23: ['Y motor error'],
  24: ['Z motor error'],
  25: ['The spindle stalled'],
  26: ['The SD card could not be read'],
  41: ['Spindle alarm'],
};

/**
 * What one halt code means and how it clears: 1–15 unlock (15 homes), 21–26 reset, 41 power cycle.
 * @internal
 * @param code - The `H:` value.
 * @returns The label, an optional person step and the recovery.
 */
export const carveraHalt = (code: number): Readonly<{ label: string; person?: string; recovery: CarveraRecovery }> => {
  const [label = `Halt ${String(code)}`, person] = halts[code] ?? [];
  const recovery: CarveraRecovery = code === 15 ? 'home' : code <= 20 ? 'unlock' : code <= 40 ? 'reset' : 'power-cycle';
  return { label, ...(person === undefined ? {} : { person }), recovery };
};

// ───────────────────────────── Discovery ─────────────────────────────

/** One discovery broadcast `name,ip,port,busy`. @internal */
export type CarveraBroadcast = Readonly<{ name: string; address: string; port: number; busy: boolean }>;

/**
 * Parse one discovery datagram.
 * @internal
 * @param bytes - The datagram.
 * @returns The broadcast, or undefined when the datagram is not one.
 */
export const parseCarveraBroadcast = (bytes: Uint8Array<ArrayBuffer>): CarveraBroadcast | undefined => {
  const parts = decoder.decode(bytes).trim().split(',');
  if (parts.length !== 4) {
    return undefined;
  }
  const [name = '', address = '', portText = '', busyText = ''] = parts;
  const port = Number(portText);
  if (
    name.length === 0 ||
    name.length > 64 ||
    !name.isWellFormed() ||
    !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(address) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    (busyText !== '0' && busyText !== '1')
  ) {
    return undefined;
  }
  return { name, address, port, busy: busyText === '1' };
};
