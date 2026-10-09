import { createQuantity, quantityKinds } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';
import type { MachineAlert, MachineCandidate, MachineDatagram, MachineStill } from '@taucad/runtime/machine';

const textDecoder = new TextDecoder('utf-8', { fatal: true });
const maximumDiscoveryBytes = 8192;
const maximumStatusBytes = 262_144;
const maximumStillBytes = 4 * 1024 * 1024;
const identifier = /^[A-Za-z0-9_-]{1,64}$/u;
/** Models qualified for this LAN adapter. @internal */
export type BambuModel = 'X1C' | 'A1 mini';

/** What Tau knows of one model that the protocol, the session and the host read. @internal */
export type BambuModelFacts = Readonly<{
  /** The provider id, which also prefixes its candidates' ids. */
  providerId: string;
  /** The names the printer gives itself (`printer_type`, `project_name`, `devmodel`); the first is `printer_type`. */
  reportedNames: readonly [string, ...string[]];
  /** The product prefix of its serials. */
  serialPrefix: string;
  /** `printer_model` in a slice Bambu Studio made for it. */
  sliceName: string;
  /** Its build plates in `bambu.plate.ts`. */
  plateFamily: 'x1c' | 'a1-mini';
  /** Its camera: RTSPS through the host, or framed JPEG over TLS read by the provider. */
  camera: 'rtsps' | 'jpeg-tls';
  /** An enclosed chamber: a chamber sensor and light, and auxiliary and chamber fans. */
  chamber: boolean;
  /** The pressure-advance profiles it keeps per nozzle, when it caps them. */
  calibrationCapacity?: number;
  /** Measures flow ratio itself (the X1 series' lidar). */
  flowRatioCalibration: boolean;
  /** Its automatic calibration is reliable with a 0.2 mm nozzle. */
  fineNozzleCalibration: boolean;
  /** Takes `layer_inspect` (a first-layer scan) in a start. */
  layerInspect: boolean;
}>;

/**
 * Each model's facts, one row per model: a model added to `BambuModel` does not compile until its row states every
 * one, so it never falls through to another model's values.
 * @internal
 */
export const bambuModels: Readonly<Record<BambuModel, BambuModelFacts>> = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- keyed by the model name.
  X1C: {
    providerId: 'bambu',
    reportedNames: ['BL-P001', 'X1 Carbon', 'Bambu Lab X1 Carbon'],
    serialPrefix: '00M',
    sliceName: 'Bambu Lab X1 Carbon',
    plateFamily: 'x1c',
    camera: 'rtsps',
    chamber: true,
    flowRatioCalibration: true,
    fineNozzleCalibration: true,
    layerInspect: true,
  },
  'A1 mini': {
    providerId: 'bambu-a1-mini',
    reportedNames: ['N1', 'A1 mini'],
    serialPrefix: '030',
    sliceName: 'Bambu Lab A1 mini',
    plateFamily: 'a1-mini',
    camera: 'jpeg-tls',
    chamber: false,
    calibrationCapacity: 16,
    flowRatioCalibration: false,
    fineNozzleCalibration: false,
    layerInspect: false,
  },
};

const isBambuModel = (value: string | undefined): value is BambuModel =>
  value !== undefined && Object.hasOwn(bambuModels, value);

/** Admit a serial only for its model's product prefix.
 * @param serial - Advertised or authenticated serial.
 * @param model - Qualified model.
 * @returns Whether the serial belongs to that product family.
 * @internal
 */
export const isBambuSerial = (serial: string, model: BambuModel): boolean =>
  identifier.test(serial) && serial.startsWith(bambuModels[model].serialPrefix) && serial.length > 3;

const normalizeBambuModel = (value: string | undefined): string | undefined =>
  value === undefined
    ? undefined
    : (Object.entries(bambuModels).find(([, facts]) => facts.reportedNames.includes(value))?.[0] ?? value);

/** Normalized X1C run state; unknown provider values remain unknown. @internal */
export type BambuRunState =
  | 'downloading'
  | 'failed'
  | 'finishing'
  | 'heating'
  | 'none'
  | 'paused'
  | 'preparing'
  | 'printing'
  | 'succeeded'
  | 'unknown';

/** One tray's material, by the flat tray id Bambu reports (`ams_id * 4 + tray`, or 254 for the external spool). @internal */
export type BambuMaterial = Readonly<{
  slot: number;
  state: 'empty' | 'loaded' | 'unknown';
  /** `tray_type`: the material type, such as `PLA`. */
  materialId?: string;
  /** `tray_info_idx`: the filament profile id, such as `GFL99`. */
  profileId?: string;
  /** `setting_id`: the preset setting id. */
  settingId?: string;
  brand?: string;
  /** `#RRGGBBAA`, upper case. */
  color?: string;
  /** Degrees Celsius. */
  nozzleMinimum?: number;
  /** Degrees Celsius. */
  nozzleMaximum?: number;
  remainingPercent?: number;
  /** A Bambu spool whose tag (`tag_uid`) identified it; its identity is read-only. */
  tagged?: boolean;
  /** `cali_idx`: the bound pressure-advance profile, −1 for the printer's default. */
  calibrationIndex?: number;
  /** `k`: the pressure advance the printer applies to this tray. */
  pressureAdvance?: number;
}>;

