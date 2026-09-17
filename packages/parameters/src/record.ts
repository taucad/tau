import { fileParameterEntrySchema, fileParameterRecordProfile } from '@taucad/types';
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
      status: 'unsupported-preserved';
      bytes: Uint8Array<ArrayBuffer>;
      recordVersion?: unknown;
      profile?: unknown;
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
  if (current.success) {
    return { status: 'current', bytes, record: current.data };
  }

  if (value !== null && typeof value === 'object' && ('recordVersion' in value || 'profile' in value)) {
    const markers = value as { recordVersion?: unknown; profile?: unknown };
    if (markers.recordVersion !== 1 || markers.profile !== fileParameterRecordProfile) {
      return {
        status: 'unsupported-preserved',
        bytes,
        ...(markers.recordVersion === undefined ? {} : { recordVersion: markers.recordVersion }),
        ...(markers.profile === undefined ? {} : { profile: markers.profile }),
      };
    }
  }

  return { status: 'invalid-preserved', bytes, error: current.error.message };
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

/**
 * Serialize a validated record for checked persistence. Field order follows the schema, so
 * `recordVersion` and `profile` lead; values and bindings are keyed by name and written in sorted
 * key order so equal records produce equal bytes. Group key order is kept: without `order` it is
 * the display order. @public
 */
export const serializeParameterRecord = (entry: FileParameterEntry): Uint8Array<ArrayBuffer> => {
  const parsed = fileParameterEntrySchema.parse(entry);
  const groups = Object.fromEntries(
    Object.entries(parsed.groups).map(([name, group]) => [
      name,
      {
        ...group,
        values: sortKeys(group.values),
        ...(group.bindings === undefined ? {} : { bindings: sortKeys(group.bindings as unknown as JSONValue) }),
      },
    ]),
  );
  return encoder.encode(`${JSON.stringify({ ...parsed, groups }, undefined, 2)}\n`);
};

/** A record that no reader may interpret; its bytes stay untouched until a person resets them. @public */
export type ParameterRecordFailure = Error &
  Readonly<{ code: 'INVALID_RECORD' | 'UNSUPPORTED_RECORD'; applicationState: 'known-not-applied' }>;

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
  const unsupported = read.status === 'unsupported-preserved';
  const detail: Pick<ParameterRecordFailure, 'code' | 'applicationState'> = {
    code: unsupported ? 'UNSUPPORTED_RECORD' : 'INVALID_RECORD',
    applicationState: 'known-not-applied',
  };
  const failure: ParameterRecordFailure = Object.assign(
    new Error(
      unsupported
        ? 'Saved parameter values use an unsupported record version or profile; their bytes are preserved.'
        : `Saved parameter values are not a valid record; their bytes are preserved. ${read.error}`,
    ),
    detail,
  );
  throw failure;
};
