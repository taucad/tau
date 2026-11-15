/**
 * A checkout's last comparison, kept across sessions (Tau #2013; charter D5, D11).
 *
 * A comparison answers one tree id for the files a checkout holds. Its answer
 * is a function of the files' bytes and modes, the head the store records them
 * over, and the ignore rules that choose them; this record keeps, for each
 * captured file, the stats the Project Index gave and a clock reading taken
 * before its bytes were read, with the head and the ignore context. A later
 * session whose index, once it has compared itself with the disk (D5), states
 * the very same versioned paths at the same sizes and timestamps — none of them
 * written within the racy window of its read (EQ7) — under the same head and
 * rules holds the same files, and answers the same tree id without reading one
 * (I3; D11's capture by index deltas, across sessions). Anything else
 * reads the checkout as before: the record only ever spares a read, so a
 * missing, torn or stale record costs a walk, never a wrong answer (I5).
 *
 * A control-plane file beside the store's own records (I6): no tree records
 * it, and only the revision authority writes it, whole, by rename.
 *
 * @module
 */
import { timestampGranularityMilliseconds } from '@taucad/filesystem';
import type { FileMode, FileStatEntry } from '@taucad/filesystem';

/**
 * One captured file: `[path, size, mtimeMs, readAt]`, its stats as the index
 * stated them and a clock reading taken before its bytes were read.
 */
export type CompareStat = readonly [path: string, size: number, mtimeMs: number, readAt: number];

/** How one captured file was read: the index's stats of it and a clock reading, both taken before its bytes. */
export type CompareReading = Readonly<{ readAt: number; size: number; mtimeMs: number }>;

/** What a comparison was answered over. @internal */
export type CompareRecord = Readonly<{
  treeId: string;
  /** The checkout it was answered for: a record is never another checkout's. */
  checkoutId: string;
  /**
   * A fingerprint of the rules that turn files into a tree id (the path
   * registry, the large-object threshold, the store's engine and format), so a
   * release that changes them cannot answer an earlier one's tree id.
   */
  rules: string;
  /** The checkout's head: the store records the files over it, and inherits its modes. */
  head: string | undefined;
  /** The ignore rules' context, or `''` for a store that applies none. */
  ignores: string;
  /** Every captured file, sorted by path. */
  files: readonly CompareStat[];
  /** The versioned paths the ignore rules left out, sorted: only their presence decides. */
  ignored: readonly string[];
  /** The mode each captured file had, where the provider reports modes: a mode change moves no stat. */
  modes?: Readonly<Record<string, FileMode>>;
}>;

/** What a session sees now: the head, the ignore context and every versioned file the index states. @internal */
export type CompareObservation = Readonly<{
  checkoutId: string;
  rules: string;
  head: string | undefined;
  ignores: string;
  stats: readonly FileStatEntry[];
}>;

/**
 * The revision of Tau's own rules that turn files into a tree id: the clean
 * step (`lfs.ts`), tree recording and the tree-id memo. Bump it with any change
 * to them that can move a tree id, so a record an earlier release kept answers
 * nothing; the host's rules (registry, threshold, engine) are fingerprinted
 * beside it.
 *
 * @internal
 */
export const compareRulesRevision = 1;

/**
 * The text a record's rules fingerprint digests: Tau's rules revision, then
 * the host's parts.
 *
 * @internal
 * @param parts - The registry, threshold and engine facts, JSON-serializable.
 * @returns The JSON text.
 */
export const compareRulesText = (parts: readonly unknown[]): string =>
  JSON.stringify([`tau-rules-${String(compareRulesRevision)}`, ...parts]);

const recordFormat = 'tau-checkout-compare';
const recordVersion = 2;

/**
 * Past this many files no record is kept: the record would cost more to write
 * on every comparison than the walk it spares on a reopen costs once.
 */
export const compareRecordMaximumFiles = 20_000;

/**
 * Where one checkout's record lives, under the store's `.git`.
 *
 * @internal
 * @param checkoutId - The checkout.
 * @returns The path, or `undefined` for an id that is not a plain file name.
 */
export const compareRecordPath = (checkoutId: string): string | undefined =>
  /^[\w-]{1,128}$/u.test(checkoutId) ? `.git/tau-compare-${checkoutId}.json` : undefined;

/*
 * A rules file the rules leave out itself: no captured stat moves when it is
 * edited, yet the edit can choose other files, so no record keys on its absence.
 */
const ignoreRulesFile = /(?:^|\/)\.gitignore$/iu;

