import { describe, expect, it, vi } from 'vitest';
import type { BatchEntry, BatchReceipt, ChangesetEntry } from '#changeset.js';
import { maximumChangesetEntries } from '#changeset.js';
import { applyChangesetToProvider } from '#changeset-provider.js';
import { MemoryProvider } from '#backend/memory-provider.js';

const text = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);

describe('applyChangesetToProvider', () => {
  it('should apply every phase in order and report each entry applied', async () => {
    const provider = new MemoryProvider();
    await provider.writeFile('old.txt', 'old');

    const receipt = await applyChangesetToProvider(provider, {
      entries: [
        { op: 'write', path: 'staged.txt', data: 'new' },
        { op: 'move', from: 'old.txt', to: 'backup.txt' },
        { op: 'move', from: 'staged.txt', to: 'old.txt', phase: 1 },
        { op: 'delete', path: 'backup.txt', kind: 'file', phase: 2 },
      ],
    });

    expect(receipt.state).toBe('applied');
    expect(receipt.entries.map(({ outcome }) => outcome)).toEqual(['applied', 'applied', 'applied', 'applied']);
    await expect(provider.readFile('old.txt', 'utf8')).resolves.toBe('new');
    await expect(provider.exists('backup.txt')).resolves.toBe(false);
  });

  it('should skip a later phase when an entry of an earlier one did not apply', async () => {
    const provider = new MemoryProvider();
    await provider.writeFile('taken.txt', 'mine');

    const receipt = await applyChangesetToProvider(provider, {
      entries: [
        { op: 'write', path: 'taken.txt', data: 'theirs', create: true },
        { op: 'write', path: 'free.txt', data: 'free' },
        { op: 'delete', path: 'free.txt', phase: 1 },
      ],
    });

    expect(receipt.entries.map(({ outcome }) => outcome)).toEqual(['failed', 'applied', 'skipped']);
    expect((receipt.entries[0]!.error as { code?: string }).code).toBe('EEXIST');
    await expect(provider.readFile('taken.txt', 'utf8')).resolves.toBe('mine');
    await expect(provider.readFile('free.txt', 'utf8')).resolves.toBe('free');
  });

  it('should refuse overlapping entries of one phase before the first I/O', async () => {
    const provider = new MemoryProvider();
    const writeFile = vi.spyOn(provider, 'writeFile');

    await expect(
      applyChangesetToProvider(provider, {
        entries: [
          { op: 'write', path: 'dir/a.txt', data: 'a' },
          { op: 'delete', path: 'dir', recursive: true },
        ],
      }),
    ).rejects.toMatchObject({ code: 'EINVAL' });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('should refuse a changeset past the bound before the first I/O', async () => {
    const provider = new MemoryProvider();
    const entries = Array.from(
      { length: maximumChangesetEntries + 1 },
      (_, index): ChangesetEntry => ({ op: 'write', path: `f${String(index)}.txt`, data: 'x' }),
    );

    await expect(applyChangesetToProvider(provider, { entries })).rejects.toMatchObject({ code: 'EINVAL' });
    await expect(provider.exists('f0.txt')).resolves.toBe(false);
  });

  it('should stage a streamed write before the batch and keep appends to one path in order', async () => {
    const provider = new MemoryProvider();
    const stream = new Blob([text('streamed')]).stream();

    const receipt = await applyChangesetToProvider(provider, {
      entries: [
        { op: 'write', path: 'stream.txt', data: stream },
        { op: 'append', path: 'log.txt', data: 'one,' },
        { op: 'append', path: 'log.txt', data: 'two,' },
        { op: 'append', path: 'log.txt', data: 'three' },
      ],
    });

    expect(receipt.state).toBe('applied');
    await expect(provider.readFile('stream.txt', 'utf8')).resolves.toBe('streamed');
    await expect(provider.readFile('log.txt', 'utf8')).resolves.toBe('one,two,three');
  });

  it('should hand each phase to the provider’s own batch as one call', async () => {
    const provider = new MemoryProvider();
    const batches: Array<readonly BatchEntry[]> = [];
    const applyBatch = async (entries: readonly BatchEntry[]): Promise<BatchReceipt[]> => {
      batches.push(entries);
      return provider.applyBatch(entries);
    };

    await applyChangesetToProvider(Object.assign(Object.create(provider) as MemoryProvider, { applyBatch }), {
      entries: [
        { op: 'write', path: 'a.txt', data: 'a' },
        { op: 'write', path: 'b.txt', data: 'b' },
        { op: 'delete', path: 'a.txt', phase: 1 },
      ],
    });

    expect(batches.map((batch) => batch.map((entry) => entry.op))).toEqual([['write', 'write'], ['delete']]);
  });

  it('should report every entry of a batch that threw as uncertain', async () => {
    const provider = new MemoryProvider();
    const failure = new Error('the provider went away');
    const applyBatch = async (): Promise<BatchReceipt[]> => {
      throw failure;
    };

    const receipt = await applyChangesetToProvider(
      Object.assign(Object.create(provider) as MemoryProvider, { applyBatch }),
      { entries: [{ op: 'write', path: 'a.txt', data: 'a' }] },
    );

    expect(receipt.entries).toEqual([{ index: 0, outcome: 'uncertain', error: failure }]);
    expect(receipt.state).toBe('potentially-applied');
  });

  it('should skip every phase once the signal aborted', async () => {
    const provider = new MemoryProvider();
    const controller = new AbortController();
    controller.abort(new Error('stopped'));

    await expect(
      applyChangesetToProvider(provider, {
        entries: [{ op: 'write', path: 'a.txt', data: 'a' }],
        signal: controller.signal,
      }),
    ).rejects.toThrow('stopped');
    await expect(provider.exists('a.txt')).resolves.toBe(false);
  });
});
