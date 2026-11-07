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
 * the next batch decodes while the last one writes, under one byte budget
 * ({@link importResidentBytes}, or the one entry alone when it is larger), so
 * an import holds at most that budget plus its largest file in memory.
 *
 * Where the bytes land depends on what a move costs. A provider whose rename
 * is a metadata operation (`movesInPlace`: OPFS, Node) stages under `tree/`
 * and the commit moves each file into the project. On one whose rename copies
 * (IndexedDB, a picked folder) a move would write every byte again, so the
 * entries are written straight into the pending project directory instead,
 * once; that directory has no `tau.json` until the commit writes it last, so
 * no discovery sees the project before it is whole (I1).
 *
 * A staging nobody will commit is removed: by the session that made it on
 * every failure, cancel and close, and otherwise by
 * {@link sweepStagedImports}, which removes each staging no journal row or
 * live session owns once it has been still for a while.
 *
 * @module
 */

import { maximumChangesetBytes, maximumChangesetEntries } from '#changeset.js';
import type { BatchEntry, BatchReceipt } from '#changeset.js';
import type { ContentFacts, FileMode, FileSystemProvider } from '#types.js';
import { ImportRefusedError, isImportRefusal } from '#importer/limits.js';
import type { ImportRefusalReason } from '#importer/limits.js';
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
  /** Where the staged files are: `<directory>/tree`, or the project directory they were written into. */
  tree: string;
  /** The project directory the entries were written straight into, where a move would copy them. */
  inPlace?: string;
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

type Intent = Readonly<{ version: 1; operationId: string; pin: ImportSourcePin; inPlace?: string }>;

/** Bytes of decoded entries an import holds at once, beyond a single entry larger than it (S6). @public */
export const importResidentBytes = 64 * 1024 * 1024;

/** How long a staging nobody owns must have been still before a sweep removes it. @public */
export const importStagingStaleMilliseconds = 10 * 60 * 1000;

/**
 * Where a committed import keeps the facts its decode measured (every entry's
 * blob id, SHA-256, kind and mode), so the first revision and the Project
 * Index build from them instead of hashing the files again. A member of `.tau`
 * that no registry row names, so it is never versioned.
 *
 * @public
 */
export const importFactsPath = '.tau/import.json';

/**
 * The record at {@link importFactsPath}.
 *
 * @public
 */
export type ImportFactsRecord = Readonly<{
  version: 1;
  operationId: string;
  pin: ImportSourcePin;
  entries: readonly StagedImportEntry[];
}>;

/**
 * The name of the lock a live staging session holds, so a sweep in another
 * tab can tell it from an abandoned one.
 *
 * @param operationId - The import operation.
 * @returns The lock name.
 * @public
 */
export const importStagingLeaseName = (operationId: string): string => `tau:import-staging:${operationId}`;

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
  const intent = await readIntent(provider, operationId);
  if (intent === undefined) {
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
    tree: intent.inPlace ?? `${directory}/tree`,
    ...(intent.inPlace === undefined ? {} : { inPlace: intent.inPlace }),
    pin: intent.pin,
    entries,
    bytes: entries.reduce((sum, { size }) => sum + size, 0),
  };
};

const readIntent = async (provider: FileSystemProvider, operationId: string): Promise<Intent | undefined> => {
  const intent = (await readJson(provider, `${importStagingDirectory(operationId)}/intent.json`)) as Intent | undefined;
  if (intent?.version !== 1 || intent.operationId !== operationId) {
    return undefined;
  }
  return intent.inPlace === undefined || isProjectDirectory(intent.inPlace) ? intent : undefined;
};

/* A pending project directory: relative, one or more plain segments, never Tau's own dot folders. */
const isProjectDirectory = (path: string): boolean =>
  path !== '' &&
  !path.startsWith('.') &&
  path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');

/* A directory the commit has written its identity or manifest into belongs to the project now, not the import. */
const isClaimedByProject = async (provider: FileSystemProvider, directory: string): Promise<boolean> =>
  (await provider.exists(`${directory}/tau.json`)) || provider.exists(`${directory}/.tau/project.json`);

/**
 * Remove a staging directory and everything in it.
 *
 * @param port - The storage root.
 * @param operationId - The import operation.
 * @public
 */
export const discardStagedImport = async (port: ImportStagingPort, operationId: string): Promise<void> => {
  const directory = importStagingDirectory(operationId);
  /* Entries written in place go first, while the staging still names their folder. */
  const intent = await readIntent(port.provider, operationId);
  if (
    intent?.inPlace !== undefined &&
    (await port.provider.exists(intent.inPlace)) &&
    !(await isClaimedByProject(port.provider, intent.inPlace))
  ) {
    await applied(port, [{ op: 'delete', path: intent.inPlace, kind: 'dir', recursive: true }]);
  }
  if (await port.provider.exists(directory)) {
    await applied(port, [{ op: 'delete', path: directory, kind: 'dir', recursive: true }]);
  }
};