/** Redacted status facts retained after one provider report is discarded. @internal */
export type BambuStatus = Readonly<{
  sequence?: string;
  model?: string;
  firmware?: string;
  nozzleDiameter?: Quantity;
  nozzleTemperature?: Quantity;
  bedTemperature?: Quantity;
  chamberTemperature?: Quantity;
  nozzleTargetTemperature?: Quantity;
  bedTargetTemperature?: Quantity;
  bedType?: string;
  materials?: readonly BambuMaterial[];
  /** The external spool, kept apart from the AMS trays because reports carry them separately. */
  externalMaterial?: BambuMaterial;
  materialUnits?: ReadonlyArray<Readonly<{ unit: number; humidityIndex?: number; temperature?: Quantity }>>;
  /** The loaded tray. Present but undefined when the printer reported none (255), so a merge clears the last one. */
  currentMaterialSlot?: number | undefined;
  /** The tray a filament change is heading to; present but undefined when the printer reported none. */
  targetMaterialSlot?: number | undefined;
  providerRunId?: string;
  progress?: number;
  remainingSeconds?: number;
  runState?: BambuRunState;
  runName?: string;
  runFile?: string;
  currentLayer?: number;
  totalLayers?: number;
  /** The printer's current stage id (`stg_cur`); `bambuStage` reads it as a phrase. */
  stageId?: number;
  printType?: string;
  /** `gcode_state` exactly as the printer words it, upper case. */
  gcodeState?: string;
  /** `gcode_start_time`: seconds since the epoch at which the current or last print started. */
  startTime?: number;
  /** `ams_status`: the filament system's main state (bits 8–15) and step (bits 0–7). */
  amsStatus?: number;
  /** `cali_version`: changes whenever anyone writes the pressure-advance table; absent where the firmware keeps none. */
  calibrationVersion?: number;
  /** `flag3`: bit 3 lets a slot be edited during a print. */
  flag3?: number;
  /** From `fun` bit 29 (clear means on), or from the printer refusing a command for want of it. */
  developerMode?: 'on' | 'off';
  /** `nozzle_type`, such as `hardened_steel`. */
  nozzleType?: string;
  speedProfile?: 'silent' | 'standard' | 'sport' | 'ludicrous' | 'unknown';
  speedPercent?: number;
  partFanPercent?: number;
  auxiliaryFanPercent?: number;
  chamberFanPercent?: number;
  wifiSignalDbm?: number;
  chamberLight?: 'off' | 'on' | 'unknown';
  removableStorage?: 'absent' | 'present';
  alerts?: readonly MachineAlert[];
}>;

/** Identity-qualified printer firmware facts returned by `info.get_version`. @internal */
export type BambuVersion = Readonly<{ serial: string; firmware: string; model?: string }>;

/**
 * A refusal this package raises with a stable code, so a caller branches on `code` rather than reading the message.
 * The message is the code unless a sentence for a person is given; nothing from the printer or the host is carried.
 * @internal
 */
export class BambuProtocolError extends TypeError {
  public readonly code: string;

  /**
   * @param code - Stable failure code callers branch on.
   * @param message - Sentence a person reads; defaults to the code.
   */
  public constructor(code: string, message: string = code) {
    super(message);
    this.name = 'BambuProtocolError';
    this.code = code;
  }
}

const protocolError = (code: string): never => {
  throw new BambuProtocolError(code);
};

const decode = (bytes: Uint8Array<ArrayBuffer>, maximumBytes: number, code: string): string => {
  if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) {
    return protocolError(code);
  }
  try {
    return textDecoder.decode(bytes);
  } catch {
    return protocolError(code);
  }
};

const record = (value: unknown, code: string): Readonly<Record<string, unknown>> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return protocolError(code);
  }
  return value as Readonly<Record<string, unknown>>;
};

const boundedString = (value: unknown, maximum: number): string | undefined =>
  typeof value === 'string' && value.length > 0 && value.length <= maximum && value.isWellFormed() ? value : undefined;

const finite = (input: Readonly<{ value: unknown; minimum: number; maximum: number }>): number | undefined => {
  const candidate =
    typeof input.value === 'number'
      ? input.value
      : typeof input.value === 'string' && /^-?(?:\d+|\d+\.\d+|\.\d+)$/u.test(input.value)
        ? Number(input.value)
        : undefined;
  return candidate !== undefined &&
    Number.isFinite(candidate) &&
    candidate >= input.minimum &&
    candidate <= input.maximum
    ? candidate
    : undefined;
};

const integer = (value: unknown, maximum: number): number | undefined => {
  const candidate = finite({ value, minimum: 0, maximum });
  return candidate !== undefined && Number.isSafeInteger(candidate) ? candidate : undefined;
};

const temperature = (value: unknown, maximum: number): Quantity | undefined => {
  const parsed = finite({ value, minimum: -50, maximum });
  return parsed === undefined
    ? undefined
    : bambuQuantity({
        value: parsed,
        unit: 'Cel',
        kind: quantityKinds.temperature,
        space: 'point',
      });
};

const fanPercent = (value: unknown): number | undefined => {
  const level = integer(value, 15);
  return level === undefined ? undefined : Math.round((level / 15) * 100);
};

const speedProfile = (value: unknown): BambuStatus['speedProfile'] => {
  switch (integer(value, 4)) {
    case 1: {
      return 'silent';
    }
    case 2: {
      return 'standard';
    }
    case 3: {
      return 'sport';
    }
    case 4: {
      return 'ludicrous';
    }
    default: {
      return value === undefined ? undefined : 'unknown';
    }
  }
};

const materialColor = (value: unknown): string | undefined => {
  const color = boundedString(value, 8);
  return color && /^(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/u.test(color)
    ? `#${color.toUpperCase()}${color.length === 6 ? 'FF' : ''}`
    : undefined;
};

const wifiSignal = (value: unknown): number | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const match = /^(-?\d{1,3})(?:\s*dBm)?$/iu.exec(value.trim());
  return match ? finite({ value: Number(match[1]), minimum: -150, maximum: 0 }) : undefined;
};

const lightState = (value: unknown): BambuStatus['chamberLight'] => {
  for (const row of boundedArray(value, 16)) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      continue;
    }
    const light = row as Readonly<Record<string, unknown>>;
    if (light['node'] !== 'chamber_light') {
      continue;
    }
    const mode = boundedString(light['mode'], 16)?.toLowerCase();
    return mode === 'on' || mode === 'off' ? mode : 'unknown';
  }
  return undefined;
};

