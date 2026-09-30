/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
/* oxlint-disable eslint/no-await-in-loop -- Controlled interleavings run sequentially. */
/* oxlint-disable typescript/no-unnecessary-condition, typescript/prefer-optional-chain -- Mock preconditions may omit their first entry. */
import { describe, expect, it, vi } from 'vitest';
import { workbenchRecords } from '@taucad/workbench';
import type { WorkbenchLayout } from '@taucad/workbench';
import type { CheckedFileWriteResult } from '@taucad/types';
import { digestBytes } from '#utils/crypto.utils.js';
import { createWorkbenchLayoutStore } from '#routes/w.$workspace.$project/workbench-layout-controller.js';
import { fromDockview, toDockview } from '#workbench-records/converters.js';

const encoder = new TextEncoder();
const layout = (): WorkbenchLayout => ({
  version: 1,
  lanes: { chat: true, workbench: true },
  viewer: { kind: 'group', tabs: [{ kind: 'view', view: 'v-abcd1234' }] },
  workbench: { kind: 'group', tabs: [{ kind: 'pane', pane: 'parameters' }] },
});

function memoryFiles(initial: WorkbenchLayout | undefined = layout()) {
  let bytes: Uint8Array<ArrayBuffer> | null =
    initial === undefined ? null : encoder.encode(workbenchRecords.layout.serialize(initial));
  let releaseWrite: (() => void) | undefined;
  let writeGate: Promise<void> | undefined;
  const writes = vi.fn(
    async ({
      data,
      preconditions,
    }: {
      data: string;
      preconditions: ReadonlyArray<{ expected: Uint8Array<ArrayBuffer> | null }>;
    }): Promise<CheckedFileWriteResult> => {
      const wait = writeGate;
      writeGate = undefined;
      if (wait) {
        await wait;
      }
      const expected = preconditions[0]?.expected;
      const matches =
        expected === null
          ? bytes === null
          : bytes !== null &&
            expected !== undefined &&
            expected.every((value, index) => value === bytes?.[index]) &&
            expected.length === bytes.length;
      if (!matches) {
        return { status: 'conflict', conflicts: [{ path: '/root/.tau/workbench/layout.json', actual: bytes }] };
      }
      const next = encoder.encode(data);
      const status: 'unchanged' | 'applied' =
        bytes?.every((value, index) => value === next[index]) && bytes.length === next.length ? 'unchanged' : 'applied';
      bytes = next;
      return { status, content: next };
    },
  );
  return {
    files: { exists: async () => bytes !== null, readFile: async () => bytes!, writeFileChecked: writes },
    writes,
    get: () => bytes,
    set: (next: WorkbenchLayout) => {
      bytes = encoder.encode(workbenchRecords.layout.serialize(next));
    },
    setBytes: (next: Uint8Array<ArrayBuffer>) => {
      bytes = next;
    },
    delayNextWrite: () => {
      writeGate = new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      return () => releaseWrite?.();
    },
  };
}

