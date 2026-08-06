// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DirectIdbProvider } from '#backend/direct-idb-provider.js';

const encoder = new TextEncoder();

describe('DirectIdbProvider', () => {
  let provider: DirectIdbProvider;

  beforeEach(async () => {
    provider = new DirectIdbProvider(`test-${crypto.randomUUID()}`);
    await provider.initialize();
  });

  afterEach(() => {
    provider.dispose();
  });

  // ---------------------------------------------------------------------------
  // provider metadata
  // ---------------------------------------------------------------------------

  describe('provider metadata', () => {
    it('should have id "indexeddb"', () => {
      expect(provider.id).toBe('indexeddb');
    });

    it('should report persistent, writable, quotaBased capabilities', () => {
      expect(provider.capabilities).toEqual({
        persistent: true,
        writable: true,
        quotaBased: true,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // writeFile + readFile round-trip
  // ---------------------------------------------------------------------------

  describe('writeFile + readFile round-trip', () => {
    it('should round-trip a string via utf8 encoding', async () => {
      await provider.writeFile('/hello.txt', 'world');
      const content = await provider.readFile('/hello.txt', 'utf8');
      expect(content).toBe('world');
    });

    it('should round-trip binary data', async () => {
      const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      await provider.writeFile('/bin.dat', data);
      const result = await provider.readFile('/bin.dat');
      expect(result).toEqual(data);
    });

    it('should own queued input and returned byte snapshots', async () => {
      const input = new Uint8Array([1, 2, 3]);
      const pending = provider.writeFile('/owned.bin', input);
      input.fill(9);
      await pending;

      const first = await provider.readFile('/owned.bin');
      first.fill(8);
      const second = await provider.readFile('/owned.bin');

      expect(second).toEqual(new Uint8Array([1, 2, 3]));
      expect(second).not.toBe(first);
    });

    it('should write a Uint8Array and read as utf8', async () => {
      const bytes = encoder.encode('encoded');
      await provider.writeFile('/encoded.txt', bytes);
      const text = await provider.readFile('/encoded.txt', 'utf8');
      expect(text).toBe('encoded');
    });

    it('should overwrite existing file content', async () => {
      await provider.writeFile('/file.txt', 'first');
      await provider.writeFile('/file.txt', 'second');
      const content = await provider.readFile('/file.txt', 'utf8');
      expect(content).toBe('second');
    });

    it('should handle empty string writes', async () => {
      await provider.writeFile('/empty.txt', '');
      const content = await provider.readFile('/empty.txt', 'utf8');
      expect(content).toBe('');
    });

    it('should handle empty Uint8Array writes', async () => {
      await provider.writeFile('/empty.bin', new Uint8Array(0));
      const result = await provider.readFile('/empty.bin');
      expect(result.byteLength).toBe(0);
    });

    it('should auto-create parent directories for nested paths', async () => {
      await provider.writeFile('/a/b/c/file.txt', 'nested');
      const result = await provider.readFile('/a/b/c/file.txt', 'utf8');
      expect(result).toBe('nested');
      const parentStat = await provider.stat('/a/b');
      expect(parentStat.type).toBe('dir');
    });

    it('should keep draining later writes after one flush generation fails', async () => {
      type FlushBatch = (batch: ReadonlyArray<{ path: string; data: Uint8Array<ArrayBuffer> }>) => Promise<void>;
      const internals = provider as unknown as { _flushBatch: FlushBatch };
      const originalFlushBatch = internals._flushBatch.bind(provider);
      const releaseFailure = Promise.withResolvers<void>();
      let generation = 0;
      internals._flushBatch = async (batch) => {
        generation++;
        if (generation === 1) {
          await releaseFailure.promise;
          throw new Error('flush failed');
        }
        await originalFlushBatch(batch);
      };

      const failed = provider.writeFile('/failed.txt', 'failed');
      const second = provider.writeFile('/second.txt', 'second');
      const third = provider.writeFile('/third.txt', 'third');
      releaseFailure.resolve();

      await expect(failed).rejects.toThrow(new Error('flush failed'));
      await expect(Promise.all([second, third])).resolves.toEqual([undefined, undefined]);
      await expect(provider.readFile('/second.txt', 'utf8')).resolves.toBe('second');
      await expect(provider.readFile('/third.txt', 'utf8')).resolves.toBe('third');
    });
  });

  // ---------------------------------------------------------------------------
  // readFile errors
  // ---------------------------------------------------------------------------

  describe('readFile errors', () => {
    it('should throw ENOENT for non-existent file', async () => {
      await expect(provider.readFile('/missing.txt')).rejects.toThrow('ENOENT');
    });

    it('should throw ENOENT for non-existent file with encoding', async () => {
      await expect(provider.readFile('/missing.txt', 'utf8')).rejects.toThrow('ENOENT');
    });
  });

  // ---------------------------------------------------------------------------
  // readdir
  // ---------------------------------------------------------------------------

  describe('readdir', () => {
    it('should list files in root directory', async () => {
      await provider.writeFile('/a.txt', 'a');
      await provider.writeFile('/b.txt', 'b');
      const entries = await provider.readdir('/');
      expect(entries.sort()).toEqual(['a.txt', 'b.txt']);
    });

    it('should list files in a subdirectory', async () => {
      await provider.writeFile('/sub/x.txt', 'x');
      await provider.writeFile('/sub/y.txt', 'y');
      const entries = await provider.readdir('/sub');
      expect(entries.sort()).toEqual(['x.txt', 'y.txt']);
    });

    it('should return empty array for empty directory', async () => {
      await provider.mkdir('/empty');
      const entries = await provider.readdir('/empty');
      expect(entries).toEqual([]);
    });

    it('should throw for non-existent directory', async () => {
      await expect(provider.readdir('/nonexistent')).rejects.toThrow('ENOENT');
    });

    it('should not include entries from deeper subdirectories', async () => {
      await provider.writeFile('/dir/a.txt', 'a');
      await provider.writeFile('/dir/sub/b.txt', 'b');
      const entries = await provider.readdir('/dir');
      expect(entries.sort()).toEqual(['a.txt', 'sub']);
    });
  });

  // ---------------------------------------------------------------------------
  // stat
  // ---------------------------------------------------------------------------

  describe('stat', () => {
    it('should return correct size for a file', async () => {
      await provider.writeFile('/sized.txt', 'hello');
      const stats = await provider.stat('/sized.txt');
      expect(stats.size).toBe(5);
      expect(stats.type).toBe('file');
    });

    it('should return correct stats for a directory', async () => {
      await provider.mkdir('/statdir');
      const stats = await provider.stat('/statdir');
      expect(stats.type).toBe('dir');
    });

    it('should use the stable unknown mtime for newly written files', async () => {
      await provider.writeFile('/timed.txt', 'data');
      const stats = await provider.stat('/timed.txt');
      expect(stats.mtimeMs).toBe(0);
    });

    it('should throw for non-existent path', async () => {
      await expect(provider.stat('/nope')).rejects.toThrow('ENOENT');
    });
  });

  // ---------------------------------------------------------------------------
  // mkdir
  // ---------------------------------------------------------------------------

  describe('mkdir', () => {
    it('should create a directory', async () => {
      await provider.mkdir('/newdir');
      const stats = await provider.stat('/newdir');
      expect(stats.type).toBe('dir');
    });

    it('should create nested directories with recursive option', async () => {
      await provider.mkdir('/a/b/c', { recursive: true });
      const stats = await provider.stat('/a/b/c');
      expect(stats.type).toBe('dir');
    });

    it('should succeed when recursive mkdir with existing intermediate dirs', async () => {
      await provider.mkdir('/x');
      await provider.mkdir('/x/y/z', { recursive: true });
      const stats = await provider.stat('/x/y/z');
      expect(stats.type).toBe('dir');
    });

    it('should throw when parent does not exist without recursive', async () => {
      await expect(provider.mkdir('/no/parent')).rejects.toThrow('ENOENT');
    });
  });

  // ---------------------------------------------------------------------------
  // unlink
  // ---------------------------------------------------------------------------

  describe('unlink', () => {
    it('should delete a file', async () => {
      await provider.writeFile('/delete-me.txt', 'gone');
      await provider.unlink('/delete-me.txt');
      expect(await provider.exists('/delete-me.txt')).toBe(false);
    });

    it('should throw for non-existent file', async () => {
      await expect(provider.unlink('/not-here.txt')).rejects.toThrow('ENOENT');
    });

    it('should preserve the indexed entry when the delete transaction aborts', async () => {
      await provider.writeFile('/preserved.txt', 'keep');
      const database = (provider as unknown as { _db: IDBDatabase })._db;
      const transaction = new EventTarget() as IDBTransaction;
      Object.defineProperties(transaction, {
        error: { value: new DOMException('delete aborted', 'AbortError') },
        objectStore: {
          value: () => ({
            delete: () => {
              queueMicrotask(() => transaction.dispatchEvent(new Event('abort')));
            },
          }),
        },
      });
      vi.spyOn(database, 'transaction').mockReturnValueOnce(transaction);

      await expect(provider.unlink('/preserved.txt')).rejects.toThrow('delete aborted');
      await expect(provider.readFile('/preserved.txt', 'utf8')).resolves.toBe('keep');
    });
  });

  // ---------------------------------------------------------------------------
  // rmdir
  // ---------------------------------------------------------------------------

  describe('rmdir', () => {
    it('should remove an empty directory', async () => {
      await provider.mkdir('/removable');
      await provider.rmdir('/removable');
      expect(await provider.exists('/removable')).toBe(false);
    });

    it('should throw for non-existent directory', async () => {
      await expect(provider.rmdir('/ghost')).rejects.toThrow('ENOENT');
    });

    it('should preserve a non-empty directory', async () => {
      await provider.writeFile('/occupied/file.txt', 'keep');

      await expect(provider.rmdir('/occupied')).rejects.toThrow('ENOTEMPTY');
      await expect(provider.readFile('/occupied/file.txt', 'utf8')).resolves.toBe('keep');
    });
  });

  // ---------------------------------------------------------------------------
  // rename
  // ---------------------------------------------------------------------------

  describe('rename', () => {
    it('should rename a file and preserve content', async () => {
      await provider.writeFile('/old.txt', 'content');
      await provider.rename('/old.txt', '/new.txt');
      expect(await provider.exists('/old.txt')).toBe(false);
      const content = await provider.readFile('/new.txt', 'utf8');
      expect(content).toBe('content');
    });

    it('should rename a directory and move every contained file under the new prefix', async () => {
      await provider.mkdir('/src/utils', { recursive: true });
      await provider.writeFile('/src/index.ts', 'export {}');
      await provider.writeFile('/src/utils/helpers.ts', 'export {}');
      await provider.writeFile('/src/utils/strings.ts', 'export {}');

      await provider.rename('/src', '/lib');

      expect(await provider.exists('/src')).toBe(false);
      expect(await provider.exists('/src/index.ts')).toBe(false);
      expect(await provider.exists('/lib')).toBe(true);
      expect(await provider.exists('/lib/index.ts')).toBe(true);
      expect(await provider.exists('/lib/utils/helpers.ts')).toBe(true);
      expect(await provider.exists('/lib/utils/strings.ts')).toBe(true);
    });

    it('should rename an empty directory and keep the directory entry under the new prefix', async () => {
      await provider.mkdir('/scratch');
      await provider.rename('/scratch', '/temp');
      expect(await provider.exists('/scratch')).toBe(false);
      expect(await provider.exists('/temp')).toBe(true);
    });

    it('should reject a directory rename on transaction abort without mutating its projection', async () => {
      await provider.mkdir('/preserved');
      const database = (provider as unknown as { _db: IDBDatabase })._db;
      const transaction = new EventTarget() as IDBTransaction;
      let abortQueued = false;
      const queueAbort = () => {
        if (!abortQueued) {
          abortQueued = true;
          queueMicrotask(() => transaction.dispatchEvent(new Event('abort')));
        }
      };
      Object.defineProperties(transaction, {
        error: { value: new DOMException('rename aborted', 'AbortError') },
        objectStore: {
          value: () => ({
            delete: queueAbort,
            put: queueAbort,
          }),
        },
      });
      vi.spyOn(database, 'transaction').mockReturnValueOnce(transaction);

      await expect(provider.rename('/preserved', '/lost')).rejects.toThrow('rename aborted');
      await expect(provider.exists('/preserved')).resolves.toBe(true);
      await expect(provider.exists('/lost')).resolves.toBe(false);
    });

    it('should throw when source does not exist', async () => {
      await expect(provider.rename('/missing.txt', '/target.txt')).rejects.toThrow('ENOENT');
    });
  });

  // ---------------------------------------------------------------------------
  // exists
  // ---------------------------------------------------------------------------

  describe('exists', () => {
    it('should return true for existing file', async () => {
      await provider.writeFile('/exists.txt', 'yes');
      expect(await provider.exists('/exists.txt')).toBe(true);
    });

    it('should return true for existing directory', async () => {
      await provider.mkdir('/exists-dir');
      expect(await provider.exists('/exists-dir')).toBe(true);
    });

    it('should return false for non-existent path', async () => {
      expect(await provider.exists('/nothing')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // lstat
  // ---------------------------------------------------------------------------

  describe('lstat', () => {
    it('should return file stats', async () => {
      await provider.writeFile('/lstat.txt', 'data');
      const stats = await provider.lstat('/lstat.txt');
      expect(stats.type).toBe('file');
    });

    it('should return directory stats', async () => {
      await provider.mkdir('/lstat-dir');
      const stats = await provider.lstat('/lstat-dir');
      expect(stats.type).toBe('dir');
    });

    it('should throw for non-existent path', async () => {
      await expect(provider.lstat('/missing')).rejects.toThrow('ENOENT');
    });
  });

  // ---------------------------------------------------------------------------
  // initialize (IDB-specific: getAllKeys hydration)
  // ---------------------------------------------------------------------------

  describe('initialize', () => {
    it('should hydrate in-memory path set from getAllKeys on re-init', async () => {
      await provider.writeFile('/persist.txt', 'hello');
      await provider.writeFile('/deep/nested/file.txt', 'nested');

      const dbName = (provider as unknown as { _dbName: string })._dbName;
      provider.dispose();

      const provider2 = new DirectIdbProvider('unused');
      (provider2 as unknown as { _dbName: string })._dbName = dbName;
      await provider2.initialize();

      expect(await provider2.exists('/persist.txt')).toBe(true);
      expect(await provider2.exists('/deep/nested/file.txt')).toBe(true);
      expect(await provider2.exists('/deep')).toBe(true);
      expect(await provider2.exists('/deep/nested')).toBe(true);

      const content = await provider2.readFile('/persist.txt', 'utf8');
      expect(content).toBe('hello');

      provider2.dispose();
    });

    it('should preserve an explicitly created empty directory across reopen', async () => {
      await provider.mkdir('/empty');

      const dbName = (provider as unknown as { _dbName: string })._dbName;
      provider.dispose();

      const provider2 = new DirectIdbProvider('unused');
      (provider2 as unknown as { _dbName: string })._dbName = dbName;
      await provider2.initialize();

      await expect(provider2.stat('/empty')).resolves.toMatchObject({ type: 'dir' });
      await expect(provider2.readdir('/empty')).resolves.toEqual([]);
      provider2.dispose();
    });

    it('reads current durable metadata after reopening the same provider', async () => {
      await provider.writeFile('/metadata.txt', 'before');
      const dbName = (provider as unknown as { _dbName: string })._dbName;
      const peer = new DirectIdbProvider('unused');
      (peer as unknown as { _dbName: string })._dbName = dbName;
      await peer.initialize();
      await peer.writeFile('/metadata.txt', 'x');
      peer.dispose();

      provider.dispose();
      await provider.initialize();

      await expect(provider.stat('/metadata.txt')).resolves.toMatchObject({ type: 'file', size: 1 });
    });

    it('should reject a persisted file/directory collision without retaining an open provider', async () => {
      const dbName = (provider as unknown as { _dbName: string })._dbName;
      const database = (provider as unknown as { _db: IDBDatabase })._db;
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('files', 'readwrite');
        transaction.objectStore('files').put(encoder.encode('file'), '/entry');
        transaction.objectStore('files').put(encoder.encode('child'), '/entry/child.txt');
        transaction.addEventListener('complete', () => {
          resolve();
        });
        transaction.addEventListener('error', () => {
          reject(transaction.error ?? new Error('IndexedDB collision seed failed.'));
        });
        transaction.addEventListener('abort', () => {
          reject(transaction.error ?? new Error('IndexedDB collision seed aborted.'));
        });
      });
      provider.dispose();

      const provider2 = new DirectIdbProvider('unused');
      (provider2 as unknown as { _dbName: string })._dbName = dbName;

      await expect(provider2.initialize()).rejects.toMatchObject({ code: 'EIO' });
      expect((provider2 as unknown as { _db?: IDBDatabase })._db).toBeUndefined();
      await expect(provider2.stat('/entry')).rejects.toThrow(/not initialized|disposed/);
    });

    it('keeps the prior metadata projection readable until refresh swaps a complete snapshot', async () => {
      await provider.writeFile('/visible.txt', 'visible');
      const database = (provider as unknown as { _db: IDBDatabase })._db;
      const request = new EventTarget() as IDBRequest<IDBValidKey[]>;
      Object.defineProperties(request, {
        result: { value: ['/visible.txt'] },
        error: { value: null },
      });
      const transaction = {
        objectStore: () => ({ getAllKeys: () => request }),
      } as unknown as IDBTransaction;
      vi.spyOn(database, 'transaction').mockReturnValueOnce(transaction);

      const refresh = provider.refresh();
      await Promise.resolve();
      await expect(provider.readdir('/')).resolves.toContain('visible.txt');

      request.dispatchEvent(new Event('success'));
      await refresh;
      await expect(provider.readdir('/')).resolves.toContain('visible.txt');
    });
  });

  // ---------------------------------------------------------------------------
  // dispose
  // ---------------------------------------------------------------------------

  describe('dispose', () => {
    it('should reject operations after dispose', async () => {
      await provider.writeFile('/before-dispose.txt', 'data');
      provider.dispose();
      await expect(provider.readFile('/before-dispose.txt')).rejects.toThrow();
    });

    const operations: ReadonlyArray<{
      name: string;
      run: (candidate: DirectIdbProvider) => Promise<unknown>;
    }> = [
      { name: 'writeFile', run: async (candidate) => candidate.writeFile('/file', 'x') },
      { name: 'readFile', run: async (candidate) => candidate.readFile('/file') },
      { name: 'readdir', run: async (candidate) => candidate.readdir('/') },
      { name: 'readdirWithStats', run: async (candidate) => candidate.readdirWithStats('/') },
      { name: 'stat', run: async (candidate) => candidate.stat('/') },
      { name: 'lstat', run: async (candidate) => candidate.lstat('/') },
      { name: 'exists', run: async (candidate) => candidate.exists('/') },
      { name: 'mkdir', run: async (candidate) => candidate.mkdir('/directory') },
      { name: 'unlink', run: async (candidate) => candidate.unlink('/file') },
      { name: 'rmdir', run: async (candidate) => candidate.rmdir('/directory') },
      { name: 'rename', run: async (candidate) => candidate.rename('/source', '/target') },
    ];

    it.each(['before initialization', 'after disposal'] as const)(
      'should reject every public operation %s',
      async (phase) => {
        for (const operation of operations) {
          const candidate = new DirectIdbProvider(`lifecycle-${phase}-${operation.name}-${crypto.randomUUID()}`);
          if (phase === 'after disposal') {
            // oxlint-disable-next-line no-await-in-loop -- Each operation needs its own closed provider fixture.
            await candidate.initialize();
            candidate.dispose();
          }
          // oxlint-disable-next-line no-await-in-loop -- Table assertions intentionally run one lifecycle operation at a time.
          await expect(operation.run(candidate), operation.name).rejects.toThrow(/not initialized|disposed/);
          candidate.dispose();
        }
      },
    );
  });

  describe('readdirWithStats', () => {
    it('should return entries with type, size, and mtime', async () => {
      await provider.writeFile('/src/index.ts', 'export {}');
      await provider.mkdir('/src/utils');
      await provider.writeFile('/src/utils/helpers.ts', 'export const x = 1');

      const entries = await provider.readdirWithStats('/src');
      expect(entries).toHaveLength(2);

      const file = entries.find((entry) => entry.name === 'index.ts');
      const directory = entries.find((entry) => entry.name === 'utils');

      expect(file).toBeDefined();
      expect(file!.type).toBe('file');
      expect(file!.size).toBe(new TextEncoder().encode('export {}').byteLength);

      expect(directory).toBeDefined();
      expect(directory!.type).toBe('dir');
    });

    it('should report the durable size after writeFile', async () => {
      await provider.writeFile('/cached.txt', 'hello');
      const entries = await provider.readdirWithStats('/');
      const entry = entries.find((entryItem) => entryItem.name === 'cached.txt');
      expect(entry!.size).toBe(5);
    });

    it('should report mtimeMs 0 (stable) for a hydrated file with no mtime entry', async () => {
      await provider.writeFile('/hydrated.txt', 'hello');
      const dbName = (provider as unknown as { _dbName: string })._dbName;
      provider.dispose();

      const provider2 = new DirectIdbProvider('unused');
      (provider2 as unknown as { _dbName: string })._dbName = dbName;
      await provider2.initialize();
      await provider2.readFile('/hydrated.txt');

      const first = await provider2.readdirWithStats('/');
      const second = await provider2.readdirWithStats('/');
      const firstEntry = first.find((entry) => entry.name === 'hydrated.txt');
      const secondEntry = second.find((entry) => entry.name === 'hydrated.txt');

      expect(firstEntry!.mtimeMs).toBe(0);
      expect(secondEntry!.mtimeMs).toBe(0);

      provider2.dispose();
    });

    it('purges projected files whose durable rows were removed by a peer', async () => {
      await provider.writeFile('/stat-ghost.txt', 'stat');
      await provider.writeFile('/read-ghost.txt', 'read');
      await provider.writeFile('/list-ghost.txt', 'list');
      const dbName = (provider as unknown as { _dbName: string })._dbName;
      const peer = new DirectIdbProvider('unused');
      (peer as unknown as { _dbName: string })._dbName = dbName;
      await peer.initialize();
      await peer.unlink('/stat-ghost.txt');
      await peer.unlink('/read-ghost.txt');
      await peer.unlink('/list-ghost.txt');

      await expect(provider.stat('/stat-ghost.txt')).rejects.toThrow('ENOENT');
      await expect(provider.readFile('/read-ghost.txt')).rejects.toThrow('ENOENT');
      await expect(provider.readdirWithStats('/')).resolves.not.toContainEqual(
        expect.objectContaining({ name: 'list-ghost.txt' }),
      );
      await expect(provider.exists('/stat-ghost.txt')).resolves.toBe(false);
      await expect(provider.exists('/read-ghost.txt')).resolves.toBe(false);
      await expect(provider.exists('/list-ghost.txt')).resolves.toBe(false);
      peer.dispose();
    });

    it('does not recreate a peer-deleted child during a stale directory rename', async () => {
      await provider.writeFile('/source/live.txt', 'live');
      await provider.writeFile('/source/deleted.txt', 'deleted');
      const dbName = (provider as unknown as { _dbName: string })._dbName;
      const peer = new DirectIdbProvider('unused');
      (peer as unknown as { _dbName: string })._dbName = dbName;
      await peer.initialize();
      await peer.unlink('/source/deleted.txt');

      await provider.rename('/source', '/target');

      await expect(provider.readFile('/target/live.txt', 'utf8')).resolves.toBe('live');
      await expect(provider.exists('/target/deleted.txt')).resolves.toBe(false);
      peer.dispose();
    });
  });
});
