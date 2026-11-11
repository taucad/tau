/**
 * The entries record's policy for `recordSync` (graphics event-driven state charter D6): its codec and the patch
 * algebra that lets a person's per-entry settings, and the renames and deletes of the files they belong to, land on
 * bytes another window, an agent or sync wrote in the meantime.
 *
 * A patch is the person's changes in the order they were made: path changes, and the fields changed on each path. A path
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

/** One step of a person's change: path changes in order, then the fields of each path after them. */
export type EntriesStep = Readonly<{
  moves: readonly EntryPathChange[];
  fields: Readonly<Record<string, EntryFields>>;
}>;

/**
 * What a person changed: steps applied in the order they were made. Steps are kept apart rather than folded into
 * one, because a field change made before a path change cannot always be carried past it (a rename onto a path
 * replaces whatever the file holds there, which the patch cannot know).
 */
export type EntriesPatch = readonly EntriesStep[];

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

const combineFieldMaps = (
  earlier: Readonly<Record<string, EntryFields>>,
  later: Readonly<Record<string, EntryFields>>,
): Record<string, EntryFields> => {
  const combined = { ...earlier };
  for (const [path, fields] of Object.entries(later)) {
    combined[path] = combineFields(combined[path], fields);
  }
  return combined;
};

/** The record as it is written: without the path changes that made it. */
export const withoutMoves = (record: EntriesRecord): WorkbenchEntries => {
  const { moves: _moves, ...written } = record;
  return written;
};

/**
 * What each patch wrote, by the text it produced, and the two patches a combined patch is made of. A path change is
 * not idempotent (a delete followed by a rename onto the deleted path removes the renamed entry when applied again),
 * yet the writer applies a patch again to the bytes it read back after a lost reply. A patch merged onto the very
 * text it produced, or a combined patch whose earlier part produced the text, applies only what is left. Both maps
 * are keyed by the patch object, which the machine keeps from issue to retry.
 */
const produced = new WeakMap<EntriesPatch, Set<string>>();
const parts = new WeakMap<EntriesPatch, Readonly<{ earlier: EntriesPatch; later: EntriesPatch }>>();

const serializeEntries = (record: WorkbenchEntries): string => workbenchRecords.entries.serialize(record);

const combinePatches = (earlier: EntriesPatch, later: EntriesPatch): EntriesPatch => {
  const last = earlier.at(-1);
  const [first, ...rest] = later;
  // A step with no path change folds into the step before it: fields over fields combine exactly.
  const combined =
    last && first?.moves.length === 0
      ? [...earlier.slice(0, -1), { moves: last.moves, fields: combineFieldMaps(last.fields, first.fields) }, ...rest]
      : [...earlier, ...later];
  parts.set(combined, { earlier, later });
  return combined;
};

/** The part of `patch` still to apply to a file that holds `text`. */
const remaining = (patch: EntriesPatch, text: string | undefined): EntriesPatch => {
  if (text !== undefined && produced.get(patch)?.has(text)) {
    return [];
  }
  const made = parts.get(patch);
  if (!made) {
    return patch;
  }
  const left = remaining(made.earlier, text);
  if (left === made.earlier) {
    return patch;
  }
  return left.length === 0 ? made.later : combinePatches(left, made.later);
};

/** The fields a patch leaves on each path of the record it is merged onto: the person's own fields there. */
export const authoredFields = (patch: EntriesPatch): Record<string, EntryFields> => {
  let fields: Record<string, EntryFields> = {};
  for (const step of patch) {
    fields = combineFieldMaps(moveKeys(fields, step.moves), step.fields);
  }
  return fields;
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
  serialize: (record) => serializeEntries(withoutMoves(record)),
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
    return moves.length === 0 && fields.size === 0 ? [] : [{ moves, fields: Object.fromEntries(fields) }];
  },
  combine: (earlier, later) => (earlier === undefined ? later : combinePatches(earlier, later)),
  merge(current, _next, patch) {
    const base: WorkbenchEntries = current === undefined ? { version: 1, entries: {} } : withoutMoves(current);
    let { entries } = base;
    for (const step of remaining(patch, current === undefined ? undefined : serializeEntries(base))) {
      entries = movePaths(entries, step.moves);
      for (const [path, fields] of Object.entries(step.fields)) {
        entries[path] = mergeEntry(entries[path], fields);
      }
    }
    const merged = { ...base, entries };
    try {
      const texts = produced.get(patch) ?? new Set<string>();
      texts.add(serializeEntries(merged));
      produced.set(patch, texts);
    } catch {
      // A record that cannot be written produces no text; the writer reports the same error when it serializes.
    }
    return merged;
  },
  isEmpty: (patch) => patch.every((step) => step.moves.length === 0 && Object.keys(step.fields).length === 0),
};