describe('workbench layout checked store', () => {
  it('should refuse pending person edits and never rebase a restore over foreign bytes', async () => {
    const memory = memoryFiles();
    const store = createWorkbenchLayoutStore({
      root: '/root',
      files: memory.files,
      editDebounce: 500,
      onChange: () => undefined,
      onError: () => undefined,
    });
    await store.read();
    const { digest } = store.snapshot();
    const next = { ...layout(), lanes: { chat: false, workbench: true } };
    const editing = store.edit(next);
    expect(await store.restore(layout(), digest, () => true)).toBe(false);
    await store.flush();
    await editing;
    const current = store.snapshot().digest;
    const release = memory.delayNextWrite();
    const restoring = store.restore(layout(), current, () => true);
    await vi.waitFor(() => {
      expect(memory.writes).toHaveBeenCalledTimes(2);
    });
    const foreign = { ...layout(), lanes: { chat: true, workbench: false } };
    memory.set(foreign);
    release();
    expect(await restoring).toBe(false);
    expect(workbenchRecords.layout.read(memory.get()!)).toMatchObject({ status: 'current', record: foreign });
    expect(memory.writes).toHaveBeenCalledTimes(2);
    store.dispose();
  });

  it('does not report superseded or disposed reads and reannounces same bytes after an IO error', async () => {
    const memory = memoryFiles();
    let stale = Promise.withResolvers<void>();
    const onChange = vi.fn();
    const onError = vi.fn();
    let next: 'normal' | 'hold' | 'fail' = 'normal';
    const store = createWorkbenchLayoutStore({
      root: '/root',
      files: {
        ...memory.files,
        readFile: async () => {
          const action = next;
          next = 'normal';
          if (action === 'hold') {
            await stale.promise;
          }
          if (action === 'fail') {
            throw new Error('offline');
          }
          return memory.files.readFile();
        },
      },
      onChange,
      onError,
    });
    await store.read();
    next = 'hold';
    const old = store.read();
    await Promise.resolve();
    await store.read();
    stale.reject(new Error('old worker closed'));
    await old;
    expect(onError).not.toHaveBeenCalled();
    next = 'fail';
    await store.read();
    expect(onError).toHaveBeenCalledOnce();
    await store.read();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(memory.writes).not.toHaveBeenCalled();
    stale = Promise.withResolvers<void>();
    next = 'hold';
    const closing = store.read();
    await Promise.resolve();
    store.dispose();
    stale.resolve();
    await closing;
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledOnce();
  });

  it('merges each edited portable field with a stale foreign base for 100 repetitions', async () => {
    for (const field of ['lanes', 'viewer', 'workbench'] as const) {
      for (let iteration = 0; iteration < 100; iteration++) {
        const memory = memoryFiles();
        const store = createWorkbenchLayoutStore({
          root: '/root',
          files: memory.files,
          onChange: () => undefined,
          onError: (error) => {
            throw error;
          },
        });
        await store.read();
        const person: WorkbenchLayout = {
          ...layout(),
          lanes: { chat: false, workbench: true },
          viewer: { kind: 'group', tabs: [{ kind: 'view', view: 'v-1234abcd' }] },
          workbench: { kind: 'group', tabs: [{ kind: 'pane', pane: 'jobs' }] },
        };
        const foreign: WorkbenchLayout = {
          ...layout(),
          lanes: { chat: true, workbench: false },
          viewer: { kind: 'group', tabs: [{ kind: 'view', view: 'v-5678abcd' }] },
          workbench: { kind: 'group', tabs: [{ kind: 'pane', pane: 'revisions' }] },
        };
        memory.set(foreign);
        expect(await store.edit({ ...layout(), [field]: person[field] })).toBe(true);
        const read = workbenchRecords.layout.read(memory.get()!);
        expect(read.status).toBe('current');
        if (read.status === 'current') {
          expect(read.record[field]).toEqual(field === 'lanes' ? { chat: false, workbench: false } : person[field]);
          for (const other of ['lanes', 'viewer', 'workbench'] as const) {
            if (other !== field) {
              expect(read.record[other]).toEqual(foreign[other]);
            }
          }
        }
      }
    }
  });

  it('reconciles concurrent writers for each layout field and independent lane flag over 100 interleavings', async () => {
    const cases: ReadonlyArray<{
      field: string;
      person: (base: WorkbenchLayout) => WorkbenchLayout;
      foreign: (base: WorkbenchLayout) => WorkbenchLayout;
      check: (value: WorkbenchLayout) => void;
    }> = [
      {
        field: 'lanes.chat',
        person: (base: WorkbenchLayout) => ({ ...base, lanes: { ...base.lanes, chat: false } }),
        foreign: (base: WorkbenchLayout) => ({ ...base, lanes: { ...base.lanes, workbench: false } }),
        check: (value: WorkbenchLayout) => {
          expect(value.lanes).toEqual({ chat: false, workbench: false });
        },
      },
      {
        field: 'lanes.workbench',
        person: (base: WorkbenchLayout) => ({ ...base, lanes: { ...base.lanes, workbench: false } }),
        foreign: (base: WorkbenchLayout) => ({ ...base, lanes: { ...base.lanes, chat: false } }),
        check: (value: WorkbenchLayout) => {
          expect(value.lanes).toEqual({ chat: false, workbench: false });
        },
      },
      {
        field: 'viewer',
        person: (base: WorkbenchLayout) => ({
          ...base,
          viewer: { kind: 'group', tabs: [{ kind: 'view', view: 'v-1234abcd' }] },
        }),
        foreign: (base: WorkbenchLayout) => ({
          ...base,
          workbench: { kind: 'group', tabs: [{ kind: 'pane', pane: 'jobs' }] },
        }),
        check: (value: WorkbenchLayout) => {
          expect(value.viewer).toMatchObject({ tabs: [{ view: 'v-1234abcd' }] });
          expect(value.workbench).toMatchObject({ tabs: [{ pane: 'jobs' }] });
        },
      },
      {
        field: 'workbench',
        person: (base: WorkbenchLayout) => ({
          ...base,
          workbench: { kind: 'group', tabs: [{ kind: 'pane', pane: 'jobs' }] },
        }),
        foreign: (base: WorkbenchLayout) => ({
          ...base,
          viewer: { kind: 'group', tabs: [{ kind: 'view', view: 'v-1234abcd' }] },
        }),
        check: (value: WorkbenchLayout) => {
          expect(value.workbench).toMatchObject({ tabs: [{ pane: 'jobs' }] });
          expect(value.viewer).toMatchObject({ tabs: [{ view: 'v-1234abcd' }] });
        },
      },
    ];
    for (const testCase of cases) {
      for (let i = 0; i < 100; i++) {
        const memory = memoryFiles();
        const first = createWorkbenchLayoutStore({
          root: '/root',
          files: memory.files,
          onChange: () => undefined,
          onError: (error) => {
            throw error;
          },
        });
        const second = createWorkbenchLayoutStore({
          root: '/root',
          files: memory.files,
          onChange: () => undefined,
          onError: (error) => {
            throw error;
          },
        });
        await Promise.all([first.read(), second.read()]);
        const release = memory.delayNextWrite();
        const results = Promise.all(
          i % 2 === 0
            ? [first.edit(testCase.person(layout())), second.edit(testCase.foreign(layout()))]
            : [second.edit(testCase.foreign(layout())), first.edit(testCase.person(layout()))],
        );
        await Promise.resolve();
        release();
        expect(await results, testCase.field).toEqual([true, true]);
        const result = workbenchRecords.layout.read(memory.get()!);
        expect(result.status).toBe('current');
        if (result.status === 'current') {
          testCase.check(result.record);
        }
        const count = memory.writes.mock.calls.length;
        await Promise.all([first.read(), second.read()]);
        expect(memory.writes).toHaveBeenCalledTimes(count);
      }
    }
  });

  it('reconciles competing viewer and workbench trees in both checked completion orders', async () => {
    const variants = [
      {
        field: 'viewer',
        a: { kind: 'group', tabs: [{ kind: 'view', view: 'v-1234abcd' }] },
        b: { kind: 'group', tabs: [{ kind: 'view', view: 'v-5678abcd' }] },
      },
      {
        field: 'workbench',
        a: { kind: 'group', tabs: [{ kind: 'pane', pane: 'jobs' }] },
        b: { kind: 'group', tabs: [{ kind: 'pane', pane: 'revisions' }] },
      },
    ] as const;
    for (const variant of variants) {
      for (let i = 0; i < 100; i++) {
        const memory = memoryFiles();
        const a = createWorkbenchLayoutStore({
          root: '/root',
          files: memory.files,
          onChange: () => undefined,
          onError: (error) => {
            throw error;
          },
        });
        const b = createWorkbenchLayoutStore({
          root: '/root',
          files: memory.files,
          onChange: () => undefined,
          onError: (error) => {
            throw error;
          },
        });
        await Promise.all([a.read(), b.read()]);
        const release = memory.delayNextWrite();
        const first =
          i % 2 === 0
            ? a.edit({ ...layout(), [variant.field]: variant.a })
            : b.edit({ ...layout(), [variant.field]: variant.b });
        const second =
          i % 2 === 0
            ? b.edit({ ...layout(), [variant.field]: variant.b })
            : a.edit({ ...layout(), [variant.field]: variant.a });
        await Promise.resolve();
        release();
        expect(await Promise.all([first, second])).toEqual([true, true]);
        const result = workbenchRecords.layout.read(memory.get()!);
        expect(result.status).toBe('current');
        if (result.status === 'current') {
          expect(result.record[variant.field]).toEqual(i % 2 === 0 ? variant.a : variant.b);
        }
        const count = memory.writes.mock.calls.length;
        await Promise.all([a.read(), b.read()]);
        expect(memory.writes).toHaveBeenCalledTimes(count);
      }
    }
  });

  it('hashes the exact observed bytes, including hand formatting', async () => {
    const memory = memoryFiles();
    const pretty = encoder.encode(JSON.stringify(layout(), null, 2));
    memory.setBytes(pretty);
    const store = createWorkbenchLayoutStore({
      root: '/root',
      files: memory.files,
      onChange: () => undefined,
      onError: (error) => {
        throw error;
      },
    });
    await store.read();
    expect(store.snapshot().digest).toBe(await digestBytes(pretty));
    expect(store.snapshot().digest).not.toBe(
      await digestBytes(encoder.encode(workbenchRecords.layout.serialize(layout()))),
    );
  });

  it('adopts an external record without writing it back from two windows', async () => {
    const memory = memoryFiles();
    const first = createWorkbenchLayoutStore({
      root: '/root',
      files: memory.files,
      onChange: () => undefined,
      onError: (error) => {
        throw error;
      },
    });
    const second = createWorkbenchLayoutStore({
      root: '/root',
      files: memory.files,
      onChange: () => undefined,
      onError: (error) => {
        throw error;
      },
    });
    await Promise.all([first.read(), second.read()]);
    memory.set({ ...layout(), lanes: { chat: false, workbench: true } });
    await Promise.all([first.read(), second.read()]);
    expect(first.snapshot().layout?.lanes.chat).toBe(false);
    expect(second.snapshot().layout?.lanes.chat).toBe(false);
    expect(memory.writes).not.toHaveBeenCalled();
  });

  it('does not echo the same portable arrangement from two differently sized Dockviews', async () => {
    const memory = memoryFiles();
    const windows = [
      { width: 1200, height: 800 },
      { width: 520, height: 1080 },
    ].map((dimensions) => ({
      dimensions,
      store: createWorkbenchLayoutStore({
        root: '/root',
        files: memory.files,
        onChange: () => undefined,
        onError: (error) => {
          throw error;
        },
      }),
    }));
    await Promise.all(windows.map(async ({ store }) => store.read()));
    memory.set({ ...layout(), lanes: { chat: false, workbench: true } });
    await Promise.all(windows.map(async ({ store }) => store.read()));
    for (const { dimensions, store } of windows) {
      const adopted = store.snapshot().layout!;
      const viewer = fromDockview('viewer', toDockview('viewer', adopted.viewer, { dimensions }));
      const workbench = fromDockview('workbench', toDockview('workbench', adopted.workbench, { dimensions }));
      expect(await store.edit({ ...adopted, viewer, workbench })).toBe(true);
    }
    expect(memory.writes).not.toHaveBeenCalled();
  });

  it('keeps a person revert queued behind a slow checked write', async () => {
    const memory = memoryFiles();
    const store = createWorkbenchLayoutStore({
      root: '/root',
      files: memory.files,
      onChange: () => undefined,
      onError: (error) => {
        throw error;
      },
    });
    await store.read();
    const release = memory.delayNextWrite();
    const first = store.edit({ ...layout(), lanes: { chat: false, workbench: true } });
    const second = store.edit(layout());
    release();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    const read = workbenchRecords.layout.read(memory.get()!);
    expect(read.status).toBe('current');
    if (read.status === 'current') {
      expect(read.record.lanes.chat).toBe(true);
    }
    expect(memory.writes).toHaveBeenCalledTimes(2);
  });

  it('preserves invalid/newer bytes and Reset cannot overwrite a later external edit', async () => {
    const memory = memoryFiles();
    const store = createWorkbenchLayoutStore({
      root: '/root',
      files: memory.files,
      onChange: () => undefined,
      onError: (error) => {
        throw error;
      },
    });
    await store.read();
    memory.setBytes(encoder.encode('{broken'));
    await store.read();
    expect(store.snapshot().refusal?.code).toBe('INVALID_RECORD');
    expect(await store.edit(layout())).toBe(false);
    memory.set({ ...layout(), lanes: { chat: false, workbench: true } });
    expect(await store.reset(layout())).toBe(false);
    await store.read();
    const newer = encoder.encode('{"version":2}');
    memory.setBytes(newer);
    await store.read();
    expect(store.snapshot().refusal?.code).toBe('NEWER_RECORD');
    expect(await store.reset(layout())).toBe(false);
    expect(memory.get()).toEqual(newer);
  });

  it('requires a successful initial read and retries a pending edit after transient I/O', async () => {
    vi.useFakeTimers();
    try {
      const memory = memoryFiles();
      let failRead = true;
      let failWrite = true;
      const errors = vi.fn();
      const store = createWorkbenchLayoutStore({
        root: '/root',
        files: {
          ...memory.files,
          exists: async () => {
            if (failRead) {
              throw new Error('offline');
            }
            return memory.files.exists();
          },
          writeFileChecked: async (input) => {
            if (failWrite) {
              failWrite = false;
              throw new Error('offline');
            }
            return memory.files.writeFileChecked(input);
          },
        },
        onChange: () => undefined,
        onError: errors,
      });
      const desired = { ...layout(), lanes: { chat: false, workbench: true } };
      expect(await store.edit(desired)).toBe(false);
      expect(memory.writes).not.toHaveBeenCalled();
      failRead = false;
      for (let attempt = 0; attempt < 4 && memory.writes.mock.calls.length === 0; attempt++) {
        await vi.runOnlyPendingTimersAsync();
      }
      expect(failWrite).toBe(false);
      expect(memory.writes).toHaveBeenCalledTimes(1);
      expect(workbenchRecords.layout.read(memory.get()!)).toMatchObject({ status: 'current', record: desired });
      expect(errors).toHaveBeenCalled();
      store.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects an old watch completion after its own checked write', async () => {
    const memory = memoryFiles();
    let release: (() => void) | undefined;
    let hold = false;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = createWorkbenchLayoutStore({
      root: '/root',
      files: {
        ...memory.files,
        readFile: async () => {
          const captured = await memory.files.readFile();
          if (hold) {
            await held;
          }
          return captured;
        },
      },
      onChange: () => undefined,
      onError: (error) => {
        throw error;
      },
    });
    await store.read();
    hold = true;
    const stale = store.read();
    const desired = { ...layout(), lanes: { chat: false, workbench: true } };
    expect(await store.edit(desired)).toBe(true);
    release?.();
    await stale;
    expect(store.snapshot().layout).toEqual(desired);
  });

  it('keeps a newer foreign watch started before the own write acknowledgement', async () => {
    const memory = memoryFiles();
    const acknowledgement = Promise.withResolvers<void>();
    const watchGate = Promise.withResolvers<void>();
    let holdWatch = false;
    const store = createWorkbenchLayoutStore({
      root: '/root',
      files: {
        ...memory.files,
        readFile: async () => {
          const captured = await memory.files.readFile();
          if (holdWatch) {
            holdWatch = false;
            await watchGate.promise;
          }
          return captured;
        },
        writeFileChecked: async (input) => {
          const applied = await memory.files.writeFileChecked(input);
          await acknowledgement.promise;
          return applied;
        },
      },
      onChange: () => undefined,
      onError: (error) => {
        throw error;
      },
    });
    await store.read();
    const own = { ...layout(), lanes: { chat: false, workbench: true } };
    const foreign = { ...layout(), lanes: { chat: true, workbench: false } };
    const saving = store.edit(own);
    await vi.waitFor(() => {
      expect(memory.writes).toHaveBeenCalledTimes(1);
    });
    memory.set(foreign);
    holdWatch = true;
    const watching = store.read();
    await Promise.resolve();
    acknowledgement.resolve();
    expect(await saving).toBe(true);
    watchGate.resolve();
    await watching;
    expect(store.snapshot().layout).toEqual(foreign);
    expect(memory.writes).toHaveBeenCalledTimes(1);
  });

  it('keeps an own write when an overlapping watch captured its old base', async () => {
    const memory = memoryFiles();
    const watchGate = Promise.withResolvers<void>();
    let holdWatch = false;
    const store = createWorkbenchLayoutStore({
      root: '/root',
      files: {
        ...memory.files,
        readFile: async () => {
          const captured = await memory.files.readFile();
          if (holdWatch) {
            holdWatch = false;
            await watchGate.promise;
          }
          return captured;
        },
      },
      onChange: () => undefined,
      onError: (error) => {
        throw error;
      },
    });
    await store.read();
    const release = memory.delayNextWrite();
    const own = { ...layout(), lanes: { chat: false, workbench: true } };
    const saving = store.edit(own);
    await Promise.resolve();
    holdWatch = true;
    const watching = store.read();
    await Promise.resolve();
    release();
    expect(await saving).toBe(true);
    watchGate.resolve();
    await watching;
    expect(store.snapshot().layout).toEqual(own);
    expect(memory.writes).toHaveBeenCalledTimes(1);
  });

  it('captures Reset bytes before a queued write and rejects a later watch version', async () => {
    const memory = memoryFiles();
    const store = createWorkbenchLayoutStore({
      root: '/root',
      files: memory.files,
      onChange: () => undefined,
      onError: (error) => {
        throw error;
      },
    });
    await store.read();
    const release = memory.delayNextWrite();
    const slow = store.edit({ ...layout(), lanes: { chat: false, workbench: true } });
    memory.setBytes(encoder.encode('{broken'));
    await store.read();
    const reset = store.reset(layout());
    memory.set({ ...layout(), lanes: { chat: true, workbench: false } });
    await store.read();
    release();
    await slow;
    expect(await reset).toBe(false);
    expect(memory.writes).toHaveBeenCalledTimes(2);
  });

  it('coalesces person edits for 500 ms and flushes both layout fields as one checked write', async () => {
    vi.useFakeTimers();
    try {
      const memory = memoryFiles();
      const store = createWorkbenchLayoutStore({
        root: '/root',
        files: memory.files,
        editDebounce: 500,
        onChange: () => undefined,
        onError: (error) => {
          throw error;
        },
      });
      await store.read();
      const viewer: WorkbenchLayout = {
        ...layout(),
        viewer: { kind: 'group', tabs: [{ kind: 'view', view: 'v-1234abcd' }] },
      };
      const first = store.edit(viewer);
      const second = store.edit({ ...store.intendedLayout()!, lanes: { chat: false, workbench: true } });
      await vi.advanceTimersByTimeAsync(499);
      expect(memory.writes).not.toHaveBeenCalled();
      expect(await store.flush()).toBe(true);
      expect(await Promise.all([first, second])).toEqual([true, true]);
      expect(memory.writes).toHaveBeenCalledTimes(1);
      expect(workbenchRecords.layout.read(memory.get()!)).toMatchObject({
        status: 'current',
        record: {
          lanes: { chat: false, workbench: true },
          viewer: viewer.viewer,
        },
      });
      store.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
