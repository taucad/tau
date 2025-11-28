import { useCallback, useState, useRef, useMemo, useEffect, memo } from 'react';
import type { ItemInstance } from '@headless-tree/core';
import {
  FilePlus,
  FolderPlus,
  MoreHorizontal,
  Trash2,
  Copy,
  Upload,
  FileEdit,
  Search,
  ChevronsRight,
  ChevronsDown,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
} from 'lucide-react';
import { useSelector } from '@xstate/react';
import { minimatch } from 'minimatch';
import {
  syncDataLoaderFeature,
  selectionFeature,
  hotkeysCoreFeature,
  dragAndDropFeature,
  keyboardDragAndDropFeature,
  renamingFeature,
  searchFeature,
  expandAllFeature,
  propMemoizationFeature,
} from '@headless-tree/core';
import { useTree, AssistiveTreeDescription } from '@headless-tree/react';
import { kernelConfigurations } from '@taucad/types/constants';
import type { KernelConfiguration } from '@taucad/types/constants';
import type { FileItem } from '#machines/file-explorer.machine.js';
import { cn } from '#utils/ui.utils.js';
import { Button } from '#components/ui/button.js';
import { Input } from '#components/ui/input.js';
import { toast } from '#components/ui/sonner.js';
import {
  FloatingPanelContent,
  FloatingPanelContentBody,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
} from '#components/ui/floating-panel.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '#components/ui/dropdown-menu.js';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '#components/ui/context-menu.js';
import { useBuild } from '#hooks/use-build.js';
import { EmptyItems } from '#components/ui/empty-items.js';
import { HighlightText } from '#components/highlight-text.js';
import { FileExtensionIcon, getIconIdFromExtension } from '#components/icons/file-extension-icon.js';
import { getFileExtension, encodeTextFile } from '#utils/filesystem.utils.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';

type TreeItemData = {
  path: string;
  name: string;
  isFolder: boolean;
  content?: Uint8Array;
  gitStatus?: FileItem['gitStatus'];
};

const rootId = '';
const defaultHiddenPatterns = ['.gitkeep', '**/.gitkeep'];

function isHiddenFile(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => minimatch(path, pattern));
}

