import { assertEvent, setup, enqueueActions } from 'xstate';
import type { FileStatus } from '@taucad/types';

export type FileItem = {
  id: string;
  name: string;
  path: string;
  content: Uint8Array;
  language?: string;
  isDirectory?: boolean;
  children?: FileItem[];
  gitStatus?: FileStatus;
};

export type OpenFile = {
  path: string;
  name: string;
};

// Interface defining the context for the file explorer machine
type FileExplorerContext = {
  openFiles: OpenFile[];
  activeFilePath: string | undefined;
};

// Define the types of events the machine can receive
type FileExplorerEvent =
  | { type: 'openFile'; path: string }
  | { type: 'closeFile'; path: string }
  | { type: 'setActiveFile'; path: string | undefined }
  | { type: 'closeAll' };

type FileExplorerEmitted = { type: 'fileOpened'; path: string };

/**
 * File Explorer Machine
 *
 * This machine manages the state of the file explorer:
 * - Handles opening and closing files
 * - Tracks active file
 * - Pure UI state management (no parent coordination)
 */
export const fileExplorerMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as FileExplorerContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as FileExplorerEvent,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as FileExplorerEmitted,
  },
  actions: {
    openFile: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'openFile');

      const existingFile = context.openFiles.find((f) => f.path === event.path);
      if (existingFile) {
        // File already open, just set as active
        enqueue.assign({
          activeFilePath: event.path,
        });
        enqueue.emit({
          type: 'fileOpened' as const,
          path: event.path,
        });
        return;
      }

      // Open new file
      const newFile: OpenFile = {
        path: event.path,
        name: event.path.split('/').pop() ?? event.path,
      };

      enqueue.assign({
        openFiles: [...context.openFiles, newFile],
        activeFilePath: newFile.path,
      });

      enqueue.emit({
        type: 'fileOpened' as const,
        path: event.path,
      });
    }),

    closeFile: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'closeFile');

      const updatedOpenFiles = context.openFiles.filter((file) => file.path !== event.path);
      let newActiveFilePath = context.activeFilePath;

      // If closing the active file, set new active file
      if (context.activeFilePath === event.path) {
        newActiveFilePath = updatedOpenFiles.at(-1)?.path;

        // Emit fileOpened for the new active file (if any)
        if (newActiveFilePath) {
          enqueue.emit({
            type: 'fileOpened' as const,
            path: newActiveFilePath,
          });
        }
      }

      enqueue.assign({
        openFiles: updatedOpenFiles,
        activeFilePath: newActiveFilePath,
      });
    }),

    setActiveFile: enqueueActions(({ enqueue, event }) => {
      assertEvent(event, 'setActiveFile');

      enqueue.assign({
        activeFilePath: event.path,
      });

      // Emit fileOpened for the new active file
      if (event.path) {
        enqueue.emit({
          type: 'fileOpened' as const,
          path: event.path,
        });
      }
    }),

    closeAll: enqueueActions(({ enqueue }) => {
      enqueue.assign({
        openFiles: [],
        activeFilePath: undefined,
      });
    }),
  },
}).createMachine({
  id: 'fileExplorer',
  context: {
    openFiles: [],
    activeFilePath: undefined,
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
        closeAll: {
          actions: 'closeAll',
        },
      },
    },
  },
});

export type { FileExplorerEmitted };
