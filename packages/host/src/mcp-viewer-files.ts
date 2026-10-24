/**
 * The project files the viewer page's Files pane lists (agent plugin workbench parity PAR-9).
 *
 * One `TreeIndex` per project folder, built by one breadth-first scan through the folder's `NodeFsProvider` and kept
 * current by that provider's recursive watch, so a file the agent, an editor or `sed` writes appears without another
 * walk. `.tau`, other dot-folders and dependency or build folders are never listed; `exports/` is. A change moves the
 * folder's version, which `app_sync` carries to the page as `filesVersion`, so the pane lists again.
 */

import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { TreeIndex } from '@taucad/filesystem';
import type { FileStat } from '@taucad/filesystem';
import { drainNodeFsProviderWatchClosures, NodeFsProvider } from '@taucad/filesystem/backend/node';
import type { NodeFsWatchEvent } from '@taucad/filesystem/backend/node';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { TauMcpViewerFailure } from '@taucad/mcp';
import type {
  TauViewerFileEntry,
  TauViewerListFilesInput,
  TauViewerListFilesResult,
  TauViewerMimeType,
} from '@taucad/mcp/viewer-protocol';

/** The page's own formats by extension; every other file it opens is a CAD source the runtime renders (blueprint D3). */
export const drawnFormats: Readonly<Record<string, TauViewerMimeType>> = {
  '.glb': 'model/gltf-binary',
  '.svg': 'image/svg+xml',
};

/**
 * Extensions of the CAD sources the viewer renders, and of the exchange formats the runtime converts to GLB like a
 * source (W7: the BRep kernel imports STEP, the mesh importer STL, 3MF and OBJ).
 */
export const sourceExtensions: ReadonlySet<string> = new Set([
  '.ts',
  '.js',
  '.mjs',
  '.jsx',
  '.tsx',
  '.scad',
  '.py',
  '.kcl',
  '.step',
  '.stp',
  '.stl',
  '.3mf',
  '.obj',
]);

/** Folders never listed at any depth, besides every folder whose name starts with a dot (`.tau`, `.git`). */
const skippedFolders: ReadonlySet<string> = new Set(['node_modules', 'dist', 'build', 'out', '__pycache__']);

/** Files one project's index holds at most, so a large checkout scans quickly. */
const fileLimit = 5000;

/** Entries one listing carries at most; the answer says when more matched. */
const entryLimit = 500;

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot).toLowerCase();
};

const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/**
 * Whether a project file is a CAD source or exchange format the viewer renders: not a test, declaration, config or
 * GeoSpec file beside the sources.
 *
 * @param path - Project-relative path.
 * @returns `true` for a renderable source.
 */
export const isSourcePath = (path: string): boolean => {
  const name = nameOf(path);
  return sourceExtensions.has(extensionOf(name)) && !/\.(?:test|spec|d|config|geospec)\.[a-z]+$/u.test(name);
};

/**
 * Whether the viewer can show a project file: a renderable source, or a file it draws itself.
 *
 * @param path - Project-relative path.
 * @returns `true` when `app_open_file` can show it.
 */
export const isOpenablePath = (path: string): boolean => isSourcePath(path) || extensionOf(path) in drawnFormats;

/**
 * Whether a project-relative path lies in a folder the listing never shows.
 *
 * @param path - Project-relative POSIX path.
 * @param isFolder - Whether the path itself is a folder, so its own name counts too.
 * @returns `true` for a hidden path.
 */
const isHiddenPath = (path: string, isFolder: boolean): boolean => {
  const segments = path.split('/');
  const folders = isFolder ? segments : segments.slice(0, -1);
  return folders.some((segment) => segment.startsWith('.') || skippedFolders.has(segment));
};

/** Timing knobs; tests shorten them. */
export type McpViewerFilesOptions = Readonly<{
  /** How long a change waits for the next before a listing's change promise settles. Milliseconds. */
  settle?: number;
}>;

/** The listings of one server process. */
export type McpViewerFiles = Readonly<{
  /** One folder of a project, or the files whose path contains a query; the first call indexes and watches it. */
  list(
    root: string,
    input: Pick<TauViewerListFilesInput, 'path' | 'query'>,
  ): Promise<TauViewerListFilesResult | TauMcpViewerFailure>;
  /** Every file path a project's index holds, for the source of a shown export. */
  paths(root: string): Promise<string[]>;
  /**
   * A listed project's file list now: its version, which moves at every change, and a promise that settles once the
   * files change and the changes settle. `undefined` before the project was listed.
   */
  listed(root: string): Readonly<{ version: number; changed: Promise<void> }> | undefined;
  /** Stop every watch and settle every pending change promise. */
  close(): Promise<void>;
}>;

type Folder = {
  readonly root: string;
  readonly provider: NodeFsProvider;
  readonly index: TreeIndex;
  version: number;
  truncated: boolean;
  /** Whether the watch runs; without it every listing scans again. */
  watched: boolean;
  unwatch?: () => void;
  /** Settles at the next change. */
  changed: Promise<void>;
  wake: () => void;
  settleTimer?: ReturnType<typeof setTimeout>;
};

