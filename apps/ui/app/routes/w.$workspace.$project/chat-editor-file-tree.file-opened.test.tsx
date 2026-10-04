// @vitest-environment jsdom
/**
 * Opening a file from the editor warms its content outcome in the Files tree.
 *
 * The editor emits `fileOpened` as soon as a tab exists, which can be before a
 * new project's main file is written or after the file is removed. The warm-up
 * must go through the content service's typed outcome (`orphaned`, `binary`,
 * `error`) rather than a throwing read, or that file becomes an unhandled
 * promise rejection reported as a production error.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { FileEntry } from '@taucad/types';
import { FileNotFoundError } from '@taucad/fs-client/file-content-errors';
import { FileTreePanelBody } from '#routes/w.$workspace.$project/chat-file-tree.js';

type FileOpenedHandler = (event: { path: string }) => void;

const tree = vi.hoisted(() => ({ current: new Map<string, FileEntry>() }));

const editor = vi.hoisted(() => ({ fileOpened: undefined as FileOpenedHandler | undefined }));

const fileManager = vi.hoisted(() => ({
  resolve: vi.fn(async (): Promise<{ kind: 'orphaned' }> => ({ kind: 'orphaned' })),
  readFile: vi.fn(),
}));

const actorStub = vi.hoisted(() => {
  const snapshot = {
    context: { project: { id: 'project-1' }, openFiles: [] as unknown[], activePaneId: undefined },
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: () => ({ unsubscribe: () => undefined }),
    on: () => ({ unsubscribe: () => undefined }),
  };
});

vi.mock('#hooks/use-file-tree.js', () => ({
  useFileTreeMap: () => tree.current,
  useFileTreeSelector: <T,>(select: (snapshot: typeof tree.current) => T): T => select(tree.current),
  useFileTreeEntry: () => undefined,
}));
vi.mock('#hooks/use-keyboard.js', () => ({
  useKeybinding: () => ({ formattedKeyCombination: 'Enter' }),
}));
vi.mock('#hooks/use-revision-status.js', () => ({ useRevisionStatus: () => undefined }));
vi.mock('#filesystem/file-operation-participants.js', () => ({
  mountFileOperationParticipants: () => () => undefined,
}));
vi.mock('#workbench-records/view-actions.js', () => ({
  useWorkbenchViewCommands: () => ({
    edit: async () => true,
    remove: async () => true,
  }),
}));
vi.mock('#hooks/use-project.js', () => {
  const project = {
    projectRef: actorStub,
    editorRef: {
      ...actorStub,
      send: vi.fn(),
      on(type: string, handler: FileOpenedHandler) {
        if (type === 'fileOpened') {
          editor.fileOpened = handler;
        }
        return { unsubscribe: () => undefined };
      },
    },
    viewRecords: new Map(),
    changeEntryPaths: async () => true,
  };
  return { useProject: () => project };
});
vi.mock('#hooks/use-file-manager.js', () => {
  const value = {
    client: { overrideUnit: vi.fn() },
    contentService: { resolve: fileManager.resolve },
    treeService: undefined,
    runtimeFileSystem: undefined,
    readFile: fileManager.readFile,
    writeFile: vi.fn(),
    renameFile: vi.fn(),
    duplicateFile: vi.fn(),
    deleteFile: vi.fn(),
    getZippedDirectory: vi.fn(),
    createDirectory: vi.fn(),
    deleteDirectory: vi.fn(),
    bulkMove: vi.fn(),
    canMove: vi.fn(),
    canRename: vi.fn(),
    canCreate: vi.fn(),
    canDelete: vi.fn(),
  };
  return { useFileManager: () => value, useOptionalFileManager: () => value };
});

beforeEach(() => {
  editor.fileOpened = undefined;
  fileManager.resolve.mockClear();
  fileManager.readFile.mockReset();
  fileManager.readFile.mockRejectedValue(new FileNotFoundError("File 'main.ts' was not found", { path: 'main.ts' }));
});

describe('the Files tree when the editor opens a file', () => {
  it('warms the typed content outcome instead of issuing a throwing read', () => {
    render(
      <TooltipProvider>
        <FileTreePanelBody />
      </TooltipProvider>,
    );

    expect(editor.fileOpened).toBeDefined();
    editor.fileOpened?.({ path: 'main.ts' });

    expect(fileManager.resolve).toHaveBeenCalledWith('main.ts');
    expect(fileManager.readFile).not.toHaveBeenCalled();
  });
});
