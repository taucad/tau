import { useCallback, useState } from 'react';
import { FilePlus, FolderPlus } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { Tree, Folder, File } from '#components/magicui/file-tree.js';
import type { TreeViewElement } from '#components/magicui/file-tree.js';
import type { FileItem } from '#machines/file-explorer.machine.js';
import { cn } from '#utils/ui.utils.js';
import { Button } from '#components/ui/button.js';
import { toast } from '#components/ui/sonner.js';
import {
  FloatingPanelContentBody,
  FloatingPanelContentHeader,
  FloatingPanelContentTitle,
} from '#components/ui/floating-panel.js';
import { useBuild } from '#hooks/use-build.js';

function convertFileItemToTreeElement(items: FileItem[]): TreeViewElement[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    isSelectable: !item.isDirectory,
    children: item.children ? convertFileItemToTreeElement(item.children) : undefined,
  }));
}

function findFileById(items: FileItem[], id: string): FileItem | undefined {
  for (const item of items) {
    if (item.id === id) {
      return item;
    }

    if (item.children) {
      const found = findFileById(item.children, id);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

function findFileByPath(items: FileItem[], path: string): FileItem | undefined {
  for (const item of items) {
    if (item.path === path) {
      return item;
    }

    if (item.children) {
      const found = findFileByPath(item.children, path);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

export function ChatEditorFileTree(): React.JSX.Element {
  const { fileExplorerRef, filesystemRef } = useBuild();
  const fileTree = useSelector(fileExplorerRef, (state) => state.context.fileTree);
  const activeFileId = useSelector(fileExplorerRef, (state) => state.context.activeFileId);
  const [isCreatingFile, setIsCreatingFile] = useState(false);

  const [lastSelectedPath, setLastSelectedPath] = useState<string>('');

  const handleFileSelect = useCallback(
    (fileId: string) => {
      const file = findFileById(fileTree, fileId);
      if (file) {
        setLastSelectedPath(file.path);

        if (!file.isDirectory) {
          fileExplorerRef.send({ type: 'openFile', path: file.path });
        }
      }
    },
    [fileExplorerRef, fileTree],
  );

  const handleCreateFile = useCallback(() => {
    setIsCreatingFile(true);

    try {
      // eslint-disable-next-line no-alert -- File creation requires user input, will be replaced with a dialog later
      const fileName = globalThis.prompt('Enter file name:');

      if (fileName) {
        // Determine the target directory based on last selected path
        let targetDirectory = '';

        if (lastSelectedPath) {
          const lastSelected = findFileByPath(fileTree, lastSelectedPath);
          if (lastSelected?.isDirectory) {
            // Selected item is a directory, use it as the target
            targetDirectory = lastSelectedPath;
          } else if (lastSelected) {
            // Selected item is a file, use its parent directory
            const parts = lastSelectedPath.split('/');
            parts.pop(); // Remove file name
            targetDirectory = parts.join('/');
          }
        }

        const newFilePath = targetDirectory ? `${targetDirectory}/${fileName}` : fileName;

        // Send createFile event to filesystem machine
        filesystemRef.send({
          type: 'createFile',
          path: newFilePath,
          content: '// New file\n',
        });

        // Show success message and open the new file
        toast.success(`Created: ${newFilePath}`);
        fileExplorerRef.send({ type: 'openFile', path: newFilePath });
      }
    } catch (error) {
      console.error('Error creating file:', error);
      toast.error('Failed to create file. Please try again.');
    } finally {
      setIsCreatingFile(false);
    }
  }, [fileTree, lastSelectedPath, fileExplorerRef, filesystemRef]);

  // Only convert to tree elements if we have files
  const treeElements = fileTree.length > 0 ? convertFileItemToTreeElement(fileTree) : [];

  return (
    <>
      <FloatingPanelContentHeader className="flex items-center justify-between pr-1">
        <FloatingPanelContentTitle>Files</FloatingPanelContentTitle>
        <div className="flex items-center -space-x-0.5 text-muted-foreground/50">
          <Button
            aria-label="Create new file"
            className="size-6"
            disabled={isCreatingFile}
            size="icon"
            variant="ghost"
            onClick={handleCreateFile}
          >
            <FilePlus className="size-4" />
          </Button>
          <Button
            aria-label="Create new file"
            className="size-6"
            disabled={isCreatingFile}
            size="icon"
            variant="ghost"
            onClick={handleCreateFile}
          >
            <FolderPlus className="mt-0.5 size-4" />
          </Button>
        </div>
      </FloatingPanelContentHeader>
      <FloatingPanelContentBody className="py-2">
        {treeElements.length > 0 ? (
          <Tree elements={treeElements} initialExpandedItems={treeElements.map((element) => element.id)}>
            {treeElements.map((element) => (
              <TreeItem
                key={element.id}
                element={element}
                fileTree={fileTree}
                activeFileId={activeFileId}
                onSelect={handleFileSelect}
              />
            ))}
          </Tree>
        ) : (
          <div className="px-4 py-2 text-sm text-muted-foreground">No files available</div>
        )}
      </FloatingPanelContentBody>
    </>
  );
}

type TreeItemProps = {
  readonly element: TreeViewElement;
  readonly fileTree: FileItem[];
  readonly onSelect: (id: string) => void;
  readonly activeFileId: string | undefined;
};

function TreeItem({ element, fileTree, onSelect, activeFileId }: TreeItemProps): React.JSX.Element {
  if (element.children && element.children.length > 0) {
    return (
      <Folder
        value={element.id}
        element={element.name}
        className="rounded-md px-2 py-1.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        {element.children.map((child) => (
          <TreeItem
            key={child.id}
            element={child}
            fileTree={fileTree}
            activeFileId={activeFileId}
            onSelect={onSelect}
          />
        ))}
      </Folder>
    );
  }

  const isActive = activeFileId === element.id;

  // Find the file in the tree to get git status
  const file = findFileById(fileTree, element.id);
  const hasGitChanges = Boolean(file?.gitStatus && file.gitStatus !== 'clean');

  return (
    <File
      value={element.id}
      className={cn(
        'group/file relative w-full justify-start rounded-md px-2 py-1.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
      )}
      onClick={() => {
        onSelect(element.id);
      }}
    >
      <span className="flex items-center gap-2 truncate">
        <span className="truncate">{element.name}</span>
        {hasGitChanges ? (
          <span
            aria-label={`File has changes: ${file?.gitStatus ?? ''}`}
            className="bg-yellow-500 size-2 shrink-0 rounded-full"
            title={`File status: ${file?.gitStatus ?? ''}`}
          />
        ) : null}
      </span>
    </File>
  );
}
