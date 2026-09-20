/**
 * The index that answers search and recursive stat without a provider walk (charter D3).
 *
 * One {@link TreeIndex} holds one root's tree, keyed on paths relative to that
 * root; {@link TreeIndexes} owns the set of them and is the only thing that
 * speaks absolute paths, so the mutation and external-change facts the
 * authority already produces land in every index that contains the path and in
 * none that does not.
 *
 * @module
 */

import type { FileContentMetadata, FileStat, FileStatEntry } from '@taucad/types';
import { normalizePath } from '@taucad/utils/path';
import { fileMetadataFields } from '#content-metadata.js';

const defaultSearchMaxResults = 100;

/**
 * Which entries an index query may answer with.
 *
 * The mask is one of these: a composed view passes its policy's answer, so a
 * hidden subtree is never descended into and `maxResults` counts only rows the
 * consumer may see. The index itself asks the registry nothing (charter D6).
 *
 * @public
 */
export type TreeIndexAdmits = (relativePath: string, kind: TreeNode['type']) => boolean;

/** Options every index search takes. @public */
export type TreeSearchOptions = {
  readonly maxResults?: number;
  readonly includeDirectories?: boolean;
  readonly admits?: TreeIndexAdmits;
};

/**
 * Convert an absolute path to a path relative to one index's scan root, so
 * incremental updates match the paths {@link TreeIndex.build} stored.
 *
 * @param root - Absolute path the index was scanned from.
 * @param absolutePath - Normalized absolute filesystem path.
 * @returns Path relative to the scan root, `''` for the root itself, or `undefined` if outside the tree.
 */
const treeRelative = (root: string, absolutePath: string): string | undefined => {
  const normalizedRoot = normalizePath(root);
  const abs = normalizePath(absolutePath);

  if (abs === normalizedRoot) {
    return '';
  }

  if (normalizedRoot === '/') {
    return abs.startsWith('/') ? abs.slice(1) : abs;
  }

  const rootPrefix = `${normalizedRoot}/`;
  if (abs.startsWith(rootPrefix)) {
    return abs.slice(rootPrefix.length);
  }

  return undefined;
};

/** Node in the in-memory file tree. */
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
 * Held per root by {@link TreeIndexes}, so paths are **relative to that root's
 * first full scan** (not host absolute paths like `/projects/id/...`).
 */
export class TreeIndex {
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
   * @param path - Tree-relative path (for example, `src/main.ts`).
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
   * @param path - Tree-relative directory path (`''` for the root).
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
   * Recursively collect file stat entries under a directory: what the rooted
   * `statTree` answers from, masked on the way out.
   *
   * @param basePath - Absolute directory path to walk.
   * @param options - Optional `admits` mask, asked before a descent.
   * @returns Flat array of file stat entries with paths relative to basePath.
   */
  public getDirectoryStat(basePath: string, options?: { admits?: TreeIndexAdmits }): FileStatEntry[] {
    const node = this.stat(basePath);
    if (!node?.children) {
      return [];
    }

    const results: FileStatEntry[] = [];
    this._collectStats({ node, prefix: '', results, admits: options?.admits });
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
  public searchFiles(query: string, options?: TreeSearchOptions): FileStatEntry[] {
    const maxResults = options?.maxResults ?? defaultSearchMaxResults;
    const includeDirectories = options?.includeDirectories ?? false;
    const lowerQuery = query.toLowerCase();
    const results: FileStatEntry[] = [];
    this._searchRecursive({
      node: this._root,
      prefix: '',
      lowerQuery,
      includeDirectories,
      maxResults,
      results,
      admits: options?.admits,
    });
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
    admits?: TreeIndexAdmits;
  }): void {
    const { node, prefix, lowerQuery, includeDirectories, maxResults, results, admits } = options;
    if (!node.children || results.length >= maxResults) {
      return;
    }
    for (const [name, child] of node.children) {
      if (results.length >= maxResults) {
        return;
      }
      const path = prefix ? `${prefix}/${name}` : name;
      if (admits?.(path, child.type) === false) {
        continue;
      }
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
        this._searchRecursive({
          node: child,
          prefix: path,
          lowerQuery,
          includeDirectories,
          maxResults,
          results,
          admits,
        });
      }
    }
  }

  private _collectStats(options: {
    node: TreeNode;
    prefix: string;
    results: FileStatEntry[];
    admits?: TreeIndexAdmits;
  }): void {
    const { node, prefix, results, admits } = options;
    if (!node.children) {
      return;
    }

    for (const [name, child] of node.children) {
      const relativePath = prefix ? `${prefix}/${name}` : name;
      if (admits?.(relativePath, child.type) === false) {
        continue;
      }
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
        this._collectStats({ node: child, prefix: relativePath, results, admits });
      }
    }
  }
}

