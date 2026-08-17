import { describe, it, expect, afterAll, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { _fromNodeFsHandle as fromNodeFS } from '#transport/_internal/from-node-fs-handle.js';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';

const { realpathMock } = vi.hoisted(() => ({ realpathMock: vi.fn<typeof fs.realpath>() }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  realpathMock.mockImplementation(actual.realpath);
  return {
    ...actual,
    default: { ...actual, realpath: realpathMock },
    realpath: realpathMock,
  };
});

/**
 * `fromNodeFS()` returns a `RuntimeFileSystemHandle` discriminated handle; this
 * suite exercises the underlying `RuntimeFileSystemBase` directly via
 * `.fs`. Runtime API integration is covered elsewhere.
 */
function unwrap(basePath: string): RuntimeFileSystemBase {
  const handle = fromNodeFS(basePath);
  if (handle.kind !== 'inline') {
    throw new Error('fromNodeFS must return the inline-kind handle.');
  }
  return handle.create();
}

describe('fromNodeFS', () => {
  const temporaryDirectory = path.join(os.tmpdir(), `kernels-node-fs-test-${Date.now()}`);

  afterAll(async () => {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('should read and write a file round-trip', async () => {
    await fs.mkdir(temporaryDirectory, { recursive: true });
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.writeFile('/roundtrip.txt', 'hello world');
    const content = await fileSystem.readFile('/roundtrip.txt', 'utf8');
    expect(content).toBe('hello world');
  });

  it('should read file as utf8 string', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.writeFile('/utf8.txt', 'text content');
    const content = await fileSystem.readFile('/utf8.txt', 'utf8');
    expect(content).toBe('text content');
  });

  it('should read file as Uint8Array', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.writeFile('/binary.txt', 'bytes');
    const content = await fileSystem.readFile('/binary.txt');
    expect(content).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(content)).toBe('bytes');
  });

  it('should create directory with mkdir', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.mkdir('/subdir', { recursive: true });
    const stat = await fileSystem.stat('/subdir');
    expect(stat.type).toBe('dir');
  });

  it('should list directory entries with readdir', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    const entries = await fileSystem.readdir('/');
    expect(entries).toContain('roundtrip.txt');
    expect(entries).toContain('subdir');
  });

  it('should return file stats with stat', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    const stat = await fileSystem.stat('/roundtrip.txt');
    expect(stat.type).toBe('file');
    expect(stat.size).toBeGreaterThan(0);
    expect(stat.mtimeMs).toBeTypeOf('number');
  });

  it('should return file stats with lstat', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    const stat = await fileSystem.lstat('/roundtrip.txt');
    expect(stat.type).toBe('file');
    expect(stat.size).toBeGreaterThan(0);
  });

  it('should rename a file', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.writeFile('/rename-src.txt', 'move me');
    await fileSystem.rename('/rename-src.txt', '/rename-dst.txt');

    expect(await fileSystem.exists('/rename-src.txt')).toBe(false);
    const content = await fileSystem.readFile('/rename-dst.txt', 'utf8');
    expect(content).toBe('move me');
  });

  it('should delete a file with unlink', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.writeFile('/delete-me.txt', 'gone');
    await fileSystem.unlink('/delete-me.txt');
    expect(await fileSystem.exists('/delete-me.txt')).toBe(false);
  });

  it('should remove directory with rmdir', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.mkdir('/rmdir-test');
    await fileSystem.rmdir('/rmdir-test');
    expect(await fileSystem.exists('/rmdir-test')).toBe(false);
  });

  it('should return true for existing file via exists', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.writeFile('/exists-test.txt', 'here');
    expect(await fileSystem.exists('/exists-test.txt')).toBe(true);
  });

  it('should return false for nonexistent file via exists', async () => {
    const fileSystem = unwrap(temporaryDirectory);
    expect(await fileSystem.exists('/not-here.txt')).toBe(false);
  });

  it('should resolve paths relative to basePath', async () => {
    await fs.mkdir(path.join(temporaryDirectory, 'nested'), { recursive: true });
    await fs.writeFile(path.join(temporaryDirectory, 'nested', 'deep.txt'), 'deep content');

    const fileSystem = unwrap(temporaryDirectory);
    const content = await fileSystem.readFile('/nested/deep.txt', 'utf8');
    expect(content).toBe('deep content');
  });

  it('should map VFS-root-leading paths under basePath, not host filesystem root', async () => {
    await fs.writeFile(path.join(temporaryDirectory, 'vfs-root.txt'), 'vfs');
    const fileSystem = unwrap(temporaryDirectory);
    expect(await fileSystem.readFile('/vfs-root.txt', 'utf8')).toBe('vfs');
  });

  it.each<readonly [string, (fileSystem: RuntimeFileSystemBase) => Promise<unknown>]>([
    ['readFile', async (fileSystem) => fileSystem.readFile('/../outside.txt')],
    ['writeFile', async (fileSystem) => fileSystem.writeFile('/../outside.txt', 'no')],
    ['mkdir', async (fileSystem) => fileSystem.mkdir('/../outside')],
    ['readdir', async (fileSystem) => fileSystem.readdir('/../outside')],
    ['unlink', async (fileSystem) => fileSystem.unlink('/../outside.txt')],
    ['stat', async (fileSystem) => fileSystem.stat('/../outside.txt')],
    ['rmdir', async (fileSystem) => fileSystem.rmdir('/../outside')],
    ['rename source', async (fileSystem) => fileSystem.rename('/../outside.txt', '/safe.txt')],
    ['rename destination', async (fileSystem) => fileSystem.rename('/safe.txt', '/../outside.txt')],
    ['lstat', async (fileSystem) => fileSystem.lstat('/../outside.txt')],
    ['exists', async (fileSystem) => fileSystem.exists('/../outside.txt')],
  ])('should reject lexical traversal for %s before host filesystem access', async (_operation, invoke) => {
    const fileSystem = unwrap(temporaryDirectory);
    await expect(invoke(fileSystem)).rejects.toMatchObject({ code: 'PATH_OUTSIDE_ROOT' });
  });

  it('should hide a symlink whose real target is outside the base directory', async () => {
    const outsideDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'kernels-node-fs-outside-'));
    await fs.writeFile(path.join(outsideDirectory, 'secret.txt'), 'secret');
    await fs.symlink(outsideDirectory, path.join(temporaryDirectory, 'outside-link'), 'dir');
    const fileSystem = unwrap(temporaryDirectory);

    await expect(fileSystem.readFile('/outside-link/secret.txt', 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(fileSystem.exists('/outside-link/secret.txt')).resolves.toBe(false);
    await fs.rm(outsideDirectory, { recursive: true, force: true });
  });

  it('should allow a symlink whose real target remains inside the base directory', async () => {
    await fs.mkdir(path.join(temporaryDirectory, 'inside-target'), { recursive: true });
    await fs.writeFile(path.join(temporaryDirectory, 'inside-target', 'safe.txt'), 'safe');
    await fs.symlink(
      path.join(temporaryDirectory, 'inside-target'),
      path.join(temporaryDirectory, 'inside-link'),
      'dir',
    );
    const fileSystem = unwrap(temporaryDirectory);

    await expect(fileSystem.readFile('/inside-link/safe.txt', 'utf8')).resolves.toBe('safe');
  });

  it('should refuse to replace a file symlink even when its target remains inside the base directory', async () => {
    const targetPath = path.join(temporaryDirectory, 'symlink-write-target.txt');
    await fs.writeFile(targetPath, 'unchanged');
    await fs.symlink(targetPath, path.join(temporaryDirectory, 'symlink-write.txt'));
    const fileSystem = unwrap(temporaryDirectory);

    await expect(fileSystem.writeFile('/symlink-write.txt', 'replacement')).rejects.toMatchObject({
      code: 'ELOOP',
    });
    await expect(fs.readFile(targetPath, 'utf8')).resolves.toBe('unchanged');
  });

  it('should refuse a parent changed to a symlink between admission and replacement', async () => {
    const parentPath = path.join(temporaryDirectory, 'write-parent');
    const swappedParentPath = path.join(temporaryDirectory, 'write-parent-swapped');
    const outsideDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'kernels-node-fs-parent-swap-'));
    await fs.mkdir(parentPath, { recursive: true });
    await fs.writeFile(path.join(parentPath, 'main.txt'), 'inside');
    await fs.writeFile(path.join(outsideDirectory, 'main.txt'), 'outside');
    await fs.symlink(outsideDirectory, swappedParentPath, 'dir');
    const fileSystem = unwrap(temporaryDirectory);
    const originalRealpath = realpathMock.getMockImplementation();
    if (!originalRealpath) {
      throw new Error('Expected the node:fs/promises realpath mock to delegate to the native implementation.');
    }
    let parentRealpathCalls = 0;
    realpathMock.mockImplementation(async (candidate) => {
      const result = await originalRealpath(candidate);
      if (path.resolve(candidate.toString()) !== parentPath) {
        return result;
      }
      parentRealpathCalls += 1;
      if (parentRealpathCalls === 2) {
        return originalRealpath(swappedParentPath);
      }
      return result;
    });

    try {
      await expect(fileSystem.writeFile('/write-parent/main.txt', 'replacement')).rejects.toMatchObject({
        code: 'ELOOP',
      });
      expect(await fs.readFile(path.join(parentPath, 'main.txt'), 'utf8')).toBe('inside');
      expect(await fs.readFile(path.join(outsideDirectory, 'main.txt'), 'utf8')).toBe('outside');
      const parentEntries = await fs.readdir(parentPath);
      expect(parentEntries.some((name) => name.endsWith('.tmp'))).toBe(false);
    } finally {
      realpathMock.mockImplementation(originalRealpath);
      await fs.unlink(swappedParentPath).catch(() => undefined);
      await fs.rm(outsideDirectory, { recursive: true, force: true });
    }
  });

  it('should validate both rename paths before changing the source', async () => {
    const fileSystem = unwrap(temporaryDirectory);
    await fileSystem.writeFile('/rename-guard.txt', 'keep');

    await expect(fileSystem.rename('/rename-guard.txt', '/../outside.txt')).rejects.toMatchObject({
      code: 'PATH_OUTSIDE_ROOT',
    });
    await expect(fileSystem.readFile('/rename-guard.txt', 'utf8')).resolves.toBe('keep');
  });
});
