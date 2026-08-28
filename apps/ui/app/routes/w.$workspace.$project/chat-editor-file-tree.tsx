// oxlint-disable max-lines -- TODO: refactor this component to be more manageable
import { useCallback, useState, useRef, useMemo, useEffect, memo } from 'react';
import { createPortal, flushSync } from 'react-dom';
import type { ItemInstance, TreeInstance } from '@headless-tree/core';
import {
  FilePlus,
  FolderPlus,
  MoreHorizontal,
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
  Lock,
} from 'lucide-react';
import { useSelector } from '@xstate/react';
import {
  AssistiveDndState,
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
import { FileExtensionIcon, getIconIdForFilename } from '#components/icons/file-extension-icon.js';
import { getFileExtension, encodeTextFile } from '#utils/filesystem.utils.js';
import { downloadBlob, asBuffer } from '@taucad/utils/file';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useFileTreeMap } from '#hooks/use-file-tree.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { parentDirectory } from '@taucad/utils/path';

import type { TreeItemData } from '#routes/w.$workspace.$project/chat-editor-file-tree.utils.js';
import {
  getItemData,
  isEditorSystemArtifactPath,
  isPathFolder,
} from '#routes/w.$workspace.$project/chat-editor-file-tree.utils.js';
import { isBundledTypesWorkspacePath } from '#lib/bundled-types-tree.constants.js';
import { isWorkspaceMutationErrorLike, workspaceMutationErrorCopy } from '#filesystem/workspace-errors.js';
import type { WorkspaceMutationErrorLike } from '#filesystem/workspace-errors.js';
import { OverwriteConfirmDialog } from '#components/filesystem/overwrite-confirm-dialog.js';
import type { OverwriteConfirmResult } from '#components/filesystem/overwrite-confirm-dialog.js';
import {
  createFileTreeMoveEdits,
  fileTreeRootId,
  joinFileTreePath,
  resolveFileTreeTargetDirectory,
} from '#routes/w.$workspace.$project/file-tree-targets.js';
import {
  canReadForeignFileTreeDrop,
  collectDropDirectoryPaths,
  ingestFileTreeDataTransfer,
} from '#routes/w.$workspace.$project/file-tree-drop-ingestion.js';
import type {
  DroppedDirectory,
  DroppedFile,
  DropIngestionResult,
} from '#routes/w.$workspace.$project/file-tree-drop-ingestion.js';
import {
  copyTextToClipboard,
  summarizeFileTreeImport,
} from '#routes/w.$workspace.$project/file-tree-operation-results.js';
import {
  createFileTreeDownloadError,
  getFileTreeDownloadErrorMessage,
  getFileTreeDownloadPolicy,
} from '#routes/w.$workspace.$project/file-tree-download-policy.js';

const rootId = fileTreeRootId;
const keyboardDragStartHotkey = 'Control+ShiftLeft+KeyD';
const keyboardDragStartRightShiftHotkey = 'Control+ShiftRight+KeyD';
const keyboardDragStartLabel = 'Control+Shift+D';
type FileTreeAssistiveDndLabel = NonNullable<
  React.ComponentProps<typeof AssistiveTreeDescription<TreeItemData>>['getLabel']
>;

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

type ForeignDropTarget = {
  readonly path: string;
  readonly isFolder: boolean;
  readonly dataTransfer: DataTransfer;
};

function startFileTreeKeyboardDrag(treeInstance: TreeInstance<TreeItemData>): void {
  const selectedItems = treeInstance.getSelectedItems();
  const focusedItem = treeInstance.getFocusedItem();
  treeInstance.startKeyboardDrag(selectedItems.includes(focusedItem) ? selectedItems : [...selectedItems, focusedItem]);
}

const getFileTreeAssistiveDndLabel: FileTreeAssistiveDndLabel = (dnd, assistiveState, hotkeys): string => {
  const itemNames = dnd?.draggedItems?.map((item) => item.getItemName()).join(', ') ?? '';
  const dragTarget = dnd?.dragTarget;
  const position =
    dragTarget === undefined
      ? 'None'
      : 'childIndex' in dragTarget
        ? `${dragTarget.childIndex} of ${dragTarget.item.getChildren().length} in ${dragTarget.item.getItemName()}`
        : `in ${dragTarget.item.getItemName()}`;
  const navGuide =
    `Press ${hotkeys.dragUp.hotkey} and ${hotkeys.dragDown.hotkey} to move up or down, ` +
    `${hotkeys.completeDrag.hotkey} to drop, ${hotkeys.cancelDrag.hotkey} to abort.`;

  switch (assistiveState) {
    case AssistiveDndState.Started: {
      return itemNames
        ? `Dragging ${itemNames}. Current position: ${position}. ${navGuide}`
        : `Current position: ${position}. ${navGuide}`;
    }
    case AssistiveDndState.Dragging: {
      return itemNames ? `${itemNames}, ${position}` : position;
    }
    case AssistiveDndState.Completed: {
      return `Drag completed. Press ${keyboardDragStartLabel} to move selected items`;
    }
    case AssistiveDndState.Aborted: {
      return `Drag cancelled. Press ${keyboardDragStartLabel} to move selected items`;
    }
    case AssistiveDndState.None: {
      return `Press ${keyboardDragStartLabel} to move selected items`;
    }
  }
};

function getForeignDropTargetFromEvent(event: DragEvent): Omit<ForeignDropTarget, 'dataTransfer'> {
  const targetElement = event.target instanceof Element ? event.target : undefined;
  const itemElement = targetElement?.closest<HTMLElement>('[data-file-tree-path]');
  if (!itemElement) {
    return { path: rootId, isFolder: true };
  }

  return {
    path: itemElement.dataset['fileTreePath'] ?? rootId,
    isFolder: itemElement.dataset['fileTreeKind'] !== 'file',
  };
}

