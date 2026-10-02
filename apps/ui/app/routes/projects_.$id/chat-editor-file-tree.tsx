// oxlint-disable max-lines -- TODO: refactor this component to be more manageable
import { useCallback, useState, useRef, useMemo, useEffect, memo } from 'react';
import { flushSync } from 'react-dom';
import type { ItemInstance } from '@headless-tree/core';
import {
  FilePlus,
  FolderPlus,
  MoreHorizontal,
  Search,
  Box,
  Folder,
  FolderOpen,
  CopyMinus,
  Edit,
  Upload,
  Copy,
  Trash2,
  Download,
  Code,
  Clipboard,
} from 'lucide-react';
import { useSelector } from '@xstate/react';
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
import type { Project } from '@taucad/types';
import { kernelConfigurations, tauFileDragMime } from '@taucad/types/constants';
import type { KernelConfiguration } from '@taucad/types/constants';
import type { FileItem } from '#types/editor.types.js';
import { cn } from '#utils/ui.utils.js';
import { Button, buttonVariants } from '#components/ui/button.js';
import { SearchInput } from '#components/search-input.js';
import { toast } from '#components/ui/sonner.js';
import {
  FloatingPanelContent,
  FloatingPanelContentBody,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelMenuButton,
  FloatingPanelButtonGroup,
  FloatingPanelContentTitle,
  useFloatingPanel,
} from '#components/ui/floating-panel.js';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog.js';
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
import { useProject } from '#hooks/use-project.js';
import { mountFileOperationParticipants } from '#filesystem/file-operation-participants.js';
import { EmptyItems } from '#components/ui/empty-items.js';
import { HighlightText } from '#components/highlight-text.js';
import { FileExtensionIcon, getIconIdFromExtension } from '#components/icons/file-extension-icon.js';
import { getFileExtension, encodeTextFile } from '#utils/filesystem.utils.js';
import { downloadBlob, asBuffer } from '@taucad/utils/file';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useFileTreeMap } from '#hooks/use-file-tree.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { parentDirectory } from '@taucad/utils/path';

import type { TreeItemData } from '#routes/projects_.$id/chat-editor-file-tree.utils.js';
import { getItemData, isPathFolder } from '#routes/projects_.$id/chat-editor-file-tree.utils.js';
import { isBundledTypesWorkspacePath } from '#lib/bundled-types-tree.constants.js';
import { isWorkspaceMutationErrorLike, workspaceMutationErrorCopy } from '#filesystem/workspace-errors.js';
import type { WorkspaceMutationErrorLike } from '#filesystem/workspace-errors.js';
import { OverwriteConfirmDialog } from '#components/filesystem/overwrite-confirm-dialog.js';
import type { OverwriteConfirmResult } from '#components/filesystem/overwrite-confirm-dialog.js';

const rootId = '';

const confirmDeleteKeyCombination = {
  key: 'Enter',
} satisfies KeyCombination;

type PendingFolder = {
  parentPath: string; // '' for root
  error: string | undefined;
};

type PendingFile = {
  parentPath: string; // '' for root
  extension: string;
  defaultName: string;
  content: string;
  error: string | undefined;
};

// Helper to read all entries from a directory (may require multiple calls)
async function readAllDirectoryEntries(directoryReader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const entries: FileSystemEntry[] = [];
  let batch: FileSystemEntry[];
  do {
    // oxlint-disable-next-line no-await-in-loop -- Must read batches sequentially
    batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      directoryReader.readEntries(resolve, reject);
    });
    entries.push(...batch);
  } while (batch.length > 0);

  return entries;
}

// Recursively process a FileSystemEntry (file or directory)
async function processFileSystemEntry(
  entry: FileSystemEntry,
  basePath: string,
): Promise<Array<{ file: File; relativePath: string }>> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
    return [{ file, relativePath }];
  }

  if (entry.isDirectory) {
    const directoryEntry = entry as FileSystemDirectoryEntry;
    const directoryPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    const children = await readAllDirectoryEntries(directoryEntry.createReader());
    const results: Array<{ file: File; relativePath: string }> = [];
    for (const child of children) {
      // oxlint-disable-next-line no-await-in-loop -- Must process entries sequentially
      const childResults = await processFileSystemEntry(child, directoryPath);
      results.push(...childResults);
    }

    return results;
  }

  return [];
}

// Process all items from a DataTransfer object
async function processDataTransferItems(
  items: DataTransferItemList,
): Promise<Array<{ file: File; relativePath: string }>> {
  const results: Array<{ file: File; relativePath: string }> = [];
  const entries: FileSystemEntry[] = [];

  // Collect all entries first (must be done synchronously before promises)
  for (const item of items) {
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry();
      if (entry) {
        entries.push(entry);
      }
    }
  }

  // Process entries
  for (const entry of entries) {
    // oxlint-disable-next-line no-await-in-loop -- Must process entries sequentially
    const entryResults = await processFileSystemEntry(entry, '');
    results.push(...entryResults);
  }

  return results;
}

type ChatEditorFileTreeProps = {
  readonly enableSearch?: boolean;
  readonly onSearchChange?: (isOpen: boolean) => void;
  readonly closeButton?: React.ReactNode;
};

