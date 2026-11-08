/**
 * The facts a committed import keeps beside its project (charter D12).
 *
 * The staging measured every entry's blob id, SHA-256 and kind once, from the
 * read-back of what it wrote (EQ6). The
 * commit writes them to {@link importFactsPath}, and the Project Index takes
 * them when it first opens the project, so it does not hash the files again.
 * They are hints, not truth: nothing in the record is believed until
 * {@link verifiedImportFacts} has held each entry to the file the index sees
 * now, by the exact size and mtime the commit observed after placing it.
 *
 * @module
 */

import type { ContentFacts, FileMode } from '#types.js';
import type { ImportSourcePin } from '#importer/sources.js';

/**
 * Where a committed import keeps the facts its staging measured from its read-back. A member of
 * `.tau` that no registry row names, so it is never versioned, and a path no
 * import may carry, so a source cannot plant one.
 *
 * @public
 */
export const importFactsPath = '.tau/import.json';

/**
 * One staged entry: where it goes, and the facts measured as it was decoded.
 *
 * @public
 */
export type StagedImportEntry = Readonly<{
  path: string;
  size: number;
  mode?: FileMode;
  facts: ContentFacts & Readonly<{ blobOid: string; sha256: string }>;
}>;

/**
 * One recorded entry: a staged entry and the mtime its file had once placed.
 *
 * @public
 */
export type RecordedImportEntry = StagedImportEntry & Readonly<{ mtimeMs: number }>;

/**
 * The record at {@link importFactsPath}.
 *
 * @public
 */
export type ImportFactsRecord = Readonly<{
  version: 1;
  operationId: string;
  pin: ImportSourcePin;
  /** When the commit wrote the record (milliseconds since the epoch). */
  at?: number;
  entries: readonly RecordedImportEntry[];
}>;

/** The largest record a reader parses: 50,000 entries at a few hundred bytes each, with room. @public */
export const importFactsMaximumBytes = 64 * 1024 * 1024;

/** How far the record's own mtime may stand from the time it says it was written. @public */
export const importFactsSkewMilliseconds = 2 * 60 * 1000;

/**
 * How long after its commit a record is still taken. The record serves the
 * first open after an import; a later scan measures the files like any.
 *
 * @public
 */
export const importFactsFreshMilliseconds = 10 * 60 * 1000;

const hexOf = (length: number): RegExp => new RegExp(`^[0-9a-f]{${String(length)}}$`, 'u');
const sha1Hex = hexOf(40);
const sha256Hex = hexOf(64);

/**
 * Whether a value is a staged entry with well-formed facts.
 *
 * @param value - A parsed ledger or record entry.
 * @returns Whether it is one.
 * @public
 */
export const isStagedImportEntry = (value: unknown): value is StagedImportEntry => {
  const entry = value as Partial<StagedImportEntry> | undefined;
  return (
    typeof entry?.path === 'string' &&
    typeof entry.size === 'number' &&
    Number.isSafeInteger(entry.size) &&
    entry.size >= 0 &&
    typeof entry.facts?.blobOid === 'string' &&
    typeof entry.facts.sha256 === 'string' &&
    ['text', 'binary'].includes(String(entry.facts.contentKind))
  );
};

/**
 * Parse an import facts record, or nothing when the bytes are not one.
 *
 * @param bytes - The record's bytes.
 * @returns The record, its entries limited to well-formed ones.
 * @public
 */
export const parseImportFacts = (bytes: Uint8Array<ArrayBuffer>): ImportFactsRecord | undefined => {
  let parsed: Partial<ImportFactsRecord> | undefined;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<ImportFactsRecord> | undefined;
  } catch {
    return undefined;
  }
  if (
    parsed?.version !== 1 ||
    typeof parsed.operationId !== 'string' ||
    typeof parsed.at !== 'number' ||
    !Number.isFinite(parsed.at) ||
    !Array.isArray(parsed.entries)
  ) {
    return undefined;
  }
  return {
    ...(parsed as ImportFactsRecord),
    entries: parsed.entries.filter(
      (entry: unknown): entry is RecordedImportEntry =>
        isStagedImportEntry(entry) && Number.isFinite((entry as Partial<RecordedImportEntry>).mtimeMs),
    ),
  };
};

/**
 * The record's facts that still describe the files, each held to the file the
 * index sees now: exactly the size and mtime the commit observed after it
 * placed the file (so a same-size replacement carrying an older mtime, as
 * `cp -p` or `rsync -t` leave, is measured again), with ids of the right
 * form. Only from a record whose own mtime agrees with when it says it was
 * written (so it is the commit's, not one copied in or rewritten later), and
 * only while that is recent ({@link importFactsFreshMilliseconds}). Everything
 * else is dropped and measured again like any file.
 *
 * @param record - The parsed record.
 * @param times - The record file's mtime, from a provider whose mtimes are trustworthy, and the time now.
 * @param times.recordMtime - The record file's mtime.
 * @param times.now - The time now (milliseconds since the epoch).
 * @param current - What the index holds at a path now.
 * @returns The facts to seed, by path.
 * @public
 */
export const verifiedImportFacts = (
  record: ImportFactsRecord,
  { recordMtime, now }: Readonly<{ recordMtime: number; now: number }>,
  current: (path: string) => Readonly<{ kind: 'file' | 'dir'; size: number; mtimeMs: number }> | undefined,
): Map<string, Readonly<{ facts: ContentFacts; size: number; mtimeMs: number }>> => {
  const seeded = new Map<string, Readonly<{ facts: ContentFacts; size: number; mtimeMs: number }>>();
  if (
    record.at === undefined ||
    Math.abs(recordMtime - record.at) > importFactsSkewMilliseconds ||
    now - record.at > importFactsFreshMilliseconds ||
    record.at - now > importFactsSkewMilliseconds
  ) {
    return seeded;
  }
  for (const entry of record.entries) {
    const held = current(entry.path);
    if (
      held?.kind !== 'file' ||
      held.size !== entry.size ||
      held.mtimeMs !== entry.mtimeMs ||
      !sha1Hex.test(entry.facts.blobOid) ||
      !sha256Hex.test(entry.facts.sha256)
    ) {
      continue;
    }
    seeded.set(entry.path, {
      facts: {
        contentKind: entry.facts.contentKind,
        blobOid: entry.facts.blobOid,
        sha256: entry.facts.sha256,
        ...(entry.facts.lineCount === undefined ? {} : { lineCount: entry.facts.lineCount }),
      },
      size: held.size,
      mtimeMs: held.mtimeMs,
    });
  }
  return seeded;
};
