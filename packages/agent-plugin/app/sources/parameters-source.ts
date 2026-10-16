/**
 * The page's Parameters pane source: the shared pane over the server's `get_parameters` and
 * `apply_parameter_operation`. An edit is a checked write of the entry's sidecar in the project, so Tau shows the same
 * value; once it commits, the page reads the record again and shows the model again, rendered with it.
 *
 * The page cannot run a parameter-set actor: the actor reads and writes the sidecar's bytes itself, and the server
 * offers the planned operation, not the file. So each operation here is one `propose` against the manifest revision the
 * last read returned, and operations on one entry run one after another.
 */
import { useSyncExternalStore } from 'react';
import type { ParameterManifest, ParameterSetOutcome } from '@taucad/parameters';
import type { FileParameterEntry } from '@taucad/types';
import type { ParametersEntryState, ParametersSource } from '@taucad/workbench-panes/parameters/parameters-source';
import type { HostBridge } from '#app/host-bridge.js';

/** What `get_parameters` answers with `detail: 'full'`, as far as the page reads it. */
type ParametersAnswer = Readonly<{
  status?: 'resolved' | 'unresolved';
  manifest?: ParameterManifest;
  current?: Readonly<{ identity: Readonly<{ manifestRevision: string }>; entry: FileParameterEntry }>;
  diagnostics?: ReadonlyArray<Readonly<{ code?: string; message: string }>>;
}>;

/** One `apply_parameter_operation` operation, as the tool's schema names it. */
type ParameterOperation =
  | Readonly<{ kind: 'native-value'; group: string; pointer: string; value: unknown }>
  | Readonly<{ kind: 'replace-group-values'; group: string; values: Readonly<Record<string, unknown>> }>
  | Readonly<{ kind: 'select-group'; group: string }>
  | Readonly<{ kind: 'create-group'; group: string; values?: Readonly<Record<string, unknown>> }>
  | Readonly<{ kind: 'rename-group'; group: string; nextGroup: string }>
  | Readonly<{ kind: 'delete-group'; group: string }>;

type EntryRecord = {
  state: ParametersEntryState;
  /** The manifest revision the last read returned; every proposal names it. */
  revision: string | undefined;
  /** Bumped by each read, so only the newest read publishes. */
  generation: number;
  isRequested: boolean;
  /** The entry's operations, in order. */
  queue: Promise<unknown>;
  listeners: Set<() => void>;
  subscribe: (listener: () => void) => () => void;
};

const unknownState: ParametersEntryState = { manifest: undefined, entry: undefined, failure: undefined };

/**
 * The Parameters source the page hands the shared pane, and how the page reads the entries again.
 *
 * @public
 */
export type PageParametersSource = ParametersSource &
  Readonly<{
    /** Read one entry, or every entry read so far, again: the shown model changed outside the pane. */
    refresh: (entryPath?: string) => void;
    /** What the pane shows for an entry. */
    snapshot: (entryPath: string) => ParametersEntryState;
    /**
     * Observe an entry; the first observer reads it.
     *
     * @returns Unsubscribes.
     */
    subscribe: (entryPath: string, listener: () => void) => () => void;
  }>;

/**
 * What the page does around the pane's operations.
 *
 * @public
 */
export type ParametersSourceOptions = Readonly<{
  /** An operation was written: show the model again. */
  onCommitted: () => void;
  /** Show an operation's failure. Absent, the pane shows it above its sections. */
  onError?: (message: string) => void;
}>;

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const outcomeOf = (answer: unknown, requestId: string): ParameterSetOutcome => {
  const outcome = (answer as { outcome?: { status?: unknown } } | undefined)?.outcome;
  if (typeof outcome?.status === 'string') {
    return outcome as ParameterSetOutcome;
  }
  return { status: 'rejected', requestId, code: 'NO_OUTCOME', message: 'The edit was not written (no answer).' };
};

/**
 * Wait for an operation without rethrowing: its caller sees the failure, the next operation only waits.
 *
 * @param operation - The operation to wait for.
 */
const settled = async (operation: Promise<unknown>): Promise<void> => {
  try {
    await operation;
  } catch {
    // The caller of the operation handles it.
  }
};

const committedOrThrow = (outcome: ParameterSetOutcome): void => {
  if (outcome.status !== 'committed') {
    throw new Error('message' in outcome ? outcome.message : `The edit was not written (${outcome.status}).`);
  }
};

/**
 * Build the page's Parameters source over the server's parameter tools.
 *
 * @param bridge - The page's host bridge.
 * @param options - What to do once an operation is written, and where failures go.
 * @returns The source, plus `refresh` for when the shown model changes.
 * @public
 */
