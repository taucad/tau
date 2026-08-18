import { describe, expect, it, vi } from 'vitest';

import { slotIndex, slotInt32Length, syncError, syncState } from '#sync/sync-fs-protocol.js';
import { createSyncFsServerHandler } from '#sync/sync-fs-server.js';

describe('createSyncFsServerHandler', () => {
  it('writes readFile payload and signals ready', async () => {
    const slotSab = new SharedArrayBuffer(16);
    const arenaSab = new SharedArrayBuffer(256);
    const int32 = new Int32Array(slotSab, 0, slotInt32Length);
    const arena = new Uint8Array(arenaSab, 0, arenaSab.byteLength) as unknown as Uint8Array<ArrayBuffer>;
    const workspace = {
      readFileBytes: async () => new Uint8Array([72, 105]),
      stat: async () => ({ mtimeMs: 1, isDirectory: false }),
      listDirectories: async () => [],
    };
    const run = createSyncFsServerHandler({ workspace, int32, arena });
    Atomics.store(int32, slotIndex.requestId, 1);
    Atomics.store(int32, slotIndex.state, syncState.pending);

    await run({ tau: 'sync-fs', op: 'readFile', requestId: 1, path: '/a.txt' });

    expect(Atomics.load(int32, slotIndex.state)).toBe(syncState.ready);
    expect(Atomics.load(int32, slotIndex.errorCode)).toBe(syncError.ok);
    expect(Atomics.load(int32, slotIndex.payloadLength)).toBe(2);
    expect(arena[0]).toBe(72);
    expect(arena[1]).toBe(105);
  });

  it('returns notFound for missing statMtimeVersion', async () => {
    const slotSab = new SharedArrayBuffer(16);
    const arenaSab = new SharedArrayBuffer(64);
    const int32 = new Int32Array(slotSab, 0, slotInt32Length);
    const arena = new Uint8Array(arenaSab, 0, arenaSab.byteLength) as unknown as Uint8Array<ArrayBuffer>;
    const enoent = Object.assign(new Error('nope'), { code: 'ENOENT' });
    const workspace = {
      readFileBytes: async () => new Uint8Array(),
      stat: async () => {
        throw enoent;
      },
      listDirectories: async () => [],
    };
    const run = createSyncFsServerHandler({ workspace, int32, arena });
    Atomics.store(int32, slotIndex.requestId, 2);
    Atomics.store(int32, slotIndex.state, syncState.pending);

    await run({ tau: 'sync-fs', op: 'statMtimeVersion', requestId: 2, path: '/missing.ts' });

    expect(Atomics.load(int32, slotIndex.errorCode)).toBe(syncError.notFound);
  });

  it('returns tooLarge when arena cannot hold file', async () => {
    const slotSab = new SharedArrayBuffer(16);
    const arenaSab = new SharedArrayBuffer(2);
    const int32 = new Int32Array(slotSab, 0, slotInt32Length);
    const arena = new Uint8Array(arenaSab, 0, arenaSab.byteLength) as unknown as Uint8Array<ArrayBuffer>;
    const workspace = {
      readFileBytes: async () => new Uint8Array([1, 2, 3]),
      stat: async () => ({ mtimeMs: 1, isDirectory: false }),
      listDirectories: async () => [],
    };
    const run = createSyncFsServerHandler({ workspace, int32, arena });
    Atomics.store(int32, slotIndex.requestId, 3);
    Atomics.store(int32, slotIndex.state, syncState.pending);

    await run({ tau: 'sync-fs', op: 'readFile', requestId: 3, path: '/big.bin' });

    expect(Atomics.load(int32, slotIndex.errorCode)).toBe(syncError.tooLarge);
  });

  it('rejects stale request id', async () => {
    const slotSab = new SharedArrayBuffer(16);
    const arenaSab = new SharedArrayBuffer(64);
    const int32 = new Int32Array(slotSab, 0, slotInt32Length);
    const arena = new Uint8Array(arenaSab, 0, arenaSab.byteLength) as unknown as Uint8Array<ArrayBuffer>;
    const workspace = {
      readFileBytes: async () => new Uint8Array([1]),
      stat: async () => ({ mtimeMs: 1, isDirectory: false }),
      listDirectories: async () => [],
    };
    const run = createSyncFsServerHandler({ workspace, int32, arena });
    Atomics.store(int32, slotIndex.requestId, 10);

    await run({ tau: 'sync-fs', op: 'readFile', requestId: 99, path: '/x' });

    expect(Atomics.load(int32, slotIndex.errorCode)).toBe(syncError.ok);
    expect(Atomics.load(int32, slotIndex.state)).toBe(syncState.idle);
  });

  it('does not write stale across-await payload bytes into a newer request arena', async () => {
    const slotSab = new SharedArrayBuffer(16);
    const arenaSab = new SharedArrayBuffer(64);
    const int32 = new Int32Array(slotSab, 0, slotInt32Length);
    const arena = new Uint8Array(arenaSab, 0, arenaSab.byteLength) as unknown as Uint8Array<ArrayBuffer>;
    const firstRead = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    const readFileBytes = vi
      .fn()
      .mockReturnValueOnce(firstRead.promise)
      .mockResolvedValue(new Uint8Array([2]));
    const workspace = {
      readFileBytes,
      stat: async () => ({ mtimeMs: 1, isDirectory: false }),
      listDirectories: async () => [],
    };
    const run = createSyncFsServerHandler({ workspace, int32, arena });
    Atomics.store(int32, slotIndex.requestId, 1);
    Atomics.store(int32, slotIndex.state, syncState.pending);

    const staleRun = run({ tau: 'sync-fs', op: 'readFile', requestId: 1, path: '/old.ts' });
    await vi.waitFor(() => {
      expect(readFileBytes).toHaveBeenCalledOnce();
    });
    Atomics.store(int32, slotIndex.state, syncState.idle);
    Atomics.store(int32, slotIndex.requestId, 2);
    Atomics.store(int32, slotIndex.state, syncState.pending);
    arena.fill(7);
    firstRead.resolve(new Uint8Array([1]));
    await staleRun;

    expect(Atomics.load(int32, slotIndex.state)).toBe(syncState.pending);
    expect(arena[0]).toBe(7);

    await run({ tau: 'sync-fs', op: 'readFile', requestId: 2, path: '/new.ts' });
    expect(Atomics.load(int32, slotIndex.state)).toBe(syncState.ready);
    expect(arena[0]).toBe(2);
  });

  it('returns absent for fileExists ENOENT', async () => {
    const slotSab = new SharedArrayBuffer(16);
    const arenaSab = new SharedArrayBuffer(64);
    const int32 = new Int32Array(slotSab, 0, slotInt32Length);
    const arena = new Uint8Array(arenaSab, 0, arenaSab.byteLength) as unknown as Uint8Array<ArrayBuffer>;
    const enoent = Object.assign(new Error('nope'), { code: 'ENOENT' });
    const workspace = {
      readFileBytes: async () => new Uint8Array(),
      stat: async () => {
        throw enoent;
      },
      listDirectories: async () => [],
    };
    const run = createSyncFsServerHandler({ workspace, int32, arena });
    Atomics.store(int32, slotIndex.requestId, 11);
    Atomics.store(int32, slotIndex.state, syncState.pending);

    await run({ tau: 'sync-fs', op: 'fileExists', requestId: 11, path: '/missing.ts' });

    expect(Atomics.load(int32, slotIndex.errorCode)).toBe(syncError.absent);
    expect(Atomics.load(int32, slotIndex.payloadLength)).toBe(0);
  });

  it('returns absent for fileExists when path is a directory', async () => {
    const slotSab = new SharedArrayBuffer(16);
    const arenaSab = new SharedArrayBuffer(64);
    const int32 = new Int32Array(slotSab, 0, slotInt32Length);
    const arena = new Uint8Array(arenaSab, 0, arenaSab.byteLength) as unknown as Uint8Array<ArrayBuffer>;
    const workspace = {
      readFileBytes: async () => new Uint8Array(),
      stat: async () => ({ mtimeMs: 1, isDirectory: true }),
      listDirectories: async () => [],
    };
    const run = createSyncFsServerHandler({ workspace, int32, arena });
    Atomics.store(int32, slotIndex.requestId, 12);
    Atomics.store(int32, slotIndex.state, syncState.pending);

    await run({ tau: 'sync-fs', op: 'fileExists', requestId: 12, path: '/dir' });

    expect(Atomics.load(int32, slotIndex.errorCode)).toBe(syncError.absent);
  });

  it('readFile returns ok with zero length for empty file', async () => {
    const slotSab = new SharedArrayBuffer(16);
    const arenaSab = new SharedArrayBuffer(64);
    const int32 = new Int32Array(slotSab, 0, slotInt32Length);
    const arena = new Uint8Array(arenaSab, 0, arenaSab.byteLength) as unknown as Uint8Array<ArrayBuffer>;
    const workspace = {
      readFileBytes: async () => new Uint8Array(0),
      stat: async () => ({ mtimeMs: 1, isDirectory: false }),
      listDirectories: async () => [],
    };
    const run = createSyncFsServerHandler({ workspace, int32, arena });
    Atomics.store(int32, slotIndex.requestId, 13);
    Atomics.store(int32, slotIndex.state, syncState.pending);

    await run({ tau: 'sync-fs', op: 'readFile', requestId: 13, path: '/empty.txt' });

    expect(Atomics.load(int32, slotIndex.errorCode)).toBe(syncError.ok);
    expect(Atomics.load(int32, slotIndex.payloadLength)).toBe(0);
  });
});
