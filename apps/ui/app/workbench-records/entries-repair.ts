import { workbenchRecords } from '@taucad/workbench';
import type { WorkbenchEntries } from '@taucad/workbench';

/** A reviewed rename of the historical `operationTimeout` key, validated by the strict codec. */
export type EntriesCorrection = Readonly<{
  renamed: ReadonlyArray<Readonly<{ path: string; renderTimeout: number }>>;
  /** Entries the correction leaves exactly as they were. */
  unchanged: number;
  record: WorkbenchEntries;
}>;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * The one correction Tau may propose for refused entry settings: a v1 record a
 * short-lived Tau revision wrote with `operationTimeout` instead of
 * `renderTimeout`. Every entry using that key alone is renamed with its value
 * kept; anything else wrong — both spellings, a bad value, another unknown key,
 * a newer version, broken bytes — offers no correction, because the result must
 * pass the same strict codec that refused the original.
 *
 * @param bytes - The refused record bytes, exactly as read.
 * @returns The correction, or `undefined` when none is safe to propose.
 */
export function proposeEntriesCorrection(bytes: Uint8Array<ArrayBuffer>): EntriesCorrection | undefined {
  if (workbenchRecords.entries.read(bytes).status === 'current') {
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(value) || value['version'] !== 1 || !isRecord(value['entries'])) {
    return undefined;
  }
  const renamed: string[] = [];
  const entries: Record<string, unknown> = {};
  for (const [path, entry] of Object.entries(value['entries'])) {
    if (isRecord(entry) && Object.hasOwn(entry, 'operationTimeout') && !Object.hasOwn(entry, 'renderTimeout')) {
      const { operationTimeout, ...rest } = entry;
      entries[path] = { ...rest, renderTimeout: operationTimeout };
      renamed.push(path);
    } else {
      entries[path] = entry;
    }
  }
  if (renamed.length === 0) {
    return undefined;
  }
  const read = workbenchRecords.entries.read(encoder.encode(JSON.stringify({ ...value, entries })));
  if (read.status !== 'current') {
    return undefined;
  }
  return {
    renamed: renamed.map((path) => ({ path, renderTimeout: read.record.entries[path]!.renderTimeout! })),
    unchanged: Object.keys(entries).length - renamed.length,
    record: read.record,
  };
}
