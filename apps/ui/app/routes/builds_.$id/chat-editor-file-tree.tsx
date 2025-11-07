import { useCallback, useState, useRef, useMemo, useEffect } from 'react';
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
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Circle,
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
  createOnDropHandler,
} from '@headless-tree/core';
import { useTree, AssistiveTreeDescription } from '@headless-tree/react';
import { languageFromKernel, kernelConfigurations } from '@taucad/types/constants';
import type { KernelConfiguration } from '@taucad/types/constants';
import type { FileItem } from '#machines/file-explorer.machine.js';
import { cn } from '#utils/ui.utils.js';
import { Button } from '#components/ui/button.js';
import { Input } from '#components/ui/input.js';
import { toast } from '#components/ui/sonner.js';
import {
  FloatingPanelContentBody,
  FloatingPanelContentHeader,
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

type TreeItemData = {
  path: string;
  name: string;
  isFolder: boolean;
  content?: string;
  gitStatus?: FileItem['gitStatus'];
};

const rootId = '';
const defaultHiddenPatterns = ['.gitkeep', '**/.gitkeep'];

function isHiddenFile(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => minimatch(path, pattern));
}

export function ChatEditorFileTree(): React.JSX.Element {
  const { buildRef, fileExplorerRef, gitRef } = useBuild();
  const mechanicalAsset = useSelector(buildRef, (state) => {
    return state.context.build?.assets.mechanical;
  });

  // Derive file tree from build state (reactive selector)
  // Use custom equality to prevent unnecessary re-renders
  const fileTree = useSelector(
    buildRef,
    (state): FileItem[] => {
      const files = state.context.build?.assets.mechanical?.files;
      if (!files || !mechanicalAsset) {
        return [];
      }

      const gitSnapshot = gitRef.getSnapshot();
      const { fileStatuses } = gitSnapshot.context;

      return Object.entries(files).map(([path, item]) => ({
        id: path,
        name: path.split('/').pop() ?? path,
        path,
        content: item.content,
        language: languageFromKernel[mechanicalAsset.language],
        isDirectory: false,
        gitStatus: fileStatuses.get(path)?.status,
      }));
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
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
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
    onDrop: createOnDropHandler(() => {
      // Handle reordering - not applicable for our flat structure
      // This would be used if we allowed reordering siblings
    }),
    onRename(item, newName) {
      const oldPath = item.getId();
      if (oldPath === rootId) {
        return;
      }

      const parts = oldPath.split('/');
      parts[parts.length - 1] = newName;
      const newPath = parts.join('/');

      if (item.isFolder()) {
        // Rename all nested files
        const nested = fileTree.filter((f) => f.path.startsWith(`${oldPath}/`));
        for (const file of nested) {
          const relativePath = file.path.slice(oldPath.length + 1);
          buildRef.send({
            type: 'renameFile',
            oldPath: file.path,
            newPath: `${newPath}/${relativePath}`,
          });
        }
      } else {
        buildRef.send({ type: 'renameFile', oldPath, newPath });
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

        buildRef.send({
          type: 'createFile',
          path: newFilePath,
          content,
        });

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
    [buildRef, allPaths, tree, setSelectedItems],
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

      buildRef.send({
        type: 'createFile',
        path: gitkeepPath,
        content: '',
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
  }, [buildRef, allPaths, tree, setExpandedItems]);

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
              buildRef.send({ type: 'deleteFile', path: file.path });
            }
          } else {
            buildRef.send({ type: 'deleteFile', path });
          }
        }

        toast.success(`Deleted ${count} ${itemWord}`);
      }
    },
    [buildRef, fileTree],
  );

  const handleDuplicate = useCallback(
    (items: Array<ItemInstance<TreeItemData>>) => {
      for (const currentItem of items) {
        if (currentItem.isFolder()) {
          continue;
        }

        const path = currentItem.getId();
        const lastDotIndex = path.lastIndexOf('.');
        const basePath = lastDotIndex > 0 ? path.slice(0, lastDotIndex) : path;
        const extension = lastDotIndex > 0 ? path.slice(lastDotIndex) : '';

        let counter = 1;
        let newPath = `${basePath}-copy${extension}`;

        while (allPaths.has(newPath)) {
          counter++;
          newPath = `${basePath}-copy-${counter}${extension}`;
        }

        const content = currentItem.getItemData().content ?? '';
        buildRef.send({
          type: 'createFile',
          path: newPath,
          content,
        });
      }

      toast.success(`Duplicated ${items.length} file${items.length > 1 ? 's' : ''}`);
    },
    [buildRef, allPaths],
  );

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
          const content = await file.text();
          const filePath = directory ? `${directory}/${file.name}` : file.name;

          buildRef.send({
            type: 'createFile',
            path: filePath,
            content,
          });

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
    [buildRef, uploadTargetPath, tree],
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

      <FloatingPanelContentHeader className="flex items-center justify-between pr-1">
        <FloatingPanelContentTitle>Files</FloatingPanelContentTitle>
        <div className="flex items-center -space-x-0.5 text-muted-foreground/50">
          <Button
            aria-label={allFoldersExpanded ? 'Collapse all folders' : 'Expand all folders'}
            className="size-6"
            size="icon"
            variant="ghost"
            onClick={handleToggleExpandAll}
          >
            {allFoldersExpanded ? <ChevronsDown className="size-4" /> : <ChevronsRight className="size-4" />}
          </Button>
          <Button
            aria-label={showHiddenFiles ? 'Hide hidden files' : 'Show hidden files'}
            className="size-6"
            size="icon"
            variant="ghost"
            onClick={() => {
              setShowHiddenFiles(!showHiddenFiles);
            }}
          >
            {showHiddenFiles ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </Button>
          <Button
            aria-label="Search files"
            className="size-6"
            size="icon"
            variant="ghost"
            onClick={() => {
              tree.openSearch();
            }}
          >
            <Search className="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label="Create new file" className="size-6" size="icon" variant="ghost">
                <FilePlus className="size-4" />
              </Button>
            </DropdownMenuTrigger>
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
          </DropdownMenu>
          <Button
            aria-label="Create new folder"
            className="size-6"
            size="icon"
            variant="ghost"
            onClick={handleCreateFolder}
          >
            <FolderPlus className="mt-0.5 size-4" />
          </Button>
        </div>
      </FloatingPanelContentHeader>
      <FloatingPanelContentBody className="p-1">
        {tree.isSearchOpen() && (
          <div className="mb-1 flex items-center gap-2 px-1">
            <Input
              {...tree.getSearchInputElementProps()}
              placeholder="Search files..."
              className="h-7 flex-1 text-sm"
            />
            <span className="text-xs text-muted-foreground">{tree.getSearchMatchingItems().length}</span>
          </div>
        )}

        {selectedItems.length > 1 && (
          <div className="mb-1 px-1 text-xs text-muted-foreground">{selectedItems.length} items selected</div>
        )}

        {tree.getItems().length > 1 ? (
          <div {...tree.getContainerProps()} className="flex flex-col gap-0.5 outline-none">
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
    </>
  );
}

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
      <ContextMenuTrigger>
        {isRenaming ? (
          <div
            className="flex h-7 items-center rounded-md border border-primary py-1 pr-1 pl-2"
            style={{ paddingLeft: `${paddingLeft}px` }}
          >
            <Input
              {...item.getRenameInputProps()}
              ref={renameInputRef}
              className="h-full flex-1 border-none bg-transparent px-0 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        ) : (
          <button
            {...item.getProps()}
            type="button"
            className={cn(
              'group/file relative flex h-7 w-full cursor-pointer items-center justify-between rounded-md py-1 pr-1 pl-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              isActive && !isSelected && 'bg-sidebar-accent text-sidebar-accent-foreground',
              isSelected && 'bg-sidebar-accent/70 text-sidebar-accent-foreground',
              item.isMatchingSearch() && 'bg-primary/20',
              'border border-transparent',
              isFocused && !isActive && !isSelected && 'border-neutral',
            )}
            style={{ paddingLeft: `${paddingLeft}px` }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {isFolder ? (
                <>
                  {item.isExpanded() ? (
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  {item.isExpanded() ? (
                    <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                  )}
                </>
              ) : (
                <>
                  <File className="size-4 shrink-0 text-muted-foreground" />
                  {isOpen ? <Circle className="size-1.5 shrink-0 fill-primary text-primary" /> : null}
                </>
              )}
              <span className="truncate">
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
                    variant="ghost"
                    size="icon"
                    className="size-5 opacity-0 group-hover/file:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={(event) => {
                      event.stopPropagation();
                      item.startRenaming();
                    }}
                  >
                    <FileEdit className="mr-2 size-4" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(event) => {
                      event.stopPropagation();
                      onUpload(item.getId());
                    }}
                  >
                    <Upload className="mr-2 size-4" />
                    Upload Files
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(event) => {
                      event.stopPropagation();
                      onDuplicate([item]);
                    }}
                  >
                    <Copy className="mr-2 size-4" />
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
                    <Trash2 className="mr-2 size-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </button>
        )}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={() => {
            item.startRenaming();
          }}
        >
          <FileEdit className="mr-2 size-4" />
          Rename
        </ContextMenuItem>
        {isFolder ? (
          <ContextMenuItem
            onClick={() => {
              onUpload(item.getId());
            }}
          >
            <Upload className="mr-2 size-4" />
            Upload Files
          </ContextMenuItem>
        ) : (
          <>
            <ContextMenuItem
              onClick={() => {
                onUpload(item.getId());
              }}
            >
              <Upload className="mr-2 size-4" />
              Upload Files
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                onDuplicate([item]);
              }}
            >
              <Copy className="mr-2 size-4" />
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
          <Trash2 className="mr-2 size-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
