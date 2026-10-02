/* eslint-disable @typescript-eslint/naming-convention -- filesystem paths use non-camelCase names throughout */
import { describe, it, expect, vi } from 'vitest';
import { _fromMemoryFsHandle as fromMemoryFS } from '#transport/_internal/from-memory-fs-handle.js';
import { createRuntimeFileSystem } from '#filesystem/create-runtime-filesystem.js';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';

/**
 * Unwrap the discriminated `inline` `RuntimeFileSystemHandle` so the
 * `createRuntimeFileSystem` enhancer below receives the bare contract it
 * expects, while leaving callers free to also mutate the FS directly
 * (e.g., `await base.mkdir(...)` between seeding and enhancing).
 */
function makeFs(files?: Record<string, string>): RuntimeFileSystemBase {
  const handle = fromMemoryFS(files);
  if (handle.kind !== 'inline') {
    throw new Error('fromMemoryFS() must return the inline-kind handle.');
  }
  return handle.create();
}

describe('createRuntimeFileSystem', () => {
  describe('readdirContents', () => {
    it('should return file contents from a flat directory', async () => {
      const base = makeFs({
        '/project/a.ts': 'const a = 1;',
        '/project/b.ts': 'const b = 2;',
      });
      const fs = createRuntimeFileSystem(base);

      const contents = await fs.readdirContents('/project');
      expect(Object.keys(contents)).toHaveLength(2);
      expect(new TextDecoder().decode(contents['a.ts'])).toBe('const a = 1;');
      expect(new TextDecoder().decode(contents['b.ts'])).toBe('const b = 2;');
    });

    it('should skip subdirectories and only return files', async () => {
      const base = makeFs({
        '/root/file.txt': 'hello',
        '/root/sub/nested.txt': 'nested',
      });
      const fs = createRuntimeFileSystem(base);

      const contents = await fs.readdirContents('/root');
      expect(Object.keys(contents)).toEqual(['file.txt']);
      expect(new TextDecoder().decode(contents['file.txt'])).toBe('hello');
    });

    it('should handle directories created by mkdir alongside files', async () => {
      const base = makeFs({
        '/dir/readme.md': '# Hello',
      });
      await base.mkdir('/dir/subdir');
      const fs = createRuntimeFileSystem(base);

      const contents = await fs.readdirContents('/dir');
      expect(Object.keys(contents)).toEqual(['readme.md']);
      expect(new TextDecoder().decode(contents['readme.md'])).toBe('# Hello');
    });

    it('should return an empty object for an empty directory', async () => {
      const base = makeFs();
      await base.mkdir('/empty');
      const fs = createRuntimeFileSystem(base);

      const contents = await fs.readdirContents('/empty');
      expect(Object.keys(contents)).toHaveLength(0);
    });

    it('should not include deeply nested files', async () => {
      const base = makeFs({
        '/root/top.txt': 'top',
        '/root/a/b/deep.txt': 'deep',
      });
      const fs = createRuntimeFileSystem(base);

      const contents = await fs.readdirContents('/root');
      expect(Object.keys(contents)).toEqual(['top.txt']);
    });
  });

  describe('readFiles', () => {
    it('should read multiple files concurrently', async () => {
      const base = makeFs({
        '/a.txt': 'alpha',
        '/b.txt': 'beta',
      });
      const fs = createRuntimeFileSystem(base);

      const result = await fs.readFiles(['/a.txt', '/b.txt']);
      expect(new TextDecoder().decode(result['/a.txt'])).toBe('alpha');
      expect(new TextDecoder().decode(result['/b.txt'])).toBe('beta');
    });
  });

  describe('readdirStat', () => {
    it('should return stat entries for all directory contents', async () => {
      const base = makeFs({
        '/dir/a.txt': 'hello',
        '/dir/b.txt': 'world',
      });
      const fs = createRuntimeFileSystem(base);

      const entries = await fs.readdirStat('/dir');
      expect(entries).toHaveLength(2);
      expect(entries[0]?.name).toBe('a.txt');
      expect(entries[0]?.type).toBe('file');
      expect(entries[0]?.path).toBe('/dir/a.txt');
      expect(entries[1]?.name).toBe('b.txt');
    });

    it('should include subdirectories in stat results', async () => {
      const base = makeFs({
        '/root/file.txt': 'hi',
        '/root/sub/nested.txt': 'nested',
      });
      const fs = createRuntimeFileSystem(base);

      const entries = await fs.readdirStat('/root');
      const types = entries.map((entry) => entry.type);
      expect(types).toContain('file');
      expect(types).toContain('dir');
    });
  });

  describe('ensureDir', () => {
    it('should create a directory with recursive option', async () => {
      const base = makeFs();
      const fs = createRuntimeFileSystem(base);

      await fs.ensureDir('/a/b/c');
      const exists = await fs.exists('/a/b/c');
      expect(exists).toBe(true);
    });
  });

  describe('override support', () => {
    it('should use supplied readFiles override instead of default', async () => {
      const customReadFiles = vi.fn().mockResolvedValue({ '/x': new Uint8Array([99]) });
      const base = makeFs({ '/x': 'original' });
      const fs = createRuntimeFileSystem({
        ...base,
        readFiles: customReadFiles,
      });

      const result = await fs.readFiles(['/x']);
      expect(customReadFiles).toHaveBeenCalledWith(['/x']);
      expect(result).toEqual({ '/x': new Uint8Array([99]) });
    });

    it('should use supplied ensureDir override instead of default', async () => {
      const customEnsureDirectory = vi.fn().mockResolvedValue(undefined);
      const base = makeFs();
      const fs = createRuntimeFileSystem({
        ...base,
        ensureDir: customEnsureDirectory,
      });

      await fs.ensureDir('/custom/path');
      expect(customEnsureDirectory).toHaveBeenCalledWith('/custom/path');
    });

    it('should use supplied readdirContents override instead of default', async () => {
      const customReaddirContents = vi.fn().mockResolvedValue({ 'file.txt': new Uint8Array([1]) });
      const base = makeFs();
      const fs = createRuntimeFileSystem({
        ...base,
        readdirContents: customReaddirContents,
      });

      const result = await fs.readdirContents('/dir');
      expect(customReaddirContents).toHaveBeenCalledWith('/dir');
      expect(result).toEqual({ 'file.txt': new Uint8Array([1]) });
    });

    it('should use supplied readdirStat override instead of default', async () => {
      const mockEntries = [
        {
          path: '/d/f',
          name: 'f',
          type: 'file',
          size: 5,
          mtimeMs: 123,
        },
      ];
      const customReaddirStat = vi.fn().mockResolvedValue(mockEntries);
      const base = makeFs();
      const fs = createRuntimeFileSystem({
        ...base,
        readdirStat: customReaddirStat,
      });

      const result = await fs.readdirStat('/d');
      expect(customReaddirStat).toHaveBeenCalledWith('/d');
      expect(result).toEqual(mockEntries);
    });
  });

  describe('base passthrough', () => {
    it('should pass through all base filesystem methods', async () => {
      const base = makeFs({ '/test.txt': 'hello' });
      const fs = createRuntimeFileSystem(base);

      const content = await fs.readFile('/test.txt', 'utf8');
      expect(content).toBe('hello');

      await fs.writeFile('/new.txt', 'world');
      const written = await fs.readFile('/new.txt', 'utf8');
      expect(written).toBe('world');

      expect(await fs.exists('/test.txt')).toBe(true);
      expect(await fs.exists('/nope.txt')).toBe(false);
    });
  });

  describe('delegation to FileSystemService', () => {
    it('routes provider primitives through the canonical Layer 2 service', async () => {
      const base = makeFs({ '/seed.txt': 'seeded' });
      const readSpy = vi.spyOn(base, 'readFile');
      const writeSpy = vi.spyOn(base, 'writeFile');
      const fs = createRuntimeFileSystem(base);

      await fs.writeFile('/created.txt', 'value');
      expect(writeSpy).toHaveBeenCalledWith('/created.txt', 'value');

      expect(await fs.readFile('/seed.txt', 'utf8')).toBe('seeded');
      expect(readSpy).toHaveBeenCalledWith('/seed.txt');
    });

    it('preserves the base provider identity and capabilities on the facade', () => {
      const base = makeFs();
      const fs = createRuntimeFileSystem(base);

      expect(fs.id).toBe(base.id);
      expect(fs.capabilities).toEqual(base.capabilities);
    });

    it('forwards base.watch when present', () => {
      const base = makeFs();
      const watch = vi.fn(() => () => undefined);
      const fs = createRuntimeFileSystem({ ...base, watch });

      const handler = vi.fn();
      fs.watch?.({ paths: ['/'] }, handler);
      expect(watch).toHaveBeenCalledWith({ paths: ['/'] }, handler);
    });

    it('omits watch when the base provider does not implement it', () => {
      const base = makeFs();
      const fs = createRuntimeFileSystem(base);
      expect(fs.watch).toBeUndefined();
    });
  });
});