function surfaceDropIngestionResult(result: Exclude<DropIngestionResult, { type: 'entries' }>): void {
  switch (result.type) {
    case 'empty': {
      toast.error(
        result.reason === 'no-items'
          ? 'Drop did not include any files or folders.'
          : 'No readable files or folders were found in the drop.',
      );
      return;
    }
    case 'unsupported': {
      toast.error(
        result.reason === 'recursive-folder-drop-unavailable'
          ? 'This browser cannot read dropped folders here.'
          : 'Dropped items could not be read.',
      );
      return;
    }
    case 'error': {
      toast.error('Drop failed.', { description: result.message });
    }
  }
}

function addDeletedDescendantPaths(options: {
  readonly deletedPaths: Set<string>;
  readonly fileTreeMap: ReadonlyMap<string, unknown>;
  readonly path: string;
}): void {
  const descendantPrefix = `${options.path}/`;
  for (const [key] of options.fileTreeMap) {
    if (!key.startsWith(descendantPrefix)) {
      continue;
    }

    options.deletedPaths.add(key);
  }
}

type ChatEditorFileTreeProps = {
  readonly actionsContainer?: Element | DocumentFragment | null;
  readonly closeButton?: React.ReactNode;
  readonly showTitle?: boolean;
  readonly borderless?: boolean;
  readonly onRequestOpen?: () => void;
  readonly onOpenFile?: (path: string, readOnly?: boolean) => void;
  readonly shouldHandleReveal?: () => boolean;
  readonly readOnly?: boolean;
};

