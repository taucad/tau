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

/**
 * The entry a person's change makes of `onto`, the entry the store last asked for. A field the person set in a change
 * the file does not hold yet (`owed`) is compared with `onto`; any other with `shown`, the entry the file showed them,
 * so a field another party changed since keeps the file's value. Only the changed fields go over `onto`.
 */
export const changedEntry = ({
  shown,
  next,
  onto,
  owed,
}: Readonly<{
  shown: Entry | undefined;
  next: Entry;
  onto: Entry | undefined;
  owed: EntryFields | undefined;
}>): Entry => {
  const fromShown = diffEntry(shown, next);
  const fromOnto = diffEntry(onto, next);
  const fields: EntryFields = {};
  const timeoutChange = owed !== undefined && Object.hasOwn(owed, 'renderTimeout') ? fromOnto : fromShown;
  if (Object.hasOwn(timeoutChange, 'renderTimeout')) {
    fields.renderTimeout = timeoutChange.renderTimeout;
  }
  const components: Partial<Components> = {};
  for (const field of componentFields) {
    const changed = (owed?.components?.[field] === undefined ? fromShown : fromOnto).components?.[field];
    if (changed !== undefined) {
      Object.assign(components, { [field]: changed });
    }
  }
  if (Object.keys(components).length > 0) {
    fields.components = components;
  }
  return mergeEntry(onto, fields);
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

/** The fields a patch leaves on each path of the record it is merged onto: the person's own fields there. */
export const authoredFields = (patch: EntriesPatch): Record<string, EntryFields> => {
  let fields: Record<string, EntryFields> = {};
  for (const step of patch) {
    fields = combineFieldMaps(moveKeys(fields, step.moves), step.fields);
  }
  return fields;
};

/** The most marks of writes found landed a patch keeps, and the most others: as many as the writer keeps lost writes. */
const maxMarks = 8;
/** The most writes a mark keeps: one per checked write of the same steps (a conflict re-merges them). */
const maxMarkWrites = 4;

/** One merge of a patch prefix: the record it was merged onto and the record it produced, both as the file reads. */
type Write = Readonly<{ base: WorkbenchEntries; record: WorkbenchEntries }>;

/**
 * The writes a patch's first `upTo` steps made when it was merged, which a later file may already hold.
 * `landed` once a later merge found the file holding one: that write is on disk, and its mark is kept first.
 */
type Mark = Readonly<{ upTo: number; writes: readonly Write[]; landed?: true }>;

/**
 * What each patch wrote, by the prefix of its steps that made each write. Path changes are not idempotent (a delete
 * followed by a rename onto the deleted path removes the renamed entry when applied again; a swap applied again undoes
 * itself), yet the writer applies a patch again to the bytes it reads back after a lost reply, and a later combined
 * patch carries the same steps. A write has landed when, on the paths where it changed the entry, the file holds the
 * entry it wrote somewhere and the entry it replaced nowhere: another party may have changed any of those entries
 * since, or any other entry. A prefix found landed stays landed, since every later file comes after that write. Only
 * the steps after the landed prefix are applied. Keyed by the
 * patch object, which the machine keeps from issue to retry; a combined patch inherits the marks of its earlier part,
 * whose steps it starts with.
 */
const marks = new WeakMap<EntriesPatch, readonly Mark[]>();

const serializeEntries = (record: WorkbenchEntries): string => workbenchRecords.entries.serialize(record);

/** The record as the file reads it back, so records compare field for field; `undefined` when it cannot be written. */
const asRead = (record: WorkbenchEntries): WorkbenchEntries | undefined => {
  try {
    const result = workbenchRecords.entries.read(new TextEncoder().encode(serializeEntries(record)));
    return result.status === 'current' ? result.record : undefined;
  } catch {
    // A record that cannot be written is never on disk; the writer reports the same error when it serializes.
    return undefined;
  }
};

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

/** Whether a path change of the steps reads or writes `path`: it is under a change's old or new path. */
const moves = (steps: readonly EntriesStep[], path: string): boolean =>
  steps.some((step) =>
    step.moves.some((change) =>
      change.type === 'delete'
        ? matchesPath(path, change.path)
        : matchesPath(path, change.oldPath) || matchesPath(path, change.newPath),
    ),
  );

/** An entry's fields, each as text, so two entries compare field by field; missing components are the empty lists. */
const fieldsOf = (entry: Entry | undefined): string[] =>
  entry === undefined
    ? []
    : [
        JSON.stringify(entry.renderTimeout),
        ...componentFields.map((field) => JSON.stringify(entry.components?.[field] ?? [])),
      ];

/** Whether the file still holds something the write replaced: an entry it made or removed, or a field it changed. */
const replacedHeld = (before: Entry | undefined, after: Entry | undefined, now: Entry | undefined): boolean => {
  if (before === undefined || after === undefined) {
    return JSON.stringify(now) === JSON.stringify(before);
  }
  const [replaced, wrote, held] = [fieldsOf(before), fieldsOf(after), fieldsOf(now)];
  return replaced.some((field, index) => field !== wrote[index] && held[index] === field);
};

/**
 * Whether the file holds a write of `steps`: nothing the write replaced is still there (an entry it made or removed,
 * or a field it changed), and an entry its path changes moved is there as written. A field change alone is never
 * evidence, since applying it again changes nothing; what another party changed since holds neither, and says nothing.
 */
const holds = (current: WorkbenchEntries, write: Write, steps: readonly EntriesStep[]): boolean => {
  const paths = new Set([...Object.keys(write.base.entries), ...Object.keys(write.record.entries)]);
  let written = false;
  for (const path of paths) {
    const before = write.base.entries[path];
    const after = write.record.entries[path];
    const now = current.entries[path];
    if (JSON.stringify(before) === JSON.stringify(after)) {
      continue;
    }
    if (replacedHeld(before, after, now)) {
      return false;
    }
    written ||= moves(steps, path) && JSON.stringify(now) === JSON.stringify(after);
  }
  return written;
};

/**
 * The longest marked prefix of the patch on disk, if any: found landed before (every later file comes after that
 * write), or held by the file now.
 */
const landedMark = (patch: EntriesPatch, current: WorkbenchEntries | undefined): Mark | undefined => {
  if (current === undefined) {
    return undefined;
  }
  return (marks.get(patch) ?? [])
    .toSorted((left, right) => right.upTo - left.upTo)
    .find(
      (mark) => mark.landed === true || mark.writes.some((write) => holds(current, write, patch.slice(0, mark.upTo))),
    );
};

/** Keep the marks of writes found landed first, then the latest others, each up to {@link maxMarks}. */
const bounded = (kept: readonly Mark[]): Mark[] => {
  const byPrefix = (left: Mark, right: Mark): number => left.upTo - right.upTo;
  const found = kept
    .filter((mark) => mark.landed)
    .toSorted(byPrefix)
    .slice(-maxMarks);
  const others = kept
    .filter((mark) => !mark.landed)
    .toSorted(byPrefix)
    .slice(-maxMarks);
  return [...found, ...others].toSorted(byPrefix);
};

/** Remember that the patch's steps made `write`, and that `found` had landed. */
const mark = (patch: EntriesPatch, write: Write, found: Mark | undefined): void => {
  if (patch.length === 0) {
    return;
  }
  const kept = (marks.get(patch) ?? []).map(
    (existing): Mark => (existing === found ? { ...existing, landed: true } : existing),
  );
  const whole = kept.find((existing) => existing.upTo === patch.length);
  const updated: Mark = {
    ...whole,
    upTo: patch.length,
    // The writer may merge the same cycle more than once; one write is kept once.
    writes: [...(whole?.writes ?? []).filter((kept) => JSON.stringify(kept) !== JSON.stringify(write)), write].slice(
      -maxMarkWrites,
    ),
  };
  marks.set(patch, bounded([...kept.filter((existing) => existing !== whole), updated]));
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
    const read = asRead(base);
    const found = landedMark(patch, current === undefined ? undefined : read);
    let { entries } = base;
    for (const step of patch.slice(found?.upTo ?? 0)) {
      entries = movePaths(entries, step.moves);
      for (const [path, fields] of Object.entries(step.fields)) {
        entries[path] = mergeEntry(entries[path], fields);
      }
    }
    const merged = { ...base, entries };
    const record = asRead(merged);
    if (current === undefined) {
      // A file seen absent holds none of the patch's earlier writes, whatever was found before.
      marks.delete(patch);
    }
    if (read && record) {
      mark(patch, { base: read, record }, found);
    }
    return merged;
  },
  isEmpty: (patch) => patch.every((step) => step.moves.length === 0 && Object.keys(step.fields).length === 0),
};