/** Keep only the fields that carry a value, so bounded JSON clones admit the result. @internal
 * @param fields - Candidate fields, some of them undefined.
 * @returns The frozen fields that carry a value.
 */
export const definedFields = <Fields extends Readonly<Record<string, unknown>>>(
  fields: Fields,
): Readonly<Partial<Fields>> =>
  Object.freeze(
    Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
  ) as Partial<Fields>;

const storagePresence = (value: unknown): BambuStatus['removableStorage'] =>
  typeof value === 'boolean' ? (value ? 'present' : 'absent') : undefined;

const word = 2 ** 16;

/**
 * Print a code the way the vendor's screens and help pages do.
 *
 * @param words - The code's 16-bit words.
 * @param separator - What goes between two words.
 * @returns Each word as four upper-case hex digits, joined by `separator`.
 */
const displayCode = (words: readonly number[], separator: string): string =>
  words.map((value) => value.toString(16).toUpperCase().padStart(4, '0')).join(separator);

/**
 * Read one diagnostic word: a positive 32-bit integer, as a number or a decimal string.
 *
 * @param value - The untrusted field.
 * @returns The word, or `undefined` for zero, which means no diagnostic, and for anything malformed.
 */
const diagnosticWord = (value: unknown): number | undefined => {
  const parsed = integer(value, 2 ** 32 - 1);
  return parsed === 0 ? undefined : parsed;
};

/**
 * Printer modules by the top byte of an HMS `attr` or a print error, from public community protocol notes, named
 * in Tau's words.
 */
const printerModules: ReadonlyMap<number, string> = new Map([
  [0x03, 'motion controller'],
  [0x05, 'main board'],
  [0x07, 'AMS'],
  [0x08, 'toolhead'],
  [0x0c, 'camera and AI inspection'],
]);

/** HMS severity levels 1–4, from the high word of `code`, each with how the message says it. */
const hmsSeverities = [
  ['fatal', 'reported a fatal error'],
  ['serious', 'reported a serious error'],
  ['warning', 'raised a warning'],
  ['info', 'sent a notice'],
] as const;

/** The vendor's public help page for one HMS code, as `AAAA_BBBB_CCCC_DDDD`. */
const hmsHelpPage = 'https://wiki.bambulab.com/en/x1/troubleshooting/hmscode/';

/**
 * HMS `0500-0500-0001-0007`, "MQTT command verification failed": firmware from 01.08.03.00 beta / 01.08.05.00 drops
 * every control command without Developer Mode while reads still answer (bambuddy `HMS_MQTT_VERIFY_FAILED`).
 * @internal
 */
export const bambuCommandVerificationAlert = '0500-0500-0001-0007';

/** What turns Developer Mode on. @internal */
export const developerModeRemedy = Object.freeze({
  type: 'person',
  instruction: 'On the printer, turn on LAN Only mode and Developer Mode (Settings › General).',
} as const);

const printerScreenRemedy = Object.freeze({
  type: 'person',
  instruction: 'Read the message on the printer’s screen or its help page, and clear it at the printer.',
} as const);

/**
 * One sentence naming the module that raised a diagnostic.
 *
 * @param value - The diagnostic word whose top byte names the module.
 * @param outcome - What the module did, such as "raised a warning".
 * @returns The sentence.
 */
const diagnosticMessage = (value: number, outcome: string): string => {
  const printerModule = printerModules.get(Math.floor(value / 2 ** 24));
  return `${printerModule === undefined ? 'The printer' : `The printer's ${printerModule}`} ${outcome}.`;
};

/**
 * The words of an HMS code's help page. An AMS code carries its unit in the low three bits of its first word and
 * its slot in bits 8–10 of its second; the help centre has one page per code, written for the first unit and slot.
 *
 * @param words - The code's four words.
 * @returns The help page's four words.
 */
const helpPageWords = (words: readonly [number, number, number, number]): readonly number[] => {
  const [attributeHigh, attributeLow, ...codeWords] = words;
  const unit = attributeHigh % 8;
  const slot = Math.floor(attributeLow / 256) % 8;
  return attributeHigh - unit === 0x07_00 ? [0x07_00, attributeLow - slot * 256, ...codeWords] : words;
};

/**
 * Decode one HMS row: `attr` carries the module (top byte) and part, `code` the severity level (high word) and the
 * error. A row that is not two positive 32-bit integers is ignored.
 *
 * @param row - One untrusted `hms` entry.
 * @returns The alert, or `undefined` for a malformed row.
 */
const hmsAlert = (row: unknown): MachineAlert | undefined => {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    return undefined;
  }
  const diagnostic = row as Readonly<Record<string, unknown>>;
  const attribute = diagnosticWord(diagnostic['attr']);
  const code = diagnosticWord(diagnostic['code']);
  if (attribute === undefined || code === undefined) {
    return undefined;
  }
  const words = [Math.floor(attribute / word), attribute % word, Math.floor(code / word), code % word] as const;
  const displayed = displayCode(words, '-');
  if (displayed === bambuCommandVerificationAlert) {
    return Object.freeze({
      code: displayed,
      severity: 'serious',
      message: 'The printer refused a command from Tau because Developer Mode is off.',
      reference: `${hmsHelpPage}${displayCode(words, '_')}`,
      blocks: 'everything',
      remedies: [developerModeRemedy],
    });
  }
  const [severity, outcome = 'reported a problem'] = hmsSeverities[words[2] - 1] ?? [];
  const blocks = severity === 'fatal' ? 'everything' : severity === 'serious' ? 'run' : 'nothing';
  return Object.freeze({
    code: displayed,
    ...definedFields({ severity }),
    message: diagnosticMessage(attribute, outcome),
    reference: `${hmsHelpPage}${displayCode(helpPageWords(words), '_')}`,
    blocks,
    ...(blocks === 'nothing' ? {} : { remedies: [printerScreenRemedy] }),
  });
};

