import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileSystemAccessProvider } from '#backend/fs-access-provider.js';
import { createMockRootHandle } from '#testing/mock-handle-factory.js';

describe('FileSystemAccessProvider', () => {
  let provider: FileSystemAccessProvider;
  let rootHandle: ReturnType<typeof createMockRootHandle>;

  beforeEach(() => {
    rootHandle = createMockRootHandle();
    provider = new FileSystemAccessProvider(rootHandle as unknown as FileSystemDirectoryHandle);
  });

  // ---------------------------------------------------------------------------
  // provider metadata
  // ---------------------------------------------------------------------------

  describe('provider metadata', () => {
    it('should have id "webaccess"', () => {
      expect(provider.id).toBe('webaccess');
    });

    it('should report persistent, writable, non-quotaBased capabilities', () => {
      expect(provider.capabilities).toEqual({
        persistent: true,
        writable: true,
        quotaBased: false,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // writeFile + readFile round-trip
  // ---------------------------------------------------------------------------

  describe('writeFile + readFile round-trip', () => {
    it('should round-trip a string via utf8 encoding', async () => {
      await provider.writeFile('hello.txt', 'world');
      const content = await provider.readFile('hello.txt', 'utf8');
      expect(content).toBe('world');
    });

    it('should round-trip binary data', async () => {
      const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      await provider.writeFile('bin.dat', data);
      const result = await provider.readFile('bin.dat');
      expect(new Uint8Array(result)).toEqual(data);
    });

    it('should overwrite existing file content', async () => {
      await provider.writeFile('file.txt', 'first');
      await provider.writeFile('file.txt', 'second');
      const content = await provider.readFile('file.txt', 'utf8');
      expect(content).toBe('second');
    });

    it('should handle empty string writes', async () => {
      await provider.writeFile('empty.txt', '');
      const content = await provider.readFile('empty.txt', 'utf8');
      expect(content).toBe('');
    });

    it('should auto-create parent directories for nested paths', async () => {
      await provider.writeFile('a/b/c/file.txt', 'nested');
      const result = await provider.readFile('a/b/c/file.txt', 'utf8');
      expect(result).toBe('nested');
    });
  });

  // ---------------------------------------------------------------------------
  // readFile errors
  // ---------------------------------------------------------------------------

  describe('readFile errors', () => {
    it('should throw ENOENT for non-existent file', async () => {
      await expect(provider.readFile('missing.txt')).rejects.toThrow('ENOENT');
    });

    it('should throw ENOENT for non-existent file with encoding', async () => {
      await expect(provider.readFile('missing.txt', 'utf8')).rejects.toThrow('ENOENT');
    });
  });

  // ---------------------------------------------------------------------------
  // readdir
  // ---------------------------------------------------------------------------

  describe('readdir', () => {
    it('should list files in root directory', async () => {
      await provider.writeFile('a.txt', 'a');
      await provider.writeFile('b.txt', 'b');
      const entries = await provider.readdir('');
      expect(entries.sort()).toEqual(['a.txt', 'b.txt']);
    });

    it('should list files in a subdirectory', async () => {
      await provider.mkdir('sub');
      await provider.writeFile('sub/x.txt', 'x');
      await provider.writeFile('sub/y.txt', 'y');
      const entries = await provider.readdir('sub');
      expect(entries.sort()).toEqual(['x.txt', 'y.txt']);
    });

    it('should return empty array for empty directory', async () => {
      await provider.mkdir('empty');
      const entries = await provider.readdir('empty');
      expect(entries).toEqual([]);
    });

    it('should throw for non-existent directory', async () => {
      await expect(provider.readdir('nonexistent')).rejects.toThrow('ENOENT');
    });

    it('should exclude Chromium swap entries without hiding near-miss user files', async () => {
      await provider.writeFile('main.ts.crswap', 'swap');
      await provider.writeFile('main.ts.1.crswap', 'swap collision');
      await provider.writeFile('notes.crswap.txt', 'user content');
      await provider.writeFile('.DS_Store', 'real host metadata');
      await provider.writeFile('main.ts', 'source');

      await expect(provider.readdir('')).resolves.toEqual(['notes.crswap.txt', '.DS_Store', 'main.ts']);
      await expect(provider.readdirWithStats('')).resolves.toEqual([
        expect.objectContaining({ name: 'notes.crswap.txt', type: 'file' }),
        expect.objectContaining({ name: '.DS_Store', type: 'file' }),
        expect.objectContaining({ name: 'main.ts', type: 'file' }),
      ]);
      await expect(provider.readFile('main.ts.crswap', 'utf8')).resolves.toBe('swap');
      await expect(provider.readFile('.DS_Store', 'utf8')).resolves.toBe('real host metadata');
    });
  });

  // ---------------------------------------------------------------------------
  // stat
  // ---------------------------------------------------------------------------

  describe('stat', () => {
    it('should return correct stats for a file', async () => {
      await provider.writeFile('sized.txt', 'hello');
      const stats = await provider.stat('sized.txt');
      expect(stats.size).toBe(5);
      expect(stats.type).toBe('file');
    });

    it('should return correct stats for a directory', async () => {
      await provider.mkdir('dir');
      const stats = await provider.stat('dir');
      expect(stats.type).toBe('dir');
    });

    it('should return correct stats for root', async () => {
      const stats = await provider.stat('');
      expect(stats.type).toBe('dir');
    });

    it('should throw for non-existent path', async () => {
      await expect(provider.stat('nope')).rejects.toThrow('ENOENT');
    });
  });

  // ---------------------------------------------------------------------------
  // mkdir
  // ---------------------------------------------------------------------------

  describe('mkdir', () => {
    it('should create a directory', async () => {
      await provider.mkdir('newdir');
      const stats = await provider.stat('newdir');
      expect(stats.type).toBe('dir');
    });

    it('should create nested directories with recursive option', async () => {
      await provider.mkdir('a/b/c', { recursive: true });
      const stats = await provider.stat('a/b/c');
      expect(stats.type).toBe('dir');
    });
  });

  // ---------------------------------------------------------------------------
  // unlink
  // ---------------------------------------------------------------------------

  describe('unlink', () => {
    it('should delete a file', async () => {
      await provider.writeFile('delete-me.txt', 'gone');
      await provider.unlink('delete-me.txt');
      expect(await provider.exists('delete-me.txt')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // rmdir
  // ---------------------------------------------------------------------------

  describe('rmdir', () => {
    it('should remove an empty directory', async () => {
      await provider.mkdir('removable');
      await provider.rmdir('removable');
      expect(await provider.exists('removable')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // rename
  // ---------------------------------------------------------------------------

  describe('rename', () => {
    it('should rename a file by copying content and removing the original', async () => {
      await provider.writeFile('old.txt', 'content');
      await provider.rename('old.txt', 'new.txt');
      expect(await provider.exists('old.txt')).toBe(false);
      const content = await provider.readFile('new.txt', 'utf8');
      expect(content).toBe('content');
    });

    it('should throw when source does not exist', async () => {
      await expect(provider.rename('missing.txt', 'target.txt')).rejects.toThrow('ENOENT');
    });

    it('should remove a failed new file and only the parent directories it created', async () => {
      const originalGetDirectoryHandle = rootHandle.getDirectoryHandle.bind(rootHandle);
      const writeError = new Error('write failed');
      const writable = {
        write: vi.fn().mockRejectedValue(writeError),
        close: vi.fn().mockResolvedValue(undefined),
        abort: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(rootHandle, 'getDirectoryHandle').mockImplementation(async (name, options) => {
        const directory = await originalGetDirectoryHandle(name, options);
        if (name === 'created' && options?.create) {
          const originalGetFileHandle = directory.getFileHandle.bind(directory);
          vi.spyOn(directory, 'getFileHandle').mockImplementation(async (fileName, fileOptions) => {
            const handle = await originalGetFileHandle(fileName, fileOptions);
            if (fileName === 'failed.txt' && fileOptions?.create) {
              vi.spyOn(handle, 'createWritable').mockResolvedValue(
                writable as unknown as Awaited<ReturnType<typeof handle.createWritable>>,
              );
            }
            return handle;
          });
        }
        return directory;
      });

      await expect(provider.writeFile('created/failed.txt', 'new')).rejects.toThrow(writeError);

      expect(writable.abort).toHaveBeenCalledWith(writeError);
      await expect(provider.exists('created/failed.txt')).resolves.toBe(false);
      await expect(provider.exists('created')).resolves.toBe(false);
    });

    it('should preserve a pre-existing parent when a new file write fails', async () => {
      await provider.mkdir('existing');
      const existing = await rootHandle.getDirectoryHandle('existing');
      const originalGetFileHandle = existing.getFileHandle.bind(existing);
      vi.spyOn(existing, 'getFileHandle').mockImplementation(async (name, options) => {
        const handle = await originalGetFileHandle(name, options);
        if (name === 'failed.txt' && options?.create) {
          vi.spyOn(handle, 'createWritable').mockRejectedValue(new Error('create writable failed'));
        }
        return handle;
      });

      await expect(provider.writeFile('existing/failed.txt', 'new')).rejects.toThrow('create writable failed');

      await expect(provider.exists('existing/failed.txt')).resolves.toBe(false);
      await expect(provider.stat('existing')).resolves.toMatchObject({ type: 'dir' });
    });

    it('should remove a partial directory-copy destination and preserve the source', async () => {
      await provider.mkdir('source');
      await provider.writeFile('source/a.ts', 'a');
      await provider.writeFile('source/b.ts', 'b');
      const writeError = new Error('copy write failed');
      const originalWriteFile = provider.writeFile.bind(provider);
      vi.spyOn(provider, 'writeFile').mockImplementation(async (path, data) => {
        if (path === 'new-parent/destination/b.ts') {
          throw writeError;
        }
        await originalWriteFile(path, data);
      });

      await expect(provider.rename('source', 'new-parent/destination')).rejects.toThrow(writeError);
      await expect(provider.readFile('source/a.ts', 'utf8')).resolves.toBe('a');
      await expect(provider.readFile('source/b.ts', 'utf8')).resolves.toBe('b');
      await expect(provider.exists('new-parent/destination')).resolves.toBe(false);
      await expect(provider.exists('new-parent')).resolves.toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // exists
  // ---------------------------------------------------------------------------

  describe('exists', () => {
    it('should return true for existing file', async () => {
      await provider.writeFile('exists.txt', 'yes');
      expect(await provider.exists('exists.txt')).toBe(true);
    });

    it('should return true for existing directory', async () => {
      await provider.mkdir('exists-dir');
      expect(await provider.exists('exists-dir')).toBe(true);
    });

    it('should return false for non-existent path', async () => {
      expect(await provider.exists('nothing')).toBe(false);
    });

    it('should propagate permission failures instead of reporting absence', async () => {
      vi.spyOn(rootHandle, 'getFileHandle').mockRejectedValueOnce(
        new DOMException('Permission denied', 'NotAllowedError'),
      );
      await expect(provider.exists('denied')).rejects.toMatchObject({ name: 'NotAllowedError' });
    });
  });

  // ---------------------------------------------------------------------------
  // handle resolution
  // ---------------------------------------------------------------------------

  describe('handle resolution', () => {
    it('should resolve nested path segments to directory handles', async () => {
      await provider.mkdir('a/b/c', { recursive: true });
      await provider.writeFile('a/b/c/file.txt', 'deep');
      const content = await provider.readFile('a/b/c/file.txt', 'utf8');
      expect(content).toBe('deep');
    });

    it('should throw when intermediate directory does not exist', async () => {
      await expect(provider.readFile('nonexistent/dir/file.txt')).rejects.toThrow('ENOENT');
    });
  });

  describe('directory handle cache', () => {
    it('should cache handles for repeated directory resolution', async () => {
      await provider.mkdir('cached/nested', { recursive: true });
      await provider.writeFile('cached/nested/a.txt', 'a');

      const content1 = await provider.readFile('cached/nested/a.txt', 'utf8');
      const content2 = await provider.readFile('cached/nested/a.txt', 'utf8');

      expect(content1).toBe('a');
      expect(content2).toBe('a');
    });

    it('should invalidate cache on rmdir', async () => {
      await provider.mkdir('removeme');
      await provider.readdir('removeme');
      await provider.rmdir('removeme');
      expect(await provider.exists('removeme')).toBe(false);
    });

    it('should invalidate cache on rename', async () => {
      await provider.writeFile('old-file.txt', 'data');
      const read1 = await provider.readFile('old-file.txt', 'utf8');
      expect(read1).toBe('data');

      await provider.rename('old-file.txt', 'new-file.txt');
      const read2 = await provider.readFile('new-file.txt', 'utf8');
      expect(read2).toBe('data');
    });

    it('should clear sibling-stale directory handles on refresh', async () => {
      await provider.mkdir('cached');
      await expect(provider.readdir('cached')).resolves.toEqual([]);

      await rootHandle.removeEntry('cached', { recursive: true });
      const replacement = await rootHandle.getDirectoryHandle('cached', { create: true });
      const replacementFile = await replacement.getFileHandle('new.txt', { create: true });
      const writable = await replacementFile.createWritable();
      await writable.write(new TextEncoder().encode('new'));
      await writable.close();

      await expect(provider.readdir('cached')).resolves.toEqual([]);
      await provider.refresh();
      await expect(provider.readdir('cached')).resolves.toEqual(['new.txt']);
    });

    it('keeps handles outside the named prefixes when refresh is scoped', async () => {
      const replaceDirectory = async (name: string): Promise<void> => {
        await rootHandle.removeEntry(name, { recursive: true });
        const replacement = await rootHandle.getDirectoryHandle(name, { create: true });
        await replacement.getFileHandle('new.txt', { create: true });
      };
      await provider.mkdir('scoped/nested', { recursive: true });
      await provider.mkdir('untouched');
      await expect(provider.readdir('scoped/nested')).resolves.toEqual([]);
      await expect(provider.readdir('untouched')).resolves.toEqual([]);

      await replaceDirectory('scoped');
      await replaceDirectory('untouched');
      await provider.refresh(['scoped']);

      await expect(provider.readdir('scoped')).resolves.toEqual(['new.txt']);
      await expect(provider.readdir('untouched')).resolves.toEqual([]);
    });
  });

  describe('readFileStream', () => {
    it('rejects invalid ranges before resolving a file handle', () => {
      const resolveHandle = vi.spyOn(rootHandle, 'getFileHandle');

      expect(() => provider.readFileStream('stream.bin', { length: Number.POSITIVE_INFINITY })).toThrow(RangeError);
      expect(resolveHandle).not.toHaveBeenCalled();
    });

    it('should read one native chunk at a time and cancel the native reader', async () => {
      await provider.writeFile('stream.bin', 'seed');
      const handle = await rootHandle.getFileHandle('stream.bin');
      let index = 0;
      const read = vi.fn(async (): Promise<ReadableStreamReadResult<Uint8Array<ArrayBuffer>>> => {
        const chunks = [new Uint8Array([1]), new Uint8Array([2])];
        const value = chunks[index++];
        return value === undefined ? { done: true, value: undefined } : { done: false, value };
      });
      const cancel = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(handle, 'getFile').mockResolvedValue({
        size: 2,
        stream: () => ({ getReader: () => ({ read, cancel }) }),
      } as unknown as File);
      vi.spyOn(rootHandle, 'getFileHandle').mockResolvedValue(handle);

      const stream = provider.readFileStream('stream.bin');
      await vi.waitFor(() => {
        expect(read).toHaveBeenCalledTimes(1);
      });

      const consumer = stream.getReader();
      await expect(consumer.read()).resolves.toEqual({ done: false, value: new Uint8Array([1]) });
      await vi.waitFor(() => {
        expect(read).toHaveBeenCalledTimes(2);
      });
      await consumer.cancel('stopped');

      expect(cancel).toHaveBeenCalledWith('stopped');
    });

    it('should cancel a pending native read when aborted after the first chunk', async () => {
      await provider.writeFile('abort.bin', 'seed');
      const handle = await rootHandle.getFileHandle('abort.bin');
      const pendingRead = Promise.withResolvers<ReadableStreamReadResult<Uint8Array<ArrayBuffer>>>();
      const read = vi
        .fn<() => Promise<ReadableStreamReadResult<Uint8Array<ArrayBuffer>>>>()
        .mockResolvedValueOnce({ done: false, value: new Uint8Array([1]) })
        .mockReturnValueOnce(pendingRead.promise);
      const cancel = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(handle, 'getFile').mockResolvedValue({
        size: 2,
        stream: () => ({ getReader: () => ({ read, cancel }) }),
      } as unknown as File);
      vi.spyOn(rootHandle, 'getFileHandle').mockResolvedValue(handle);
      const abort = new AbortController();

      const consumer = provider.readFileStream('abort.bin', { signal: abort.signal }).getReader();
      await expect(consumer.read()).resolves.toEqual({ done: false, value: new Uint8Array([1]) });
      await vi.waitFor(() => {
        expect(read).toHaveBeenCalledTimes(2);
      });
      const next = consumer.read();
      abort.abort();

      await expect(next).rejects.toMatchObject({ name: 'AbortError' });
      expect(cancel).toHaveBeenCalledOnce();
      pendingRead.resolve({ done: true, value: undefined });
    });

    it('should cancel the native reader when aborted during stream initialization', async () => {
      await provider.writeFile('initializing.bin', 'seed');
      const handle = await rootHandle.getFileHandle('initializing.bin');
      const pendingFile = Promise.withResolvers<File>();
      const cancel = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(handle, 'getFile').mockReturnValue(pendingFile.promise);
      vi.spyOn(rootHandle, 'getFileHandle').mockResolvedValue(handle);
      const abort = new AbortController();

      const consumer = provider.readFileStream('initializing.bin', { signal: abort.signal }).getReader();
      const read = consumer.read();
      abort.abort();

      await expect(read).rejects.toMatchObject({ name: 'AbortError' });
      pendingFile.resolve({
        size: 1,
        stream: () => ({ getReader: () => ({ read: vi.fn(), cancel }) }),
      } as unknown as File);
      await vi.waitFor(() => {
        expect(cancel).toHaveBeenCalledOnce();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // metadata-only stat / readdirWithStats (P1, P2)
  // ---------------------------------------------------------------------------

  describe('metadata-only listing', () => {
    /**
     * Root handle whose files declare a size far larger than the bytes they can
     * materialise, so any full-content read is both observable and impossible
     * to mistake for a metadata read.
     *
     * @param names - Basenames to expose as binary children.
     * @returns The fake root handle plus the read/concurrency counters.
     */
    const createInstrumentedRoot = (names: readonly string[]) => {
      const counters = { fullReads: 0, sliceBytes: 0, inFlight: 0, maxInFlight: 0 };
      const head = new Uint8Array(1024);
      head[3] = 0x00;
      const makeFileHandle = (name: string) => ({
        kind: 'file',
        name,
        getFile: async () => {
          counters.inFlight++;
          counters.maxInFlight = Math.max(counters.maxInFlight, counters.inFlight);
          await new Promise((resolve) => {
            setTimeout(resolve, 1);
          });
          counters.inFlight--;
          return {
            size: 50_000_000,
            lastModified: 4242,
            slice: (start: number, end: number) => ({
              arrayBuffer: async () => {
                counters.sliceBytes += end - start;
                return head.slice(start, end).buffer;
              },
            }),
            arrayBuffer: async () => {
              counters.fullReads++;
              return new ArrayBuffer(0);
            },
          };
        },
      });
      const root = {
        kind: 'directory',
        name: 'root',
        async *entries() {
          for (const name of names) {
            yield [name, makeFileHandle(name)] as [string, unknown];
          }
        },
        getFileHandle: async (name: string) => {
          if (!names.includes(name)) {
            throw new DOMException(`File not found: ${name}`, 'NotFoundError');
          }
          return makeFileHandle(name);
        },
        getDirectoryHandle: async (name: string) => {
          throw new DOMException(`Directory not found: ${name}`, 'NotFoundError');
        },
      };
      return { root: root as unknown as FileSystemDirectoryHandle, counters };
    };

    it('should stat a huge file without reading its contents', async () => {
      const { root, counters } = createInstrumentedRoot(['huge.glb']);
      const instrumented = new FileSystemAccessProvider(root);

      await expect(instrumented.stat('huge.glb')).resolves.toEqual({
        type: 'file',
        size: 50_000_000,
        mtimeMs: 4242,
        contentKind: 'binary',
      });
      expect(counters.fullReads).toBe(0);
      expect(counters.sliceBytes).toBeLessThanOrEqual(512);
    });

    it('should list stats without reading contents and with bounded concurrency', async () => {
      const names = Array.from({ length: 64 }, (_, index) => `asset-${index}.glb`);
      const { root, counters } = createInstrumentedRoot(names);
      const instrumented = new FileSystemAccessProvider(root);

      const entries = await instrumented.readdirWithStats('');

      expect(entries).toHaveLength(64);
      expect(entries.map((entry) => entry.name)).toEqual(names);
      expect(entries[0]).toEqual({
        name: 'asset-0.glb',
        type: 'file',
        size: 50_000_000,
        mtimeMs: 4242,
        contentKind: 'binary',
      });
      expect(counters.fullReads).toBe(0);
      expect(counters.maxInFlight).toBeGreaterThan(1);
      expect(counters.maxInFlight).toBeLessThanOrEqual(16);
    });
  });

  // ---------------------------------------------------------------------------
  // readdirEntries
  // ---------------------------------------------------------------------------

  describe('readdirEntries', () => {
    it('should return each entry name with its kind', async () => {
      await provider.writeFile('src/index.ts', 'export {}');
      await provider.mkdir('src/utils');

      await expect(provider.readdirEntries('src')).resolves.toEqual([
        { name: 'index.ts', kind: 'file' },
        { name: 'utils', kind: 'dir' },
      ]);
    });

    it('should exclude Chromium swap entries', async () => {
      await provider.writeFile('main.ts.crswap', 'swap');
      await provider.writeFile('main.ts', 'source');

      await expect(provider.readdirEntries('')).resolves.toEqual([{ name: 'main.ts', kind: 'file' }]);
    });
  });

  describe('readdirWithStats', () => {
    it('should return entries with type and size in single pass', async () => {
      await provider.mkdir('src');
      await provider.writeFile('src/index.ts', 'export {}');
      await provider.mkdir('src/utils');

      const entries = await provider.readdirWithStats('src');
      expect(entries).toHaveLength(2);

      const file = entries.find((entry) => entry.name === 'index.ts');
      const directory = entries.find((entry) => entry.name === 'utils');

      expect(file!.type).toBe('file');
      expect(file!.size).toBeGreaterThan(0);

      expect(directory!.type).toBe('dir');
    });
  });
});
