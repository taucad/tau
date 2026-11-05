/**
 * The Project Index's persisted snapshot in `<root>/.tau/index/` (charter D5).
 *
 * A member of Tau's own `.tau` directory that no registry row names, so every
 * released client already treats it as unversioned and the generated ignore
 * block's `/.tau/*` keeps it out of a checkout; the indexes never list it (I9). The
 * snapshot carries the cross-tab vector it was written at, and a writer replaces
 * it only under the root's index lock and only when its own vector has seen
 * everything the stored one has (a CAS), so a stale tab never overwrites a newer
 * snapshot. Two writers that each saw something the other did not leave a
 * snapshot that forces a rescan at the next load.
 *
 * @module
 */

import type { ContentFacts, FileSystemProvider } from '#types.js';
import type { FactsAt, SnapshotRow } from '#project-index/project-index.js';

/** The reserved directory, relative to its root, every indexed root keeps its snapshot in. @public */
export const projectIndexDirectory = '.tau/index';

/** The snapshot's file name inside {@link projectIndexDirectory}. */
const snapshotFile = 'snapshot.json';

const snapshotFormat = 'tau-project-index';
const snapshotVersion = 1;

/**
 * Cross-tab ordering of what an index has seen (D3, D5): the root's generation
 * and, per tab, the last change notice it accounted for.
 *
 * @public
 */
export type IndexVector = Readonly<{ generation: number; seqByTab: Readonly<Record<string, number>> }>;

/** One snapshot as stored. @internal */
export type IndexSnapshot = Readonly<{
  vector: IndexVector;
  /** Set when two incomparable writers met: the next load rescans. */
  rescan: boolean;
  writtenAt: number;
  entries: readonly SnapshotRow[];
}>;

/** How one vector relates to another. @internal */
export type VectorOrder = 'equal' | 'ahead' | 'behind' | 'incomparable';

/**
 * Compare two vectors by their per-tab sequence numbers.
 *
 * @param ours - The vector a writer holds.
 * @param stored - The vector already persisted.
 * @returns `ahead` when ours has seen everything stored has and more, `behind`
 *   for the reverse, `equal`, or `incomparable` when each saw something the
 *   other did not.
 * @internal
 */
export const compareVectors = (ours: IndexVector, stored: IndexVector): VectorOrder => {
  let ahead = false;
  let behind = false;
  for (const tab of new Set([...Object.keys(ours.seqByTab), ...Object.keys(stored.seqByTab)])) {
    const mine = ours.seqByTab[tab] ?? 0;
    const theirs = stored.seqByTab[tab] ?? 0;
    ahead ||= mine > theirs;
    behind ||= mine < theirs;
  }
  /* Generations are each tab's own count, so they order nothing across tabs:
   * two writers that saw the same notices hold equally valid views. */
  if (!ahead && !behind) {
    return 'equal';
  }
  if (ahead && behind) {
    return 'incomparable';
  }
  return ahead ? 'ahead' : 'behind';
};

/**
 * The component-wise maximum of two vectors.
 *
 * @param left - One vector.
 * @param right - The other.
 * @returns Their join.
 * @internal
 */
