/**
 * The entries record's store: a shim over `recordSync` (graphics event-driven state charter D6) that keeps the API
 * its callers were written against. Every fact about the record (what was read, what is owed, which writes are this
 * store's own) is in the machine; what is here is the file's two ports and the translation of a person's per-entry
 * change and path change into the record they ask for.
 */
/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
import { workbenchPaths } from '@taucad/workbench';
import type { WorkbenchEntries } from '@taucad/workbench';
import type { CheckedFileWriteResult } from '@taucad/types';
import type { ActorOptions, AnyActorLogic } from 'xstate';
import {
  authoredFields,
  createEntriesPolicy,
  carriesFields,
  replacingMoves,
  sameEntries,
  changedEntry,
  coversFields,
  originOf,
  owedSteps,
  entriesPolicy,
  movePaths,
  withoutMoves,
} from '#workbench-records/entries-policy.js';
import type {
  EntriesPatch,
  EntriesRecord,
  EntryFields,
  EntryPathChange as PathChange,
} from '#workbench-records/entries-policy.js';
import { isPotentiallyApplied } from '#workbench-records/record-health.js';
import type { RecordHealth } from '#workbench-records/record-health.js';
import { createRecordSync } from '#workbench-records/record-sync.js';
import { createRecordSyncMachine } from '#workbench-records/record-sync.machine.js';

type Entry = WorkbenchEntries['entries'][string];
type Files = Readonly<{
  exists: (path: string) => Promise<boolean>;
  readFile: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
  writeFileChecked: (input: {
    path: string;
    data: string;
    preconditions: ReadonlyArray<{ path: string; expected: Uint8Array<ArrayBuffer> | null }>;
  }) => Promise<CheckedFileWriteResult>;
}>;

/** The fields of each entry a person changed, as one own write carried them, keyed by entry path. */
export type EntryRecordPatch = Readonly<{ fields: Readonly<Record<string, EntryFields>> }>;
export type EntryPathChange = PathChange;

export type EntriesState = Readonly<{
  record: WorkbenchEntries | undefined;
  bytes: Uint8Array<ArrayBuffer> | null;
  refusal: { code: 'INVALID_RECORD' | 'NEWER_RECORD'; message: string } | undefined;
}>;

/**
 * An edit waiting on its write, with every path its entry has been on while it waited, the last being where it is now:
 * a write formed before a path change names the entry at its earlier path.
 */
type WaitingEdit = { paths: string[]; readonly fields: EntryFields; left: string | undefined; gone: boolean };

const emptyRecord: WorkbenchEntries = { version: 1, entries: {} };

/**
 * The person's fields an own write carried, by the entry path they are on in the written record, and only where the
 * written record holds them: a rename onto a path replaces what the person set there before.
 */
const entryPatchOf = (
  patch: EntriesPatch | undefined,
  record: WorkbenchEntries | undefined,
): EntryRecordPatch | undefined => {
  const held = new Map<string, EntryFields>();
  for (const [path, fields] of Object.entries(patch === undefined ? {} : authoredFields(patch))) {
    const entry = record?.entries[path];
    const kept: EntryFields = {};
    if (Object.hasOwn(fields, 'renderTimeout') && entry?.renderTimeout === fields.renderTimeout) {
      kept.renderTimeout = fields.renderTimeout;
    }
    const components = Object.fromEntries(
      Object.entries(fields.components ?? {}).filter(
        ([field, value]) =>
          JSON.stringify(entry?.components?.[field as keyof NonNullable<Entry['components']>] ?? []) ===
          JSON.stringify(value),
      ),
    );
    if (Object.keys(components).length > 0) {
      kept.components = components;
    }
    if (Object.keys(kept).length > 0) {
      held.set(path, kept);
    }
  }
  return held.size > 0 ? { fields: Object.fromEntries(held) } : undefined;
};

