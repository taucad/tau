/**
 * Transport-internal `fs.promises`-style filesystem handle factory.
 *
 * Produces the discriminated `inline`-arm {@link RuntimeFileSystemHandle}
 * backing the public `fromFsLike` factory in
 * `filesystem/runtime-filesystem.ts`. Also owns the {@link FsLike} public
 * type — re-exported from the filesystem barrel for consumers without
 * pulling them through the transport-internal surface.
 *
 * Spec/instance contract: `_fromFsLikeHandle(fsLike, rootPath)` returns
 * a plain-data spec whose `create()` factory mints a fresh adapter
 * wrapping the same user-supplied `fsLike` per binding. The underlying
 * `fsLike` is shared by reference (the user owns its lifecycle); the
 * adapter object itself is freshly built per `RuntimeClient` for shape
 * uniformity with the in-memory and Node FS factories.
 *
 * @internal
 */

import type { NativeStats } from '@taucad/types';
import { toFileStat } from '@taucad/types/constants';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';
import type { RuntimeFileSystemHandle } from '#transport/_internal/runtime-filesystem-handle.js';

/* oxlint-disable @protontech/enforce-uint8array-arraybuffer/enforce-uint8array-arraybuffer -- BrowserFS/memfs returns Buffer<ArrayBufferLike>, we must accept the wider type */
/**
 * Minimal interface for any fs-compatible object with a `promises` namespace.
 * Matches the shape of `fs` from BrowserFS, memfs, and similar
 * libraries without importing them directly.
 * Uses `ArrayBufferLike` to accept both `ArrayBuffer` and `SharedArrayBuffer`
 * (BrowserFS returns `Buffer<ArrayBufferLike>`).
 * @public
 */
export type FsLike = {
  promises: {
    readFile(path: string, encoding: 'utf8'): Promise<string>;
    readFile(path: string): Promise<Uint8Array>;
    writeFile(path: string, data: Uint8Array | string): Promise<void>;
    mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined | void>;
    readdir(path: string): Promise<string[]>;
    unlink(path: string): Promise<void>;
    rmdir(path: string): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
    stat(path: string): Promise<NativeStats>;
    lstat(path: string): Promise<NativeStats>;
  };
};
/* oxlint-enable @protontech/enforce-uint8array-arraybuffer/enforce-uint8array-arraybuffer -- re-enable after FsLike type */

/**
 * Internal: produce the discriminated `inline`-arm handle backing the
 * public `fromFsLike` factory. Captures `fsLike` and `rootPath` in the
 * spec closure; each `create()` invocation builds a fresh
 * `RuntimeFileSystemBase` adapter targeting the same backing object.
 *
 * @internal
 * @param fsLike - An fs-compatible object with a `promises` namespace.
 * @param rootPath - Optional root path prefix for all operations.
 */
export function _fromFsLikeHandle(fsLike: FsLike, rootPath = '/'): RuntimeFileSystemHandle {
  return {
    kind: 'inline',
    create: () => buildFsLikeBase(fsLike, rootPath),
  };
}

/**
 * Build a fresh `RuntimeFileSystemBase` adapter wrapping the supplied
 * `fsLike` rooted at `rootPath`. Per-binding adapter; underlying
 * `fsLike` is shared by reference (the user owns its lifecycle).
 */
function buildFsLikeBase(fsLike: FsLike, rootPath: string): RuntimeFileSystemBase {
  const resolve = (p: string): string => {
    if (rootPath === '/') {
      return p;
    }

    return p.startsWith('/') ? `${rootPath}${p}` : `${rootPath}/${p}`;
  };

  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(filePath: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    if (encoding) {
      return fsLike.promises.readFile(resolve(filePath), encoding);
    }

    const buf = await fsLike.promises.readFile(resolve(filePath));
    return new Uint8Array(buf);
  }

  return {
    id: 'runtime:fs-like',
    capabilities: { persistent: true, writable: true, quotaBased: false, caseSensitive: true },
    dispose() {
      /* The host FsLike owns the filesystem lifecycle; nothing for us to do here. */
    },
    readFile,
    async writeFile(filePath: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> {
      await fsLike.promises.writeFile(resolve(filePath), data);
    },
    async mkdir(directoryPath: string, options?: { recursive?: boolean }): Promise<void> {
      await fsLike.promises.mkdir(resolve(directoryPath), options);
    },
    async readdir(directoryPath: string): Promise<string[]> {
      return fsLike.promises.readdir(resolve(directoryPath));
    },
    async unlink(filePath: string): Promise<void> {
      await fsLike.promises.unlink(resolve(filePath));
    },
    async stat(filePath: string) {
      const stats = await fsLike.promises.stat(resolve(filePath));
      return toFileStat(stats);
    },
    async rmdir(directoryPath: string): Promise<void> {
      await fsLike.promises.rmdir(resolve(directoryPath));
    },
    async rename(oldPath: string, newPath: string): Promise<void> {
      await fsLike.promises.rename(resolve(oldPath), resolve(newPath));
    },
    async lstat(filePath: string) {
      const stats = await fsLike.promises.lstat(resolve(filePath));
      return toFileStat(stats);
    },
    async exists(filePath: string): Promise<boolean> {
      try {
        await fsLike.promises.stat(resolve(filePath));
        return true;
      } catch {
        return false;
      }
    },
  };
}
