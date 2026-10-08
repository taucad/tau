/* oxlint-disable typescript/prefer-optional-chain -- Explicit null checks distinguish missing checked bytes. */
/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
/* oxlint-disable eslint/no-await-in-loop -- Interleaving cases intentionally run in sequence. */
import { describe, expect, it, vi } from 'vitest';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import type { CheckedFileWriteResult } from '@taucad/types';
import { createWorkbenchViewStore, fenceClosedView, finishClosedView } from '#workbench-records/view-store.js';
import type { ViewRecordPatch, ViewRecordState } from '#workbench-records/view-store.js';

const encoder = new TextEncoder();
const seed = (): WorkbenchView => workbenchRecords.view.schema.parse({ version: 1, entryPath: 'a.ts' });

function memory() {
  let bytes: Uint8Array<ArrayBuffer> | null = encoder.encode(workbenchRecords.view.serialize(seed()));
  let release: (() => void) | undefined;
  let gate: Promise<void> | undefined;
  const writes = vi.fn(
    async ({
      data,
      preconditions,
    }: {
      data: string;
      preconditions: ReadonlyArray<{ expected: Uint8Array<ArrayBuffer> | null }>;
    }): Promise<CheckedFileWriteResult> => {
      const wait = gate;
      gate = undefined;
      if (wait) {
        await wait;
      }
      const expected = preconditions[0]?.expected;
      const matches =
        expected === null
          ? bytes === null
          : bytes !== null &&
            expected?.length === bytes.length &&
            expected.every((value, index) => value === bytes?.[index]);
      if (!matches) {
        return { status: 'conflict', conflicts: [{ path: 'view', actual: bytes }] };
      }
      bytes = encoder.encode(data);
      return { status: 'applied', content: bytes };
    },
  );
  return {
    files: { exists: async () => bytes !== null, readFile: async () => bytes!, writeFileChecked: writes },
    writes,
    set: (value: WorkbenchView) => {
      bytes = encoder.encode(workbenchRecords.view.serialize(value));
    },
    setBytes: (value: Uint8Array<ArrayBuffer> | null) => {
      bytes = value;
    },
    get: () => bytes,
    delay: () => {
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => release?.();
    },
  };
}

const makeStore = (data: ReturnType<typeof memory>) =>
  createWorkbenchViewStore({
    root: '/root',
    viewId: 'v-abcd1234',
    files: data.files,
    onChange: () => undefined,
    onError: (error) => {
      throw error;
    },
  });