/**
 * Decode `print_error` into its two-word display code. It carries no severity, and the vendor publishes no
 * per-code help page for it, so the alert has neither.
 *
 * @param value - The untrusted `print_error` value.
 * @returns The alert, or `undefined` when there is no error.
 */
const printErrorAlert = (value: unknown): MachineAlert | undefined => {
  const printError = diagnosticWord(value);
  return printError === undefined
    ? undefined
    : Object.freeze({
        code: displayCode([Math.floor(printError / word), printError % word], '-'),
        message: diagnosticMessage(printError, 'reported a print error'),
        blocks: 'nothing',
      });
};

/**
 * The report's active diagnostics, each once, print error first.
 *
 * @param print - The report's `print` object.
 * @returns The alerts, or `undefined` when the report carries neither field.
 */
const printerAlerts = (print: Readonly<Record<string, unknown>>): readonly MachineAlert[] | undefined => {
  if (print['print_error'] === undefined && print['hms'] === undefined) {
    return undefined;
  }
  const alerts = new Map<string, MachineAlert>();
  for (const alert of [
    printErrorAlert(print['print_error']),
    ...boundedArray(print['hms'], 128).map((row) => hmsAlert(row)),
  ]) {
    if (alert) {
      alerts.set(alert.code, alert);
    }
  }
  return Object.freeze([...alerts.values()]);
};

/**
 * Readable phrases for the printer's current stage (`stg_cur`), from public community protocol notes, in Tau's
 * words. Normal printing (0) and idle (-1 on the X1, 255 on the P1) have none: the run state says those.
 *
 * ponytail: ids 1–35, the ones independent notes agree on, less 31 whose meaning none explains; later ids are newer
 * printers' steps. Add an id when an X1C is seen reporting it.
 */
const stagePhrases: ReadonlyMap<number, string> = new Map([
  [1, 'Levelling the bed'],
  [2, 'Heating the bed'],
  [3, 'Calibrating vibration compensation'],
  [4, 'Changing filament'],
  [5, 'Paused by the print file'],
  [6, 'Paused because the filament ran out'],
  [7, 'Heating the nozzle'],
  [8, 'Calibrating extrusion'],
  [9, 'Scanning the bed surface'],
  [10, 'Inspecting the first layer'],
  [11, 'Identifying the build plate'],
  [12, 'Calibrating the lidar'],
  [13, 'Homing the toolhead'],
  [14, 'Cleaning the nozzle tip'],
  [15, 'Checking the extruder temperature'],
  [16, 'Paused on request'],
  [17, 'Paused because the toolhead front cover came off'],
  [18, 'Calibrating the lidar'],
  [19, 'Calibrating the extrusion flow'],
  [20, 'Paused by a nozzle temperature fault'],
  [21, 'Paused by a bed temperature fault'],
  [22, 'Unloading filament'],
  [23, 'Paused because the motors skipped steps'],
  [24, 'Loading filament'],
  [25, 'Calibrating motor noise'],
  [26, 'Paused because the AMS disconnected'],
  [27, 'Paused because the hotend fan is too slow'],
  [28, 'Paused by a chamber temperature fault'],
  [29, 'Cooling the chamber'],
  [30, 'Paused by the print file'],
  [32, 'Paused because filament built up on the nozzle'],
  [33, 'Paused by a filament cutter fault'],
  [34, 'Paused because the first layer has a defect'],
  [35, 'Paused because the nozzle is clogged'],
]);

/** Read the printer's current stage id as a phrase. @internal
 * @param id - The report's `stg_cur`, if it carried one.
 * @returns The phrase, or `undefined` for normal printing, idle and ids the table does not know.
 */
export const bambuStage = (id: number | undefined): string | undefined =>
  id === undefined ? undefined : stagePhrases.get(id);

/** Build one declared-only physical quantity without undefined fields, so bounded JSON clones admit it. @internal
 * @param input - Native value, unit, quantity kind and space.
 * @returns Frozen quantity.
 */
export const bambuQuantity = (
  input: Readonly<{
    value: number;
    unit: string;
    kind: string;
    space: 'linear' | 'point';
  }>,
): Quantity => {
  const result = createQuantity({
    ...input,
    semanticMode: 'declared-only',
  });
  if (result.status !== 'success' || typeof result.value.value !== 'number') {
    throw new BambuProtocolError('BAMBU_INVALID_PHYSICAL_QUANTITY');
  }
  const { assumptions, kind, numericProvenance, reference, representation, space, unit, value: _value } = result.value;
  return Object.freeze({
    unit,
    ...(kind ? { kind } : {}),
    space,
    ...(reference ? { reference } : {}),
    assumptions,
    value: input.value,
    ...(numericProvenance ? { numericProvenance } : {}),
    ...(representation === 'binary64' || representation === 'safe-integer' ? { representation } : {}),
  });
};

const headerName = (value: string): string => value.trim().toLowerCase();
const boundedArray = (value: unknown, maximum: number): readonly unknown[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const rows: readonly unknown[] = value;
  return rows.slice(0, maximum);
};

/** Parse one bounded, untrusted Bambu LAN discovery advertisement.
 * @param input - Datagram plus host-clock observation and expiry.
 * @returns One normalized candidate.
 */
