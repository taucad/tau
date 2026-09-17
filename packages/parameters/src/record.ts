import { fileParameterEntrySchema } from '@taucad/types';
import type { FileParameterEntry, JSONValue } from '@taucad/types';
import { assertBoundedJson } from '#bounded-json.js';

const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const maximumRecordBytes = 1_048_576;
const recordLimits = {
  code: 'PARAMETER_RECORD',
  maximumDepth: 64,
  maximumNodes: 10_000,
  maximumCharacters: 1_000_000,
} as const;

/** Lossless classification of parameter record bytes at the persistence boundary. @public */
export type ParameterRecordRead =
  | Readonly<{
      status: 'current';
      bytes: Uint8Array<ArrayBuffer>;
      record: FileParameterEntry;
    }>
  | Readonly<{
      status: 'invalid-preserved';
      bytes: Uint8Array<ArrayBuffer>;
      error: string;
    }>;

/** Decode a record without changing or discarding unsupported source bytes. @public */
export const readParameterRecord = (input: Uint8Array<ArrayBuffer>): ParameterRecordRead => {
  const bytes = Uint8Array.from(input);
  if (bytes.byteLength > maximumRecordBytes) {
    return {
      status: 'invalid-preserved',
      bytes,
      error: 'PARAMETER_RECORD_BYTE_LIMIT',
    };
  }
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(bytes)) as unknown;
    assertBoundedJson(value, recordLimits);
  } catch (error) {
    return {
      status: 'invalid-preserved',
      bytes,
      error: error instanceof Error ? error.message : 'Invalid UTF-8 or JSON',
    };
  }

  const current = fileParameterEntrySchema.safeParse(value);
  return current.success
    ? { status: 'current', bytes, record: current.data }
    : { status: 'invalid-preserved', bytes, error: current.error.message };
};

/**
 * Byte equality for record content, the one concurrency proof the record still carries. Absence
 * (`null`) equals only absence, so an unwritten sidecar never compares equal to an empty one.
 * @param left - One record content, its text form, or absence.
 * @param right - The other record content, its text form, or absence.
 * @returns Whether both sides name exactly the same bytes.
 * @public
 */
export const sameRecordBytes = (
  // oxlint-disable-next-line typescript/no-restricted-types -- null is the filesystem CAS contract for an absent file.
  left: Uint8Array<ArrayBuffer> | string | null,
  // oxlint-disable-next-line typescript/no-restricted-types -- null is the filesystem CAS contract for an absent file.
  right: Uint8Array<ArrayBuffer> | string | null,
): boolean => {
  if (left === null || right === null) {
    return left === right;
  }
  const a = typeof left === 'string' ? encoder.encode(left) : left;
  const b = typeof right === 'string' ? encoder.encode(right) : right;
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
};

/** Deep key sort; arrays keep their order. `Object.fromEntries` defines own keys, so `__proto__` stays data. */
const sortKeys = (value: JSONValue): JSONValue => {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeys(item));
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .toSorted()
      .map((key) => [key, sortKeys(value[key]!)]),
  );
};

/** Drop an optional claim map that holds nothing, so an untouched record stays at the March shape. */
const withClaims = (group: FileParameterEntry['groups'][string]): Readonly<Record<string, JSONValue | undefined>> => ({
  values: sortKeys(group.values),
  ...(group.units === undefined || Object.keys(group.units).length === 0 ? {} : { units: sortKeys(group.units) }),
  ...(group.sourceUnits === undefined || Object.keys(group.sourceUnits).length === 0
    ? {}
    : { sourceUnits: sortKeys(group.sourceUnits) }),
});

/**
 * Serialize a validated record for checked persistence. Field order follows the schema, so
 * `activeGroup` leads; `values`, `units` and `sourceUnits` are written in sorted key order so equal
 * records produce equal bytes. Group key order is kept: it is the display order. @public
 */
export const serializeParameterRecord = (entry: FileParameterEntry): Uint8Array<ArrayBuffer> => {
  const parsed = fileParameterEntrySchema.parse(entry);
  const groups = Object.fromEntries(Object.entries(parsed.groups).map(([name, group]) => [name, withClaims(group)]));
  return encoder.encode(`${JSON.stringify({ ...parsed, groups }, undefined, 2)}\n`);
};

/** A record that no reader may interpret; its bytes stay untouched until a person resets them. @public */
export type ParameterRecordFailure = Error &
  Readonly<{ code: 'INVALID_RECORD'; applicationState: 'known-not-applied' }>;

/**
 * The single invalid-record policy shared by every reader: decode current bytes, or throw a typed
 * {@link ParameterRecordFailure} naming why they cannot be used.
 * @param bytes - Stored record bytes.
 * @returns The current record.
 * @public
 */
export const requireParameterRecord = (bytes: Uint8Array<ArrayBuffer>): FileParameterEntry => {
  const read = readParameterRecord(bytes);
  if (read.status === 'current') {
    return read.record;
  }
  const detail: Pick<ParameterRecordFailure, 'code' | 'applicationState'> = {
    code: 'INVALID_RECORD',
    applicationState: 'known-not-applied',
  };
  const failure: ParameterRecordFailure = Object.assign(
    new Error(`Saved parameter values are not a valid record; their bytes are preserved. ${read.error}`),
    detail,
  );
  throw failure;
};
