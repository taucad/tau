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
  changedEntry,
  entriesPolicy,
  movePaths,
  withoutMoves,
} from '#workbench-records/entries-policy.js';
import type { EntriesPatch, EntryFields, EntryPathChange as PathChange } from '#workbench-records/entries-policy.js';
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

/** The entries record's `recordSync` machine; every entries store runs its own actor of it. */
const entriesRecordSyncMachine = createRecordSyncMachine(entriesPolicy);

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
  const { actor, commands, context, on } = createRecordSync({
    machine: entriesRecordSyncMachine,
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
      input.onHealth?.(health);
    }
  });
  actor.start();
  /** The record the person's next change starts from: what they last asked for, else what the file holds. */
  const base = (): WorkbenchEntries => {
    const { origin, intended, published } = context();
    const record = origin === 'none' ? undefined : (intended ?? published.record);
    return record ? withoutMoves(record) : emptyRecord;
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
      // Only what the person changed on the entry they were shown: a field another party changed since the record
      // this store asked for keeps the file's value.
      const entry = changedEntry(context().published.record?.entries[entryPath], next, from.entries[entryPath]);
      return commands.edit({ ...from, entries: { ...from.entries, [entryPath]: entry } });
    },
    changePaths: async (change) => {
      if (disposed) {
        return false;
      }
      const from = base();
      const saved = commands.edit({ ...from, entries: movePaths(from.entries, [change]), moves: [change] });
      // A path change is written at once, with the edits made before it.
      void commands.flush();
      return saved;
    },
    reset: async (next, reviewed) => {
      const shown = context().published;
      if (disposed || shown.refusal?.code !== 'INVALID_RECORD') {
        return false;
      }
      return commands.reset(next, reviewed === undefined ? shown.bytes : reviewed);
    },
    flush: async () => commands.flush(),
    dispose: () => {
      disposed = true;
      commands.close();
    },
    snapshot: () => context().published,
    health: () => context().health,
    retryRead: async () => (disposed ? false : commands.retryRead()),
    ready: () => context().origin !== 'none',
  };
}
