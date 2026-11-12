/**
 * The entries record's policy for `recordSync` (graphics event-driven state charter D6): its codec and the patch
 * algebra that lets a person's per-entry settings, and the renames and deletes of the files they belong to, land on
 * bytes another window, an agent or sync wrote in the meantime.
 *
 * A patch is the person's changes in the order they were made: path changes, and the fields changed on each path. A path
 * change cannot be seen in two records (a renamed entry looks like one removed and one added, and would lose what
 * another party changed on it), so the record a person asks for carries the changes that made it from its base in
 * `moves`, and the fields the person set in `set`. Neither is written: `serialize` drops them and `read` never returns
 * them.
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

/**
 * An entries record, the path changes that made it from the record it was edited from, and the fields the person set
 * (`set`), which are carried even where the record it was edited from already held them.
 */
export type EntriesRecord = WorkbenchEntries & {
  readonly moves?: readonly EntryPathChange[];
  readonly set?: Readonly<Record<string, EntryFields>>;
};

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

/** Keyed values with their keys moved by path changes, in order; a deleted key is dropped. */
export const moveKeys = <V>(
  values: Readonly<Record<string, V>>,
  moves: readonly EntryPathChange[],
): Record<string, V> => {
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
 * so a field another party changed since keeps the file's value. Only the changed fields go over `onto`, and they are
 * returned to be carried as set even where `onto` already holds them.
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
}>): Readonly<{ entry: Entry; fields: EntryFields }> => {
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
  return { entry: mergeEntry(onto, fields), fields };
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

/** The record as it is written: without the path changes and the person's fields that made it. */
export const withoutMoves = (record: EntriesRecord): WorkbenchEntries => {
  const { moves: _moves, set: _set, ...written } = record;
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

/**
 * The fields a patch surely leaves on each path: as {@link authoredFields}, except that a rename drops what the person
 * set under its new path, since the entry there is replaced by the one it moves.
 */
const surelyAuthoredFields = (patch: EntriesPatch): Record<string, EntryFields> => {
  let fields: Record<string, EntryFields> = {};
  for (const step of patch) {
    fields = combineFieldMaps(replacingMoves(fields, step.moves), step.fields);
  }
  return fields;
};

/**
 * Keyed values with their keys moved by path changes, where a rename also replaces whatever was keyed under its new
 * path, as it replaces the entry there; a deleted key is dropped.
 */
export const replacingMoves = <V>(
  values: Readonly<Record<string, V>>,
  moves: readonly EntryPathChange[],
): Record<string, V> => {
  let moved = { ...values };
  for (const change of moves) {
    if (change.type === 'rename') {
      const { newPath } = change;
      moved = Object.fromEntries(Object.entries(moved).filter(([path]) => !matchesPath(path, newPath)));
    }
    moved = moveKey(moved, change);
  }
  return moved;
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

/** The text of each record read from a file, for a record whose canonical form the file's limit cannot take. */
const fileText = new WeakMap<WorkbenchEntries, string>();

const serializeEntries = (record: WorkbenchEntries): string => workbenchRecords.entries.serialize(record);

/**
 * The record as the file reads it back, so records compare field for field; `undefined` when it cannot be written. A
 * record read from the file is already as it reads back, even one whose canonical form is over the limit.
 */
const asRead = (record: WorkbenchEntries, from?: EntriesRecord): WorkbenchEntries | undefined => {
  if (from !== undefined && fileText.has(from)) {
    return record;
  }
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
 * Whether the file holds something the write wrote: the absence of an entry it removed, or a field it set on an entry
 * it made or changed, whatever another party changed on that entry since.
 */
const writtenHeld = (before: Entry | undefined, after: Entry | undefined, now: Entry | undefined): boolean => {
  if (after === undefined || now === undefined) {
    return after === now;
  }
  if (before === undefined && JSON.stringify(now) === JSON.stringify(after)) {
    // A made entry whose every field is the default is written only as itself.
    return true;
  }
  const [replaced, wrote, held] = [fieldsOf(before ?? {}), fieldsOf(after), fieldsOf(now)];
  return wrote.some((field, index) => field !== replaced[index] && held[index] === field);
};

/**
 * Whether the file holds the path changes of a write of `steps`: on the paths they touch, nothing the write replaced is
 * still there (an entry it made or removed, or a field it changed) and something it wrote is. Fields elsewhere
 * say nothing: they are applied again whatever the file holds. What another party changed since holds neither.
 */
const holds = (current: WorkbenchEntries, write: Write, steps: readonly EntriesStep[]): boolean => {
  const paths = new Set([...Object.keys(write.base.entries), ...Object.keys(write.record.entries)]);
  let written = false;
  for (const path of paths) {
    const before = write.base.entries[path];
    const after = write.record.entries[path];
    const now = current.entries[path];
    if (!moves(steps, path) || JSON.stringify(before) === JSON.stringify(after)) {
      continue;
    }
    if (replacedHeld(before, after, now)) {
      return false;
    }
    written ||= writtenHeld(before, after, now);
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

/**
 * The entries a patch makes of `entries`: the path changes of its first `landed` steps are on disk already, so only
 * their fields are applied again, at the paths they moved to; the steps after are applied whole. Without `fields`,
 * only the path changes are applied.
 */
const applied = (
  entries: Readonly<Record<string, Entry>>,
  patch: EntriesPatch,
  { landed, fields }: Readonly<{ landed: number; fields: boolean }>,
): Record<string, Entry> => {
  let result = { ...entries };
  if (fields) {
    for (const [path, set] of Object.entries(surelyAuthoredFields(patch.slice(0, landed)))) {
      result[path] = mergeEntry(result[path], set);
    }
  }
  for (const step of patch.slice(landed)) {
    result = movePaths(result, step.moves);
    if (fields) {
      for (const [path, set] of Object.entries(step.fields)) {
        result[path] = mergeEntry(result[path], set);
      }
    }
  }
  return result;
};

/** Why the record cannot be written, if it cannot. */
const writeError = (record: WorkbenchEntries): string | undefined => {
  try {
    serializeEntries(record);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

/**
 * Told, on every merge, the paths whose fields it left out because the file it met could not take them all, the fields
 * it carried by path, and why. A later merge of the same change can carry what an earlier one left out.
 */
export type DroppedFields = (
  left: readonly string[],
  carried: Readonly<Record<string, EntryFields>>,
  message: string,
) => void;

/**
 * The path changes of a patch not yet on the file `current` holds: those after the longest prefix it has landed, or
 * every one when none is known to have.
 */
export const owedSteps = (patch: EntriesPatch, current: EntriesRecord | undefined): EntriesStep[] => {
  const read = current === undefined ? undefined : asRead(withoutMoves(current), current);
  return patch.slice(landedMark(patch, read)?.upTo ?? 0);
};

/**
 * Where the entry at `path` comes from once owed steps apply to the file's entries: the file path it is moved from,
 * `'made'` for an entry only the steps' fields make, or `undefined` for none.
 */
export const originOf = (
  entries: Readonly<Record<string, Entry>>,
  steps: readonly EntriesStep[],
  path: string,
): { path: string } | 'made' | undefined => {
  let origins: Record<string, { path: string } | 'made'> = Object.fromEntries(
    Object.keys(entries).map((key) => [key, { path: key }]),
  );
  for (const step of steps) {
    origins = moveKeys(origins, step.moves);
    for (const key of Object.keys(step.fields)) {
      origins[key] ??= 'made';
    }
  }
  return Object.hasOwn(origins, path) ? origins[path] : undefined;
};

/**
 * A merge that cannot be written, made writable by leaving out the person's fields path by path, latest first: the
 * path changes and every other field are still written, rather than owing the whole patch with every later change.
 */
const fitted = ({
  base,
  patch,
  landed,
  merged,
  message,
  onDropped,
}: Readonly<{
  base: WorkbenchEntries;
  patch: EntriesPatch;
  landed: number;
  merged: WorkbenchEntries;
  message: string;
  onDropped: DroppedFields | undefined;
}>): WorkbenchEntries => {
  const movedOnly = applied(base.entries, patch, { landed, fields: false });
  const without = (entries: Record<string, Entry>, path: string): Record<string, Entry> => {
    const { [path]: _left, ...rest } = entries;
    return movedOnly[path] === undefined ? rest : { ...rest, [path]: movedOnly[path] };
  };
  const paths = Object.keys(surelyAuthoredFields(patch)).toReversed();
  // Leave out the latest paths until the record fits, then put back each one it still fits with.
  let entries = { ...merged.entries };
  const left: string[] = [];
  for (const path of paths) {
    entries = without(entries, path);
    left.push(path);
    if (writeError({ ...base, entries }) === undefined) {
      for (const kept of left.slice(0, -1).toReversed()) {
        const back = { ...entries, ...(Object.hasOwn(merged.entries, kept) ? { [kept]: merged.entries[kept]! } : {}) };
        if (writeError({ ...base, entries: back }) === undefined) {
          entries = back;
          left.splice(left.indexOf(kept), 1);
        }
      }
      const authored = surelyAuthoredFields(patch);
      onDropped?.(left, Object.fromEntries(Object.entries(authored).filter(([path]) => !left.includes(path))), message);
      return { ...base, entries };
    }
  }
  return merged;
};

/** Whether two records hold the same entries, field for field. */
export const sameEntries = (left: WorkbenchEntries, right: WorkbenchEntries): boolean => {
  const paths = Object.keys(left.entries);
  return (
    paths.length === Object.keys(right.entries).length &&
    paths.every(
      (path) =>
        Object.hasOwn(right.entries, path) &&
        JSON.stringify(fieldsOf(left.entries[path])) === JSON.stringify(fieldsOf(right.entries[path])),
    )
  );
};

/** Whether `carried` sets each of `fields`, to its value or to one the person set after it. */
export const coversFields = (carried: EntryFields | undefined, fields: EntryFields): boolean =>
  carried !== undefined &&
  (!Object.hasOwn(fields, 'renderTimeout') || Object.hasOwn(carried, 'renderTimeout')) &&
  Object.keys(fields.components ?? {}).every((field) => Object.hasOwn(carried.components ?? {}, field));

/** Whether an entry holds every field a person set on it. */
export const carriesFields = (entry: Entry | undefined, fields: EntryFields): boolean =>
  entry !== undefined && Object.keys(diffEntry(entry, mergeEntry(entry, fields))).length === 0;

/**
 * The entries record's codec and patch algebra. `onDropped` hears of a person's fields a merge left out because another
 * party's change left the record no room for them.
 */
export const createEntriesPolicy = (onDropped?: DroppedFields): RecordPolicy<EntriesRecord, EntriesPatch> => ({
  read(bytes) {
    const result = workbenchRecords.entries.read(bytes);
    if (result.status === 'current') {
      fileText.set(result.record, new TextDecoder().decode(bytes));
    }
    return result.status === 'current'
      ? { status: 'current', record: result.record }
      : {
          status: result.code === 'NEWER_RECORD' ? 'newer' : 'invalid',
          code: result.code,
          message: result.message,
        };
  },
  serialize(record) {
    try {
      return serializeEntries(withoutMoves(record));
    } catch (error) {
      // A record read from a file whose canonical form is over the limit: the file's own text stands for it, which no
      // writable record serializes to, so a change that brings it under the limit is still written.
      const text = fileText.get(record);
      if (text === undefined || !(error instanceof RangeError)) {
        throw error;
      }
      return text;
    }
  },
  diff(base, next) {
    const moves = next.moves ?? [];
    const moved = movePaths(base?.entries ?? {}, moves);
    const fields = new Map<string, EntryFields>();
    for (const [path, entry] of Object.entries(next.entries)) {
      const set = next.set?.[path];
      const changed =
        set === undefined ? diffEntry(moved[path], entry) : combineFields(diffEntry(moved[path], entry), set);
      if (Object.keys(changed).length > 0) {
        fields.set(path, changed);
      }
    }
    return moves.length === 0 && fields.size === 0 ? [] : [{ moves, fields: Object.fromEntries(fields) }];
  },
  combine: (earlier, later) => (earlier === undefined ? later : combinePatches(earlier, later)),
  merge(current, _next, patch) {
    const base: WorkbenchEntries = current === undefined ? { version: 1, entries: {} } : withoutMoves(current);
    const read = asRead(base, current);
    const found = landedMark(patch, current === undefined ? undefined : read);
    let merged = { ...base, entries: applied(base.entries, patch, { landed: found?.upTo ?? 0, fields: true }) };
    const unwritable = writeError(merged);
    if (unwritable === undefined) {
      onDropped?.([], surelyAuthoredFields(patch), '');
    } else {
      merged = fitted({ base, patch, landed: found?.upTo ?? 0, merged, message: unwritable, onDropped });
    }
    const record = asRead(merged);
    if (current === undefined) {
      // A file seen absent holds none of the patch's earlier writes, whatever was found before.
      marks.delete(patch);
    }
    if (read && record) {
      mark(patch, { base: read, record }, found);
    }
    // A merge that changes nothing on a file read over the canonical limit is that file: it compares as its text.
    return current !== undefined && fileText.has(current) && sameEntries(merged, base) ? current : merged;
  },
  isEmpty: (patch) => patch.every((step) => step.moves.length === 0 && Object.keys(step.fields).length === 0),
});

/** The entries record's codec and patch algebra, for a store that need not hear of dropped fields. */
export const entriesPolicy = createEntriesPolicy();