export const ChatEditorFileTree = memo(function ({
  actionsContainer,
  closeButton,
  showTitle = true,
  borderless = false,
  onRequestOpen,
  onOpenFile,
  shouldHandleReveal,
  readOnly = false,
}: ChatEditorFileTreeProps): React.JSX.Element {
  // It's necessary to opt out of React Compiler auto-memoization for this component due to:
  // https://headless-tree.lukasbach.com/guides/react-compiler/
  'use no memo'; // Opt out of React Compiler memoization
  const { projectRef, editorRef } = useProject();
  const fileManager = useFileManager();
  const {
    contentService,
    readFile,
    writeFile,
    renameFile,
    duplicateFile,
    deleteFile,
    getZippedDirectory,
    createDirectory,
    deleteDirectory,
    bulkMove,
    canMove,
    canRename,
    canCreate,
    canDelete,
  } = fileManager;
  const openFiles = useSelector(editorRef, (state) => state.context.openFiles);
  const activeFilePath = useSelector(editorRef, (state) => {
    const id = state.context.activePaneId;
    return id === undefined ? undefined : state.context.openFiles.find((file) => file.paneId === id)?.path;
  });

  useEffect(() => {
    // Editor → FileManager coordination (reading file content for the editor)
    // Note: Editor file navigation no longer drives the viewport.
    // The viewport has its own independent FileSelector (Step 7).
    const fileOpenedSub = editorRef.on('fileOpened', (event) => {
      // Read file content for the editor display
      void readFile(event.path);
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
      participantDispose?.();
    };
  }, [projectRef, editorRef, contentService, readFile]);

  const requestOpenFile = useCallback(
    (path: string, readOnly?: boolean) => {
      if (onOpenFile) {
        onOpenFile(path, readOnly);
        return;
      }
      editorRef.send({ type: 'openFile', path, source: 'user', readOnly });
    },
    [editorRef, onOpenFile],
  );

  const { treeService } = fileManager;

  const fileTreeMap = useFileTreeMap();
  const fileTree = useMemo((): FileItem[] => {
    if (fileTreeMap.size === 0) {
      return [];
    }

    return [...fileTreeMap.values()]
      .filter((entry) => !isEditorSystemArtifactPath(entry.path))
      .map((entry) => ({
        id: entry.path,
        name: entry.name,
        path: entry.path,
        content: new Uint8Array(),
        language: getIconIdForFilename(entry.path),
        isDirectory: entry.type === 'dir',
      }));
  }, [fileTreeMap]);

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
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const [uploadTargetPath, setUploadTargetPath] = useState<string | undefined>(undefined);
  const [pendingFolder, setPendingFolder] = useState<PendingFolder | undefined>(undefined);
  const [pendingFile, setPendingFile] = useState<PendingFile | undefined>(undefined);
  const pendingFileInputRef = useRef<HTMLInputElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemsToDelete, setItemsToDelete] = useState<string[]>([]);
  const focusedItemRef = useRef<string | undefined>(undefined);
  const lastSyncedActiveFilePathRef = useRef<string | undefined>(undefined);

  /**
   * Overwrite-confirm dialog state for create and upload flows. Moves and
   * renames reject collisions because their storage operation has no truthful
   * replacement contract.
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

  const mutationErrorMessage = useCallback((error: WorkspaceMutationErrorLike): string => {
    const copy = workspaceMutationErrorCopy[error.code];
    if (typeof copy === 'function') {
      return copy({ path: error.path, target: error.target });
    }
    return `'${error.path}' failed: ${error.code}`;
  }, []);

  const surfacePreflightError = useCallback(
    (error: WorkspaceMutationErrorLike): void => {
      toast.error(mutationErrorMessage(error));
    },
    [mutationErrorMessage],
  );

  const preflightCreate = useCallback(
    async (path: string, kind: 'file' | 'directory'): Promise<true | WorkspaceMutationErrorLike> => {
      const result = await canCreate(path, kind);
      return result === true ? true : (result as WorkspaceMutationErrorLike);
    },
    [canCreate],
  );

  const submitCreateFolder = useCallback(
    async (parentPath: string, name: string): Promise<void> => {
      const folderPath = joinFileTreePath(parentPath, name);
      try {
        const preflight = await preflightCreate(folderPath, 'directory');
        if (preflight !== true) {
          const message = mutationErrorMessage(preflight);
          setPendingFolder((previous) =>
            previous?.parentPath === parentPath ? { ...previous, error: message } : previous,
          );
          toast.error(message);
          return;
        }
        await createDirectory(folderPath, { recursive: true });
        setPendingFolder(undefined);
        setExpandedItems((previous) => (previous.includes(folderPath) ? previous : [...previous, folderPath]));
        setFocusedItem(folderPath);
        setSelectedItems([folderPath]);
      } catch (error) {
        const message = `Failed to create folder: ${error instanceof Error ? error.message : String(error)}`;
        setPendingFolder((previous) =>
          previous?.parentPath === parentPath ? { ...previous, error: message } : previous,
        );
        toast.error(message);
      }
    },
    [createDirectory, mutationErrorMessage, preflightCreate],
  );

  const submitCreateFile = useCallback(
    async (parentPath: string, filename: string, content: string): Promise<void> => {
      const filePath = joinFileTreePath(parentPath, filename);
      try {
        const preflight = await preflightCreate(filePath, 'file');
        if (preflight !== true) {
          if (isWorkspaceMutationErrorLike(preflight) && preflight.code === 'NAME_EXISTS') {
            const decision = await requestOverwriteConfirm([filePath]);
            if (decision.choice !== 'overwrite') {
              return;
            }
          } else {
            const message = mutationErrorMessage(preflight);
            setPendingFile((previous) =>
              previous?.parentPath === parentPath ? { ...previous, error: message } : previous,
            );
            toast.error(message);
            return;
          }
        }
        await writeFile(filePath, encodeTextFile(content), { source: 'user' });
        requestOpenFile(filePath);
        setPendingFile(undefined);
        setFocusedItem(filePath);
        setSelectedItems([filePath]);
      } catch (error) {
        const message = `Failed to create file: ${error instanceof Error ? error.message : String(error)}`;
        setPendingFile((previous) =>
          previous?.parentPath === parentPath ? { ...previous, error: message } : previous,
        );
        toast.error(message);
      }
    },
    [mutationErrorMessage, preflightCreate, requestOpenFile, requestOverwriteConfirm, writeFile],
  );

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

  const handleRename = useCallback(
    async (item: ItemInstance<TreeItemData>, newName: string): Promise<void> => {
      const oldPath = item.getId();
      if (oldPath === rootId || isBundledTypesWorkspacePath(oldPath)) {
        return;
      }

      const parts = oldPath.split('/');
      parts[parts.length - 1] = newName;
      const newPath = parts.join('/');
      const wasExpanded = item.isFolder() && item.isExpanded();

      // Validate the basename and destination against the worker's authoritative
      // view. Every collision remains non-destructive and aborts the rename.
      const preflight = await canRename(oldPath, newName);
      if (preflight !== true) {
        surfacePreflightError(preflight as WorkspaceMutationErrorLike);
        return;
      }

      try {
        await renameFile(oldPath, newPath);
        if (wasExpanded) {
          setExpandedItems((previous) => {
            const withoutOld = previous.filter((p) => p !== oldPath);
            return [...withoutOld, newPath];
          });
        }
      } catch (error) {
        toast.error(`Rename failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [canRename, renameFile, surfacePreflightError],
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
      // Preflight and then execute truthful sequential moves:
      //   1. Compute the (source → target) edit set, skipping bundled-types and no-ops.
      //   2. Abort on any typed preflight error, including collisions.
      //   3. Issue `bulkMove`; completed and failed edits are reported exactly.
      //      The resulting `directoryRenamed` / `fileRenamed` ContentChangeEvents flow
      //      through `file-operation-participants.ts` and update every consumer machine.
      const targetPath = target.item.getId();
      const targetDirectory = resolveFileTreeTargetDirectory({
        targetPath,
        getTargetData: (path) => (path === targetPath ? { isFolder: target.item.isFolder() } : undefined),
      });
      if (isBundledTypesWorkspacePath(targetPath) || isBundledTypesWorkspacePath(targetDirectory)) {
        return;
      }

      const edits = createFileTreeMoveEdits({
        sourcePaths: draggedItems.map((item) => item.getId()),
        targetDirectory,
        isReadOnlyPath: isBundledTypesWorkspacePath,
      });

      if (edits.length === 0) {
        return;
      }

      const preflightResults = await Promise.all(edits.map(async (edit) => canMove(edit.source, edit.target)));
      for (const result of preflightResults) {
        if (result === true) {
          continue;
        }
        surfacePreflightError(result as WorkspaceMutationErrorLike);
        return;
      }

      try {
        const result = await bulkMove(edits);
        if (result.failed.length > 0) {
          const first = result.failed[0];
          if (first !== undefined && isWorkspaceMutationErrorLike(first.error)) {
            surfacePreflightError(first.error);
          } else {
            toast.error('One or more items could not be moved.');
          }
        }
      } catch (error) {
        toast.error(`Move failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    onRename(item, newName) {
      void handleRename(item, newName);
    },
    onPrimaryAction(item) {
      if (!item.isFolder()) {
        const path = item.getId();
        const readOnly = isBundledTypesWorkspacePath(path);
        requestOpenFile(path, readOnly);
      }
    },
    hotkeys: {
      startDrag: {
        hotkey: keyboardDragStartHotkey,
        preventDefault: true,
        isEnabled: (treeInstance) => !treeInstance.getState().dnd,
      },
      customStartDragRightShift: {
        hotkey: keyboardDragStartRightShiftHotkey,
        preventDefault: true,
        isEnabled: (treeInstance) => !treeInstance.getState().dnd,
        handler(_event, treeInstance) {
          startFileTreeKeyboardDrag(treeInstance);
        },
      },
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
      // Keep the always-visible filter open and let Escape clear it.
      closeSearch: {
        hotkey: 'Escape',
        handler(_event, treeInstance) {
          treeInstance.setSearch('');
        },
      },
    },
    // Allow no-op writable drops to target the intended folder. `onDrop` turns
    // those into zero edits; returning false here lets the tree choose a nearby
    // ancestor target and can accidentally move files out of their folder.
    canDrop(draggedItems, target) {
      const targetPath = target.item.getId();
      const targetDirectory = resolveFileTreeTargetDirectory({
        targetPath,
        getTargetData: (path) => (path === targetPath ? { isFolder: target.item.isFolder() } : undefined),
      });

      if (isBundledTypesWorkspacePath(targetPath) || isBundledTypesWorkspacePath(targetDirectory)) {
        return false;
      }

      if (draggedItems.some((item) => isBundledTypesWorkspacePath(item.getId()))) {
        return false;
      }

      return true;
    },
    // Set custom data on the drag event so Dockview panels can receive file drops
    createForeignDragObject(items) {
      const paths = items.map((item) => item.getId()).filter((id) => id !== rootId && !isBundledTypesWorkspacePath(id));
      return {
        format: tauFileDragMime,
        data: JSON.stringify(paths),
      };
    },
    // Allow file drops from computer on writable folders, root, or file-parent targets.
    canDropForeignDragObject(dataTransfer, target) {
      const targetId = target.item.getId();
      const targetDirectory = resolveFileTreeTargetDirectory({
        targetPath: targetId,
        getTargetData: (path) => (path === targetId ? { isFolder: target.item.isFolder() } : undefined),
      });
      if (
        isBundledTypesWorkspacePath(targetId) ||
        isBundledTypesWorkspacePath(targetDirectory) ||
        !canReadForeignFileTreeDrop(dataTransfer)
      ) {
        return false;
      }

      return true;
    },
    // Handle file drops from computer (supports folders with directory structure)
    async onDropForeignDragObject(dataTransfer, target) {
      const targetPath = target.item.getId();
      const targetDirectory = resolveFileTreeTargetDirectory({
        targetPath,
        getTargetData: (path) => (path === targetPath ? { isFolder: target.item.isFolder() } : undefined),
      });
      if (isBundledTypesWorkspacePath(targetPath) || isBundledTypesWorkspacePath(targetDirectory)) {
        toast.error('This path is read-only.');
        return;
      }

      const ingestion = await ingestFileTreeDataTransfer({
        items: dataTransfer.items,
        files: dataTransfer.files,
      });
      if (ingestion.type !== 'entries') {
        surfaceDropIngestionResult(ingestion);
        return;
      }

      if (ingestion.warnings.length > 0) {
        toast.warning('Some dropped items could not be read.', {
          description: ingestion.warnings.slice(0, 3).join('\n'),
        });
      }

      await processDroppedEntries(ingestion, targetDirectory);
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

  useEffect(() => {
    focusedItemRef.current = focusedItem;
  }, [focusedItem]);

  // Search is a permanent part of the Files toolbar.
  useEffect(() => {
    if (!tree.isSearchOpen()) {
      tree.setSearch('');
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- tree object is not stable; search opens once on mount
  }, []);

  // Sync active file with tree focus when the active editor file changes.
  // Do not re-run this on tree focus changes; users need to focus folders before
  // invoking toolbar actions such as "Create new file" or "Create new folder".
  useEffect(() => {
    if (!activeFilePath) {
      lastSyncedActiveFilePathRef.current = undefined;
      return;
    }

    if (activeFilePath === lastSyncedActiveFilePathRef.current) {
      return;
    }

    lastSyncedActiveFilePathRef.current = activeFilePath;
    if (focusedItemRef.current !== undefined) {
      return;
    }

    setFocusedItem(activeFilePath);
  }, [activeFilePath]);

  // Reveal a file in the tree when requested from the tab context menu.
  // Expands all parent directories, focuses the item, and scrolls it into view.
  useEffect(() => {
    const subscription = editorRef.on('fileRevealRequested', (event) => {
      if (shouldHandleReveal && !shouldHandleReveal()) {
        return;
      }
      const targetPath = event.path;

      // Ensure the file-explorer panel is open before revealing the item
      onRequestOpen?.();

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
  }, [editorRef, onRequestOpen, shouldHandleReveal, tree, setExpandedItems, setFocusedItem, setSelectedItems]);

  const handleCreateFile = useCallback(
    (template: KernelConfiguration | undefined) => {
      const content = template?.emptyCode ?? '';
      const extension = template ? getFileExtension(template.mainFile) : 'txt';

      // Determine parent path from the visible single selection first, then focused item.
      let parentPath = '';
      const selectedPath = selectedItems.length === 1 ? selectedItems[0] : undefined;
      const targetPath = selectedPath !== undefined && allPaths.has(selectedPath) ? selectedPath : focusedItem;
      if (targetPath !== undefined) {
        const targetItem = tree.getItemInstance(targetPath);
        if (targetItem.isFolder()) {
          // Target is a folder - create inside it
          parentPath = targetPath;
          // Expand the folder so user can see the pending input
          setExpandedItems((previous) => (previous.includes(targetPath) ? previous : [...previous, targetPath]));
        } else {
          // Target is a file - create in its parent folder
          const lastSlashIndex = targetPath.lastIndexOf('/');
          parentPath = lastSlashIndex > 0 ? targetPath.slice(0, lastSlashIndex) : '';
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
    [allPaths, focusedItem, selectedItems, tree],
  );

  const handleCreateFolder = useCallback(() => {
    // Determine parent path from the visible single selection first, then focused item.
    let parentPath = '';
    const selectedPath = selectedItems.length === 1 ? selectedItems[0] : undefined;
    const targetPath = selectedPath !== undefined && allPaths.has(selectedPath) ? selectedPath : focusedItem;
    if (targetPath !== undefined) {
      const targetItem = tree.getItemInstance(targetPath);
      if (targetItem.isFolder()) {
        // Target is a folder - create inside it
        parentPath = targetPath;
        // Expand the folder so user can see the pending input
        setExpandedItems((previous) => (previous.includes(targetPath) ? previous : [...previous, targetPath]));
      } else {
        // Target is a file - create in its parent folder
        const lastSlashIndex = targetPath.lastIndexOf('/');
        parentPath = lastSlashIndex > 0 ? targetPath.slice(0, lastSlashIndex) : '';
      }
    }

    setPendingFolder({ parentPath, error: undefined });
  }, [allPaths, focusedItem, selectedItems, tree]);

  const handleDelete = useCallback((items: Array<ItemInstance<TreeItemData>>) => {
    const candidatePaths = items.map((item) => item.getId()).filter((path) => path !== rootId);
    const paths = candidatePaths.filter((path) => !isBundledTypesWorkspacePath(path));
    if (paths.length === 0) {
      if (candidatePaths.length > 0) {
        toast.error('This path is read-only.');
      }
      return;
    }

    setItemsToDelete(paths);
    setDeleteDialogOpen(true);
  }, []);

  const runConfirmDelete = useCallback(async (): Promise<void> => {
    const deletedPaths = new Set<string>();

    for (const path of itemsToDelete) {
      if (path === rootId || isBundledTypesWorkspacePath(path)) {
        continue;
      }

      const entry = fileTreeMap.get(path);
      const isFolder = entry?.type === 'dir';

      try {
        // oxlint-disable-next-line no-await-in-loop -- Multi-select can include parent/child paths; ordered preflight keeps outcomes deterministic.
        const preflight = await canDelete(path);
        if (preflight !== true) {
          surfacePreflightError(preflight as WorkspaceMutationErrorLike);
          continue;
        }
        const deletion = isFolder ? deleteDirectory(path, { recursive: true }) : deleteFile(path, { source: 'user' });
        // oxlint-disable-next-line no-await-in-loop -- Continue through the ordered batch after per-item failures instead of collapsing into Promise.all.
        await deletion;
        deletedPaths.add(path);
        if (isFolder) {
          addDeletedDescendantPaths({ deletedPaths, fileTreeMap, path });
        }
      } catch (error) {
        toast.error(`Delete failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    setDeleteDialogOpen(false);
    setItemsToDelete([]);

    setSelectedItems((previous) => previous.filter((p) => !deletedPaths.has(p)));

    const firstRemainingItem = tree.getItems().find((i) => i.getId() !== rootId && !deletedPaths.has(i.getId()));
    setFocusedItem(firstRemainingItem?.getId());
  }, [canDelete, deleteDirectory, deleteFile, fileTreeMap, itemsToDelete, surfacePreflightError, tree]);

  const confirmDelete = useCallback(() => {
    void runConfirmDelete();
  }, [runConfirmDelete]);

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
            requestOpenFile(finalPath);
          },
          {
            loading: `Duplicating ${fileName}...`,
            success: `Created ${duplicateName}`,
            error: `Failed to duplicate ${fileName}`,
          },
        );
      }
    },
    [allPaths, duplicateFile, requestOpenFile],
  );

  const handleOpenInEditor = useCallback(
    (path: string) => {
      const readOnly = isBundledTypesWorkspacePath(path);
      requestOpenFile(path, readOnly);
    },
    [requestOpenFile],
  );

  const handleOpenInViewer = useCallback(
    (path: string) => {
      projectRef.send({ type: 'openInViewer', entryPath: path });
    },
    [projectRef],
  );

  const handleDownload = useCallback(
    (path: string, isFolder: boolean) => {
      const policy = getFileTreeDownloadPolicy(path);
      if (!policy.allowed) {
        toast.error(policy.message);
        return;
      }

      const name = path.split('/').pop() ?? path;

      if (isFolder) {
        toast.promise(
          async () => {
            let zipBlob: Blob;
            try {
              zipBlob = await getZippedDirectory(path);
            } catch (error) {
              throw createFileTreeDownloadError({ code: 'zip-generation-failed', path, cause: error });
            }
            try {
              downloadBlob(zipBlob, `${name}.zip`);
            } catch (error) {
              throw createFileTreeDownloadError({ code: 'browser-download-failed', path, cause: error });
            }
          },
          {
            loading: `Downloading ${name}...`,
            success: `Downloaded ${name}.zip`,
            error: getFileTreeDownloadErrorMessage,
          },
        );
      } else {
        toast.promise(
          async () => {
            let content: Awaited<ReturnType<typeof readFile>>;
            try {
              content = await readFile(path);
            } catch (error) {
              throw createFileTreeDownloadError({ code: 'path-not-found', path, cause: error });
            }
            const blob = new Blob([asBuffer(content.buffer)], {
              type: 'application/octet-stream',
            });
            try {
              downloadBlob(blob, name);
            } catch (error) {
              throw createFileTreeDownloadError({ code: 'browser-download-failed', path, cause: error });
            }
          },
          {
            loading: `Downloading ${name}...`,
            success: `Downloaded ${name}`,
            error: getFileTreeDownloadErrorMessage,
          },
        );
      }
    },
    [readFile, getZippedDirectory],
  );

  const handleCopyPath = useCallback(async (path: string): Promise<void> => {
    try {
      const result = await copyTextToClipboard(path);
      if (result.type === 'success') {
        toast.success(result.message);
        return;
      }

      toast.error(result.message, result.description ? { description: result.description } : undefined);
    } catch (error) {
      toast.error('Failed to copy path', { description: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  const handleUploadClick = useCallback((targetPath: string) => {
    if (isBundledTypesWorkspacePath(targetPath)) {
      toast.error('This path is read-only.');
      return;
    }
    setUploadTargetPath(targetPath);
    fileInputRef.current?.click();
  }, []);

  // Shared import processing logic for both drag-drop and upload button.
  const processDroppedEntries = useCallback(
    async (
      entries: { readonly files: readonly DroppedFile[]; readonly directories: readonly DroppedDirectory[] },
      targetDirectory: string,
    ) => {
      const directoryPaths = collectDropDirectoryPaths({
        targetDirectory,
        files: entries.files,
        directories: entries.directories,
      });
      const failures: string[] = [];
      let createdDirectoryCount = 0;

      for (const directoryPath of directoryPaths) {
        if (allPaths.has(directoryPath) && isPathFolder(directoryPath, fileTree, allPaths)) {
          continue;
        }

        try {
          // oxlint-disable-next-line no-await-in-loop -- Directory creation is ordered by depth so parents exist before children.
          const preflight = await canCreate(directoryPath, 'directory');
          if (preflight !== true) {
            failures.push(mutationErrorMessage(preflight as WorkspaceMutationErrorLike));
            continue;
          }

          // oxlint-disable-next-line no-await-in-loop -- Ordered directory creation preserves deterministic import state.
          await createDirectory(directoryPath, { recursive: true });
          createdDirectoryCount++;
        } catch (error) {
          failures.push(`${directoryPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const candidates = entries.files.map(({ file, relativePath }) => ({
        file,
        relativePath,
        filePath: joinFileTreePath(targetDirectory, relativePath),
      }));
      const collisions: string[] = [];
      const approved = new Set<string>();

      for (const candidate of candidates) {
        // oxlint-disable-next-line no-await-in-loop -- Preflights are sequential so one overwrite dialog covers deterministic path order.
        const preflight = await canCreate(candidate.filePath, 'file');
        if (preflight === true) {
          approved.add(candidate.filePath);
          continue;
        }
        if (isWorkspaceMutationErrorLike(preflight) && preflight.code === 'NAME_EXISTS') {
          collisions.push(candidate.filePath);
          continue;
        }
        failures.push(mutationErrorMessage(preflight as WorkspaceMutationErrorLike));
      }

      if (collisions.length > 0) {
        const decision = await requestOverwriteConfirm(collisions);
        if (decision.choice === 'overwrite') {
          for (const path of collisions) {
            approved.add(path);
          }
        }
      }

      let uploadedCount = 0;
      for (const candidate of candidates) {
        if (!approved.has(candidate.filePath)) {
          continue;
        }
        try {
          // oxlint-disable-next-line no-await-in-loop -- Files need to be read sequentially
          const arrayBuffer = await candidate.file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);

          // oxlint-disable-next-line no-await-in-loop -- Files need to be written sequentially
          await writeFile(candidate.filePath, uint8Array, { source: 'user' });

          requestOpenFile(candidate.filePath);
          uploadedCount++;
        } catch (error) {
          failures.push(`${candidate.relativePath}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const summary = summarizeFileTreeImport({
        uploadedFiles: uploadedCount,
        createdDirectories: createdDirectoryCount,
        failures,
      });
      if (summary.success) {
        toast.success(summary.success.message);
      }
      if (summary.failure) {
        toast.error(summary.failure.message, { description: summary.failure.description });
      }
    },
    [
      allPaths,
      canCreate,
      createDirectory,
      fileTree,
      mutationErrorMessage,
      requestOpenFile,
      requestOverwriteConfirm,
      writeFile,
    ],
  );

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const { files } = event.target;
      if (!files || files.length === 0) {
        return;
      }

      const directory = resolveFileTreeTargetDirectory({
        targetPath: uploadTargetPath,
        getTargetData(path) {
          try {
            const item = tree.getItemInstance(path);
            return { isFolder: item.isFolder() };
          } catch {
            return undefined;
          }
        },
      });

      // Convert FileList to the new format (flat files have relativePath = filename)
      const filesWithPaths: DroppedFile[] = [...files].map((file) => ({
        kind: 'file',
        file,
        relativePath: file.webkitRelativePath || file.name,
      }));
      await processDroppedEntries({ files: filesWithPaths, directories: [] }, directory);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      setUploadTargetPath(undefined);
    },
    [uploadTargetPath, tree, processDroppedEntries],
  );

  const handleForeignDrop = useCallback(
    async ({ path, isFolder, dataTransfer }: ForeignDropTarget): Promise<void> => {
      const targetDirectory = resolveFileTreeTargetDirectory({
        targetPath: path,
        getTargetData: (targetPath) => (targetPath === path ? { isFolder } : undefined),
      });
      if (isBundledTypesWorkspacePath(path) || isBundledTypesWorkspacePath(targetDirectory)) {
        toast.error('This path is read-only.');
        return;
      }

      const ingestion = await ingestFileTreeDataTransfer({
        items: dataTransfer.items,
        files: dataTransfer.files,
      });
      if (ingestion.type !== 'entries') {
        surfaceDropIngestionResult(ingestion);
        return;
      }

      if (ingestion.warnings.length > 0) {
        toast.warning('Some dropped items could not be read.', {
          description: ingestion.warnings.slice(0, 3).join('\n'),
        });
      }

      await processDroppedEntries(ingestion, targetDirectory);
    },
    [processDroppedEntries],
  );

  const setTreeContainerElement: React.RefCallback<HTMLDivElement> = useCallback(
    (element) => {
      treeContainerRef.current = element;
      tree.registerElement(element);
    },
    [tree],
  );

  useEffect(() => {
    const container = treeContainerRef.current;
    if (!container) {
      return;
    }

    const getTargetDirectory = (target: Omit<ForeignDropTarget, 'dataTransfer'>): string =>
      resolveFileTreeTargetDirectory({
        targetPath: target.path,
        getTargetData: (path) => (path === target.path ? { isFolder: target.isFolder } : undefined),
      });

    const handleDragEnterOrOver = (event: DragEvent): void => {
      const { dataTransfer } = event;
      if (!dataTransfer || !canReadForeignFileTreeDrop(dataTransfer)) {
        return;
      }

      const target = getForeignDropTargetFromEvent(event);
      const targetDirectory = getTargetDirectory(target);
      event.preventDefault();
      event.stopPropagation();
      dataTransfer.dropEffect =
        isBundledTypesWorkspacePath(target.path) || isBundledTypesWorkspacePath(targetDirectory) ? 'none' : 'copy';
    };

    const handleDrop = (event: DragEvent): void => {
      const { dataTransfer } = event;
      if (!dataTransfer || !canReadForeignFileTreeDrop(dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void handleForeignDrop({ ...getForeignDropTargetFromEvent(event), dataTransfer });
    };

    container.addEventListener('dragenter', handleDragEnterOrOver, true);
    container.addEventListener('dragover', handleDragEnterOrOver, true);
    container.addEventListener('drop', handleDrop, true);
    return () => {
      container.removeEventListener('dragenter', handleDragEnterOrOver, true);
      container.removeEventListener('dragover', handleDragEnterOrOver, true);
      container.removeEventListener('drop', handleDrop, true);
    };
  }, [handleForeignDrop]);

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

  const fileActions = (
    <FloatingPanelButtonGroup className='shrink-0'>
      {readOnly ? null : (
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
      )}
      {readOnly ? null : (
        <FloatingPanelMenuButton
          aria-label='Create new folder'
          tooltip='Create new folder'
          onClick={handleCreateFolder}
        >
          <FolderPlus className='mt-0.5 size-4' />
        </FloatingPanelMenuButton>
      )}
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
  );

  return (
    <>
      {actionsContainer ? createPortal(fileActions, actionsContainer) : null}
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

      <FloatingPanelContent className={cn(borderless && 'bg-background')}>
        {showTitle || closeButton ? (
          <FloatingPanelContentHeader className={cn(borderless && 'border-0 bg-transparent px-2')}>
            {showTitle ? <FloatingPanelContentTitle>Files</FloatingPanelContentTitle> : <span />}
            <FloatingPanelContentHeaderActions className={cn(borderless && 'ml-auto pl-0')}>
              {actionsContainer ? null : fileActions}
              {closeButton}
            </FloatingPanelContentHeaderActions>
          </FloatingPanelContentHeader>
        ) : null}
        <FloatingPanelContentBody className='group/filetree flex min-h-0 flex-col'>
          <div
            className={cn(
              'flex w-full shrink-0 items-center gap-1 border-b bg-sidebar p-2',
              borderless && 'border-0 bg-transparent',
            )}
          >
            <SearchInput
              {...tree.getSearchInputElementProps()}
              placeholder='Filter files...'
              className='h-7 min-w-0 flex-1 bg-background'
              onBlur={undefined}
              onClear={() => {
                tree.setSearch('');
              }}
            />
          </div>

          {tree.getItems().length > 0 || pendingFolder !== undefined || pendingFile !== undefined ? (
            <div
              data-tree-container
              {...tree.getContainerProps()}
              ref={setTreeContainerElement}
              className={cn(
                'flex min-h-full flex-1 flex-col gap-0 outline-none',
                borderless && 'gap-0.5 px-1.5 pb-1.5',
              )}
            >
              <AssistiveTreeDescription tree={tree} getLabel={getFileTreeAssistiveDndLabel} />
              {/* Pending folder at root level */}
              {pendingFolder?.parentPath === '' ? (
                <PendingFolderInput
                  parentPath=''
                  error={pendingFolder.error}
                  allPaths={allPaths}
                  level={0}
                  onSubmit={(name) => {
                    void submitCreateFolder('', name);
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
                    void submitCreateFile('', filename, pendingFile.content);
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
                              onForeignDrop={handleForeignDrop}
                            />
                            {/* Pending folder inside this folder */}
                            {pendingFolder?.parentPath === itemId && item.isFolder() ? (
                              <PendingFolderInput
                                parentPath={pendingFolder.parentPath}
                                error={pendingFolder.error}
                                allPaths={allPaths}
                                level={itemLevel + 1}
                                onSubmit={(name) => {
                                  void submitCreateFolder(pendingFolder.parentPath, name);
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
                                  void submitCreateFile(pendingFile.parentPath, filename, pendingFile.content);
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
  readonly onCopyPath: (path: string) => Promise<void>;
  readonly onForeignDrop: (target: ForeignDropTarget) => Promise<void>;
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
  onForeignDrop,
}: TreeItemProps): React.JSX.Element {
  const itemLevel = item.getItemMeta().level;
  const paddingLeft = itemLevel * 16 + 8;
  const isSelected = item.isSelected();
  const isRenaming = item.isRenaming();
  const isFolder = item.isFolder();
  const readOnly = isBundledTypesWorkspacePath(item.getId());
  const downloadPolicy = getFileTreeDownloadPolicy(item.getId());

  // Rename input - NOT wrapped by ContextMenu to avoid focus interference
  if (isRenaming) {
    const renameInputProps = item.getRenameInputProps() as React.InputHTMLAttributes<HTMLInputElement>;
    return (
      <div
        className='relative flex h-7 items-center border border-input py-1 pr-1 pl-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-inset'
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
                'pointer-events-none absolute -top-0.5 -bottom-0.5 w-px',
                isActiveGuide ? 'bg-border' : 'bg-border opacity-0 transition-opacity group-hover/filetree:opacity-100',
              )}
              style={{ left: `${guideDepth * 16}px` }}
            />
          );
        })}
        <div className='flex min-w-0 flex-1 items-center gap-2'>
          {isFolder ? (
            item.isExpanded() ? (
              <FolderOpen className='size-3.5 shrink-0 text-muted-foreground' />
            ) : (
              <Folder className='size-3.5 shrink-0 text-muted-foreground' />
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
  const treeDragOver = (treeItemProps as { readonly onDragOver?: (event: DragEvent) => void }).onDragOver;
  const treeDrop = (treeItemProps as { readonly onDrop?: (event: DragEvent) => void }).onDrop;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          {...treeItemProps}
          data-testid='file-tree-item'
          data-file-tree-path={item.getId()}
          data-file-tree-kind={isFolder ? 'directory' : 'file'}
          className={cn(
            'group/file relative flex h-7 w-full cursor-pointer items-center justify-between rounded-md py-1 pr-1 pl-2 text-sm text-sidebar-foreground transition-colors',
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
          onDragOver={(event) => {
            if (canReadForeignFileTreeDrop(event.dataTransfer)) {
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = readOnly ? 'none' : 'copy';
              return;
            }

            treeDragOver?.(event.nativeEvent);
          }}
          onDrop={(event) => {
            if (canReadForeignFileTreeDrop(event.dataTransfer)) {
              event.preventDefault();
              event.stopPropagation();
              void onForeignDrop({
                path: item.getId(),
                isFolder,
                dataTransfer: event.dataTransfer,
              });
              return;
            }

            treeDrop?.(event.nativeEvent);
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
                  'pointer-events-none absolute -top-0.5 -bottom-0.5 w-px',
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
                <FolderOpen className='size-3.5 shrink-0 text-muted-foreground' />
              ) : (
                <Folder className='size-3.5 shrink-0 text-muted-foreground' />
              )
            ) : (
              <FileExtensionIcon filename={item.getItemName()} className='size-3.5 shrink-0 text-muted-foreground' />
            )}
            <span className={cn('truncate', isOpen && 'font-medium', isActive && 'text-sidebar-accent-foreground')}>
              <HighlightText text={item.getItemName()} searchTerm={searchQuery} />
            </span>
          </div>
          {isFolder ? null : (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon'
                  aria-label={`Actions for ${item.getItemName()}`}
                  className='absolute top-1/2 right-1 size-4.5 -translate-y-1/2 rounded-[5px] bg-transparent p-0 text-muted-foreground opacity-0 group-hover/file:opacity-100 hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground data-[state=open]:opacity-100'
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
                {readOnly ? (
                  <DropdownMenuItem disabled>
                    <Lock />
                    <span>Read-only</span>
                  </DropdownMenuItem>
                ) : (
                  <>
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
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    void onCopyPath(item.getId());
                  }}
                >
                  <Clipboard />
                  <span>Copy Path</span>
                </DropdownMenuItem>
                {downloadPolicy.allowed ? (
                  <DropdownMenuItem
                    onClick={(event) => {
                      event.stopPropagation();
                      onDownload(item.getId(), false);
                    }}
                  >
                    <Download />
                    <span>Download</span>
                  </DropdownMenuItem>
                ) : null}
                {readOnly ? null : (
                  <>
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
                  </>
                )}
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
        {readOnly ? (
          <>
            <ContextMenuItem disabled>
              <Lock />
              <span>Read-only</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : (
          <>
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
          </>
        )}
        <ContextMenuItem
          onClick={() => {
            void onCopyPath(item.getId());
          }}
        >
          <Clipboard />
          <span>Copy Path</span>
        </ContextMenuItem>
        {downloadPolicy.allowed ? (
          <ContextMenuItem
            onClick={() => {
              onDownload(item.getId(), isFolder);
            }}
          >
            <Download />
            <span>{isFolder ? 'Download as ZIP' : 'Download'}</span>
          </ContextMenuItem>
        ) : null}
        {readOnly ? null : (
          <>
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
          </>
        )}
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
        className='flex h-7 w-full items-center border border-input py-1 pr-1 focus-within:ring-2 focus-within:ring-ring focus-within:ring-inset'
        style={{ paddingLeft: `${paddingLeft}px` }}
      >
        <div className='flex min-w-0 flex-1 items-center gap-2'>
          <Folder className='size-3.5 shrink-0 text-muted-foreground' />
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
        className='flex h-7 w-full items-center border border-input py-1 pr-1 focus-within:ring-2 focus-within:ring-ring focus-within:ring-inset'
        style={{ paddingLeft: `${paddingLeft}px` }}
      >
        <div className='flex min-w-0 flex-1 items-center gap-2'>
          <FileExtensionIcon
            filename={`file.${currentExtension}`}
            className='size-3.5 shrink-0 text-muted-foreground'
          />
          <input
            ref={inputRef}
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