export const joinVectors = (left: IndexVector, right: IndexVector): IndexVector => {
  const seqByTab: Record<string, number> = { ...left.seqByTab };
  for (const [tab, seq] of Object.entries(right.seqByTab)) {
    seqByTab[tab] = Math.max(seqByTab[tab] ?? 0, seq);
  }
  return { generation: Math.max(left.generation, right.generation), seqByTab };
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const hex = /^[\da-f]+$/u;

const isFacts = (value: unknown): value is ContentFacts =>
  isRecord(value) &&
  (value['contentKind'] === 'text' || value['contentKind'] === 'binary') &&
  (value['lineCount'] === undefined || isCount(value['lineCount'])) &&
  (value['sha256'] === undefined || (typeof value['sha256'] === 'string' && hex.test(value['sha256']))) &&
  (value['blobOid'] === undefined || (typeof value['blobOid'] === 'string' && hex.test(value['blobOid'])));

const isFactsAt = (value: unknown): value is FactsAt =>
  isRecord(value) && isCount(value['size']) && isTime(value['mtimeMs']) && isTime(value['observedAt']);

const isRow = (value: unknown): value is SnapshotRow => {
  if (!Array.isArray(value) || value.length < 4 || value.length > 6) {
    return false;
  }
  const [path, kind, size, mtimeMs, facts, factsAt] = value as unknown[];
  return (
    typeof path === 'string' &&
    path.length > 0 &&
    !path.startsWith('/') &&
    (kind === 'f' || kind === 'd') &&
    isCount(size) &&
    isTime(mtimeMs) &&
    (facts === undefined || (kind === 'f' && isFacts(facts) && isFactsAt(factsAt)))
  );
};

/**
 * Parse stored snapshot bytes, refusing anything malformed (a refusal means a scan).
 *
 * @param text - The file's text.
 * @returns The snapshot, or `undefined` when it cannot be trusted.
 * @internal
 */
export const parseIndexSnapshot = (text: string): IndexSnapshot | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(value) || value['format'] !== snapshotFormat || value['version'] !== snapshotVersion) {
    return undefined;
  }
  const { vector, rescan, writtenAt, entries } = value;
  if (
    !isRecord(vector) ||
    !isCount(vector['generation']) ||
    !isRecord(vector['seqByTab']) ||
    !Object.values(vector['seqByTab']).every((seq) => isCount(seq)) ||
    typeof rescan !== 'boolean' ||
    !isTime(writtenAt) ||
    !Array.isArray(entries) ||
    !entries.every((entry) => isRow(entry))
  ) {
    return undefined;
  }
  return {
    vector: { generation: vector['generation'], seqByTab: vector['seqByTab'] as Record<string, number> },
    rescan,
    writtenAt,
    entries,
  };
};

/**
 * Serialize a snapshot.
 *
 * @param snapshot - What to store.
 * @returns The file's text.
 * @internal
 */
export const serializeIndexSnapshot = (snapshot: IndexSnapshot): string =>
  JSON.stringify({ format: snapshotFormat, version: snapshotVersion, ...snapshot });

/**
 * Where one root's snapshot lives on its provider.
 *
 * @param providerRoot - The root's provider-relative path.
 * @returns The snapshot path.
 * @internal
 */
export const snapshotPath = (providerRoot: string): string =>
  `${providerRoot === '' ? '' : `${providerRoot}/`}${projectIndexDirectory}/${snapshotFile}`;

/**
 * Read one root's snapshot, if there is a valid one.
 *
 * @param provider - The root's provider.
 * @param providerRoot - The root's provider-relative path.
 * @returns The snapshot, or `undefined`.
 * @internal
 */
export const readIndexSnapshot = async (
  provider: Pick<FileSystemProvider, 'readFile'>,
  providerRoot: string,
): Promise<IndexSnapshot | undefined> => {
  try {
    return parseIndexSnapshot(await provider.readFile(snapshotPath(providerRoot), 'utf8'));
  } catch {
    return undefined;
  }
};

/** Run under the root's exclusive index lock; directly where Web Locks are absent. */
const withIndexLock = async <T>(name: string, operation: () => Promise<T>): Promise<T> => {
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  if (locks === undefined) {
    return operation();
  }
  return locks.request(name, { mode: 'exclusive' }, operation) as Promise<T>;
};

/**
 * Write one root's snapshot under its index lock, with a CAS on the stored vector.
 *
 * `ahead` or `equal` writes; `behind` does not (`'stale'`): another tab already
 * stored a newer snapshot. `incomparable` stores the joined vector marked
 * `rescan`, so neither writer's partial view is trusted at the next load.
 *
 * @param options - The provider and root, the lock name, and the snapshot to store.
 * @returns `'written'` or `'stale'`.
 * @internal
 */
export const writeIndexSnapshot = async (options: {
  provider: Pick<FileSystemProvider, 'readFile' | 'writeFile' | 'mkdir'>;
  providerRoot: string;
  lockName: string;
  snapshot: () => IndexSnapshot;
}): Promise<'written' | 'stale'> => {
  const { provider, providerRoot, lockName } = options;
  return withIndexLock(lockName, async () => {
    const stored = await readIndexSnapshot(provider, providerRoot);
    const ours = options.snapshot();
    let next = ours;
    if (stored !== undefined) {
      const order = compareVectors(ours.vector, stored.vector);
      if (order === 'behind') {
        return 'stale';
      }
      if (order === 'incomparable') {
        next = { ...ours, vector: joinVectors(ours.vector, stored.vector), rescan: true };
      }
    }
    const directory = `${providerRoot === '' ? '' : `${providerRoot}/`}${projectIndexDirectory}`;
    await provider.mkdir(directory, { recursive: true });
    await provider.writeFile(snapshotPath(providerRoot), serializeIndexSnapshot(next));
    return 'written';
  });
};
