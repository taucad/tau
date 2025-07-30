import { useCallback } from 'react';
import { FileExplorerContext } from '#routes/builds_.$id/graphics-actor.js';
import { Tree, Folder, File } from '#components/magicui/file-tree.js';
import type { TreeViewElement } from '#components/magicui/file-tree.js';
import type { FileItem } from '#machines/file-explorer.machine.js';
import { cn } from '#utils/ui.js';

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

export function ChatEditorFileTree(): React.JSX.Element {
  const fileTree = FileExplorerContext.useSelector((state) => state.context.fileTree);
  const activeFileId = FileExplorerContext.useSelector((state) => state.context.activeFileId);
  const actorRef = FileExplorerContext.useActorRef();

  const handleFileSelect = useCallback(
    (fileId: string) => {
      const file = findFileById(fileTree, fileId);
      if (file && !file.isDirectory) {
        actorRef.send({ type: 'openFile', path: file.path });
      }
    },
    [actorRef, fileTree],
  );

  // Only convert to tree elements if we have files
  const treeElements = fileTree.length > 0 ? convertFileItemToTreeElement(fileTree) : [];

  return (
    <div className={cn('flex h-full flex-col overflow-y-auto bg-sidebar select-none')}>
      <div className="border-b px-4 text-base font-medium text-muted-foreground">
        <h3 className="flex h-11 items-center">Files</h3>
      </div>
      <div className="my-2">
        {treeElements.length > 0 ? (
          <Tree elements={treeElements} initialExpandedItems={treeElements.map((element) => element.id)}>
            {treeElements.map((element) => (
              <TreeItem key={element.id} element={element} activeFileId={activeFileId} onSelect={handleFileSelect} />
            ))}
          </Tree>
        ) : (
          <div className="px-4 py-2 text-sm text-muted-foreground">No files available</div>
        )}
      </div>
    </div>
  );
}

type TreeItemProps = {
  readonly element: TreeViewElement;
  readonly onSelect: (id: string) => void;
  readonly activeFileId: string | undefined;
};

function TreeItem({ element, onSelect, activeFileId }: TreeItemProps): React.JSX.Element {
  if (element.children && element.children.length > 0) {
    return (
      <Folder
        value={element.id}
        element={element.name}
        className="rounded-md px-2 py-1.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        {element.children.map((child) => (
          <TreeItem key={child.id} element={child} activeFileId={activeFileId} onSelect={onSelect} />
        ))}
      </Folder>
    );
  }

  const isActive = activeFileId === element.id;

  return (
    <File
      value={element.id}
      className={cn(
        'w-full justify-start rounded-md px-2 py-1.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
      )}
      onClick={() => {
        onSelect(element.id);
      }}
    >
      <span className="truncate">{element.name}</span>
    </File>
  );
}
