/**
 * The language worker's mirror of one root's Project Index (charter D13,
 * S13): what lets `fileExists`, `directoryExists` and a script version be
 * answered synchronously in the worker, with no slot round trip to the file
 * manager and no read (I3).
 *
 * The file manager feeds it with {@link TauIndexMirrorMessage}s: one `reset`
 * carrying the whole index, then the index's own changes after each change set
 * (`changedSince`), so the worker is updated incrementally and never rescans.
 *
 * @module
 */

import type { IndexEntry, IndexEntryKind, IndexMirror, IndexMirrorChange } from '@taucad/filesystem';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { z } from 'zod';

/** One index entry on the wire: `[path, kind, size, mtimeMs, generation]`. @public */
export type IndexMirrorWireEntry = readonly [
  path: string,
  kind: 'f' | 'd',
  size: number,
  mtimeMs: number,
  generation: number,
];

/**
 * What the file manager posts on the sync port to keep the worker's mirror
 * current: `reset` replaces the whole mirror, `changes` applies on top of it
 * (removals first, then entries), and `stale` says the feed could not ask
 * the index, so the mirror knows nothing until the next `reset` and the slot
 * answers every probe.
 *
 * `excluded` names the root-relative subtrees the index never holds beyond
 * the policy's unwatched rows: its reserved paths and each nested mount below
 * the root (I9). A message that carries it replaces the mirror's list.
 *
 * @public
 */
export type TauIndexMirrorMessage = Readonly<{
  tau: 'index-mirror';
  kind: 'reset' | 'changes' | 'stale';
  generation: number;
  entries: readonly IndexMirrorWireEntry[];
  removed: readonly string[];
  excluded?: readonly string[];
}>;

const wireEntrySchema = z.tuple([
  z.string(),
  z.enum(['f', 'd']),
  z.number().nonnegative(),
  z.number(),
  z.number().int().nonnegative(),
]);

/** @public */
export const tauIndexMirrorMessageSchema = z.object({
  tau: z.literal('index-mirror'),
  kind: z.enum(['reset', 'changes', 'stale']),
  generation: z.number().int().nonnegative(),
  entries: z.array(wireEntrySchema),
  removed: z.array(z.string()),
  excluded: z.array(z.string()).optional(),
});

/**
 * Whether the policy lets the root's index hold a path at all: the rows
 * nothing watches (`node_modules`, the control plane, caches) are never
 * indexed (the index's own scan rule, I9), so a miss there says nothing and
 * the slot must answer. The mirror's own `covers` adds the reserved paths and
 * nested mounts the feed names.
 *
 * @param relativePath - Root-relative path.
 * @returns True when the index would hold the path if it existed.
 * @public
 */
export const indexMirrorCovers = (relativePath: string): boolean =>
  relativePath === '' || tauPathPolicy.classify(relativePath).watch !== 'none';

/**
 * Encode one index entry for the wire.
 *
 * @param entry - The entry as the index answers it.
 * @returns Its wire row.
 * @public
 */
export const toIndexMirrorWireEntry = (
  entry: Pick<IndexEntry, 'path' | 'kind' | 'size' | 'mtimeMs' | 'generation'>,
): IndexMirrorWireEntry => [entry.path, entry.kind === 'dir' ? 'd' : 'f', entry.size, entry.mtimeMs, entry.generation];

const fromWire = ([path, kind, size, mtimeMs, generation]: IndexMirrorWireEntry): IndexEntry => ({
  path,
  kind: kind === 'd' ? 'dir' : 'file',
  size,
  mtimeMs,
  generation,
});

const parentOf = (path: string): string => {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
};

const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

const isAtOrBelow = (path: string, prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`);

/** A mirror that also takes the file manager's wire messages. @public */
export type WorkerIndexMirror = IndexMirror &
  Readonly<{
    /** Whether a `reset` has arrived since the last `stale`: until then nothing is known and the slot answers. */
    ready(): boolean;
    /** Whether the index would hold `relativePath` if it existed, so a miss here is a definite absence. */
    covers(relativePath: string): boolean;
    /** Apply one wire message. */
    receive(message: TauIndexMirrorMessage): void;
    /** Entries held. */
    size(): number;
  }>;

/**
 * Create an empty mirror.
 *
 * @returns A mirror that knows nothing until its first `reset`.
 * @public
 */
export const createIndexMirror = (): WorkerIndexMirror => {
  const entries = new Map<string, IndexEntry>();
  /* Each directory's children by name, so a listing never scans the whole map. */
  const children = new Map<string, Set<string>>();
  let received = false;
  let excluded: readonly string[] = [];

  const link = (path: string): void => {
    const parent = parentOf(path);
    let names = children.get(parent);
    if (names === undefined) {
      names = new Set();
      children.set(parent, names);
    }
    names.add(nameOf(path));
  };

  const remove = (path: string): void => {
    const names = children.get(path);
    if (names !== undefined) {
      for (const name of names) {
        remove(path === '' ? name : `${path}/${name}`);
      }
      children.delete(path);
    }
    if (entries.delete(path)) {
      children.get(parentOf(path))?.delete(nameOf(path));
    }
  };

  const put = (entry: IndexEntry): void => {
    const existing = entries.get(entry.path);
    if (existing !== undefined && existing.kind !== entry.kind) {
      remove(entry.path);
    }
    entries.set(entry.path, entry);
    link(entry.path);
  };

  const apply = (changes: readonly IndexMirrorChange[]): void => {
    for (const change of changes) {
      if (change.op === 'deleted') {
        remove(change.path);
        continue;
      }
      if (change.op === 'moved' && change.oldPath !== undefined) {
        remove(change.oldPath);
      }
      if (change.entry !== undefined) {
        put(change.entry);
      }
    }
  };

  const kindOf = (path: string): IndexEntryKind | undefined => (path === '' ? 'dir' : entries.get(path)?.kind);

  return {
    apply,
    entry: (path) => entries.get(path),
    children: (path) =>
      kindOf(path) === 'dir'
        ? [...(children.get(path) ?? [])]
            .sort()
            .map((name) => entries.get(path === '' ? name : `${path}/${name}`))
            .filter((entry): entry is IndexEntry => entry !== undefined)
        : [],
    version: (path) => {
      const entry = entries.get(path);
      return entry === undefined ? '' : `${String(entry.generation)}:${String(entry.size)}:${String(entry.mtimeMs)}`;
    },
    ready: () => received,
    covers: (relativePath) =>
      relativePath === '' ||
      (indexMirrorCovers(relativePath) && !excluded.some((prefix) => isAtOrBelow(relativePath, prefix))),
    size: () => entries.size,
    receive: (message) => {
      if (message.excluded !== undefined) {
        excluded = message.excluded;
      }
      if (message.kind === 'stale') {
        entries.clear();
        children.clear();
        received = false;
        return;
      }
      if (message.kind === 'reset') {
        entries.clear();
        children.clear();
        received = true;
      } else if (!received) {
        /* Changes before the first whole index have nothing to apply to. */
        return;
      }
      apply([
        ...message.removed.map((path): IndexMirrorChange => ({ op: 'deleted', path })),
        ...message.entries.map((row): IndexMirrorChange => ({ op: 'written', path: row[0], entry: fromWire(row) })),
      ]);
    },
  };
};
