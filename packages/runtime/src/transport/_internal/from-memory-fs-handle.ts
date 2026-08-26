/**
 * Transport-internal in-memory filesystem handle factory.
 *
 * Produces the discriminated `inline`-arm {@link RuntimeFileSystemHandle}
 * backing the public {@link fromMemoryFs} factory in
 * `filesystem/runtime-filesystem.ts`. Lives under `transport/_internal/`
 * so the public `@taucad/runtime/filesystem` surface exposes only the
 * opaque `RuntimeFileSystem` value, never the underlying handle shape.
 *
 * Spec/instance contract: `_fromMemoryFsHandle(seedFiles)` returns a
 * plain-data spec whose `create()` factory mints a fresh
 * {@link RuntimeFileSystemBase} per binding — every `RuntimeClient`
 * materialised from a single `fromMemoryFs(seed)` value gets its own
 * private in-memory store seeded from `seed`. Mutations are not shared
 * across clients. Mirrors the v6 transport callable-plugin lifetime
 * pattern (see
 * `docs/research/runtime-filesystem-spec-instance-harmonisation.md`).
 *
 * @internal
 */

import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';
import type { RuntimeFileSystemHandle } from '#transport/_internal/runtime-filesystem-handle.js';
import { fileStatFromBytes } from '@taucad/filesystem';
import { resolveVirtualPath } from '@taucad/utils/path';

function errno(code: string, message: string): Error {
  const error = new Error(message);
  (error as NodeJS.ErrnoException).code = code;
  return error;
}

function enoent(message: string): Error {
  return errno('ENOENT', message);
}

/**
 * Internal: produce the discriminated `inline`-arm handle backing the
 * public {@link fromMemoryFs} factory. Captures `seedFiles` in the spec
 * closure; each `create()` invocation builds a fresh in-memory store
 * seeded from the same files.
 *
 * @internal
 * @param files - Initial file contents (path to text or byte content)
 */
export function _fromMemoryFsHandle(files?: Record<string, string | Uint8Array<ArrayBuffer>>): RuntimeFileSystemHandle {
  /* Defensively snapshot the seed map at spec-construction time so that
   * callers who happen to mutate the supplied object after wrapping it
   * cannot retroactively change the seed observed by future `create()`
   * invocations. The snapshot is reused across every `create()` call. */
  const seedFiles = files
    ? Object.fromEntries(
        Object.entries(files).map(([path, content]) => [
          path,
          content instanceof Uint8Array ? new Uint8Array(content) : content,
        ]),
      )
    : undefined;
  return {
    kind: 'inline',
    create: () => buildMemoryFsBase(seedFiles),
  };
}

/**
 * Build a fresh, isolated in-memory `RuntimeFileSystemBase` seeded from
 * the supplied files. Each invocation owns its own `store` and
 * `directories` collections so two `RuntimeFileSystemBase` instances
 * built from the same spec do not share mutable state.
 */
