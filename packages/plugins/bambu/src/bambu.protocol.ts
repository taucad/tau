import { createQuantity, quantityKinds } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';
import type { MachineAlertSnapshot, MachineCandidate, MachineDatagram, MachineStill } from '@taucad/runtime/machine';

const textDecoder = new TextDecoder('utf-8', { fatal: true });
const maximumDiscoveryBytes = 8192;
const maximumStatusBytes = 262_144;
const maximumStillBytes = 4 * 1024 * 1024;
const identifier = /^[A-Za-z0-9_-]{1,64}$/u;
/** Models qualified for this LAN adapter. @internal */
export type BambuModel = 'X1C' | 'A1 mini';

/** Admit a serial only for its model's product prefix.
 * @param serial - Advertised or authenticated serial.
 * @param model - Qualified model.
 * @returns Whether the serial belongs to that product family.
 * @internal
 */
export const isBambuSerial = (serial: string, model: BambuModel): boolean =>
  identifier.test(serial) && serial.startsWith(model === 'X1C' ? '00M' : '030') && serial.length > 3;

const normalizeBambuModel = (value: string | undefined): string | undefined =>
  value === 'BL-P001' || value === 'X1 Carbon' || value === 'Bambu Lab X1 Carbon'
    ? 'X1C'
    : value === 'N1' || value === 'A1 mini'
      ? 'A1 mini'
      : value;

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

/** One tray's material, by the flat tray id Bambu reports. @internal */
export type BambuMaterial = Readonly<{
  slot: number;
  state: 'empty' | 'loaded' | 'unknown';
  materialId?: string;
  profileId?: string;
  brand?: string;
  color?: string;
  remainingPercent?: number;
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
  currentMaterialSlot?: number;
  targetMaterialSlot?: number;
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
  speedProfile?: 'silent' | 'standard' | 'sport' | 'ludicrous' | 'unknown';
  speedPercent?: number;
  partFanPercent?: number;
  auxiliaryFanPercent?: number;
  chamberFanPercent?: number;
  wifiSignalDbm?: number;
  chamberLight?: 'off' | 'on' | 'unknown';
  removableStorage?: 'absent' | 'present';
  alerts?: readonly MachineAlertSnapshot[];
}>;

/** Identity-qualified printer firmware facts returned by `info.get_version`. @internal */
export type BambuVersion = Readonly<{ serial: string; firmware: string; model?: string }>;

/** Correlated command result that never treats transport delivery as acceptance. @internal */
export type BambuCommandResult =
  | Readonly<{ status: 'accepted'; providerRunId?: string }>
  | Readonly<{ status: 'rejected'; reason: string }>
  | Readonly<{ status: 'unrelated' }>;

