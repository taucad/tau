import { describe, expect, it, vi } from 'vitest';
import type { BatchEntry } from '#changeset.js';
import {
  applyBatchWithPrimitives,
  applyEntryWithPrimitives,
  batchTasks,
  mapRolling,
  runBatch,
} from '#backend/batch.js';
import { MemoryProvider } from '#backend/memory-provider.js';

const bytes = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);

describe('batchTasks', () => {
  it('should run each entry alone except appends to one path, which share one ordered task', () => {
    const entries: BatchEntry[] = [
      { op: 'append', path: 'log', data: bytes('1') },
      { op: 'write', path: 'a', data: bytes('a') },
      { op: 'append', path: 'log', data: bytes('2') },
      { op: 'append', path: 'other', data: bytes('x') },
      { op: 'append', path: 'log', data: bytes('3') },
    ];

    expect(batchTasks(entries)).toEqual([[0, 2, 4], [1], [3]]);
  });
});

describe('mapRolling', () => {
  it('should keep at most the window in flight and answer in input order', async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapRolling([5, 1, 4, 2, 3], 2, async (item) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => {
        setTimeout(resolve, item);
      });
      inFlight -= 1;
      return item * 10;
    });

    expect(results).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });
});

describe('runBatch', () => {
  it('should fail every entry not yet begun once the signal aborts', async () => {
    const controller = new AbortController();
    const entries: BatchEntry[] = [
      { op: 'mkdir', path: 'a' },
      { op: 'mkdir', path: 'b' },
    ];

    const receipts = await runBatch(
      entries,
      async () => {
        controller.abort(new Error('stopped'));
        return { outcome: 'applied' };
      },
      { signal: controller.signal, limit: 1 },
    );

    expect(receipts.map(({ outcome }) => outcome)).toEqual(['applied', 'failed']);
  });
});

describe('applyEntryWithPrimitives', () => {
  it('should refuse a create over an existing file without writing it', async () => {
    const provider = new MemoryProvider();
    await provider.writeFile('a.txt', 'mine');
    const writeFile = vi.spyOn(provider, 'writeFile');

    const receipt = await applyEntryWithPrimitives(provider, {
      op: 'write',
      path: 'a.txt',
      data: bytes('theirs'),
      create: true,
    });

    expect(receipt).toMatchObject({ outcome: 'failed', error: { code: 'EEXIST' } });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('should report a write that failed after it began as uncertain, and a refusal as failed', async () => {
    const provider = new MemoryProvider();
    vi.spyOn(provider, 'writeFile').mockRejectedValueOnce(new Error('the disk went away'));

    await expect(
      applyEntryWithPrimitives(provider, { op: 'write', path: 'a.txt', data: bytes('a') }),
    ).resolves.toMatchObject({ outcome: 'uncertain' });

    vi.spyOn(provider, 'writeFile').mockRejectedValueOnce(Object.assign(new Error('EISDIR'), { code: 'EISDIR' }));
    await expect(
      applyEntryWithPrimitives(provider, { op: 'write', path: 'a.txt', data: bytes('a') }),
    ).resolves.toMatchObject({ outcome: 'failed' });
  });

  it('should report a mode that did not land on written bytes as uncertain', async () => {
    const provider = Object.assign(new MemoryProvider(), {
      setFileMode: async (): Promise<void> => {
        throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
      },
    });

    const receipt = await applyEntryWithPrimitives(provider, {
      op: 'write',
      path: 'run.sh',
      data: bytes('#!/bin/sh'),
      mode: '100755',
    });

    expect(receipt.outcome).toBe('uncertain');
    await expect(provider.readFile('run.sh', 'utf8')).resolves.toBe('#!/bin/sh');
  });

  it('should refuse a delete of the wrong kind and a missing path before touching anything', async () => {
    const provider = new MemoryProvider();
    await provider.mkdir('dir');

    await expect(
      applyEntryWithPrimitives(provider, { op: 'delete', path: 'dir', kind: 'file' }),
    ).resolves.toMatchObject({ outcome: 'failed', error: { code: 'EISDIR' } });
    await expect(applyEntryWithPrimitives(provider, { op: 'delete', path: 'nothing' })).resolves.toMatchObject({
      outcome: 'failed',
      error: { code: 'ENOENT' },
    });
    await expect(provider.exists('dir')).resolves.toBe(true);
  });

  it('should remove a directory tree with a recursive delete', async () => {
    const provider = new MemoryProvider();
    await provider.mkdir('dir/nested', { recursive: true });
    await provider.writeFile('dir/nested/a.txt', 'a');
    await provider.writeFile('dir/b.txt', 'b');

    await expect(
      applyEntryWithPrimitives(provider, { op: 'delete', path: 'dir', recursive: true }),
    ).resolves.toMatchObject({ outcome: 'applied', kind: 'dir' });
    await expect(provider.exists('dir')).resolves.toBe(false);
  });

  it('should report a recursive delete that failed partway as uncertain, even on a refusal', async () => {
    const provider = new MemoryProvider();
    await provider.mkdir('dir');
    await provider.writeFile('dir/a.txt', 'a');
    vi.spyOn(provider, 'rmdir').mockRejectedValueOnce(Object.assign(new Error('ENOTEMPTY'), { code: 'ENOTEMPTY' }));

    await expect(
      applyEntryWithPrimitives(provider, { op: 'delete', path: 'dir', recursive: true }),
    ).resolves.toMatchObject({ outcome: 'uncertain', error: { code: 'ENOTEMPTY' } });
    await expect(provider.exists('dir/a.txt')).resolves.toBe(false);
  });

  it('should refuse a move onto a taken path unless it replaces a file with a file', async () => {
    const provider = new MemoryProvider();
    await provider.writeFile('from.txt', 'new');
    await provider.writeFile('to.txt', 'old');

    await expect(
      applyEntryWithPrimitives(provider, { op: 'move', from: 'from.txt', to: 'to.txt' }),
    ).resolves.toMatchObject({ outcome: 'failed', error: { code: 'EEXIST' } });
    await expect(
      applyEntryWithPrimitives(provider, { op: 'move', from: 'from.txt', to: 'to.txt', replace: true }),
    ).resolves.toMatchObject({ outcome: 'applied', kind: 'file' });
    await expect(provider.readFile('to.txt', 'utf8')).resolves.toBe('new');
  });

  it('should answer a recursive mkdir of an existing directory as applied without creating it', async () => {
    const provider = new MemoryProvider();
    await provider.mkdir('dir');
    const mkdir = vi.spyOn(provider, 'mkdir');

    await expect(applyEntryWithPrimitives(provider, { op: 'mkdir', path: 'dir', recursive: true })).resolves.toEqual({
      outcome: 'applied',
      kind: 'dir',
      created: false,
    });
    expect(mkdir).not.toHaveBeenCalled();
  });
});

describe('applyBatchWithPrimitives', () => {
  it('should apply appends to one path in entry order while other entries run beside them', async () => {
    const provider = new MemoryProvider();
    const entries: BatchEntry[] = [
      { op: 'append', path: 'log', data: bytes('a') },
      { op: 'write', path: 'x', data: bytes('x') },
      { op: 'append', path: 'log', data: bytes('b') },
      { op: 'append', path: 'log', data: bytes('c') },
    ];

    const receipts = await applyBatchWithPrimitives(provider, entries);

    expect(receipts.every(({ outcome }) => outcome === 'applied')).toBe(true);
    await expect(provider.readFile('log', 'utf8')).resolves.toBe('abc');
  });
});
