/**
 * The entries record's policy for `recordSync` (graphics event-driven state charter D6): its codec and the patch
 * algebra that lets a person's per-entry settings, and the renames and deletes of the files they belong to, land on
 * bytes another window, an agent or sync wrote in the meantime.
 *
 * A patch is the path changes in the order they were made, then the fields changed on each path after them. A path
 * change cannot be seen in two records (a renamed entry looks like one removed and one added, and would lose what
 * another party changed on it), so the record a person asks for carries the changes that made it from its base in
 * `moves`. `moves` is never written: `serialize` drops it and `read` never returns it.
 */
import { workbenchRecords } from '@taucad/workbench';
import type { WorkbenchEntries } from '@taucad/workbench';
import type { RecordPolicy } from '#workbench-records/record-sync-policy.js';

type Entry = WorkbenchEntries['entries'][string];
type Components = NonNullable<Entry['components']>;

/** The fields of one entry a person changed: the render timeout (an own `undefined` removes it) and single component lists. */
export type EntryFields = Partial<Pick<Entry, 'renderTimeout'>> & { components?: Partial<Components> };

/** A file rename or delete; it applies to the path and to every path under it. */
export type EntryPathChange = Readonly<
  { type: 'rename'; oldPath: string; newPath: string } | { type: 'delete'; path: string }
>;

/** What a person changed: the path changes in order, then the fields of each path after them. */
export type EntriesPatch = Readonly<{
  moves: readonly EntryPathChange[];
  fields: Readonly<Record<string, EntryFields>>;
}>;

/** An entries record, and the path changes that made it from the record it was edited from. */
export type EntriesRecord = WorkbenchEntries & { readonly moves?: readonly EntryPathChange[] };

const componentFields = ['hidden', 'isolated', 'opacity'] as const;
const noComponents: Components = { hidden: [], isolated: [], opacity: [] };

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

/** Whether `path` is `prefix` or a path under it. */
export const matchesPath = (path: string, prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`);

/** Where `path` goes under a change, or `undefined` when the change deletes it. */
const movedPath = (path: string, change: EntryPathChange): string | undefined => {
  if (change.type === 'delete') {
    return matchesPath(path, change.path) ? undefined : path;
  }
  return matchesPath(path, change.oldPath) ? `${change.newPath}${path.slice(change.oldPath.length)}` : path;
};

/** Keyed values with their keys moved by one change; a moved key replaces what its new path held. */
const moveKey = <V>(values: Readonly<Record<string, V>>, change: EntryPathChange): Record<string, V> => {
  const moved = new Map<string, V>();
  const kept = new Map<string, V>();
  for (const [path, value] of Object.entries(values)) {
    const target = movedPath(path, change);
    if (target === undefined) {
      continue;
    }
    (target === path ? kept : moved).set(target, value);
  }
  return Object.fromEntries([...kept, ...moved]);
};

/** Keyed values with their keys moved by path changes, in order. */
const moveKeys = <V>(values: Readonly<Record<string, V>>, moves: readonly EntryPathChange[]): Record<string, V> => {
  let moved = { ...values };
  for (const change of moves) {
    moved = moveKey(moved, change);
  }
  return moved;
};

/** The entries of a record after path changes. */
export const movePaths = (
  entries: Readonly<Record<string, Entry>>,
  moves: readonly EntryPathChange[],
): Record<string, Entry> => moveKeys(entries, moves);

const withoutTimeout = (entry: Entry | undefined): Entry => {
  const { renderTimeout: _removed, ...rest } = entry ?? {};
  return rest;
};

/** An entry with a person's fields over it. */
const mergeEntry = (existing: Entry | undefined, fields: EntryFields): Entry => ({
  ...(Object.hasOwn(fields, 'renderTimeout') ? withoutTimeout(existing) : existing),
  ...(fields.renderTimeout === undefined ? {} : { renderTimeout: fields.renderTimeout }),
  ...(fields.components === undefined
    ? {}
    : {
        components: {
          hidden: fields.components.hidden ?? existing?.components?.hidden ?? [],
          isolated: fields.components.isolated ?? existing?.components?.isolated ?? [],
          opacity: fields.components.opacity ?? existing?.components?.opacity ?? [],
        },
      }),
});

/** The fields of `next` that differ from `base`; missing components are the empty lists. */
const diffEntry = (base: Entry | undefined, next: Entry): EntryFields => {
  const fields: EntryFields = {};
  if (!same(base?.renderTimeout, next.renderTimeout)) {
    fields.renderTimeout = next.renderTimeout;
  }
  const before = base?.components ?? noComponents;
  const after = next.components ?? noComponents;
  const components: Partial<Components> = {};
  for (const field of componentFields) {
    if (!same(before[field], after[field])) {
      Object.assign(components, { [field]: after[field] });
    }
  }
  if (Object.keys(components).length > 0) {
    fields.components = components;
  }
  return fields;
};

const combineFields = (earlier: EntryFields | undefined, later: EntryFields): EntryFields => ({
  ...earlier,
  ...later,
  ...((earlier?.components ?? later.components) ? { components: { ...earlier?.components, ...later.components } } : {}),
});

/** The record as it is written: without the path changes that made it. */
export const withoutMoves = (record: EntriesRecord): WorkbenchEntries => {
  const { moves: _moves, ...written } = record;
  return written;
};

/** The entries record's codec and patch algebra. */
export const entriesPolicy: RecordPolicy<EntriesRecord, EntriesPatch> = {
  read(bytes) {
    const result = workbenchRecords.entries.read(bytes);
    return result.status === 'current'
      ? { status: 'current', record: result.record }
      : {
          status: result.code === 'NEWER_RECORD' ? 'newer' : 'invalid',
          code: result.code,
          message: result.message,
        };
  },
  serialize: (record) => workbenchRecords.entries.serialize(withoutMoves(record)),
  diff(base, next) {
    const moves = next.moves ?? [];
    const moved = movePaths(base?.entries ?? {}, moves);
    const fields = new Map<string, EntryFields>();
    for (const [path, entry] of Object.entries(next.entries)) {
      const changed = diffEntry(moved[path], entry);
      if (Object.keys(changed).length > 0) {
        fields.set(path, changed);
      }
    }
    return { moves, fields: Object.fromEntries(fields) };
  },
  combine(earlier, later) {
    if (earlier === undefined) {
      return later;
    }
    // What was changed before a path change goes where the change takes its path, or with it when it is deleted.
    const moved = moveKeys(earlier.fields, later.moves);
    for (const [path, fields] of Object.entries(later.fields)) {
      moved[path] = combineFields(moved[path], fields);
    }
    return { moves: [...earlier.moves, ...later.moves], fields: moved };
  },
  merge(current, _next, patch) {
    const base: WorkbenchEntries = current === undefined ? { version: 1, entries: {} } : withoutMoves(current);
    const entries = movePaths(base.entries, patch.moves);
    for (const [path, fields] of Object.entries(patch.fields)) {
      entries[path] = mergeEntry(entries[path], fields);
    }
    return { ...base, entries };
  },
  isEmpty: (patch) => patch.moves.length === 0 && Object.keys(patch.fields).length === 0,
};
