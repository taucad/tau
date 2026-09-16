import { createQuantity, quantityKinds } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';
import type { MachineCandidate, MachineDatagram, MachineStill } from '@taucad/runtime/machine';

const textDecoder = new TextDecoder('utf-8', { fatal: true });
const maximumDiscoveryBytes = 8192;
const maximumStatusBytes = 262_144;
const maximumStillBytes = 4 * 1024 * 1024;
const identifier = /^[A-Za-z0-9_-]{1,64}$/u;
const x1cSerialIdentifier = /^00M[A-Za-z0-9_-]{1,61}$/u;
const normalizeX1cModel = (value: string | undefined): string | undefined =>
  value === 'BL-P001' || value === 'X1 Carbon' || value === 'Bambu Lab X1 Carbon' ? 'X1C' : value;

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
  materials?: ReadonlyArray<
    Readonly<{
      slot: number;
      state: 'empty' | 'loaded' | 'unknown';
      materialId?: string;
      brand?: string;
      color?: string;
      remainingPercent?: number;
    }>
  >;
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
  stage?: string;
  printType?: string;
  speedProfile?: 'silent' | 'standard' | 'sport' | 'ludicrous' | 'unknown';
  speedPercent?: number;
  partFanPercent?: number;
  auxiliaryFanPercent?: number;
  chamberFanPercent?: number;
  wifiSignalDbm?: number;
  chamberLight?: 'off' | 'on' | 'unknown';
  removableStorage?: 'absent' | 'present';
  alerts?: ReadonlyArray<Readonly<{ code: string }>>;
}>;

/** Identity-qualified printer firmware facts returned by `info.get_version`. @internal */
export type BambuVersion = Readonly<{ serial: string; firmware: string }>;

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
    : quantity({
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

const alertCodes = (
  print: Readonly<Record<string, unknown>>,
): ReadonlyArray<Readonly<{ code: string }>> | undefined => {
  const codes = new Set<string>();
  const printError = integer(print['print_error'], Number.MAX_SAFE_INTEGER);
  if (printError !== undefined && printError !== 0) {
    codes.add(String(printError));
  }
  for (const row of boundedArray(print['hms'], 128)) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      continue;
    }
    const diagnostic = row as Readonly<Record<string, unknown>>;
    const code =
      boundedString(diagnostic['code'], 128) ?? String(integer(diagnostic['code'], Number.MAX_SAFE_INTEGER) ?? '');
    const attribute =
      boundedString(diagnostic['attr'], 128) ?? String(integer(diagnostic['attr'], Number.MAX_SAFE_INTEGER) ?? '');
    if (code) {
      codes.add(attribute ? `${attribute}:${code}` : code);
    }
  }
  return print['print_error'] === undefined && print['hms'] === undefined
    ? undefined
    : Object.freeze([...codes].map((code) => Object.freeze({ code })));
};