/**
 * A listed file's index metadata from one `lstat`: the pane reads names and sizes only, so no file is opened and its
 * content kind is recorded as binary, never sniffed.
 *
 * @param absolute - The file's absolute path.
 * @returns Its metadata, or `undefined` for a link, a special file or one that went away.
 */
const fileStatOf = async (absolute: string): Promise<Extract<FileStat, { type: 'file' }> | undefined> => {
  const stats = await lstat(absolute).catch(() => undefined);
  return stats?.isFile() === true
    ? { type: 'file', size: stats.size, mtimeMs: stats.mtimeMs, contentKind: 'binary' }
    : undefined;
};

/**
 * Scan a folder breadth-first, so an index cut at the limit keeps the shallowest files. Plain `readdir` and `lstat`:
 * a link is never followed out of the project, and no file is opened. Indexing a 5000-file checkout (this repository)
 * took 0.3 to 0.5 s with the watch, against 4.8 to 6 s through the provider's line-counting listing.
 *
 * @param root - The project folder.
 * @returns The entries for the index, and whether files were left out.
 */
const scan = async (
  root: string,
): Promise<Readonly<{ entries: Array<{ path: string } & FileStat>; truncated: boolean }>> => {
  const entries: Array<{ path: string } & FileStat> = [];
  let files = 0;
  let truncated = false;
  let level = [''];
  while (level.length > 0) {
    const next: string[] = [];
    for (const folder of level) {
      // ponytail: an unreadable folder lists nothing rather than failing the whole listing.
      // oxlint-disable-next-line no-await-in-loop -- breadth-first and bounded: a level is read before the next.
      const rows = await readdir(join(root, folder), { withFileTypes: true }).catch(() => []);
      const kept: string[] = [];
      for (const row of rows) {
        const path = folder === '' ? row.name : `${folder}/${row.name}`;
        if (row.isDirectory()) {
          if (!isHiddenPath(path, true)) {
            entries.push({ path, type: 'dir', size: 0, mtimeMs: 0 });
            next.push(path);
          }
        } else if (row.isFile()) {
          if (files >= fileLimit) {
            truncated = true;
          } else {
            files += 1;
            kept.push(path);
          }
        }
      }
      // oxlint-disable-next-line no-await-in-loop -- one folder's stats at a time, in parallel within it.
      const stats = await Promise.all(kept.map(async (path) => fileStatOf(join(root, path))));
      for (const [index, path] of kept.entries()) {
        const stat = stats[index];
        if (stat !== undefined) {
          entries.push({ path, ...stat });
        }
      }
    }
    level = next;
  }
  return { entries, truncated };
};

/**
 * A listed folder path in the index's form, or why it cannot be listed.
 *
 * @param path - The folder the page asks for; `''` is the project root.
 * @returns The path without leading or trailing slashes, or a failure.
 */
const folderPathOf = (path: string): string | TauMcpViewerFailure => {
  if (path.startsWith('/') || path.includes('\\') || /^[a-z]:/iu.test(path) || path.split('/').includes('..')) {
    return { errorCode: 'PATH_OUTSIDE_PROJECT', message: `${path} is not a folder of the project.` };
  }
  return path.replace(/\/+$/u, '');
};

const compareEntries = (left: TauViewerFileEntry, right: TauViewerFileEntry): number =>
  left.isFolder === right.isFolder ? left.name.localeCompare(right.name) : left.isFolder ? -1 : 1;

/**
 * Create the listings of one `tau mcp` process.
 *
 * @param options - Timing knobs.
 * @returns The listings.
 */
