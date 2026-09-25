import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeFsProvider } from '#backend/node/provider.js';
import { streamChunkSize } from '#backend/stream-utils.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => fs.rm(directory, { recursive: true })));
});

describe('NodeFsProvider readFileStream', () => {
  it('reads bounded chunks and exact ranges from a real large disk file', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tau-node-stream-'));
    temporaryDirectories.push(directory);
    const bytes = new Uint8Array(streamChunkSize * 3 + 17).map((_, index) => index % 251);
    await fs.writeFile(path.join(directory, 'large.bin'), bytes);
    const provider = new NodeFsProvider(directory);
    const reader = provider.readFileStream('large.bin', { position: 11, length: streamChunkSize + 5 }).getReader();
    const first = await reader.read();
    const second = await reader.read();
    const done = await reader.read();
    expect(first.value?.byteLength).toBe(streamChunkSize);
    expect(second.value?.byteLength).toBe(5);
    expect(done.done).toBe(true);
    expect(first.value).toEqual(bytes.slice(11, 11 + streamChunkSize));
  });

  it('handles zero length, offset beyond EOF, overflow, abort, and cancel', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tau-node-stream-'));
    temporaryDirectories.push(directory);
    await fs.writeFile(path.join(directory, 'file.bin'), new Uint8Array([1, 2, 3]));
    const provider = new NodeFsProvider(directory);
    const emptyRange = await provider.readFileStream('file.bin', { length: 0 }).getReader().read();
    const beyondEnd = await provider.readFileStream('file.bin', { position: 20 }).getReader().read();
    expect(emptyRange.done).toBe(true);
    expect(beyondEnd.done).toBe(true);
    expect(() => provider.readFileStream('file.bin', { position: Number.MAX_SAFE_INTEGER, length: 1 })).toThrow(
      RangeError,
    );
    const abort = new AbortController();
    abort.abort();
    await expect(
      provider.readFileStream('file.bin', { signal: abort.signal }).getReader().read(),
    ).rejects.toMatchObject({ name: 'AbortError' });
    const reader = provider.readFileStream('file.bin').getReader();
    await reader.cancel();
    await expect(reader.closed).resolves.toBeUndefined();
  });

  it('does not open or allocate the file before consumer demand', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tau-node-stream-'));
    temporaryDirectories.push(directory);
    const file = path.join(directory, 'lazy.bin');
    await fs.writeFile(file, new Uint8Array([1, 2, 3]));
    const provider = new NodeFsProvider(directory);
    const stream = provider.readFileStream('lazy.bin');
    await fs.rename(file, path.join(directory, 'moved.bin'));
    await expect(stream.getReader().read()).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('closes an asynchronously opened handle when cancellation races acquisition', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tau-node-stream-'));
    temporaryDirectories.push(directory);
    await fs.writeFile(path.join(directory, 'race.bin'), new Uint8Array([1, 2, 3]));
    const nativeOpen = fs.open.bind(fs);
    let releaseOpen: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseOpen = resolve;
    });
    let close: ReturnType<typeof vi.fn> | undefined;
    const open = vi.spyOn(fs, 'open').mockImplementation(async (...arguments_) => {
      await gate;
      const handle = await Reflect.apply(nativeOpen, fs, arguments_);
      close = vi.spyOn(handle, 'close');
      return handle;
    });
    const reader = new NodeFsProvider(directory).readFileStream('race.bin').getReader();
    const read = reader.read();
    await vi.waitFor(() => {
      expect(open).toHaveBeenCalledOnce();
    });
    const cancel = reader.cancel();
    releaseOpen?.();
    await Promise.all([read, cancel]);
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes an idle handle as soon as its signal aborts', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tau-node-stream-'));
    temporaryDirectories.push(directory);
    await fs.writeFile(path.join(directory, 'abort.bin'), new Uint8Array(streamChunkSize + 1));
    const nativeOpen = fs.open.bind(fs);
    let releaseClose: (() => void) | undefined;
    const closeGate = new Promise<void>((resolve) => {
      releaseClose = resolve;
    });
    let close: ReturnType<typeof vi.fn> | undefined;
    vi.spyOn(fs, 'open').mockImplementation(async (...arguments_) => {
      const handle = await Reflect.apply(nativeOpen, fs, arguments_);
      const nativeClose = handle.close.bind(handle);
      close = vi.spyOn(handle, 'close').mockImplementation(async () => {
        await closeGate;
        await nativeClose();
      });
      return handle;
    });
    const abort = new AbortController();
    const reader = new NodeFsProvider(directory).readFileStream('abort.bin', { signal: abort.signal }).getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    abort.abort();
    let terminal = false;
    const observeTerminal = async (): Promise<void> => {
      try {
        await reader.closed;
      } catch {
        terminal = true;
      }
    };
    const observed = observeTerminal();
    await Promise.resolve();
    expect(terminal).toBe(false);
    releaseClose?.();
    await observed;
    await expect(reader.closed).rejects.toMatchObject({ name: 'AbortError' });
    expect(close).toHaveBeenCalledOnce();
  });
});