const protocolError = (code: string): never => {
  throw new TypeError(code);
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
    ? `#${color.slice(0, 6).toUpperCase()}`
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
const hmsAlert = (row: unknown): MachineAlertSnapshot | undefined => {
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
  const [severity, outcome = 'reported a problem'] = hmsSeverities[words[2] - 1] ?? [];
  return Object.freeze({
    code: displayCode(words, '-'),
    ...definedFields({ severity }),
    message: diagnosticMessage(attribute, outcome),
    reference: `${hmsHelpPage}${displayCode(helpPageWords(words), '_')}`,
  });
};

/**
 * Decode `print_error` into its two-word display code. It carries no severity, and the vendor publishes no
 * per-code help page for it, so the alert has neither.
 *
 * @param value - The untrusted `print_error` value.
 * @returns The alert, or `undefined` when there is no error.
 */
const printErrorAlert = (value: unknown): MachineAlertSnapshot | undefined => {
  const printError = diagnosticWord(value);
  return printError === undefined
    ? undefined
    : Object.freeze({
        code: displayCode([Math.floor(printError / word), printError % word], '-'),
        // Independently worded from BambuStudio hms_en_26A.json, 0500402F (66e4054776).
        message:
          printError === 0x05_00_40_2f
            ? 'The microSD card has damaged sector data. Back up readable files, then repair or format the card. Replace it if the printer still cannot read it.'
            : diagnosticMessage(printError, 'reported a print error'),
      });
};

/**
 * The report's active diagnostics, each once, print error first.
 *
 * @param print - The report's `print` object.
 * @returns The alerts, or `undefined` when the report carries neither field.
 */
const printerAlerts = (print: Readonly<Record<string, unknown>>): readonly MachineAlertSnapshot[] | undefined => {
  if (print['print_error'] === undefined && print['hms'] === undefined) {
    return undefined;
  }
  const alerts = new Map<string, MachineAlertSnapshot>();
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
    throw new TypeError('BAMBU_INVALID_PHYSICAL_QUANTITY');
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
  if ((model !== 'X1C' && model !== 'A1 mini') || (serial !== undefined && !isBambuSerial(serial, model))) {
    return protocolError('BAMBU_DISCOVERY_INVALID');
  }
  const { address, interface: networkInterface } = input.datagram.peer;
  return Object.freeze({
    id: `${model === 'X1C' ? 'bambu' : 'bambu-a1-mini'}:${serial ?? address}`,
    name,
    endpoint: Object.freeze({ address, interface: networkInterface }),
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
    if (error instanceof TypeError && error.message === 'BAMBU_STATUS_INVALID') {
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

/**
 * One tray's material as a snapshot slot.
 *
 * @param row - The report's tray object.
 * @param slot - The tray's flat id.
 * @param missing - What a tray without a material type is.
 * @returns The slot's material.
 */
const trayMaterial = (row: unknown, slot: number, missing: 'empty' | 'unknown'): BambuMaterial => {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    return Object.freeze({ slot, state: missing });
  }
  const candidate = row as Readonly<Record<string, unknown>>;
  const materialId = boundedString(candidate['tray_type'], 128) ?? boundedString(candidate['material_id'], 128);
  if (materialId === undefined) {
    // An unset tray still reports a placeholder colour ("00000000"); it describes nothing.
    return Object.freeze({ slot, state: missing });
  }
  const profileId = boundedString(candidate['tray_info_idx'], 128);
  const brand = boundedString(candidate['tray_sub_brands'], 128);
  const color = materialColor(candidate['tray_color']);
  // The external holder has no filament reader, so its `remain` is never a measurement.
  const remainingPercent =
    slot === bambuExternalSpoolSlot ? undefined : finite({ value: candidate['remain'], minimum: 0, maximum: 100 });
  return Object.freeze({
    slot,
    state: 'loaded',
    ...definedFields({ materialId, profileId, brand, color, remainingPercent }),
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
 * The loaded materials and tray routing: AMS trays when the report has an AMS, else its flat `materials` list,
 * and the external spool from `vt_tray` (or the first `vir_slot` entry newer firmware sends instead).
 *
 * @param print - The report's `print` object.
 * @returns The material fields the report carries.
 */
const materialSetup = (print: Readonly<Record<string, unknown>>) => {
  const { ams } = print;
  const amsRecord =
    ams !== null && typeof ams === 'object' && !Array.isArray(ams)
      ? (ams as Readonly<Record<string, unknown>>)
      : undefined;
  const amsUnits = amsRecord?.['ams'];
  const materialRows: ReadonlyArray<Readonly<{ row: unknown; slot: number }>> = Array.isArray(amsUnits)
    ? boundedArray(amsUnits, 4).flatMap((unit, unitIndex) => {
        if (unit === null || typeof unit !== 'object' || Array.isArray(unit)) {
          return [];
        }
        const trays = (unit as Readonly<Record<string, unknown>>)['tray'];
        const rows = boundedArray(trays, 4);
        return Array.from({ length: 4 }, (_, trayIndex) => ({
          row: rows[trayIndex],
          slot: unitIndex * 4 + trayIndex,
        }));
      })
    : boundedArray(print['materials'], 16).map((row, slot) => ({
        row,
        slot,
      }));
  const materials = materialRows.map(({ row, slot }) => trayMaterial(row, slot, amsRecord ? 'empty' : 'unknown'));
  // ponytail: one external holder (single nozzle); dual-nozzle printers report a second one, add it when supported.
  const externalRow = print['vt_tray'] ?? boundedArray(print['vir_slot'], 1)[0];
  const materialUnits = Array.isArray(amsUnits)
    ? boundedArray(amsUnits, 4).flatMap((unit, index) => {
        if (unit === null || typeof unit !== 'object' || Array.isArray(unit)) {
          return [];
        }
        const candidate = unit as Readonly<Record<string, unknown>>;
        return [
          Object.freeze({
            unit: index,
            ...definedFields({
              humidityIndex: integer(candidate['humidity'], 100),
              temperature: temperature(candidate['temp'], 100),
            }),
          }),
        ];
      })
    : undefined;
  return definedFields({
    materials: amsRecord !== undefined || Array.isArray(print['materials']) ? Object.freeze(materials) : undefined,
    externalMaterial:
      externalRow === undefined ? undefined : trayMaterial(externalRow, bambuExternalSpoolSlot, 'empty'),
    materialUnits: materialUnits ? Object.freeze(materialUnits) : undefined,
    currentMaterialSlot: traySlot(amsRecord?.['tray_now']),
    targetMaterialSlot: traySlot(amsRecord?.['tray_tar']),
  });
};

/** Normalize a bounded status report without retaining the provider payload.
 * @param bytes - Untrusted MQTT payload bytes.
 * @returns Redacted normalized status.
 */
export const parseBambuStatusPayload = (bytes: Uint8Array<ArrayBuffer>): BambuStatus => {
  const print = record(parseJson(bytes)['print'], 'BAMBU_STATUS_INVALID');
  const nozzleDiameter = finite({ value: print['nozzle_diameter'], minimum: 0.1, maximum: 2 });
  const remainingMinutes = finite({ value: print['mc_remaining_time'], minimum: 0, maximum: 100_000 });
  const parsed: BambuStatus = definedFields({
    sequence: boundedString(print['sequence_id'], 128),
    model: normalizeBambuModel(boundedString(print['printer_type'], 64)),
    firmware: boundedString(print['firmware'], 64),
    nozzleDiameter:
      nozzleDiameter === undefined
        ? undefined
        : bambuQuantity({ value: nozzleDiameter, unit: 'mm', kind: quantityKinds.diameter, space: 'linear' }),
    nozzleTemperature: temperature(print['nozzle_temper'], 500),
    nozzleTargetTemperature: temperature(print['nozzle_target_temper'], 500),
    bedTemperature: temperature(print['bed_temper'], 200),
    bedTargetTemperature: temperature(print['bed_target_temper'], 200),
    chamberTemperature: temperature(print['chamber_temper'], 150),
    bedType: boundedString(print['plate_type'], 64),
    ...materialSetup(print),
    providerRunId: boundedString(print['subtask_id'], 128),
    progress: finite({ value: print['mc_percent'], minimum: 0, maximum: 100 }),
    remainingSeconds: remainingMinutes === undefined ? undefined : remainingMinutes * 60,
    runState: print['gcode_state'] === undefined ? undefined : runState(print['gcode_state']),
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
    alerts: printerAlerts(print),
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
    info['sequence_id'] !== '0' ||
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

/** Interpret only an exactly correlated semantic command result.
 * @param input - Payload and exact requested command/sequence identity.
 * @returns Correlated semantic outcome or unrelated.
 */
export const parseBambuCommandPayload = (
  input: Readonly<{
    bytes: Uint8Array<ArrayBuffer>;
    command: string;
    sequence: string;
  }>,
): BambuCommandResult => {
  const print = record(parseJson(input.bytes)['print'], 'BAMBU_COMMAND_INVALID');
  // Firmware may echo the sequence id as a number.
  const sequence = print['sequence_id'];
  if (
    print['command'] !== input.command ||
    (typeof sequence === 'number' ? String(sequence) : sequence) !== input.sequence
  ) {
    return Object.freeze({ status: 'unrelated' });
  }
  const result = boundedString(print['result'], 64)?.toLowerCase();
  if (result === 'success') {
    const providerRunId = boundedString(print['subtask_id'], 128);
    return Object.freeze({
      status: 'accepted',
      ...(providerRunId ? { providerRunId } : {}),
    });
  }
  return Object.freeze({
    status: 'rejected',
    reason: boundedString(print['reason'], 128) ?? 'provider-rejected',
  });
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
