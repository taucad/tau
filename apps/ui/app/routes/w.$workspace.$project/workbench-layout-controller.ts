/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
/* oxlint-disable eslint/no-await-in-loop -- Checked conflicts retry sequentially. */
/* oxlint-disable promise/prefer-await-to-then -- Per-file pending writes must serialize callbacks. */
/* oxlint-disable eslint/max-params -- The checked writer carries edits, Reset bytes, and an optional restore guard. */
/* oxlint-disable typescript/prefer-optional-chain -- Explicit null checks preserve absent-byte semantics. */
import type { ViewerNode, WorkbenchLaneNode, WorkbenchLayout, WorkbenchTab } from '@taucad/workbench';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import type { CheckedFileWriteResult } from '@taucad/types';
import { digestBytes } from '#utils/crypto.utils.js';
import { createRecordHealth, isPotentiallyApplied } from '#workbench-records/record-health.js';
import type { RecordHealth } from '#workbench-records/record-health.js';

/** The focused page's applied portable arrangement and any tabs it cannot display. */
export type WorkbenchLayoutSnapshot = Readonly<{
  layout: WorkbenchLayout;
  refused: ReadonlyArray<Readonly<{ tab: WorkbenchTab; reason: 'debug-only' }>>;
  layoutDigest: `sha256:${string}` | 'missing';
  /** Fingerprint of the existing device rollback slot, not call-specific history. */
  restoreTarget?: string;
  restoreUnavailable?: string;
  restoring?: boolean;
}>;

/** Project-scoped page commands. Restore writes the saved projection as an authoritative record edit. */
export type WorkbenchLayoutController = Readonly<{
  snapshot: () => WorkbenchLayoutSnapshot | undefined;
  subscribe: (listener: () => void) => () => void;
  restorePreviousArrangement: (
    expected: Readonly<{ layoutDigest: string; target: string; eligible: () => boolean }>,
  ) => Promise<boolean>;
  registerViewer: (apply: (node: ViewerNode, applied: () => void) => void) => () => void;
  registerWorkbench: (apply: (node: WorkbenchLaneNode, applied: () => void) => void) => () => void;
  personViewerChanged: (node: ViewerNode) => void;
  personWorkbenchChanged: (node: WorkbenchLaneNode | ((current: WorkbenchLaneNode) => WorkbenchLaneNode)) => void;
}>;