export const ChatEditorFileTree = memo(function (): React.JSX.Element {
  const { buildRef, fileExplorerRef, gitRef, cadRef } = useBuild();
  const buildId = useSelector(buildRef, (state) => state.context.buildId);
  const { fileManagerRef } = useFileManager();

  useEffect(() => {
    // FileExplorer → FileManager → CAD coordination
    const fileOpenedSub = fileExplorerRef.on('fileOpened', (event) => {
      fileManagerRef.send({ type: 'readFile', path: event.path });
      cadRef.send({
        type: 'setFile',
        file: { path: `/builds/${buildId}`, filename: event.path },
      });
    });

    // Build loaded → Open initial file
    const buildLoadedSub = buildRef.on('buildLoaded', (event) => {
      const mainFile = event.build.assets.mechanical?.main;
      if (mainFile) {
        fileExplorerRef.send({ type: 'openFile', path: mainFile });
      }
    });

    return () => {
      fileOpenedSub.unsubscribe();
      buildLoadedSub.unsubscribe();
    };
  }, [buildRef, fileExplorerRef, fileManagerRef, cadRef, buildId]);

  // Derive file tree from file-manager (reactive selector)
  // Use custom equality to prevent unnecessary re-renders
  const fileTree = useSelector(
    fileManagerRef,
    (state): FileItem[] => {
      const fileTreeMap = state.context.fileTree;
      if (fileTreeMap.size === 0) {
        return [];
      }

      const gitSnapshot = gitRef.getSnapshot();
      const { fileStatuses } = gitSnapshot.context;

      // Convert Map to array and filter for files only (not directories)
      return (
        [...fileTreeMap.values()]
          // .filter((entry) => entry.type === 'file')
          .map((entry) => ({
            id: entry.path,
            name: entry.name,
            path: entry.path,
            content: new Uint8Array(), // Placeholder - actual content in openFiles
            language: getIconIdFromExtension(getFileExtension(entry.path)),
            isDirectory: false,
            gitStatus: fileStatuses.get(entry.path)?.status,
          }))
      );
    },
    (previous, current) => {
      // Compare file paths and git statuses to determine if tree changed
      if (previous.length !== current.length) {
        return false;
      }

      const previousPaths = new Set(previous.map((f) => f.path));
      const currentPaths = new Set(current.map((f) => f.path));

      if (previousPaths.size !== currentPaths.size) {
        return false;
      }

      for (const path of currentPaths) {
        if (!previousPaths.has(path)) {
          return false;
        }
      }

      return true;
    },
  );

  const activeFilePath = useSelector(fileExplorerRef, (state) => state.context.activeFilePath);
  const openFiles = useSelector(fileExplorerRef, (state) => state.context.openFiles);

  // Tree state management
  const [expandedItems, setExpandedItems] = useState<string[]>(() => [rootId]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [focusedItem, setFocusedItem] = useState<string | undefined>(undefined);
  const [showHiddenFiles, setShowHiddenFiles] = useState(false);
  const hiddenFilePatterns = useMemo(() => defaultHiddenPatterns, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetPath, setUploadTargetPath] = useState<string | undefined>(undefined);

  // Build virtual folder structure from flat file paths
  const allPaths = useMemo(() => {
    const paths = new Set<string>();
    paths.add(rootId);

    for (const file of fileTree) {
      const parts = file.path.split('/');
      let currentPath = '';

      for (const part of parts) {
        if (!part) {
          continue;
        }

        currentPath = currentPath ? `${currentPath}/${part}` : part;
        paths.add(currentPath);
      }
    }

    return paths;
  }, [fileTree]);

  // Data loader for headless-tree
  const dataLoader = useMemo(
    () => ({
      getItem(itemId: string): TreeItemData {
        if (itemId === rootId) {
          return { path: rootId, name: 'Root', isFolder: true };
        }

        const file = fileTree.find((f) => f.path === itemId);
        if (file) {
          return {
            path: file.path,
            name: file.name,
            isFolder: false,
            content: file.content,
            gitStatus: file.gitStatus,
          };
        }

        // Virtual folder
        const name = itemId.split('/').pop() ?? itemId;
        return { path: itemId, name, isFolder: true };
      },

      getChildren(itemId: string): string[] {
        const prefix = itemId === rootId ? '' : `${itemId}/`;
        const children = [...allPaths].filter((path) => {
          if (path === rootId || path === itemId) {
            return false;
          }

          const relativePath = prefix ? path.slice(prefix.length) : path;
          if (!relativePath || path === prefix) {
            return false;
          }

          // Check if this is an immediate child
          const isImmediateChild = prefix
            ? path.startsWith(prefix) && !relativePath.includes('/')
            : !path.includes('/');

          return isImmediateChild;
        });

        // Filter hidden files
        const filtered = showHiddenFiles
          ? children
          : children.filter((path) => !isHiddenFile(path, hiddenFilePatterns));

        // Sort alphabetically (folders first, then files)
        return filtered.sort((a, b) => {
          const aName = a.split('/').pop() ?? a;
          const bName = b.split('/').pop() ?? b;
          const aIsFolder = allPaths.has(a) && fileTree.every((f) => f.path !== a);
          const bIsFolder = allPaths.has(b) && fileTree.every((f) => f.path !== b);

          // Folders first
          if (aIsFolder && !bIsFolder) {
            return -1;
          }

          if (!aIsFolder && bIsFolder) {
            return 1;
          }

          // Then alphabetically
          return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
        });
      },
    }),
    [fileTree, allPaths, showHiddenFiles, hiddenFilePatterns],
  );

  // Initialize headless-tree
  const tree = useTree<TreeItemData>({
    rootItemId: rootId,
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().isFolder,
    dataLoader,
    state: { expandedItems, selectedItems, focusedItem: focusedItem ?? null },
    setExpandedItems,
    setSelectedItems,
    setFocusedItem(value) {
      if (typeof value === 'function') {
        setFocusedItem((old) => {
          const result = value(old ?? null);
          return result ?? undefined;
        });
      } else {
        setFocusedItem(value ?? undefined);
      }
    },
    canReorder: true,
    indent: 16,
    async onDrop(draggedItems, target) {
      // Handle drag-and-drop by renaming files to new paths
      const targetPath = target.item.getId();

      // Determine target folder based on drop type
      let targetFolder = '';
      if (targetPath === rootId) {
        // Dropping on root folder
        targetFolder = '';
      } else if (target.item.isFolder()) {
        targetFolder = targetPath;
      } else {
        // Dropped on a file, use its parent folder
        const parts = targetPath.split('/');
        parts.pop();
        targetFolder = parts.join('/');
      }

      // Track which files were open before rename
      const wasOpenMap = new Map<string, boolean>();
      for (const item of draggedItems) {
        wasOpenMap.set(
          item.getId(),
          openFiles.some((f) => f.path === item.getId()),
        );
      }

      // Move each dragged item
      for (const item of draggedItems) {
        const oldPath = item.getId();
        const fileName = oldPath.split('/').pop() ?? oldPath;
        const newPath = targetFolder ? `${targetFolder}/${fileName}` : fileName;

        if (oldPath === newPath) {
          continue;
        }

        if (item.isFolder()) {
          // Move folder: rename all files inside it
          const nested = fileTree.filter((f) => f.path.startsWith(`${oldPath}/`));
          for (const file of nested) {
            const relativePath = file.path.slice(oldPath.length + 1);
            const newFilePath = `${newPath}/${relativePath}`;

            // Rename file in fileManager
            fileManagerRef.send({
              type: 'renameFile',
              oldPath: file.path,
              newPath: newFilePath,
            });

            // Update file explorer if file was open
            if (openFiles.some((f) => f.path === file.path)) {
              fileExplorerRef.send({ type: 'closeFile', path: file.path });
              fileExplorerRef.send({ type: 'openFile', path: newFilePath });
            }
          }
        } else {
          // Move file
          fileManagerRef.send({
            type: 'renameFile',
            oldPath,
            newPath,
          });

          // Update file explorer if file was open
          if (wasOpenMap.get(oldPath)) {
            fileExplorerRef.send({ type: 'closeFile', path: oldPath });
            fileExplorerRef.send({ type: 'openFile', path: newPath });
          }
        }
      }

      toast.success(`Moved ${draggedItems.length} item${draggedItems.length > 1 ? 's' : ''}`);
    },
    onRename(item, newName) {
      const oldPath = item.getId();
      if (oldPath === rootId) {
        return;
      }

      const parts = oldPath.split('/');
      parts[parts.length - 1] = newName;
      const newPath = parts.join('/');

      if (item.isFolder()) {
        // Remember if folder was expanded
        const wasExpanded = item.isExpanded();

        // Rename all nested files
        const nested = fileTree.filter((f) => f.path.startsWith(`${oldPath}/`));
        for (const file of nested) {
          const relativePath = file.path.slice(oldPath.length + 1);
          const newFilePath = `${newPath}/${relativePath}`;

          // Rename file in fileManager
          fileManagerRef.send({
            type: 'renameFile',
            oldPath: file.path,
            newPath: newFilePath,
          });

          // Update file explorer if file was open
          if (openFiles.some((f) => f.path === file.path)) {
            fileExplorerRef.send({ type: 'closeFile', path: file.path });
            fileExplorerRef.send({ type: 'openFile', path: newFilePath });
          }
        }

        // Keep folder expanded after rename
        if (wasExpanded) {
          setTimeout(() => {
            setExpandedItems((previous) => {
              const withoutOld = previous.filter((p) => p !== oldPath);
              return [...withoutOld, newPath];
            });
          }, 100);
        }
      } else {
        // Rename file in fileManager
        fileManagerRef.send({ type: 'renameFile', oldPath, newPath });

        // Update file explorer if file was open
        if (openFiles.some((f) => f.path === oldPath)) {
          fileExplorerRef.send({ type: 'closeFile', path: oldPath });
          fileExplorerRef.send({ type: 'openFile', path: newPath });
        }
      }
    },
    onPrimaryAction(item) {
      if (!item.isFolder()) {
        fileExplorerRef.send({
          type: 'openFile',
          path: item.getId(),
        });
      }
    },
    hotkeys: {
      customDelete: {
        hotkey: 'Delete',
        handler(_event, treeInstance) {
          const selected = treeInstance.getSelectedItems();
          if (selected.length > 0) {
            handleDelete(selected);
          }
        },
      },
      // Override submitSearch to prevent closing search on Enter
      submitSearch: {
        hotkey: 'Enter',
        handler(_event, treeInstance) {
          const matches = treeInstance.getSearchMatchingItems();
          if (matches.length > 0) {
            matches[0]?.setFocused();
            treeInstance.updateDomFocus();
          }
          // Don't close search - user must press Escape or click X
        },
      },
    },
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      hotkeysCoreFeature,
      dragAndDropFeature,
      keyboardDragAndDropFeature,
      renamingFeature,
      searchFeature,
      expandAllFeature,
      propMemoizationFeature,
    ],
  });

  // Rebuild tree when file data changes or hidden files toggle
  useEffect(() => {
    tree.rebuildTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tree object is not stable, only rebuild when fileTree or showHiddenFiles changes
  }, [fileTree, showHiddenFiles]);

  // Sync active file with tree focus
  useEffect(() => {
    if (activeFilePath && activeFilePath !== focusedItem) {
      setFocusedItem(activeFilePath);
    }
  }, [activeFilePath, focusedItem]);

  const handleCreateFile = useCallback(
    (template: KernelConfiguration | undefined) => {
      try {
        const content = template?.emptyCode ?? '';
        const extension = template?.mainFile.split('.').pop() ?? 'txt';
        let counter = 1;
        let newFilePath = `Untitled.${extension}`;

        while (allPaths.has(newFilePath)) {
          counter++;
          newFilePath = `Untitled ${counter}.${extension}`;
        }

        // Write file to fileManager
        fileManagerRef.send({
          type: 'writeFile',
          path: newFilePath,
          data: encodeTextFile(content),
        });

        // Open file in fileExplorer
        fileExplorerRef.send({ type: 'openFile', path: newFilePath });

        // Auto-expand root and select new file
        setTimeout(() => {
          setSelectedItems([newFilePath]);
          tree.getItemInstance(newFilePath).startRenaming();
        }, 100);

        toast.success(`Created: ${newFilePath}`);
      } catch (error) {
        console.error('Error creating file:', error);
        toast.error('Failed to create file. Please try again.');
      }
    },
    [allPaths, fileManagerRef, fileExplorerRef, tree],
  );

  const handleCreateFolder = useCallback(() => {
    try {
      let counter = 1;
      let folderName = 'New Folder';
      let folderPath = folderName;

      while (allPaths.has(folderPath)) {
        counter++;
        folderName = `New Folder ${counter}`;
        folderPath = folderName;
      }

      const gitkeepPath = `${folderPath}/.gitkeep`;

      // Write folder marker file to fileManager
      fileManagerRef.send({
        type: 'writeFile',
        path: gitkeepPath,
        data: encodeTextFile(''),
      });

      setTimeout(() => {
        setExpandedItems((previous) => [...previous, folderPath]);
        tree.getItemInstance(folderPath).startRenaming();
      }, 100);

      toast.success(`Created folder: ${folderPath}`);
    } catch (error) {
      console.error('Error creating folder:', error);
      toast.error('Failed to create folder. Please try again.');
    }
  }, [allPaths, fileManagerRef, tree]);

  const handleDelete = useCallback(
    (items: Array<ItemInstance<TreeItemData>>) => {
      const count = items.length;
      const itemWord = count === 1 ? 'item' : 'items';

      // eslint-disable-next-line no-alert -- Confirmation for destructive action
      if (globalThis.confirm(`Delete ${count} ${itemWord}?`)) {
        for (const currentItem of items) {
          const path = currentItem.getId();
          if (path === rootId) {
            continue;
          }

          if (currentItem.isFolder()) {
            // Delete all files in folder
            const nested = fileTree.filter((f) => f.path.startsWith(`${path}/`));
            for (const file of nested) {
              // Delete file from fileManager
              fileManagerRef.send({ type: 'deleteFile', path: file.path });
              // Close file in fileExplorer if it's open
              fileExplorerRef.send({ type: 'closeFile', path: file.path });
            }
          } else {
            // Delete file from fileManager
            fileManagerRef.send({ type: 'deleteFile', path });
            // Close file in fileExplorer if it's open
            fileExplorerRef.send({ type: 'closeFile', path });
          }
        }

        toast.success(`Deleted ${count} ${itemWord}`);
      }
    },
    [fileExplorerRef, fileManagerRef, fileTree],
  );

  const handleDuplicate = useCallback((_items: Array<ItemInstance<TreeItemData>>) => {
    // Duplication requires file-manager content, which isn't exposed yet
    toast.info('File duplication is not yet supported');
  }, []);

  const handleUploadClick = useCallback((targetPath: string) => {
    setUploadTargetPath(targetPath);
    fileInputRef.current?.click();
  }, []);

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const { files } = event.target;
      if (!files || files.length === 0) {
        return;
      }

      const targetItem = uploadTargetPath ? tree.getItemInstance(uploadTargetPath) : undefined;
      const directory = targetItem?.isFolder() ? uploadTargetPath : '';
      let successCount = 0;

      for (const file of files) {
        try {
          // eslint-disable-next-line no-await-in-loop -- Files need to be read sequentially
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const filePath = directory ? `${directory}/${file.name}` : file.name;

          // Write file to fileManager
          fileManagerRef.send({
            type: 'writeFile',
            path: filePath,
            data: uint8Array,
          });

          // Open file in fileExplorer
          fileExplorerRef.send({ type: 'openFile', path: filePath });

          successCount++;
        } catch (error) {
          console.error(`Error uploading file ${file.name}:`, error);
        }
      }

      if (successCount > 0) {
        toast.success(`Uploaded ${successCount} file${successCount > 1 ? 's' : ''}`);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      setUploadTargetPath(undefined);
    },
    [uploadTargetPath, tree, fileManagerRef, fileExplorerRef],
  );

  const handleToggleExpandAll = useCallback(() => {
    const allFolderIds = tree
      .getItems()
      .filter((item) => item.isFolder() && item.getId() !== rootId)
      .map((item) => item.getId());
    const allExpanded = allFolderIds.every((id) => expandedItems.includes(id));

    if (allExpanded) {
      tree.collapseAll();
    } else {
      void tree.expandAll();
    }
  }, [tree, expandedItems]);

  const allFoldersExpanded = useMemo(() => {
    const allFolderIds = tree
      .getItems()
      .filter((item) => item.isFolder() && item.getId() !== rootId)
      .map((item) => item.getId());

    return allFolderIds.length > 0 && allFolderIds.every((id) => expandedItems.includes(id));
  }, [tree, expandedItems]);

  return (
    <>
      <input
        ref={fileInputRef}
        multiple
        type="file"
        className="hidden"
        aria-label="Upload files"
        onChange={handleFileUpload}
      />

      <FloatingPanelContent>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Files</FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={allFoldersExpanded ? 'Collapse all folders' : 'Expand all folders'}
                  className="size-7"
                  size="icon"
                  variant="ghost"
                  onClick={handleToggleExpandAll}
                >
                  {allFoldersExpanded ? <ChevronsDown className="size-4" /> : <ChevronsRight className="size-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{allFoldersExpanded ? 'Collapse all folders' : 'Expand all folders'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={showHiddenFiles ? 'Hide hidden files' : 'Show hidden files'}
                  className="size-7"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setShowHiddenFiles(!showHiddenFiles);
                  }}
                >
                  {showHiddenFiles ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{showHiddenFiles ? 'Hide hidden files' : 'Show hidden files'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Search files"
                  className="size-7"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    tree.openSearch();
                  }}
                >
                  <Search className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Search files</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <Tooltip>
                <Button asChild aria-label="Create new file" className="size-7" size="icon" variant="ghost">
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger>
                      <FilePlus className="size-4" />
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                </Button>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>New File</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => {
                      handleCreateFile(undefined);
                    }}
                  >
                    Blank
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {kernelConfigurations.map((kernel) => (
                    <DropdownMenuItem
                      key={kernel.id}
                      onClick={() => {
                        handleCreateFile(kernel);
                      }}
                    >
                      {kernel.name} ({kernel.mainFile})
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
                <TooltipContent>Create new file</TooltipContent>
              </Tooltip>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Create new folder"
                  className="size-7"
                  size="icon"
                  variant="ghost"
                  onClick={handleCreateFolder}
                >
                  <FolderPlus className="mt-0.5 size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Create new folder</TooltipContent>
            </Tooltip>
          </FloatingPanelContentHeaderActions>
        </FloatingPanelContentHeader>
        <FloatingPanelContentBody className="flex min-h-0 flex-col p-1">
          {tree.isSearchOpen() && (
            <div className="mb-1 flex shrink-0 items-center gap-2 px-1">
              <Input
                {...tree.getSearchInputElementProps()}
                placeholder="Search files..."
                className="h-7 flex-1 text-sm"
              />
              <span className="text-xs text-muted-foreground">{tree.getSearchMatchingItems().length}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Close search"
                onClick={() => {
                  tree.closeSearch();
                }}
              >
                <span className="text-sm">×</span>
              </Button>
            </div>
          )}

          {selectedItems.length > 1 && (
            <div className="mb-1 shrink-0 px-1 text-xs text-muted-foreground">
              {selectedItems.length} items selected
            </div>
          )}

          {tree.getItems().length > 0 ? (
            <div {...tree.getContainerProps()} className="flex min-h-0 flex-col gap-0.5 outline-none">
              <AssistiveTreeDescription tree={tree} />
              {tree.getItems().map((item) => {
                if (item.getId() === rootId) {
                  return null;
                }

                return (
                  <TreeItem
                    key={item.getId()}
                    item={item}
                    isActive={activeFilePath === item.getId()}
                    isOpen={openFiles.some((f) => f.path === item.getId())}
                    searchQuery={tree.getState().search ?? ''}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                    onUpload={handleUploadClick}
                  />
                );
              })}
              <div style={tree.getDragLineStyle()} className="h-0.5 rounded-full bg-primary" />
            </div>
          ) : (
            <EmptyItems className="m-1">No files available</EmptyItems>
          )}
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </>
  );
});

