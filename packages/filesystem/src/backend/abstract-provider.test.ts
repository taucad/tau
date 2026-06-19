import { describe, it, expect, beforeEach } from 'vitest';
import { AbstractFileSystemProvider } from '#backend/abstract-provider.js';
import type { FileStat, ProviderCapabilities } from '#types.js';
import { fileStatFromBytes } from '#content-metadata.js';

const encoder = new TextEncoder();

/**
 * Concrete test implementation backed by plain Maps.
 * Isolates AbstractFileSystemProvider shared logic from any real storage.
 */
class TestProvider extends AbstractFileSystemProvider {
  private readonly _files = new Map<string, Uint8Array<ArrayBuffer>>();
  private readonly _dirs = new Set<string>(['/']);

  public get id(): string {
    return 'test';
  }

  public get capabilities(): ProviderCapabilities {
    return { persistent: false, writable: true, quotaBased: false };
  }

  public async writeFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> {
    this._files.set(path, typeof data === 'string' ? encoder.encode(data) : data);
  }

  public async readdir(path: string): Promise<string[]> {
    const prefix = path === '/' ? '/' : `${path}/`;
    const entries = new Set<string>();

    for (const filePath of this._files.keys()) {
      if (filePath.startsWith(prefix)) {
        const rest = filePath.slice(prefix.length);
        const firstSegment = rest.split('/')[0];
        if (firstSegment) {
          entries.add(firstSegment);
        }
      }
    }

    for (const directoryPath of this._dirs) {
      if (directoryPath !== path && directoryPath.startsWith(prefix)) {
        const rest = directoryPath.slice(prefix.length);
        const firstSegment = rest.split('/')[0];
        if (firstSegment) {
          entries.add(firstSegment);
        }
      }
    }

    return [...entries];
  }

  public async stat(path: string): Promise<FileStat> {
    if (this._dirs.has(path)) {
      return { type: 'dir', size: 0, mtimeMs: Date.now() };
    }
    const data = this._files.get(path);
    if (data) {
      return fileStatFromBytes(data, Date.now());
    }
    const error = new Error(`ENOENT: no such file or directory '${path}'`);
    (error as NodeJS.ErrnoException).code = 'ENOENT';
    throw error;
  }

  public async unlink(path: string): Promise<void> {
    if (!this._files.has(path)) {
      throw new Error(`ENOENT: '${path}'`);
    }
    this._files.delete(path);
  }

  public async rmdir(path: string): Promise<void> {
    if (!this._dirs.has(path)) {
      throw new Error(`ENOENT: '${path}'`);
    }
    this._dirs.delete(path);
  }

  public async rename(from: string, to: string): Promise<void> {
    const data = this._files.get(from);
    if (!data) {
      throw new Error(`ENOENT: '${from}'`);
    }
    this._files.set(to, data);
    this._files.delete(from);
  }

  protected async readFileRaw(path: string): Promise<Uint8Array<ArrayBuffer>> {
    const data = this._files.get(path);
    if (!data) {
      const error = new Error(`ENOENT: no such file '${path}'`);
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      throw error;
    }
    return data;
  }

  protected async mkdirSingle(path: string): Promise<void> {
    if (this._dirs.has(path)) {
      const error = new Error(`EEXIST: '${path}'`);
      (error as NodeJS.ErrnoException).code = 'EEXIST';
      throw error;
    }
    const parent = path.slice(0, path.lastIndexOf('/')) || '/';
    if (!this._dirs.has(parent)) {
      const error = new Error(`ENOENT: parent '${parent}' does not exist`);
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      throw error;
    }
    this._dirs.add(path);
  }
}

describe('AbstractFileSystemProvider', () => {
  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider();
  });

  // ---------------------------------------------------------------------------
  // exists (shared implementation)
  // ---------------------------------------------------------------------------

  describe('exists', () => {
    it('should return true for an existing file', async () => {
      await provider.writeFile('/exists.txt', 'yes');
      expect(await provider.exists('/exists.txt')).toBe(true);
    });

    it('should return false for a non-existent path', async () => {
      expect(await provider.exists('/nothing')).toBe(false);
    });

    it('should return true for an existing directory', async () => {
      await provider.mkdir('/dir');
      expect(await provider.exists('/dir')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // lstat (shared delegation to stat)
  // ---------------------------------------------------------------------------

  describe('lstat', () => {
    it('should return file stats matching stat output', async () => {
      await provider.writeFile('/lstat.txt', 'data');
      const stats = await provider.lstat('/lstat.txt');
      expect(stats.type).toBe('file');
      expect(stats.size).toBe(4);
    });

    it('should return directory stats matching stat output', async () => {
      await provider.mkdir('/lstat-dir');
      const stats = await provider.lstat('/lstat-dir');
      expect(stats.type).toBe('dir');
    });

    it('should throw for non-existent path', async () => {
      await expect(provider.lstat('/missing')).rejects.toThrow('ENOENT');
    });
  });

  // ---------------------------------------------------------------------------
  // readFile with encoding (shared UTF-8 decode wrapper)
  // ---------------------------------------------------------------------------

  describe('readFile with encoding', () => {
    it('should decode raw bytes as utf8 when encoding is specified', async () => {
      await provider.writeFile('/encoded.txt', encoder.encode('hello world'));
      const text = await provider.readFile('/encoded.txt', 'utf8');
      expect(text).toBe('hello world');
    });

    it('should return raw Uint8Array when no encoding specified', async () => {
      await provider.writeFile('/raw.txt', 'hello');
      const result = await provider.readFile('/raw.txt');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(result)).toBe('hello');
    });

    it('should throw for non-existent file', async () => {
      await expect(provider.readFile('/missing.txt')).rejects.toThrow('ENOENT');
    });

    it('should throw for non-existent file with encoding', async () => {
      await expect(provider.readFile('/missing.txt', 'utf8')).rejects.toThrow('ENOENT');
    });
  });

  // ---------------------------------------------------------------------------
  // recursive mkdir (shared segment-walking)
  // ---------------------------------------------------------------------------

  describe('mkdir', () => {
    it('should create a single directory', async () => {
      await provider.mkdir('/newdir');
      const stats = await provider.stat('/newdir');
      expect(stats.type).toBe('dir');
    });

    it('should create nested directories with recursive option', async () => {
      await provider.mkdir('/a/b/c', { recursive: true });
      expect(await provider.exists('/a')).toBe(true);
      expect(await provider.exists('/a/b')).toBe(true);
      expect(await provider.exists('/a/b/c')).toBe(true);
      const stats = await provider.stat('/a/b/c');
      expect(stats.type).toBe('dir');
    });

    it('should succeed when intermediate directories already exist', async () => {
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
  // dispose (shared no-op default)
  // ---------------------------------------------------------------------------

  describe('dispose', () => {
    it('should not throw and leave previously written data accessible', async () => {
      await provider.writeFile('/lifecycle.txt', 'data');
      provider.dispose();
      const content = await provider.readFile('/lifecycle.txt', 'utf8');
      expect(content).toBe('data');
    });
  });
});
