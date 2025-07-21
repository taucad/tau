import { assertEvent, setup, enqueueActions } from 'xstate';

// Helper function to find a file by path in the tree
function findFileByPath(tree: FileItem[], path: string): FileItem | undefined {
  for (const item of tree) {
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

export type FileItem = {
  id: string;
  name: string;
  path: string;
  content: string;
  language?: string;
  isDirectory?: boolean;
  children?: FileItem[];
};

export type OpenFile = {
  id: string;
  name: string;
  path: string;
  content: string;
  language?: string;
  isDirty?: boolean;
};

// Interface defining the context for the file explorer machine
type FileExplorerContext = {
  openFiles: OpenFile[];
  activeFileId: string | undefined;
  fileTree: FileItem[];
};

// Define the types of events the machine can receive
type FileExplorerEvent =
  | { type: 'openFile'; path: string }
  | { type: 'closeFile'; fileId: string }
  | { type: 'setActiveFile'; fileId: string | undefined }
  | { type: 'updateFileContent'; fileId: string; content: string }
  | { type: 'setFileTree'; tree: FileItem[]; openFiles: string[] };

type FileExplorerEmitted =
  | { type: 'fileOpened'; file: OpenFile }
  | { type: 'fileClosed'; fileId: string }
  | { type: 'activeFileChanged'; fileId: string | undefined }
  | { type: 'fileContentUpdated'; fileId: string; content: string; isDirty: boolean }
  | { type: 'fileTreeUpdated'; tree: FileItem[] };

type FileExplorerInput = Record<string, never>;

/**
 * File Explorer Machine
 *
 * This machine manages the state of the file explorer:
 * - Handles opening and closing files
 * - Tracks active file
 * - Manages file content updates
 * - Maintains file tree structure
 */
export const fileExplorerMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as FileExplorerContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as FileExplorerEvent,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as FileExplorerInput,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as FileExplorerEmitted,
  },
  actions: {
    openFile: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'openFile');

      // Find the file in the tree by path
      const file = findFileByPath(context.fileTree, event.path);
      if (!file) {
        return;
      }

      // Don't open directories
      if (file.isDirectory) {
        return;
      }

      const existingFile = context.openFiles.find((f) => f.id === file.id);
      if (existingFile) {
        // File already open, just set as active
        enqueue.assign({
          activeFileId: file.id,
        });
        enqueue.emit({
          type: 'activeFileChanged' as const,
          fileId: file.id,
        });
        return;
      }

      // Open new file
      const newFile: OpenFile = {
        id: file.id,
        name: file.name,
        path: file.path,
        content: file.content,
        language: file.language,
        isDirty: false,
      };

      enqueue.assign({
        openFiles: [...context.openFiles, newFile],
        activeFileId: file.id,
      });

      enqueue.emit({
        type: 'fileOpened' as const,
        file: newFile,
      });

      enqueue.emit({
        type: 'activeFileChanged' as const,
        fileId: file.id,
      });
    }),

    closeFile: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'closeFile');

      const updatedOpenFiles = context.openFiles.filter((file) => file.id !== event.fileId);
      let newActiveFileId = context.activeFileId;

      // If closing the active file, set new active file
      if (context.activeFileId === event.fileId) {
        newActiveFileId = updatedOpenFiles.at(-1)?.id;
      }

      enqueue.assign({
        openFiles: updatedOpenFiles,
        activeFileId: newActiveFileId,
      });

      enqueue.emit({
        type: 'fileClosed' as const,
        fileId: event.fileId,
      });

      if (context.activeFileId === event.fileId) {
        enqueue.emit({
          type: 'activeFileChanged' as const,
          fileId: newActiveFileId,
        });
      }
    }),

    setActiveFile: enqueueActions(({ enqueue, event }) => {
      assertEvent(event, 'setActiveFile');

      enqueue.assign({
        activeFileId: event.fileId,
      });

      enqueue.emit({
        type: 'activeFileChanged' as const,
        fileId: event.fileId,
      });
    }),

    updateFileContent: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'updateFileContent');

      const updatedOpenFiles = context.openFiles.map((file) => {
        if (file.id === event.fileId) {
          const originalContent = context.openFiles.find((f) => f.id === event.fileId)?.content ?? '';
          const isDirty = originalContent !== event.content;

          return { ...file, content: event.content, isDirty };
        }

        return file;
      });

      enqueue.assign({
        openFiles: updatedOpenFiles,
      });

      const updatedFile = updatedOpenFiles.find((f) => f.id === event.fileId);
      if (updatedFile) {
        enqueue.emit({
          type: 'fileContentUpdated' as const,
          fileId: event.fileId,
          content: event.content,
          isDirty: updatedFile.isDirty ?? false,
        });
      }
    }),

    setFileTree: enqueueActions(({ enqueue, event }) => {
      assertEvent(event, 'setFileTree');

      enqueue.assign({
        fileTree: event.tree,
        openFiles: [],
        activeFileId: undefined,
      });

      enqueue.emit({
        type: 'fileTreeUpdated' as const,
        tree: event.tree,
      });

      // Open specified files
      for (const filePath of event.openFiles) {
        const file = findFileByPath(event.tree, filePath);
        if (file && !file.isDirectory) {
          const newFile: OpenFile = {
            id: file.id,
            name: file.name,
            path: file.path,
            content: file.content,
            language: file.language,
            isDirty: false,
          };

          enqueue.assign({
            openFiles: ({ context }) => [...context.openFiles, newFile],
            activeFileId: file.id, // Last file becomes active
          });

          enqueue.emit({
            type: 'fileOpened' as const,
            file: newFile,
          });

          enqueue.emit({
            type: 'activeFileChanged' as const,
            fileId: file.id,
          });
        }
      }
    }),
  },
}).createMachine({
  id: 'fileExplorer',
  context: {
    openFiles: [],
    activeFileId: undefined,
    fileTree: [],
  },
  initial: 'idle',
  states: {
    idle: {
      on: {
        openFile: {
          actions: 'openFile',
        },
        closeFile: {
          actions: 'closeFile',
        },
        setActiveFile: {
          actions: 'setActiveFile',
        },
        updateFileContent: {
          actions: 'updateFileContent',
        },
        setFileTree: {
          actions: 'setFileTree',
        },
      },
    },
  },
});
