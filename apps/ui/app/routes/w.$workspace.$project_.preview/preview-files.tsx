import { useMemo } from 'react';
import { Tree, Folder, File } from '#components/magicui/file-tree.js';
import type { TreeViewElement } from '#components/magicui/file-tree.js';

type FileInfo = {
  path: string;
  name: string;
  size: number;
};

type PreviewFilesProps = {
  readonly files: FileInfo[];
};

/**
 * Build tree structure from flat file list
 */
function buildTreeFromFiles(files: FileInfo[]): TreeViewElement[] {
  const root: TreeViewElement[] = [];
  const folderMap = new Map<string, TreeViewElement>();

  for (const file of files) {
    // Remove leading slash and split into parts
    const parts = file.path.replace(/^\//, '').split('/');
    let currentLevel = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;

      if (isFile) {
        // Add file to current level
        currentLevel.push({
          id: file.path,
          name: part,
        });
      } else {
        // Check if folder already exists
        let folder = folderMap.get(currentPath);
        if (!folder) {
          folder = {
            id: currentPath,
            name: part,
            children: [],
          };
          folderMap.set(currentPath, folder);
          currentLevel.push(folder);
        }

        currentLevel = folder.children!;
      }
    }
  }

  // Sort: folders first, then alphabetically
  const sortElements = (elements: TreeViewElement[]): TreeViewElement[] => {
    return elements
      .map((element) => ({
        ...element,
        children: element.children ? sortElements(element.children) : undefined,
      }))
      .sort((a, b) => {
        const aIsFolder = a.children !== undefined;
        const bIsFolder = b.children !== undefined;
        if (aIsFolder && !bIsFolder) {
          return -1;
        }

        if (!aIsFolder && bIsFolder) {
          return 1;
        }

        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
  };

  return sortElements(root);
}

/**
 * Render tree elements recursively
 */
function renderTree(elements: TreeViewElement[]): React.ReactNode {
  return elements.map((element) => {
    if (element.children) {
      return (
        <Folder key={element.id} element={element.name} value={element.id}>
          {renderTree(element.children)}
        </Folder>
      );
    }

    return (
      <File key={element.id} value={element.id}>
        {element.name}
      </File>
    );
  });
}

export function PreviewFiles({ files }: PreviewFilesProps): React.JSX.Element {
  const fileTree = useMemo(() => buildTreeFromFiles(files), [files]);

  if (files.length === 0) {
    return <p className='p-6 text-center text-muted-foreground'>No files available</p>;
  }

  return (
    <div className='h-full rounded-md border text-sm'>
      <Tree elements={fileTree}>{renderTree(fileTree)}</Tree>
    </div>
  );
}
