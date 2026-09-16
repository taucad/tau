import { digestContent } from '@taucad/cache-core';
import {
  currentFileParameterEntrySchema,
  fileParameterRecordProfile,
  legacyFileParameterEntrySchema,
} from '@taucad/types';
import type { CurrentFileParameterEntry, FileParameterEntry } from '@taucad/types';
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
      record: CurrentFileParameterEntry;
    }>
  | Readonly<{
      status: 'migration-ready';
      bytes: Uint8Array<ArrayBuffer>;
      record: FileParameterEntry;
    }>
  | Readonly<{
      status: 'legacy-readable';
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
export const readParameterRecord = (
  input: Uint8Array<ArrayBuffer>,
  options: Readonly<{ migrationAvailable?: boolean }> = {},
): ParameterRecordRead => {
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

  const current = currentFileParameterEntrySchema.safeParse(value);
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

  const legacy = legacyFileParameterEntrySchema.safeParse(value);
  return legacy.success
    ? {
        status: options.migrationAvailable === false ? 'legacy-readable' : 'migration-ready',
        bytes,
        record: legacy.data,
      }
    : { status: 'invalid-preserved', bytes, error: current.error.message };
};

/** Plan one backup-correlated upgrade of an exact legacy record. @public */
export const planParameterRecordMigration = async (
  source: Extract<ParameterRecordRead, { status: 'migration-ready' }>,
  backupRevision: string,
): Promise<
  Readonly<{
    sourceDigest: string;
    record: CurrentFileParameterEntry;
    bytes: Uint8Array<ArrayBuffer>;
  }>
> => {
  const sourceDigest = await digestContent({ bytes: source.bytes });
  const record = currentFileParameterEntrySchema.parse({
    recordVersion: 1,
    profile: fileParameterRecordProfile,
    ...source.record,
    migration: { sourceDigest, backupRevision },
  });
  return {
    sourceDigest,
    record,
    bytes: encoder.encode(`${JSON.stringify(record, undefined, 2)}\n`),
  };
};

/** Serialize a validated current record for checked persistence. @public */
export const serializeParameterRecord = (entry: CurrentFileParameterEntry): Uint8Array<ArrayBuffer> =>
  encoder.encode(`${JSON.stringify(currentFileParameterEntrySchema.parse(entry), undefined, 2)}\n`);
