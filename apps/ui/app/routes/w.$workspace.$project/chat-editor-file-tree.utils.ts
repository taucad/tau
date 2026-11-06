import { isTauTemporarySiblingName } from '@taucad/fs-client/file-tree-service';
import type { FileItem } from '#types/editor.types.js';

const editorHiddenExact = new Set([
  '.DS_Store',
  '.localized',
  '.AppleDouble',
  '.LSOverride',
  '__MACOSX',
  '.DocumentRevisions-V100',
  '.fseventsd',
  '.Spotlight-V100',
  '.TemporaryItems',
  '.Trashes',
  '.VolumeIcon.icns',
  '.directory',
]);
const editorHiddenWindows = new Set([
  'thumbs.db',
  'thumbs.db:encryptable',
  'ehthumbs.db',
  'ehthumbs_vista.db',
  'desktop.ini',
  '$recycle.bin',
]);

/** Whether any path segment is host metadata or Tau apply litter hidden only from Tau's editor tree. */
export const isEditorSystemArtifactPath = (path: string): boolean =>
  path.split('/').some(
    (segment) =>
      editorHiddenExact.has(segment) ||
      editorHiddenWindows.has(segment.toLowerCase()) ||
      segment.startsWith('._') ||
      segment.startsWith('.com.apple.timemachine.') ||
      segment.startsWith('.Trash-') ||
      segment.endsWith('.crswap') ||
      /* The file tree service already leaves these out; a listing read beside it may not. */
      isTauTemporarySiblingName(segment),
  );

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

/**
 * The tree's rows indexed once per snapshot, so the headless-tree data loader
 * answers an item in O(1) and a folder's children in O(children) instead of
 * scanning every path for each row (charter D18).
 * @public
 */
export type FileTreeIndex = Readonly<{
  /** Every listed path and every ancestor folder a nested path implies, plus the root. */
  allPaths: Set<string>;
  items: ReadonlyMap<string, FileItem>;
  /** A folder's immediate children, folders first then by name; sorted on first read. */
  childrenOf(parent: string): readonly string[];
  isFolder(path: string): boolean;
}>;

const compareNames = (left: string, right: string): number => {
  const leftName = left.slice(left.lastIndexOf('/') + 1);
  const rightName = right.slice(right.lastIndexOf('/') + 1);
  return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' });
};

/**
 * Index a flat listing for the tree.
 *
 * @param fileTree - Flat list of explicit file/directory entries.
 * @param rootId - The sentinel root ID; its children are the top-level paths.
 * @returns The index.
 * @public
 */
export const buildFileTreeIndex = (fileTree: readonly FileItem[], rootId: string): FileTreeIndex => {
  const items = new Map<string, FileItem>();
  const allPaths = new Set<string>([rootId]);
  const unsorted = new Map<string, string[]>();
  const addChild = (parent: string, child: string): void => {
    const siblings = unsorted.get(parent);
    if (siblings === undefined) {
      unsorted.set(parent, [child]);
    } else {
      siblings.push(child);
    }
  };
  for (const file of fileTree) {
    items.set(file.path, file);
    let parent = rootId;
    let current = '';
    for (const part of file.path.split('/')) {
      if (!part) {
        continue;
      }
      current = current ? `${current}/${part}` : part;
      if (!allPaths.has(current)) {
        allPaths.add(current);
        addChild(parent, current);
      }
      parent = current;
    }
  }
  const isFolder = (path: string): boolean => {
    const entry = items.get(path);
    return entry === undefined ? allPaths.has(path) : (entry.isDirectory ?? false);
  };
  const sorted = new Map<string, readonly string[]>();
  return {
    allPaths,
    items,
    isFolder,
    childrenOf(parent) {
      const cached = sorted.get(parent);
      if (cached !== undefined) {
        return cached;
      }
      const children = (unsorted.get(parent) ?? []).toSorted((left, right) => {
        const leftFolder = isFolder(left);
        if (leftFolder !== isFolder(right)) {
          return leftFolder ? -1 : 1;
        }
        return compareNames(left, right);
      });
      sorted.set(parent, children);
      return children;
    },
  };
};

/**
 * Resolve a tree item through an index, with the same answers as {@link getItemData}.
 *
 * @param index - The tree index.
 * @param rootId - The sentinel root ID.
 * @param itemId - The item to resolve.
 * @returns Tree item data.
 * @public
 */
export const indexedItemData = (index: FileTreeIndex, rootId: string, itemId: string): TreeItemData => {
  if (itemId === rootId) {
    return { path: rootId, name: 'Root', isFolder: true };
  }
  const file = index.items.get(itemId);
  if (file) {
    return { path: file.path, name: file.name, isFolder: file.isDirectory ?? false, content: file.content };
  }
  return { path: itemId, name: itemId.split('/').pop() ?? itemId, isFolder: true };
};
