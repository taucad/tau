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
});