function buildMemoryFsBase(
  seedFiles: Record<string, string | Uint8Array<ArrayBuffer>> | undefined,
): RuntimeFileSystemBase {
  const store = new Map<string, Uint8Array<ArrayBuffer> | string>();
  const directories = new Set<string>();

  if (seedFiles) {
    for (const [filePath, content] of Object.entries(seedFiles)) {
      const canonicalPath = resolveVirtualPath(filePath);
      store.set(canonicalPath, content);
      const parts = canonicalPath.split('/');
      for (let i = 1; i < parts.length; i++) {
        directories.add(parts.slice(0, i).join('/'));
      }
    }
  }

  directories.add('/');

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(filePath: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const canonicalPath = resolveVirtualPath(filePath);
    const content = store.get(canonicalPath);
    if (content === undefined) {
      throw enoent(`ENOENT: no such file: ${canonicalPath}`);
    }

    if (encoding === 'utf8') {
      return typeof content === 'string' ? content : decoder.decode(content);
    }

    // Always return a fresh Uint8Array. The bridge transfers `result.buffer`
    // after every readFile, so handing out the stored reference would detach
    // our own copy and break every subsequent read.
    return typeof content === 'string' ? encoder.encode(content) : new Uint8Array(content);
  }

  return {
    id: 'runtime:memory',
    capabilities: { persistent: false, writable: true, quotaBased: false },
    dispose() {
      store.clear();
      directories.clear();
    },
    readFile,
    async writeFile(filePath, data) {
      const canonicalPath = resolveVirtualPath(filePath);
      store.set(canonicalPath, data);
      const parts = canonicalPath.split('/');
      for (let i = 1; i < parts.length; i++) {
        directories.add(parts.slice(0, i).join('/'));
      }
    },
    async mkdir(directoryPath, options) {
      const canonicalPath = resolveVirtualPath(directoryPath);
      /* `options.recursive` was previously ignored, so `mkdir` never reported
       * EEXIST or a missing parent and diverged from every other adapter. */
      if (store.has(canonicalPath) || directories.has(canonicalPath)) {
        if (options?.recursive === true) {
          return;
        }
        throw errno('EEXIST', `EEXIST: file already exists: ${canonicalPath}`);
      }
      const parts = canonicalPath.split('/');
      if (options?.recursive !== true) {
        const parent = parts.slice(0, -1).join('/') || '/';
        if (!directories.has(parent)) {
          throw enoent(`ENOENT: no such file or directory: ${canonicalPath}`);
        }
      }
      directories.add(canonicalPath);
      for (let i = 1; i < parts.length; i++) {
        directories.add(parts.slice(0, i).join('/'));
      }
    },
    async readdir(directoryPath) {
      const canonicalPath = resolveVirtualPath(directoryPath);
      const prefix = canonicalPath === '/' ? '/' : `${canonicalPath}/`;
      const entries = new Set<string>();
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const slash = rest.indexOf('/');
          entries.add(slash === -1 ? rest : rest.slice(0, slash));
        }
      }

      for (const directory of directories) {
        if (directory.startsWith(prefix)) {
          const rest = directory.slice(prefix.length);
          const slash = rest.indexOf('/');
          entries.add(slash === -1 ? rest : rest.slice(0, slash));
        }
      }

      return [...entries].filter(Boolean);
    },
    async unlink(filePath) {
      const canonicalPath = resolveVirtualPath(filePath);
      if (!store.has(canonicalPath) && directories.has(canonicalPath)) {
        throw errno('EISDIR', `EISDIR: illegal operation on a directory: ${canonicalPath}`);
      }
      store.delete(canonicalPath);
    },
    async stat(filePath) {
      const canonicalPath = resolveVirtualPath(filePath);
      if (store.has(canonicalPath)) {
        const content = store.get(canonicalPath)!;
        const bytes = typeof content === 'string' ? encoder.encode(content) : content;
        return fileStatFromBytes(bytes, Date.now());
      }

      if (directories.has(canonicalPath)) {
        return { type: 'dir', size: 0, mtimeMs: Date.now() };
      }

      throw enoent(`ENOENT: no such file or directory: ${canonicalPath}`);
    },
    async rmdir(directoryPath) {
      /* Previously an unconditional delete: it removed files, removed
       * non-empty directories, and silently succeeded on missing paths. */
      const canonicalPath = resolveVirtualPath(directoryPath);
      if (store.has(canonicalPath)) {
        throw errno('ENOTDIR', `ENOTDIR: not a directory: ${canonicalPath}`);
      }
      if (!directories.has(canonicalPath)) {
        throw enoent(`ENOENT: no such file or directory: ${canonicalPath}`);
      }
      const prefix = canonicalPath === '/' ? '/' : `${canonicalPath}/`;
      const hasChild = [...store.keys(), ...directories].some((key) => key !== canonicalPath && key.startsWith(prefix));
      if (hasChild) {
        throw errno('ENOTEMPTY', `ENOTEMPTY: directory not empty: ${canonicalPath}`);
      }
      directories.delete(canonicalPath);
    },
    async rename(oldPath, newPath) {
      const canonicalOldPath = resolveVirtualPath(oldPath);
      const canonicalNewPath = resolveVirtualPath(newPath);
      const content = store.get(canonicalOldPath);
      if (content !== undefined) {
        store.set(canonicalNewPath, content);
        store.delete(canonicalOldPath);
      } else if (directories.has(canonicalOldPath)) {
        const oldPrefix = `${canonicalOldPath}/`;
        const newPrefix = `${canonicalNewPath}/`;
        for (const [filePath, fileContent] of new Map(store)) {
          if (filePath.startsWith(oldPrefix)) {
            store.delete(filePath);
            store.set(`${newPrefix}${filePath.slice(oldPrefix.length)}`, fileContent);
          }
        }
        for (const directoryPath of new Set(directories)) {
          if (directoryPath === canonicalOldPath || directoryPath.startsWith(oldPrefix)) {
            directories.delete(directoryPath);
            directories.add(
              directoryPath === canonicalOldPath
                ? canonicalNewPath
                : `${newPrefix}${directoryPath.slice(oldPrefix.length)}`,
            );
          }
        }
      } else {
        throw enoent(`ENOENT: no such file or directory: ${canonicalOldPath}`);
      }
    },
    async lstat(filePath) {
      const canonicalPath = resolveVirtualPath(filePath);
      if (store.has(canonicalPath)) {
        const content = store.get(canonicalPath)!;
        const bytes = typeof content === 'string' ? encoder.encode(content) : content;
        return fileStatFromBytes(bytes, Date.now());
      }

      if (directories.has(canonicalPath)) {
        return { type: 'dir', size: 0, mtimeMs: Date.now() };
      }

      throw enoent(`ENOENT: no such file or directory: ${canonicalPath}`);
    },
    async exists(filePath) {
      const canonicalPath = resolveVirtualPath(filePath);
      return store.has(canonicalPath) || directories.has(canonicalPath);
    },
  };
}
