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

/** The most marks a patch keeps: one per write of it that may have landed, as many as the writer keeps lost writes. */
const maxMarks = 8;
/** The most records a mark keeps: one per checked write of the same steps (a conflict re-merges them). */
const maxMarkRecords = 4;

/** The record a patch's first `upTo` steps produced when it was merged, which a later file may already hold. */
type Mark = Readonly<{ upTo: number; records: readonly WorkbenchEntries[] }>;

/**
 * What each patch wrote, by the prefix of its steps that produced each record. Path changes are not idempotent (a
 * delete followed by a rename onto the deleted path removes the renamed entry when applied again), yet the writer
 * applies a patch again to the bytes it reads back after a lost reply, and a later combined patch carries the same
 * steps. When the file holds what a prefix produced on every path those steps touch, whatever another party did to
 * other paths, the prefix has landed and only the steps after it are applied. Keyed by the patch object, which the
 * machine keeps from issue to retry; a combined patch inherits the marks of its earlier part, whose steps it starts
 * with.
 */
const marks = new WeakMap<EntriesPatch, readonly Mark[]>();

const serializeEntries = (record: WorkbenchEntries): string => workbenchRecords.entries.serialize(record);

/**
 * Steps with every step that has no path change folded into the one before it (fields over fields combine exactly),
 * except across a marked prefix's end, which must stay a step boundary.
 */
const compact = (steps: EntriesPatch, kept: readonly Mark[]): { steps: EntriesStep[]; marks: Mark[] } => {
  const boundaries = new Set(kept.map((mark) => mark.upTo));
  const folded: EntriesStep[] = [];
  const position = new Map<number, number>([[0, 0]]);
  for (const [index, step] of steps.entries()) {
    const last = folded.at(-1);
    if (last && step.moves.length === 0 && !boundaries.has(index)) {
      folded[folded.length - 1] = { moves: last.moves, fields: combineFieldMaps(last.fields, step.fields) };
    } else {
      folded.push(step);
    }
    position.set(index + 1, folded.length);
  }
  return { steps: folded, marks: kept.map((mark) => ({ ...mark, upTo: position.get(mark.upTo) ?? folded.length })) };
};

const combinePatches = (earlier: EntriesPatch, later: EntriesPatch): EntriesPatch => {
  const combined = compact([...earlier, ...later], marks.get(earlier) ?? []);
  if (combined.marks.length > 0) {
    marks.set(combined.steps, combined.marks);
  }
  return combined.steps;
};

/** Whether `path` is one the steps read or write: a field they set, or a path under a change's old or new path. */
const touches = (steps: readonly EntriesStep[], path: string): boolean =>
  steps.some(
    (step) =>
      Object.hasOwn(step.fields, path) ||
      step.moves.some((change) =>
        change.type === 'delete'
          ? matchesPath(path, change.path)
          : matchesPath(path, change.oldPath) || matchesPath(path, change.newPath),
      ),
  );

/** An entry as text with its keys sorted and its absent fields left out, so equal entries compare equal. */
const canonical = (entry: Entry | undefined): string =>
  entry === undefined
    ? 'none'
    : JSON.stringify(entry, (_key, value: unknown) =>
        value !== null && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right)))
          : value,
      );

/** Whether the file already holds what `steps` produced as `record`, on every path they touch. */
const holds = (current: WorkbenchEntries, record: WorkbenchEntries, steps: readonly EntriesStep[]): boolean =>
  [...new Set([...Object.keys(current.entries), ...Object.keys(record.entries)])].every(
    (path) => !touches(steps, path) || canonical(current.entries[path]) === canonical(record.entries[path]),
  );

/** How many of the patch's steps the file already holds: the longest marked prefix it holds, else none. */
const landed = (patch: EntriesPatch, current: WorkbenchEntries | undefined): number => {
  if (current === undefined) {
    return 0;
  }
  const kept = (marks.get(patch) ?? []).toSorted((left, right) => right.upTo - left.upTo);
  const found = kept.find((mark) => mark.records.some((record) => holds(current, record, patch.slice(0, mark.upTo))));
  return found?.upTo ?? 0;
};

/** Remember that the patch's steps produced `record`, keeping the latest marks only. */
const mark = (patch: EntriesPatch, record: WorkbenchEntries): void => {
  if (patch.length === 0) {
    return;
  }
  const kept = marks.get(patch) ?? [];
  const whole = kept.find((existing) => existing.upTo === patch.length);
  const updated = { upTo: patch.length, records: [...(whole?.records ?? []), record].slice(-maxMarkRecords) };
  marks.set(
    patch,
    [...kept.filter((existing) => existing !== whole), updated]
      .toSorted((left, right) => left.upTo - right.upTo)
      .slice(-maxMarks),
  );
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
    for (const step of patch.slice(landed(patch, current === undefined ? undefined : base))) {
      entries = movePaths(entries, step.moves);
      for (const [path, fields] of Object.entries(step.fields)) {
        entries[path] = mergeEntry(entries[path], fields);
      }
    }
    const merged = { ...base, entries };
    try {
      // Kept as the file will read it back, so it compares with a later read field for field.
      const written = workbenchRecords.entries.read(new TextEncoder().encode(serializeEntries(merged)));
      if (written.status === 'current') {
        mark(patch, written.record);
      }
    } catch {
      // A record that cannot be written is never on disk; the writer reports the same error when it serializes.
    }
    return merged;
  },
  isEmpty: (patch) => patch.every((step) => step.moves.length === 0 && Object.keys(step.fields).length === 0),
};