/**
 * The set of built indexes, one per scanned root.
 *
 * Keyed by root (charter D3): two roots queried alternately both stay warm,
 * where the single slot this replaced rebuilt on every switch. Every fact
 * arrives as an absolute authority path, so this is the one place that
 * converts — each index whose root contains the path is updated, and one whose
 * root does not is left alone.
 *
 * One index holds one mount's tree, because one provider walk is all that built
 * it. So containment alone is not enough: an index only answers for, and is only
 * updated by, a path no mount boundary separates from its root.
 */
export class TreeIndexes {
  /** Absolute scan root to its index; in-memory paths are relative to the key. */
  private readonly _byRoot = new Map<string, TreeIndex>();

  /** Live prefixes of the installed mounts, as the boundary check reads them. */
  private readonly _mountPrefixes: () => Iterable<string>;

  /**
   * @param mountPrefixes - Live source of the installed mount prefixes. Omitted means the owner declares no boundaries, and containment alone decides.
   */
  public constructor(mountPrefixes?: () => Iterable<string>) {
    this._mountPrefixes = mountPrefixes ?? (() => []);
  }

  /**
   * Replace the index for one root with a freshly scanned tree.
   *
   * @param root - Absolute path the scan was rooted at.
   * @param entries - Flat file entries relative to `root`.
   * @returns The built index.
   */
  public build(root: string, entries: readonly FileStatEntry[]): TreeIndex {
    const index = new TreeIndex();
    index.build(
      entries.map((entry) =>
        entry.type === 'dir'
          ? { path: entry.path, type: 'dir', size: entry.size, mtimeMs: entry.mtimeMs }
          : {
              path: entry.path,
              type: 'file',
              size: entry.size,
              mtimeMs: entry.mtimeMs,
              ...fileMetadataFields(entry),
            },
      ),
    );
    this._byRoot.set(normalizePath(root), index);
    return index;
  }

  /**
   * The built index for one exact root.
   *
   * @param root - Absolute root the caller wants warm.
   * @returns The index, or `undefined` when that root is cold.
   */
  public get(root: string): TreeIndex | undefined {
    return this._byRoot.get(normalizePath(root));
  }

  /**
   * Search one exact root, when it is warm.
   *
   * @param root - Absolute root to search.
   * @param query - Case-insensitive substring to match.
   * @param options - Search options forwarded to {@link TreeIndex.searchFiles}.
   * @returns Matches relative to `root`, or `undefined` when that root is cold.
   */
  public search(root: string, query: string, options?: TreeSearchOptions): FileStatEntry[] | undefined {
    return this.get(root)?.searchFiles(query, options);
  }

  /**
   * Recursively stat a directory from whichever index already covers it.
   *
   * @param absolutePath - Absolute directory path.
   * @param options - Optional `admits` mask forwarded to the index.
   * @returns Entries relative to `absolutePath`, or `undefined` when no index covers it.
   */
  public statTree(absolutePath: string, options?: { admits?: TreeIndexAdmits }): FileStatEntry[] | undefined {
    const covering = this._covering(absolutePath);
    return covering === undefined ? undefined : covering.index.getDirectoryStat(covering.relative, options);
  }

  /**
   * The kind an index already knows for one absolute path.
   *
   * @param absolutePath - Absolute path to look up.
   * @returns `'file'`, `'dir'`, or `undefined` when no index knows it.
   */
  public statType(absolutePath: string): TreeNode['type'] | undefined {
    const covering = this._covering(absolutePath);
    return covering?.index.stat(covering.relative)?.type;
  }