export const parseBambuDiscoveryDatagram = (
  input: Readonly<{
    datagram: MachineDatagram;
    observedAt: string;
    expiresAt: string;
  }>,
): MachineCandidate => {
  const text = decode(input.datagram.bytes, maximumDiscoveryBytes, 'BAMBU_DISCOVERY_INVALID');
  const lines = text.split(/\r?\n/u);
  if (lines.length > 64 || !/^(?:NOTIFY \* HTTP\/1\.1|HTTP\/1\.1 200 OK)$/u.test(lines[0]?.trim() ?? '')) {
    return protocolError('BAMBU_DISCOVERY_INVALID');
  }
  const headers = new Map<string, string>();
  for (const line of lines.slice(1)) {
    if (line.length === 0) {
      continue;
    }
    if (line.length > 512) {
      return protocolError('BAMBU_DISCOVERY_INVALID');
    }
    const separator = line.indexOf(':');
    if (separator <= 0) {
      return protocolError('BAMBU_DISCOVERY_INVALID');
    }
    const name = headerName(line.slice(0, separator));
    const value = line.slice(separator + 1).trim();
    if (headers.has(name) || !boundedString(name, 128) || !boundedString(value, 256)) {
      return protocolError('BAMBU_DISCOVERY_INVALID');
    }
    headers.set(name, value);
  }
  const model = normalizeBambuModel(boundedString(headers.get('devmodel.bambu.com'), 64));
  const serial = boundedString(headers.get('usn') ?? headers.get('devid.bambu.com'), 64);
  const name = boundedString(headers.get('devname.bambu.com'), 128) ?? 'Bambu printer';
  if (!isBambuModel(model) || (serial !== undefined && !isBambuSerial(serial, model))) {
    return protocolError('BAMBU_DISCOVERY_INVALID');
  }
  const { address, interface: networkInterface } = input.datagram.peer;
  return Object.freeze({
    id: `${bambuModels[model].providerId}:${serial ?? address}`,
    name,
    endpoint: Object.freeze({ transport: 'network', address, interface: networkInterface }),
    claimedIdentity: Object.freeze({ model, ...(serial ? { serial } : {}) }),
    observedAt: input.observedAt,
    expiresAt: input.expiresAt,
  });
};

const parseJson = (bytes: Uint8Array<ArrayBuffer>): Readonly<Record<string, unknown>> => {
  try {
    return record(
      JSON.parse(decode(bytes, maximumStatusBytes, 'BAMBU_STATUS_INVALID')) as unknown,
      'BAMBU_STATUS_INVALID',
    );
  } catch (error) {
    if (error instanceof BambuProtocolError) {
      throw error;
    }
    return protocolError('BAMBU_STATUS_INVALID');
  }
};

const runState = (value: unknown): BambuRunState => {
  switch (typeof value === 'string' ? value.toUpperCase() : '') {
    case 'IDLE': {
      return 'none';
    }
    case 'PREPARE': {
      return 'preparing';
    }
    case 'RUNNING': {
      return 'printing';
    }
    case 'PAUSE': {
      return 'paused';
    }
    case 'FINISH': {
      return 'succeeded';
    }
    case 'FAILED': {
      return 'failed';
    }
    default: {
      return 'unknown';
    }
  }
};

/** The flat tray id Bambu reports for the external spool (`vt_tray.id`, `tray_now`). @internal */
export const bambuExternalSpoolSlot = 254;

/** A `tag_uid` of zeros is a tray no tag identified. */
const untagged = /^0+$/u;

/**
 * One tray's material as a snapshot slot.
 *
 * @param row - The report's tray object.
 * @param slot - The tray's flat id.
 * @param presence - What a tray without a material type is when the report says nothing of its presence
 *   (`missing`), and whether the AMS reports filament in the tray (`present`, from `tray_exist_bits`).
 * @returns The slot's material.
 */
const trayMaterial = (
  row: unknown,
  slot: number,
  { missing, present }: Readonly<{ missing: 'empty' | 'unknown'; present?: boolean }>,
): BambuMaterial => {
  const absent = present === undefined ? missing : present ? 'loaded' : 'empty';
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    return Object.freeze({ slot, state: absent });
  }
  const candidate = row as Readonly<Record<string, unknown>>;
  const tagUid = boundedString(candidate['tag_uid'], 64);
  const calibration = definedFields({
    tagged: tagUid === undefined ? undefined : !untagged.test(tagUid),
    calibrationIndex: finite({ value: candidate['cali_idx'], minimum: -1, maximum: 1_000_000 }),
    pressureAdvance: finite({ value: candidate['k'], minimum: 0, maximum: 10 }),
  });
  const materialId = boundedString(candidate['tray_type'], 128) ?? boundedString(candidate['material_id'], 128);
  if (materialId === undefined) {
    // An unset tray still reports a placeholder colour ("00000000"); it describes nothing.
    return Object.freeze({ slot, state: absent, ...calibration });
  }
  // The external holder has no filament reader, so its `remain` is never a measurement.
  const remainingPercent =
    slot === bambuExternalSpoolSlot ? undefined : finite({ value: candidate['remain'], minimum: 0, maximum: 100 });
  return Object.freeze({
    slot,
    state: present === false ? 'empty' : 'loaded',
    ...definedFields({
      materialId,
      profileId: boundedString(candidate['tray_info_idx'], 128),
      settingId: boundedString(candidate['setting_id'], 128),
      brand: boundedString(candidate['tray_sub_brands'], 128),
      color: materialColor(candidate['tray_color']),
      nozzleMinimum: finite({ value: candidate['nozzle_temp_min'], minimum: 0, maximum: 500 }),
      nozzleMaximum: finite({ value: candidate['nozzle_temp_max'], minimum: 0, maximum: 500 }),
      remainingPercent,
    }),
    ...calibration,
  });
};

/**
 * A tray id Bambu reports in `tray_now`/`tray_tar`: an AMS tray or the external spool.
 *
 * @param value - The reported id, a number or a decimal string.
 * @returns The slot, or nothing for 255 (no tray) and ids no printer reports.
 */
const traySlot = (value: unknown): number | undefined => {
  const slot = integer(value, bambuExternalSpoolSlot);
  return slot !== undefined && (slot <= 15 || slot === bambuExternalSpoolSlot) ? slot : undefined;
};

