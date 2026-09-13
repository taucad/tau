import { describe, it, expect } from 'vitest';
import { _fromMemoryFsHandle as fromMemoryFS } from '#transport/_internal/from-memory-fs-handle.js';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';

/**
 * `fromMemoryFS()` returns a `RuntimeFileSystemHandle` discriminated handle whose
 * `inline` arm carries the bare `RuntimeFileSystemBase` implementation under
 * `.fs`. This local helper lets the constructor-behaviour tests below assert
 * directly against the FS contract without sprinkling `.fs` accessors at
 * every call site.
 */
function makeFs(): RuntimeFileSystemBase {
  const handle = fromMemoryFS();
  if (handle.kind !== 'inline') {
    throw new Error('fromMemoryFS() must return the inline-kind handle.');
  }
  return handle.create();
}

describe('filesystem constructors', () => {
  describe('fromMemoryFS', () => {
    it('should mkdir and create all parent directories', async () => {
      const fileSystem = makeFs();

      await fileSystem.mkdir('/a/b/c');

      expect(await fileSystem.exists('/a/b/c')).toBe(true);
      expect(await fileSystem.exists('/a/b')).toBe(true);
      expect(await fileSystem.exists('/a')).toBe(true);
    });

    it('should make parent directories visible via stat', async () => {
      const fileSystem = makeFs();

      await fileSystem.mkdir('/x/y/z');

      const statX = await fileSystem.stat('/x');
      expect(statX.type).toBe('dir');

      const statXy = await fileSystem.stat('/x/y');
      expect(statXy.type).toBe('dir');
    });

    it('should list children created by mkdir in readdir', async () => {
      const fileSystem = makeFs();

      await fileSystem.mkdir('/parent/child');

      const entries = await fileSystem.readdir('/parent');
      expect(entries).toContain('child');
    });

    it('should list deeply nested mkdir directories via readdir', async () => {
      const fileSystem = makeFs();

      await fileSystem.mkdir('/a/b/c/d');

      expect(await fileSystem.readdir('/a')).toContain('b');
      expect(await fileSystem.readdir('/a/b')).toContain('c');
      expect(await fileSystem.readdir('/a/b/c')).toContain('d');
    });

    it('should read and write files in directories created by mkdir', async () => {
      const fileSystem = makeFs();

      await fileSystem.mkdir('/project/src');
      await fileSystem.writeFile('/project/src/index.ts', 'export {}');

      const content = await fileSystem.readFile('/project/src/index.ts', 'utf8');
      expect(content).toBe('export {}');
    });

    it('should read a file as utf8', async () => {
      const fileSystem = makeFs();
      await fileSystem.writeFile('/test.txt', 'hello world');

      const content = await fileSystem.readFile('/test.txt', 'utf8');
      expect(content).toBe('hello world');
    });

    it('should read a file as Uint8Array', async () => {
      const fileSystem = makeFs();
      await fileSystem.writeFile('/bin.txt', 'binary');

      const content = await fileSystem.readFile('/bin.txt');
      expect(content).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(content)).toBe('binary');
    });

    it('should remove a directory via rmdir', async () => {
      const fileSystem = makeFs();

      await fileSystem.mkdir('/rmdir-test');
      expect(await fileSystem.exists('/rmdir-test')).toBe(true);
      await fileSystem.rmdir('/rmdir-test');
      expect(await fileSystem.exists('/rmdir-test')).toBe(false);
    });

    it('should rename a file', async () => {
      const fileSystem = makeFs();

      await fileSystem.writeFile('/old.txt', 'rename me');
      await fileSystem.rename('/old.txt', '/new.txt');

      expect(await fileSystem.exists('/old.txt')).toBe(false);
      const content = await fileSystem.readFile('/new.txt', 'utf8');
      expect(content).toBe('rename me');
    });

    it('should rename a directory', async () => {
      const fileSystem = makeFs();

      await fileSystem.mkdir('/old-dir');
      await fileSystem.rename('/old-dir', '/new-dir');

      expect(await fileSystem.exists('/old-dir')).toBe(false);
      expect(await fileSystem.exists('/new-dir')).toBe(true);
    });

    it('should throw ENOENT when renaming nonexistent path', async () => {
      const fileSystem = makeFs();

      await expect(fileSystem.rename('/nope', '/also-nope')).rejects.toThrow('ENOENT');
    });

    it('should delete a file', async () => {
      const fileSystem = makeFs();
      await fileSystem.writeFile('/del.txt', 'gone');

      await fileSystem.unlink('/del.txt');
      expect(await fileSystem.exists('/del.txt')).toBe(false);
    });

    it('should stat a file with correct metadata', async () => {
      const fileSystem = makeFs();
      await fileSystem.writeFile('/stat.txt', 'abcde');

      const stat = await fileSystem.stat('/stat.txt');
      expect(stat.type).toBe('file');
      expect(stat.size).toBe(5);
      expect(stat.mtimeMs).toBeTypeOf('number');
    });

    it('should stat a directory', async () => {
      const fileSystem = makeFs();
      await fileSystem.mkdir('/statdir');

      const stat = await fileSystem.stat('/statdir');
      expect(stat.type).toBe('dir');
    });

    it('should check file existence', async () => {
      const fileSystem = makeFs();
      await fileSystem.writeFile('/exists.txt', 'yes');

      expect(await fileSystem.exists('/exists.txt')).toBe(true);
      expect(await fileSystem.exists('/nope.txt')).toBe(false);
    });

    it('should lstat a file (delegates to stat, no symlinks)', async () => {
      const fileSystem = makeFs();

      await fileSystem.writeFile('/lstat.txt', 'abc');
      const stat = await fileSystem.lstat('/lstat.txt');
      expect(stat.type).toBe('file');
      expect(stat.size).toBe(3);
      expect(stat.mtimeMs).toBeTypeOf('number');
    });

    it('should throw ENOENT from stat for nonexistent path', async () => {
      const fileSystem = makeFs();
      await expect(fileSystem.stat('/does-not-exist')).rejects.toThrow('ENOENT');
    });

    it('should return directory stat from lstat', async () => {
      const fileSystem = makeFs();
      await fileSystem.mkdir('/my-dir');

      const stat = await fileSystem.lstat('/my-dir');
      expect(stat.type).toBe('dir');
    });

    it('should throw ENOENT from lstat for nonexistent path', async () => {
      const fileSystem = makeFs();
      await expect(fileSystem.lstat('/missing')).rejects.toThrow('ENOENT');
    });
  });
});
