import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { _fromNodeFsHandle as fromNodeFS } from '#transport/_internal/from-node-fs-handle.js';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';

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

    await fileSystem.writeFile('roundtrip.txt', 'hello world');
    const content = await fileSystem.readFile('roundtrip.txt', 'utf8');
    expect(content).toBe('hello world');
  });

  it('should read file as utf8 string', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.writeFile('utf8.txt', 'text content');
    const content = await fileSystem.readFile('utf8.txt', 'utf8');
    expect(content).toBe('text content');
  });

  it('should read file as Uint8Array', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.writeFile('binary.txt', 'bytes');
    const content = await fileSystem.readFile('binary.txt');
    expect(content).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(content)).toBe('bytes');
  });

  it('should create directory with mkdir', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.mkdir('subdir', { recursive: true });
    const stat = await fileSystem.stat('subdir');
    expect(stat.type).toBe('dir');
  });

  it('should list directory entries with readdir', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    const entries = await fileSystem.readdir('.');
    expect(entries).toContain('roundtrip.txt');
    expect(entries).toContain('subdir');
  });

  it('should return file stats with stat', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    const stat = await fileSystem.stat('roundtrip.txt');
    expect(stat.type).toBe('file');
    expect(stat.size).toBeGreaterThan(0);
    expect(stat.mtimeMs).toBeTypeOf('number');
  });

  it('should return file stats with lstat', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    const stat = await fileSystem.lstat('roundtrip.txt');
    expect(stat.type).toBe('file');
    expect(stat.size).toBeGreaterThan(0);
  });

  it('should rename a file', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.writeFile('rename-src.txt', 'move me');
    await fileSystem.rename('rename-src.txt', 'rename-dst.txt');

    expect(await fileSystem.exists('rename-src.txt')).toBe(false);
    const content = await fileSystem.readFile('rename-dst.txt', 'utf8');
    expect(content).toBe('move me');
  });

  it('should delete a file with unlink', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.writeFile('delete-me.txt', 'gone');
    await fileSystem.unlink('delete-me.txt');
    expect(await fileSystem.exists('delete-me.txt')).toBe(false);
  });

  it('should remove directory with rmdir', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.mkdir('rmdir-test');
    await fileSystem.rmdir('rmdir-test');
    expect(await fileSystem.exists('rmdir-test')).toBe(false);
  });

  it('should return true for existing file via exists', async () => {
    const fileSystem = unwrap(temporaryDirectory);

    await fileSystem.writeFile('exists-test.txt', 'here');
    expect(await fileSystem.exists('exists-test.txt')).toBe(true);
  });

  it('should return false for nonexistent file via exists', async () => {
    const fileSystem = unwrap(temporaryDirectory);
    expect(await fileSystem.exists('not-here.txt')).toBe(false);
  });

  it('should resolve paths relative to basePath', async () => {
    await fs.mkdir(path.join(temporaryDirectory, 'nested'), { recursive: true });
    await fs.writeFile(path.join(temporaryDirectory, 'nested', 'deep.txt'), 'deep content');

    const fileSystem = unwrap(temporaryDirectory);
    const content = await fileSystem.readFile('nested/deep.txt', 'utf8');
    expect(content).toBe('deep content');
  });

  it('should map VFS-root-leading paths under basePath, not host filesystem root', async () => {
    await fs.writeFile(path.join(temporaryDirectory, 'vfs-root.txt'), 'vfs');
    const fileSystem = unwrap(temporaryDirectory);
    expect(await fileSystem.readFile('/vfs-root.txt', 'utf8')).toBe('vfs');
  });
});