/**
 * Whether one bit of a reported flag word is set; arithmetic, so it holds past 32 bits.
 * @param value - The flag word.
 * @param bit - The bit index, 0 for the lowest.
 * @returns True when the bit is set.
 * @internal
 */
export const bambuBit = (value: number | bigint, bit: number): boolean =>
  typeof value === 'bigint' ? (value / 2n ** BigInt(bit)) % 2n === 1n : Math.floor(value / 2 ** bit) % 2 === 1;

const recordOf = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

/**
 * The loaded materials and tray routing: AMS trays when the report has an AMS, else its flat `materials` list,
 * and the external spool from `vt_tray` (or the first `vir_slot` entry newer firmware sends instead). Units and
 * trays are numbered by their own `id` fields, as Bambu Studio keys them, falling back to their position.
 *
 * @param print - The report's `print` object.
 * @returns The material fields the report carries.
 */
const materialSetup = (print: Readonly<Record<string, unknown>>) => {
  const amsRecord = recordOf(print['ams']);
  const amsUnits = amsRecord?.['ams'];
  const existBits = boundedString(amsRecord?.['tray_exist_bits'], 16);
  const exist =
    existBits !== undefined && /^[0-9A-Fa-f]{1,16}$/u.test(existBits) ? BigInt(`0x${existBits}`) : undefined;
  const units = boundedArray(amsUnits, 4).flatMap((unit, position) => {
    const candidate = recordOf(unit);
    return candidate ? [{ id: integer(candidate['id'], 3) ?? position, candidate }] : [];
  });
  const materialRows: ReadonlyArray<Readonly<{ row: unknown; slot: number }>> = Array.isArray(amsUnits)
    ? units.flatMap(({ id, candidate }) => {
        const trays = new Map<number, unknown>();
        for (const [position, tray] of boundedArray(candidate['tray'], 4).entries()) {
          trays.set(integer(recordOf(tray)?.['id'], 3) ?? position, tray);
        }
        return Array.from({ length: 4 }, (_, tray) => ({ row: trays.get(tray), slot: id * 4 + tray }));
      })
    : boundedArray(print['materials'], 16).map((row, slot) => ({ row, slot }));
  const materials = materialRows.map(({ row, slot }) =>
    trayMaterial(row, slot, {
      missing: amsRecord ? 'empty' : 'unknown',
      ...(exist === undefined ? {} : { present: bambuBit(exist, slot) }),
    }),
  );
  // ponytail: one external holder (single nozzle); dual-nozzle printers report a second one, add it when supported.
  const externalRow = print['vt_tray'] ?? boundedArray(print['vir_slot'], 1)[0];
  const materialUnits = Array.isArray(amsUnits)
    ? units.map(({ id, candidate }) =>
        Object.freeze({
          unit: id,
          ...definedFields({
            humidityIndex: integer(candidate['humidity'], 100),
            temperature: temperature(candidate['temp'], 100),
          }),
        }),
      )
    : undefined;
  const fields = definedFields({
    materials: amsRecord !== undefined || Array.isArray(print['materials']) ? Object.freeze(materials) : undefined,
    externalMaterial:
      externalRow === undefined ? undefined : trayMaterial(externalRow, bambuExternalSpoolSlot, { missing: 'unknown' }),
    materialUnits: materialUnits ? Object.freeze(materialUnits) : undefined,
  });
  // 255 means no tray: a reported field keeps its key even when undefined, so the merge clears the previous slot.
  return {
    ...fields,
    ...(amsRecord !== undefined && 'tray_now' in amsRecord
      ? { currentMaterialSlot: traySlot(amsRecord['tray_now']) }
      : {}),
    ...(amsRecord !== undefined && 'tray_tar' in amsRecord
      ? { targetMaterialSlot: traySlot(amsRecord['tray_tar']) }
      : {}),
  };
};

/**
 * Developer Mode from `fun`, a hex string (or a number): bit 29 clear means on. A1 and P1 printers send no `fun`.
 *
 * @param value - The untrusted `fun` field.
 * @returns On, off, or nothing when the report does not say.
 */
const developerModeOf = (value: unknown): BambuStatus['developerMode'] => {
  const bits =
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? BigInt(value)
      : typeof value === 'string' && /^[0-9A-Fa-f]{1,32}$/u.test(value)
        ? BigInt(`0x${value}`)
        : undefined;
  return bits === undefined ? undefined : bambuBit(bits, 29) ? 'off' : 'on';
};

/** Normalize a bounded status report without retaining the provider payload.
 * @param bytes - Untrusted MQTT payload bytes.
 * @returns Redacted normalized status.
 */
