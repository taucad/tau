/**
 * Staging an import: entries stream into `<root>/.tau-staging/import-<operation>/`
 * as bounded changesets, each followed by a ledger record of what it landed
 * (charter D12, EQ8).
 *
 * The staging directory is the import's journal. `intent.json` holds the
 * operation and the source pin, written before any entry; `ledger/<n>.json`
 * holds, for each batch once its writes are durable, every entry's path, size,
 * mode and the facts (blob id, SHA-256, kind) measured from one read-back of
 * what the batch wrote (EQ6: the decode checks only the zip CRC). No record
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
 * no discovery sees the project before it is whole (I1). Entries under `.tau`
 * still stage under `tree/` there, and move in at commit: a folder holding
 * `.tau` without a manifest is one discovery offers for adoption, and adopting
 * a half-written import would make the staging write into a real project.
 * Such a folder is claimed exclusively and carries an owner marker
 * ({@link importOwnerPath}); a removal deletes only what the ledger names, and
 * only while the marker names the operation.
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
import type { FileSystemProvider } from '#types.js';
import { ImportRefusedError, isImportRefusal } from '#importer/limits.js';
import type { ImportRefusalReason } from '#importer/limits.js';
import { createInlineImportMeasurer } from '#importer/decode.js';
import type { ImportDecodedEntry, ImportDecoder, ImportMeasuredFacts, ImportMeasurer } from '#importer/decode.js';
import type { ImportPlan, ImportSourcePin, PlannedImportEntry } from '#importer/sources.js';
import { foldPathSpelling } from '#path-fold.js';
import { isStagedImportEntry } from '#importer/facts.js';
import type { StagedImportEntry } from '#importer/facts.js';

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
 * A staged import: the pin it was staged from, and every entry it holds.
 *
 * @public
 */
export type StagedImport = Readonly<{
  operationId: string;
  /** The staging directory, relative to the storage root. */
  directory: string;
  /**
   * Where the staged files are: `<directory>/tree`, or the project directory
   * they were written into (all but `.tau`, see {@link stagedEntryLocation}).
   */
  tree: string;
  /** The project directory the entries were written straight into, where a move would copy them. */
  inPlace?: string;
  /**
   * The project directory the commit should create: the in-place folder, or,
   * staged to move, the first of the names asked for that nothing holds yet.
   * Present when the stage was given a `target`.
   */
  target?: string;
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
  /**
   * Run `work` holding the lock a commit of the project directory `path`
   * holds, in every tab, so claiming an in-place folder, each batch written
   * into it and its removal never interleave with a create of the same
   * directory. A port without it (a test's) runs `work` directly.
   */
  exclusive?: <Result>(path: string, work: () => Promise<Result>) => Promise<Result>;
}>;

/**
 * Progress of a staging run.
 *
 * @public
 */
export type ImportStagingProgress = Readonly<{ files: number; bytes: number; totalFiles: number; totalBytes: number }>;

type Intent = Readonly<{
  version: 1;
  operationId: string;
  pin: ImportSourcePin;
  /** The project directory the entries are written into, while the import owns it. */
  inPlace?: string;
  /** When the intent was written (milliseconds since the epoch), what a sweep reads where mtimes are not kept. */
  at?: number;
}>;

/**
 * The owner marker an in-place import writes into the project directory it
 * creates, naming its operation. Every write into the directory, and every
 * removal from it, first checks that the marker still names the operation;
 * the commit removes it before the manifest. It sits beside `.tau`, never in
 * it: discovery offers a folder holding `.tau` but no manifest for adoption.
 *
 * @public
 */
export const importOwnerPath = '.tau-import-owner.json';

/**
 * Whether a staged entry belongs under `.tau` (in any spelling a filesystem
 * folds onto it). An in-place import keeps those entries in its staging tree
 * until the commit moves them in, so its pending folder never holds a `.tau`
 * that discovery would offer for adoption.
 *
 * @param path - A project-relative path.
 * @returns Whether the entry is Tau's own.
 * @public
 */
export const isTauControlPath = (path: string): boolean => {
  const [first = ''] = foldPathSpelling(path).split('/');
  return first === '.tau';
};

