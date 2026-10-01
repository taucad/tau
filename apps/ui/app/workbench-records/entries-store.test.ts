/* oxlint-disable typescript/prefer-optional-chain -- Explicit null checks distinguish missing checked bytes. */
/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
/* oxlint-disable eslint/no-await-in-loop -- Interleaving cases intentionally run in sequence. */
import { describe, expect, it, vi } from 'vitest';
import { workbenchRecords } from '@taucad/workbench';
import type { WorkbenchEntries } from '@taucad/workbench';
import type { CheckedFileWriteResult } from '@taucad/types';
import { createWorkbenchEntriesStore } from '#workbench-records/entries-store.js';

const encoder = new TextEncoder();
const seed = (): WorkbenchEntries => ({ version: 1, entries: { 'a.ts': { operationTimeout: 180_000 } } });
function memory() {
  let bytes: Uint8Array<ArrayBuffer> | null = encoder.encode(workbenchRecords.entries.serialize(seed()));
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
          : bytes !== null && expected?.length === bytes.length && expected.every((v, i) => v === bytes?.[i]);
      if (!matches) {
        return { status: 'conflict', conflicts: [{ path: 'entries', actual: bytes }] };
      }
      bytes = encoder.encode(data);
      return { status: 'applied', content: bytes };
    },
  );
  return {
    files: { exists: async () => bytes !== null, readFile: async () => bytes!, writeFileChecked: writes },
    writes,
    get: () => bytes,
    setBytes: (next: Uint8Array<ArrayBuffer>) => {
      bytes = next;
    },
    delay: () => {
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => release?.();
    },
  };
}
const store = (m: ReturnType<typeof memory>) =>
  createWorkbenchEntriesStore({
    root: '/root',
    files: m.files,
    onChange: () => undefined,
    onError: (error) => {
      throw error;
    },
  });