describe('workbench view checked store', () => {
  it('cleans abandoned constructor tokens without letting a stale finalizer retire a replacement', async () => {
    const callbacks: Array<(held: unknown) => void> = [];
    const registrations: Array<{ held: unknown; target: WeakRef<object> }> = [];
    const nativeRegistry = globalThis.FinalizationRegistry;
    class ControlledRegistry extends nativeRegistry<unknown> {
      public constructor(callback: (held: unknown) => void) {
        super(callback);
        callbacks.push(callback);
      }

      public override register(target: object, held: unknown, unregisterToken?: object): void {
        registrations.push({ held, target: new WeakRef(target) });
        super.register(target, held, unregisterToken);
      }
    }
    vi.stubGlobal('FinalizationRegistry', ControlledRegistry);
    vi.resetModules();
    const isolated = await import('#workbench-records/view-store.js');
    const data = memory();
    const input = {
      root: '/abandoned-view-lifetime',
      viewId: 'v-c1e20003',
      files: data.files,
      onChange: vi.fn(),
      onError: vi.fn(),
    };
    const path = `${input.root}/${workbenchPaths.view(input.viewId)}`;
    const captured = new Set<Map<unknown, unknown>>();
    const originalSet = Map.prototype.set;
    const set = vi.spyOn(Map.prototype, 'set').mockImplementation(function (this: Map<unknown, unknown>, key, value) {
      if (key === path) {
        captured.add(this);
      }
      return originalSet.call(this, key, value);
    });
    let prior: ReturnType<typeof isolated.createWorkbenchViewStore> | undefined =
      isolated.createWorkbenchViewStore(input);
    let replacement: ReturnType<typeof isolated.createWorkbenchViewStore> | undefined;
    try {
      expect(registrations).toHaveLength(1);
      const stale = registrations[0]!;
      // The harness invokes cleanup deterministically; it never depends on an actual GC run.
      prior = undefined;
      callbacks[0]!(stale.held);
      expect([...captured][0]?.has(path)).toBe(false);
      replacement = isolated.createWorkbenchViewStore(input);
      callbacks[0]!(stale.held);
      expect([...captured][0]?.has(path)).toBe(true);
      expect(await replacement.read()).toBe(true);
      expect(await replacement.edit({ ...seed(), name: 'Replacement survives stale cleanup' })).toBe(true);
      expect(registrations).toHaveLength(2);
    } finally {
      prior?.dispose();
      replacement?.dispose();
      set.mockRestore();
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it('keeps retained operational methods usable after the store wrapper is dropped', async () => {
    const data = memory();
    let store: ReturnType<typeof createWorkbenchViewStore> | undefined = makeStore(data);
    const { read, edit, flush, dispose } = store;
    store = undefined;
    try {
      expect(await read()).toBe(true);
      expect(await edit({ ...seed(), name: 'Retained operation' })).toBe(true);
      expect(await flush()).toBe(true);
      expect(workbenchRecords.view.read(data.get()!)).toMatchObject({
        status: 'current',
        record: { name: 'Retained operation' },
      });
    } finally {
      dispose();
    }
  });

  it('retires lifetime entries after the last owner disposes without requiring a first read', () => {
    const data = memory();
    const root = '/bounded-view-lifetimes';
    const captured = new Set<Map<unknown, unknown>>();
    const originalSet = Map.prototype.set;
    const set = vi.spyOn(Map.prototype, 'set').mockImplementation(function (this: Map<unknown, unknown>, key, value) {
      if (typeof key === 'string' && key.startsWith(`${root}/`)) {
        captured.add(this);
      }
      return originalSet.call(this, key, value);
    });
    const owners: Array<ReturnType<typeof createWorkbenchViewStore>> = [];
    try {
      for (let index = 0; index < 64; index++) {
        owners.push(
          createWorkbenchViewStore({
            root,
            viewId: `v-retained${index}`,
            files: data.files,
            onChange: vi.fn(),
            onError: vi.fn(),
          }),
        );
      }
      expect(captured.size).toBe(1);
      const lifetimes = [...captured][0]!;
      expect([...lifetimes.keys()].filter((key) => typeof key === 'string' && key.startsWith(`${root}/`))).toHaveLength(
        64,
      );
      for (const owner of owners) {
        owner.dispose();
        owner.dispose();
      }
      expect([...lifetimes.keys()].filter((key) => typeof key === 'string' && key.startsWith(`${root}/`))).toHaveLength(
        0,
      );
    } finally {
      for (const owner of owners) {
        owner.dispose();
      }
      set.mockRestore();
    }
  });

  it('keeps an ordinary replacement readable and writable before its first acknowledged read', async () => {
    const data = memory();
    const input = {
      root: '/replacement-lifetime',
      viewId: 'v-c1e20001',
      files: data.files,
      onChange: vi.fn(),
      onError: vi.fn(),
    };
    const prior = createWorkbenchViewStore(input);
    await prior.read();
    const replacement = createWorkbenchViewStore(input);
    prior.dispose();
    try {
      expect(await replacement.read()).toBe(true);
      expect(await replacement.retryRead()).toBe(true);
      expect(await replacement.edit({ ...seed(), name: 'Replacement person edit' })).toBe(true);
      expect(workbenchRecords.view.read(data.get()!)).toMatchObject({
        status: 'current',
        record: { name: 'Replacement person edit' },
      });
      expect(data.writes).toHaveBeenCalledOnce();
    } finally {
      prior.dispose();
      replacement.dispose();
    }
  });

  it('keeps explicit close fencing earlier owners while a reopened view obtains a fresh lifetime', async () => {
    const data = memory();
    const input = {
      root: '/closed-lifetime',
      viewId: 'v-c1e20002',
      files: data.files,
      onChange: vi.fn(),
      onError: vi.fn(),
    };
    const prior = createWorkbenchViewStore(input);
    await prior.read();
    const waiting = createWorkbenchViewStore(input);
    const path = `${input.root}/${workbenchPaths.view(input.viewId)}`;
    await fenceClosedView(path);
    finishClosedView(path);
    const reopened = createWorkbenchViewStore(input);
    try {
      expect(await prior.edit({ ...seed(), name: 'Retired edit' })).toBe(false);
      expect(await waiting.read()).toBe(false);
      expect(await waiting.retryRead()).toBe(false);
      expect(await reopened.read()).toBe(true);
      prior.dispose();
      waiting.dispose();
      expect(await reopened.edit({ ...seed(), name: 'Reopened person edit' })).toBe(true);
      expect(workbenchRecords.view.read(data.get()!)).toMatchObject({
        status: 'current',
        record: { name: 'Reopened person edit' },
      });
      expect(data.writes).toHaveBeenCalledOnce();
    } finally {
      prior.dispose();
      waiting.dispose();
      reopened.dispose();
    }
  });

  it('fences internal publication immediately when its source invalidates during a read', async () => {
    const data = memory();
    const entered = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    const onChange = vi.fn();
    let hold = true;
    const owner = createWorkbenchViewStore({
      root: '/root',
      viewId: 'v-fenced',
      files: {
        ...data.files,
        readFile: async () => {
          const bytes = await data.files.readFile();
          if (hold) {
            hold = false;
            entered.resolve();
            await gate.promise;
          }
          return bytes;
        },
      },
      onChange,
      onError: () => undefined,
    });
    try {
      const pending = owner.read();
      await entered.promise;
      owner.invalidateRead();
      gate.resolve();
      await pending;
      expect(onChange).not.toHaveBeenCalled();
      expect(owner.ready()).toBe(false);
      await owner.read();
      expect(owner.ready()).toBe(true);
      expect(onChange).toHaveBeenCalledOnce();
    } finally {
      owner.dispose();
    }
  });

  it('should keep invalid bytes preservable when an unchanged edit owes no fields', async () => {
    const data = memory();
    const view = makeStore(data);
    try {
      await view.read();
      const invalid = encoder.encode('{broken');
      data.setBytes(invalid);
      await view.read();
      expect(await view.edit(seed())).toBe(false);
      expect(await view.flush()).toBe(true);
      expect(data.get()).toEqual(invalid);
      expect(data.writes).not.toHaveBeenCalled();
    } finally {
      view.dispose();
    }
  });

  it('should hold an accepted edit and flush until its first record read settles', async () => {
    const data = memory();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const view = createWorkbenchViewStore({
      root: '/root',
      viewId: 'first-read',
      files: {
        ...data.files,
        readFile: async () => {
          entered.resolve();
          await release.promise;
          return data.files.readFile();
        },
      },
      onChange: () => undefined,
      onError: () => undefined,
    });
    try {
      const hydration = view.read();
      await entered.promise;
      const edited = view.edit({ ...seed(), name: 'Accepted before hydration' });
      let settled = false;
      const drained = (async () => {
        const saved = await view.flush();
        settled = true;
        return saved;
      })();
      await Promise.resolve();
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(data.writes).not.toHaveBeenCalled();
      release.resolve();
      await hydration;
      expect(await edited).toBe(true);
      expect(await drained).toBe(true);
      expect(workbenchRecords.view.read(data.get()!)).toMatchObject({
        status: 'current',
        record: { name: 'Accepted before hydration', entryPath: 'a.ts' },
      });
    } finally {
      release.resolve();
      view.dispose();
    }
  });

  it.each(['{broken', '{"version":2}'])(
    'should retain blocked view intent through flush and repair (%s)',
    async (invalid) => {
      const data = memory();
      const view = makeStore(data);
      try {
        await view.read();
        const release = data.delay();
        const edited = view.edit({ ...seed(), name: 'Unsaved' });
        await vi.waitFor(() => {
          expect(data.writes).toHaveBeenCalledOnce();
        });
        const foreign = encoder.encode(invalid);
        data.setBytes(foreign);
        release();
        expect(await edited).toBe(false);
        expect(await view.flush()).toBe(false);
        expect(data.get()).toEqual(foreign);
        data.set(seed());
        await view.read();
        expect(await view.flush()).toBe(true);
        expect(workbenchRecords.view.read(data.get()!)).toMatchObject({
          status: 'current',
          record: { name: 'Unsaved' },
        });
      } finally {
        view.dispose();
      }
    },
  );

  it('should preserve invalid view bytes on a clean flush', async () => {
    const data = memory();
    const foreign = encoder.encode('{broken');
    data.setBytes(foreign);
    const view = makeStore(data);
    try {
      await view.read();
      expect(await view.flush()).toBe(true);
      expect(data.get()).toEqual(foreign);
      expect(data.writes).not.toHaveBeenCalled();
    } finally {
      view.dispose();
    }
  });

  it('should resolve blocked view intent only after an explicit checked Reset', async () => {
    const data = memory();
    const view = makeStore(data);
    try {
      await view.read();
      data.setBytes(encoder.encode('{broken'));
      await view.read();
      expect(await view.edit({ ...seed(), name: 'Unsaved' })).toBe(false);
      expect(await view.flush()).toBe(false);
      expect(await view.reset(seed())).toBe(true);
      expect(await view.flush()).toBe(true);
      expect(workbenchRecords.view.read(data.get()!)).toEqual({ status: 'current', record: seed() });
    } finally {
      view.dispose();
    }
  });
  it('classifies a watch of in-flight local write bytes as a local acknowledgement', async () => {
    const data = memory();
    const acknowledgement = Promise.withResolvers<void>();
    const onChange = vi.fn<(state: ViewRecordState, source: 'read' | 'write', patch?: ViewRecordPatch) => void>();
    const writeFileChecked = vi.fn(async ({ data: text }: { data: string }): Promise<CheckedFileWriteResult> => {
      const content = encoder.encode(text);
      data.setBytes(content);
      await acknowledgement.promise;
      return { status: 'applied', content };
    });
    const store = createWorkbenchViewStore({
      root: '/root',
      viewId: 'v-abcd1234',
      files: { ...data.files, writeFileChecked },
      onChange,
      onError: (error) => {
        throw error;
      },
    });
    await store.read();
    const edit = store.edit({
      ...seed(),
      name: 'Local',
      camera: { kind: 'look', direction: [0, -1, 0] },
    });
    await vi.waitFor(() => {
      expect(writeFileChecked).toHaveBeenCalledOnce();
    });
    await store.read();
    expect(onChange.mock.lastCall?.[0].record?.name).toBe('Local');
    expect(onChange.mock.lastCall?.[1]).toBe('write');
    expect(onChange.mock.lastCall?.[2]?.camera).toEqual({ kind: 'look', direction: [0, -1, 0] });
    acknowledgement.resolve();
    expect(await edit).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(2);
    store.dispose();
  });

  it('persists a selected kernel view and its options through a stale checked-write conflict', async () => {
    const data = memory();
    const store = makeStore(data);
    await store.read();
    data.set({ ...seed(), name: 'Foreign' });
    const next = workbenchRecords.view.schema.parse({
      ...seed(),
      selectedKernelView: 'schematic',
      kernelViews: [{ id: 'schematic', options: { sheet: 'power' } }],
    });
    expect(await store.edit(next)).toBe(true);
    expect(workbenchRecords.view.read(data.get()!)).toMatchObject({
      status: 'current',
      record: {
        name: 'Foreign',
        selectedKernelView: 'schematic',
        kernelViews: [{ id: 'schematic', options: { sheet: 'power' } }],
      },
    });
  });

  it('merges independent projection options and camera changes from two checked writers', async () => {
    const data = memory();
    const base = workbenchRecords.view.schema.parse({
      ...seed(),
      kernelViews: [
        { id: 'schematic', options: { sheet: 'main', labels: true }, camera: { kind: 'preset', preset: 'front' } },
        { id: 'pcb', options: { layer: 'top' } },
      ],
    });
    data.set(base);
    const first = makeStore(data);
    const second = makeStore(data);
    await Promise.all([first.read(), second.read()]);
    const release = data.delay();
    const optionsWrite = first.edit({
      ...base,
      kernelViews: [
        { id: 'schematic', options: { sheet: 'power', labels: true }, camera: { kind: 'preset', preset: 'front' } },
        { id: 'pcb', options: { layer: 'top' } },
      ],
    });
    const cameraWrite = second.edit({
      ...base,
      kernelViews: [
        {
          id: 'schematic',
          options: { sheet: 'main', labels: false },
          authoredInstance: 'sheet:power',
          camera: { kind: 'preset', preset: 'right' },
        },
        { id: 'pcb', options: { layer: 'bottom' } },
      ],
    });
    await Promise.resolve();
    release();
    expect(await Promise.all([optionsWrite, cameraWrite])).toEqual([true, true]);
    expect(workbenchRecords.view.read(data.get()!)).toMatchObject({
      status: 'current',
      record: {
        kernelViews: [
          {
            id: 'schematic',
            options: { sheet: 'power', labels: false },
            authoredInstance: 'sheet:power',
            camera: { kind: 'preset', preset: 'right' },
          },
          { id: 'pcb', options: { layer: 'bottom' } },
        ],
      },
    });
  });

  it('clears a saved projection choice without discarding a foreign projection', async () => {
    const data = memory();
    const base = workbenchRecords.view.schema.parse({
      ...seed(),
      selectedKernelView: 'schematic',
      kernelViews: [{ id: 'schematic', options: { sheet: 'main', labels: true } }],
    });
    data.set(base);
    const store = makeStore(data);
    await store.read();
    data.set({
      ...base,
      kernelViews: [...base.kernelViews!, { id: 'pcb', options: { layer: 'top' } }],
    });
    expect(await store.edit({ ...base, selectedKernelView: undefined, kernelViews: undefined })).toBe(true);
    const result = workbenchRecords.view.read(data.get()!);
    expect(result.status).toBe('current');
    if (result.status === 'current') {
      expect(result.record.selectedKernelView).toBeUndefined();
      expect(result.record.kernelViews).toEqual([{ id: 'pcb', options: { layer: 'top' } }]);
    }
  });

  it('replaces a removed projection on a queued re-add without restoring its old options or camera', async () => {
    const data = memory();
    const base = workbenchRecords.view.schema.parse({
      ...seed(),
      kernelViews: [
        { id: 'schematic', options: { sheet: 'main', labels: true }, camera: { kind: 'preset', preset: 'front' } },
      ],
    });
    data.set(base);
    const store = createWorkbenchViewStore({
      root: '/root',
      viewId: 'v-abcd1234',
      files: data.files,
      editDebounce: 500,
      onChange: () => undefined,
      onError: (error) => {
        throw error;
      },
    });
    await store.read();
    const removed = store.edit({ ...base, kernelViews: [] });
    const replaced = store.edit({ ...base, kernelViews: [{ id: 'schematic', options: { sheet: 'power' } }] });
    expect(await store.flush()).toBe(true);
    expect(await Promise.all([removed, replaced])).toEqual([true, true]);
    const result = workbenchRecords.view.read(data.get()!);
    expect(result.status).toBe('current');
    if (result.status === 'current') {
      expect(result.record.kernelViews).toEqual([{ id: 'schematic', options: { sheet: 'power' } }]);
    }
    store.dispose();
  });

  it('persists a kernel view whose valid id is __proto__', async () => {
    const data = memory();
    const store = makeStore(data);
    await store.read();
    expect(await store.edit({ ...seed(), kernelViews: [{ id: '__proto__', options: { sheet: 'power' } }] })).toBe(true);
    const result = workbenchRecords.view.read(data.get()!);
    expect(result.status).toBe('current');
    if (result.status === 'current') {
      expect(result.record.kernelViews).toEqual([{ id: '__proto__', options: { sheet: 'power' } }]);
    }
  });

  it('keeps a queued __proto__ removal when a later edit changes another projection', async () => {
    const data = memory();
    const base = workbenchRecords.view.schema.parse({
      ...seed(),
      kernelViews: [
        { id: '__proto__', options: { sheet: 'main' } },
        { id: 'pcb', options: { layer: 'top' } },
      ],
    });
    data.set(base);
    const store = createWorkbenchViewStore({
      root: '/root',
      viewId: 'v-abcd1234',
      files: data.files,
      editDebounce: 500,
      onChange: () => undefined,
      onError: (error) => {
        throw error;
      },
    });
    await store.read();
    const removed = store.edit({ ...base, kernelViews: [{ id: 'pcb', options: { layer: 'top' } }] });
    const changed = store.edit({ ...base, kernelViews: [{ id: 'pcb', options: { layer: 'bottom' } }] });
    expect(await store.flush()).toBe(true);
    expect(await Promise.all([removed, changed])).toEqual([true, true]);
    const result = workbenchRecords.view.read(data.get()!);
    expect(result.status).toBe('current');
    if (result.status === 'current') {
      expect(result.record.kernelViews).toEqual([{ id: 'pcb', options: { layer: 'bottom' } }]);
    }
    store.dispose();
  });

  it('removes a saved constructor option without reading its inherited replacement', async () => {
    const data = memory();
    const base = workbenchRecords.view.schema.parse({
      ...seed(),
      kernelViews: [
        {
          id: 'schematic',
          options: Object.fromEntries<string | number>([
            ['constructor', 3],
            ['sheet', 'main'],
          ]),
        },
      ],
    });
    expect(base.kernelViews?.[0]?.options).toHaveProperty('constructor', 3);
    data.set(base);
    const store = makeStore(data);
    await store.read();
    expect(await store.edit({ ...base, kernelViews: [{ id: 'schematic', options: { sheet: 'main' } }] })).toBe(true);
    const result = workbenchRecords.view.read(data.get()!);
    expect(result.status).toBe('current');
    if (result.status === 'current') {
      expect(result.record.kernelViews).toEqual([{ id: 'schematic', options: { sheet: 'main' } }]);
    }
    store.dispose();
  });

  it('ignores a superseded read failure and republishes unchanged bytes after a current error', async () => {
    const data = memory();
    let stale = Promise.withResolvers<void>();
    const onChange = vi.fn();
    const onError = vi.fn();
    let next: 'normal' | 'hold' | 'fail' = 'normal';
    const view = createWorkbenchViewStore({
      root: '/root',
      viewId: 'v-abcd1234',
      files: {
        ...data.files,
        readFile: async () => {
          const action = next;
          next = 'normal';
          if (action === 'hold') {
            await stale.promise;
          }
          if (action === 'fail') {
            throw new Error('offline');
          }
          return data.files.readFile();
        },
      },
      onChange,
      onError,
    });
    await view.read();
    next = 'hold';
    const old = view.read();
    await Promise.resolve();
    await view.read();
    stale.reject(new Error('old worker closed'));
    await old;
    expect(onError).not.toHaveBeenCalled();
    next = 'fail';
    await view.read();
    expect(onError).toHaveBeenCalledOnce();
    await view.read();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(data.writes).not.toHaveBeenCalled();
    stale = Promise.withResolvers<void>();
    next = 'hold';
    const closing = view.read();
    await Promise.resolve();
    view.dispose();
    stale.resolve();
    await closing;
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledOnce();
  });

  it('keeps a live owner after external deletion without echo and recreates on its next person edit', async () => {
    const data = memory();
    const store = makeStore(data);
    await store.read();
    data.setBytes(null);
    await store.read();
    expect(store.snapshot().record).toBeUndefined();
    expect(data.writes).not.toHaveBeenCalled();
    expect(await store.edit({ ...seed(), name: 'Renamed' })).toBe(true);
    expect(workbenchRecords.view.read(data.get()!)).toMatchObject({
      status: 'current',
      record: { name: 'Renamed', entryPath: 'a.ts' },
    });
  });

  it('recreates a deleted view from the live view without restoring deleted saved fields', async () => {
    const data = memory();
    data.set({ ...seed(), name: 'Saved', grid: { unit: 'in' } });
    const store = makeStore(data);
    await store.read();
    data.setBytes(null);
    await store.read();
    const live = { ...seed(), entryPath: 'b.ts' };
    expect(await store.edit(live)).toBe(true);
    expect(workbenchRecords.view.read(data.get()!)).toMatchObject({ status: 'current', record: live });
  });

  it('keeps a pending view edit across deletion without stale saved fields', async () => {
    vi.useFakeTimers();
    const data = memory();
    data.set({ ...seed(), name: 'Saved' });
    let failures = 1;
    const store = createWorkbenchViewStore({
      root: '/root',
      viewId: 'v-abcd1234',
      files: {
        ...data.files,
        writeFileChecked: async (input) => {
          if (failures-- > 0) {
            throw Object.assign(new Error('offline'), { applicationState: 'known-not-applied' });
          }
          return data.writes(input);
        },
      },
      onChange: () => undefined,
      onError: () => undefined,
    });
    try {
      await store.read();
      expect(await store.edit({ ...seed(), name: 'Saved', grid: { unit: 'cm' } })).toBe(false);
      data.setBytes(null);
      await store.read();
      expect(await store.flush()).toBe(true);
      const read = workbenchRecords.view.read(data.get()!);
      expect(read).toMatchObject({ status: 'current', record: { name: 'Saved', grid: { unit: 'cm' } } });
    } finally {
      store.dispose();
      vi.useRealTimers();
    }
  });

  it('resets only against the bytes the person reviewed', async () => {
    const data = memory();
    const reviewed = encoder.encode('{broken');
    data.setBytes(reviewed);
    const store = makeStore(data);
    await store.read();
    const newer = encoder.encode('{still broken');
    data.setBytes(newer);
    await store.read();
    expect(await store.reset(seed(), reviewed)).toBe(false);
    expect(data.get()).toEqual(newer);
    expect(await store.reset(seed(), newer)).toBe(true);
  });

  it('reports read health and reconciles a potentially-applied write before writing again', async () => {
    vi.useFakeTimers();
    const data = memory();
    const readFile = vi.fn(async (): Promise<Uint8Array<ArrayBuffer>> => {
      throw new Error('disk busy');
    });
    const writeFileChecked = vi.fn(async (input: Parameters<typeof data.writes>[0]) => {
      if (writeFileChecked.mock.calls.length === 1) {
        await data.writes(input);
        throw Object.assign(new Error('reply lost'), { applicationState: 'potentially-applied' });
      }
      return data.writes(input);
    });
    const store = createWorkbenchViewStore({
      root: '/root',
      viewId: 'v-abcd1234',
      files: { ...data.files, readFile, writeFileChecked },
      onChange: () => undefined,
      onError: () => undefined,
    });
    try {
      await store.read();
      await vi.runAllTimersAsync();
      expect(store.health().read).toBe('unavailable');
      readFile.mockImplementation(async () => data.get()!);
      await store.retryRead();
      await vi.runAllTimersAsync();
      expect(store.health().read).toBe('ok');
      expect(await store.edit({ ...seed(), name: 'Renamed' })).toBe(false);
      expect(store.health().unconfirmed).toBe(true);
      expect(await store.flush()).toBe(true);
      expect(writeFileChecked).toHaveBeenCalledTimes(1);
      expect(store.health().unconfirmed).toBe(false);
    } finally {
      store.dispose();
      vi.useRealTimers();
    }
  });

  it('persists an explicit null entry binding', async () => {
    const data = memory();
    const store = makeStore(data);
    await store.read();
    expect(await store.edit({ ...seed(), entryPath: null })).toBe(true);
    expect(workbenchRecords.view.read(data.get()!)).toMatchObject({ status: 'current', record: { entryPath: null } });
  });

  it('does not schedule a new retry when an in-flight owner write fails after disposal', async () => {
    vi.useFakeTimers();
    try {
      const data = memory();
      const gate = Promise.withResolvers<void>();
      const writeFileChecked = vi.fn(async (): Promise<CheckedFileWriteResult> => {
        await gate.promise;
        throw new Error('offline');
      });
      const store = createWorkbenchViewStore({
        root: '/root',
        viewId: 'v-abcd1234',
        files: { ...data.files, writeFileChecked },
        onChange: () => undefined,
        onError: () => undefined,
      });
      await store.read();
      const editing = store.edit({ ...seed(), name: 'Closing' });
      await vi.waitFor(() => {
        expect(writeFileChecked).toHaveBeenCalledOnce();
      });
      store.dispose();
      gate.resolve();
      expect(await editing).toBe(false);
      await vi.runOnlyPendingTimersAsync();
      expect(writeFileChecked).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves both old-base and newer-foreign watches that overlap a checked write acknowledgement', async () => {
    for (const newerForeign of [false, true]) {
      const data = memory();
      const watchGate = Promise.withResolvers<void>();
      const acknowledgement = Promise.withResolvers<void>();
      let holdWatch = false;
      const store = createWorkbenchViewStore({
        root: '/root',
        viewId: 'v-abcd1234',
        files: {
          ...data.files,
          readFile: async () => {
            const captured = await data.files.readFile();
            if (holdWatch) {
              holdWatch = false;
              await watchGate.promise;
            }
            return captured;
          },
          writeFileChecked: async (input) => {
            const result = await data.files.writeFileChecked(input);
            if (newerForeign) {
              await acknowledgement.promise;
            }
            return result;
          },
        },
        onChange: () => undefined,
        onError: (error) => {
          throw error;
        },
      });
      await store.read();
      const releaseWrite = newerForeign ? undefined : data.delay();
      const own = { ...seed(), name: 'Own' };
      const saving = store.edit(own);
      await vi.waitFor(() => {
        expect(data.writes).toHaveBeenCalledOnce();
      });
      if (newerForeign) {
        data.set({ ...seed(), name: 'Foreign' });
      }
      holdWatch = true;
      const watching = store.read();
      await Promise.resolve();
      releaseWrite?.();
      acknowledgement.resolve();
      expect(await saving).toBe(true);
      watchGate.resolve();
      await watching;
      expect(store.snapshot().record?.name).toBe(newerForeign ? 'Foreign' : 'Own');
      expect(data.writes).toHaveBeenCalledOnce();
    }
  });
  it('merges every person field with a stale foreign base over 100 repetitions each', async () => {
    const person = workbenchRecords.view.schema.parse({
      ...seed(),
      entryPath: 'person.ts',
      name: 'Person',
      camera: { kind: 'preset', preset: 'front' },
      fieldOfView: 45,
      upDirection: 'y',
      display: { ...seed().display, axes: false, grid: false },
      grid: { unit: 'in' },
      section: { active: true, cuts: [{ kind: 'plane', plane: 'xz', offset: 1, isFlipped: false }] },
      measurements: [{ id: 'm1', frameId: 'f', startPoint: [0, 0, 0], endPoint: [1, 0, 0], distance: 1 }],
    });
    const foreign = workbenchRecords.view.schema.parse({
      ...seed(),
      entryPath: 'foreign.ts',
      name: 'Foreign',
      camera: { kind: 'preset', preset: 'back' },
      fieldOfView: 30,
      upDirection: 'x',
      display: { ...seed().display, lines: false, surfaces: false },
      grid: { unit: 'ft' },
      section: { active: false, cuts: [{ kind: 'plane', plane: 'xy', offset: 2, isFlipped: false }] },
      measurements: [{ id: 'm2', frameId: 'f', startPoint: [0, 0, 0], endPoint: [0, 1, 0], distance: 1 }],
    });
    for (const field of [
      'entryPath',
      'name',
      'camera',
      'fieldOfView',
      'upDirection',
      'display',
      'grid',
      'section',
      'measurements',
    ] as const) {
      for (let i = 0; i < 100; i++) {
        const data = memory();
        const store = makeStore(data);
        await store.read();
        data.set(foreign);
        expect(await store.edit({ ...seed(), [field]: person[field] })).toBe(true);
        const result = workbenchRecords.view.read(data.get()!);
        expect(result.status).toBe('current');
        if (result.status !== 'current') {
          continue;
        }
        if (field === 'display') {
          expect(result.record.display).toEqual({ ...foreign.display, axes: false, grid: false });
        } else {
          expect(result.record[field]).toEqual(person[field]);
        }
        for (const sibling of [
          'entryPath',
          'name',
          'camera',
          'fieldOfView',
          'upDirection',
          'section',
          'measurements',
        ] as const) {
          if (sibling !== field) {
            expect(result.record[sibling]).toEqual(foreign[sibling]);
          }
        }
      }
    }
  });

  it('adopts in two windows without an echo and preserves a queued revert', async () => {
    const data = memory();
    const a = makeStore(data);
    const b = makeStore(data);
    await Promise.all([a.read(), b.read()]);
    data.set({ ...seed(), grid: { unit: 'in' } });
    await Promise.all([a.read(), b.read()]);
    expect(a.snapshot().record?.grid.unit).toBe('in');
    expect(b.snapshot().record?.grid.unit).toBe('in');
    expect(data.writes).not.toHaveBeenCalled();
    const release = data.delay();
    const first = a.edit({ ...a.snapshot().record!, grid: { unit: 'ft' } });
    const second = a.edit({ ...a.snapshot().record!, grid: { unit: 'in' } });
    release();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(workbenchRecords.view.read(data.get()!)).toMatchObject({
      status: 'current',
      record: { grid: { unit: 'in' } },
    });
  });

  it('reconciles concurrent two-window writes for every view field and display toggle', async () => {
    const changes: ReadonlyArray<
      Readonly<{
        field: string;
        edit: (base: WorkbenchView) => WorkbenchView;
        value: (record: WorkbenchView) => unknown;
      }>
    > = [
      { field: 'entryPath', edit: (v) => ({ ...v, entryPath: 'person.ts' }), value: (v) => v.entryPath },
      { field: 'name', edit: (v) => ({ ...v, name: 'Person' }), value: (v) => v.name },
      { field: 'camera', edit: (v) => ({ ...v, camera: { kind: 'preset', preset: 'front' } }), value: (v) => v.camera },
      { field: 'fieldOfView', edit: (v) => ({ ...v, fieldOfView: 45 }), value: (v) => v.fieldOfView },
      { field: 'upDirection', edit: (v) => ({ ...v, upDirection: 'y' }), value: (v) => v.upDirection },
      { field: 'grid.unit', edit: (v) => ({ ...v, grid: { unit: 'in' } }), value: (v) => v.grid.unit },
      { field: 'section', edit: (v) => ({ ...v, section: { active: true, cuts: [] } }), value: (v) => v.section },
      {
        field: 'measurements',
        edit: (v) => ({
          ...v,
          measurements: [{ id: 'm1', frameId: 'f', startPoint: [0, 0, 0], endPoint: [1, 0, 0], distance: 1 }],
        }),
        value: (v) => v.measurements,
      },
      ...(['surfaces', 'lines', 'gizmo', 'grid', 'axes', 'matcap', 'postProcessing'] as const).map((field) => ({
        field: `display.${field}`,
        edit: (v: WorkbenchView) => ({ ...v, display: { ...v.display, [field]: !v.display[field] } }),
        value: (v: WorkbenchView) => v.display[field],
      })),
    ];
    for (const change of changes) {
      for (let iteration = 0; iteration < 100; iteration++) {
        const data = memory();
        const first = makeStore(data);
        const second = makeStore(data);
        await Promise.all([first.read(), second.read()]);
        const base = seed();
        const foreign =
          change.field === 'name'
            ? { ...base, fieldOfView: 35 }
            : change.field.startsWith('display.')
              ? { ...base, name: 'Foreign' }
              : { ...base, display: { ...base.display, axes: false } };
        const release = data.delay();
        const writes = Promise.all(
          iteration % 2 === 0
            ? [first.edit(change.edit(base)), second.edit(foreign)]
            : [second.edit(foreign), first.edit(change.edit(base))],
        );
        await Promise.resolve();
        release();
        expect(await writes).toEqual([true, true]);
        const result = workbenchRecords.view.read(data.get()!);
        expect(result.status, change.field).toBe('current');
        if (result.status !== 'current') {
          continue;
        }
        expect(change.value(result.record), change.field).toEqual(change.value(change.edit(base)));
        if (change.field === 'name') {
          expect(result.record.fieldOfView).toBe(35);
        } else if (change.field.startsWith('display.')) {
          expect(result.record.name).toBe('Foreign');
        } else {
          expect(result.record.display.axes).toBe(false);
        }
        const count = data.writes.mock.calls.length;
        await Promise.all([first.read(), second.read()]);
        expect(data.writes).toHaveBeenCalledTimes(count);
      }
    }
  });

  it('lets the delayed checked writer win each competing multi-valued view field', async () => {
    const variants: ReadonlyArray<
      Readonly<{
        field: string;
        a: (v: WorkbenchView) => WorkbenchView;
        b: (v: WorkbenchView) => WorkbenchView;
        value: (v: WorkbenchView) => unknown;
      }>
    > = [
      {
        field: 'entryPath',
        a: (v) => ({ ...v, entryPath: 'person.ts' }),
        b: (v) => ({ ...v, entryPath: 'foreign.ts' }),
        value: (v) => v.entryPath,
      },
      {
        field: 'name',
        a: (v) => ({ ...v, name: 'Person' }),
        b: (v) => ({ ...v, name: 'Foreign' }),
        value: (v) => v.name,
      },
      {
        field: 'camera',
        a: (v) => ({ ...v, camera: { kind: 'preset', preset: 'front' } }),
        b: (v) => ({ ...v, camera: { kind: 'preset', preset: 'back' } }),
        value: (v) => v.camera,
      },
      {
        field: 'fieldOfView',
        a: (v) => ({ ...v, fieldOfView: 45 }),
        b: (v) => ({ ...v, fieldOfView: 35 }),
        value: (v) => v.fieldOfView,
      },
      {
        field: 'upDirection',
        a: (v) => ({ ...v, upDirection: 'y' }),
        b: (v) => ({ ...v, upDirection: 'x' }),
        value: (v) => v.upDirection,
      },
      {
        field: 'grid.unit',
        a: (v) => ({ ...v, grid: { unit: 'in' } }),
        b: (v) => ({ ...v, grid: { unit: 'ft' } }),
        value: (v) => v.grid.unit,
      },
      {
        field: 'section',
        a: (v) => ({ ...v, section: { active: true, cuts: [] } }),
        b: (v) => ({
          ...v,
          section: { active: false, cuts: [{ kind: 'plane', plane: 'xy', offset: 2, isFlipped: false }] },
        }),
        value: (v) => v.section,
      },
      {
        field: 'measurements',
        a: (v) => ({
          ...v,
          measurements: [{ id: 'm1', frameId: 'f', startPoint: [0, 0, 0], endPoint: [1, 0, 0], distance: 1 }],
        }),
        b: (v) => ({
          ...v,
          measurements: [{ id: 'm2', frameId: 'f', startPoint: [0, 0, 0], endPoint: [0, 1, 0], distance: 1 }],
        }),
        value: (v) => v.measurements,
      },
    ];
    for (const variant of variants) {
      for (let i = 0; i < 100; i++) {
        const data = memory();
        const a = makeStore(data);
        const b = makeStore(data);
        await Promise.all([a.read(), b.read()]);
        const release = data.delay();
        const first = i % 2 === 0 ? a.edit(variant.a(seed())) : b.edit(variant.b(seed()));
        const second = i % 2 === 0 ? b.edit(variant.b(seed())) : a.edit(variant.a(seed()));
        await Promise.resolve();
        release();
        expect(await Promise.all([first, second])).toEqual([true, true]);
        const result = workbenchRecords.view.read(data.get()!);
        expect(result.status, variant.field).toBe('current');
        if (result.status !== 'current') {
          continue;
        }
        expect(variant.value(result.record), variant.field).toEqual(
          variant.value(i % 2 === 0 ? variant.a(seed()) : variant.b(seed())),
        );
        const count = data.writes.mock.calls.length;
        await Promise.all([a.read(), b.read()]);
        expect(data.writes).toHaveBeenCalledTimes(count);
      }
    }
  });

  it('preserves invalid and newer bytes, and Reset is checked against reviewed bytes', async () => {
    const data = memory();
    const store = makeStore(data);
    await store.read();
    data.setBytes(encoder.encode('{broken'));
    await store.read();
    expect(store.snapshot().refusal?.code).toBe('INVALID_RECORD');
    expect(await store.edit(seed())).toBe(false);
    data.set({ ...seed(), grid: { unit: 'in' } });
    expect(await store.reset(seed())).toBe(false);
    data.setBytes(encoder.encode('{"version":2}'));
    await store.read();
    expect(store.snapshot().refusal?.code).toBe('NEWER_RECORD');
    expect(await store.reset(seed())).toBe(false);
  });

  it('retains a failed view edit for producer flush and merges a later person field', async () => {
    vi.useFakeTimers();
    try {
      const data = memory();
      let fail = true;
      const errors = vi.fn();
      const store = createWorkbenchViewStore({
        root: '/root',
        viewId: 'v-abcd1234',
        files: {
          ...data.files,
          writeFileChecked: async (input) => {
            if (fail) {
              fail = false;
              throw new Error('offline');
            }
            return data.files.writeFileChecked(input);
          },
        },
        onChange: () => undefined,
        onError: errors,
      });
      await store.read();
      expect(await store.edit({ ...seed(), grid: { unit: 'in' } })).toBe(false);
      expect(data.writes).not.toHaveBeenCalled();
      expect(await store.edit({ ...seed(), grid: { unit: 'in' }, name: 'Person' })).toBe(true);
      expect(workbenchRecords.view.read(data.get()!)).toMatchObject({
        status: 'current',
        record: { grid: { unit: 'in' }, name: 'Person' },
      });
      expect(await store.flush()).toBe(true);
      await vi.runOnlyPendingTimersAsync();
      expect(data.writes).toHaveBeenCalledTimes(1);
      expect(errors).toHaveBeenCalledTimes(1);
      store.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('coalesces rapid view fields and writes them once on producer flush', async () => {
    vi.useFakeTimers();
    try {
      const data = memory();
      const store = createWorkbenchViewStore({
        root: '/root',
        viewId: 'v-abcd1234',
        files: data.files,
        editDebounce: 500,
        onChange: () => undefined,
        onError: (error) => {
          throw error;
        },
      });
      await store.read();
      const first = store.edit({ ...seed(), grid: { unit: 'in' } });
      const second = store.edit({ ...seed(), grid: { unit: 'in' }, name: 'Front' });
      expect(data.writes).not.toHaveBeenCalled();
      expect(await store.flush()).toBe(true);
      expect(await Promise.all([first, second])).toEqual([true, true]);
      expect(data.writes).toHaveBeenCalledTimes(1);
      expect(workbenchRecords.view.read(data.get()!)).toMatchObject({
        status: 'current',
        record: { grid: { unit: 'in' }, name: 'Front' },
      });
      store.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