/**
 * Where one staged entry's bytes are: in the in-place folder, or (staged to
 * move, or under `.tau`) in the staging directory's `tree/`.
 *
 * @param staged - The staged import.
 * @param path - The entry's project-relative path.
 * @returns Its path on the storage root.
 * @public
 */
export const stagedEntryLocation = (staged: Pick<StagedImport, 'directory' | 'inPlace'>, path: string): string =>
  staged.inPlace === undefined || isTauControlPath(path)
    ? `${staged.directory}/tree/${path}`
    : `${staged.inPlace}/${path}`;

/** How many names an in-place import tries for its folder: the one asked, then `-2` up to this suffix. @public */
export const importTargetAttempts = 20;

/** Bytes of decoded entries an import holds at once, beyond a single entry larger than it (S6). @public */
export const importResidentBytes = 64 * 1024 * 1024;

/** How long a staging nobody owns must have been still before a sweep removes it. @public */
export const importStagingStaleMilliseconds = 10 * 60 * 1000;

/* Run under the port's directory lock where it has one. */
const exclusively = async <Result>(
  port: ImportStagingPort,
  path: string,
  work: () => Promise<Result>,
): Promise<Result> => (port.exclusive === undefined ? work() : port.exclusive(path, work));

/**
 * Whether the in-place folder's owner marker names this operation.
 *
 * @param provider - The storage root's provider.
 * @param directory - The project directory.
 * @param operationId - The import operation.
 * @returns Whether the import owns the folder.
 * @public
 */
