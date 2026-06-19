import type { FileContentMetadata, FileStat, FileStatEntry } from '@taucad/types';
import { fileMetadataFields } from '#content-metadata.js';

const defaultSearchMaxResults = 100;

/**
 * Node in the in-memory file tree.
 * @public
 */
export type TreeNode =
  | ({
      type: 'file';
      size: number;
      mtimeMs: number;
      children?: undefined;
    } & FileContentMetadata)
  | {
      type: 'dir';
      size: number;
      mtimeMs: number;
      children: Map<string, TreeNode>;
    };

/**
 * In-memory file tree for O(1) metadata queries.
 *
 * Replaces recursive `readdir` + `stat` calls (which each create an IDB transaction)
 * with a single in-memory lookup. Built once from a provider scan, then updated
 * incrementally on every write/delete/rename.
 *
 * When used from {@link WorkspaceFileService}, paths are **relative to the first full
 * `getDirectoryStat` scan root** (not host absolute paths like `/projects/id/...`).
 *
 * @public
 */
export class InMemoryFileTree {
  private _root: TreeNode = { type: 'dir', size: 0, mtimeMs: 0, children: new Map() };
  private _built = false;

  /**
   * Whether the tree has been populated.
   * @returns `true` if the tree has been built.
   */
  public get isBuilt(): boolean {
    return this._built;
  }

  /**
   * Build the tree from a flat list of file stat entries (as returned by a
   * recursive provider scan). Clears existing state first.
   *
   * @param entries - Flat file entries with relative paths and metadata.
   */
  public build(entries: Array<{ path: string } & FileStat>): void {
    this._root = { type: 'dir', size: 0, mtimeMs: 0, children: new Map() };

    for (const entry of entries) {
      const segments = entry.path.split('/').filter(Boolean);
      this._ensurePath(segments.slice(0, -1));

      const parent = this._resolve(segments.slice(0, -1));
      if (!parent?.children) {
        continue;
      }

      const name = segments.at(-1);
      if (!name) {
        continue;
      }

      if (entry.type === 'dir') {
        if (!parent.children.has(name)) {
          parent.children.set(name, {
            type: 'dir',
            size: 0,
            mtimeMs: entry.mtimeMs,
            children: new Map(),
          });
        }
      } else {
        parent.children.set(name, {
          type: 'file',
          size: entry.size,
          mtimeMs: entry.mtimeMs,
          ...fileMetadataFields(entry),
        });
      }
    }

    this._built = true;
  }

  /**
   * Stat a single path.
   *
   * @param path - Absolute path (e.g. `/src/main.ts`).
   * @returns Node metadata or `undefined` if not found.
   */
  public stat(path: string): TreeNode | undefined {
    if (path === '/' || path === '') {
      return this._root;
    }
    const segments = path.split('/').filter(Boolean);
    return this._resolve(segments);
  }

  /**
   * List entries in a directory.
   *
   * @param path - Absolute directory path.
   * @returns Array of entry names, or empty array if not found.
   */
  public readdir(path: string): string[] {
    const node = this.stat(path);
    if (!node?.children) {
      return [];
    }
    return [...node.children.keys()];
  }

  /**
   * Recursively collect file stat entries under a directory, matching
   * the signature of `WorkspaceFileService.getDirectoryStat`.
   *
   * @param basePath - Absolute directory path to walk.
   * @returns Flat array of file stat entries with paths relative to basePath.
   */
  public getDirectoryStat(basePath: string): FileStatEntry[] {
    const node = this.stat(basePath);
    if (!node?.children) {
      return [];
    }

    const results: FileStatEntry[] = [];
    this._collectStats(node, '', results);
    return results;
  }

  /**
   * Register a file write. Creates intermediate directories as needed.
   *
   * @param path - Absolute file path.
   * @param metadata - File byte size, optional modification time, and required content metadata.
   */
  public addFile(path: string, metadata: { size: number; mtimeMs?: number } & FileContentMetadata): void {
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) {
      return;
    }

    this._ensurePath(segments.slice(0, -1));

    const parent = this._resolve(segments.slice(0, -1));
    if (!parent?.children) {
      return;
    }