const quantity = (
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
  const model = normalizeX1cModel(boundedString(headers.get('devmodel.bambu.com'), 64));
  const serial = boundedString(headers.get('usn') ?? headers.get('devid.bambu.com'), 64);
  const name = boundedString(headers.get('devname.bambu.com'), 128) ?? 'Bambu printer';
  if (model !== 'X1C' || (serial !== undefined && !x1cSerialIdentifier.test(serial))) {
    return protocolError('BAMBU_DISCOVERY_INVALID');
  }
  const { address, interface: networkInterface } = input.datagram.peer;
  return Object.freeze({
    id: `bambu:${serial ?? address}`,
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

/** Normalize a bounded status report without retaining the provider payload.
 * @param bytes - Untrusted MQTT payload bytes.
 * @returns Redacted normalized status.
 */
export const parseBambuStatusPayload = (bytes: Uint8Array<ArrayBuffer>): BambuStatus => {
  const print = record(parseJson(bytes)['print'], 'BAMBU_STATUS_INVALID');
  const nozzleDiameter = finite({
    value: print['nozzle_diameter'],
    minimum: 0.1,
    maximum: 2,
  });
  const nozzleTemperature = temperature(print['nozzle_temper'], 500);
  const nozzleTargetTemperature = temperature(print['nozzle_target_temper'], 500);
  const bedTemperature = temperature(print['bed_temper'], 200);
  const bedTargetTemperature = temperature(print['bed_target_temper'], 200);
  const chamberTemperature = temperature(print['chamber_temper'], 150);
  const progress = finite({
    value: print['mc_percent'],
    minimum: 0,
    maximum: 100,
  });
  const remainingMinutes = finite({
    value: print['mc_remaining_time'],
    minimum: 0,
    maximum: 100_000,
  });
  const providerRunId = boundedString(print['subtask_id'], 128);
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
  const materials = materialRows.map(({ row, slot }) => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      return Object.freeze({
        slot,
        state: amsRecord ? 'empty' : 'unknown',
      } as const);
    }
    const candidate = row as Readonly<Record<string, unknown>>;
    const materialId = boundedString(candidate['tray_type'], 128) ?? boundedString(candidate['material_id'], 128);
    const brand = boundedString(candidate['tray_sub_brands'], 128);
    const color = materialColor(candidate['tray_color']);
    const remainingPercent = finite({
      value: candidate['remain'],
      minimum: 0,
      maximum: 100,
    });
    const state = materialId ? 'loaded' : amsRecord ? 'empty' : 'unknown';
    return Object.freeze({
      slot,
      state,
      ...(materialId ? { materialId } : {}),
      ...(brand ? { brand } : {}),
      ...(color ? { color } : {}),
      ...(remainingPercent === undefined ? {} : { remainingPercent }),
    });
  });
  const materialUnits = Array.isArray(amsUnits)
    ? boundedArray(amsUnits, 4).flatMap((unit, index) => {
        if (unit === null || typeof unit !== 'object' || Array.isArray(unit)) {
          return [];
        }
        const candidate = unit as Readonly<Record<string, unknown>>;
        const humidityIndex = integer(candidate['humidity'], 100);
        const unitTemperature = temperature(candidate['temp'], 100);
        return [
          Object.freeze({
            unit: index,
            ...(humidityIndex === undefined ? {} : { humidityIndex }),
            ...(unitTemperature ? { temperature: unitTemperature } : {}),
          }),
        ];
      })
    : undefined;
  const currentMaterialSlot = integer(amsRecord?.['tray_now'], 15);
  const targetMaterialSlot = integer(amsRecord?.['tray_tar'], 15);
  const currentLayer = integer(print['layer_num'], 1_000_000);
  const totalLayers = integer(print['total_layer_num'], 1_000_000);
  const speedPercent = finite({
    value: print['spd_mag'],
    minimum: 0,
    maximum: 1000,
  });
  const partFanPercent = fanPercent(print['cooling_fan_speed']);
  const auxiliaryFanPercent = fanPercent(print['big_fan1_speed']);
  const chamberFanPercent = fanPercent(print['big_fan2_speed']);
  const alerts = alertCodes(print);
  const sequence = boundedString(print['sequence_id'], 128);
  const model = normalizeX1cModel(boundedString(print['printer_type'], 64));
  const firmware = boundedString(print['firmware'], 64);
  const bedType = boundedString(print['plate_type'], 64);
  const runName = boundedString(print['subtask_name'], 256);
  const runFile = boundedString(print['gcode_file'], 256);
  const stage = boundedString(print['mc_print_stage'], 128);
  const printType = boundedString(print['print_type'], 128);
  const wifiSignalDbm = wifiSignal(print['wifi_signal']);
  const chamberLight = lightState(print['lights_report']);
  const profile = speedProfile(print['spd_lvl']);
  const parsed = Object.freeze({
    ...(sequence ? { sequence } : {}),
    ...(model ? { model } : {}),
    ...(firmware ? { firmware } : {}),
    ...(nozzleDiameter === undefined
      ? {}
      : {
          nozzleDiameter: quantity({
            value: nozzleDiameter,
            unit: 'mm',
            kind: quantityKinds.diameter,
            space: 'linear',
          }),
        }),
    ...(nozzleTemperature ? { nozzleTemperature } : {}),
    ...(nozzleTargetTemperature ? { nozzleTargetTemperature } : {}),
    ...(bedTemperature ? { bedTemperature } : {}),
    ...(bedTargetTemperature ? { bedTargetTemperature } : {}),
    ...(chamberTemperature ? { chamberTemperature } : {}),
    ...(bedType ? { bedType } : {}),
    ...((amsRecord ?? Array.isArray(print['materials'])) ? { materials: Object.freeze(materials) } : {}),
    ...(materialUnits ? { materialUnits: Object.freeze(materialUnits) } : {}),
    ...(currentMaterialSlot === undefined ? {} : { currentMaterialSlot }),
    ...(targetMaterialSlot === undefined ? {} : { targetMaterialSlot }),
    ...(providerRunId ? { providerRunId } : {}),
    ...(progress === undefined ? {} : { progress }),
    ...(remainingMinutes === undefined ? {} : { remainingSeconds: remainingMinutes * 60 }),
    ...(print['gcode_state'] === undefined ? {} : { runState: runState(print['gcode_state']) }),
    ...(runName ? { runName } : {}),
    ...(runFile ? { runFile } : {}),
    ...(currentLayer === undefined ? {} : { currentLayer }),
    ...(totalLayers === undefined ? {} : { totalLayers }),
    ...(stage ? { stage } : {}),
    ...(printType ? { printType } : {}),
    ...(profile ? { speedProfile: profile } : {}),
    ...(speedPercent === undefined ? {} : { speedPercent }),
    ...(partFanPercent === undefined ? {} : { partFanPercent }),
    ...(auxiliaryFanPercent === undefined ? {} : { auxiliaryFanPercent }),
    ...(chamberFanPercent === undefined ? {} : { chamberFanPercent }),
    ...(wifiSignalDbm === undefined ? {} : { wifiSignalDbm }),
    ...(chamberLight ? { chamberLight } : {}),
    ...(typeof print['sdcard'] === 'boolean' ? { removableStorage: print['sdcard'] ? 'present' : 'absent' } : {}),
    ...(alerts ? { alerts } : {}),
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
      return Object.freeze({ serial, firmware });
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
  if (print['command'] !== input.command || print['sequence_id'] !== input.sequence) {
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