export const parseBambuStatusPayload = (bytes: Uint8Array<ArrayBuffer>): BambuStatus => {
  const root = parseJson(bytes);
  const print = record(root['print'], 'BAMBU_STATUS_INVALID');
  const nozzleDiameter = finite({ value: print['nozzle_diameter'], minimum: 0.1, maximum: 2 });
  const remainingMinutes = finite({ value: print['mc_remaining_time'], minimum: 0, maximum: 100_000 });
  const gcodeState = boundedString(print['gcode_state'], 32)?.toUpperCase();
  const parsed: BambuStatus = Object.freeze({
    ...definedFields({
      sequence: boundedString(print['sequence_id'], 128),
      model: normalizeBambuModel(boundedString(print['printer_type'], 64)),
      firmware: boundedString(print['firmware'], 64),
      nozzleDiameter:
        nozzleDiameter === undefined
          ? undefined
          : bambuQuantity({ value: nozzleDiameter, unit: 'mm', kind: quantityKinds.diameter, space: 'linear' }),
      nozzleType: boundedString(print['nozzle_type'], 64),
      nozzleTemperature: temperature(print['nozzle_temper'], 500),
      nozzleTargetTemperature: temperature(print['nozzle_target_temper'], 500),
      bedTemperature: temperature(print['bed_temper'], 200),
      bedTargetTemperature: temperature(print['bed_target_temper'], 200),
      chamberTemperature: temperature(print['chamber_temper'], 150),
      bedType: boundedString(print['plate_type'], 64),
      providerRunId: boundedString(print['subtask_id'], 128),
      progress: finite({ value: print['mc_percent'], minimum: 0, maximum: 100 }),
      remainingSeconds: remainingMinutes === undefined ? undefined : remainingMinutes * 60,
      runState: print['gcode_state'] === undefined ? undefined : runState(print['gcode_state']),
      gcodeState,
      startTime: integer(print['gcode_start_time'], 100_000_000_000),
      runName: boundedString(print['subtask_name'], 256),
      runFile: boundedString(print['gcode_file'], 256),
      currentLayer: integer(print['layer_num'], 1_000_000),
      totalLayers: integer(print['total_layer_num'], 1_000_000),
      stageId: finite({ value: print['stg_cur'], minimum: -1, maximum: 65_535 }),
      printType: boundedString(print['print_type'], 128),
      speedProfile: speedProfile(print['spd_lvl']),
      speedPercent: finite({ value: print['spd_mag'], minimum: 0, maximum: 1000 }),
      partFanPercent: fanPercent(print['cooling_fan_speed']),
      auxiliaryFanPercent: fanPercent(print['big_fan1_speed']),
      chamberFanPercent: fanPercent(print['big_fan2_speed']),
      wifiSignalDbm: wifiSignal(print['wifi_signal']),
      chamberLight: lightState(print['lights_report']),
      removableStorage: storagePresence(print['sdcard']),
      amsStatus: integer(print['ams_status'], 65_535),
      calibrationVersion: integer(print['cali_version'], 2 ** 31),
      flag3: integer(print['flag3'], 2 ** 32),
      developerMode: developerModeOf(root['fun'] ?? print['fun']),
      alerts: printerAlerts(print),
    }),
    // After the defined fields: a tray reported as none keeps its undefined key (see `materialSetup`).
    ...materialSetup(print),
  });
  if (Object.keys(parsed).every((key) => key === 'sequence')) {
    return protocolError('BAMBU_STATUS_INVALID');
  }
  return parsed;
};

/** Merge one normalized partial status report without reviving discarded provider bytes.
 * @param current - Prior normalized status, if any.
 * @param update - Newly parsed partial status.
 * @returns Frozen current status projection.
 */
export const mergeBambuStatus = (current: BambuStatus | undefined, update: BambuStatus): BambuStatus =>
  Object.freeze({ ...current, ...update });

/** Parse the correlated printer firmware reply without retaining its module inventory.
 * @param bytes - Untrusted MQTT payload bytes.
 * @returns Exact OTA firmware and physical serial.
 */
export const parseBambuVersionPayload = (bytes: Uint8Array<ArrayBuffer>): BambuVersion => {
  const info = record(parseJson(bytes)['info'], 'BAMBU_VERSION_INVALID');
  if (
    info['command'] !== 'get_version' ||
    // Firmware may echo the sequence id as a number.
    (typeof info['sequence_id'] === 'number' ? String(info['sequence_id']) : info['sequence_id']) !== '0' ||
    (typeof info['result'] === 'string' && info['result'].toLowerCase() !== 'success')
  ) {
    return protocolError('BAMBU_VERSION_INVALID');
  }
  for (const value of boundedArray(info['module'], 64)) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }
    const module = value as Readonly<Record<string, unknown>>;
    const serial = boundedString(module['sn'], 64);
    const firmware = boundedString(module['sw_ver'], 64);
    if (module['name'] === 'ota' && serial && identifier.test(serial) && firmware) {
      return Object.freeze({
        serial,
        firmware,
        ...definedFields({ model: normalizeBambuModel(boundedString(module['project_name'], 64)) }),
      });
    }
  }
  return protocolError('BAMBU_VERSION_INVALID');
};

/** One reply to a command, from any client: replies arrive on the shared report topic. @internal */
export type BambuReply = Readonly<{
  family: 'print' | 'system';
  command: string;
  sequence?: string;
  /** `none` when the reply carries no verdict; older firmware answers some commands without one. */
  result: 'success' | 'fail' | 'none';
  reason?: string;
  /** "mqtt message verify failed": the printer dropped the command because Developer Mode is off. */
  unauthorized: boolean;
  body: Readonly<Record<string, unknown>>;
}>;

/**
 * Read one report payload as a command reply. A status push (`push_status`, or no command) is not a reply.
 *
 * @param bytes - Untrusted MQTT payload bytes.
 * @returns The reply, or undefined for a status push or anything malformed.
 * @internal
 */
export const parseBambuReply = (bytes: Uint8Array<ArrayBuffer>): BambuReply | undefined => {
  let root: Readonly<Record<string, unknown>>;
  try {
    root = parseJson(bytes);
  } catch {
    return undefined;
  }
  for (const family of ['print', 'system'] as const) {
    const body = recordOf(root[family]);
    const command = boundedString(body?.['command'], 64);
    if (body === undefined || command === undefined || command === 'push_status') {
      continue;
    }
    const sequence = body['sequence_id'];
    const verdict = boundedString(body['result'], 64)?.toLowerCase();
    const reason = boundedString(body['reason'], 256);
    return Object.freeze({
      family,
      command,
      ...definedFields({
        sequence: typeof sequence === 'number' ? String(sequence) : boundedString(sequence, 64),
        reason,
      }),
      result: verdict === undefined ? 'none' : verdict === 'success' ? 'success' : 'fail',
      unauthorized: verdict !== undefined && verdict !== 'success' && /verify failed/iu.test(reason ?? ''),
      body,
    });
  }
  return undefined;
};

/** One row of the printer's pressure-advance table, from `extrusion_cali_get`. @internal */
export type BambuCalibrationRow = Readonly<{
  index: number;
  name: string;
  filamentId: string;
  settingId: string;
  nozzleId?: string;
  nozzleDiameter?: string;
  pressureAdvance: number;
}>;