export const createParametersSource = (bridge: HostBridge, options: ParametersSourceOptions): PageParametersSource => {
  const records = new Map<string, EntryRecord>();
  let sequence = 0;

  const publish = (record: EntryRecord, state: ParametersEntryState): void => {
    record.state = state;
    for (const listener of record.listeners) {
      listener();
    }
  };

  const read = async (entryPath: string): Promise<void> => {
    const record = recordOf(entryPath);
    record.isRequested = true;
    const generation = ++record.generation;
    let state: ParametersEntryState;
    let revision: string | undefined;
    try {
      const answer = (await bridge.callTool('get_parameters', { targetFile: entryPath, detail: 'full' })) as
        | ParametersAnswer
        | undefined;
      if (answer?.status === 'resolved' && answer.manifest !== undefined && answer.current !== undefined) {
        revision = answer.current.identity.manifestRevision;
        const held = record.state.manifest;
        // An equal manifest keeps its identity, so the form does not rebuild on every read.
        const manifest = held !== undefined && held.revision === answer.manifest.revision ? held : answer.manifest;
        state = { manifest, entry: answer.current.entry, failure: undefined };
      } else {
        const diagnostic = answer?.diagnostics?.[0];
        state = {
          manifest: undefined,
          entry: undefined,
          failure: {
            code: diagnostic?.code ?? 'RESOLUTION_FAILED',
            message: diagnostic?.message ?? 'This model declares no parameters.',
          },
        };
      }
    } catch (error) {
      state = {
        manifest: undefined,
        entry: undefined,
        failure: { code: 'RESOLUTION_FAILED', message: errorText(error) },
      };
    }
    if (generation === record.generation) {
      record.revision = revision;
      publish(record, state);
    }
  };

  function recordOf(entryPath: string): EntryRecord {
    const existing = records.get(entryPath);
    if (existing !== undefined) {
      return existing;
    }
    const record: EntryRecord = {
      state: unknownState,
      revision: undefined,
      generation: 0,
      isRequested: false,
      queue: Promise.resolve(),
      listeners: new Set(),
      subscribe: (listener) => {
        record.listeners.add(listener);
        if (!record.isRequested) {
          // async-iife: bootstrap -- the read publishes to the entry's observers.
          void read(entryPath);
        }
        return () => {
          record.listeners.delete(listener);
        };
      },
    };
    records.set(entryPath, record);
    return record;
  }

  /**
   * Propose one final operation after the entry's earlier ones, then read the entry again.
   *
   * @param entryPath - The entry whose sidecar the operation writes.
   * @param operation - What to write, as the tool's schema names it.
   * @returns The server's outcome, after the entry has been read again.
   */
  const propose = async (entryPath: string, operation: ParameterOperation): Promise<ParameterSetOutcome> => {
    const record = recordOf(entryPath);
    const run = async (): Promise<ParameterSetOutcome> => {
      sequence += 1;
      const requestId = `page-${String(Date.now())}-${String(sequence)}`;
      if (record.revision === undefined) {
        await read(entryPath);
      }
      const { revision } = record;
      if (revision === undefined) {
        return {
          status: 'rejected',
          requestId,
          code: record.state.failure?.code ?? 'RESOLUTION_FAILED',
          message: record.state.failure?.message ?? 'Parameters are not loaded.',
        };
      }
      const outcome = outcomeOf(
        await bridge.callTool('apply_parameter_operation', {
          action: 'propose',
          targetFile: entryPath,
          requestId,
          expected: { manifestRevision: revision },
          pressure: 'final',
          operation,
        }),
        requestId,
      );
      // Committed or not, the record now holds what the server holds: a refusal shows the authority value again.
      await read(entryPath);
      if (outcome.status === 'committed') {
        options.onCommitted();
      }
      return outcome;
    };
    const previous = record.queue;
    const next = (async () => {
      await previous;
      return run();
    })();
    record.queue = settled(next);
    return next;
  };

  const write = async (entryPath: string, operation: ParameterOperation): Promise<void> => {
    committedOrThrow(await propose(entryPath, operation));
  };

  return {
    snapshot: (entryPath) => recordOf(entryPath).state,
    subscribe: (entryPath, listener) => recordOf(entryPath).subscribe(listener),
    refresh: (entryPath) => {
      for (const [path, record] of records) {
        if ((entryPath === undefined || path === entryPath) && record.isRequested) {
          // async-iife: bootstrap -- the read publishes to the entry's observers.
          void read(path);
        }
      }
    },
    useEntry: (entryPath) => {
      const record = recordOf(entryPath);
      return useSyncExternalStore(
        record.subscribe,
        () => record.state,
        () => record.state,
      );
    },
    target: (entryPath) => ({ authority: 'tau-mcp', root: '', entry: entryPath }),
    commitValue: async (entryPath, _manifest, field) => {
      if (field.pressure === 'transient') {
        // Each proposal is a sidecar write and a render: a drag writes its released value only.
        sequence += 1;
        return { status: 'cancelled-before-apply', requestId: `page-transient-${String(sequence)}` };
      }
      return propose(entryPath, {
        kind: 'native-value',
        group: field.group,
        pointer: field.pointer,
        value: field.value,
      });
    },
    replaceValues: async (entryPath, _manifest, values) =>
      write(entryPath, {
        kind: 'replace-group-values',
        group: recordOf(entryPath).state.entry?.activeGroup ?? 'default',
        values,
      }),
    retry: (entryPath) => {
      // async-iife: bootstrap -- the read publishes to the entry's observers.
      void read(entryPath);
    },
    ...(options.onError === undefined ? {} : { reportError: options.onError }),
    groups: {
      select: async (entryPath, _manifest, group) => write(entryPath, { kind: 'select-group', group }),
      create: async (entryPath, _manifest, { group, values }) =>
        write(entryPath, { kind: 'create-group', group, ...(values === undefined ? {} : { values }) }),
      rename: async (entryPath, _manifest, { group, nextGroup }) =>
        write(entryPath, { kind: 'rename-group', group, nextGroup }),
      delete: async (entryPath, _manifest, group) => write(entryPath, { kind: 'delete-group', group }),
    },
  };
};