export const ChatEditorFileTree = memo(function ({
  enableSearch = false,
  onSearchChange,
  closeButton,
}: ChatEditorFileTreeProps): React.JSX.Element {
  // It's necessary to opt out of React Compiler auto-memoization for this component due to:
  // https://headless-tree.lukasbach.com/guides/react-compiler/
  'use no memo'; // Opt out of React Compiler memoization
  const { open: openPanel } = useFloatingPanel();
  const { projectRef, editorRef } = useProject();
  const projectId = useSelector(projectRef, (state) => state.context.projectId);
  const fileManager = useFileManager();
  const {
    contentService,
    readFile,
    writeFile,
    renameFile,
    duplicateFile,
    deleteFile,
    getZippedDirectory,
    mkdir,
    rmdir,
    bulkMove,
    canMove,
    canRename,
    canDelete,
  } = fileManager;

  useEffect(() => {
    // Editor → FileManager coordination (reading file content for the editor)
    // Note: Editor file navigation no longer drives the viewport.
    // The viewport has its own independent FileSelector (Step 7).
    const fileOpenedSub = editorRef.on('fileOpened', (event) => {
      // Read file content for the editor display
      void readFile(event.path);
    });

    // Track both project and Editor state loading to handle race condition
    // Both must be loaded before we can decide whether to open the main file
    let loadedProject: Project | undefined;
    let loadedEditorState: { loaded: boolean; activeFilePath: string | undefined } | undefined;

    const tryOpenMainFile = (): void => {
      // Wait until both have loaded
      if (!loadedProject || !loadedEditorState) {
        return;
      }

      // If Editor state has an active file, the restoreFiles flow handles it
      if (loadedEditorState.activeFilePath) {
        return;
      }

      // No persisted active file - open main file as fallback
      const mainFile = loadedProject.assets.mechanical?.main;
      if (mainFile) {
        editorRef.send({ type: 'openFile', path: mainFile, source: 'machine' });
      }
    };

    // Project loaded → Store project and try to open main file
    const projectLoadedSub = projectRef.on('projectLoaded', (event) => {
      loadedProject = event.project;
      tryOpenMainFile();
    });

    // Editor state loaded → Store Editor state and try to open main file
    const editorStateLoadedSub = editorRef.on('editorStateLoaded', (event) => {
      const persistedActivePaneId = event.editorState?.activePaneId;
      const persistedActiveFilePath = persistedActivePaneId
        ? event.editorState?.openFiles.find((f) => f.paneId === persistedActivePaneId)?.path
        : undefined;
      loadedEditorState = {
        loaded: true,
        activeFilePath: persistedActiveFilePath,
      };
      tryOpenMainFile();
    });

    // Mount file-operation participants. This is the single funnel
    // that propagates rename/delete events into editor + project
    // machine intents. UI components must NOT dispatch
    // renameFile/closeFile in response to filesystem mutations — the
    // participant does it once, centrally.
    const participantDispose = contentService
      ? mountFileOperationParticipants({ contentService, editorRef, projectRef })
      : undefined;

    return () => {
      fileOpenedSub.unsubscribe();
      projectLoadedSub.unsubscribe();
      editorStateLoadedSub.unsubscribe();
      participantDispose?.();
    };
  }, [projectRef, editorRef, contentService, projectId, readFile]);

  const { treeService } = fileManager;

  const fileTreeMap = useFileTreeMap();
  const fileTree = useMemo((): FileItem[] => {
    if (fileTreeMap.size === 0) {
      return [];
    }

    return [...fileTreeMap.values()].map((entry) => ({
      id: entry.path,
      name: entry.name,
      path: entry.path,
      content: new Uint8Array(),
      language: getIconIdFromExtension(getFileExtension(entry.path)),
      isDirectory: entry.type === 'dir',
    }));
  }, [fileTreeMap]);

  const openFiles = useSelector(editorRef, (state) => state.context.openFiles);
  const activeFilePath = useSelector(editorRef, (state) => {
    const id = state.context.activePaneId;
    if (id === undefined) {
      return undefined;
    }
    return state.context.openFiles.find((f) => f.paneId === id)?.path;
  });

  // Tree state management
  const [expandedItems, setExpandedItemsRaw] = useState<string[]>(() => [rootId]);
  const previousExpandedRef = useRef<Set<string>>(new Set([rootId]));

  const setExpandedItems = useCallback(
    (updater: string[] | ((previous: string[]) => string[])) => {
      setExpandedItemsRaw((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater;
        const previousSet = previousExpandedRef.current;
        const newlyExpanded = next.filter((id) => id !== rootId && !previousSet.has(id));

        if (treeService && newlyExpanded.length > 0) {
          for (const path of newlyExpanded) {
            if (!treeService.hasChildrenLoaded(path)) {
              // async-iife: bootstrap — warm directory listing from expansion update; failures logged only
              void (async (): Promise<void> => {
                try {
                  await treeService.listDirectory(path);
                } catch (error) {
                  console.error('[ChatEditorFileTree] listDirectory failed:', error);
                }
              })();
            }
          }
        }

        previousExpandedRef.current = new Set(next);
        return next;
      });
    },
    [treeService],
  );

  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [focusedItem, setFocusedItem] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetPath, setUploadTargetPath] = useState<string | undefined>(undefined);
  const [pendingFolder, setPendingFolder] = useState<PendingFolder | undefined>(undefined);
  const [pendingFile, setPendingFile] = useState<PendingFile | undefined>(undefined);
  const pendingFileInputRef = useRef<HTMLInputElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemsToDelete, setItemsToDelete] = useState<string[]>([]);

  /**
   * Overwrite-confirm dialog state. We surface the dialog from
   * `onDrop` / `onRename` when the worker reports `NAME_EXISTS` via
   * the `canMove` / `canRename` preflight; the resolver re-issues the
   * mutation with `{ overwrite: true }` when the user picks "Replace".
   *
   * `sessionRememberRef.current` is the "Do not ask again for this
   * session" affordance — once the user opts in for a multi-drag we
   * skip the dialog for the rest of the component lifetime. The ref
   * intentionally does NOT persist across reloads.
   */
  const [overwritePrompt, setOverwritePrompt] = useState<
    | {
        targetPaths: readonly string[];
        resolve: (result: OverwriteConfirmResult) => void;
      }
    | undefined
  >(undefined);
  const sessionRememberRef = useRef(false);

  const requestOverwriteConfirm = useCallback(
    async (targetPaths: readonly string[]): Promise<OverwriteConfirmResult> => {
      if (sessionRememberRef.current) {
        return { choice: 'overwrite', rememberChoice: true };
      }
      return new Promise<OverwriteConfirmResult>((resolve) => {
        setOverwritePrompt({
          targetPaths,
          resolve: (result) => {
            if (result.choice === 'overwrite' && result.rememberChoice) {
              sessionRememberRef.current = true;
            }
            setOverwritePrompt(undefined);
            resolve(result);
          },
        });
      });
    },
    [],
  );

  const surfacePreflightError = useCallback((error: WorkspaceMutationErrorLike): void => {
    const copy = workspaceMutationErrorCopy[error.code];
    if (typeof copy === 'function') {
      toast.error(copy({ path: error.path, target: error.target }));
      return;
    }
    toast.error(`'${error.path}' failed: ${error.code}`);
  }, []);

  // Reveal active file by expanding all parent directories (VSCode-style)
  // Also triggers listDirectory for unloaded ancestor directories.
  useEffect(() => {
    if (!activeFilePath) {
      return;
    }

    // Build array of parent paths: "foo/bar/baz.ts" → ["foo", "foo/bar"]
    const parts = activeFilePath.split('/');
    parts.pop(); // Remove filename
    const parentPaths: string[] = [];
    let current = '';
    for (const part of parts) {
      if (!part) {
        continue;
      }

      current = current ? `${current}/${part}` : part;
      parentPaths.push(current);
    }

    if (parentPaths.length > 0) {
      // Load unloaded ancestor directories before expanding
      if (treeService) {
        for (const path of parentPaths) {
          if (!treeService.hasChildrenLoaded(path)) {
            // async-iife: bootstrap — warm ancestor directories for reveal-active-file; failures logged only
            void (async (): Promise<void> => {
              try {
                await treeService.listDirectory(path);
              } catch (error) {
                console.error('[ChatEditorFileTree] listDirectory failed:', error);
              }
            })();
          }
        }
      }

      setExpandedItems((previous) => {
        const newExpanded = new Set(previous);
        for (const path of parentPaths) {
          newExpanded.add(path);
        }

        return [...newExpanded];
      });
    }
  }, [activeFilePath, treeService, setExpandedItems]);

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
        return getItemData(fileTree, rootId, itemId);
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

        // Sort folders first, then alphabetically
        return children.sort((a, b) => {
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
      },
    }),
    [fileTree, allPaths],
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
      // Handle drag-and-drop by moving items into the target folder.
      // R6 preflight + R7 bulkMove + R8 overwrite dialog in one path:
      //   1. Compute the (source → target) edit set, skipping bundled-types and no-ops.
      //   2. Preflight every edit via `canMove`. Any non-`NAME_EXISTS` error aborts the
      //      whole batch with a toast (consistent with VS Code's drag-validation pattern).
      //   3. Collect every `NAME_EXISTS` collision and raise a single overwrite-confirm
      //      dialog naming all targets so the user only acts once for a multi-drag.
      //   4. Issue one atomic `bulkMove` with `{ overwrite }` set per the dialog result.
      //      The resulting `directoryRenamed` / `fileRenamed` ContentChangeEvents flow
      //      through `file-operation-participants.ts` and update every consumer machine.
      const targetPath = target.item.getId();

      let targetFolder = '';
      if (targetPath === rootId) {
        targetFolder = '';
      } else if (target.item.isFolder()) {
        targetFolder = targetPath;
      } else {
        const parts = targetPath.split('/');
        parts.pop();
        targetFolder = parts.join('/');
      }

      const edits: Array<{ source: string; target: string }> = [];
      for (const item of draggedItems) {
        const oldPath = item.getId();
        if (oldPath === rootId || isBundledTypesWorkspacePath(oldPath)) {
          continue;
        }
        const fileName = oldPath.split('/').pop() ?? oldPath;
        const newPath = targetFolder ? `${targetFolder}/${fileName}` : fileName;
        if (oldPath === newPath) {
          continue;
        }
        edits.push({ source: oldPath, target: newPath });
      }

      if (edits.length === 0) {
        return;
      }

      const collisions: string[] = [];
      const preflightResults = await Promise.all(edits.map(async (edit) => canMove(edit.source, edit.target)));
      for (const [index, result] of preflightResults.entries()) {
        if (result === true) {
          continue;
        }
        if (isWorkspaceMutationErrorLike(result) && result.code === 'NAME_EXISTS') {
          const edit = edits[index];
          if (edit !== undefined) {
            collisions.push(edit.target);
          }
          continue;
        }
        surfacePreflightError(result as WorkspaceMutationErrorLike);
        return;
      }

      let overwriteApproved = false;
      if (collisions.length > 0) {
        const decision = await requestOverwriteConfirm(collisions);
        if (decision.choice !== 'overwrite') {
          return;
        }
        overwriteApproved = true;
      }

      try {
        const result = await bulkMove(edits, overwriteApproved ? { overwrite: true } : undefined);
        if (result.failed.length > 0) {
          const first = result.failed[0];
          if (first !== undefined && isWorkspaceMutationErrorLike(first.error)) {
            surfacePreflightError(first.error);
          } else {
            toast.error('One or more items could not be moved.');
          }
          return;
        }
      } catch (error) {
        toast.error(`Move failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    onRename(item, newName) {
      const oldPath = item.getId();
      if (oldPath === rootId || isBundledTypesWorkspacePath(oldPath)) {
        return;
      }

      const parts = oldPath.split('/');
      parts[parts.length - 1] = newName;
      const newPath = parts.join('/');
      const wasExpanded = item.isFolder() && item.isExpanded();

      // R6 preflight: `canRename` validates `newName` + collision against the
      // worker's authoritative view before mutating. On `NAME_EXISTS` we route
      // through the R8 overwrite-confirm dialog; every other typed error is
      // surfaced as a copy-registry toast and the rename aborts.
      void (async () => {
        const preflight = await canRename(oldPath, newName);
        let overwriteApproved = false;
        if (preflight !== true) {
          if (isWorkspaceMutationErrorLike(preflight) && preflight.code === 'NAME_EXISTS') {
            const decision = await requestOverwriteConfirm([newPath]);
            if (decision.choice !== 'overwrite') {
              return;
            }
            overwriteApproved = true;
          } else {
            surfacePreflightError(preflight as WorkspaceMutationErrorLike);
            return;
          }
        }

        try {
          if (overwriteApproved) {
            const { contentService: cs } = await fileManager.whenServicesReady();
            await cs.move(oldPath, newPath, { overwrite: true });
          } else {
            await renameFile(oldPath, newPath);
          }
          if (wasExpanded) {
            setExpandedItems((previous) => {
              const withoutOld = previous.filter((p) => p !== oldPath);
              return [...withoutOld, newPath];
            });
          }
        } catch (error) {
          toast.error(`Rename failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      })();
    },
    onPrimaryAction(item) {
      if (!item.isFolder()) {
        const path = item.getId();
        const readOnly = isBundledTypesWorkspacePath(path);
        editorRef.send({
          type: 'openFile',
          path,
          source: 'user',
          readOnly,
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
      // Override closeSearch to use external callback
      closeSearch: {
        hotkey: 'Escape',
        handler() {
          onSearchChange?.(false);
        },
      },
    },
    // Allow drops on any item, except when dropping into the same folder the item already lives in
    canDrop(draggedItems, target) {
      const targetPath = target.item.getId();

      // Determine target folder based on drop type (same logic as onDrop)
      let targetFolder = '';
      if (targetPath === rootId) {
        targetFolder = '';
      } else if (target.item.isFolder()) {
        targetFolder = targetPath;
      } else {
        // Dropped on a file, use its parent folder
        const parts = targetPath.split('/');
        parts.pop();
        targetFolder = parts.join('/');
      }

      if (isBundledTypesWorkspacePath(targetFolder)) {
        return false;
      }

      if (draggedItems.some((item) => isBundledTypesWorkspacePath(item.getId()))) {
        return false;
      }

      // Check if ALL dragged items are already in the target folder
      // If so, disallow the drop (nothing would change)
      const allItemsAlreadyInTarget = draggedItems.every((item) => {
        const itemPath = item.getId();
        const itemParts = itemPath.split('/');
        itemParts.pop(); // Remove filename to get parent folder
        const itemParentFolder = itemParts.join('/');
        return itemParentFolder === targetFolder;
      });

      return !allItemsAlreadyInTarget;
    },
    // Set custom data on the drag event so Dockview panels can receive file drops
    createForeignDragObject(items) {
      const paths = items.map((item) => item.getId()).filter((id) => id !== rootId && !isBundledTypesWorkspacePath(id));
      return {
        format: tauFileDragMime,
        data: JSON.stringify(paths),
      };
    },
    // Allow file drops from computer on folders, root, or root-level files
    canDropForeignDragObject(_dataTransfer, target) {
      const targetId = target.item.getId();
      if (isBundledTypesWorkspacePath(targetId)) {
        return false;
      }

      const isRoot = targetId === rootId;
      const isFolder = target.item.isFolder();
      const isRootLevelFile = !targetId.includes('/') && !isFolder;

      return isFolder || isRoot || isRootLevelFile;
    },
    // Handle file drops from computer (supports folders with directory structure)
    async onDropForeignDragObject(dataTransfer, target) {
      const { items } = dataTransfer;
      if (items.length === 0) {
        return;
      }

      // Process all items (files and folders) with directory structure preserved
      const filesWithPaths = await processDataTransferItems(items);
      if (filesWithPaths.length === 0) {
        return;
      }

      // Determine target folder based on drop type (same logic as onDrop)
      const targetPath = target.item.getId();
      let directory = '';
      if (targetPath === rootId) {
        // Dropping on root folder
        directory = '';
      } else if (target.item.isFolder()) {
        directory = targetPath;
      } else {
        // Dropped on a file, use its parent folder
        const parts = targetPath.split('/');
        parts.pop();
        directory = parts.join('/');
      }

      await processDroppedFiles(filesWithPaths, directory);
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

  // Rebuild tree when file data changes
  useEffect(() => {
    tree.rebuildTree();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- tree object is not stable, only rebuild when fileTree changes
  }, [fileTree]);

  // Sync tree search state with external enableSearch prop
  useEffect(() => {
    if (enableSearch && !tree.isSearchOpen()) {
      tree.openSearch();
    } else if (!enableSearch && tree.isSearchOpen()) {
      tree.closeSearch();
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- tree object is not stable, only sync when enableSearch changes
  }, [enableSearch]);

  // Sync active file with tree focus
  useEffect(() => {
    if (activeFilePath && activeFilePath !== focusedItem) {
      setFocusedItem(activeFilePath);
    }
  }, [activeFilePath, focusedItem]);

  // Reveal a file in the tree when requested from the tab context menu.
  // Expands all parent directories, focuses the item, and scrolls it into view.
  useEffect(() => {
    const subscription = editorRef.on('fileRevealRequested', (event) => {
      const targetPath = event.path;

      // Ensure the file-explorer panel is open before revealing the item
      openPanel();

      // Expand all parent directories
      const parts = targetPath.split('/');
      parts.pop(); // Remove the filename
      const parentPaths: string[] = [];
      let current = '';
      for (const part of parts) {
        if (!part) {
          continue;
        }

        current = current ? `${current}/${part}` : part;
        parentPaths.push(current);
      }

      const pathsToExpand = event.expandTarget && targetPath ? [...parentPaths, targetPath] : parentPaths;

      if (pathsToExpand.length > 0) {
        setExpandedItems((previous) => {
          const newExpanded = new Set(previous);
          for (const path of pathsToExpand) {
            newExpanded.add(path);
          }

          return [...newExpanded];
        });
      }

      // Focus the item and scroll into view after the tree re-renders
      setFocusedItem(targetPath);
      setSelectedItems([targetPath]);

      requestAnimationFrame(() => {
        try {
          const item = tree.getItemInstance(targetPath);
          void item.scrollTo({ block: 'center' });
        } catch {
          // Item may not exist in the tree yet
        }
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [editorRef, openPanel, tree, setExpandedItems, setFocusedItem, setSelectedItems]);

  const handleCreateFile = useCallback(
    (template: KernelConfiguration | undefined) => {
      const content = template?.emptyCode ?? '';
      const extension = template ? getFileExtension(template.mainFile) : 'txt';

      // Determine parent path based on focused item
      let parentPath = '';
      if (focusedItem) {
        const focusedItemInstance = tree.getItemInstance(focusedItem);
        if (focusedItemInstance.isFolder()) {
          // Focused item is a folder - create inside it
          parentPath = focusedItem;
          // Expand the folder so user can see the pending input
          setExpandedItems((previous) => (previous.includes(focusedItem) ? previous : [...previous, focusedItem]));
        } else {
          // Focused item is a file - create in its parent folder
          const lastSlashIndex = focusedItem.lastIndexOf('/');
          parentPath = lastSlashIndex > 0 ? focusedItem.slice(0, lastSlashIndex) : '';
        }
      }

      setPendingFile({
        parentPath,
        extension,
        defaultName: template?.mainFile.split('.').slice(0, -1).join('.') ?? '',
        content,
        error: undefined,
      });
    },
    [focusedItem, tree],
  );

  const handleCreateFolder = useCallback(() => {
    // Determine parent path based on focused item
    let parentPath = '';
    if (focusedItem) {
      const focusedItemInstance = tree.getItemInstance(focusedItem);
      if (focusedItemInstance.isFolder()) {
        // Focused item is a folder - create inside it
        parentPath = focusedItem;
        // Expand the folder so user can see the pending input
        setExpandedItems((previous) => (previous.includes(focusedItem) ? previous : [...previous, focusedItem]));
      } else {
        // Focused item is a file - create in its parent folder
        const lastSlashIndex = focusedItem.lastIndexOf('/');
        parentPath = lastSlashIndex > 0 ? focusedItem.slice(0, lastSlashIndex) : '';
      }
    }

    setPendingFolder({ parentPath, error: undefined });
  }, [focusedItem, tree]);

  const handleDelete = useCallback((items: Array<ItemInstance<TreeItemData>>) => {
    const paths = items
      .map((item) => item.getId())
      .filter((path) => path !== rootId && !isBundledTypesWorkspacePath(path));
    if (paths.length === 0) {
      return;
    }

    setItemsToDelete(paths);
    setDeleteDialogOpen(true);
  }, []);

  const confirmDelete = useCallback(() => {
    const deletedPaths = new Set<string>();

    for (const path of itemsToDelete) {
      if (path === rootId || isBundledTypesWorkspacePath(path)) {
        continue;
      }

      deletedPaths.add(path);

      const entry = fileTreeMap.get(path);
      const isFolder = entry?.type === 'dir';

      // R6 preflight: `canDelete` validates against the worker's authoritative
      // view (catches read-only mounts, races where the path disappeared
      // between selection and confirmation). Failure surfaces a typed toast
      // and skips the underlying mutation; success runs `rmdir`/`deleteFile`.
      // The tab-close cascade is handled by `file-operation-participants.ts`
      // via the `directoryDeleted` / `deleted` ContentChangeEvent.
      void (async () => {
        const preflight = await canDelete(path);
        if (preflight !== true) {
          surfacePreflightError(preflight as WorkspaceMutationErrorLike);
          return;
        }
        try {
          if (isFolder) {
            await rmdir(path, { recursive: true });
          } else {
            await deleteFile(path, { source: 'user' });
          }
        } catch (error) {
          toast.error(`Delete failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      })();

      if (isFolder) {
        // Track deleted descendant paths locally so the selection /
        // focus-restore logic below can filter them out.
        for (const [key] of fileTreeMap) {
          if (key.startsWith(`${path}/`)) {
            deletedPaths.add(key);
          }
        }
      }
    }

    setDeleteDialogOpen(false);
    setItemsToDelete([]);

    setSelectedItems((previous) => previous.filter((p) => !deletedPaths.has(p)));

    const firstRemainingItem = tree.getItems().find((i) => i.getId() !== rootId && !deletedPaths.has(i.getId()));
    setFocusedItem(firstRemainingItem?.getId());
  }, [canDelete, deleteFile, fileTreeMap, itemsToDelete, rmdir, surfacePreflightError, tree]);

  const { formattedKeyCombination: confirmDeleteKeyLabel } = useKeybinding(confirmDeleteKeyCombination, confirmDelete, {
    enabled: deleteDialogOpen,
    scope: 'global',
  });

  const handleDuplicate = useCallback(
    (items: Array<ItemInstance<TreeItemData>>) => {
      for (const item of items) {
        const originalPath = item.getId();
        if (originalPath === rootId || item.isFolder() || isBundledTypesWorkspacePath(originalPath)) {
          continue;
        }

        const fileName = originalPath.split('/').pop() ?? originalPath;
        const directory = originalPath.includes('/') ? parentDirectory(originalPath) : '';

        // Generate "name copy.ext", "name copy 2.ext", etc.
        const lastDotIndex = fileName.lastIndexOf('.');
        const baseName = lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName;
        const extension = lastDotIndex > 0 ? fileName.slice(lastDotIndex) : '';

        let duplicateName = `${baseName} copy${extension}`;
        let duplicatePath = directory ? `${directory}/${duplicateName}` : duplicateName;
        let counter = 2;

        while (allPaths.has(duplicatePath)) {
          duplicateName = `${baseName} copy ${counter}${extension}`;
          duplicatePath = directory ? `${directory}/${duplicateName}` : duplicateName;
          counter++;
        }

        const finalPath = duplicatePath;
        toast.promise(
          async () => {
            await duplicateFile(originalPath, finalPath);
            editorRef.send({
              type: 'openFile',
              path: finalPath,
              source: 'user',
            });
          },
          {
            loading: `Duplicating ${fileName}...`,
            success: `Created ${duplicateName}`,
            error: `Failed to duplicate ${fileName}`,
          },
        );
      }
    },
    [allPaths, duplicateFile, editorRef],
  );

  const handleOpenInEditor = useCallback(
    (path: string) => {
      const readOnly = isBundledTypesWorkspacePath(path);
      editorRef.send({ type: 'openFile', path, source: 'user', readOnly });
    },
    [editorRef],
  );

  const handleOpenInViewer = useCallback(
    (path: string) => {
      projectRef.send({ type: 'openInViewer', entryFile: path });
    },
    [projectRef],
  );

  const handleDownload = useCallback(
    (path: string, isFolder: boolean) => {
      const name = path.split('/').pop() ?? path;

      if (isFolder) {
        const fullPath = `/projects/${projectId}/${path}`;
        toast.promise(
          async () => {
            const zipBlob = await getZippedDirectory(fullPath);
            downloadBlob(zipBlob, `${name}.zip`);
          },
          {
            loading: `Downloading ${name}...`,
            success: `Downloaded ${name}.zip`,
            error: `Failed to download ${name}`,
          },
        );
      } else {
        toast.promise(
          async () => {
            const content = await readFile(path);
            const blob = new Blob([asBuffer(content.buffer)], {
              type: 'application/octet-stream',
            });
            downloadBlob(blob, name);
          },
          {
            loading: `Downloading ${name}...`,
            success: `Downloaded ${name}`,
            error: `Failed to download ${path}`,
          },
        );
      }
    },
    [projectId, readFile, getZippedDirectory],
  );

  const handleCopyPath = useCallback((path: string) => {
    void navigator.clipboard.writeText(path);
    toast.success('Path copied to clipboard');
  }, []);

  const handleUploadClick = useCallback((targetPath: string) => {
    setUploadTargetPath(targetPath);
    fileInputRef.current?.click();
  }, []);

  // Shared file processing logic for both drag-drop and upload button
  const processDroppedFiles = useCallback(
    async (files: Array<{ file: File; relativePath: string }>, targetDirectory: string) => {
      for (const { file, relativePath } of files) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- Files need to be read sequentially
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const filePath = targetDirectory ? `${targetDirectory}/${relativePath}` : relativePath;

          // Write file to fileManager - calls worker directly
          // oxlint-disable-next-line no-await-in-loop -- Files need to be written sequentially
          await writeFile(filePath, uint8Array, { source: 'user' });

          // Open file in fileExplorer
          editorRef.send({ type: 'openFile', path: filePath, source: 'user' });
        } catch (error) {
          console.error(`Error uploading file ${file.name}:`, error);
        }
      }
    },
    [writeFile, editorRef],
  );

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const { files } = event.target;
      if (!files || files.length === 0) {
        return;
      }

      const targetItem = uploadTargetPath ? tree.getItemInstance(uploadTargetPath) : undefined;
      const directory = targetItem?.isFolder() ? uploadTargetPath : '';

      // Convert FileList to the new format (flat files have relativePath = filename)
      const filesWithPaths = [...files].map((file) => ({
        file,
        relativePath: file.name,
      }));
      await processDroppedFiles(filesWithPaths, directory ?? '');

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      setUploadTargetPath(undefined);
    },
    [uploadTargetPath, tree, processDroppedFiles],
  );

  // Get display name for delete dialog
  const deleteItemName = useMemo(() => {
    if (itemsToDelete.length === 0) {
      return '';
    }

    if (itemsToDelete.length === 1) {
      // Derive name from path (last segment)
      const path = itemsToDelete[0] ?? '';
      return path.split('/').pop() ?? path;
    }

    return `${itemsToDelete.length} items`;
  }, [itemsToDelete]);

  return (
    <>
      <input
        ref={fileInputRef}
        multiple
        type='file'
        className='hidden'
        aria-label='Upload files'
        onChange={handleFileUpload}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent
          className='sm:max-w-md'
          onCloseAutoFocus={(event) => {
            // Prevent default focus restoration (trigger element is gone)
            // and manually focus the tree container
            event.preventDefault();
            const container = document.querySelector('[data-tree-container]');
            if (container instanceof HTMLElement) {
              container.focus();
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete &apos;{deleteItemName}&apos;?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className='gap-2'>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive', className: 'pr-3' })}
              onClick={confirmDelete}
            >
              Delete
              <KeyShortcut variant='tooltip'>{confirmDeleteKeyLabel}</KeyShortcut>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <OverwriteConfirmDialog
        open={overwritePrompt !== undefined}
        targetPaths={overwritePrompt?.targetPaths ?? []}
        showRememberChoice={(overwritePrompt?.targetPaths.length ?? 0) > 1}
        onResolve={(result) => {
          overwritePrompt?.resolve(result);
        }}
      />

      <FloatingPanelContent>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Files</FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions>
            <FloatingPanelButtonGroup>
              <FloatingPanelMenuButton
                aria-label={enableSearch ? 'Hide search' : 'Search files'}
                className={cn(enableSearch && 'text-primary')}
                tooltip={enableSearch ? 'Hide search' : 'Search files'}
                onClick={() => {
                  onSearchChange?.(!enableSearch);
                }}
              >
                <Search className='size-4' />
              </FloatingPanelMenuButton>
              <DropdownMenu modal={false}>
                <FloatingPanelMenuButton asChild tooltip='Create new file' aria-label='Create new file'>
                  <DropdownMenuTrigger>
                    <FilePlus className='size-4' />
                  </DropdownMenuTrigger>
                </FloatingPanelMenuButton>
                <DropdownMenuContent
                  align='end'
                  onCloseAutoFocus={(event) => {
                    // Prevent Radix from restoring focus to trigger
                    event.preventDefault();
                    // Focus the pending file input (exists because we used flushSync)
                    pendingFileInputRef.current?.focus();
                  }}
                >
                  <DropdownMenuLabel>New File</DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={() => {
                      // Use flushSync to ensure component renders synchronously
                      // so it exists when onCloseAutoFocus fires
                      flushSync(() => {
                        handleCreateFile(undefined);
                      });
                    }}
                  >
                    Blank
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {kernelConfigurations.map((kernel) => (
                    <DropdownMenuItem
                      key={kernel.id}
                      onSelect={() => {
                        // Use flushSync to ensure component renders synchronously
                        flushSync(() => {
                          handleCreateFile(kernel);
                        });
                      }}
                    >
                      {kernel.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <FloatingPanelMenuButton
                aria-label='Create new folder'
                tooltip='Create new folder'
                onClick={handleCreateFolder}
              >
                <FolderPlus className='mt-0.5 size-4' />
              </FloatingPanelMenuButton>
              <FloatingPanelMenuButton
                aria-label='Collapse all folders'
                tooltip='Collapse all folders'
                onClick={() => {
                  tree.collapseAll();
                }}
              >
                <CopyMinus className='size-4' />
              </FloatingPanelMenuButton>
            </FloatingPanelButtonGroup>
            {closeButton}
          </FloatingPanelContentHeaderActions>
        </FloatingPanelContentHeader>
        <FloatingPanelContentBody className='group/filetree flex min-h-0 flex-col'>
          {enableSearch ? (
            <div className='flex w-full shrink-0 flex-row gap-2 border-b bg-sidebar p-2'>
              <SearchInput
                {...tree.getSearchInputElementProps()}
                placeholder='Search files...'
                className='h-7 w-full bg-background'
                // Override onBlur to prevent clearing search when clicking on tree items
                onBlur={undefined}
                onClear={() => {
                  // Only clear the search text, don't close the search panel
                  // Closing is handled by the search toggle button in the header
                  tree.setSearch('');
                }}
              />
            </div>
          ) : null}

          {tree.getItems().length > 0 || pendingFolder !== undefined || pendingFile !== undefined ? (
            <div
              data-tree-container
              {...tree.getContainerProps()}
              className='flex min-h-full flex-1 flex-col gap-0 outline-none'
            >
              <AssistiveTreeDescription tree={tree} />
              {/* Pending folder at root level */}
              {pendingFolder?.parentPath === '' ? (
                <PendingFolderInput
                  parentPath=''
                  error={pendingFolder.error}
                  allPaths={allPaths}
                  level={0}
                  onSubmit={(name) => {
                    void (async () => {
                      try {
                        await mkdir(name, { recursive: true });
                      } catch (error) {
                        toast.error(
                          `Failed to create folder: ${error instanceof Error ? error.message : String(error)}`,
                        );
                        return;
                      }
                    })();
                    setPendingFolder(undefined);
                    setExpandedItems((previous) => [...previous, name]);
                  }}
                  onCancel={() => {
                    setPendingFolder(undefined);
                  }}
                  onError={(error) => {
                    setPendingFolder((previous) => (previous ? { ...previous, error } : undefined));
                  }}
                />
              ) : null}
              {/* Pending file at root level */}
              {pendingFile?.parentPath === '' ? (
                <PendingFileInput
                  inputRef={pendingFileInputRef}
                  parentPath=''
                  extension={pendingFile.extension}
                  defaultName={pendingFile.defaultName}
                  error={pendingFile.error}
                  allPaths={allPaths}
                  level={0}
                  onSubmit={(filename) => {
                    void writeFile(filename, encodeTextFile(pendingFile.content), { source: 'user' });
                    editorRef.send({
                      type: 'openFile',
                      path: filename,
                      source: 'user',
                    });
                    setPendingFile(undefined);
                  }}
                  onCancel={() => {
                    setPendingFile(undefined);
                  }}
                  onError={(error) => {
                    setPendingFile((previous) => (previous ? { ...previous, error } : undefined));
                  }}
                />
              ) : null}
              {(() => {
                const items = tree.getItems();
                const rootItem = tree.getRootItem();
                const activeFileLevel = activeFilePath ? activeFilePath.split('/').length - 1 : 0;
                const dragTargetItem = items.find((i) => i.isDragTarget());

                // Determine highlighting strategy
                // Root item or root-level file = highlight all items
                const isRootDragTarget = rootItem.isDragTarget();
                const highlightAllItems =
                  isRootDragTarget ||
                  (dragTargetItem !== undefined && !dragTargetItem.isFolder() && !dragTargetItem.getId().includes('/'));
                let dragTargetFolderPath: string | undefined;

                if (dragTargetItem) {
                  const targetPath = dragTargetItem.getId();
                  if (dragTargetItem.isFolder()) {
                    // Folder - highlight folder and children
                    dragTargetFolderPath = targetPath;
                  } else if (targetPath.includes('/')) {
                    // Nested file - use parent folder
                    const parts = targetPath.split('/');
                    parts.pop();
                    dragTargetFolderPath = parts.join('/');
                  }
                  // Root-level file case is handled by highlightAllItems above
                }

                return (
                  <>
                    {items
                      .filter((item) => item.getId() !== rootId)
                      .map((item) => {
                        const itemId = item.getId();
                        const itemLevel = item.getItemMeta().level;

                        // Item is highlighted if:
                        // 1. highlightAllItems is true (dropping at root - ALL items highlighted), OR
                        // 2. It IS the drag target folder, OR
                        // 3. It's inside the drag target folder
                        const isInsideDragTarget =
                          highlightAllItems ||
                          (dragTargetFolderPath !== undefined &&
                            (itemId === dragTargetFolderPath || itemId.startsWith(`${dragTargetFolderPath}/`)));

                        return (
                          <div key={itemId}>
                            <TreeItem
                              item={item}
                              isActive={activeFilePath === itemId}
                              isOpen={openFiles.some((f) => f.path === itemId)}
                              searchQuery={tree.getState().search ?? ''}
                              isInsideDragTarget={isInsideDragTarget}
                              activeFileLevel={activeFileLevel}
                              onDelete={handleDelete}
                              onDuplicate={handleDuplicate}
                              onUpload={handleUploadClick}
                              onOpenInEditor={handleOpenInEditor}
                              onOpenInViewer={handleOpenInViewer}
                              onDownload={handleDownload}
                              onCopyPath={handleCopyPath}
                            />
                            {/* Pending folder inside this folder */}
                            {pendingFolder?.parentPath === itemId && item.isFolder() ? (
                              <PendingFolderInput
                                parentPath={pendingFolder.parentPath}
                                error={pendingFolder.error}
                                allPaths={allPaths}
                                level={itemLevel + 1}
                                onSubmit={(name) => {
                                  const folderPath = `${pendingFolder.parentPath}/${name}`;
                                  void (async () => {
                                    try {
                                      await mkdir(folderPath, { recursive: true });
                                    } catch (error) {
                                      toast.error(
                                        `Failed to create folder: ${
                                          error instanceof Error ? error.message : String(error)
                                        }`,
                                      );
                                      return;
                                    }
                                  })();
                                  setPendingFolder(undefined);
                                  setExpandedItems((previous) => [...previous, folderPath]);
                                }}
                                onCancel={() => {
                                  setPendingFolder(undefined);
                                }}
                                onError={(error) => {
                                  setPendingFolder((previous) => (previous ? { ...previous, error } : undefined));
                                }}
                              />
                            ) : null}
                            {/* Pending file inside this folder */}
                            {pendingFile?.parentPath === itemId && item.isFolder() ? (
                              <PendingFileInput
                                inputRef={pendingFileInputRef}
                                parentPath={pendingFile.parentPath}
                                extension={pendingFile.extension}
                                defaultName={pendingFile.defaultName}
                                error={pendingFile.error}
                                allPaths={allPaths}
                                level={itemLevel + 1}
                                onSubmit={(filename) => {
                                  const filePath = `${pendingFile.parentPath}/${filename}`;
                                  void writeFile(filePath, encodeTextFile(pendingFile.content), { source: 'user' });
                                  editorRef.send({
                                    type: 'openFile',
                                    path: filePath,
                                    source: 'user',
                                  });
                                  setPendingFile(undefined);
                                }}
                                onCancel={() => {
                                  setPendingFile(undefined);
                                }}
                                onError={(error) => {
                                  setPendingFile((previous) => (previous ? { ...previous, error } : undefined));
                                }}
                              />
                            ) : null}
                          </div>
                        );
                      })}

                    {/* Root item as spacer to capture empty space drops */}
                    <div
                      {...rootItem.getProps()}
                      className={cn('min-h-4 flex-1', highlightAllItems && 'bg-primary/20')}
                    />
                  </>
                );
              })()}
            </div>
          ) : (
            <EmptyItems className='m-2'>No files available</EmptyItems>
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
  readonly isInsideDragTarget: boolean;
  readonly activeFileLevel: number;
  readonly onDelete: (items: Array<ItemInstance<TreeItemData>>) => void;
  readonly onDuplicate: (items: Array<ItemInstance<TreeItemData>>) => void;
  readonly onUpload: (path: string) => void;
  readonly onOpenInEditor: (path: string) => void;
  readonly onOpenInViewer: (path: string) => void;
  readonly onDownload: (path: string, isFolder: boolean) => void;
  readonly onCopyPath: (path: string) => void;
};

// oxlint-disable-next-line complexity -- UI rendering with many conditional states
function TreeItem({
  item,
  isActive,
  isOpen,
  searchQuery,
  isInsideDragTarget,
  activeFileLevel,
  onDelete,
  onDuplicate,
  onUpload,
  onOpenInEditor,
  onOpenInViewer,
  onDownload,
  onCopyPath,
}: TreeItemProps): React.JSX.Element {
  const itemLevel = item.getItemMeta().level;
  const paddingLeft = itemLevel * 16 + 8;
  const isSelected = item.isSelected();
  const isRenaming = item.isRenaming();
  const isFolder = item.isFolder();

  // Rename input - NOT wrapped by ContextMenu to avoid focus interference
  if (isRenaming) {
    const renameInputProps = item.getRenameInputProps() as React.InputHTMLAttributes<HTMLInputElement>;
    return (
      <div
        className='relative flex h-7 items-center border border-primary py-1 pr-1 pl-2'
        style={{ paddingLeft: `${paddingLeft}px` }}
      >
        {/* Indent guide lines (VS Code-style) */}
        {Array.from({ length: itemLevel }, (_, index) => {
          const guideDepth = index + 1;
          const isActiveGuide = activeFileLevel > 0 ? guideDepth === activeFileLevel : guideDepth === itemLevel;
          return (
            <span
              key={guideDepth}
              aria-hidden
              className={cn(
                'pointer-events-none absolute top-0 h-full w-px',
                isActiveGuide ? 'bg-border' : 'bg-border opacity-0 transition-opacity group-hover/filetree:opacity-100',
              )}
              style={{ left: `${guideDepth * 16}px` }}
            />
          );
        })}
        <div className='flex min-w-0 flex-1 items-center gap-2'>
          {isFolder ? (
            item.isExpanded() ? (
              <FolderOpen className='size-4 shrink-0 text-muted-foreground' />
            ) : (
              <Folder className='size-4 shrink-0 text-muted-foreground' />
            )
          ) : (
            <FileExtensionIcon filename={item.getItemName()} className='size-3.5 shrink-0 text-muted-foreground' />
          )}
          <input
            className='h-full min-w-0 flex-1 border-none bg-transparent px-0 text-sm shadow-none outline-none focus:border-transparent focus:ring-0 focus:ring-offset-0'
            autoCorrect='off'
            {...renameInputProps}
            onFocus={(event) => {
              // Call the library's onFocus handler first if it exists
              renameInputProps.onFocus?.(event);

              // Then select text: for folders select all, for files select name without extension
              const input = event.currentTarget;
              if (isFolder) {
                input.setSelectionRange(0, input.value.length);
              } else {
                const lastDotIndex = input.value.lastIndexOf('.');
                const endIndex = lastDotIndex > 0 ? lastDotIndex : input.value.length;
                input.setSelectionRange(0, endIndex);
              }
            }}
          />
        </div>
      </div>
    );
  }

  // Normal view - wrapped by ContextMenu
  const treeItemProps = item.getProps();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          {...treeItemProps}
          className={cn(
            'group/file relative flex h-7 w-full cursor-pointer items-center justify-between py-1 pr-1 pl-2 text-sm text-sidebar-foreground',
            !isActive && 'hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
            isActive && !isSelected && 'bg-sidebar-accent',
            isSelected && 'bg-sidebar-accent/70 text-sidebar-accent-foreground',
            item.isMatchingSearch() && 'bg-primary/20',
            (item.isDragTarget() || isInsideDragTarget) && 'bg-primary/20',
          )}
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={(event) => {
            if (event.shiftKey || event.ctrlKey || event.metaKey) {
              // Multi-select click: handle selection + focus only, skip primaryAction (file open)
              if (event.shiftKey) {
                item.selectUpTo(event.ctrlKey || event.metaKey);
              } else {
                item.toggleSelect();
              }

              item.setFocused();
              return;
            }

            // Plain click: delegate to tree's onClick (handles selection, focus, primaryAction, expand/collapse)
            const { onClick } = treeItemProps as {
              onClick?: (event: MouseEvent) => void;
            };
            onClick?.(event.nativeEvent);
          }}
        >
          {/* Indent guide lines (VS Code-style) */}
          {Array.from({ length: itemLevel }, (_, index) => {
            const guideDepth = index + 1;
            const isActiveGuide = activeFileLevel > 0 ? guideDepth === activeFileLevel : guideDepth === itemLevel;
            return (
              <span
                key={guideDepth}
                aria-hidden
                className={cn(
                  'pointer-events-none absolute top-0 h-full w-px',
                  isActiveGuide
                    ? 'bg-border'
                    : 'bg-border opacity-0 transition-opacity group-hover/filetree:opacity-100',
                )}
                style={{ left: `${guideDepth * 16}px` }}
              />
            );
          })}
          <div className='flex min-w-0 flex-1 grow items-center gap-2'>
            {isFolder ? (
              item.isExpanded() ? (
                <FolderOpen className='size-4 shrink-0 text-muted-foreground' />
              ) : (
                <Folder className='size-4 shrink-0 text-muted-foreground' />
              )
            ) : (
              <FileExtensionIcon filename={item.getItemName()} className='size-3.5 shrink-0 text-muted-foreground' />
            )}
            <span className={cn('truncate', isOpen && 'font-medium', isActive && 'text-primary')}>
              <HighlightText text={item.getItemName()} searchTerm={searchQuery} />
            </span>
          </div>
          {isFolder ? null : (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='secondary'
                  size='icon'
                  className='absolute top-1/2 right-1 size-5 -translate-y-1/2 opacity-0 group-hover/file:opacity-50 hover:bg-secondary hover:opacity-100'
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <MoreHorizontal className='size-3.5' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start' side='right'>
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenInEditor(item.getId());
                  }}
                >
                  <Code />
                  <span>Open in Editor</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenInViewer(item.getId());
                  }}
                >
                  <Box />
                  <span>Open in Viewer</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    item.startRenaming();
                  }}
                >
                  <Edit />
                  <span>Rename</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    onUpload(item.getId());
                  }}
                >
                  <Upload />
                  <span>Upload Files</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    onDuplicate([item]);
                  }}
                >
                  <Copy />
                  <span>Duplicate</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    onCopyPath(item.getId());
                  }}
                >
                  <Clipboard />
                  <span>Copy Path</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    onDownload(item.getId(), false);
                  }}
                >
                  <Download />
                  <span>Download</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant='destructive'
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete([item]);
                  }}
                >
                  <Trash2 />
                  <span>Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {isFolder ? null : (
          <>
            <ContextMenuItem
              onClick={() => {
                onOpenInEditor(item.getId());
              }}
            >
              <Code />
              <span>Open in Editor</span>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                onOpenInViewer(item.getId());
              }}
            >
              <Box />
              <span>Open in Viewer</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem
          onSelect={() => {
            item.startRenaming();
          }}
        >
          <Edit />
          <span>Rename</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            onUpload(item.getId());
          }}
        >
          <Upload />
          <span>Upload Files</span>
        </ContextMenuItem>
        {isFolder ? null : (
          <ContextMenuItem
            onClick={() => {
              onDuplicate([item]);
            }}
          >
            <Copy />
            <span>Duplicate</span>
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => {
            onCopyPath(item.getId());
          }}
        >
          <Clipboard />
          <span>Copy Path</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            onDownload(item.getId(), isFolder);
          }}
        >
          <Download />
          <span>{isFolder ? 'Download as ZIP' : 'Download'}</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant='destructive'
          onClick={() => {
            onDelete([item]);
          }}
        >
          <Trash2 />
          <span>Delete</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

type PendingFolderInputProps = {
  readonly parentPath: string;
  readonly error: string | undefined;
  readonly allPaths: Set<string>;
  readonly level: number;
  readonly onSubmit: (name: string) => void;
  readonly onCancel: () => void;
  readonly onError: (error: string | undefined) => void;
};

function PendingFolderInput({
  parentPath,
  error,
  allPaths,
  level,
  onSubmit,
  onCancel,
  onError,
}: PendingFolderInputProps): React.JSX.Element {
  const [value, setValue] = useState('');
  const paddingLeft = level * 16 + 8;

  const validate = useCallback(
    (name: string): string | undefined => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return 'A file or folder name must be provided.';
      }
      // R6: reject characters that would yield INVALID_NAME at the worker
      // before the async submit round-trips.
      if (trimmedName.includes('/') || trimmedName.includes('\\') || trimmedName === '.' || trimmedName === '..') {
        return `'${trimmedName}' is not a valid name. Avoid '/', '\\', and reserved segments like '.' or '..'.`;
      }

      const fullPath = parentPath ? `${parentPath}/${trimmedName}` : trimmedName;
      if (isBundledTypesWorkspacePath(fullPath)) {
        return `'${fullPath}' is inside the bundled @types workspace, which is read-only.`;
      }
      if (allPaths.has(fullPath)) {
        return `A file or folder ${trimmedName} already exists at this location. Please choose a different name.`;
      }

      return undefined;
    },
    [parentPath, allPaths],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const validationError = validate(value);
        if (validationError) {
          onError(validationError);
        } else {
          onSubmit(value.trim());
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    },
    [value, validate, onSubmit, onCancel, onError],
  );

  const handleBlur = useCallback(() => {
    // Cancel on blur (user clicked elsewhere)
    onCancel();
  }, [onCancel]);

  return (
    <div className='flex w-full flex-col gap-0.5'>
      <div
        className='flex h-7 w-full items-center border border-primary py-1 pr-1'
        style={{ paddingLeft: `${paddingLeft}px` }}
      >
        <div className='flex min-w-0 flex-1 items-center gap-2'>
          <Folder className='size-4 shrink-0 text-muted-foreground' />
          <input
            autoFocus
            value={value}
            className='h-full min-w-0 flex-1 border-none bg-transparent px-0 text-sm shadow-none outline-none focus:border-transparent focus:ring-0 focus:ring-offset-0'
            placeholder='Folder name'
            onChange={(event) => {
              setValue(event.target.value);
              // Clear error when user types
              if (error) {
                onError(undefined);
              }
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
          />
        </div>
      </div>
      {error ? (
        <div
          className='rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive'
          style={{ marginLeft: `${paddingLeft}px` }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

type PendingFileInputProps = {
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly parentPath: string;
  readonly extension: string;
  readonly defaultName: string;
  readonly error: string | undefined;
  readonly allPaths: Set<string>;
  readonly level: number;
  readonly onSubmit: (name: string) => void;
  readonly onCancel: () => void;
  readonly onError: (error: string | undefined) => void;
};

function PendingFileInput({
  inputRef,
  parentPath,
  extension,
  defaultName,
  error,
  allPaths,
  level,
  onSubmit,
  onCancel,
  onError,
}: PendingFileInputProps): React.JSX.Element {
  const fullDefaultName = defaultName ? `${defaultName}.${extension}` : '';
  const [value, setValue] = useState(fullDefaultName);
  const paddingLeft = level * 16 + 8;

  // Handle focus to select filename without extension
  const handleFocus = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    // Select only the name part, not the extension
    const lastDotIndex = input.value.lastIndexOf('.');
    const endIndex = lastDotIndex > 0 ? lastDotIndex : input.value.length;
    input.setSelectionRange(0, endIndex);
  }, []);

  const validate = useCallback(
    (filename: string): string | undefined => {
      const trimmedName = filename.trim();
      if (!trimmedName) {
        return 'A file name must be provided.';
      }
      // R6: reject characters that would yield INVALID_NAME at the worker
      // before the async submit round-trips.
      if (trimmedName.includes('/') || trimmedName.includes('\\') || trimmedName === '.' || trimmedName === '..') {
        return `'${trimmedName}' is not a valid name. Avoid '/', '\\', and reserved segments like '.' or '..'.`;
      }

      const fullPath = parentPath ? `${parentPath}/${trimmedName}` : trimmedName;
      if (isBundledTypesWorkspacePath(fullPath)) {
        return `'${fullPath}' is inside the bundled @types workspace, which is read-only.`;
      }
      if (allPaths.has(fullPath)) {
        return `A file ${trimmedName} already exists at this location. Please choose a different name.`;
      }

      return undefined;
    },
    [parentPath, allPaths],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const validationError = validate(value);
        if (validationError) {
          onError(validationError);
        } else {
          onSubmit(value.trim());
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    },
    [value, validate, onSubmit, onCancel, onError],
  );

  const handleBlur = useCallback(() => {
    onCancel();
  }, [onCancel]);

  // Get the current extension from the value for the icon
  const currentExtension = value.includes('.') ? (value.split('.').pop() ?? extension) : extension;

  return (
    <div className='flex w-full flex-col gap-0.5'>
      <div
        className='flex h-7 w-full items-center border border-primary py-1 pr-1'
        style={{ paddingLeft: `${paddingLeft}px` }}
      >
        <div className='flex min-w-0 flex-1 items-center gap-2'>
          <FileExtensionIcon
            filename={`file.${currentExtension}`}
            className='size-3.5 shrink-0 text-muted-foreground'
          />
          <input
            ref={inputRef}
            autoFocus
            value={value}
            className='h-full min-w-0 flex-1 border-none bg-transparent px-0 text-sm shadow-none outline-none focus:border-transparent focus:ring-0 focus:ring-offset-0'
            placeholder='New File'
            onChange={(event) => {
              setValue(event.target.value);
              // Clear error when user types
              if (error) {
                onError(undefined);
              }
            }}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
          />
        </div>
      </div>
      {error ? (
        <div
          className='rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive'
          style={{ marginLeft: `${paddingLeft}px` }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
