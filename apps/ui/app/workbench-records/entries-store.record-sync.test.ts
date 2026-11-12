/* oxlint-disable typescript/prefer-optional-chain -- Explicit null checks distinguish missing checked bytes. */
/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
/* oxlint-disable eslint/no-await-in-loop -- Interleaving cases intentionally run in sequence. */
import { describe, expect, it, vi } from 'vitest';
import { workbenchRecords } from '@taucad/workbench';
import type { WorkbenchEntries } from '@taucad/workbench';
import type { CheckedFileWriteResult } from '@taucad/types';
import { createWorkbenchEntriesStore } from '#workbench-records/entries-store.js';
import type { EntryPathChange } from '#workbench-records/entries-store.js';

const encoder = new TextEncoder();
const seed = (): WorkbenchEntries => ({ version: 1, entries: { 'a.ts': { renderTimeout: 180_000 } } });
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
    setBytes: (next: Uint8Array<ArrayBuffer> | null) => {
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

describe('workbench entries store over recordSync', () => {
  it('writes a path change at once, with the edits debounced before it', async () => {
    vi.useFakeTimers();
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
    try {
      await entries.read();
      const edited = entries.edit('a.ts', { renderTimeout: 15_000 });
      expect(await entries.changePaths({ type: 'rename', oldPath: 'a.ts', newPath: 'b.ts' })).toBe(true);
      expect(await edited).toBe(true);
      expect(m.writes).toHaveBeenCalledOnce();
      expect(workbenchRecords.entries.read(m.get()!)).toEqual({
        status: 'current',
        record: { version: 1, entries: { 'b.ts': { renderTimeout: 15_000 } } },
      });
    } finally {
      entries.dispose();
      vi.useRealTimers();
    }
  });

  it('attributes a write of two entries as own, naming each entry’s fields', async () => {
    vi.useFakeTimers();
    const m = memory();
    const onChange = vi.fn<(state: { record?: WorkbenchEntries }, source: 'read' | 'write', patch?: unknown) => void>();
    const entries = createWorkbenchEntriesStore({
      root: '/root',
      files: m.files,
      editDebounce: 500,
      onChange,
      onError: (error) => {
        throw error;
      },
    });
    try {
      await entries.read();
      const first = entries.edit('a.ts', { renderTimeout: 15_000 });
      const second = entries.edit('b.ts', { renderTimeout: 30_000 });
      expect(await entries.flush()).toBe(true);
      expect(await Promise.all([first, second])).toEqual([true, true]);
      expect(m.writes).toHaveBeenCalledOnce();
      expect(onChange.mock.lastCall?.[1]).toBe('write');
      expect(onChange.mock.lastCall?.[2]).toEqual({
        fields: { 'a.ts': { renderTimeout: 15_000 }, 'b.ts': { renderTimeout: 30_000 } },
      });
      // A rename alone names no entry's fields.
      expect(await entries.changePaths({ type: 'rename', oldPath: 'b.ts', newPath: 'c.ts' })).toBe(true);
      expect(onChange.mock.lastCall?.[1]).toBe('write');
      expect(onChange.mock.lastCall?.[2]).toBeUndefined();
    } finally {
      entries.dispose();
      vi.useRealTimers();
    }
  });

  it('publishes nothing and refuses every change once disposed, while its last write finishes', async () => {
    const m = memory();
    const release = m.delay();
    const onChange = vi.fn();
    const entries = createWorkbenchEntriesStore({ root: '/root', files: m.files, onChange, onError: () => undefined });
    await entries.read();
    onChange.mockClear();
    const saving = entries.edit('a.ts', { renderTimeout: 15_000 });
    await vi.waitFor(() => {
      expect(m.writes).toHaveBeenCalledOnce();
    });
    entries.dispose();
    release();
    await saving;
    expect(await entries.edit('a.ts', { renderTimeout: 30_000 })).toBe(false);
    expect(await entries.changePaths({ type: 'delete', path: 'a.ts' })).toBe(false);
    expect(await entries.read()).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(m.writes).toHaveBeenCalledOnce();
  });

  it.each([
    ['after a failed write', 'deferred'],
    ['made while a write is on the wire', 'pending'],
  ] as const)(
    'keeps a delete and a rename onto the deleted path, %s, through a lost reply of the write that carried them',
    async (_case, how) => {
      const m = memory();
      m.setBytes(
        encoder.encode(
          workbenchRecords.entries.serialize({
            version: 1,
            entries: { 'a.ts': { renderTimeout: 1000 }, 'c.ts': { renderTimeout: 3000 } },
          }),
        ),
      );
      let call = 0;
      const entries = createWorkbenchEntriesStore({
        root: '/root',
        files: {
          ...m.files,
          writeFileChecked: async (input) => {
            call += 1;
            const mine = call;
            if (how === 'deferred' && mine === 1) {
              throw new Error('offline');
            }
            const result = await m.files.writeFileChecked(input);
            if (mine === 2) {
              throw Object.assign(new Error('reply lost'), { applicationState: 'potentially-applied' });
            }
            return result;
          },
        },
        onChange: () => undefined,
        onError: () => undefined,
      });
      try {
        await entries.read();
        const expected: WorkbenchEntries['entries'] = { 'a.ts': { renderTimeout: 3000 } };
        if (how === 'pending') {
          const release = m.delay();
          const edited = entries.edit('x.ts', { renderTimeout: 5000 });
          await vi.waitFor(() => {
            expect(call).toBe(1);
          });
          const changed = [
            entries.changePaths({ type: 'delete', path: 'a.ts' }),
            entries.changePaths({ type: 'rename', oldPath: 'c.ts', newPath: 'a.ts' }),
          ];
          release();
          await Promise.all([edited, ...changed]);
          expected['x.ts'] = { renderTimeout: 5000 };
        } else {
          await entries.changePaths({ type: 'delete', path: 'a.ts' });
          await entries.changePaths({ type: 'rename', oldPath: 'c.ts', newPath: 'a.ts' });
        }
        let flushed = false;
        for (let attempt = 0; attempt < 5 && !flushed; attempt++) {
          flushed = await entries.flush();
        }
        expect(flushed).toBe(true);
        expect(workbenchRecords.entries.read(m.get()!)).toEqual({
          status: 'current',
          record: { version: 1, entries: expected },
        });
      } finally {
        entries.dispose();
      }
    },
  );

  it('gives a path renamed onto an edited one the renamed entry, as the edit and the rename one after the other', async () => {
    vi.useFakeTimers();
    const m = memory();
    m.setBytes(
      encoder.encode(
        workbenchRecords.entries.serialize({
          version: 1,
          entries: {
            'a.ts': { renderTimeout: 1000, components: { hidden: ['x'], isolated: [], opacity: [] } },
            'b.ts': { renderTimeout: 2000 },
          },
        }),
      ),
    );
    const entries = createWorkbenchEntriesStore({
      root: '/root',
      files: m.files,
      editDebounce: 500,
      onChange: () => undefined,
      onError: (error) => {
        throw error;
      },
    });
    try {
      await entries.read();
      const edited = entries.edit('b.ts', { renderTimeout: 9000 });
      const renamed = entries.changePaths({ type: 'rename', oldPath: 'a.ts', newPath: 'b.ts' });
      await vi.runAllTimersAsync();
      expect([await edited, await renamed]).toEqual([true, true]);
      expect(workbenchRecords.entries.read(m.get()!)).toEqual({
        status: 'current',
        record: {
          version: 1,
          entries: { 'b.ts': { renderTimeout: 1000, components: { hidden: ['x'], isolated: [], opacity: [] } } },
        },
      });
    } finally {
      entries.dispose();
      vi.useRealTimers();
    }
  });

  const deleteAndRenameOnto: EntryPathChange[] = [
    { type: 'delete', path: 'a.ts' },
    { type: 'rename', oldPath: 'c.ts', newPath: 'a.ts' },
  ];
  const swap: EntryPathChange[] = [
    { type: 'rename', oldPath: 'a.ts', newPath: 't.ts' },
    { type: 'rename', oldPath: 'c.ts', newPath: 'a.ts' },
    { type: 'rename', oldPath: 't.ts', newPath: 'c.ts' },
  ];
  const elsewhere = { 'z.ts': { renderTimeout: 7000 } };
  const onRenamed = { 'a.ts': { renderTimeout: 7000 } };
  it.each([
    [
      'a delete and a rename onto the deleted path when another party changes another entry',
      { changes: deleteAndRenameOnto, foreign: elsewhere, expected: { 'a.ts': { renderTimeout: 3000 }, ...elsewhere } },
    ],
    [
      'a swap through a third path when another party changes another entry',
      {
        changes: swap,
        foreign: elsewhere,
        expected: { 'a.ts': { renderTimeout: 3000 }, 'c.ts': { renderTimeout: 1000 }, ...elsewhere },
      },
    ],
    [
      'a delete and a rename onto the deleted path when another party changes the moved entry',
      { changes: deleteAndRenameOnto, foreign: onRenamed, expected: onRenamed },
    ],
    [
      'a swap through a third path when another party changes the moved entry',
      { changes: swap, foreign: onRenamed, expected: { ...onRenamed, 'c.ts': { renderTimeout: 1000 } } },
    ],
    [
      'a rename when another party makes a new entry at the old path',
      {
        changes: [{ type: 'rename', oldPath: 'a.ts', newPath: 'b.ts' }],
        foreign: onRenamed,
        expected: { ...onRenamed, 'b.ts': { renderTimeout: 1000 }, 'c.ts': { renderTimeout: 3000 } },
      },
    ],
  ] satisfies Array<
    [
      string,
      { changes: EntryPathChange[]; foreign: WorkbenchEntries['entries']; expected: WorkbenchEntries['entries'] },
    ]
  >)('keeps %s before the read-back of a lost reply', async (_case, { changes, foreign, expected }) => {
    const m = memory();
    m.setBytes(
      encoder.encode(
        workbenchRecords.entries.serialize({
          version: 1,
          entries: { 'a.ts': { renderTimeout: 1000 }, 'c.ts': { renderTimeout: 3000 } },
        }),
      ),
    );
    let offline = true;
    let lost = false;
    const entries = createWorkbenchEntriesStore({
      root: '/root',
      files: {
        ...m.files,
        writeFileChecked: async (input) => {
          if (offline) {
            throw new Error('offline');
          }
          const result = await m.files.writeFileChecked(input);
          if (!lost && result.status === 'applied') {
            lost = true;
            const landed = workbenchRecords.entries.read(m.get()!);
            if (landed.status === 'current') {
              m.setBytes(
                encoder.encode(
                  workbenchRecords.entries.serialize({
                    ...landed.record,
                    entries: { ...landed.record.entries, ...foreign },
                  }),
                ),
              );
            }
            throw Object.assign(new Error('reply lost'), { applicationState: 'potentially-applied' });
          }
          return result;
        },
      },
      onChange: () => undefined,
      onError: () => undefined,
    });
    try {
      await entries.read();
      for (const change of changes) {
        await entries.changePaths(change);
      }
      offline = false;
      let flushed = false;
      for (let attempt = 0; attempt < 6 && !flushed; attempt++) {
        flushed = await entries.flush();
      }
      expect(flushed).toBe(true);
      expect(workbenchRecords.entries.read(m.get()!)).toEqual({
        status: 'current',
        record: { version: 1, entries: expected },
      });
    } finally {
      entries.dispose();
    }
  });

  it('keeps fields the person did not change through an edit and a rename lost in one write', async () => {
    vi.useFakeTimers();
    const m = memory();
    const components = { hidden: ['x'], isolated: [], opacity: [] };
    m.setBytes(
      encoder.encode(
        workbenchRecords.entries.serialize({ version: 1, entries: { 'a.ts': { renderTimeout: 1000, components } } }),
      ),
    );
    let lost = false;
    const entries = createWorkbenchEntriesStore({
      root: '/root',
      editDebounce: 500,
      files: {
        ...m.files,
        writeFileChecked: async (input) => {
          const result = await m.files.writeFileChecked(input);
          if (!lost && result.status === 'applied') {
            lost = true;
            const landed = workbenchRecords.entries.read(m.get()!);
            if (landed.status === 'current') {
              m.setBytes(
                encoder.encode(
                  workbenchRecords.entries.serialize({
                    ...landed.record,
                    entries: { ...landed.record.entries, 'z.ts': { renderTimeout: 7000 } },
                  }),
                ),
              );
            }
            throw Object.assign(new Error('reply lost'), { applicationState: 'potentially-applied' });
          }
          return result;
        },
      },
      onChange: () => undefined,
      onError: () => undefined,
    });
    try {
      await entries.read();
      void entries.edit('a.ts', { renderTimeout: 5000, components });
      void entries.changePaths({ type: 'rename', oldPath: 'a.ts', newPath: 'b.ts' });
      await vi.runAllTimersAsync();
      let flushed = false;
      for (let attempt = 0; attempt < 5 && !flushed; attempt++) {
        const flushing = entries.flush();
        await vi.runAllTimersAsync();
        flushed = await flushing;
      }
      expect(flushed).toBe(true);
      expect(workbenchRecords.entries.read(m.get()!)).toEqual({
        status: 'current',
        record: {
          version: 1,
          entries: { 'b.ts': { renderTimeout: 5000, components }, 'z.ts': { renderTimeout: 7000 } },
        },
      });
    } finally {
      entries.dispose();
      vi.useRealTimers();
    }
  });

  it('names only the fields the written record holds when a rename replaced an edited entry', async () => {
    vi.useFakeTimers();
    const m = memory();
    m.setBytes(
      encoder.encode(
        workbenchRecords.entries.serialize({
          version: 1,
          entries: { 'a.ts': { renderTimeout: 1000 }, 'b.ts': { renderTimeout: 2000 } },
        }),
      ),
    );
    const onChange = vi.fn<(state: { record?: WorkbenchEntries }, source: 'read' | 'write', patch?: unknown) => void>();
    const entries = createWorkbenchEntriesStore({
      root: '/root',
      files: m.files,
      editDebounce: 500,
      onChange,
      onError: (error) => {
        throw error;
      },
    });
    try {
      await entries.read();
      void entries.edit('b.ts', { renderTimeout: 9000 });
      void entries.changePaths({ type: 'rename', oldPath: 'a.ts', newPath: 'b.ts' });
      await vi.runAllTimersAsync();
      expect(onChange.mock.lastCall?.[0].record?.entries).toEqual({ 'b.ts': { renderTimeout: 1000 } });
      expect(onChange.mock.lastCall?.[1]).toBe('write');
      expect(onChange.mock.lastCall?.[2]).toBeUndefined();
    } finally {
      entries.dispose();
      vi.useRealTimers();
    }
  });

  it.each([7, 8, 12])(
    'keeps a landed delete and rename onto the deleted path through %i later edits that failed to write',
    async (edits) => {
      const m = memory();
      m.setBytes(
        encoder.encode(
          workbenchRecords.entries.serialize({
            version: 1,
            entries: { 'a.ts': { renderTimeout: 1000 }, 'c.ts': { renderTimeout: 3000 } },
          }),
        ),
      );
      let phase: 'offline' | 'lose' | 'online' = 'offline';
      const entries = createWorkbenchEntriesStore({
        root: '/root',
        files: {
          ...m.files,
          writeFileChecked: async (input) => {
            if (phase === 'offline') {
              throw new Error('offline');
            }
            const result = await m.files.writeFileChecked(input);
            if (phase === 'lose' && result.status === 'applied') {
              phase = 'offline';
              throw Object.assign(new Error('reply lost'), { applicationState: 'potentially-applied' });
            }
            return result;
          },
        },
        onChange: () => undefined,
        onError: () => undefined,
      });
      try {
        await entries.read();
        for (const change of deleteAndRenameOnto) {
          await entries.changePaths(change);
        }
        phase = 'lose';
        await entries.flush();
        expect(workbenchRecords.entries.read(m.get()!)).toMatchObject({
          record: { entries: { 'a.ts': { renderTimeout: 3000 } } },
        });
        for (let edit = 1; edit <= edits; edit++) {
          await entries.edit(`z${edit}.ts`, { renderTimeout: edit });
        }
        phase = 'online';
        let flushed = false;
        for (let attempt = 0; attempt < 6 && !flushed; attempt++) {
          flushed = await entries.flush();
        }
        expect(flushed).toBe(true);
        expect(workbenchRecords.entries.read(m.get()!)).toMatchObject({
          status: 'current',
          record: { entries: { 'a.ts': { renderTimeout: 3000 }, [`z${edits}.ts`]: { renderTimeout: edits } } },
        });
      } finally {
        entries.dispose();
      }
    },
  );

  it('keeps a later foreign timeout on an entry the person only hid a component on while writes fail', async () => {
    const m = memory();
    const write = (entries: WorkbenchEntries['entries']) => {
      m.setBytes(encoder.encode(workbenchRecords.entries.serialize({ version: 1, entries })));
    };
    write({ 'a.ts': { renderTimeout: 180_000 }, 'b.ts': { renderTimeout: 5000 } });
    let offline = false;
    const hidden = { hidden: ['x'], isolated: [], opacity: [] };
    const entries = createWorkbenchEntriesStore({
      root: '/root',
      files: {
        ...m.files,
        writeFileChecked: async (input) => {
          if (offline) {
            throw new Error('offline');
          }
          return m.files.writeFileChecked(input);
        },
      },
      onChange: () => undefined,
      onError: () => undefined,
    });
    try {
      await entries.read();
      offline = true;
      await entries.edit('a.ts', { renderTimeout: 1000 });
      write({ 'a.ts': { renderTimeout: 180_000 }, 'b.ts': { renderTimeout: 9000 } });
      await entries.read();
      // The entry the person was shown, with the display state they changed over it.
      await entries.edit('b.ts', { ...entries.snapshot().record?.entries['b.ts'], components: hidden });
      write({ 'a.ts': { renderTimeout: 180_000 }, 'b.ts': { renderTimeout: 12_000 } });
      await entries.read();
      offline = false;
      expect(await entries.flush()).toBe(true);
      expect(workbenchRecords.entries.read(m.get()!)).toEqual({
        status: 'current',
        record: {
          version: 1,
          entries: { 'a.ts': { renderTimeout: 1000 }, 'b.ts': { renderTimeout: 12_000, components: hidden } },
        },
      });
    } finally {
      entries.dispose();
    }
  });

  it('saves every edit made while writes failed, however many', async () => {
    const m = memory();
    let offline = true;
    const entries = createWorkbenchEntriesStore({
      root: '/root',
      files: {
        ...m.files,
        writeFileChecked: async (input) => {
          if (offline) {
            throw new Error('offline');
          }
          return m.files.writeFileChecked(input);
        },
      },
      onChange: () => undefined,
      onError: () => undefined,
    });
    try {
      await entries.read();
      for (let edit = 0; edit < 3000; edit++) {
        await entries.edit(edit % 2 === 0 ? 'a.ts' : 'b.ts', { renderTimeout: edit });
      }
      offline = false;
      expect(await entries.flush()).toBe(true);
      expect(workbenchRecords.entries.read(m.get()!)).toMatchObject({
        status: 'current',
        record: { entries: { 'a.ts': { renderTimeout: 2998 }, 'b.ts': { renderTimeout: 2999 } } },
      });
    } finally {
      entries.dispose();
    }
  }, 60_000);
  /** A store over `entries` whose first edit waits: on a write that fails, or within the debounce. */
  const owing = (mode: 'fails' | 'debounces', entries: WorkbenchEntries['entries']) => {
    const m = memory();
    const write = (next: WorkbenchEntries['entries']) => {
      m.setBytes(encoder.encode(workbenchRecords.entries.serialize({ version: 1, entries: next })));
    };
    write(entries);
    let offline = false;
    if (mode === 'debounces') {
      vi.useFakeTimers();
    }
    const store = createWorkbenchEntriesStore({
      root: '/root',
      editDebounce: mode === 'debounces' ? 500 : 0,
      files: {
        ...m.files,
        writeFileChecked: async (input) => {
          if (offline) {
            throw new Error('offline');
          }
          return m.files.writeFileChecked(input);
        },
      },
      onChange: () => undefined,
      onError: () => undefined,
    });
    return {
      store,
      write,
      start: async () => {
        await store.read();
        offline = mode === 'fails';
      },
      settle: async () => {
        offline = false;
        if (mode === 'debounces') {
          await vi.advanceTimersByTimeAsync(600);
        }
        expect(await store.flush()).toBe(true);
        const read = workbenchRecords.entries.read(m.get()!);
        return read.status === 'current' ? read.record.entries : undefined;
      },
      dispose: () => {
        store.dispose();
        vi.useRealTimers();
      },
    };
  };

  it.each(['fails', 'debounces'] as const)(
    'writes a field the person set back to the file’s value after their own change, when its write %s',
    async (mode) => {
      const owed = owing(mode, { 'a.ts': { renderTimeout: 180_000 } });
      const hidden = { hidden: ['x'], isolated: [], opacity: [] };
      try {
        await owed.start();
        void owed.store.edit('a.ts', { renderTimeout: 1000 });
        void owed.store.edit('a.ts', { renderTimeout: 180_000, components: hidden });
        expect(await owed.settle()).toEqual({ 'a.ts': { renderTimeout: 180_000, components: hidden } });
      } finally {
        owed.dispose();
      }
    },
  );

  it.each(['fails', 'debounces'] as const)(
    'keeps a later foreign field on an entry the person’s own change lacks, when its write %s',
    async (mode) => {
      const owed = owing(mode, { 'a.ts': { renderTimeout: 180_000 } });
      const components = (hidden: string[]) => ({ hidden, isolated: [], opacity: [] });
      try {
        await owed.start();
        void owed.store.edit('a.ts', { renderTimeout: 1000 });
        owed.write({
          'a.ts': { renderTimeout: 180_000 },
          'b.ts': { renderTimeout: 5000, components: components(['y']) },
        });
        await owed.store.read();
        void owed.store.edit('b.ts', { ...owed.store.snapshot().record?.entries['b.ts'], renderTimeout: 7000 });
        owed.write({
          'a.ts': { renderTimeout: 180_000 },
          'b.ts': { renderTimeout: 5000, components: components(['z']) },
        });
        await owed.store.read();
        const settled = await owed.settle();
        expect(settled?.['b.ts']).toEqual({ renderTimeout: 7000, components: components(['z']) });
      } finally {
        owed.dispose();
      }
    },
  );
  it('writes a field the person set again after another party changed it, while their earlier write is on the wire', async () => {
    const m = memory();
    const components = (hidden: string[]) => ({ hidden, isolated: [], opacity: [{ id: 'o', opacity: 0.5 }] });
    m.setBytes(
      encoder.encode(
        workbenchRecords.entries.serialize({
          version: 1,
          entries: { 'a.ts': { renderTimeout: 1000, components: { hidden: ['x'], isolated: [], opacity: [] } } },
        }),
      ),
    );
    const entries = createWorkbenchEntriesStore({
      root: '/root',
      files: m.files,
      onChange: () => undefined,
      onError: () => undefined,
    });
    try {
      await entries.read();
      const shown = () => entries.snapshot().record?.entries['a.ts'];
      const release = m.delay();
      const first = entries.edit('a.ts', { ...shown(), components: components(['x']) });
      await vi.waitFor(() => {
        expect(m.writes).toHaveBeenCalledOnce();
      });
      m.setBytes(
        encoder.encode(
          workbenchRecords.entries.serialize({
            version: 1,
            entries: { 'a.ts': { renderTimeout: 1000, components: { hidden: ['y'], isolated: [], opacity: [] } } },
          }),
        ),
      );
      await entries.read();
      const second = entries.edit('a.ts', { ...shown(), components: components(['x']) });
      release();
      await Promise.all([first, second]);
      expect(await entries.flush()).toBe(true);
      expect(workbenchRecords.entries.read(m.get()!)).toMatchObject({
        record: { entries: { 'a.ts': { renderTimeout: 1000, components: components(['x']) } } },
      });
    } finally {
      entries.dispose();
    }
  });

  it('refuses a change the record cannot take, reports it unsaved, and still writes the other entries', async () => {
    const m = memory();
    const onError = vi.fn();
    const entries = createWorkbenchEntriesStore({ root: '/root', files: m.files, onChange: () => undefined, onError });
    try {
      await entries.read();
      const many = Array.from({ length: 1025 }, (_, index) => `c${index}`);
      expect(await entries.edit('a.ts', { components: { hidden: many, isolated: [], opacity: [] } })).toBe(false);
      expect(onError).toHaveBeenCalledOnce();
      expect(entries.health().unconfirmed).toBe(true);
      expect(entries.health().error).toContain('1024');
      expect(await entries.edit('b.ts', { renderTimeout: 15_000 })).toBe(true);
      expect(await entries.flush()).toBe(false);
      expect(workbenchRecords.entries.read(m.get()!)).toMatchObject({
        record: { entries: { 'a.ts': { renderTimeout: 180_000 }, 'b.ts': { renderTimeout: 15_000 } } },
      });
      expect(await entries.edit('a.ts', { components: { hidden: ['x'], isolated: [], opacity: [] } })).toBe(true);
      expect(await entries.flush()).toBe(true);
      expect(entries.health()).toMatchObject({ unconfirmed: false });
    } finally {
      entries.dispose();
    }
  });
  it.each([
    ['deleted', { type: 'delete', path: 'dir' }, {}],
    [
      'renamed and changed again',
      { type: 'rename', oldPath: 'dir', newPath: 'dir2' },
      { 'dir2/a.ts': { renderTimeout: 1000 } },
    ],
  ] satisfies Array<[string, EntryPathChange, WorkbenchEntries['entries']]>)(
    'lets a refused change go once its directory is %s',
    async (_case, change, expected) => {
      const m = memory();
      m.setBytes(
        encoder.encode(
          workbenchRecords.entries.serialize({ version: 1, entries: { 'dir/a.ts': { renderTimeout: 180_000 } } }),
        ),
      );
      const entries = createWorkbenchEntriesStore({
        root: '/root',
        files: m.files,
        onChange: () => undefined,
        onError: () => undefined,
      });
      try {
        await entries.read();
        const many = Array.from({ length: 1025 }, (_, index) => `c${index}`);
        expect(await entries.edit('dir/a.ts', { components: { hidden: many, isolated: [], opacity: [] } })).toBe(false);
        expect(await entries.changePaths(change)).toBe(true);
        if (change.type === 'rename') {
          expect(await entries.edit('dir2/a.ts', { renderTimeout: 1000 })).toBe(true);
        }
        expect(await entries.flush()).toBe(true);
        expect(entries.health().unconfirmed).toBe(false);
        expect(workbenchRecords.entries.read(m.get()!)).toEqual({
          status: 'current',
          record: { version: 1, entries: expected },
        });
      } finally {
        entries.dispose();
      }
    },
  );

  it('drops the settings of a file renamed to a path the record cannot name', async () => {
    const m = memory();
    const onError = vi.fn();
    const entries = createWorkbenchEntriesStore({ root: '/root', files: m.files, onChange: () => undefined, onError });
    try {
      await entries.read();
      expect(await entries.changePaths({ type: 'rename', oldPath: 'a.ts', newPath: 'notes:v2.ts' })).toBe(true);
      expect(onError).toHaveBeenCalledOnce();
      expect(await entries.flush()).toBe(true);
      expect(workbenchRecords.entries.read(m.get()!)).toEqual({
        status: 'current',
        record: { version: 1, entries: {} },
      });
    } finally {
      entries.dispose();
    }
  });

  it('writes the other entries when another party’s change leaves no room for one entry’s change', async () => {
    const m = memory();
    const ids = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, index) => `${prefix}-${'x'.repeat(200)}-${index}`);
    const hidden = (prefix: string, count: number) => ({
      components: { hidden: ids(prefix, count), isolated: [], opacity: [] },
    });
    const before = { 'b.ts': hidden('b', 190) };
    m.setBytes(encoder.encode(workbenchRecords.entries.serialize({ version: 1, entries: before })));
    let foreign = true;
    const entries = createWorkbenchEntriesStore({
      root: '/root',
      files: {
        ...m.files,
        writeFileChecked: async (input) => {
          if (foreign) {
            foreign = false;
            m.setBytes(
              encoder.encode(
                workbenchRecords.entries.serialize({ version: 1, entries: { ...before, 'c.ts': hidden('c', 95) } }),
              ),
            );
          }
          return m.files.writeFileChecked(input);
        },
      },
      onChange: () => undefined,
      onError: () => undefined,
    });
    try {
      await entries.read();
      const crowded = entries.edit('a.ts', hidden('a', 95));
      expect(await entries.edit('d.ts', { renderTimeout: 15_000 })).toBe(true);
      expect(await crowded).toBe(false);
      expect(await entries.flush()).toBe(false);
      expect(workbenchRecords.entries.read(m.get()!)).toMatchObject({
        record: { entries: { 'c.ts': hidden('c', 95), 'd.ts': { renderTimeout: 15_000 } } },
      });
      expect(await entries.flush()).toBe(true);
    } finally {
      entries.dispose();
    }
  });
  it.each<{ name: string; initial: WorkbenchEntries['entries']; refusedPath: string; saved: boolean }>([
    {
      name: 'follows a renamed file to its new path',
      initial: { 'a.ts': { renderTimeout: 180_000 } },
      refusedPath: 'a.ts',
      saved: false,
    },
    {
      name: 'goes with an entry another file is renamed onto',
      initial: { 'a.ts': { renderTimeout: 1000 }, 'b.ts': { renderTimeout: 180_000 } },
      refusedPath: 'b.ts',
      saved: true,
    },
  ])('counts a refused change that $name', async ({ initial, refusedPath, saved }) => {
    const m = memory();
    m.setBytes(encoder.encode(workbenchRecords.entries.serialize({ version: 1, entries: initial })));
    const entries = createWorkbenchEntriesStore({
      root: '/root',
      files: m.files,
      onChange: () => undefined,
      onError: () => undefined,
    });
    try {
      await entries.read();
      const many = Array.from({ length: 1025 }, (_, index) => `c${index}`);
      expect(await entries.edit(refusedPath, { components: { hidden: many, isolated: [], opacity: [] } })).toBe(false);
      expect(await entries.changePaths({ type: 'rename', oldPath: 'a.ts', newPath: 'b.ts' })).toBe(true);
      expect(entries.health().unconfirmed).toBe(!saved);
      expect(await entries.flush()).toBe(saved);
    } finally {
      entries.dispose();
    }
  });

  it('leaves out only what the file has no room for, and counts nothing a later write carried', async () => {
    const m = memory();
    const ids = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, index) => `${prefix}-${'x'.repeat(200)}-${index}`);
    const hidden = (prefix: string, count: number) => ({
      components: { hidden: ids(prefix, count), isolated: [], opacity: [] },
    });
    const before = { 'b.ts': hidden('b', 190) };
    const write = (next: WorkbenchEntries['entries']) => {
      m.setBytes(encoder.encode(workbenchRecords.entries.serialize({ version: 1, entries: next })));
    };
    write(before);
    let room = false;
    const onError = vi.fn();
    const entries = createWorkbenchEntriesStore({
      root: '/root',
      editDebounce: 50,
      files: {
        ...m.files,
        writeFileChecked: async (input) => {
          if (room) {
            room = false;
            write(before);
          }
          return m.files.writeFileChecked(input);
        },
      },
      onChange: () => undefined,
      onError,
    });
    try {
      await entries.read();
      const large = entries.edit('a.ts', hidden('a', 95));
      const small = entries.edit('d.ts', { renderTimeout: 15_000 });
      write({ ...before, 'c.ts': hidden('c', 95) });
      await entries.read();
      expect(await small).toBe(true);
      expect(await large).toBe(false);
      expect(onError).toHaveBeenCalledOnce();
      const read = workbenchRecords.entries.read(m.get()!);
      expect(read.status === 'current' ? Object.keys(read.record.entries).toSorted() : []).toEqual([
        'b.ts',
        'c.ts',
        'd.ts',
      ]);
      expect(await entries.flush()).toBe(false);
      // The other party makes room again, and changes the record while the next change is written: it all lands, and
      // nothing stays counted.
      write({ ...before, 'd.ts': { renderTimeout: 15_000 } });
      await entries.read();
      const again = entries.edit('a.ts', hidden('a', 95));
      room = true;
      expect(await again).toBe(true);
      expect(onError).toHaveBeenCalledOnce();
      expect(await entries.flush()).toBe(true);
      expect(entries.health().unconfirmed).toBe(false);
    } finally {
      entries.dispose();
    }
  });

  describe('an entry change another party leaves no room for', () => {
    const ids = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, index) => `${prefix}-${'x'.repeat(200)}-${index}`);
    const hidden = (prefix: string, count: number) => ({
      components: { hidden: ids(prefix, count), isolated: [], opacity: [] },
    });
    const crowded = (onWrite: Array<() => void>) => {
      const m = memory();
      const write = (next: WorkbenchEntries['entries']) => {
        m.setBytes(encoder.encode(workbenchRecords.entries.serialize({ version: 1, entries: next })));
      };
      write({ 'b.ts': hidden('b', 190) });
      const entries = createWorkbenchEntriesStore({
        root: '/root',
        editDebounce: 50,
        files: {
          ...m.files,
          writeFileChecked: async (input) => {
            onWrite.shift()?.();
            return m.files.writeFileChecked(input);
          },
        },
        onChange: () => undefined,
        onError: () => undefined,
      });
      const crowd = async () => {
        write({ 'b.ts': hidden('b', 190), 'c.ts': hidden('c', 95) });
        await entries.read();
      };
      const held = () => {
        const read = workbenchRecords.entries.read(m.get()!);
        return read.status === 'current' ? read.record.entries : {};
      };
      return { entries, crowd, held };
    };

    it('refuses every edit of the entry the write left out', async () => {
      const { entries, crowd, held } = crowded([]);
      try {
        await entries.read();
        const first = entries.edit('a.ts', hidden('a', 95));
        const second = entries.edit('a.ts', { ...hidden('a', 95), renderTimeout: 15_000 });
        await crowd();
        expect(await first).toBe(false);
        expect(await second).toBe(false);
        expect(held()['a.ts']).toBeUndefined();
      } finally {
        entries.dispose();
      }
    });

    it('keeps a left-out change counted when a later edit of the entry, written next, carries only other fields', async () => {
      const onWrite: Array<() => void> = [];
      const { entries, crowd, held } = crowded(onWrite);
      try {
        await entries.read();
        const first = entries.edit('a.ts', hidden('a', 95));
        const other = entries.edit('d.ts', { renderTimeout: 15_000 });
        await crowd();
        let later: Promise<boolean> | undefined;
        let flushed: Promise<boolean> | undefined;
        onWrite.push(() => {
          later = entries.edit('a.ts', { ...hidden('a', 95), renderTimeout: 15_000 });
          flushed = entries.flush();
        });
        expect(await first).toBe(false);
        expect(await other).toBe(true);
        await later;
        expect(await flushed).toBe(false);
        expect(held()['a.ts']?.components?.hidden ?? []).toEqual([]);
      } finally {
        entries.dispose();
      }
    });

    it('counts a left-out change at the path its entry is renamed to while it is written', async () => {
      const onWrite: Array<() => void> = [];
      const { entries, crowd } = crowded(onWrite);
      try {
        await entries.read();
        const first = entries.edit('a.ts', hidden('a', 95));
        const other = entries.edit('d.ts', { renderTimeout: 15_000 });
        await crowd();
        let renamed: Promise<boolean> | undefined;
        onWrite.push(() => {
          renamed = entries.changePaths({ type: 'rename', oldPath: 'a.ts', newPath: 'e.ts' });
        });
        expect(await first).toBe(false);
        expect(await renamed).toBe(true);
        await other;
        expect(entries.health().unconfirmed).toBe(true);
        expect(await entries.edit('e.ts', { renderTimeout: 20_000 })).toBe(true);
        expect(entries.health().unconfirmed).toBe(false);
      } finally {
        entries.dispose();
      }
    });
  });
});