/**
 * Remove every import staging on a storage root that nothing will commit: no
 * journal row names it (`owned`), no live session holds its lease (`held`),
 * and it has been still for {@link importStagingStaleMilliseconds}, so a
 * staging another tab finished a moment ago and is about to journal is left
 * alone. A staging written in place takes its project directory with it,
 * unless the commit already made that directory a project.
 *
 * @param input - The storage root, the operations journal rows and live sessions own, and the clock.
 * @returns The operations removed and those kept.
 * @public
 */
export const sweepStagedImports = async (
  input: Readonly<{
    port: ImportStagingPort;
    owned: ReadonlySet<string>;
    held?: ReadonlySet<string>;
    /** Milliseconds. */
    staleAfter?: number;
    now?: number;
  }>,
): Promise<Readonly<{ removed: string[]; kept: string[] }>> => {
  const { port, owned } = input;
  const now = input.now ?? Date.now();
  const staleAfter = input.staleAfter ?? importStagingStaleMilliseconds;
  let names: string[];
  try {
    names = await port.provider.readdir(importStagingFolder);
  } catch (error) {
    if (isMissing(error)) {
      return { removed: [], kept: [] };
    }
    throw error;
  }
  const removed: string[] = [];
  const kept: string[] = [];
  for (const name of names.sort()) {
    const operationId = name.slice(importStagingPrefix.length);
    if (!name.startsWith(importStagingPrefix) || !operationIdPattern.test(operationId)) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- stagings are judged one at a time; a root holds few.
    if (
      owned.has(operationId) ||
      input.held?.has(operationId) === true ||
      (await stillFor(port.provider, name, now)) < staleAfter
    ) {
      kept.push(operationId);
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- one staging is removed at a time.
    await discardStagedImport(port, operationId);
    removed.push(operationId);
  }
  return { removed, kept };
};

/* How long a staging has gone unwritten: since its newest ledger record, its intent or the directory itself. */
const stillFor = async (provider: FileSystemProvider, name: string, now: number): Promise<number> => {
  const directory = `${importStagingFolder}/${name}`;
  const sequence = await lastLedgerSequence(provider, directory);
  /* Files only: a directory's mtime is synthesized by some providers. */
  const candidates = [`${directory}/intent.json`];
  if (sequence > 0) {
    candidates.push(`${directory}/ledger/${String(sequence).padStart(6, '0')}.json`);
  }
  const times = await Promise.all(
    candidates.map(async (path) =>
      provider
        .stat(path)
        .then(({ mtimeMs }) => mtimeMs)
        .catch(() => 0),
    ),
  );
  return now - Math.max(0, ...times);
};

/* Consecutive entries grouped into changesets of bounded count and bytes; a larger entry is alone. */
const windowsOf = (entries: readonly PlannedImportEntry[], maximumBytes: number): PlannedImportEntry[][] => {
  const windows: PlannedImportEntry[][] = [];
  let current: PlannedImportEntry[] = [];
  let bytes = 0;
  for (const entry of entries) {
    if (current.length > 0 && (current.length >= maximumChangesetEntries || bytes + entry.size > maximumBytes)) {
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

/* A byte budget decodes wait on: one may always go when nothing is held, so the largest entry fits alone. */
const byteBudget = (capacity: number) => {
  let held = 0;
  const waiting: Array<Readonly<{ bytes: number; ready: PromiseWithResolvers<void> }>> = [];
  const admit = (): void => {
    while (waiting.length > 0 && (held === 0 || held + waiting[0]!.bytes <= capacity)) {
      const next = waiting.shift()!;
      held += next.bytes;
      next.ready.resolve();
    }
  };
  return {
    acquire: async (bytes: number, signal: AbortSignal): Promise<void> => {
      signal.throwIfAborted();
      const ready = Promise.withResolvers<void>();
      const waiter = { bytes, ready };
      waiting.push(waiter);
      admit();
      const stop = (): void => {
        const at = waiting.indexOf(waiter);
        if (at !== -1) {
          waiting.splice(at, 1);
          ready.reject(signal.reason);
        }
      };
      signal.addEventListener('abort', stop, { once: true });
      try {
        await ready.promise;
      } finally {
        signal.removeEventListener('abort', stop);
      }
    },
    release: (bytes: number): void => {
      held -= bytes;
      admit();
    },
  };
};

/* A refusal keeps its reason across the worker boundary; anything else the decoder threw stays what it was. */
const refusalOf = (error: unknown, path: string): Error => {
  if (error instanceof ImportRefusedError) {
    return error;
  }
  if (isImportRefusal(error) || (error instanceof Error && error.name === 'CorruptBytesError')) {
    const { reason } = error as { reason?: unknown };
    return new ImportRefusedError(isRefusalReason(reason) ? reason : 'corrupt', { path, cause: error });
  }
  return asError(error);
};

const asError = (value: unknown): Error => (value instanceof Error ? value : new Error(String(value)));

const refusalReasons: ReadonlySet<string> = new Set<ImportRefusalReason>([
  'archiveTooLarge',
  'expandedTooLarge',
  'fileTooLarge',
  'ratioTooHigh',
  'pathTooLong',
  'tooManyEntries',
  'unsafePath',
  'collision',
  'encrypted',
  'unsupported',
  'corrupt',
  'empty',
]);

const isRefusalReason = (value: unknown): value is ImportRefusalReason =>
  typeof value === 'string' && refusalReasons.has(value);

/**
 * Stage a planned import, or resume one staged from the same source.
 *
 * With a `target` (the pending project directory the commit will create) on
 * a provider whose rename copies, the entries are written straight into that
 * directory; otherwise they stage under the staging directory's `tree/` for
 * the commit to move. A fresh in-place staging refuses a target that exists.
 *
 * @param input - The storage root, the operation, the plan, the decoder, the
 *   pending project directory, and optional decode concurrency, resident byte
 *   budget, signal and progress callback.
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
    target?: string;
    concurrency?: number;
    residentBytes?: number;
    signal?: AbortSignal;
    onProgress?: (progress: ImportStagingProgress) => void;
  }>,
): Promise<StagedImport> => {
  const { port, operationId, plan, decode } = input;
  const directory = importStagingDirectory(operationId);
  if (input.target !== undefined && !isProjectDirectory(input.target)) {
    throw new TypeError(`Not a project directory: ${input.target}`);
  }
  const inPlace =
    input.target !== undefined && port.provider.capabilities.movesInPlace !== true ? input.target : undefined;
  const tree = inPlace ?? `${directory}/tree`;
  let staged = await readStagedImport(port.provider, operationId);
  if (staged !== undefined && (!samePin(staged.pin, plan.pin) || staged.inPlace !== inPlace)) {
    await discardStagedImport(port, operationId);
    staged = undefined;
  }
  if (inPlace !== undefined && staged !== undefined && (await isClaimedByProject(port.provider, inPlace))) {
    throw new Error(`The project folder ${inPlace} is already a project.`);
  }
  if (staged === undefined) {
    await discardStagedImport(port, operationId);
    if (inPlace !== undefined && (await port.provider.exists(inPlace))) {
      throw new Error(`The project folder ${inPlace} already exists.`);
    }
    await applied(port, [
      {
        op: 'write',
        path: `${directory}/intent.json`,
        data: encode({ version: 1, operationId, pin: plan.pin, ...(inPlace === undefined ? {} : { inPlace }) }),
      },
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
  const residentBytes = input.residentBytes ?? importResidentBytes;
  const budget = byteBudget(residentBytes);
  /* A failure anywhere stops every decode still queued or running, as the caller's abort does. */
  const halt = new AbortController();
  const signal = input.signal === undefined ? halt.signal : AbortSignal.any([input.signal, halt.signal]);
  const decodeWindow = async (window: readonly PlannedImportEntry[]): Promise<ImportDecodedEntry[]> => {
    let acquired = 0;
    try {
      return await bounded(window, concurrency, async (entry) => {
        await budget.acquire(entry.size, signal);
        acquired += entry.size;
        try {
          const decoded = await decode(entry.request, { signal });
          signal.throwIfAborted();
          if (decoded.data.byteLength !== entry.size) {
            throw new ImportRefusedError('corrupt', { path: entry.path });
          }
          return decoded;
        } catch (error) {
          throw signal.aborted && !(error instanceof ImportRefusedError)
            ? asError(signal.reason)
            : refusalOf(error, entry.path);
        }
      });
    } catch (error) {
      halt.abort(error);
      budget.release(acquired);
      throw error;
    }
  };
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
  /* Two windows fit the budget, one writing while the next decodes; an entry larger than that is a window alone. */
  const windows = windowsOf(remaining, Math.min(maximumChangesetBytes, Math.floor(residentBytes / 2)));
  /* One batch decodes while the one before it writes, both inside the byte budget. */
  let decoding = windows.length === 0 ? undefined : settled(windows[0]!);
  try {
    for (let index = 0; index < windows.length; index += 1) {
      const window = windows[index]!;
      // oxlint-disable-next-line no-await-in-loop -- batches are written in order, each after its decode.
      const outcome = await decoding!;
      decoding = undefined;
      if ('error' in outcome) {
        throw outcome.error;
      }
      const { decoded } = outcome;
      const windowBytes = window.reduce((sum, { size }) => sum + size, 0);
      try {
        signal.throwIfAborted();
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
      } finally {
        budget.release(windowBytes);
      }
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
  } catch (error) {
    /* Nothing decodes on after the import stopped: the lookahead is told, and waited for. */
    halt.abort(error);
    await decoding;
    throw error;
  }
  const entries = plan.entries.map((entry) => kept.get(entry.path)!);
  return {
    operationId,
    directory,
    tree,
    ...(inPlace === undefined ? {} : { inPlace }),
    pin: plan.pin,
    entries,
    bytes: plan.bytes,
  };
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
