/**
 * R20 — assert that `@taucad/runtime/filesystem/browser` is a real
 * subpath that returns an opaque {@link RuntimeFileSystem} brand.
 *
 * The subpath isolates the FS Access API entry point so browser apps
 * can tree-shake away the rest of the filesystem barrel and so the
 * eager `from-browser-fs` import does not pull `FileSystemDirectoryHandle`
 * symbols into Node-only consumer bundles.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';

import { isRuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import { resolveRuntimeFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';

describe('filesystem/browser subpath (R20)', () => {
  it('exposes only the public fromBrowserFs factory', async () => {
    const subpath = await import('#filesystem/from-browser-fs.js');
    expect(subpath.fromBrowserFs).toBeTypeOf('function');
    const exported = Object.keys(subpath).sort();
    expect(exported).toEqual(['fromBrowserFs']);
  });

  it('returns an opaque RuntimeFileSystem brand from the subpath', async () => {
    const { fromBrowserFs } = await import('#filesystem/from-browser-fs.js');

    const stubRoot = {
      kind: 'directory',
      name: 'root',
      async *entries() {
        yield* [];
      },
      async getDirectoryHandle() {
        throw new Error('stub');
      },
      async getFileHandle() {
        throw new Error('stub');
      },
      async removeEntry() {
        await Promise.resolve();
      },
    } as unknown as FileSystemDirectoryHandle;

    const fs = fromBrowserFs(stubRoot);
    expect(isRuntimeFileSystem(fs)).toBe(true);
  });

  /* The above-root traversal table moved to the shared adapter conformance
   * suite (`filesystem/adapter-conformance.test.ts`), which runs the same
   * eleven operations against every adapter instead of this one. */

  it('preserves permission failures from directory traversal', async () => {
    const denied = new DOMException('permission denied', 'NotAllowedError');
    const root = {
      kind: 'directory',
      name: 'root',
      getDirectoryHandle: vi.fn().mockRejectedValue(denied),
    } as unknown as FileSystemDirectoryHandle;
    const { fromBrowserFs } = await import('#filesystem/from-browser-fs.js');
    const handle = resolveRuntimeFileSystem(fromBrowserFs(root));
    if (handle.kind !== 'inline') {
      throw new Error('fromBrowserFs must produce an inline filesystem handle.');
    }

    await expect(handle.create().stat('/locked/file.ts')).rejects.toBe(denied);
  });

  it('stats files without reading bytes, reports stable directory mtimes, and rejects directory rename', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(8));
    const file = { size: 8, lastModified: 1234, arrayBuffer } as unknown as File;
    const fileHandle = { kind: 'file', name: 'file.ts', getFile: vi.fn(async () => file) };
    const directoryHandle = { kind: 'directory', name: 'directory' };
    const root = {
      kind: 'directory',
      name: 'root',
      getFileHandle: vi.fn(async (name: string) => {
        if (name === 'file.ts') {
          return fileHandle;
        }
        throw new DOMException('not a file', 'TypeMismatchError');
      }),
      getDirectoryHandle: vi.fn(async (name: string) => {
        if (name === 'directory') {
          return directoryHandle;
        }
        throw new DOMException('missing', 'NotFoundError');
      }),
      removeEntry: vi.fn(),
    } as unknown as FileSystemDirectoryHandle;
    const { fromBrowserFs } = await import('#filesystem/from-browser-fs.js');
    const handle = resolveRuntimeFileSystem(fromBrowserFs(root));
    if (handle.kind !== 'inline') {
      throw new Error('fromBrowserFs must produce an inline filesystem handle.');
    }
    const fileSystem = handle.create();

    await expect(fileSystem.stat('/')).resolves.toEqual({ type: 'dir', size: 0, mtimeMs: 0 });
    await expect(fileSystem.stat('/file.ts')).resolves.toEqual({
      type: 'file',
      size: 8,
      mtimeMs: 1234,
      contentKind: 'binary',
    });
    await expect(fileSystem.stat('/directory')).resolves.toEqual({ type: 'dir', size: 0, mtimeMs: 0 });
    expect(arrayBuffer).not.toHaveBeenCalled();
    await expect(fileSystem.rename('/directory', '/renamed')).rejects.toMatchObject({ code: 'EISDIR' });
    expect(root.removeEntry).not.toHaveBeenCalled();
  });
});
