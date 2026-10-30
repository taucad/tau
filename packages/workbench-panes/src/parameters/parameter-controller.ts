/**
 * The parameter queue behind a host's Parameters pane, over any host's parameter authority (parity PAR-2, PAR-6).
 *
 * A host hands it a {@link ParameterTransport}: how to read an entry's manifest and record, how to propose one checked
 * operation, and, when its renderer can, how to render a drag's transient values. The controller does the rest the same
 * way for every host:
 *
 * - each entry's operations run one after another, each pinned to the manifest revision the last read returned, and
 *   the entry is read again after each, so a refusal shows the authority value again;
 * - a drag (and any transient commit) previews through the transport at most once per interval, latest value wins,
 *   never more than one in flight, and nothing is written until release; a drag that ends without a committed write
 *   restores the committed render;
 * - a final value that the authority refuses stays in its row as a refused draft, with the authority's message.
 */
import { useSyncExternalStore } from 'react';
import type {
  ParameterManifest,
  ParameterSetAuthoritySnapshot,
  ParameterSetIdentity,
  ParameterSetOperation,
  ParameterSetOutcome,
  ParameterSetRequest,
  ParameterSetRequestBase,
} from '@taucad/parameters';
import type { JSONValue } from '@taucad/types';
import type { ParameterDraft } from '@taucad/viewer/parameters/parameter-edit';
import type { ParameterCommit } from '@taucad/viewer/parameters/rjsf-context';
import type {
  ParametersDraftKey,
  ParametersDrafts,
  ParametersEntryState,
  ParametersFailure,
  ParametersSource,
} from '#parameters/parameters-source.js';
import { randomUuid } from '@taucad/utils/id';

/**
 * How the controller reaches one host's parameter authority.
 *
 * @public
 */
export type ParameterTransport = Readonly<{
  /** Read an entry's admitted manifest and current record, or why it cannot be edited. */
  read(
    input: Readonly<{ entryPath: string }>,
  ): Promise<
    | Readonly<{ manifest: ParameterManifest; current: ParameterSetAuthoritySnapshot }>
    | Readonly<{ failure: ParametersFailure }>
  >;
  /** Propose one checked operation; the outcome says whether it was written. */
  propose(input: Readonly<{ entryPath: string; request: ParameterSetRequest }>): Promise<ParameterSetOutcome>;
  /**
   * Render transient values over the committed ones, resolving when the renderer took them; `undefined` ends the preview
   * and renders the committed values again. Absent, a dragged row previews its value alone and the model renders on
   * release.
   */
  preview?(
    input: Readonly<{ entryPath: string; parameters: Readonly<Record<string, JSONValue>> | undefined }>,
  ): Promise<void>;
  /** Replace an unreadable record with an empty one. Absent, an unreadable record offers a retry instead. */
  resetRecord?(input: Readonly<{ entryPath: string }>): Promise<void>;
}>;

/**
 * What a host sets around the controller.
 *
 * @public
 */
export type ParameterControllerOptions = Readonly<{
  transport: ParameterTransport;
  /** Minimum gap between two previews, in milliseconds; the newest value waiting wins. Default 200. */
  previewInterval?: number;
  /**
   * The host's draft store, when it owns final settlement itself (the Tau app's parameter service). Absent, the
   * controller keeps drafts in memory and records each final's settlement in them.
   */
  drafts?: ParametersDrafts;
  /** Show an operation's failure. Absent, the pane shows it above its sections. */
  reportError?: (message: string) => void;
}>;

/**
 * The parameter queue, revision pinning, preview pump and drafts behind any host's Parameters pane.
 *
 * @public
 */
export type ParameterController = Required<
  Pick<ParametersSource, 'useEntry' | 'commitValue' | 'replaceValues' | 'retry' | 'drafts' | 'useScrub' | 'groups'>
> &
  Pick<ParametersSource, 'resetRecord' | 'reportError'> &
  Readonly<{
    /** Read one entry, or every entry read so far, again: its source or record changed outside the pane. */
    refresh(entryPath?: string): void;
    /** What the pane shows for an entry, outside render. */
    snapshot(entryPath: string): ParametersEntryState;
    /**
     * Observe an entry outside render; the first observer reads it.
     *
     * @returns Unsubscribes.
     */
    subscribe(entryPath: string, listener: () => void): () => void;
    /** Stop previews and forget every entry. */
    dispose(): void;
  }>;

