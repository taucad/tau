/* oxlint-disable typescript/prefer-optional-chain -- Explicit null checks distinguish missing checked bytes. */
/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
/* oxlint-disable eslint/no-await-in-loop -- Checked conflicts must be retried sequentially. */
/* oxlint-disable promise/prefer-await-to-then -- Per-file write queues must serialize asynchronous callbacks. */
/* oxlint-disable eslint/max-params -- Record publication carries source, forced retry notice, and exact authored fields. */
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import type { CheckedFileWriteResult } from '@taucad/types';

type Files = Readonly<{
  exists: (path: string) => Promise<boolean>;
  readFile: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
  writeFileChecked: (input: {
    path: string;
    data: string;
    preconditions: ReadonlyArray<{
      path: string;
      expected: Uint8Array<ArrayBuffer> | null;
    }>;
  }) => Promise<CheckedFileWriteResult>;
}>;

const closingViews = new Set<string>();
const viewLifetimes = new Map<string, object>();
const lifetimeOwners = new WeakMap<object, number>();
const activeWrites = new Map<string, Set<Promise<CheckedFileWriteResult>>>();

/** Stop a closed view's owners and wait for checked writes before deleting its file. */
export async function fenceClosedView(path: string): Promise<void> {
  closingViews.add(path);
  viewLifetimes.delete(path);
  await Promise.allSettled(activeWrites.get(path) ?? []);
}

/** Release the close fence after checked deletion; new owners get a new lifetime. */
export function finishClosedView(path: string): void {
  closingViews.delete(path);
}

export type ViewRecordState = Readonly<{
  record: WorkbenchView | undefined;
  bytes: Uint8Array<ArrayBuffer> | null;
  refusal: { code: 'INVALID_RECORD' | 'NEWER_RECORD'; message: string } | undefined;
}>;

const fields = [
  'entryPath',
  'name',
  'camera',
  'fieldOfView',
  'upDirection',
  'display',
  'grid',
  'section',
  'measurements',
] as const;
type ViewField = (typeof fields)[number];
type Patch = Partial<Pick<WorkbenchView, Exclude<ViewField, 'display' | 'grid'>>> & {
  display?: Partial<WorkbenchView['display']>;
  grid?: Partial<WorkbenchView['grid']>;
};
export type ViewRecordPatch = Patch;

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);
const sameBytes = (left: Uint8Array<ArrayBuffer> | null, right: Uint8Array<ArrayBuffer> | null): boolean =>
  left === right || (left !== null && right?.length === left.length && left.every((v, i) => v === right[i]));

