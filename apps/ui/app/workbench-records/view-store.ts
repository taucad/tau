/* oxlint-disable typescript/prefer-optional-chain -- Explicit null checks distinguish missing checked bytes. */
/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
/* oxlint-disable eslint/no-await-in-loop -- Checked conflicts must be retried sequentially. */
/* oxlint-disable promise/prefer-await-to-then -- Per-file write queues must serialize asynchronous callbacks. */
/* oxlint-disable eslint/max-params -- Record publication carries source, forced retry notice, and exact authored fields. */
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import type { CheckedFileWriteResult } from '@taucad/types';
import { createRecordHealth, isPotentiallyApplied } from '#workbench-records/record-health.js';
import type { RecordHealth } from '#workbench-records/record-health.js';

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
type ViewLifetime = { owners: Set<WeakRef<object>> };
type RetiredViewOwner = { path: string; viewLifetime: ViewLifetime; owner: WeakRef<object> };
const viewLifetimes = new Map<string, ViewLifetime>();
const releaseViewOwner = ({ path, viewLifetime, owner }: RetiredViewOwner): void => {
  viewLifetime.owners.delete(owner);
  if (viewLifetime.owners.size === 0 && viewLifetimes.get(path) === viewLifetime) {
    viewLifetimes.delete(path);
  }
};
// Render attempts may be abandoned before effects commit. They own weak tokens only;
// disposal retires immediately, while abandoned construction is cleaned up eventually by GC.
const retiredViewOwners = new FinalizationRegistry<RetiredViewOwner>(releaseViewOwner);
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
  'selectedKernelView',
] as const;
type ViewField = (typeof fields)[number];
type KernelView = NonNullable<WorkbenchView['kernelViews']>[number];
type KernelViewOption = NonNullable<KernelView['options']>[string];
type KernelViewChange = Partial<Omit<KernelView, 'id' | 'options'>> & {
  replace?: true;
  options?: Record<string, KernelViewOption | undefined>;
};
type Patch = Partial<Pick<WorkbenchView, Exclude<ViewField, 'display' | 'grid'>>> & {
  display?: Partial<WorkbenchView['display']>;
  grid?: Partial<WorkbenchView['grid']>;
  kernelViews?: Record<string, KernelViewChange | null>;
};