type EntryRecord = {
  state: ParametersEntryState;
  /** The identity the last read returned; every proposal is pinned to it. */
  identity: ParameterSetIdentity | undefined;
  /** Bumped by each read, so only the newest read publishes. */
  generation: number;
  isRequested: boolean;
  /** The entry's operations, in order. */
  queue: Promise<unknown>;
  listeners: Set<() => void>;
  subscribe: (listener: () => void) => () => void;
};

/** One entry's drag lane. */
type PreviewLane = {
  /** The gesture in progress: whether any of its values reached the renderer. */
  active: { generation: number; sent: boolean } | undefined;
  /** The newest value waiting to be sent. */
  pending: Readonly<Record<string, JSONValue>> | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
  /** The preview the renderer is taking. */
  inFlight: Promise<void> | undefined;
  lastSentAt: number;
  scrub: NonNullable<ParameterCommit['scrub']>;
  endScrub: NonNullable<ParameterCommit['endScrub']>;
};

const unknownState: ParametersEntryState = { manifest: undefined, entry: undefined, failure: undefined };

const defaultPreviewInterval = 200;

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Set one RFC 6901 pointer inside a values object, creating the objects on its way.
 *
 * @param values - The values to set it in.
 * @param pointer - The field's pointer, such as `/dimensions/width`.
 * @param value - Its value.
 * @returns A new object; `values` is not changed.
 */
