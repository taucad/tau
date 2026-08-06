/**
 * Canonical runtime filesystem decoration.
 *
 * Runtime backends implement only provider primitives (plus an optional watch
 * channel transported separately). This module confines every primitive path
 * and synthesizes the four helpers consumed inside the kernel worker.
 */

import type { FileStat, FileStatEntry } from '@taucad/types';
import { resolveVirtualPath } from '@taucad/utils/path';
import { isNotFoundError } from '#filesystem/filesystem-errors.js';
import type { KernelFileSystem, RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';

const existingFileError = (path: string): NodeJS.ErrnoException => {
  const error = new Error(`EEXIST: a file already exists at '${path}'`) as NodeJS.ErrnoException;
  error.code = 'EEXIST';
  return error;
};

/**
 * Decorate one primitive runtime backend with canonical path confinement and
 * the helpers used by kernel code.
 *
 * Provider watch remains on the transport boundary; it is not copied onto the
 * kernel-facing facade. Backends cannot override helpers and bypass this
 * canonicalization boundary.
 *
 * @param base - Primitive filesystem implementation supplied by a transport.
 * @returns Kernel-facing filesystem with canonical primitives and helpers.
 */
export function createRuntimeFileSystem(base: RuntimeFileSystemBase): KernelFileSystem {
  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const canonicalPath = resolveVirtualPath(path);
    return encoding === 'utf8' ? base.readFile(canonicalPath, 'utf8') : base.readFile(canonicalPath);
  }

  const writeFile = async (path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> =>
    base.writeFile(resolveVirtualPath(path), data);
  const readdir = async (path: string): Promise<string[]> => base.readdir(resolveVirtualPath(path));
  const stat = async (path: string): Promise<FileStat> => base.stat(resolveVirtualPath(path));
  const mkdir = async (path: string, options?: { recursive?: boolean }): Promise<void> =>
    base.mkdir(resolveVirtualPath(path), options);
  const unlink = async (path: string): Promise<void> => base.unlink(resolveVirtualPath(path));
  const rmdir = async (path: string): Promise<void> => base.rmdir(resolveVirtualPath(path));
  const rename = async (from: string, to: string): Promise<void> =>
    base.rename(resolveVirtualPath(from), resolveVirtualPath(to));
  const exists = async (path: string): Promise<boolean> => base.exists(resolveVirtualPath(path));
  const lstat = async (path: string): Promise<FileStat> => base.lstat(resolveVirtualPath(path));

  const readFiles = async (paths: string[]): Promise<Record<string, Uint8Array<ArrayBuffer>>> => {
    const entries = await Promise.all(paths.map(async (path) => [path, await readFile(path)] as const));
    return Object.fromEntries(entries);
  };

  const readdirContents = async (directoryPath: string): Promise<Record<string, Uint8Array<ArrayBuffer>>> => {
    const directory = resolveVirtualPath(directoryPath);
    const names = await readdir(directory);
    const entries = await Promise.all(
      names.map(async (name) => {
        const path = resolveVirtualPath(`${directory === '/' ? '' : directory}/${name}`);
        const fileStat = await stat(path);
        return fileStat.type === 'dir' ? undefined : ([name, await readFile(path)] as const);
      }),
    );
    return Object.fromEntries(
      entries.filter((entry): entry is readonly [string, Uint8Array<ArrayBuffer>] => entry !== undefined),
    );
  };

  const readdirStat = async (directoryPath: string): Promise<FileStatEntry[]> => {
    const directory = resolveVirtualPath(directoryPath);
    const names = await readdir(directory);
    return Promise.all(
      names.map(async (name) => {
        const path = resolveVirtualPath(`${directory === '/' ? '' : directory}/${name}`);
        return { ...(await stat(path)), name, path };
      }),
    );
  };

  const ensureDirectory = async (path: string): Promise<void> => {
    const canonicalPath = resolveVirtualPath(path);
    try {
      const existing = await stat(canonicalPath);
      if (existing.type === 'dir') {
        return;
      }
      throw existingFileError(canonicalPath);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
    await mkdir(canonicalPath, { recursive: true });
  };

  return {
    id: base.id,
    capabilities: base.capabilities,
    dispose: base.dispose.bind(base),
    readFile,
    writeFile,
    readdir,
    stat,
    lstat,
    mkdir,
    unlink,
    rmdir,
    rename,
    exists,
    readFiles,
    readdirContents,
    readdirStat,
    ensureDir: ensureDirectory,
  };
}