const combineKernelViews = (earlier: Patch['kernelViews'], later: Patch['kernelViews']): Patch['kernelViews'] => {
  if (!earlier && !later) {
    return undefined;
  }
  const combined = new Map<string, KernelViewChange | null>();
  for (const id of new Set([...Object.keys(earlier ?? {}), ...Object.keys(later ?? {})])) {
    const before = earlier && Object.hasOwn(earlier, id) ? earlier[id] : undefined;
    const after = later && Object.hasOwn(later, id) ? later[id] : undefined;
    if (after === undefined) {
      if (before !== undefined) {
        combined.set(id, before);
      }
    } else if (after === null || after.replace === true || before === null) {
      combined.set(id, after);
    } else {
      combined.set(id, { ...before, ...after, options: { ...before?.options, ...after.options } });
    }
  }
  return Object.fromEntries(combined);
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
    onHealth?: (health: RecordHealth) => void;
    /** Milliseconds. */
    editDebounce?: number;
  }>,
): Readonly<{
  read: (notify?: boolean) => Promise<boolean>;
  /** Fence a pending read as soon as its source changes. */
  invalidateRead: () => void;
  /** *Try again* after reads stopped: a fresh set of attempts. */
  retryRead: () => Promise<boolean>;
  edit: (next: WorkbenchView) => Promise<boolean>;
  ensure: (seed: WorkbenchView, eligible: () => boolean) => Promise<boolean>;
  /** Replace a refused record; `reviewed` is the exact refused bytes the person saw, and a newer file refuses the reset. */
  reset: (next: WorkbenchView, reviewed?: Uint8Array<ArrayBuffer> | null) => Promise<boolean>;
  flush: () => Promise<boolean>;
  dispose: () => void;
  snapshot: () => ViewRecordState;
  health: () => RecordHealth;
  ready: () => boolean;
}> {
  const path = `${input.root}/${workbenchPaths.view(input.viewId)}`;
  const viewEpoch = viewLifetimes.get(path) ?? { owners: new Set<WeakRef<object>>() };
  viewLifetimes.set(path, viewEpoch);
  const ownerToken = { disposed: false };
  const owner = new WeakRef(ownerToken);
  const retirement = { path, viewLifetime: viewEpoch, owner };
  viewEpoch.owners.add(owner);
  retiredViewOwners.register(ownerToken, retirement, ownerToken);
  // Replacement owns its lifetime before a first read; explicit close fences every earlier owner.
  const closed = (): boolean => ownerToken.disposed || closingViews.has(path) || viewLifetimes.get(path) !== viewEpoch;
  let state: ViewRecordState = {
    record: undefined,
    bytes: null,
    refusal: undefined,
  };
  let observed = false;
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
  /** A write whose reply was lost: it may be on disk, so the next write reads first and keeps it for attribution. */
  let unresolved: { bytes: Uint8Array<ArrayBuffer>; patch: ViewRecordPatch | undefined } | undefined;
  const health = createRecordHealth({
    onHealth: input.onHealth,
    readAgain: () => {
      void read();
    },
  });
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
    ...((earlier?.kernelViews ?? later.kernelViews)
      ? { kernelViews: combineKernelViews(earlier?.kernelViews, later.kernelViews) }
      : {}),
  });

  const mergeKernelViews = (
    current: WorkbenchView['kernelViews'],
    changes: Patch['kernelViews'],
  ): WorkbenchView['kernelViews'] => {
    if (!changes) {
      return current;
    }
    const byId = new Map((current ?? []).map((view) => [view.id, view]));
    for (const [id, change] of Object.entries(changes)) {
      if (change === null) {
        byId.delete(id);
        continue;
      }
      const prior = change.replace ? undefined : byId.get(id);
      const { replace: _replace, options: optionChanges, ...fields } = change;
      const options = new Map<string, KernelViewOption>(Object.entries(prior?.options ?? {}));
      for (const [key, value] of Object.entries(optionChanges ?? {})) {
        if (value === undefined) {
          options.delete(key);
        } else {
          options.set(key, value);
        }
      }
      byId.set(id, {
        ...prior,
        id,
        ...fields,
        ...(optionChanges ? { options: options.size > 0 ? Object.fromEntries(options) : undefined } : {}),
      });
    }
    return [...byId.values()];
  };

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
      state = { record: undefined, bytes: null, refusal: undefined };
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
    if (source === 'read' && !state.refusal && editSequence === settledSequence && !deferred) {
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
        const ownWrite =
          bytes &&
          [...inFlightWriteBytes, ...(unresolved ? [unresolved] : [])].find((written) =>
            sameBytes(written.bytes, bytes),
          );
        publish(bytes, ownWrite ? 'write' : 'read', notify || recovered, ownWrite?.patch);
        health.readSucceeded();
      }
      return observed;
    } catch (error) {
      if (current === generation && !closed()) {
        readError = true;
        input.onError(error);
        health.readFailed(error);
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
    const baseViews = new Map((base?.kernelViews ?? []).map((view) => [view.id, view]));
    const nextViews = new Map((next.kernelViews ?? []).map((view) => [view.id, view]));
    const kernelViews = new Map<string, KernelViewChange | null>();
    for (const id of new Set([...baseViews.keys(), ...nextViews.keys()])) {
      const before = baseViews.get(id);
      const after = nextViews.get(id);
      if (!after) {
        kernelViews.set(id, null);
        continue;
      }
      const change: KernelViewChange = {};
      if (!before) {
        change.replace = true;
      }
      for (const field of ['authoredInstance', 'camera'] as const) {
        if (!same(before?.[field], after[field])) {
          Object.assign(change, { [field]: after[field] });
        }
      }
      const beforeOptions = before?.options;
      const afterOptions = after.options;
      const options = Object.fromEntries(
        [...new Set([...Object.keys(beforeOptions ?? {}), ...Object.keys(afterOptions ?? {})])]
          .filter(
            (key) =>
              !same(
                beforeOptions && Object.hasOwn(beforeOptions, key) ? beforeOptions[key] : undefined,
                afterOptions && Object.hasOwn(afterOptions, key) ? afterOptions[key] : undefined,
              ),
          )
          .map((key) => [key, afterOptions && Object.hasOwn(afterOptions, key) ? afterOptions[key] : undefined]),
      );
      if (Object.keys(options).length > 0) {
        change.options = options;
      }
      if (!before || Object.keys(change).length > 0) {
        kernelViews.set(id, change);
      }
    }
    if (kernelViews.size > 0) {
      patch.kernelViews = Object.fromEntries(kernelViews);
    }
    return patch;
  };
  const write = async (
    next: WorkbenchView,
    patch: Patch | undefined,
    resetBytes?: Uint8Array<ArrayBuffer> | null,
    ensure?: () => boolean,
  ): Promise<'saved' | 'retry' | 'blocked'> => {
    if (closed()) {
      return 'blocked';
    }
    if ((!observed || unresolved) && !(await read())) {
      return 'retry';
    }
    unresolved = undefined;
    const reset = resetBytes !== undefined;
    if (state.refusal && (!reset || state.refusal.code === 'NEWER_RECORD')) {
      return 'blocked';
    }
    if (reset && (state.refusal?.code !== 'INVALID_RECORD' || !sameBytes(state.bytes, resetBytes))) {
      return 'blocked';
    }
    if (ensure && !ensure()) {
      return 'blocked';
    }
    if (ensure && state.bytes !== null) {
      return 'saved';
    }
    const editPatch = patch ?? diff(next, state.record);
    if (!reset && !ensure && Object.keys(editPatch).length === 0) {
      return 'saved';
    }
    for (let attempt = 0; attempt < (reset || ensure ? 1 : 3); attempt++) {
      if (closed() || (ensure && !ensure())) {
        return 'blocked';
      }
      // The schema supplies required defaults when the file is first created.
      const merged: WorkbenchView =
        reset || ensure
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
              kernelViews: mergeKernelViews(state.record?.kernelViews, editPatch.kernelViews),
              version: 1,
              entryPath: editPatch.entryPath === undefined ? (state.record?.entryPath ?? null) : editPatch.entryPath,
              camera: editPatch.camera ?? state.record?.camera ?? next.camera,
            };
      if (
        !reset &&
        !ensure &&
        state.record &&
        workbenchRecords.view.serialize(merged) === workbenchRecords.view.serialize(state.record)
      ) {
        return 'saved';
      }
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
        health.writeStarted();
        try {
          result = await operation;
        } catch (error) {
          if (isPotentiallyApplied(error)) {
            unresolved = attempted;
          }
          throw error;
        } finally {
          health.writeSettled();
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
        if (ensure) {
          return state.bytes !== null && !state.refusal ? 'saved' : 'blocked';
        }
        if (reset || state.refusal) {
          return 'blocked';
        }
      } catch (error) {
        input.onError(error);
        health.writeFailed(error);
        return 'retry';
      }
    }
    const conflicted = new Error(`The view ${input.viewId} changed while it was being saved. Try again.`);
    input.onError(conflicted);
    health.writeFailed(conflicted);
    return 'retry';
  };
  const settleIntent = (): void => {
    if (!deferred && !queuedEdit) {
      health.intentSettled();
    }
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
            settleIntent();
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
          settleIntent();
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
    invalidateRead: () => {
      generation++;
    },
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
    ensure: async (seed, eligible) => {
      const result = pending
        .then(async () => write(seed, undefined, undefined, eligible))
        .then((status) => status === 'saved');
      pending = result;
      return result;
    },
    reset: async (next, reviewedBytes) => {
      if (closed() || state.refusal?.code !== 'INVALID_RECORD') {
        return false;
      }
      const reviewed = reviewedBytes === undefined ? state.bytes : reviewedBytes;
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
          settleIntent();
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
        if (unresolved && !(await read())) {
          return false;
        }
        unresolved = undefined;
        settleIntent();
        return true;
      }
      const status = await write(intended ?? state.record!, deferred);
      if (status === 'saved') {
        deferred = undefined;
        retryDelay = 250;
        settleIntent();
        return true;
      }
      if (status === 'retry') {
        retry();
      }
      return false;
    },
    dispose: () => {
      if (ownerToken.disposed) {
        return;
      }
      ownerToken.disposed = true;
      retiredViewOwners.unregister(ownerToken);
      releaseViewOwner(retirement);
      generation++;
      health.dispose();
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
    health: () => health.health(),
    retryRead: async () => {
      health.restartReads();
      return read(true);
    },
    ready: () => observed,
  };
}