type TreeItemProps = {
  readonly item: ItemInstance<TreeItemData>;
  readonly isActive: boolean;
  readonly isOpen: boolean;
  readonly searchQuery: string;
  readonly onDelete: (items: Array<ItemInstance<TreeItemData>>) => void;
  readonly onDuplicate: (items: Array<ItemInstance<TreeItemData>>) => void;
  readonly onUpload: (path: string) => void;
};

function TreeItem({
  item,
  isActive,
  isOpen,
  searchQuery,
  onDelete,
  onDuplicate,
  onUpload,
}: TreeItemProps): React.JSX.Element {
  const data = item.getItemData();
  const hasGitChanges = Boolean(data.gitStatus && data.gitStatus !== 'clean');
  const paddingLeft = item.getItemMeta().level * 16 + 8;
  const isSelected = item.isSelected();
  const isFocused = item.isFocused();
  const isRenaming = item.isRenaming();
  const isFolder = item.isFolder();
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Handle text selection when entering rename mode
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      const input = renameInputRef.current;

      // Small delay to ensure input is fully focused
      setTimeout(() => {
        input.focus();

        // For folders, select all text. For files, select without extension
        if (isFolder) {
          input.setSelectionRange(0, input.value.length, 'backward');
        } else {
          const lastDotIndex = input.value.lastIndexOf('.');
          const endIndex = lastDotIndex > 0 ? lastDotIndex : input.value.length;
          input.setSelectionRange(0, endIndex, 'backward');
        }

        input.scrollLeft = 0;
      }, 0);
    }
  }, [isRenaming, isFolder]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {isRenaming ? (
          <div
            className="flex h-7 items-center rounded-md border border-primary py-1 pr-1 pl-2"
            style={{ paddingLeft: `${paddingLeft}px` }}
          >
            <input
              ref={renameInputRef}
              className="h-full flex-1 border-none bg-transparent px-0 text-sm shadow-none outline-none focus:border-transparent focus:ring-0 focus:ring-offset-0"
              {...item.getRenameInputProps()}
            />
          </div>
        ) : (
          <div
            {...item.getProps()}
            className={cn(
              'group/file relative flex h-7 w-full cursor-pointer items-center justify-between rounded-md py-1 pr-1 pl-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              isActive && !isSelected && 'bg-sidebar-accent',
              isSelected && 'bg-sidebar-accent/70 text-sidebar-accent-foreground',
              item.isMatchingSearch() && 'bg-primary/20',
              item.isDragTarget() && 'bg-primary/30 ring-1 ring-primary',
              'border border-transparent',
              isFocused && !isActive && !isSelected && 'border-neutral',
            )}
            style={{ paddingLeft: `${paddingLeft}px` }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {isFolder ? (
                item.isExpanded() ? (
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                )
              ) : (
                <FileExtensionIcon filename={item.getItemName()} className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className={cn('truncate', isOpen && 'font-medium', isActive && 'text-primary')}>
                <HighlightText text={item.getItemName()} searchTerm={searchQuery} />
              </span>
              {hasGitChanges ? (
                <span
                  aria-label={`File has changes: ${data.gitStatus ?? ''}`}
                  className="size-2 shrink-0 rounded-full bg-yellow"
                  title={`File status: ${data.gitStatus ?? ''}`}
                />
              ) : null}
            </div>
            {isFolder ? null : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-1/2 right-1 size-5 -translate-y-1/2 opacity-0 group-hover/file:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onClick={(event) => {
                      event.stopPropagation();
                      item.startRenaming();
                    }}
                  >
                    <FileEdit className="size-4" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(event) => {
                      event.stopPropagation();
                      onUpload(item.getId());
                    }}
                  >
                    <Upload className="size-4" />
                    Upload Files
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(event) => {
                      event.stopPropagation();
                      onDuplicate([item]);
                    }}
                  >
                    <Copy className="size-4" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete([item]);
                    }}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={() => {
            item.startRenaming();
          }}
        >
          <FileEdit className="size-4" />
          Rename
        </ContextMenuItem>
        {isFolder ? (
          <ContextMenuItem
            onClick={() => {
              onUpload(item.getId());
            }}
          >
            <Upload className="size-4" />
            Upload Files
          </ContextMenuItem>
        ) : (
          <>
            <ContextMenuItem
              onClick={() => {
                onUpload(item.getId());
              }}
            >
              <Upload className="size-4" />
              Upload Files
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                onDuplicate([item]);
              }}
            >
              <Copy className="size-4" />
              Duplicate
            </ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={() => {
            onDelete([item]);
          }}
        >
          <Trash2 className="size-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
