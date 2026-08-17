/**
 * Directory-entry helpers shared by the path-index providers and by callers
 * that must tolerate a provider without `readdirEntries`.
 */

import type { DirectoryEntry, FileStat } from '#types.js';

/**
 * Derive immediate children with their kinds from a path-keyed index.
 * A file path with a deeper segment identifies its first segment as a directory.
 *
 * @param prefix - Directory prefix ending in `/`.
 * @param filePaths - Every known file path.
 * @param directoryPaths - Every known directory path.
 * @returns Immediate children with kinds, in file-then-directory discovery order.
 * @public
 */
export function indexDirectoryEntries(
  prefix: string,
  filePaths: Iterable<string>,
  directoryPaths: Iterable<string>,
): DirectoryEntry[] {
  const kinds = new Map<string, 'file' | 'dir'>();

  for (const filePath of filePaths) {
    if (filePath.startsWith(prefix)) {
      const rest = filePath.slice(prefix.length);
      const separator = rest.indexOf('/');
      const name = separator === -1 ? rest : rest.slice(0, separator);
      if (name) {
        kinds.set(name, separator === -1 ? 'file' : 'dir');
      }
    }
  }

  for (const directoryPath of directoryPaths) {
    if (directoryPath.startsWith(prefix)) {
      const name = directoryPath.slice(prefix.length).split('/')[0];
      if (name) {
        kinds.set(name, 'dir');
      }
    }
  }

  return [...kinds].map(([name, kind]) => ({ name, kind }));
}

/**
 * Read a directory's children with kinds, falling back to `readdir` plus a
 * `stat` per child for providers that do not implement `readdirEntries`.
 *
 * @param provider - Provider to enumerate.
 * @param path - Absolute directory path.
 * @returns Immediate children with kinds.
 * @public
 */
export async function readDirectoryEntries(
  provider: {
    readdir(path: string): Promise<string[]>;
    stat(path: string): Promise<FileStat>;
    readdirEntries?(path: string): Promise<DirectoryEntry[]>;
  },
  path: string,
): Promise<DirectoryEntry[]> {
  if (provider.readdirEntries) {
    return provider.readdirEntries(path);
  }
  const names = await provider.readdir(path);
  const base = path === '/' ? '' : path;
  return Promise.all(
    names.map(async (name) => {
      const stat = await provider.stat(`${base}/${name}`);
      return { name, kind: stat.type === 'dir' ? 'dir' : 'file' } satisfies DirectoryEntry;
    }),
  );
}