export const createMcpViewerFiles = (options: McpViewerFilesOptions = {}): McpViewerFiles => {
  /** Milliseconds. */
  const settle = options.settle ?? 100;
  const folders = new Map<string, Promise<Folder>>();
  /** The folders opened so far, for the synchronous version and change reads. */
  const opened = new Map<string, Folder>();

  const rebuild = async (folder: Folder): Promise<void> => {
    const { entries, truncated } = await scan(folder.root);
    folder.index.build(entries);
    folder.truncated = truncated;
  };

  /** One change: the version moves now, and the change promise settles once the changes settle. */
  const touch = (folder: Folder): void => {
    folder.version += 1;
    clearTimeout(folder.settleTimer);
    folder.settleTimer = setTimeout(() => {
      folder.settleTimer = undefined;
      folder.wake();
    }, settle);
    /* A pending change must not keep `tau mcp` running after stdin closes. */
    folder.settleTimer.unref();
  };

  const arm = (folder: Folder): void => {
    folder.changed = new Promise((resolve) => {
      folder.wake = () => {
        arm(folder);
        resolve();
      };
    });
  };

  const apply = async (folder: Folder, event: NodeFsWatchEvent): Promise<void> => {
    if (event.type === 'reset') {
      await rebuild(folder);
      touch(folder);
      return;
    }
    if (isHiddenPath(event.path, event.type === 'change' && event.kind === 'dir')) {
      return;
    }
    if (event.type === 'delete') {
      const node = folder.index.stat(event.path);
      if (node === undefined) {
        return;
      }
      if (node.type === 'dir') {
        folder.index.removeDirectory(event.path);
      } else {
        folder.index.removeFile(event.path);
      }
      touch(folder);
      return;
    }
    if (event.kind === 'dir') {
      /* A folder moved in brings files no event names: scan again. */
      if (folder.index.stat(event.path) === undefined) {
        await rebuild(folder);
        touch(folder);
      }
      return;
    }
    const known = folder.index.stat(event.path) !== undefined;
    if (!known && folder.index.getDirectoryStat('').length >= fileLimit) {
      folder.truncated = true;
      return;
    }
    const stat = await fileStatOf(join(folder.root, event.path));
    if (stat === undefined) {
      return;
    }
    folder.index.addFile(event.path, stat);
    touch(folder);
  };

  const open = async (root: string): Promise<Folder> => {
    const folder: Folder = {
      root,
      provider: new NodeFsProvider(root, { policy: tauPathPolicy }),
      index: new TreeIndex(),
      version: 1,
      truncated: false,
      watched: false,
      changed: Promise.resolve(),
      wake: () => undefined,
    };
    arm(folder);
    /* Watch first, so nothing written during the scan is missed; events apply one at a time, in order. */
    let applying = Promise.resolve();
    try {
      folder.unwatch = await folder.provider.watch(
        { paths: [''], recursive: true, excludes: [...skippedFolders, '.tau', '.git'].map((name) => `${name}/**`) },
        (event) => {
          applying = applying.then(
            async () => apply(folder, event),
            async () => apply(folder, event),
          );
        },
      );
      folder.watched = true;
    } catch {
      /* A folder that cannot be watched (no native watcher, too many watches) is scanned on every listing. */
    }
    await rebuild(folder);
    opened.set(root, folder);
    return folder;
  };

  /** Open a folder once; one that failed to open is opened again by the next listing. */
  const openOnce = async (root: string): Promise<Folder> => {
    try {
      return await open(root);
    } catch (error) {
      folders.delete(root);
      throw error;
    }
  };

  const folderOf = async (root: string): Promise<Folder> => {
    let folder = folders.get(root);
    if (folder === undefined) {
      folder = openOnce(root);
      folders.set(root, folder);
    }
    return folder;
  };

  const entryOf = (path: string, isFolder: boolean, size: number | undefined): TauViewerFileEntry => ({
    name: nameOf(path),
    path,
    isFolder,
    ...(isFolder ? {} : { size }),
    renderable: !isFolder && isOpenablePath(path),
  });

  const answer = (folder: Folder, entries: TauViewerFileEntry[], cut: boolean): TauViewerListFilesResult => ({
    entries: entries.slice(0, entryLimit),
    truncated: cut || entries.length > entryLimit,
    filesVersion: folder.version,
  });

  return {
    async list(root, input) {
      const folder = await folderOf(root);
      if (!folder.watched) {
        await rebuild(folder);
        folder.version += 1;
      }
      if (input.query !== undefined) {
        const found = folder.index
          .searchFiles(input.query, {
            maxResults: entryLimit + 1,
            admits: (path, type) => !isHiddenPath(path, type === 'dir'),
          })
          .map(({ path, size }) => entryOf(path, false, size))
          .toSorted((left, right) => left.path.localeCompare(right.path));
        return answer(folder, found, folder.truncated);
      }
      const path = folderPathOf(input.path ?? '');
      if (typeof path !== 'string') {
        return path;
      }
      const node = folder.index.stat(path);
      if (node?.children === undefined || (path !== '' && isHiddenPath(path, true))) {
        return { errorCode: 'NOT_A_FOLDER', message: `${path} is not a folder the project lists.` };
      }
      const entries = [...node.children].map(([name, child]) =>
        entryOf(path === '' ? name : `${path}/${name}`, child.type === 'dir', child.size),
      );
      return answer(folder, entries.toSorted(compareEntries), folder.truncated);
    },
    async paths(root) {
      const folder = await folderOf(root);
      return folder.index.getDirectoryStat('').map(({ path }) => path);
    },
    listed(root) {
      const folder = opened.get(root);
      return folder === undefined ? undefined : { version: folder.version, changed: folder.changed };
    },
    async close() {
      const settled = await Promise.allSettled(folders.values());
      folders.clear();
      opened.clear();
      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
          const folder = outcome.value;
          clearTimeout(folder.settleTimer);
          folder.unwatch?.();
          folder.wake();
          folder.provider.dispose();
        }
      }
      await Promise.all(
        settled.map(async (outcome) =>
          outcome.status === 'fulfilled' ? drainNodeFsProviderWatchClosures(outcome.value.provider) : undefined,
        ),
      );
    },
  };
};
