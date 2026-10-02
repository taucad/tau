import type { FileItem } from '#types/editor.types.js';

/**
 * Tree item data returned by the headless-tree data loader.
 * @public
 */
export type TreeItemData = {
  path: string;
  name: string;
  isFolder: boolean;
  content?: Uint8Array<ArrayBuffer>;
};

/**
 * Resolve a tree item by ID. Checks the `fileTree` array first (returning
 * `isFolder` from the entry's `isDirectory` flag), then falls back to a
 * virtual folder for paths not found in `fileTree` (e.g., inferred parent
 * directories from nested file paths).
 *
 * @param fileTree - Flat list of explicit file/directory entries.
 * @param rootId - The sentinel root ID.
 * @param itemId - The item to resolve.
 * @returns Tree item data with correct `isFolder` flag.
 * @public
 */
export const getItemData = (fileTree: FileItem[], rootId: string, itemId: string): TreeItemData => {
  if (itemId === rootId) {
    return { path: rootId, name: 'Root', isFolder: true };
  }

  const file = fileTree.find((f) => f.path === itemId);
  if (file) {
    return {
      path: file.path,
      name: file.name,
      isFolder: file.isDirectory ?? false,
      content: file.content,
    };
  }

  const name = itemId.split('/').pop() ?? itemId;
  return { path: itemId, name, isFolder: true };
};

/**
 * Determine whether a path represents a folder. Checks the explicit entry
 * first (via `isDirectory`), then falls back to the `allPaths` set for virtual
 * folders inferred from nested file paths.
 *
 * @public
 */
export const isPathFolder = (path: string, fileTree: FileItem[], allPaths: Set<string>): boolean => {
  const entry = fileTree.find((f) => f.path === path);
  if (entry) {
    return entry.isDirectory ?? false;
  }

  return allPaths.has(path);
};

/**
 * Sort comparator that orders folders before files, then alphabetically
 * (case-insensitive).
 *
 * @public
 */
export const sortChildrenFoldersFirst = (children: string[], fileTree: FileItem[], allPaths: Set<string>): string[] =>
  [...children].sort((a, b) => {
    const aName = a.split('/').pop() ?? a;
    const bName = b.split('/').pop() ?? b;
    const aIsFolder = isPathFolder(a, fileTree, allPaths);
    const bIsFolder = isPathFolder(b, fileTree, allPaths);

    if (aIsFolder && !bIsFolder) {
      return -1;
    }

    if (!aIsFolder && bIsFolder) {
      return 1;
    }

    return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
  });