const withPointerValue = (
  values: Readonly<Record<string, JSONValue>>,
  pointer: string,
  value: JSONValue,
): Readonly<Record<string, JSONValue>> => {
  const [head, ...rest] = pointer
    .split('/')
    .slice(1)
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (head === undefined) {
    return values;
  }
  const child = values[head];
  const nested =
    rest.length === 0
      ? value
      : withPointerValue(
          typeof child === 'object' && child !== null && !Array.isArray(child) ? child : {},
          `/${rest.map((segment) => segment.replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`,
          value,
        );
  return { ...values, [head]: nested };
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
 * Drafts kept in memory, with each final's settlement, for a host that keeps none.
 *
 * @returns The store the pane reads, and how the controller records a final's settlement.
 */
const createSettlingDrafts = (): Readonly<{
  drafts: ParametersDrafts;
  settle: (key: ParametersDraftKey, draft: ParameterDraft | undefined) => void;
}> => {
  const held = new Map<string, ParameterDraft>();
  const listeners = new Set<() => void>();
  const keyOf = (key: ParametersDraftKey): string => JSON.stringify([key.entryPath, key.group, key.pointer]);
  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };
  return {
    drafts: {
      draft: (key) => held.get(keyOf(key)),
      setDraft: (key, draft) => {
        if (draft !== undefined) {
          // Typing stays local; only clearing notifies mounted rows.
          held.set(keyOf(key), draft);
          return;
        }
        if (held.delete(keyOf(key))) {
          notify();
        }
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    settle: (key, draft) => {
      if (draft === undefined) {
        held.delete(keyOf(key));
      } else {
        held.set(keyOf(key), draft);
      }
      notify();
    },
  };
};

/**
 * Whether an operation was written.
 *
 * @param outcome - The operation's outcome.
 * @returns `true` once it committed; `false` for any other outcome or a failure.
 */
const isCommitted = async (outcome: Promise<ParameterSetOutcome>): Promise<boolean> => {
  try {
    const settledOutcome = await outcome;
    return settledOutcome.status === 'committed';
  } catch {
    return false;
  }
};

/**
 * The outcome of an operation, or `undefined` when it threw (its caller reports that).
 *
 * @param outcome - The operation's outcome.
 * @returns The settled outcome.
 */
const settledOutcomeOf = async (outcome: Promise<ParameterSetOutcome>): Promise<ParameterSetOutcome | undefined> => {
  try {
    return await outcome;
  } catch {
    return undefined;
  }
};

/**
 * Create the parameter controller over one host's transport.
 *
 * @param options - The transport, the preview interval, the host's drafts and where failures go.
 * @returns The controller; a host spreads it into its {@link ParametersSource}.
 * @public
 */
export const createParameterController = (options: ParameterControllerOptions): ParameterController => {
  const { transport } = options;
  const previewInterval = options.previewInterval ?? defaultPreviewInterval;
  const records = new Map<string, EntryRecord>();
  const lanes = new Map<string, PreviewLane>();
  const own = options.drafts === undefined ? createSettlingDrafts() : undefined;
  const drafts = options.drafts ?? own!.drafts;
  let sequence = 0;
  /* This pane is one editor: a field still holding its own last write is never a conflict for it. */
  const editor = `pane:${randomUuid()}`;
  let gestures = 0;
  let isDisposed = false;

  const nextRequestId = (): string => {
    sequence += 1;
    return `pane-${String(Date.now())}-${String(sequence)}`;
  };

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
    let identity: ParameterSetIdentity | undefined;
    try {
      const answer = await transport.read({ entryPath });
      if ('failure' in answer) {
        state = { manifest: undefined, entry: undefined, failure: answer.failure };
      } else {
        ({ identity } = answer.current);
        const held = record.state.manifest;
        // An equal manifest keeps its identity, so the form does not rebuild on every read.
        const manifest = held !== undefined && held.revision === answer.manifest.revision ? held : answer.manifest;
        state = { manifest, entry: answer.current.entry, failure: undefined };
      }
    } catch (error) {
      state = {
        manifest: undefined,
        entry: undefined,
        failure: { code: 'RESOLUTION_FAILED', message: errorText(error) },
      };
    }
    if (generation === record.generation && !isDisposed) {
      record.identity = identity;
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
      identity: undefined,
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
   * @param entryPath - The entry whose record the operation writes.
   * @param operation - What to write.
   * @param edit - The value the edited field held when the edit began, when the edit names one, and the request's id.
   * @returns The authority's outcome, after the entry has been read again.
   */
  const propose = async (
    entryPath: string,
    operation: ParameterSetOperation,
    edit: Readonly<{ base?: ParameterSetRequestBase | undefined; requestId?: string }> = {},
  ): Promise<ParameterSetOutcome> => {
    const record = recordOf(entryPath);
    const { base } = edit;
    const requestId = edit.requestId ?? nextRequestId();
    const run = async (): Promise<ParameterSetOutcome> => {
      if (record.identity === undefined) {
        await read(entryPath);
      }
      const { identity } = record;
      if (identity === undefined) {
        return {
          status: 'rejected',
          requestId,
          code: record.state.failure?.code ?? 'RESOLUTION_FAILED',
          message: record.state.failure?.message ?? 'Parameters are not loaded.',
        };
      }
      const outcome = await transport.propose({
        entryPath,
        request: {
          requestId,
          expected: identity,
          pressure: 'final',
          operation,
          ...(base === undefined ? {} : { base: { ...base, editor } }),
        },
      });
      /* Committed or not, the record now holds what the authority holds: a refusal shows its value again. */
      await read(entryPath);
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

  const write = async (entryPath: string, operation: ParameterSetOperation): Promise<void> => {
    committedOrThrow(await propose(entryPath, operation));
  };

  const { preview } = transport;

  /**
   * Send one value to the renderer, then the newest one that waited behind it.
   *
   * @param lane - The entry's lane.
   * @param entryPath - The entry.
   * @param parameters - The values to render.
   */
  const sendPreview = async (
    lane: PreviewLane,
    entryPath: string,
    parameters: Readonly<Record<string, JSONValue>>,
  ): Promise<void> => {
    try {
      await preview?.({ entryPath, parameters });
    } catch (error) {
      options.reportError?.(errorText(error));
    } finally {
      lane.inFlight = undefined;
      pump(lane, entryPath);
    }
  };

  function pump(lane: PreviewLane, entryPath: string): void {
    if (lane.inFlight !== undefined || lane.timer !== undefined || lane.pending === undefined || isDisposed) {
      return;
    }
    const wait = lane.lastSentAt + previewInterval - Date.now();
    if (wait > 0) {
      lane.timer = setTimeout(() => {
        lane.timer = undefined;
        pump(lane, entryPath);
      }, wait);
      return;
    }
    const parameters = lane.pending;
    lane.pending = undefined;
    lane.lastSentAt = Date.now();
    if (lane.active !== undefined) {
      lane.active.sent = true;
    }
    lane.inFlight = sendPreview(lane, entryPath, parameters);
  }

  const clearPending = (lane: PreviewLane): void => {
    lane.pending = undefined;
    if (lane.timer !== undefined) {
      clearTimeout(lane.timer);
      lane.timer = undefined;
    }
  };

  const laneOf = (entryPath: string): PreviewLane => {
    const existing = lanes.get(entryPath);
    if (existing !== undefined) {
      return existing;
    }
    const lane: PreviewLane = {
      active: undefined,
      pending: undefined,
      timer: undefined,
      inFlight: undefined,
      lastSentAt: Number.NEGATIVE_INFINITY,
      scrub: (field) => {
        gestures += lane.active === undefined ? 1 : 0;
        lane.active ??= { generation: gestures, sent: false };
        lane.pending = withPointerValue({}, field.pointer, field.value);
        pump(lane, entryPath);
      },
      endScrub: async (final) => {
        const completed = lane.active;
        lane.active = undefined;
        clearPending(lane);
        if (completed?.sent !== true) {
          return;
        }
        /* The restore goes after the last preview, so the renderer ends on the committed values. */
        if (lane.inFlight !== undefined) {
          await lane.inFlight;
        }
        /* A committed write changes the record the renderer watches, which renders the committed values again. */
        const isCommitted = final === undefined ? false : await final;
        if (!isCommitted && gestures === completed.generation && !isDisposed) {
          try {
            await preview?.({ entryPath, parameters: undefined });
          } catch (error) {
            options.reportError?.(errorText(error));
          }
        }
      },
    };
    lanes.set(entryPath, lane);
    return lane;
  };

  const noScrub: Pick<ParameterCommit, 'scrub' | 'endScrub'> = {};

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
    commitValue: async (entryPath, _manifest, field) => {
      if (field.pressure === 'transient') {
        /* A transient value is a preview: it renders, and only the released value is written. */
        if (preview !== undefined) {
          laneOf(entryPath).scrub({ pointer: field.pointer, value: field.value });
        }
        return { status: 'cancelled-before-apply', requestId: nextRequestId() };
      }
      const key: ParametersDraftKey = { entryPath, group: field.group, pointer: field.pointer };
      const { draft, base } = field;
      const requestId = nextRequestId();
      const outcome = propose(
        entryPath,
        { kind: 'native-value', group: field.group, pointer: field.pointer, value: field.value },
        { base, requestId },
      );
      /* Transient commits that previewed end with this value: committed, it renders through the record. */
      const lane = lanes.get(entryPath);
      if (lane?.active !== undefined) {
        // async-iife: bootstrap -- the lane restores the committed render itself if this value is not written.
        void lane.endScrub(isCommitted(outcome));
      }
      if (own !== undefined && draft !== undefined) {
        own.settle(key, { ...draft, final: { status: 'pending', requestId, base } });
        const settledOutcome = await settledOutcomeOf(outcome);
        if (settledOutcome === undefined || settledOutcome.status === 'committed') {
          own.settle(key, undefined);
        } else if (settledOutcome.status !== 'cancelled-before-apply') {
          own.settle(key, {
            ...draft,
            final: {
              status: 'refused',
              requestId: settledOutcome.requestId,
              base,
              message: settledOutcome.message,
            },
          });
        }
      }
      return outcome;
    },
    replaceValues: async (entryPath, _manifest, values) =>
      write(entryPath, {
        kind: 'replace-group-values',
        group: recordOf(entryPath).state.entry?.activeGroup ?? 'default',
        values: values as Readonly<Record<string, JSONValue>>,
      }),
    retry: (entryPath) => {
      // async-iife: bootstrap -- the read publishes to the entry's observers.
      void read(entryPath);
    },
    ...(transport.resetRecord === undefined
      ? {}
      : {
          resetRecord: async (entryPath: string) => {
            await transport.resetRecord?.({ entryPath });
            await read(entryPath);
          },
        }),
    ...(options.reportError === undefined ? {} : { reportError: options.reportError }),
    drafts,
    useScrub: (entryPath) => (preview === undefined ? noScrub : laneOf(entryPath)),
    groups: {
      select: async (entryPath, _manifest, group) => write(entryPath, { kind: 'select-group', group }),
      create: async (entryPath, _manifest, { group, values }) =>
        write(entryPath, {
          kind: 'create-group',
          group,
          ...(values === undefined ? {} : { values: values as Readonly<Record<string, JSONValue>> }),
        }),
      rename: async (entryPath, _manifest, { group, nextGroup }) =>
        write(entryPath, { kind: 'rename-group', group, nextGroup }),
      delete: async (entryPath, _manifest, group) => write(entryPath, { kind: 'delete-group', group }),
    },
    dispose: () => {
      isDisposed = true;
      for (const lane of lanes.values()) {
        lane.active = undefined;
        clearPending(lane);
      }
      lanes.clear();
      for (const record of records.values()) {
        record.listeners.clear();
      }
    },
  };
};