  /**
   * Record a completed file write.
   *
   * @param absolutePath - Absolute file path.
   * @param metadata - File byte size and content metadata.
   */
  public addFile(absolutePath: string, metadata: { size: number } & FileContentMetadata): void {
    this._apply(absolutePath, (index, relative) => {
      index.addFile(relative, metadata);
    });
  }

  /**
   * Record a created directory.
   *
   * @param absolutePath - Absolute directory path.
   */
  public addDirectory(absolutePath: string): void {
    this._apply(absolutePath, (index, relative) => {
      index.addDirectory(relative);
    });
  }

  /**
   * Record a removed file.
   *
   * @param absolutePath - Absolute file path.
   */
  public removeFile(absolutePath: string): void {
    this._apply(absolutePath, (index, relative) => {
      index.removeFile(relative);
    });
  }

  /**
   * Record a removed directory and everything under it.
   *
   * @param absolutePath - Absolute directory path.
   */
  public removeDirectory(absolutePath: string): void {
    this._apply(absolutePath, (index, relative) => {
      index.removeDirectory(relative);
    });
  }

  /**
   * Record a rename. An index that holds only one of the two paths keeps its
   * entries untouched, exactly as the single-root index did.
   *
   * @param from - Absolute source path.
   * @param to - Absolute target path.
   */
  public rename(from: string, to: string): void {
    const source = normalizePath(from);
    const target = normalizePath(to);
    for (const [root, index] of this._byRoot) {
      const relativeFrom = treeRelative(root, source);
      const relativeTo = treeRelative(root, target);
      if (
        relativeFrom !== undefined &&
        relativeTo !== undefined &&
        !this._crossesMount(root, source) &&
        !this._crossesMount(root, target)
      ) {
        index.rename(relativeFrom, relativeTo);
      }
    }
  }

  /**
   * Drop every index the change at `absolutePath` can have invalidated: the ones
   * rooted at or under it, whose own tree is what changed, **and** the one that
   * covers it — a path under a removed prefix falls through to whichever broader
   * mount now takes it, and that mount's index was scanned while the boundary
   * still hid the subtree. Every other root stays warm.
   *
   * @param absolutePath - The mount prefix that changed, or the path a
   * half-finished mutation left untrustworthy.
   */
  public evict(absolutePath: string): void {
    const changed = normalizePath(absolutePath);
    for (const root of this._byRoot.keys()) {
      if (treeRelative(changed, root) !== undefined || treeRelative(root, changed) !== undefined) {
        this._byRoot.delete(root);
      }
    }
  }

  /**
   * Drop every index; the next query rebuilds from its provider. For disposal
   * and for the reset facts that mean the whole tree may have moved under us
   * (a lost observer, a remote checkout swap) — a change with a path uses
   * {@link evict}.
   */
  public clear(): void {
    this._byRoot.clear();
  }

  /** The first index whose root contains `absolutePath` with no mount boundary between them. */
  private _covering(absolutePath: string): { index: TreeIndex; relative: string } | undefined {
    for (const { index, relative } of this._matching(absolutePath)) {
      return { index, relative };
    }
    return undefined;
  }

  private _apply(absolutePath: string, update: (index: TreeIndex, relative: string) => void): void {
    for (const { index, relative } of this._matching(normalizePath(absolutePath))) {
      update(index, relative);
    }
  }

  /** Every index that may speak for `absolutePath`, with the path relative to its root. */
  private *_matching(absolutePath: string): Generator<{ index: TreeIndex; relative: string }> {
    for (const [root, index] of this._byRoot) {
      const relative = treeRelative(root, absolutePath);
      if (relative !== undefined && !this._crossesMount(root, absolutePath)) {
        yield { index, relative };
      }
    }
  }

  /**
   * Whether a mount begins below `root` and at or above `absolutePath`: the path
   * is then behind a boundary the walk that built this index never crossed.
   */
  private _crossesMount(root: string, absolutePath: string): boolean {
    for (const prefix of this._mountPrefixes()) {
      const nested = treeRelative(root, normalizePath(prefix));
      if (nested !== undefined && nested !== '' && treeRelative(normalizePath(prefix), absolutePath) !== undefined) {
        return true;
      }
    }
    return false;
  }
}
