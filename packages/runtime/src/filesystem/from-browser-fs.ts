/**
 * `fromBrowserFs` — wrap a `FileSystemDirectoryHandle` (File System
 * Access API) as an opaque {@link RuntimeFileSystem}.
 *
 * Used by browser apps that want the runtime to operate against an
 * in-place project directory selected via
 * `window.showDirectoryPicker()` instead of an in-memory snapshot.
 *
 * The implementation walks the supplied root handle on demand to back
 * each `RuntimeFileSystemBase` operation. No content is copied into a
 * staging area; reads and writes go through the FS Access API directly.
 *
 * @public
 */

import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';
import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import { wrapAsRuntimeFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';

const enoent = (path: string): Error => {
  const error = new Error(`ENOENT: no such file or directory: ${path}`);
  (error as NodeJS.ErrnoException).code = 'ENOENT';
  return error;
};

const splitPath = (path: string): string[] => path.split('/').filter((segment) => segment.length > 0);

const getDirectory = async (
  root: FileSystemDirectoryHandle,
  segments: string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle> => {
  let current = root;
  for (const segment of segments) {
    try {
      current = await current.getDirectoryHandle(segment, { create });
    } catch {
      throw enoent(segments.join('/'));
    }
  }
  return current;
};

/**
 * Wrap a `FileSystemDirectoryHandle` (File System Access API) as the
 * opaque {@link RuntimeFileSystem} value passed to
 * `createRuntimeClient({ fileSystem })`.
 *
 * @param root - The root directory handle returned by
 *   `window.showDirectoryPicker()` or
 *   `navigator.storage.getDirectory()`.
 *
 * @returns The wrapped `RuntimeFileSystem` handle.
 *
 * @public
 *
 * @example <caption>Bind an FS Access root to the runtime</caption>
 * ```typescript
 * import { createRuntimeClient } from '@taucad/runtime';
 * import { webWorkerTransport } from '@taucad/runtime/transport/web';
 * import { fromBrowserFs } from '@taucad/runtime/filesystem';
 * import { replicad } from '@taucad/runtime/kernels';
 *
 * declare const window: { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> };
 * const root = await window.showDirectoryPicker();
 * const client = createRuntimeClient({
 *   kernels: [replicad()],
 *   transport: webWorkerTransport({
 *     fileSystem: fromBrowserFs(root),
 *   }),
 * });
 * ```
 */
export const fromBrowserFs = (root: FileSystemDirectoryHandle): RuntimeFileSystem => {
  /* Spec/instance contract: capture `root` in the spec closure; mint a
   * fresh adapter per binding via `create()`. The underlying FS Access
   * API directory handle is shared by reference (the host owns its
   * lifecycle), mirroring `fromNodeFs` / `fromFsLike` shape uniformity
   * — see
   * `docs/research/runtime-filesystem-spec-instance-harmonisation.md`. */
  return wrapAsRuntimeFileSystem({
    kind: 'inline',
    create: () => buildBrowserFsBase(root),
  });
};

/**
 * Build a fresh `RuntimeFileSystemBase` adapter wrapping the supplied
 * `FileSystemDirectoryHandle`. Per-binding adapter; underlying directory
 * handle is shared by reference.
 */
function buildBrowserFsBase(root: FileSystemDirectoryHandle): RuntimeFileSystemBase {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const fs: RuntimeFileSystemBase = {
    id: 'runtime:browser-fs',
    capabilities: { persistent: true, writable: true, quotaBased: true, caseSensitive: true },
    dispose() {
      /* The host owns the FileSystemDirectoryHandle lifecycle. */
    },
    /* @ts-expect-error overload signature widening — runtime checks `encoding` to discriminate. */
    async readFile(filePath: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
      const segments = splitPath(filePath);
      const filename = segments.pop();
      if (!filename) {
        throw enoent(filePath);
      }
      const directory = await getDirectory(root, segments, false);
      let fileHandle: FileSystemFileHandle;
      try {
        fileHandle = await directory.getFileHandle(filename, { create: false });
      } catch {
        throw enoent(filePath);
      }
      const file = await fileHandle.getFile();
      const buffer = new Uint8Array(await file.arrayBuffer());
      return encoding === 'utf8' ? decoder.decode(buffer) : buffer;
    },
    async writeFile(filePath, data) {
      const segments = splitPath(filePath);
      const filename = segments.pop();
      if (!filename) {
        throw enoent(filePath);
      }
      const directory = await getDirectory(root, segments, true);
      const fileHandle = await directory.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      const payload = typeof data === 'string' ? encoder.encode(data) : data;
      await writable.write(payload);
      await writable.close();
    },
    async mkdir(directoryPath) {
      await getDirectory(root, splitPath(directoryPath), true);
    },
    async readdir(directoryPath) {
      const directory = await getDirectory(root, splitPath(directoryPath), false);
      const entries: string[] = [];
      for await (const [name] of (
        directory as unknown as { entries: () => AsyncIterableIterator<[string, FileSystemHandle]> }
      ).entries()) {
        entries.push(name);
      }
      return entries;
    },
    async unlink(filePath) {
      const segments = splitPath(filePath);
      const filename = segments.pop();
      if (!filename) {
        throw enoent(filePath);
      }
      const directory = await getDirectory(root, segments, false);
      await directory.removeEntry(filename);
    },
    async stat(filePath) {
      const segments = splitPath(filePath);
      if (segments.length === 0) {
        return { type: 'dir', size: 0, mtimeMs: Date.now() };
      }
      const last = segments.at(-1)!;
      const parentSegments = segments.slice(0, -1);
      const directory = await getDirectory(root, parentSegments, false);
      try {
        const fileHandle = await directory.getFileHandle(last, { create: false });
        const file = await fileHandle.getFile();
        return { type: 'file', size: file.size, mtimeMs: file.lastModified };
      } catch {
        try {
          await directory.getDirectoryHandle(last, { create: false });
          return { type: 'dir', size: 0, mtimeMs: Date.now() };
        } catch {
          throw enoent(filePath);
        }
      }
    },
    async rmdir(directoryPath) {
      const segments = splitPath(directoryPath);
      const last = segments.pop();
      if (!last) {
        throw enoent(directoryPath);
      }
      const directory = await getDirectory(root, segments, false);
      await directory.removeEntry(last, { recursive: true });
    },
    async rename(oldPath, newPath) {
      const data = await (this.readFile as (p: string) => Promise<Uint8Array<ArrayBuffer>>)(oldPath);
      await this.writeFile(newPath, data);
      await this.unlink(oldPath);
    },
    async lstat(filePath) {
      return this.stat(filePath);
    },
    async exists(filePath) {
      try {
        await this.stat(filePath);
        return true;
      } catch {
        return false;
      }
    },
  };

  return fs;
}