describe('workbench entries checked store', () => {
  it('should keep invalid bytes preservable when an unchanged edit owes no fields', async () => {
    const data = memory();
    const entries = store(data);
    try {
      await entries.read();
      const invalid = encoder.encode('{broken');
      data.setBytes(invalid);
      await entries.read();
      expect(await entries.edit('a.ts', seed().entries['a.ts']!)).toBe(false);
      expect(await entries.flush()).toBe(true);
      expect(data.get()).toEqual(invalid);
      expect(data.writes).not.toHaveBeenCalled();
    } finally {
      entries.dispose();
    }
  });

  it('should hold an accepted edit and flush until its first record read settles', async () => {
    const data = memory();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const entries = createWorkbenchEntriesStore({
      root: '/root',
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
      const hydration = entries.read();
      await entered.promise;
      const edited = entries.edit('a.ts', { operationTimeout: 240_000 });
      let settled = false;
      const drained = (async () => {
        const saved = await entries.flush();
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
      expect(workbenchRecords.entries.read(data.get()!)).toMatchObject({
        status: 'current',
        record: { entries: { 'a.ts': { operationTimeout: 240_000 } } },
      });
    } finally {
      release.resolve();
      entries.dispose();
    }
  });

  it.each(['{broken', '{"version":2}'])(
    'should retain blocked entry intent through flush and repair (%s)',
    async (invalid) => {
      const data = memory();
      const entries = store(data);
      try {
        await entries.read();
        const release = data.delay();
        const edited = entries.edit('a.ts', { operationTimeout: 240_000 });
        await vi.waitFor(() => {
          expect(data.writes).toHaveBeenCalledOnce();
        });
        const foreign = encoder.encode(invalid);
        data.setBytes(foreign);
        release();
        expect(await edited).toBe(false);
        expect(await entries.flush()).toBe(false);
        expect(data.get()).toEqual(foreign);
        data.setBytes(encoder.encode(workbenchRecords.entries.serialize(seed())));
        await entries.read();
        expect(await entries.flush()).toBe(true);
        expect(workbenchRecords.entries.read(data.get()!)).toMatchObject({
          status: 'current',
          record: { entries: { 'a.ts': { operationTimeout: 240_000 } } },
        });
      } finally {
        entries.dispose();
      }
    },
  );

  it('should preserve invalid entry bytes on a clean flush', async () => {
    const data = memory();
    const foreign = encoder.encode('{broken');
    data.setBytes(foreign);
    const entries = store(data);
    try {
      await entries.read();
      expect(await entries.flush()).toBe(true);
      expect(data.get()).toEqual(foreign);
      expect(data.writes).not.toHaveBeenCalled();
    } finally {
      entries.dispose();
    }
  });

  it('should resolve blocked entry intent only after an explicit checked Reset', async () => {
    const data = memory();
    const entries = store(data);
    try {
      await entries.read();
      data.setBytes(encoder.encode('{broken'));
      await entries.read();
      expect(await entries.edit('a.ts', { operationTimeout: 240_000 })).toBe(false);
      expect(await entries.flush()).toBe(false);
      expect(await entries.reset(seed())).toBe(true);
      expect(await entries.flush()).toBe(true);
      expect(workbenchRecords.entries.read(data.get()!)).toEqual({ status: 'current', record: seed() });
    } finally {
      entries.dispose();
    }
  });

  it('should retire a disposed entry owner before a late write failure can retry', async () => {
    vi.useFakeTimers();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const data = memory();
    const writeFileChecked = vi.fn(async (): Promise<CheckedFileWriteResult> => {
      entered.resolve();
      await release.promise;
      throw new Error('offline');
    });
    const entries = createWorkbenchEntriesStore({
      root: '/root',
      files: { ...data.files, writeFileChecked },
      onChange: () => undefined,
      onError: vi.fn(),
    });
    try {
      await entries.read();
      const edited = entries.edit('a.ts', { operationTimeout: 240_000 });
      await entered.promise;
      entries.dispose();
      release.resolve();
      expect(await edited).toBe(false);
      await vi.runOnlyPendingTimersAsync();
      expect(writeFileChecked).toHaveBeenCalledOnce();
      expect(await entries.edit('a.ts', { operationTimeout: 300_000 })).toBe(false);
      expect(writeFileChecked).toHaveBeenCalledOnce();
    } finally {
      release.resolve();
      entries.dispose();
      vi.useRealTimers();
    }
  });
  it('marks only exact in-flight entry patch fields on a matching watch read', async () => {
    const data = memory();
    const committed = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const onChange = vi.fn();
    const entries = createWorkbenchEntriesStore({
      root: '/root',
      files: {
        ...data.files,
        writeFileChecked: async (input) => {
          const result = await data.files.writeFileChecked(input);
          committed.resolve();
          await release.promise;
          return result;
        },
      },
      onChange,
      onError: (error) => {
        throw error;
      },
    });
    await entries.read();
    const edited = entries.edit('a.ts', { operationTimeout: 240_000 });
    await committed.promise;
    await entries.read();
    expect(onChange.mock.lastCall?.[1]).toBe('write');
    expect(onChange.mock.lastCall?.[2]).toEqual({ path: 'a.ts', fields: { operationTimeout: 240_000 } });
    data.setBytes(
      encoder.encode(
        workbenchRecords.entries.serialize({
          version: 1,
          entries: {
            'a.ts': { operationTimeout: 240_000, components: { hidden: [], isolated: ['foreign'], opacity: [] } },
          },
        }),
      ),
    );
    await entries.read();
    expect(onChange.mock.lastCall?.[1]).toBe('read');
    expect(onChange.mock.lastCall?.[2]).toBeUndefined();
    release.resolve();
    await edited;
    entries.dispose();
  });

  it('does not report superseded reads and reannounces same bytes after an IO error', async () => {
    const data = memory();
    let stale = Promise.withResolvers<void>();
    const onChange = vi.fn();
    const onError = vi.fn();
    let next: 'normal' | 'hold' | 'fail' = 'normal';
    const entries = createWorkbenchEntriesStore({
      root: '/root',
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
    await entries.read();
    next = 'hold';
    const old = entries.read();
    await Promise.resolve();
    await entries.read();
    stale.reject(new Error('old worker closed'));
    await old;
    expect(onError).not.toHaveBeenCalled();
    next = 'fail';
    await entries.read();
    expect(onError).toHaveBeenCalledOnce();
    await entries.read();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(data.writes).not.toHaveBeenCalled();
    stale = Promise.withResolvers<void>();
    next = 'hold';
    const closing = entries.read();
    await Promise.resolve();
    entries.dispose();
    stale.resolve();
    await closing;
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledOnce();
  });

  it('resolves old-base and newer-foreign watches across checked write acknowledgement', async () => {
    for (const newerForeign of [false, true]) {
      const data = memory();
      const watchGate = Promise.withResolvers<void>();
      const acknowledgement = Promise.withResolvers<void>();
      let holdWatch = false;
      const store = createWorkbenchEntriesStore({
        root: '/root',
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
      const saving = store.edit('a.ts', { operationTimeout: 15_000 });
      await vi.waitFor(() => {
        expect(data.writes).toHaveBeenCalledOnce();
      });
      if (newerForeign) {
        data.setBytes(
          encoder.encode(
            workbenchRecords.entries.serialize({ version: 1, entries: { 'a.ts': { operationTimeout: 30_000 } } }),
          ),
        );
      }
      holdWatch = true;
      const watching = store.read();
      await Promise.resolve();
      releaseWrite?.();
      acknowledgement.resolve();
      expect(await saving).toBe(true);
      watchGate.resolve();
      await watching;
      expect(store.snapshot().record?.entries['a.ts']?.operationTimeout).toBe(newerForeign ? 30_000 : 15_000);
      expect(data.writes).toHaveBeenCalledOnce();
    }
  });
  it('merges concurrent timeout and component changes over 100 interleavings', async () => {
    for (let i = 0; i < 100; i++) {
      const m = memory();
      const a = store(m);
      const b = store(m);
      await Promise.all([a.read(), b.read()]);
      const release = m.delay();
      const result = Promise.all(
        i % 2 === 0
          ? [
              a.edit('a.ts', { operationTimeout: 15_000 }),
              b.edit('a.ts', {
                operationTimeout: 180_000,
                components: { hidden: ['part'], isolated: [], opacity: [] },
              }),
            ]
          : [
              b.edit('a.ts', {
                operationTimeout: 180_000,
                components: { hidden: ['part'], isolated: [], opacity: [] },
              }),
              a.edit('a.ts', { operationTimeout: 15_000 }),
            ],
      );
      await Promise.resolve();
      release();
      expect(await result).toEqual([true, true]);
      expect(workbenchRecords.entries.read(m.get()!)).toMatchObject({
        status: 'current',
        record: {
          entries: {
            'a.ts': { operationTimeout: 15_000, components: { hidden: ['part'] } },
          },
        },
      });
      const count = m.writes.mock.calls.length;
      await Promise.all([a.read(), b.read()]);
      expect(m.writes).toHaveBeenCalledTimes(count);
    }
  });

  it('merges concurrent independent component display fields over 100 interleavings each', async () => {
    for (const field of ['hidden', 'isolated', 'opacity'] as const) {
      for (let i = 0; i < 100; i++) {
        const m = memory();
        const a = store(m);
        const b = store(m);
        await Promise.all([a.read(), b.read()]);
        const changed = field === 'opacity' ? [{ id: 'part', opacity: 0.5 }] : ['part'];
        const person = {
          operationTimeout: 180_000,
          components: { hidden: [], isolated: [], opacity: [], [field]: changed },
        };
        const foreign = { operationTimeout: 15_000 };
        const release = m.delay();
        const writes = Promise.all(
          i % 2 === 0
            ? [a.edit('a.ts', person), b.edit('a.ts', foreign)]
            : [b.edit('a.ts', foreign), a.edit('a.ts', person)],
        );
        await Promise.resolve();
        release();
        expect(await writes).toEqual([true, true]);
        const read = workbenchRecords.entries.read(m.get()!);
        expect(read.status).toBe('current');
        if (read.status === 'current') {
          expect(read.record.entries['a.ts']?.operationTimeout).toBe(15_000);
          expect(read.record.entries['a.ts']?.components?.[field]).toEqual(changed);
        }
      }
    }
  });

  it('lets the delayed checked writer win competing timeout and component values', async () => {
    type Entry = WorkbenchEntries['entries'][string];
    const variants: ReadonlyArray<{
      field: 'operationTimeout' | 'hidden' | 'isolated' | 'opacity';
      a: Entry;
      b: Entry;
    }> = [
      { field: 'operationTimeout', a: { operationTimeout: 15_000 }, b: { operationTimeout: 30_000 } },
      {
        field: 'hidden',
        a: { components: { hidden: ['a'], isolated: [], opacity: [] } },
        b: { components: { hidden: ['b'], isolated: [], opacity: [] } },
      },
      {
        field: 'isolated',
        a: { components: { hidden: [], isolated: ['a'], opacity: [] } },
        b: { components: { hidden: [], isolated: ['b'], opacity: [] } },
      },
      {
        field: 'opacity',
        a: { components: { hidden: [], isolated: [], opacity: [{ id: 'a', opacity: 0.5 }] } },
        b: { components: { hidden: [], isolated: [], opacity: [{ id: 'b', opacity: 0.25 }] } },
      },
    ];
    for (const variant of variants) {
      for (let i = 0; i < 100; i++) {
        const m = memory();
        const a = store(m);
        const b = store(m);
        await Promise.all([a.read(), b.read()]);
        const release = m.delay();
        const first = i % 2 === 0 ? a.edit('a.ts', variant.a) : b.edit('a.ts', variant.b);
        const second = i % 2 === 0 ? b.edit('a.ts', variant.b) : a.edit('a.ts', variant.a);
        await Promise.resolve();
        release();
        expect(await Promise.all([first, second])).toEqual([true, true]);
        const read = workbenchRecords.entries.read(m.get()!);
        expect(read.status).toBe('current');
        if (read.status === 'current') {
          const expected = i % 2 === 0 ? variant.a : variant.b;
          if (variant.field === 'operationTimeout') {
            expect(read.record.entries['a.ts']?.operationTimeout).toEqual(expected.operationTimeout);
          } else {
            expect(read.record.entries['a.ts']?.components?.[variant.field]).toEqual(
              expected.components?.[variant.field],
            );
          }
        }
      }
    }
  });

  it('never echoes an external record and preserves invalid/newer bytes', async () => {
    const m = memory();
    const a = store(m);
    const b = store(m);
    await Promise.all([a.read(), b.read()]);
    m.setBytes(
      encoder.encode(workbenchRecords.entries.serialize({ version: 1, entries: { 'a.ts': { operationTimeout: 0 } } })),
    );
    await Promise.all([a.read(), b.read()]);
    expect(a.snapshot().record?.entries['a.ts']?.operationTimeout).toBe(0);
    expect(m.writes).not.toHaveBeenCalled();
    m.setBytes(encoder.encode('{bad'));
    await a.read();
    expect(a.snapshot().refusal?.code).toBe('INVALID_RECORD');
    expect(await a.edit('a.ts', { operationTimeout: 30_000 })).toBe(false);
    m.setBytes(encoder.encode('{"version":2}'));
    await a.read();
    expect(a.snapshot().refusal?.code).toBe('NEWER_RECORD');
    expect(await a.reset(seed())).toBe(false);
  });

  it('repairs exact invalid bytes even when Reset matches the retained last-valid entries', async () => {
    const m = memory();
    const entries = store(m);
    await entries.read();
    m.setBytes(encoder.encode('{bad'));
    await entries.read();
    expect(entries.snapshot().refusal?.code).toBe('INVALID_RECORD');
    expect(await entries.reset(seed())).toBe(true);
    expect(m.writes).toHaveBeenCalledOnce();
    expect(workbenchRecords.entries.read(m.get()!)).toMatchObject({ status: 'current', record: seed() });
    entries.dispose();
  });

  it('retains failed changes for two different entries through a producer flush', async () => {
    vi.useFakeTimers();
    try {
      const m = memory();
      let failures = 2;
      const errors = vi.fn();
      const entries = createWorkbenchEntriesStore({
        root: '/root',
        files: {
          ...m.files,
          writeFileChecked: async (input) => {
            if (failures > 0) {
              failures--;
              throw new Error('offline');
            }
            return m.files.writeFileChecked(input);
          },
        },
        onChange: () => undefined,
        onError: errors,
      });
      await entries.read();
      expect(await entries.edit('a.ts', { operationTimeout: 15_000 })).toBe(false);
      expect(await entries.edit('b.ts', { operationTimeout: 30_000 })).toBe(false);
      expect(await entries.flush()).toBe(true);
      expect(workbenchRecords.entries.read(m.get()!)).toMatchObject({
        status: 'current',
        record: {
          entries: {
            'a.ts': { operationTimeout: 15_000 },
            'b.ts': { operationTimeout: 30_000 },
          },
        },
      });
      await vi.runOnlyPendingTimersAsync();
      expect(m.writes).toHaveBeenCalledTimes(2);
      expect(errors).toHaveBeenCalledTimes(2);
      entries.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('coalesces one entry’s timeout and component changes before producer flush', async () => {
    vi.useFakeTimers();
    try {
      const m = memory();
      const entries = createWorkbenchEntriesStore({
        root: '/root',
        files: m.files,
        editDebounce: 500,
        onChange: () => undefined,
        onError: (error) => {
          throw error;
        },
      });
      await entries.read();
      const first = entries.edit('a.ts', { operationTimeout: 15_000 });
      const second = entries.edit('a.ts', {
        operationTimeout: 15_000,
        components: { hidden: ['part'], isolated: [], opacity: [] },
      });
      expect(m.writes).not.toHaveBeenCalled();
      expect(await entries.flush()).toBe(true);
      expect(await Promise.all([first, second])).toEqual([true, true]);
      expect(m.writes).toHaveBeenCalledTimes(1);
      expect(workbenchRecords.entries.read(m.get()!)).toMatchObject({
        status: 'current',
        record: {
          entries: {
            'a.ts': { operationTimeout: 15_000, components: { hidden: ['part'] } },
          },
        },
      });
      entries.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renames a deferred timeout over fresh foreign components without copying stale entry fields', async () => {
    const m = memory();
    let fail = true;
    const entries = createWorkbenchEntriesStore({
      root: '/root',
      files: {
        ...m.files,
        writeFileChecked: async (input) => {
          if (fail) {
            fail = false;
            throw new Error('offline');
          }
          return m.files.writeFileChecked(input);
        },
      },
      onChange: () => undefined,
      onError: () => undefined,
    });
    await entries.read();
    expect(await entries.edit('a.ts', { operationTimeout: 15_000 })).toBe(false);
    m.setBytes(
      encoder.encode(
        workbenchRecords.entries.serialize({
          version: 1,
          entries: {
            'a.ts': { operationTimeout: 180_000, components: { hidden: ['foreign'], isolated: [], opacity: [] } },
            'a.ts-extra': { operationTimeout: 22_000 },
          },
        }),
      ),
    );
    await entries.read();
    expect(await entries.changePaths({ type: 'rename', oldPath: 'a.ts', newPath: 'b.ts' })).toBe(true);
    const read = workbenchRecords.entries.read(m.get()!);
    expect(read).toMatchObject({
      status: 'current',
      record: {
        entries: {
          'b.ts': { operationTimeout: 15_000, components: { hidden: ['foreign'] } },
          'a.ts-extra': { operationTimeout: 22_000 },
        },
      },
    });
    if (read.status === 'current') {
      expect(read.record.entries['a.ts']).toBeUndefined();
    }
    entries.dispose();
  });

  it('orders failed rename, queued new-path edit, and delete without resurrecting the removed key', async () => {
    const m = memory();
    let fail = true;
    const entries = createWorkbenchEntriesStore({
      root: '/root',
      files: {
        ...m.files,
        writeFileChecked: async (input) => {
          if (fail) {
            fail = false;
            throw new Error('offline');
          }
          return m.files.writeFileChecked(input);
        },
      },
      onChange: () => undefined,
      onError: () => undefined,
    });
    await entries.read();
    expect(await entries.changePaths({ type: 'rename', oldPath: 'a.ts', newPath: 'b.ts' })).toBe(false);
    expect(await entries.edit('b.ts', { operationTimeout: 7000 })).toBe(false);
    expect(await entries.changePaths({ type: 'delete', path: 'b.ts' })).toBe(false);
    expect(await entries.flush()).toBe(true);
    const read = workbenchRecords.entries.read(m.get()!);
    expect(read.status).toBe('current');
    if (read.status === 'current') {
      expect(read.record.entries['a.ts']).toBeUndefined();
      expect(read.record.entries['b.ts']).toBeUndefined();
    }
    entries.dispose();
  });
});