/**
 * The rows of an `extrusion_cali_get` reply. Rows whose K lies outside 0–10 are dropped, as Bambu Studio drops them.
 *
 * @param reply - The reply.
 * @returns The rows, or undefined when the reply is not a table or failed.
 * @internal
 */
export const bambuCalibrationTable = (reply: BambuReply): readonly BambuCalibrationRow[] | undefined => {
  if (reply.command !== 'extrusion_cali_get' || reply.result === 'fail') {
    return undefined;
  }
  // An empty table comes back without `filaments` (the workshop X1C, 01.12); Bambu Studio reads that as no rows.
  return Object.freeze(
    boundedArray(reply.body['filaments'], 512).flatMap((value) => {
      const row = recordOf(value);
      const index = integer(row?.['cali_idx'], 1_000_000);
      const pressureAdvance = finite({ value: row?.['k_value'], minimum: 0, maximum: 10 });
      const filamentId = boundedString(row?.['filament_id'], 128);
      if (row === undefined || index === undefined || pressureAdvance === undefined || filamentId === undefined) {
        return [];
      }
      return [
        Object.freeze({
          index,
          name: boundedString(row['name'], 64) ?? `Profile ${String(index)}`,
          filamentId,
          settingId: boundedString(row['setting_id'], 128) ?? '',
          pressureAdvance,
          ...definedFields({
            nozzleId: boundedString(row['nozzle_id'], 32),
            nozzleDiameter: boundedString(row['nozzle_diameter'], 8),
          }),
        }),
      ];
    }),
  );
};

/** One measured result, from `extrusion_cali_get_result` or `flowrate_get_result`. @internal */
export type BambuCalibrationResult = Readonly<{
  /** Flat tray id. */
  slot: number;
  filamentId: string;
  settingId: string;
  confidence: 'good' | 'uncertain' | 'failed';
  /** Pressure advance (K), for a pressure-advance result. */
  pressureAdvance?: number;
  /** `n_coef`, kept so a save sends back what the printer measured. */
  coefficient?: string;
  /** Flow ratio, for a flow-ratio result. */
  flowRatio?: number;
}>;

const confidences = ['good', 'uncertain', 'failed'] as const;

/**
 * The results of an `extrusion_cali_get_result` or `flowrate_get_result` reply.
 *
 * @param reply - The reply.
 * @returns The results, or undefined when the reply is neither or failed.
 * @internal
 */
export const bambuCalibrationResults = (reply: BambuReply): readonly BambuCalibrationResult[] | undefined => {
  if (
    (reply.command !== 'extrusion_cali_get_result' && reply.command !== 'flowrate_get_result') ||
    reply.result === 'fail' ||
    !Array.isArray(reply.body['filaments'])
  ) {
    return undefined;
  }
  return Object.freeze(
    boundedArray(reply.body['filaments'], 16).flatMap((value) => {
      const row = recordOf(value);
      const amsId = integer(row?.['ams_id'], 255);
      const slotId = integer(row?.['slot_id'], 255);
      const trayId = integer(row?.['tray_id'], 255);
      const slot =
        amsId !== undefined && amsId < 4 && slotId !== undefined && slotId < 4
          ? amsId * 4 + slotId
          : trayId !== undefined && trayId <= 15
            ? trayId
            : bambuExternalSpoolSlot;
      const filamentId = boundedString(row?.['filament_id'], 128);
      if (row === undefined || filamentId === undefined) {
        return [];
      }
      return [
        Object.freeze({
          slot,
          filamentId,
          settingId: boundedString(row['setting_id'], 128) ?? '',
          confidence: confidences[integer(row['confidence'], 2) ?? 2] ?? 'failed',
          ...definedFields({
            pressureAdvance: finite({ value: row['k_value'], minimum: 0, maximum: 10 }),
            coefficient: boundedString(row['n_coef'], 16),
            flowRatio: finite({ value: row['flow_ratio'], minimum: 0, maximum: 2 }),
          }),
        }),
      ];
    }),
  );
};

/** Build one exact device topic after rejecting wildcard and separator injection.
 * @param serial - Qualified printer serial component.
 * @param direction - Closed request/report topic suffix.
 * @returns Exact MQTT topic.
 */
export const bambuTopic = (serial: string, direction: 'report' | 'request'): string => {
  if (!identifier.test(serial)) {
    return protocolError('BAMBU_IDENTIFIER_INVALID');
  }
  return `device/${serial}/${direction}`;
};

/** Build a Tau-owned remote artifact name; user filenames never enter FTPS commands.
 * @param operationId - Caller-retained operation identity.
 * @returns Safe remote basename.
 */
export const bambuRemoteName = (operationId: string): string => {
  if (!identifier.test(operationId)) {
    return protocolError('BAMBU_REMOTE_NAME_INVALID');
  }
  return `tau-${operationId}.gcode.3mf`;
};

/** Admit one bounded encoded JPEG without decoding untrusted pixels in-process.
 * @param bytes - Encoded image bytes.
 * @param capturedAt - Host-clock capture time.
 * @returns Detached bounded still.
 */
export const parseBambuStill = (bytes: Uint8Array<ArrayBuffer>, capturedAt: string): MachineStill => {
  const capturedAtMilliseconds = Date.parse(capturedAt);
  if (
    !Number.isFinite(capturedAtMilliseconds) ||
    bytes.byteLength < 4 ||
    bytes.byteLength > maximumStillBytes ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  ) {
    return protocolError('BAMBU_STILL_INVALID');
  }
  return Object.freeze({
    bytes: Uint8Array.from(bytes),
    mediaType: 'image/jpeg',
    capturedAt,
    expiresAt: new Date(capturedAtMilliseconds + 15_000).toISOString(),
  });
};