/** Checked per-entry settings; a person's timeout and component changes merge independently. */
export function createWorkbenchEntriesStore(
  input: Readonly<{
    root: string;
    files: Files;
    onChange: (state: EntriesState, source: 'read' | 'write', locallyAuthored: EntryRecordPatch | undefined) => void;
    onError: (error: unknown) => void;
    onHealth?: (health: RecordHealth) => void;
    /** Milliseconds. */
    editDebounce?: number;
  }> &
    Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'>,
): Readonly<{
  read: (notify?: boolean) => Promise<boolean>;
  /** Fence a pending read as soon as its source changes. */
  invalidateRead: () => void;
  /** *Try again* after reads stopped: a fresh set of attempts. */
  retryRead: () => Promise<boolean>;
  edit: (path: string, next: Entry) => Promise<boolean>;
  changePaths: (change: EntryPathChange) => Promise<boolean>;
  /** Replace a refused record; `reviewed` is the exact refused bytes the person saw, and a newer file refuses the reset. */
  reset: (next: WorkbenchEntries, reviewed?: Uint8Array<ArrayBuffer> | null) => Promise<boolean>;
  flush: () => Promise<boolean>;
  dispose: () => void;
  snapshot: () => EntriesState;
  health: () => RecordHealth;
  ready: () => boolean;
}> {
  const path = `${input.root}/${workbenchPaths.entries}`;
  let disposed = false;
  /**
   * The edits waiting on the write that carries them, each at the path its entry is on now, with why the last merge of
   * its fields left them out, if it did. `gone` once its entry is deleted or replaced.
   */
  const waiting = new Set<WaitingEdit>();
  /** Changes refused because the file cannot take them, by entry path: owed to the person, never to the file. */
  const refused = new Map<string, string>();
  /** The machine's health, with a refused change counted as one the file does not hold. */
  const healthOf = (health: RecordHealth): RecordHealth => {
    const [first] = refused.values();
    return first === undefined ? health : { ...health, unconfirmed: true, error: health.error ?? first };
  };
  const { actor, commands, context, on } = createRecordSync({
    // Each store's own policy, so a field its merge leaves out is counted as this store's refused change.
    machine: createRecordSyncMachine(
      createEntriesPolicy((left, carried, message) => {
        for (const edit of waiting) {
          if (edit.paths.some((path) => left.includes(path))) {
            edit.left = message;
          } else if (edit.paths.some((path) => coversFields(carried[path], edit.fields))) {
            // Only a merge that carries this edit's own fields settles it: a later change of the entry may not.
            edit.left = undefined;
          }
        }
      }),
    ),
    editDebounce: input.editDebounce,
    clock: input.clock,
    inspect: input.inspect,
    onRejectedEvent: input.onRejectedEvent,
    ports: {
      async read() {
        try {
          return { status: 'read', bytes: (await input.files.exists(path)) ? await input.files.readFile(path) : null };
        } catch (error) {
          return { status: 'failed', error };
        }
      },
      async write({ data, expected }) {
        try {
          const result = await input.files.writeFileChecked({ path, data, preconditions: [{ path, expected }] });
          return result.status === 'conflict' ? { status: 'conflict' } : { status: 'applied', content: result.content };
        } catch (error) {
          return { status: 'failed', error, lost: isPotentiallyApplied(error) };
        }
      },
    },
  });
  function refusalChanged(): void {
    if (!disposed) {
      input.onHealth?.(healthOf(context().health));
    }
  }

  on('published', ({ snapshot, origin, patch }) => {
    if (!disposed) {
      // A published record is parsed from the file's bytes, so it never carries path changes.
      input.onChange(
        snapshot,
        origin === 'own' ? 'write' : 'read',
        origin === 'own' ? entryPatchOf(patch, snapshot.record) : undefined,
      );
    }
  });
  on('failed', ({ error }) => {
    if (!disposed) {
      input.onError(error);
    }
  });
  on('healthChanged', ({ health }) => {
    if (!disposed) {
      input.onHealth?.(healthOf(health));
    }
  });
  actor.start();
  /** Why the file cannot take a record, if it cannot. */
  const errorOf = (record: EntriesRecord): unknown => {
    try {
      entriesPolicy.serialize(record);
      return undefined;
    } catch (error) {
      // A record the file already holds, even over the canonical limit, asks for nothing to be written.
      const { published } = context();
      return published.record && sameEntries(withoutMoves(record), published.record) ? undefined : error;
    }
  };
  /**
   * Whether the file can take a change to `path`: one it cannot is refused, reported and counted in health until a
   * later change of that path is taken, rather than owed with every later change of every entry, which would then
   * never be written.
   */
  const refuse = (path: string, error: unknown): false => {
    refused.set(path, error instanceof Error ? error.message : 'The record cannot take this change.');
    input.onError(error);
    refusalChanged();
    return false;
  };
  const writable = (path: string, record: EntriesRecord): boolean => {
    const error = errorOf(record);
    return error === undefined || refuse(path, error);
  };

  /** The record the person's next change starts from: what they last asked for, else what the file holds. */
  const base = (): WorkbenchEntries => {
    const { origin, intended, published } = context();
    const record = origin === 'none' ? undefined : (intended ?? published.record);
    return record ? withoutMoves(record) : emptyRecord;
  };
  /**
   * The entry as shown, at the path the person's owed path changes put it on: an edit made while its entry's rename is
   * written was made on the renamed entry, as the file holds it at its old path. A path change already on the file
   * moves nothing again, and an entry only the person's owed fields make was shown as they asked for it.
   */
  const shownAt = (entryPath: string, from: WorkbenchEntries): Entry | undefined => {
    const { published, deferred, cycle, pending } = context();
    const steps = [cycle?.patch, deferred, pending?.patch].flatMap((patch) =>
      patch === undefined ? [] : owedSteps(patch, published.record),
    );
    const shownEntries = published.record?.entries ?? {};
    const origin = originOf(shownEntries, steps, entryPath);
    return origin === 'made' ? from.entries[entryPath] : origin === undefined ? undefined : shownEntries[origin.path];
  };
  return {
    read: async (notify = false) => commands.read(notify),
    invalidateRead: () => {
      commands.invalidate();
    },
    edit: async (entryPath, next) => {
      if (disposed) {
        return false;
      }
      const from = base();
      // Only what the person changed: on the entry they were shown, or over their own change the file lacks. A field
      // another party changed since keeps the file's value. A cycle took what was deferred when it formed.
      const { deferred, cycle, pending } = context();
      const owed = authoredFields([...(cycle?.patch ?? []), ...(deferred ?? []), ...(pending?.patch ?? [])]);
      const { entry, fields } = changedEntry({
        shown: shownAt(entryPath, from),
        next,
        onto: from.entries[entryPath],
        owed: owed[entryPath],
      });
      const record = { ...from, entries: { ...from.entries, [entryPath]: entry }, set: { [entryPath]: fields } };
      if (!writable(entryPath, record)) {
        return false;
      }
      if (refused.delete(entryPath)) {
        refusalChanged();
      }
      const waits: WaitingEdit = { paths: [entryPath], fields, left: undefined, gone: false };
      waiting.add(waits);
      try {
        if (!(await commands.edit(record))) {
          return false;
        }
      } finally {
        waiting.delete(waits);
      }
      // The write that carried the change left it out: another party's change left the record no room for it. A
      // change whose entry the person deleted or replaced since is not owed to them.
      const shown = context().published.record?.entries;
      if (
        waits.left !== undefined &&
        !waits.gone &&
        !waits.paths.some((path) => carriesFields(shown?.[path], fields))
      ) {
        return refuse(waits.paths.at(-1) ?? entryPath, new RangeError(waits.left));
      }
      return true;
    },
    changePaths: async (change) => {
      if (disposed) {
        return false;
      }
      const from = base();
      const moved = (moves: EntryPathChange[]): EntriesRecord => ({
        ...from,
        entries: movePaths(from.entries, moves),
        moves,
      });
      let record = moved([change]);
      const unnamed = change.type === 'rename' ? errorOf(record) : undefined;
      // A record over the file's limit is refused below, keeping every setting, as any change the file cannot take.
      if (unnamed !== undefined && !(unnamed instanceof RangeError) && change.type === 'rename') {
        // The record cannot name the new path: the settings cannot follow the file, so they go with its old path.
        input.onError(unnamed);
        record = moved([{ type: 'delete', path: change.oldPath }]);
      }
      if (!writable(change.type === 'rename' ? change.oldPath : change.path, record)) {
        return false;
      }
      // A refused change, and a waiting one, follows its entry, and goes when the entry is deleted or replaced.
      for (const edit of waiting) {
        const [moved] = Object.keys(replacingMoves({ [edit.paths.at(-1) ?? '']: true }, record.moves ?? []));
        if (moved === undefined) {
          edit.gone = true;
        } else if (moved !== edit.paths.at(-1)) {
          edit.paths.push(moved);
        }
      }
      const kept = replacingMoves(Object.fromEntries(refused), record.moves ?? []);
      if (JSON.stringify(kept) !== JSON.stringify(Object.fromEntries(refused))) {
        refused.clear();
        for (const [path, message] of Object.entries(kept)) {
          refused.set(path, message);
        }
        refusalChanged();
      }
      const saved = commands.edit(record);
      // A path change is written at once, with the edits made before it.
      void commands.flush();
      return saved;
    },
    reset: async (next, reviewed) => {
      const shown = context().published;
      if (disposed || shown.refusal?.code !== 'INVALID_RECORD') {
        return false;
      }
      if (refused.size > 0) {
        refused.clear();
        refusalChanged();
      }
      return commands.reset(next, reviewed === undefined ? shown.bytes : reviewed);
    },
    flush: async () => {
      const saved = await commands.flush();
      if (refused.size === 0) {
        return saved;
      }
      // A refused change is never written: the flush that asks reports it unsaved, and then lets it go.
      refused.clear();
      refusalChanged();
      return false;
    },
    dispose: () => {
      disposed = true;
      commands.close();
    },
    snapshot: () => context().published,
    health: () => healthOf(context().health),
    retryRead: async () => (disposed ? false : commands.retryRead()),
    ready: () => context().origin !== 'none',
  };
}
