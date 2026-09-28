import type { z } from 'zod';
import {
  namedLayoutSchema,
  workbenchDeviceSchema,
  workbenchEntriesSchema,
  workbenchIdSchema,
  workbenchLayoutSchema,
  workbenchViewSchema,
} from '#records.schema.js';

/** Why record bytes cannot be adopted. @public */
export type WorkbenchRecordRefusal = 'INVALID_RECORD' | 'NEWER_RECORD';

/** A bounded read keeps invalid bytes untouched. @public */
export type WorkbenchRecordRead<Value> =
  | Readonly<{ status: 'current'; record: Value }>
  | Readonly<{ status: 'invalid-preserved'; code: WorkbenchRecordRefusal; message: string }>;

/** One strict record reader and canonical writer. @public */
export type WorkbenchRecordCodec<Schema extends z.ZodType> = Readonly<{
  schema: Schema;
  read(bytes: Uint8Array<ArrayBuffer>): WorkbenchRecordRead<z.output<Schema>>;
  serialize(record: z.input<Schema>): string;
}>;

const maxBytes = 64 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

const hasPrototypeKey = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasPrototypeKey(item));
  }
  return Object.entries(value).some(([key, nested]) => key === '__proto__' || hasPrototypeKey(nested));
};

const sorted = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => sorted(item));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, sorted(nested)]),
    );
  }
  return value;
};

const codec = <Schema extends z.ZodType>(name: string, schema: Schema): WorkbenchRecordCodec<Schema> => ({
  schema,
  read(bytes) {
    const invalid = (detail: string): WorkbenchRecordRead<z.output<Schema>> => ({
      status: 'invalid-preserved',
      code: 'INVALID_RECORD',
      message: `The ${name} record is invalid: ${detail}`,
    });
    if (bytes.byteLength > maxBytes) {
      return invalid('it exceeds 64 KiB.');
    }
    let value: unknown;
    try {
      value = JSON.parse(decoder.decode(bytes)) as unknown;
    } catch {
      return invalid('it is not UTF-8 JSON.');
    }
    try {
      if (hasPrototypeKey(value)) {
        return invalid('it contains __proto__.');
      }
    } catch {
      return invalid('its structure is too deeply nested.');
    }
    if (
      value !== null &&
      typeof value === 'object' &&
      'version' in value &&
      typeof value.version === 'number' &&
      value.version > 1
    ) {
      return {
        status: 'invalid-preserved',
        code: 'NEWER_RECORD',
        message: `The ${name} record was written by a newer Tau. Update Tau to use it.`,
      };
    }
    let result: z.ZodSafeParseResult<z.output<Schema>>;
    try {
      result = schema.safeParse(value);
    } catch {
      return invalid('its structure is too deeply nested.');
    }
    return result.success
      ? { status: 'current', record: result.data }
      : invalid(
          result.error.issues
            .map((issue) => `${issue.path.length === 0 ? 'record' : issue.path.join('.')}: ${issue.message}`)
            .join('; '),
        );
  },
  serialize(record) {
    if (hasPrototypeKey(record)) {
      throw new TypeError('Workbench records cannot contain __proto__.');
    }
    const text = `${JSON.stringify(sorted(schema.parse(record)), null, 2)}\n`;
    if (encoder.encode(text).byteLength > maxBytes) {
      throw new RangeError('Workbench record exceeds 64 KiB.');
    }
    return text;
  },
});

/** Strict codecs for the three live records and two future file shapes. @public */
export const workbenchRecords = {
  layout: codec('layout', workbenchLayoutSchema),
  view: codec('view', workbenchViewSchema),
  entries: codec('entries', workbenchEntriesSchema),
  namedLayout: codec('named layout', namedLayoutSchema),
  device: codec('device', workbenchDeviceSchema),
} as const;

/** Paths for the live project records and file-only future grammars. @public */
export const workbenchPaths = {
  layout: '.tau/workbench/layout.json',
  entries: '.tau/workbench/entries.json',
  view: (id: string): `.tau/workbench/views/${string}.json` =>
    `.tau/workbench/views/${workbenchIdSchema.parse(id)}.json`,
  namedLayout: (name: string): `.tau/workbench/layouts/${string}.json` =>
    `.tau/workbench/layouts/${workbenchIdSchema.parse(name)}.json`,
  device: (projectId: string): `/.tau/workbench/${string}.json` =>
    `/.tau/workbench/${workbenchIdSchema.parse(projectId)}.json`,
} as const;
