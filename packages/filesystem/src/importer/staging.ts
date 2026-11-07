/**
 * Staging an import: entries stream into `<root>/.tau-staging/import-<operation>/`
 * as bounded changesets, each followed by a ledger record of what it landed
 * (charter D12, EQ8).
 *
 * The staging directory is the import's journal. `intent.json` holds the
 * operation and the source pin, written before any entry; `ledger/<n>.json`
 * holds, for each batch once its writes are durable, every entry's path, size,
 * mode and the facts (blob id, SHA-256, kind) the decode measured. No record
 * holds bytes: the bytes are the staged files under `tree/`, written once.
 * An import that stops — a crash, a closed tab, a cancelled review — resumes
 * from the ledger: the same source pin skips every entry a record covers and
 * whose staged file still has its size (a stat, no read), and a different pin
 * starts over.
 *
 * Batches are at most {@link maximumChangesetEntries} entries or
 * {@link maximumChangesetBytes} bytes (a larger file is a batch of one), and
 * the next batch decodes while the last one writes, so an import holds at
 * most two batches and the largest file in memory.
 *
 * @module
 */

import { maximumChangesetBytes, maximumChangesetEntries } from '#changeset.js';
import type { BatchEntry, BatchReceipt } from '#changeset.js';
import type { ContentFacts, FileMode, FileSystemProvider } from '#types.js';
import { ImportRefusedError, isImportRefusal } from '#importer/limits.js';
import type { ImportDecodedEntry, ImportDecoder } from '#importer/decode.js';
import type { ImportPlan, ImportSourcePin, PlannedImportEntry } from '#importer/sources.js';

/** The storage root's reserved staging folder (I9). @public */
export const importStagingFolder = '.tau-staging';

/** Every import's staging directory starts with this, so the OPFS sweep of dead writers' staging leaves it. @public */
export const importStagingPrefix = 'import-';

const operationIdPattern = /^[\w-]{1,128}$/u;

/**
 * The staging directory of one import operation, relative to its storage root.
 *
 * @param operationId - The import operation's id.
 * @returns `.tau-staging/import-<operationId>`.
 * @throws TypeError for an id that is not a plain token.
 * @public
 */
export const importStagingDirectory = (operationId: string): string => {
  if (!operationIdPattern.test(operationId)) {
    throw new TypeError(`Not an import operation id: ${operationId}`);
  }
  return `${importStagingFolder}/${importStagingPrefix}${operationId}`;
};

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
 * A staged import: the pin it was staged from, and every entry it holds.
 *
 * @public
 */
export type StagedImport = Readonly<{
  operationId: string;
  /** The staging directory, relative to the storage root. */
  directory: string;
  pin: ImportSourcePin;
  entries: readonly StagedImportEntry[];
  bytes: number;
}>;

/**
 * Where staging writes: the storage root's provider, and the authority's
 * unlocked batch apply over it (staging is private to its operation, so it
 * takes no lock and holds none across the source's reads, I11).
 *
 * @public
 */
export type ImportStagingPort = Readonly<{
  provider: FileSystemProvider;
  apply: (entries: readonly BatchEntry[]) => Promise<readonly BatchReceipt[]>;
}>;

/**
 * Progress of a staging run.
 *
 * @public
 */
export type ImportStagingProgress = Readonly<{ files: number; bytes: number; totalFiles: number; totalBytes: number }>;

type Intent = Readonly<{ version: 1; operationId: string; pin: ImportSourcePin }>;

const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));

const isMissing = (error: unknown): boolean => (error as { code?: unknown } | undefined)?.code === 'ENOENT';