type LayoutFiles = Readonly<{
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

type LayoutState = Readonly<{
  layout: WorkbenchLayout | undefined;
  bytes: Uint8Array<ArrayBuffer> | null;
  refusal: { code: 'INVALID_RECORD' | 'NEWER_RECORD'; message: string } | undefined;
  digest: `sha256:${string}` | 'missing';
}>;
export type WorkbenchLayoutPatch = Partial<Pick<WorkbenchLayout, 'viewer' | 'workbench'>> &
  Readonly<{ lanes?: Partial<WorkbenchLayout['lanes']> }>;

/** One tab's checked layout writer. Reads always precede the first person edit. */
export function createWorkbenchLayoutStore(
  input: Readonly<{
    root: string;
    files: LayoutFiles;
    onChange: (state: LayoutState, source: 'read' | 'write', locallyAuthored?: WorkbenchLayoutPatch) => void;
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
  edit: (next: WorkbenchLayout) => Promise<boolean>;
  restore: (next: WorkbenchLayout, expectedDigest: string, eligible: () => boolean) => Promise<boolean>;
  /** Replace a refused record; `reviewed` is the exact refused bytes the person saw, and a newer file refuses the reset. */
  reset: (next: WorkbenchLayout, reviewed?: Uint8Array<ArrayBuffer> | null) => Promise<boolean>;
  flush: () => Promise<boolean>;
  dispose: () => void;
  snapshot: () => LayoutState;
  health: () => RecordHealth;
  ready: () => boolean;
  intendedLayout: () => WorkbenchLayout | undefined;
}> {
  const path = `${input.root}/${workbenchPaths.layout}`;
  let state: LayoutState = {
    layout: undefined,
    bytes: null,
    refusal: undefined,
    digest: 'missing',
  };
  let observed = false;
  let readGeneration = 0;
  let readError = false;
  let disposed = false;
  const isDisposed = (): boolean => disposed;
  let pending: Promise<unknown> = Promise.resolve();
  let intended: WorkbenchLayout | undefined;
  let editSequence = 0;
  let settledSequence = 0;
  let deferred: LayoutPatch | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 250;
  let editTimer: ReturnType<typeof setTimeout> | undefined;
  const inFlightWriteBytes = new Set<{
    bytes: Uint8Array<ArrayBuffer>;
    patch: WorkbenchLayoutPatch | undefined;
  }>();
  /** A write whose reply was lost: it may be on disk, so the next write reads first and keeps it for attribution. */
  let unresolved: { bytes: Uint8Array<ArrayBuffer>; patch: WorkbenchLayoutPatch | undefined } | undefined;
  const health = createRecordHealth({
    onHealth: input.onHealth,
    readAgain: () => {
      void read();
    },
  });
  let queuedEdit:
    | {
        next: WorkbenchLayout;
        patch: LayoutPatch;
        sequence: number;
        resolve: Array<(saved: boolean) => void>;
      }
    | undefined;
  const sameBytes = (left: Uint8Array<ArrayBuffer> | null, right: Uint8Array<ArrayBuffer> | null): boolean =>
    left === right ||
    (left !== null && right !== null && left.length === right.length && left.every((v, i) => v === right[i]));
  const publish = async (
    bytes: Uint8Array<ArrayBuffer> | null,
    source: 'read' | 'write',
    expectedGeneration = readGeneration,
    notify = false,
    locallyAuthored?: WorkbenchLayoutPatch,
  ): Promise<void> => {
    if (observed && sameBytes(bytes, state.bytes) && !notify) {
      return;
    }
    const digest = bytes === null ? 'missing' : await digestBytes(bytes);
    if (expectedGeneration !== readGeneration || disposed) {
      return;
    }
    observed = true;
    if (bytes === null) {
      // Absence is not an adoption command: live owners keep their values.
      state = { ...state, bytes: null, refusal: undefined, digest };
    } else {
      const result = workbenchRecords.layout.read(bytes);
      state =
        result.status === 'current'
          ? { layout: result.record, bytes, refusal: undefined, digest }
          : {
              ...state,
              bytes,
              refusal: { code: result.code, message: result.message },
              digest,
            };
    }
    input.onChange(state, source, locallyAuthored);
    if (source === 'read' && state.layout && editSequence === settledSequence && !deferred) {
      intended = state.layout;
    }
  };
  const read = async (notify = false): Promise<boolean> => {
    if (isDisposed()) {
      return false;
    }
    const generation = ++readGeneration;
    try {
      const bytes = (await input.files.exists(path)) ? await input.files.readFile(path) : null;
      if (generation === readGeneration && !isDisposed()) {
        const recovered = readError;
        readError = false;
        const ownWrite =
          bytes &&
          [...inFlightWriteBytes, ...(unresolved ? [unresolved] : [])].find((written) =>
            sameBytes(written.bytes, bytes),
          );
        await publish(bytes, ownWrite ? 'write' : 'read', generation, notify || recovered, ownWrite?.patch);
        health.readSucceeded();
      }
      return observed;
    } catch (error) {
      if (generation === readGeneration && !isDisposed()) {
        readError = true;
        input.onError(error);
        health.readFailed(error);
      }
      return false;
    }
  };
  type LayoutPatch = WorkbenchLayoutPatch;
  const combine = (earlier: LayoutPatch | undefined, later: LayoutPatch): LayoutPatch => ({
    ...earlier,
    ...later,
    lanes: { ...earlier?.lanes, ...later.lanes },
  });
  const diff = (
    next: WorkbenchLayout,
    base: WorkbenchLayout | null | undefined = intended ?? state.layout,
  ): LayoutPatch => ({
    ...(JSON.stringify(base?.viewer) === JSON.stringify(next.viewer) ? {} : { viewer: next.viewer }),
    ...(JSON.stringify(base?.workbench) === JSON.stringify(next.workbench) ? {} : { workbench: next.workbench }),
    lanes: Object.fromEntries(
      (['chat', 'workbench'] as const)
        .filter((key) => base?.lanes[key] !== next.lanes[key])
        .map((key) => [key, next.lanes[key]]),
    ),
  });
  const write = async (
    next: WorkbenchLayout,
    patch: LayoutPatch | undefined,
    reset: boolean,
    resetBytes?: Uint8Array<ArrayBuffer> | null,
    eligible?: () => boolean,
  ): Promise<'saved' | 'retry' | 'blocked'> => {
    if (isDisposed()) {
      return 'blocked';
    }
    if ((!observed || unresolved) && !(await read())) {
      return 'retry';
    }
    unresolved = undefined;
    if (state.refusal && (!reset || state.refusal.code === 'NEWER_RECORD')) {
      return 'blocked';
    }
    if (reset && (state.refusal?.code !== 'INVALID_RECORD' || !sameBytes(state.bytes, resetBytes ?? null))) {
      return 'blocked';
    }
    const editPatch = patch ?? diff(next, state.layout);
    if (
      editPatch.viewer === undefined &&
      editPatch.workbench === undefined &&
      Object.keys(editPatch.lanes ?? {}).length === 0 &&
      !reset
    ) {
      return 'saved';
    }
    for (let attempt = 0; attempt < (reset || eligible ? 1 : 3); attempt++) {
      if (isDisposed() || (eligible && !eligible())) {
        return 'blocked';
      }
      if (state.refusal && (!reset || state.refusal.code === 'NEWER_RECORD')) {
        return 'blocked';
      }
      const merged: WorkbenchLayout = reset
        ? next
        : {
            ...next,
            ...state.layout,
            ...editPatch,
            lanes: {
              ...next.lanes,
              ...state.layout?.lanes,
              ...editPatch.lanes,
            },
            version: 1,
          };
      const data = workbenchRecords.layout.serialize(merged);
      if (!reset && state.layout && data === workbenchRecords.layout.serialize(state.layout)) {
        return 'saved';
      }
      const expected = reset ? (resetBytes ?? null) : state.bytes;
      const generationAtWrite = readGeneration;
      try {
        const attempted = {
          bytes: new TextEncoder().encode(data),
          patch: reset ? undefined : editPatch,
        };
        inFlightWriteBytes.add(attempted);
        let result: CheckedFileWriteResult;
        health.writeStarted();
        try {
          result = await input.files.writeFileChecked({
            path,
            data,
            preconditions: [{ path, expected }],
          });
        } catch (error) {
          if (isPotentiallyApplied(error)) {
            unresolved = attempted;
          }
          throw error;
        } finally {
          health.writeSettled();
          inFlightWriteBytes.delete(attempted);
        }
        if (result.status !== 'conflict') {
          if (readGeneration === generationAtWrite) {
            readGeneration++;
            await publish(result.content, 'write', readGeneration, false, attempted.patch);
          } else {
            const refresh = ++readGeneration;
            try {
              const latest = (await input.files.exists(path)) ? await input.files.readFile(path) : null;
              if (refresh === readGeneration) {
                const ownWrite = sameBytes(latest, result.content);
                await publish(
                  latest,
                  ownWrite ? 'write' : 'read',
                  refresh,
                  false,
                  ownWrite ? attempted.patch : undefined,
                );
              }
            } catch (error) {
              input.onError(error);
            }
          }
          return 'saved';
        }
        // The foreign bytes become the base before this tab reapplies only its person-edited fields.
        if (!(await read())) {
          return 'retry';
        }
        if (reset || eligible) {
          return 'blocked';
        }
      } catch (error) {
        input.onError(error);
        health.writeFailed(error);
        return 'retry';
      }
    }
    const conflicted = new Error('The layout changed while it was being saved. Try again.');
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
    if (isDisposed() || !deferred || retryTimer) {
      return;
    }
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      const result = pending
        .then(async () => (deferred ? write(intended ?? state.layout!, deferred, false) : 'saved'))
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
  const queueWrite = async (next: WorkbenchLayout, patch: LayoutPatch, sequence: number): Promise<boolean> => {
    const result = pending
      .then(async () => write(next, combine(deferred, patch), false))
      .then((status) => {
        const saved = status === 'saved';
        settledSequence = sequence;
        if (saved) {
          deferred = undefined;
          retryDelay = 250;
          settleIntent();
        } else {
          const remaining = combine(deferred, patch);
          deferred =
            status === 'retry' ||
            remaining.viewer !== undefined ||
            remaining.workbench !== undefined ||
            Object.keys(remaining.lanes ?? {}).length > 0
              ? remaining
              : undefined;
          if (status === 'retry') {
            retry();
          }
        }
        if (sequence === editSequence) {
          intended = saved ? state.layout : next;
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
      readGeneration++;
    },
    edit: async (next) => {
      if (isDisposed()) {
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
    restore: async (next, expectedDigest, eligible) => {
      const sequence = editSequence;
      const canRestore = (): boolean =>
        !disposed &&
        !readError &&
        !state.refusal &&
        state.digest === expectedDigest &&
        editSequence === sequence &&
        editSequence === settledSequence &&
        !queuedEdit &&
        !deferred &&
        eligible();
      if (!canRestore()) {
        return false;
      }
      const result = pending.then(async () => {
        if (!(await read()) || !canRestore()) {
          return false;
        }
        const status = await write(next, diff(next, state.layout), false, undefined, canRestore);
        if (status === 'saved' && editSequence === sequence) {
          intended = state.layout;
        }
        return status === 'saved';
      });
      pending = result;
      return result;
    },
    reset: async (next, reviewed) => {
      if (isDisposed() || state.refusal?.code !== 'INVALID_RECORD') {
        return false;
      }
      const reviewedBytes = reviewed === undefined ? state.bytes : reviewed;
      await drainEdit();
      const sequence = ++editSequence;
      const result = pending
        .then(async () => write(next, undefined, true, reviewedBytes))
        .then((status) => {
          if (status !== 'saved') {
            return false;
          }
          deferred = undefined;
          settledSequence = sequence;
          settleIntent();
          if (sequence === editSequence) {
            intended = state.layout;
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
      const status = await write(intended ?? state.layout!, deferred, false);
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
      disposed = true;
      readGeneration++;
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
    intendedLayout: () => intended ?? state.layout,
  };
}