export const ownsImportTarget = async (
  provider: FileSystemProvider,
  directory: string,
  operationId: string,
): Promise<boolean> => {
  const marker = (await readJson(provider, `${directory}/${importOwnerPath}`)) as { operationId?: unknown } | undefined;
  return marker?.operationId === operationId;
};

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
    for (const entry of ledgerEntries(record)) {
      if (isStagedImportEntry(entry)) {
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

/* A ledger record's entries: `{ at, entries }`, or the bare array an earlier build wrote. */
const ledgerEntries = (record: unknown): unknown[] => {
  if (Array.isArray(record)) {
    return record as unknown[];
  }
  const entries = (record as { entries?: unknown } | undefined)?.entries;
  return Array.isArray(entries) ? (entries as unknown[]) : [];
};

/* Every path a ledger names, the batches announced before their writes included: all an in-place import may remove. */
const recordedPaths = async (provider: FileSystemProvider, operationId: string): Promise<string[]> => {
  const directory = importStagingDirectory(operationId);
  let names: string[];
  try {
    names = await provider.readdir(`${directory}/ledger`);
  } catch (error) {
    if (isMissing(error)) {
      return [];
    }
    throw error;
  }
  const records = await Promise.all(
    names
      .filter((name) => /^\d+(?:\.pending)?\.json$/u.test(name))
      .map(async (name) => readJson(provider, `${directory}/ledger/${name}`)),
  );
  const paths = new Set<string>();
  for (const record of records) {
    for (const entry of ledgerEntries(record)) {
      const path = typeof entry === 'string' ? entry : (entry as { path?: unknown } | undefined)?.path;
      if (typeof path === 'string' && isSafeRecordedPath(path)) {
        paths.add(path);
      }
    }
  }
  return [...paths];
};

/* A recorded path is removed only when it is a plain relative path inside the folder. */
const isSafeRecordedPath = (path: string): boolean =>
  path !== '' &&
  !path.startsWith('/') &&
  path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');

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
 * Remove an import's staging. Entries it wrote into a project directory are
 * removed one by one, and only those its ledger names, then each directory
 * they leave empty, and only while the folder's owner marker still names the
 * operation and no manifest or identity has claimed it: a file anyone else
 * put there, and the folder holding it, stay. The staging directory itself
 * is private to the operation and goes whole.
 *
 * @param port - The storage root.
 * @param operationId - The import operation.
 * @public
 */
export const discardStagedImport = async (port: ImportStagingPort, operationId: string): Promise<void> => {
  const directory = importStagingDirectory(operationId);
  /* Entries written in place go first, while the staging still names them. */
  const intent = await readIntent(port.provider, operationId);
  if (intent?.inPlace !== undefined) {
    await removeOwnedEntries(port, intent.inPlace, operationId);
  }
  if (await port.provider.exists(directory)) {
    await applied(port, [{ op: 'delete', path: directory, kind: 'dir', recursive: true }]);
  }
};

const removeOwnedEntries = async (port: ImportStagingPort, target: string, operationId: string): Promise<void> => {
  const { provider } = port;
  await exclusively(port, target, async () => {
    if (!(await ownsImportTarget(provider, target, operationId)) || (await isClaimedByProject(provider, target))) {
      return;
    }
    /* Entries under `.tau` stage in the staging tree, never here: a `.tau` in the folder is not the import's. */
    const recorded = await recordedPaths(provider, operationId);
    const paths = recorded.filter((path) => !isTauControlPath(path));
    const present = await bounded(paths, 16, async (path) => {
      const stat = await provider.stat(`${target}/${path}`).catch(() => undefined);
      return stat?.type === 'file';
    });
    const files = paths.filter((_, index) => present[index] === true);
    for (let offset = 0; offset < files.length; offset += maximumChangesetEntries) {
      // oxlint-disable-next-line no-await-in-loop -- removals go in bounded changesets, one after another.
      await applied(
        port,
        files
          .slice(offset, offset + maximumChangesetEntries)
          .map((path): BatchEntry => ({ op: 'delete', path: `${target}/${path}`, kind: 'file' })),
      );
    }
    /* A linked import's `.git` was fetched straight into the folder (`stagedControlDirectory`): it is the import's whole. */
    const control = await provider.stat(`${target}/.git`).catch(() => undefined);
    if (control?.type === 'dir') {
      await applied(port, [{ op: 'delete', path: `${target}/.git`, kind: 'dir', recursive: true }]);
    }
    await applied(port, [{ op: 'delete', path: `${target}/${importOwnerPath}`, kind: 'file' }]);
    /* Then every folder those files leave empty, deepest first, the project folder last: never a recursive delete. */
    const folders = new Set<string>();
    for (const path of paths) {
      const segments = path.split('/');
      for (let depth = 1; depth < segments.length; depth += 1) {
        folders.add(segments.slice(0, depth).join('/'));
      }
    }
    const deepestFirst = [...folders].sort((left, right) => right.split('/').length - left.split('/').length);
    for (const folder of [...deepestFirst.map((relative) => `${target}/${relative}`), target]) {
      // oxlint-disable-next-line no-await-in-loop -- a folder is removed only once its children are.
      const children = await provider.readdir(folder).catch(() => undefined);
      if (children?.length === 0) {
        // oxlint-disable-next-line no-await-in-loop -- one empty folder at a time.
        await applied(port, [{ op: 'delete', path: folder, kind: 'dir', recursive: false }]);
      }
    }
  });
};

/**
 * Where a linked import's control plane is written: the `.git` the revisions
 * authority fetches a repository into, inside the import's own staging
 * directory, so a discard or a sweep removes it with the staging and no
 * discovery or index ever sees it (I6). The commit moves it into the project.
 *
 * @param operationId - The import operation.
 * @returns `.tau-staging/import-<operationId>/control/.git`.
 * @public
 */
export const importControlDirectory = (operationId: string): string =>
  `${importStagingDirectory(operationId)}/control/.git`;

/**
 * Where one staged linked import's control plane is written. Staged to move
 * (OPFS, Node: a rename is a metadata operation) it is the staging's own
 * {@link importControlDirectory}, renamed into the project at the commit.
 * Written in place (a picked folder, IndexedDB: a rename copies) it is the
 * project folder's `.git` from the start, as the import's files are, so no
 * pack is ever copied and the folder's owner marker covers it: a discard or a
 * sweep of the staging removes it with the import's other entries.
 *
 * @param staged - The staged import, as its first stage answered it.
 * @returns The `.git` directory the revisions authority fetches into.
 * @public
 */
export const stagedControlDirectory = (staged: Pick<StagedImport, 'operationId' | 'inPlace'>): string =>
  staged.inPlace === undefined ? importControlDirectory(staged.operationId) : `${staged.inPlace}/.git`;

/* Every file under a directory, relative to it, by listing alone. */
const filesUnder = async (provider: FileSystemProvider, root: string, prefix = ''): Promise<string[]> => {
  const files: string[] = [];
  for (const name of await provider.readdir(prefix === '' ? root : `${root}/${prefix}`)) {
    const relative = prefix === '' ? name : `${prefix}/${name}`;
    // oxlint-disable-next-line no-await-in-loop -- a control plane's few directories are walked in turn.
    const stat = await provider.stat(`${root}/${relative}`);
    // oxlint-disable-next-line no-await-in-loop -- a control plane's few directories are walked in turn.
    files.push(...(stat.type === 'dir' ? await filesUnder(provider, root, relative) : [relative]));
  }
  return files;
};

/**
 * Move a linked import's control plane into its project directory as
 * `.git`: one rename of the directory, so its bytes are never written again
 * where a rename is a metadata operation, and never pass through the
 * mutation pipeline (I6). A commit that stopped partway through the move is
 * finished file by file: whatever `.git` already holds at its staged size
 * stays (every object is content-addressed and every ref was written once, by
 * the same fetch), a file of any other size is a torn copy and is moved again,
 * and what is left in the staging goes with it. An in-place import's `.git` is
 * already in the project ({@link stagedControlDirectory}): nothing moves.
 *
 * @param provider - The storage root's provider.
 * @param operationId - The import operation.
 * @param target - The project directory.
 * @returns Whether the staging held a control plane.
 * @public
 */
export const placeStagedControl = async (
  provider: FileSystemProvider,
  operationId: string,
  target: string,
): Promise<boolean> => {
  const source = importControlDirectory(operationId);
  const destination = `${target}/.git`;
  const held = await provider.stat(source).catch(() => undefined);
  if (held?.type !== 'dir') {
    return false;
  }
  if (!(await provider.exists(destination))) {
    await provider.rename(source, destination);
    return true;
  }
  const left = await filesUnder(provider, source);
  /* A file the stopped move left at the destination is kept only at its source's size: a torn copy is moved again. */
  const kept = await Promise.all(
    left.map(async (relative) => {
      const [from, to] = await Promise.all([
        provider.stat(`${source}/${relative}`),
        provider.stat(`${destination}/${relative}`).catch(() => undefined),
      ]);
      if (to?.type === 'file' && to.size !== from.size) {
        await provider.unlink(`${destination}/${relative}`);
        return false;
      }
      return to !== undefined;
    }),
  );
  const missing = left.filter((_, index) => !kept[index]);
  const folders = new Set(
    missing.flatMap((relative) => {
      const slash = relative.lastIndexOf('/');
      return slash > 0 ? [`${destination}/${relative.slice(0, slash)}`] : [];
    }),
  );
  await Promise.all([...folders].map(async (folder) => provider.mkdir(folder, { recursive: true })));
  await Promise.all(
    missing.map(async (relative) => provider.rename(`${source}/${relative}`, `${destination}/${relative}`)),
  );
  return true;
};

/**
 * Let go of an in-place import's project directory before its manifest is
 * written: the intent is rewritten without it and the owner marker removed,
 * so no staging left behind, by a crash or a removal that failed, ever names
 * a committed project. The ledger stays, so a replay still checks every entry
 * at the directory.
 *
 * @param port - The storage root.
 * @param operationId - The import operation.
 * @public
 */
export const releaseStagedImport = async (port: ImportStagingPort, operationId: string): Promise<void> => {
  const intent = await readIntent(port.provider, operationId);
  if (intent?.inPlace === undefined) {
    return;
  }
  const { inPlace, ...released } = intent;
  await applied(port, [
    { op: 'write', path: `${importStagingDirectory(operationId)}/intent.json`, data: encode(released) },
  ]);
  if (await ownsImportTarget(port.provider, inPlace, operationId)) {
    await applied(port, [{ op: 'delete', path: `${inPlace}/${importOwnerPath}`, kind: 'file' }]);
  }
};

/**
 * Record that a live session still holds a staging, for a sweep on a host
 * that has no Web Locks to ask: a heartbeat beside the intent, written only
 * while the staging exists.
 *
 * @param port - The storage root.
 * @param operationId - The import operation.
 * @param now - The clock.
 * @public
 */
export const touchStagedImport = async (
  port: ImportStagingPort,
  operationId: string,
  now: number = Date.now(),
): Promise<void> => {
  const directory = importStagingDirectory(operationId);
  if (await port.provider.exists(`${directory}/intent.json`)) {
    await applied(port, [{ op: 'write', path: `${directory}/heartbeat.json`, data: encode({ at: now }) }]);
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
    if (owned.has(operationId) || input.held?.has(operationId) === true) {
      kept.push(operationId);
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- stagings are judged one at a time; a root holds few.
    const still = await stillFor(port.provider, name, now);
    if (still < staleAfter) {
      kept.push(operationId);
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- one staging is removed at a time.
    await discardStagedImport(port, operationId);
    removed.push(operationId);
  }
  return { removed, kept };
};

/*
 * How long a staging has gone unwritten: since the newest time its intent,
 * ledger or heartbeat recorded, by the writer's clock. A provider that keeps
 * no mtime (IndexedDB answers 0) cannot say, so the records carry their own;
 * a file's mtime counts only where the provider declares it trustworthy.
 */
const stillFor = async (provider: FileSystemProvider, name: string, now: number): Promise<number> => {
  const directory = `${importStagingFolder}/${name}`;
  const sequence = await lastLedgerSequence(provider, directory);
  const candidates = [`${directory}/intent.json`, `${directory}/heartbeat.json`];
  if (sequence > 0) {
    const stem = `${directory}/ledger/${String(sequence).padStart(6, '0')}`;
    candidates.push(`${stem}.json`, `${stem}.pending.json`);
  }
  const trustworthy = provider.capabilities.trustworthyMtime === true;
  const times = await Promise.all(
    candidates.map(async (path) => {
      const recorded = ((await readJson(provider, path)) as { at?: unknown } | undefined)?.at;
      if (typeof recorded === 'number' && Number.isFinite(recorded)) {
        return recorded;
      }
      if (!trustworthy) {
        return 0;
      }
      try {
        const { mtimeMs } = await provider.stat(path);
        return mtimeMs;
      } catch {
        return 0;
      }
    }),
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
 * the commit to move. A target someone already holds is never written into or
 * committed over: the first of `target`, `target-2` … that is free is taken
 * (created exclusively, with an owner marker, where the entries go in place),
 * and returned as {@link StagedImport.target}.
 *
 * Each batch is written, then read back, and its facts (blob id, SHA-256,
 * content kind) are measured from that read-back by `measure`, the compute
 * worker's where there is one, so the ledger holds the facts of the bytes on
 * disk and each file is hashed once (EQ6, I2). The decode only checks the
 * zip CRC-32. A read-back holds at most the batch's largest file beside the
 * decode budget.
 *
 * @param input - The storage root, the operation, the plan, the decoder, the
 *   read-back measurer (inline WebCrypto by default), the pending project
 *   directory, and optional decode concurrency, resident byte budget, signal
 *   and progress callback.
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
    measure?: ImportMeasurer;
    target?: string;
    concurrency?: number;
    residentBytes?: number;
    signal?: AbortSignal;
    onProgress?: (progress: ImportStagingProgress) => void;
  }>,
): Promise<StagedImport> => {
  const { port, operationId, plan, decode } = input;
  const measure = input.measure ?? createInlineImportMeasurer();
  const directory = importStagingDirectory(operationId);
  if (input.target !== undefined && !isProjectDirectory(input.target)) {
    throw new TypeError(`Not a project directory: ${input.target}`);
  }
  const writesInPlace = input.target !== undefined && port.provider.capabilities.movesInPlace !== true;
  const candidates = writesInPlace ? targetCandidates(input.target) : [];
  let staged = await readStagedImport(port.provider, operationId);
  /* A resumed in-place staging keeps its folder only while the folder's marker still names it. */
  if (
    staged !== undefined &&
    (!samePin(staged.pin, plan.pin) ||
      (staged.inPlace === undefined) === writesInPlace ||
      (staged.inPlace !== undefined &&
        (!candidates.includes(staged.inPlace) ||
          !(await ownsImportTarget(port.provider, staged.inPlace, operationId)))))
  ) {
    await discardStagedImport(port, operationId);
    staged = undefined;
  }
  let inPlace = staged?.inPlace;
  if (staged === undefined) {
    await discardStagedImport(port, operationId);
    const intentOf = (folder: string | undefined): BatchEntry => ({
      op: 'write',
      path: `${directory}/intent.json`,
      data: encode({
        version: 1,
        operationId,
        pin: plan.pin,
        ...(folder === undefined ? {} : { inPlace: folder }),
        at: Date.now(),
      } satisfies Intent),
    });
    if (writesInPlace) {
      /* The intent names the folder before the folder exists, so a crash after the claim leaves it findable. */
      for (const candidate of candidates) {
        // oxlint-disable-next-line no-await-in-loop -- one name is tried at a time, in order.
        await applied(port, [intentOf(candidate)]);
        // oxlint-disable-next-line no-await-in-loop -- the claim decides whether the next name is tried.
        if (await claimImportTarget(port, candidate, operationId)) {
          inPlace = candidate;
          break;
        }
      }
      if (inPlace === undefined) {
        await discardStagedImport(port, operationId);
        throw new Error(
          `No free folder for ${input.target}: every name up to ${String(importTargetAttempts)} is taken.`,
        );
      }
    } else {
      await applied(port, [intentOf(undefined)]);
    }
  }
  const tree = inPlace ?? `${directory}/tree`;
  const planned = new Map(plan.entries.map((entry) => [entry.path, entry]));
  /* A recorded entry counts only while its staged file still has its size: a stat, never a read (I3). */
  const kept = new Map<string, StagedImportEntry>();
  await bounded(staged?.entries ?? [], 16, async (entry) => {
    const wanted = planned.get(entry.path);
    if (wanted?.size !== entry.size) {
      return;
    }
    try {
      const stat = await port.provider.stat(stagedEntryLocation({ directory, inPlace }, entry.path));
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
  /*
   * The facts of what a batch wrote, from one read-back of each file (EQ6):
   * at most the batch's largest file is held at a time beyond the decode
   * budget, and the bytes are handed to the measurer, never kept.
   */
  /* Past a compute supervisor's default three restarts, so a worker that never loads ends in its inline fallback. */
  const measureAttempts = 6;
  const readBack = async (window: readonly PlannedImportEntry[]): Promise<Array<StagedImportEntry['facts']>> => {
    const held = byteBudget(Math.max(0, ...window.map(({ size }) => size)));
    /* Only the caller stops it: a later batch's failed decode still lets this written batch keep its record. */
    const stop = input.signal ?? new AbortController().signal;
    const measureOnce = async (entry: PlannedImportEntry): Promise<ImportMeasuredFacts> => {
      const bytes = await port.provider.readFile(stagedEntryLocation({ directory, inPlace }, entry.path));
      if (bytes.byteLength !== entry.size) {
        throw new ImportRefusedError('corrupt', {
          path: entry.path,
          message: 'A staged file did not read back as it was written.',
        });
      }
      return measure(bytes, entry.size);
    };
    return bounded(window, concurrency, async (entry) => {
      await held.acquire(entry.size, stop);
      try {
        /*
         * A measurer that died took the bytes it was handed with it: they are read from disk again. A worker
         * that never loads dies once per spawn until its supervisor gives up and measures inline, so the
         * read is retried past that point, never without bound.
         */
        const measureRetrying = async (attempt: number): Promise<ImportMeasuredFacts> => {
          try {
            return await measureOnce(entry);
          } catch (error) {
            if (!(error instanceof Error && error.name === 'ComputeWorkerCrashedError') || attempt >= measureAttempts) {
              throw error;
            }
            return measureRetrying(attempt + 1);
          }
        };
        const measured = await measureRetrying(1);
        const { size, ...facts } = measured;
        if (size !== entry.size) {
          throw new Error(
            `A staged file was measured at ${String(size)} bytes, not the ${String(entry.size)} written: ${entry.path}`,
          );
        }
        return facts;
      } finally {
        held.release(entry.size);
      }
    });
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
        const ledgerStem = `${directory}/ledger/${String(ledgerSequence).padStart(6, '0')}`;
        /* Announced before written: a crash between the two still leaves every path it wrote named. */
        // oxlint-disable-next-line no-await-in-loop -- the announcement precedes its batch.
        await applied(port, [
          {
            op: 'write',
            path: `${ledgerStem}.pending.json`,
            data: encode({ at: Date.now(), entries: window.map(({ path }) => path) }),
          },
        ]);
        const batch = window.map(
          (entry, at): BatchEntry => ({
            op: 'write',
            path: stagedEntryLocation({ directory, inPlace }, entry.path),
            data: decoded[at]!.data,
          }),
        );
        // oxlint-disable-next-line no-await-in-loop -- the ledger record follows its batch's durable writes.
        await (inPlace === undefined
          ? applied(port, batch)
          : exclusively(port, inPlace, async () => {
              /* Every batch asks again: a folder whose marker names another owner is not written into. */
              if (!(await ownsImportTarget(port.provider, inPlace, operationId))) {
                throw new Error(`The project folder ${inPlace} no longer belongs to this import.`);
              }
              await applied(port, batch);
            }));
        /* Written: the decoded bytes go, so the read-back is all this batch still holds. */
        decoded.length = 0;
        batch.length = 0;
      } finally {
        budget.release(windowBytes);
      }
      // oxlint-disable-next-line no-await-in-loop -- a batch's facts come from its own read-back, before its record.
      const measured = await readBack(window);
      const records: StagedImportEntry[] = window.map((entry, at) => ({
        path: entry.path,
        size: entry.size,
        ...(entry.mode === undefined ? {} : { mode: entry.mode }),
        facts: measured[at]!,
      }));
      const ledgerStem = `${directory}/ledger/${String(ledgerSequence).padStart(6, '0')}`;
      /* The record replaces its announcement: it names the same paths, with their facts. */
      // oxlint-disable-next-line no-await-in-loop -- one record per batch, after it.
      await applied(port, [
        { op: 'write', path: `${ledgerStem}.json`, data: encode({ at: Date.now(), entries: records }) },
        { op: 'delete', path: `${ledgerStem}.pending.json`, kind: 'file' },
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
  /* Staged to move, the commit creates the folder: the first name nothing holds now (it still refuses one taken later). */
  const target = inPlace ?? (input.target === undefined ? undefined : await firstFree(port.provider, input.target));
  return {
    operationId,
    directory,
    tree,
    ...(inPlace === undefined ? {} : { inPlace }),
    ...(target === undefined ? {} : { target }),
    pin: plan.pin,
    entries,
    bytes: plan.bytes,
  };
};

/* The folder asked for, then `name-2`, `name-3`… so an import never fails on a name someone else holds. */
const targetCandidates = (target: string): string[] => [
  target,
  ...Array.from({ length: importTargetAttempts - 1 }, (_, index) => `${target}-${String(index + 2)}`),
];

const firstFree = async (provider: FileSystemProvider, target: string): Promise<string> => {
  for (const candidate of targetCandidates(target)) {
    // oxlint-disable-next-line no-await-in-loop -- names are tried in order.
    if (!(await provider.exists(candidate))) {
      return candidate;
    }
  }
  throw new Error(`No free folder for ${target}: every name up to ${String(importTargetAttempts)} is taken.`);
};

/*
 * Create an in-place import's folder exclusively, under the directory's lock:
 * only when nothing is there, and with the owner marker inside before any
 * entry. A folder that exists (someone's own, a project, another import's) is
 * never written into.
 */
const claimImportTarget = async (port: ImportStagingPort, target: string, operationId: string): Promise<boolean> =>
  exclusively(port, target, async () => {
    if (await port.provider.exists(target)) {
      return false;
    }
    await applied(port, [
      { op: 'mkdir', path: target, recursive: true },
      { op: 'write', path: `${target}/${importOwnerPath}`, data: encode({ operationId, at: Date.now() }) },
    ]);
    return true;
  });

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