    const name = segments.at(-1)!;
    parent.children.set(name, {
      type: 'file',
      size: metadata.size,
      mtimeMs: metadata.mtimeMs ?? Date.now(),
      ...fileMetadataFields(metadata),
    });
  }

  /**
   * Remove a file from the tree.
   *
   * @param path - Absolute file path.
   */
  public removeFile(path: string): void {
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) {
      return;
    }

    const parent = this._resolve(segments.slice(0, -1));
    if (!parent?.children) {
      return;
    }

    const name = segments.at(-1)!;
    const node = parent.children.get(name);
    if (node?.type === 'file') {
      parent.children.delete(name);
    }
  }

  /**
   * Register a new directory.
   *
   * @param path - Absolute directory path.
   */
  public addDirectory(path: string): void {
    const segments = path.split('/').filter(Boolean);
    this._ensurePath(segments);
  }

  /**
   * Remove a directory and all its contents.
   *
   * @param path - Absolute directory path.
   */
  public removeDirectory(path: string): void {
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) {
      return;
    }

    const parent = this._resolve(segments.slice(0, -1));
    if (!parent?.children) {
      return;
    }

    const name = segments.at(-1)!;
    parent.children.delete(name);
  }

  /**
   * Handle a file or directory rename.
   *
   * @param from - Current absolute path.
   * @param to - New absolute path.
   */
  public rename(from: string, to: string): void {
    const fromSegments = from.split('/').filter(Boolean);
    const toSegments = to.split('/').filter(Boolean);

    if (fromSegments.length === 0 || toSegments.length === 0) {
      return;
    }

    const fromParent = this._resolve(fromSegments.slice(0, -1));
    if (!fromParent?.children) {
      return;
    }

    const fromName = fromSegments.at(-1)!;
    const node = fromParent.children.get(fromName);
    if (!node) {
      return;
    }

    fromParent.children.delete(fromName);

    this._ensurePath(toSegments.slice(0, -1));
    const toParent = this._resolve(toSegments.slice(0, -1));
    if (!toParent?.children) {
      return;
    }

    const toName = toSegments.at(-1)!;
    toParent.children.set(toName, node);
  }

  /**
   * Search for files (and optionally directories) whose paths contain the query substring.
   * Case-insensitive. Returns up to `maxResults` matches. Runs entirely in-memory.
   *
   * @param query - Substring to match against relative file paths.
   * @param options - Search options: `maxResults` (default 100), `includeDirectories` (default false).
   * @returns Matching entries with paths relative to the tree root.
   */
  public searchFiles(query: string, options?: { maxResults?: number; includeDirectories?: boolean }): FileStatEntry[] {
    const maxResults = options?.maxResults ?? defaultSearchMaxResults;
    const includeDirectories = options?.includeDirectories ?? false;
    const lowerQuery = query.toLowerCase();
    const results: FileStatEntry[] = [];
    this._searchRecursive({ node: this._root, prefix: '', lowerQuery, includeDirectories, maxResults, results });
    return results;
  }

  /** Reset the tree to empty state. */
  public clear(): void {
    this._root = { type: 'dir', size: 0, mtimeMs: 0, children: new Map() };
    this._built = false;
  }

  private _resolve(segments: string[]): TreeNode | undefined {
    let current: TreeNode = this._root;
    for (const segment of segments) {
      if (!current.children) {
        return undefined;
      }
      const child = current.children.get(segment);
      if (!child) {
        return undefined;
      }
      current = child;
    }
    return current;
  }

  private _ensurePath(segments: string[]): void {
    let current = this._root;
    for (const segment of segments) {
      current.children ??= new Map();
      let child = current.children.get(segment);
      if (!child) {
        child = { type: 'dir', size: 0, mtimeMs: Date.now(), children: new Map() };
        current.children.set(segment, child);
      }
      current = child;
    }
  }

  private _searchRecursive(options: {
    node: TreeNode;
    prefix: string;
    lowerQuery: string;
    includeDirectories: boolean;
    maxResults: number;
    results: FileStatEntry[];
  }): void {
    const { node, prefix, lowerQuery, includeDirectories, maxResults, results } = options;
    if (!node.children || results.length >= maxResults) {
      return;
    }
    for (const [name, child] of node.children) {
      if (results.length >= maxResults) {
        return;
      }
      const path = prefix ? `${prefix}/${name}` : name;
      if (child.type === 'file') {
        if (path.toLowerCase().includes(lowerQuery)) {
          results.push({
            path,
            name,
            type: 'file',
            size: child.size,
            mtimeMs: child.mtimeMs,
            ...fileMetadataFields(child),
          });
        }
      } else {
        if (includeDirectories && path.toLowerCase().includes(lowerQuery)) {
          results.push({ path, name, type: 'dir', size: 0, mtimeMs: child.mtimeMs });
        }
        this._searchRecursive({ node: child, prefix: path, lowerQuery, includeDirectories, maxResults, results });
      }
    }
  }

  private _collectStats(node: TreeNode, prefix: string, results: FileStatEntry[]): void {
    if (!node.children) {
      return;
    }

    for (const [name, child] of node.children) {
      const relativePath = prefix ? `${prefix}/${name}` : name;
      if (child.type === 'file') {
        results.push({
          path: relativePath,
          name,
          type: 'file',
          size: child.size,
          mtimeMs: child.mtimeMs,
          ...fileMetadataFields(child),
        });
      } else {
        this._collectStats(child, relativePath, results);
      }
    }
  }
}