const readJson = async (provider: FileSystemProvider, path: string): Promise<unknown> => {
  try {
    return JSON.parse(new TextDecoder().decode(await provider.readFile(path))) as unknown;
  } catch (error) {
    if (isMissing(error) || error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
};

const samePin = (left: ImportSourcePin, right: ImportSourcePin): boolean =>
  JSON.stringify(left, Object.keys(left).sort()) === JSON.stringify(right, Object.keys(right).sort());

const isStagedEntry = (value: unknown): value is StagedImportEntry => {
  const entry = value as Partial<StagedImportEntry> | undefined;
  return (
    typeof entry?.path === 'string' &&
    typeof entry.size === 'number' &&
    typeof entry.facts?.blobOid === 'string' &&
    typeof entry.facts.sha256 === 'string' &&
    ['text', 'binary'].includes(String(entry.facts.contentKind))
  );
};

const applied = async (port: ImportStagingPort, entries: readonly BatchEntry[]): Promise<void> => {
  const receipts = await port.apply(entries);
  const failure = receipts.find(({ outcome }) => outcome !== 'applied');
  if (failure !== undefined) {
    throw failure.error instanceof Error ? failure.error : new Error('An import batch did not apply.');
  }
};

/**
 * Read what a staging directory holds: its pin and every entry its ledger
 * records, or nothing when no import was staged there.
 *
 * @param provider - The storage root's provider.
 * @param operationId - The import operation.
 * @returns The staged import, or `undefined`.
 * @public
 */
export const readStagedImport = async (
  provider: FileSystemProvider,
  operationId: string,
): Promise<StagedImport | undefined> => {
  const directory = importStagingDirectory(operationId);
  const intent = (await readJson(provider, `${directory}/intent.json`)) as Intent | undefined;
  if (intent?.version !== 1 || intent.operationId !== operationId) {
    return undefined;
  }
  let names: string[];
  try {
    names = await provider.readdir(`${directory}/ledger`);
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }
    names = [];
  }
  const records = await Promise.all(
    names
      .filter((name) => /^\d+\.json$/u.test(name))
      .sort()
      .map(async (name) => readJson(provider, `${directory}/ledger/${name}`)),
  );
  const byPath = new Map<string, StagedImportEntry>();
  for (const record of records) {
    for (const entry of Array.isArray(record) ? (record as unknown[]) : []) {
      if (isStagedEntry(entry)) {
        byPath.set(entry.path, entry);
      }
    }
  }
  const entries = [...byPath.values()];
  return {
    operationId,
    directory,
    pin: intent.pin,
    entries,
    bytes: entries.reduce((sum, { size }) => sum + size, 0),
  };
};

/**
 * Remove a staging directory and everything in it.
 *
 * @param port - The storage root.
 * @param operationId - The import operation.
 * @public
 */
export const discardStagedImport = async (port: ImportStagingPort, operationId: string): Promise<void> => {
  const directory = importStagingDirectory(operationId);
  if (await port.provider.exists(directory)) {
    await applied(port, [{ op: 'delete', path: directory, kind: 'dir', recursive: true }]);
  }
};

/* Consecutive entries grouped into changesets of bounded count and bytes; a larger entry is alone. */
const windowsOf = (entries: readonly PlannedImportEntry[]): PlannedImportEntry[][] => {
  const windows: PlannedImportEntry[][] = [];
  let current: PlannedImportEntry[] = [];
  let bytes = 0;
  for (const entry of entries) {
    if (
      current.length > 0 &&
      (current.length >= maximumChangesetEntries || bytes + entry.size > maximumChangesetBytes)
    ) {
      windows.push(current);
      current = [];
      bytes = 0;
    }
    current.push(entry);
    bytes += entry.size;
  }
  if (current.length > 0) {
    windows.push(current);
  }
  return windows;
};

/* Run `work` over `items` with at most `limit` in flight, results in item order. */
const bounded = async <Item, Result>(
  items: readonly Item[],
  limit: number,
  work: (item: Item) => Promise<Result>,
): Promise<Result[]> => {
  const results: Result[] = Array.from({ length: items.length });
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      // oxlint-disable-next-line no-await-in-loop -- each lane runs its items one after another.
      results[index] = await work(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
};

/**
 * Stage a planned import, or resume one staged from the same source.
 *
 * @param input - The storage root, the operation, the plan, the decoder, and
 *   optional decode concurrency, signal and progress callback.
 * @returns Every staged entry, in plan order.
 * @throws ImportRefusedError when an entry does not decode to its declared bytes.
 * @public
 */
export const stageImport = async (
  input: Readonly<{
    port: ImportStagingPort;
    operationId: string;
    plan: ImportPlan;
    decode: ImportDecoder;
    concurrency?: number;
    signal?: AbortSignal;
    onProgress?: (progress: ImportStagingProgress) => void;
  }>,
): Promise<StagedImport> => {
  const { port, operationId, plan, decode, signal } = input;
  const directory = importStagingDirectory(operationId);
  const tree = `${directory}/tree`;
  let staged = await readStagedImport(port.provider, operationId);
  if (staged !== undefined && !samePin(staged.pin, plan.pin)) {
    await discardStagedImport(port, operationId);
    staged = undefined;
  }
  if (staged === undefined) {
    await discardStagedImport(port, operationId);
    await applied(port, [
      { op: 'write', path: `${directory}/intent.json`, data: encode({ version: 1, operationId, pin: plan.pin }) },
    ]);
  }
  const planned = new Map(plan.entries.map((entry) => [entry.path, entry]));
  /* A recorded entry counts only while its staged file still has its size: a stat, never a read (I3). */
  const kept = new Map<string, StagedImportEntry>();
  await bounded(staged?.entries ?? [], 16, async (entry) => {
    const wanted = planned.get(entry.path);
    if (wanted?.size !== entry.size) {
      return;
    }
    try {
      const stat = await port.provider.stat(`${tree}/${entry.path}`);
      if (stat.type === 'file' && stat.size === entry.size) {
        kept.set(entry.path, entry);
      }
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
    }
  });
  let ledgerSequence = (staged === undefined ? 0 : await lastLedgerSequence(port.provider, directory)) + 1;
  const remaining = plan.entries.filter((entry) => !kept.has(entry.path));
  const totals = { totalFiles: plan.entries.length, totalBytes: plan.bytes };
  let doneFiles = kept.size;
  let doneBytes = [...kept.values()].reduce((sum, { size }) => sum + size, 0);
  input.onProgress?.({ files: doneFiles, bytes: doneBytes, ...totals });
  const concurrency = Math.max(1, input.concurrency ?? 4);
  const decodeWindow = async (window: readonly PlannedImportEntry[]): Promise<ImportDecodedEntry[]> =>
    bounded(window, concurrency, async (entry) => {
      signal?.throwIfAborted();
      try {
        const decoded = await decode(entry.request);
        if (decoded.data.byteLength !== entry.size) {
          throw new ImportRefusedError('corrupt', { path: entry.path });
        }
        return decoded;
      } catch (error) {
        if (error instanceof ImportRefusedError || signal?.aborted === true) {
          throw error;
        }
        /* A refusal revived from a worker keeps its sentence; anything the worker named corrupt is damage. */
        if (
          isImportRefusal(error) ||
          (error instanceof Error && (error.name === 'CorruptBytesError' || error.name === 'ImportRefusedError'))
        ) {
          throw new ImportRefusedError('corrupt', { path: entry.path, cause: error });
        }
        throw error;
      }
    });
  /* Settled, never rejected: a later batch's failure is seen when its turn comes, not while another one writes. */
  const settled = async (
    window: readonly PlannedImportEntry[],
  ): Promise<Readonly<{ decoded: ImportDecodedEntry[] } | { error: unknown }>> => {
    try {
      return { decoded: await decodeWindow(window) };
    } catch (error) {
      return { error };
    }
  };
  const windows = windowsOf(remaining);
  /* One batch decodes while the one before it writes: at most two in hand. */
  let decoding = windows.length === 0 ? undefined : settled(windows[0]!);
  for (let index = 0; index < windows.length; index += 1) {
    const window = windows[index]!;
    // oxlint-disable-next-line no-await-in-loop -- batches are written in order, each after its decode.
    const outcome = await decoding!;
    if ('error' in outcome) {
      throw outcome.error;
    }
    const { decoded } = outcome;
    signal?.throwIfAborted();
    decoding = index + 1 < windows.length ? settled(windows[index + 1]!) : undefined;
    // oxlint-disable-next-line no-await-in-loop -- the ledger record follows its batch's durable writes.
    await applied(
      port,
      window.map((entry, at) => ({
        op: 'write',
        path: `${tree}/${entry.path}`,
        data: decoded[at]!.data,
      })),
    );
    const records: StagedImportEntry[] = window.map((entry, at) => ({
      path: entry.path,
      size: entry.size,
      ...(entry.mode === undefined ? {} : { mode: entry.mode }),
      facts: decoded[at]!.facts,
    }));
    // oxlint-disable-next-line no-await-in-loop -- one record per batch, after it.
    await applied(port, [
      {
        op: 'write',
        path: `${directory}/ledger/${String(ledgerSequence).padStart(6, '0')}.json`,
        data: encode(records),
      },
    ]);
    ledgerSequence += 1;
    for (const record of records) {
      kept.set(record.path, record);
      doneFiles += 1;
      doneBytes += record.size;
    }
    input.onProgress?.({ files: doneFiles, bytes: doneBytes, ...totals });
  }
  const entries = plan.entries.map((entry) => kept.get(entry.path)!);
  return { operationId, directory, pin: plan.pin, entries, bytes: plan.bytes };
};

const lastLedgerSequence = async (provider: FileSystemProvider, directory: string): Promise<number> => {
  try {
    const names = await provider.readdir(`${directory}/ledger`);
    return Math.max(
      0,
      ...names.map((name) => Number.parseInt(name, 10)).filter((sequence) => Number.isSafeInteger(sequence)),
    );
  } catch (error) {
    if (isMissing(error)) {
      return 0;
    }
    throw error;
  }
};