/** Per-view checked writer: person field diffs merge onto fresh bytes after conflicts. */
export function createWorkbenchViewStore(
  input: Readonly<{
    root: string;
    viewId: string;
    files: Files;
    onChange: (state: ViewRecordState, source: 'read' | 'write', locallyAuthored: ViewRecordPatch | undefined) => void;
    onError: (error: unknown) => void;
    /** Milliseconds. */
    editDebounce?: number;
  }>,
): Readonly<{
  read: (notify?: boolean) => Promise<boolean>;
  edit: (next: WorkbenchView) => Promise<boolean>;
  reset: (next: WorkbenchView) => Promise<boolean>;
  flush: () => Promise<boolean>;
  dispose: () => void;
  snapshot: () => ViewRecordState;
  ready: () => boolean;
}> {
  const path = `${input.root}/${workbenchPaths.view(input.viewId)}`;
  const viewEpoch = viewLifetimes.get(path) ?? {};
  viewLifetimes.set(path, viewEpoch);
  let registered = false;
  const closed = (): boolean => {
    if (disposed || closingViews.has(path) || viewLifetimes.get(path) !== viewEpoch) {
      return true;
    }
    if (!registered) {
      lifetimeOwners.set(viewEpoch, (lifetimeOwners.get(viewEpoch) ?? 0) + 1);
      registered = true;
    }
    return false;
  };
  let state: ViewRecordState = {
    record: undefined,
    bytes: null,
    refusal: undefined,
  };
  let observed = false;
  let disposed = false;
  let generation = 0;
  let readError = false;
  let pending: Promise<unknown> = Promise.resolve();
  let intended: WorkbenchView | undefined;
  let editSequence = 0;
  let settledSequence = 0;
  let deferred: Patch | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 250;
  let editTimer: ReturnType<typeof setTimeout> | undefined;
  const inFlightWriteBytes = new Set<{
    bytes: Uint8Array<ArrayBuffer>;
    patch: ViewRecordPatch | undefined;
  }>();
  let queuedEdit:
    | {
        next: WorkbenchView;
        patch: Patch;
        sequence: number;
        resolve: Array<(saved: boolean) => void>;
      }
    | undefined;
  const combine = (earlier: Patch | undefined, later: Patch): Patch => ({
    ...earlier,
    ...later,
    ...((earlier?.display ?? later.display) ? { display: { ...earlier?.display, ...later.display } } : {}),
    ...((earlier?.grid ?? later.grid) ? { grid: { ...earlier?.grid, ...later.grid } } : {}),
  });

  const publish = (
    bytes: Uint8Array<ArrayBuffer> | null,
    source: 'read' | 'write',
    notify = false,
    locallyAuthored?: ViewRecordPatch,
  ): void => {
    if (observed && sameBytes(state.bytes, bytes) && !notify) {
      return;
    }
    observed = true;
    if (bytes === null) {
      state = { ...state, bytes: null, refusal: undefined };
    } else {
      const result = workbenchRecords.view.read(bytes);
      state =
        result.status === 'current'
          ? { record: result.record, bytes, refusal: undefined }
          : {
              ...state,
              bytes,
              refusal: { code: result.code, message: result.message },
            };
    }
    input.onChange(state, source, locallyAuthored);
    if (source === 'read' && state.record && editSequence === settledSequence && !deferred) {
      intended = state.record;
    }
  };
  const read = async (notify = false): Promise<boolean> => {
    if (closed()) {
      return false;
    }
    const current = ++generation;
    try {
      const bytes = (await input.files.exists(path)) ? await input.files.readFile(path) : null;
      if (current === generation && !closed()) {
        const recovered = readError;
        readError = false;
        const ownWrite = bytes && [...inFlightWriteBytes].find((written) => sameBytes(written.bytes, bytes));
        publish(bytes, ownWrite ? 'write' : 'read', notify || recovered, ownWrite?.patch);
      }
      return observed;
    } catch (error) {
      if (current === generation && !closed()) {
        readError = true;
        input.onError(error);
      }
      return false;
    }
  };
  const diff = (next: WorkbenchView, base: WorkbenchView | null | undefined = intended ?? state.record): Patch => {
    const patch: Patch = {};
    for (const field of fields) {
      if (field === 'display' || field === 'grid') {
        continue;
      }
      if (!same(base?.[field], next[field])) {
        Object.assign(patch, { [field]: next[field] });
      }
    }
    const display = Object.fromEntries(
      Object.entries(next.display).filter(
        ([key, value]) => !same(base?.display[key as keyof WorkbenchView['display']], value),
      ),
    );
    const grid = Object.fromEntries(
      Object.entries(next.grid).filter(([key, value]) => !same(base?.grid[key as keyof WorkbenchView['grid']], value)),
    );
    if (Object.keys(display).length > 0) {
      patch.display = display;
    }
    if (Object.keys(grid).length > 0) {
      patch.grid = grid;
    }
    return patch;
  };
  const write = async (
    next: WorkbenchView,
    patch: Patch | undefined,
    resetBytes?: Uint8Array<ArrayBuffer> | null,
  ): Promise<'saved' | 'retry' | 'blocked'> => {
    if (closed()) {
      return 'blocked';
    }
    if (!observed && !(await read())) {
      return 'retry';
    }
    const reset = resetBytes !== undefined;
    if (state.refusal && (!reset || state.refusal.code === 'NEWER_RECORD')) {
      return 'blocked';
    }
    if (reset && (state.refusal?.code !== 'INVALID_RECORD' || !sameBytes(state.bytes, resetBytes))) {
      return 'blocked';
    }
    const editPatch = patch ?? diff(next, state.record);
    if (!reset && Object.keys(editPatch).length === 0) {
      return 'saved';
    }
    for (let attempt = 0; attempt < (reset ? 1 : 3); attempt++) {
      if (closed()) {
        return 'blocked';
      }
      // The schema supplies required defaults when the file is first created.
      const merged: WorkbenchView = reset
        ? next
        : {
            ...next,
            ...state.record,
            ...editPatch,
            display: {
              ...next.display,
              ...state.record?.display,
              ...editPatch.display,
            },
            grid: { ...next.grid, ...state.record?.grid, ...editPatch.grid },
            version: 1,
            entryPath: editPatch.entryPath === undefined ? (state.record?.entryPath ?? null) : editPatch.entryPath,
            camera: editPatch.camera ?? state.record?.camera ?? next.camera,
          };
      const expected = reset ? (resetBytes ?? null) : state.bytes;
      const generationAtWrite = generation;
      try {
        const data = workbenchRecords.view.serialize(merged);
        const attempted = {
          bytes: new TextEncoder().encode(data),
          patch: reset ? undefined : editPatch,
        };
        inFlightWriteBytes.add(attempted);
        const operation = Promise.resolve().then(async () =>
          input.files.writeFileChecked({
            path,
            data,
            preconditions: [{ path, expected }],
          }),
        );
        const writes = activeWrites.get(path) ?? new Set<Promise<CheckedFileWriteResult>>();
        writes.add(operation);
        activeWrites.set(path, writes);
        let result: CheckedFileWriteResult;
        try {
          result = await operation;
        } finally {
          inFlightWriteBytes.delete(attempted);
          writes.delete(operation);
          if (writes.size === 0) {
            activeWrites.delete(path);
          }
        }
        if (result.status !== 'conflict') {
          if (generation === generationAtWrite) {
            generation++;
            publish(result.content, 'write', false, attempted.patch);
          } else {
            // A watch overlapped the write. Read the live bytes after acknowledgement:
            // that watch may have captured either the old base or a newer foreign edit.
            const refresh = ++generation;
            try {
              const latest = (await input.files.exists(path)) ? await input.files.readFile(path) : null;
              if (refresh === generation) {
                const ownWrite = sameBytes(latest, result.content);
                publish(latest, ownWrite ? 'write' : 'read', false, ownWrite ? attempted.patch : undefined);
              }
            } catch (error) {
              input.onError(error);
            }
          }
          return 'saved';
        }
        if (!(await read())) {
          return 'retry';
        }
        if (reset || state.refusal) {
          return 'blocked';
        }
      } catch (error) {
        input.onError(error);
        return 'retry';
      }
    }
    input.onError(new Error(`The view ${input.viewId} changed while it was being saved. Try again.`));
    return 'retry';
  };
  const retry = (): void => {
    if (closed() || !deferred || retryTimer) {
      return;
    }
    retryTimer = setTimeout(() => {
      if (closed()) {
        return;
      }
      retryTimer = undefined;
      const result = pending
        .then(async () => (deferred ? write(intended ?? state.record!, deferred) : 'saved'))
        .then((status) => {
          if (status === 'saved') {
            deferred = undefined;
            retryDelay = 250;
          } else if (status === 'retry') {
            retryDelay = Math.min(retryDelay * 2, 8000);
            retry();
          }
        });
      pending = result;
    }, retryDelay);
  };
  const queueWrite = async (next: WorkbenchView, patch: Patch, sequence: number): Promise<boolean> => {
    const result = pending
      .then(async () => write(next, combine(deferred, patch)))
      .then((status) => {
        const saved = status === 'saved';
        settledSequence = sequence;
        if (saved) {
          deferred = undefined;
          retryDelay = 250;
        } else {
          const remaining = combine(deferred, patch);
          deferred = status === 'retry' || Object.keys(remaining).length > 0 ? remaining : undefined;
          if (status === 'retry') {
            retry();
          }
        }
        if (sequence === editSequence) {
          intended = saved ? state.record : next;
        }
        return saved;
      });
    pending = result;
    return result;
  };
  const drainEdit = async (): Promise<void> => {
    if (editTimer) {
      clearTimeout(editTimer);
      editTimer = undefined;
    }
    const queued = queuedEdit;
    queuedEdit = undefined;
    if (!queued) {
      return;
    }
    return queueWrite(queued.next, queued.patch, queued.sequence).then((saved) => {
      for (const resolve of queued.resolve) {
        resolve(saved);
      }
    });
  };
  return {
    read,
    edit: async (next) => {
      if (closed()) {
        return false;
      }
      const patch = diff(next, observed ? undefined : null);
      intended = next;
      const sequence = ++editSequence;
      if (!input.editDebounce) {
        return queueWrite(next, patch, sequence);
      }
      return new Promise<boolean>((resolve) => {
        queuedEdit = queuedEdit
          ? {
              next,
              patch: combine(queuedEdit.patch, patch),
              sequence,
              resolve: [...queuedEdit.resolve, resolve],
            }
          : { next, patch, sequence, resolve: [resolve] };
        if (editTimer) {
          clearTimeout(editTimer);
        }
        editTimer = setTimeout(() => {
          void drainEdit();
        }, input.editDebounce);
      });
    },
    reset: async (next) => {
      if (closed() || state.refusal?.code !== 'INVALID_RECORD') {
        return false;
      }
      const reviewed = state.bytes;
      await drainEdit();
      const sequence = ++editSequence;
      const result = pending
        .then(async () => write(next, undefined, reviewed))
        .then((status) => {
          if (status !== 'saved') {
            return false;
          }
          deferred = undefined;
          settledSequence = sequence;
          if (sequence === editSequence) {
            intended = state.record;
          }
          return true;
        });
      pending = result;
      return result;
    },
    flush: async () => {
      await drainEdit();
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      await pending;
      if (!deferred) {
        return true;
      }
      const status = await write(intended ?? state.record!, deferred);
      if (status === 'saved') {
        deferred = undefined;
        retryDelay = 250;
        return true;
      }
      if (status === 'retry') {
        retry();
      }
      return false;
    },
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      generation++;
      if (registered) {
        const remaining = (lifetimeOwners.get(viewEpoch) ?? 1) - 1;
        if (remaining === 0 && viewLifetimes.get(path) === viewEpoch) {
          viewLifetimes.delete(path);
        }
        lifetimeOwners.set(viewEpoch, remaining);
      }
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      if (editTimer) {
        clearTimeout(editTimer);
        editTimer = undefined;
      }
    },
    snapshot: () => state,
    ready: () => observed,
  };
}