const byPath = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/**
 * The record of one comparison's tree.
 *
 * @internal
 * @param answer - The tree id, the checkout, rules, head and ignore context it was answered under, and each
 *   captured file's mode where the provider reports modes.
 * @param stats - The index's stats now, of every versioned path.
 * @param readings - How each captured file was read, by path.
 * @returns The record, or `undefined` when a captured file has no reading, or has moved since it was read (the
 *   record would only ever be refused), or an ignored path is a `.gitignore`, whose edit no captured stat would
 *   show.
 */
export const compareRecordOf = (
  answer: Readonly<{
    treeId: string;
    checkoutId: string;
    rules: string;
    head: string | undefined;
    ignores: string;
    modes?: Readonly<Record<string, FileMode>> | undefined;
  }>,
  stats: readonly FileStatEntry[],
  readings: ReadonlyMap<string, CompareReading>,
): CompareRecord | undefined => {
  const { modes, ...answered } = answer;
  const files: CompareStat[] = [];
  const ignored: string[] = [];
  for (const { path, size, mtimeMs } of stats) {
    const reading = readings.get(path);
    if (reading === undefined) {
      ignored.push(path);
    } else if (reading.size !== size || reading.mtimeMs !== mtimeMs) {
      return undefined;
    } else {
      files.push([path, size, mtimeMs, reading.readAt]);
    }
  }
  if (files.length !== readings.size || ignored.some((path) => ignoreRulesFile.test(path))) {
    return undefined;
  }
  return {
    ...answered,
    files: files.toSorted(([left], [right]) => byPath(left, right)),
    ignored: ignored.toSorted(byPath),
    ...(modes === undefined ? {} : { modes }),
  };
};

/**
 * Whether a fresh observation holds the files a record was answered over: the
 * same checkout, rules, head and ignore context, every captured file at the same size and
 * timestamp, each written more than the racy window before it was read (a file
 * written that close to its read may have changed again without moving its
 * stats), and the same versioned paths left out.
 *
 * @internal
 * @param record - The stored record.
 * @param now - The observation taken now.
 * @returns Whether the record's tree id answers for the files now.
 */
export const recordAnswers = (record: CompareRecord, now: CompareObservation): boolean => {
  if (
    record.checkoutId !== now.checkoutId ||
    record.rules !== now.rules ||
    record.head !== now.head ||
    record.ignores !== now.ignores ||
    record.files.length + record.ignored.length !== now.stats.length
  ) {
    return false;
  }
  const current = new Map(now.stats.map((entry) => [entry.path, entry] as const));
  for (const [path, size, mtimeMs, readAt] of record.files) {
    const stat = current.get(path);
    if (stat?.size !== size || stat.mtimeMs !== mtimeMs || readAt - mtimeMs <= timestampGranularityMilliseconds) {
      return false;
    }
  }
  return record.ignored.every((path) => current.has(path));
};

/**
 * The record's text.
 *
 * @internal
 * @param record - The record.
 * @returns JSON, newline-terminated.
 */
export const serializeCompareRecord = (record: CompareRecord): string =>
  `${JSON.stringify({ format: recordFormat, version: recordVersion, ...record })}\n`;

const isStat = (value: unknown): value is CompareStat =>
  Array.isArray(value) &&
  value.length === 4 &&
  typeof value[0] === 'string' &&
  value.slice(1).every((field) => typeof field === 'number');

const isModes = (value: unknown): value is Record<string, FileMode> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((mode) => mode === '100644' || mode === '100755');

/**
 * A stored record, or `undefined` for any text that is not a whole one of this version.
 *
 * @internal
 * @param text - The file's text.
 * @returns The record.
 */
export const parseCompareRecord = (text: string): CompareRecord | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const { format, version, checkoutId, rules, head, ignores, files, ignored, treeId, modes } = value as Record<
    string,
    unknown
  >;
  if (
    format !== recordFormat ||
    version !== recordVersion ||
    typeof checkoutId !== 'string' ||
    typeof rules !== 'string' ||
    (head !== undefined && typeof head !== 'string') ||
    typeof ignores !== 'string' ||
    typeof treeId !== 'string' ||
    !Array.isArray(files) ||
    !files.every((file) => isStat(file)) ||
    !Array.isArray(ignored) ||
    !ignored.every((path) => typeof path === 'string') ||
    (modes !== undefined && !isModes(modes))
  ) {
    return undefined;
  }
  return {
    checkoutId,
    rules,
    head,
    ignores,
    files,
    ignored,
    treeId,
    ...(modes === undefined ? {} : { modes }),
  };
};
