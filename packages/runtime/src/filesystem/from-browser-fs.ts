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
import { resolveVirtualPath } from '@taucad/utils/path';

const enoent = (path: string): Error => {
  const error = new Error(`ENOENT: no such file or directory: ${path}`);
  (error as NodeJS.ErrnoException).code = 'ENOENT';
  return error;
};

const eisdir = (path: string): Error => {
  const error = new Error(`EISDIR: illegal operation on a directory: ${path}`);
  (error as NodeJS.ErrnoException).code = 'EISDIR';
  return error;
};

const isMissingEntryError = (error: unknown): boolean => {
  if (error instanceof DOMException) {
    return error.name === 'NotFoundError' || error.name === 'TypeMismatchError';
  }
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
};

const splitPath = (path: string): string[] =>
  resolveVirtualPath(path)
    .split('/')
    .filter((segment) => segment.length > 0);

const getDirectory = async (
  root: FileSystemDirectoryHandle,
  segments: string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle> => {
  let current = root;
  for (const segment of segments) {
    try {
      current = await current.getDirectoryHandle(segment, { create });
    } catch (error) {
      if (isMissingEntryError(error)) {
        throw enoent(segments.join('/'));
      }
      throw error;
    }
  }
  return current;
};

/**
 * Wrap a `FileSystemDirectoryHandle` (File System Access API) as the
 * opaque {@link RuntimeFileSystem} value passed to
 * `createRuntimeClient({ fileSystem })`.
 *
 * @param root - Browser directory capability exposed as runtime `/`, returned by
 *   `window.showDirectoryPicker()` or
 *   `navigator.storage.getDirectory()`. Runtime paths are resolved through
 *   this handle and do not imply that a portable host OS path exists.
 *
 * @returns The wrapped `RuntimeFileSystem` handle.
 *
 * @public
 *
 * @example <caption>Bind an FS Access root to the runtime</caption>
 * ```typescript
 * import { createRuntimeClient } from '@taucad/runtime';
 * import { webWorkerTransport } from '@taucad/runtime/transport/web';
 * import { fromBrowserFs } from '@taucad/runtime/filesystem/browser';
 *
 * declare const window: { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> };
 * const root = await window.showDirectoryPicker();
 * const client = createRuntimeClient({
 *   transport: webWorkerTransport({
 *     createWorker: () => new Worker(new URL('./runtime.worker.ts', import.meta.url), { type: 'module' }),
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
    capabilities: { persistent: true, writable: true, quotaBased: true },
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
      } catch (error) {
        if (isMissingEntryError(error)) {
          throw enoent(filePath);
        }
        throw error;
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
        return { type: 'dir', size: 0, mtimeMs: 0 };
      }
      const last = segments.at(-1)!;
      const parentSegments = segments.slice(0, -1);
      const directory = await getDirectory(root, parentSegments, false);
      try {
        const fileHandle = await directory.getFileHandle(last, { create: false });
        const file = await fileHandle.getFile();
        return { type: 'file', size: file.size, mtimeMs: file.lastModified, contentKind: 'binary' };
      } catch (fileError) {
        if (!isMissingEntryError(fileError)) {
          throw fileError;
        }
        try {
          await directory.getDirectoryHandle(last, { create: false });
          return { type: 'dir', size: 0, mtimeMs: 0 };
        } catch (directoryError) {
          if (!isMissingEntryError(directoryError)) {
            throw directoryError;
          }
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
      const canonicalOldPath = resolveVirtualPath(oldPath);
      const canonicalNewPath = resolveVirtualPath(newPath);
      const sourceStat = await this.stat(canonicalOldPath);
      if (sourceStat.type === 'dir') {
        throw eisdir(canonicalOldPath);
      }
      const data = await (this.readFile as (p: string) => Promise<Uint8Array<ArrayBuffer>>)(canonicalOldPath);
      await this.writeFile(canonicalNewPath, data);
      await this.unlink(canonicalOldPath);
    },
    async lstat(filePath) {
      return this.stat(filePath);
    },
    async exists(filePath) {
      const canonicalPath = resolveVirtualPath(filePath);
      try {
        await this.stat(canonicalPath);
        return true;
      } catch (error) {
        if (isMissingEntryError(error)) {
          return false;
        }
        throw error;
      }
    },
  };

  return fs;
}
