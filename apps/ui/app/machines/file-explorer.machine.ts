import { assertEvent, setup, enqueueActions, fromCallback } from 'xstate';
import type { AnyActorRef } from 'xstate';
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
  parentRef: AnyActorRef;
  openFiles: OpenFile[];
  activeFilePath: string | undefined;
};

type FileExplorerInput = {
  parentRef: AnyActorRef;
};

// Define the types of events the machine can receive
type FileExplorerEvent =
  | { type: 'openFile'; path: string }
  | { type: 'closeFile'; path: string }
  | { type: 'setActiveFile'; path: string | undefined }
  | { type: 'fileCreated'; path: string; content: Uint8Array };

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
  },
  actors: {
    buildListener: fromCallback<{ type: 'fileCreated'; path: string; content: Uint8Array }, FileExplorerInput>(
      ({ input, sendBack }) => {
        const { parentRef } = input;

        const fileCreatedSub = parentRef.on('fileCreated', (event: { path: string; content: Uint8Array }) => {
          sendBack({ type: 'fileCreated', path: event.path, content: event.content });
        });

        return () => {
          fileCreatedSub.unsubscribe();
        };
      },
    ),
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
        // Send to parent to trigger side effects (CAD update, etc)
        enqueue.sendTo(context.parentRef, {
          type: 'fileOpened',
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

      // Send to parent to trigger side effects (CAD update, etc)
      enqueue.sendTo(context.parentRef, {
        type: 'fileOpened',
        path: event.path,
      });
    }),

    handleFileCreated: enqueueActions(({ enqueue, event }) => {
      assertEvent(event, 'fileCreated');

      // Auto-open the newly created file by raising an event to self
      enqueue.raise({
        type: 'openFile',
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

        // Send fileOpened to parent for the new active file (if any)
        if (newActiveFilePath) {
          enqueue.sendTo(context.parentRef, {
            type: 'fileOpened',
            path: newActiveFilePath,
          });
        }
      }

      enqueue.assign({
        openFiles: updatedOpenFiles,
        activeFilePath: newActiveFilePath,
      });
    }),

    setActiveFile: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'setActiveFile');

      enqueue.assign({
        activeFilePath: event.path,
      });

      // Send to parent to trigger side effects (CAD update, etc)
      if (event.path) {
        enqueue.sendTo(context.parentRef, {
          type: 'fileOpened',
          path: event.path,
        });
      }
    }),
  },
}).createMachine({
  id: 'fileExplorer',
  context({ input }) {
    return {
      parentRef: input.parentRef,
      openFiles: [],
      activeFilePath: undefined,
    };
  },
  initial: 'idle',
  invoke: {
    id: 'buildListener',
    src: 'buildListener',
    input: ({ context }) => ({ parentRef: context.parentRef }),
  },
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
        fileCreated: {
          actions: 'handleFileCreated',
        },
      },
    },
  },
});
