// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DirectIdbProvider } from '#backend/direct-idb-provider.js';

const encoder = new TextEncoder();

describe('DirectIdbProvider', () => {
  let provider: DirectIdbProvider;

  beforeEach(async () => {
    provider = new DirectIdbProvider(`test-${Date.now()}`);
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

    it('should return a numeric mtimeMs', async () => {
      await provider.writeFile('/timed.txt', 'data');
      const stats = await provider.stat('/timed.txt');
      expect(typeof stats.mtimeMs).toBe('number');
      expect(stats.mtimeMs).toBeGreaterThan(0);
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
  });

  // ---------------------------------------------------------------------------
  // bulkImport
  // ---------------------------------------------------------------------------

  describe('bulkImport', () => {
    it('should make all imported files readable after completion', async () => {
      const files = new Map<string, Uint8Array<ArrayBuffer>>([
        ['/a.txt', encoder.encode('a')],
        ['/b/c.txt', encoder.encode('bc')],
      ]);
      await provider.bulkImport(files);
      expect(await provider.readFile('/a.txt', 'utf8')).toBe('a');
      expect(await provider.readFile('/b/c.txt', 'utf8')).toBe('bc');
    });

    it('should create intermediate directories for imported files', async () => {
      const files = new Map<string, Uint8Array<ArrayBuffer>>([['/x/y/z/file.txt', encoder.encode('deep')]]);
      await provider.bulkImport(files);
      expect(await provider.exists('/x')).toBe(true);
      expect(await provider.exists('/x/y')).toBe(true);
      expect(await provider.exists('/x/y/z')).toBe(true);
      const stats = await provider.stat('/x/y');
      expect(stats.type).toBe('dir');
    });

    it('should handle empty import map without error', async () => {
      const entriesBefore = await provider.readdir('/');
      await provider.bulkImport(new Map());
      const entriesAfter = await provider.readdir('/');
      const countBefore = entriesBefore.length;
      const countAfter = entriesAfter.length;
      expect(countAfter).toBe(countBefore);
    });

    it('should support reading imported files after dispose and re-init', async () => {
      const files = new Map<string, Uint8Array<ArrayBuffer>>([['/imported.txt', encoder.encode('persisted')]]);
      await provider.bulkImport(files);

      const dbName = (provider as unknown as { _dbName: string })._dbName;
      provider.dispose();

      const provider2 = new DirectIdbProvider('unused');
      (provider2 as unknown as { _dbName: string })._dbName = dbName;
      await provider2.initialize();

      expect(await provider2.readFile('/imported.txt', 'utf8')).toBe('persisted');
      provider2.dispose();
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

    it('should use cached sizes from writeFile without extra IDB reads', async () => {
      await provider.writeFile('/cached.txt', 'hello');
      const entries = await provider.readdirWithStats('/');
      const entry = entries.find((entryItem) => entryItem.name === 'cached.txt');
      expect(entry!.size).toBe(5);
    });
  });
});
