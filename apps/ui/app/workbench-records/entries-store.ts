/* oxlint-disable eslint/max-params -- The queued entry write captures path, next value, patch, and edit sequence. */
/* oxlint-disable typescript/prefer-optional-chain -- Explicit null checks distinguish missing checked bytes. */
/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
/* oxlint-disable eslint/no-await-in-loop -- Checked conflicts must be retried sequentially. */
/* oxlint-disable promise/prefer-await-to-then -- Per-file write queues must serialize asynchronous callbacks. */
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchEntries } from '@taucad/workbench';
import type { CheckedFileWriteResult } from '@taucad/types';

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
type Components = NonNullable<Entry['components']>;
type Patch = Readonly<{
  path: string;
  fields: Partial<Pick<Entry, 'renderTimeout'>> & { components?: Partial<Components> };
}>;
export type EntryRecordPatch = Patch;
export type EntryPathChange = Readonly<
  { type: 'rename'; oldPath: string; newPath: string } | { type: 'delete'; path: string }
>;
type QueuedPathChange = Readonly<{ operation: EntryPathChange; unsaved: ReadonlyMap<string, Patch['fields']> }>;
const matchesPath = (path: string, prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`);
const rewritePath = (path: string, oldPath: string, newPath: string): string =>
  `${newPath}${path.slice(oldPath.length)}`;
const mergeEntry = (existing: Entry | undefined, fields: Patch['fields']): Entry => ({
  ...existing,
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
const applyPathChange = (record: WorkbenchEntries, change: QueuedPathChange): WorkbenchEntries => {
  const entries = { ...record.entries };
  const source = change.operation.type === 'rename' ? change.operation.oldPath : change.operation.path;
  for (const path of new Set([...Object.keys(entries), ...change.unsaved.keys()])) {
    if (!matchesPath(path, source)) {
      continue;
    }
    const fields = change.unsaved.get(path);
    const entry = fields ? mergeEntry(entries[path], fields) : entries[path];
    Reflect.deleteProperty(entries, path);
    if (change.operation.type === 'rename' && entry) {
      entries[rewritePath(path, source, change.operation.newPath)] = entry;
    }
  }
  return { ...record, entries };
};
export type EntriesState = Readonly<{
  record: WorkbenchEntries | undefined;
  bytes: Uint8Array<ArrayBuffer> | null;
  refusal: { code: 'INVALID_RECORD' | 'NEWER_RECORD'; message: string } | undefined;
}>;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const sameBytes = (a: Uint8Array<ArrayBuffer> | null, b: Uint8Array<ArrayBuffer> | null): boolean => {
  if (a === b) {
    return true;
  }
  if (!a || !b || a.length !== b.length) {
    return false;
  }
  return a.every((value, i) => value === b[i]);
};

/** Checked per-entry settings; a person's timeout and component changes merge independently. */
export function createWorkbenchEntriesStore(
  input: Readonly<{
    root: string;
    files: Files;
    onChange: (state: EntriesState, source: 'read' | 'write', locallyAuthored: EntryRecordPatch | undefined) => void;
    onError: (error: unknown) => void;
    /** Milliseconds. */
    editDebounce?: number;
  }>,
): Readonly<{
  read: (notify?: boolean) => Promise<boolean>;
  edit: (path: string, next: Entry) => Promise<boolean>;
  changePaths: (change: EntryPathChange) => Promise<boolean>;
  reset: (next: WorkbenchEntries) => Promise<boolean>;
  flush: () => Promise<boolean>;
  dispose: () => void;
  snapshot: () => EntriesState;
  ready: () => boolean;
}> {
  const filePath = `${input.root}/${workbenchPaths.entries}`;
  let state: EntriesState = { record: undefined, bytes: null, refusal: undefined };
  let observed = false;
  let generation = 0;
  let readError = false;
  let disposed = false;
  const isDisposed = (): boolean => disposed;
  let pending: Promise<unknown> = Promise.resolve();
  const intended = new Map<string, Entry>();
  let editSequence = 0;
  let settledSequence = 0;
  const deferred = new Map<string, Patch>();
  const deferredPathChanges: QueuedPathChange[] = [];
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 250;
  let editTimer: ReturnType<typeof setTimeout> | undefined;
  const inFlightWriteBytes = new Set<{ bytes: Uint8Array<ArrayBuffer>; patch: EntryRecordPatch | undefined }>();
  const queuedEdits = new Map<
    string,
    { next: Entry; patch: Patch; sequence: number; resolve: Array<(saved: boolean) => void> }
  >();
  const combine = (earlier: Patch | undefined, later: Patch): Patch => ({
    path: later.path,
    fields: {
      ...earlier?.fields,
      ...later.fields,
      ...((earlier?.fields.components ?? later.fields.components)
        ? {
            components: { ...earlier?.fields.components, ...later.fields.components },
          }
        : {}),
    },
  });
  const publish = (
    bytes: Uint8Array<ArrayBuffer> | null,
    source: 'read' | 'write',
    notify = false,
    locallyAuthored?: EntryRecordPatch,
  ): void => {
    if (observed && sameBytes(bytes, state.bytes) && !notify) {
      return;
    }
    observed = true;
    if (bytes === null) {
      state = { ...state, bytes: null, refusal: undefined };
    } else {
      const parsed = workbenchRecords.entries.read(bytes);
      state =
        parsed.status === 'current'
          ? { record: parsed.record, bytes, refusal: undefined }
          : { ...state, bytes, refusal: { code: parsed.code, message: parsed.message } };
    }
    input.onChange(state, source, locallyAuthored);
    if (source === 'read' && state.record && editSequence === settledSequence && deferred.size === 0) {
      intended.clear();
      for (const [path, entry] of Object.entries(state.record.entries)) {
        intended.set(path, entry);
      }
    }
  };
  const read = async (notify = false): Promise<boolean> => {
    if (isDisposed()) {
      return false;
    }
    const current = ++generation;
    try {
      const bytes = (await input.files.exists(filePath)) ? await input.files.readFile(filePath) : null;
      if (current === generation && !isDisposed()) {
        const recovered = readError;
        readError = false;
        const ownWrite = bytes && [...inFlightWriteBytes].find((written) => sameBytes(written.bytes, bytes));
        publish(bytes, ownWrite ? 'write' : 'read', notify || recovered, ownWrite?.patch);
      }
      return observed;
    } catch (error) {
      if (current === generation && !isDisposed()) {
        readError = true;
        input.onError(error);
      }
      return false;
    }
  };
  const write = async (
    patch: Patch | undefined,
    reset: WorkbenchEntries | undefined,
    expectedReset: Uint8Array<ArrayBuffer> | null,
    pathChange?: QueuedPathChange,
  ): Promise<'saved' | 'retry' | 'blocked'> => {
    if (!observed && !(await read())) {
      return 'retry';
    }
    if (state.refusal && (!reset || state.refusal.code === 'NEWER_RECORD')) {
      return 'blocked';
    }
    if (reset && (state.refusal?.code !== 'INVALID_RECORD' || !sameBytes(state.bytes, expectedReset))) {
      return 'blocked';
    }
    if (patch && Object.keys(patch.fields).length === 0) {
      return 'saved';
    }
    for (let attempt = 0; attempt < (reset ? 1 : 3); attempt++) {
      const current = state.record ?? { version: 1, entries: {} };
      const existing = current.entries[patch?.path ?? ''];
      const merged = pathChange
        ? applyPathChange(current, pathChange)
        : (reset ?? {
            ...current,
            entries: {
              ...current.entries,
              [patch!.path]: mergeEntry(existing, patch!.fields),
            },
          });
      if (!reset && same(current, merged)) {
        return 'saved';
      }
      try {
        const generationAtWrite = generation;
        const data = workbenchRecords.entries.serialize(merged);
        const attempted = { bytes: new TextEncoder().encode(data), patch: (reset ?? pathChange) ? undefined : patch };
        inFlightWriteBytes.add(attempted);
        let result: CheckedFileWriteResult;
        try {
          result = await input.files.writeFileChecked({
            path: filePath,
            data,
            preconditions: [{ path: filePath, expected: reset ? expectedReset : state.bytes }],
          });
        } finally {
          inFlightWriteBytes.delete(attempted);
        }
        if (result.status !== 'conflict') {
          if (generation === generationAtWrite) {
            generation++;
            publish(result.content, 'write', false, attempted.patch);
          } else {
            const refresh = ++generation;
            try {
              const latest = (await input.files.exists(filePath)) ? await input.files.readFile(filePath) : null;
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
        if (reset ?? state.refusal) {
          return 'blocked';
        }
      } catch (error) {
        input.onError(error);
        return 'retry';
      }
    }
    input.onError(new Error('The entry settings changed while saving. Try again.'));
    return 'retry';
  };
  const retry = (): void => {
    if ((deferred.size === 0 && deferredPathChanges.length === 0) || retryTimer) {
      return;
    }
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      const pathChange = deferredPathChanges[0];
      if (pathChange) {
        const result = pending
          .then(async () => write(undefined, undefined, null, pathChange))
          .then((status) => {
            if (status === 'saved') {
              deferredPathChanges.shift();
              retryDelay = 250;
              retry();
            } else if (status === 'retry') {
              retryDelay = Math.min(retryDelay * 2, 8000);
              retry();
            }
          });
        pending = result;
        return;
      }
      const patch = deferred.values().next().value;
      if (!patch) {
        return;
      }
      const result = pending
        .then(async () => (deferred.has(patch.path) ? write(deferred.get(patch.path), undefined, null) : 'saved'))
        .then((status) => {
          if (status === 'saved') {
            deferred.delete(patch.path);
            retryDelay = 250;
            retry();
          } else if (status === 'retry') {
            retryDelay = Math.min(retryDelay * 2, 8000);
            retry();
          }
        });
      pending = result;
    }, retryDelay);
  };
  const queueWrite = async (path: string, next: Entry, patch: Patch, sequence: number): Promise<boolean> => {
    const result = pending
      .then(async () => {
        if (deferredPathChanges.length > 0) {
          return 'retry';
        }
        if (!observed && !(await read())) {
          return 'retry';
        }
        return write(combine(deferred.get(path), patch), undefined, null);
      })
      .then((status) => {
        const saved = status === 'saved';
        settledSequence = sequence;
        if (saved) {
          deferred.delete(path);
          retryDelay = 250;
        } else if (status === 'retry') {
          deferred.set(path, combine(deferred.get(path), patch));
          retry();
        }
        if (intended.get(path) === next && saved) {
          intended.set(path, state.record?.entries[path] ?? next);
        }
        return saved;
      });
    pending = result;
    return result;
  };
  const drainEdits = async (): Promise<void> => {
    if (editTimer) {
      clearTimeout(editTimer);
      editTimer = undefined;
    }
    const batch = [...queuedEdits].sort((a, b) => a[1].sequence - b[1].sequence);
    queuedEdits.clear();
    for (const [path, queued] of batch) {
      const saved = await queueWrite(path, queued.next, queued.patch, queued.sequence);
      for (const resolve of queued.resolve) {
        resolve(saved);
      }
    }
  };
  return {
    read,
    edit: async (path, next) => {
      const base = intended.get(path) ?? state.record?.entries[path];
      const fields: Patch['fields'] = {};
      if (!same(base?.renderTimeout, next.renderTimeout)) {
        fields.renderTimeout = next.renderTimeout;
      }
      const defaults: Components = { hidden: [], isolated: [], opacity: [] };
      const before = base?.components ?? defaults;
      const after = next.components ?? defaults;
      const components: Partial<Components> = {};
      for (const field of ['hidden', 'isolated', 'opacity'] as const) {
        if (!same(before[field], after[field])) {
          Object.assign(components, { [field]: after[field] });
        }
      }
      if (Object.keys(components).length > 0) {
        fields.components = components;
      }
      intended.set(path, next);
      const sequence = ++editSequence;
      const patch = { path, fields };
      if (!input.editDebounce) {
        return queueWrite(path, next, patch, sequence);
      }
      return new Promise<boolean>((resolve) => {
        const earlier = queuedEdits.get(path);
        queuedEdits.set(
          path,
          earlier
            ? { next, patch: combine(earlier.patch, patch), sequence, resolve: [...earlier.resolve, resolve] }
            : { next, patch, sequence, resolve: [resolve] },
        );
        if (editTimer) {
          clearTimeout(editTimer);
        }
        editTimer = setTimeout(() => {
          void drainEdits();
        }, input.editDebounce);
      });
    },
    changePaths: async (operation) => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      await drainEdits();
      const source = operation.type === 'rename' ? operation.oldPath : operation.path;
      const unsaved = new Map<string, Patch['fields']>();
      for (const [path, patch] of deferred) {
        if (matchesPath(path, source)) {
          unsaved.set(path, patch.fields);
        }
      }
      for (const path of deferred.keys()) {
        if (matchesPath(path, source)) {
          deferred.delete(path);
        }
      }
      for (const [path, entry] of new Map(intended)) {
        if (!matchesPath(path, source)) {
          continue;
        }
        intended.delete(path);
        if (operation.type === 'rename') {
          intended.set(rewritePath(path, source, operation.newPath), entry);
        }
      }
      const change = { operation, unsaved };
      const result = pending
        .then(async () => (deferredPathChanges.length > 0 ? 'retry' : write(undefined, undefined, null, change)))
        .then((status) => {
          if (status === 'retry') {
            deferredPathChanges.push(change);
            retry();
          }
          return status === 'saved';
        });
      pending = result;
      return result;
    },
    reset: async (next) => {
      if (state.refusal?.code !== 'INVALID_RECORD') {
        return false;
      }
      const { bytes } = state;
      const result = pending.then(async () => write(undefined, next, bytes)).then((status) => status === 'saved');
      pending = result;
      return result;
    },
    flush: async () => {
      await drainEdits();
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      await pending;
      for (const change of deferredPathChanges) {
        const status = await write(undefined, undefined, null, change);
        if (status !== 'saved') {
          if (status === 'retry') {
            retry();
          }
          return false;
        }
      }
      deferredPathChanges.length = 0;
      for (const patch of deferred.values()) {
        const status = await write(patch, undefined, null);
        if (status !== 'saved') {
          if (status === 'retry') {
            retry();
          }
          return false;
        }
        deferred.delete(patch.path);
      }
      retryDelay = 250;
      return true;
    },
    dispose: () => {
      disposed = true;
      generation++;
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
