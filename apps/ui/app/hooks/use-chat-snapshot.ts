import { useEffect, useMemo, useState } from 'react';
import { useSelector } from '@xstate/react';
import type { ChatSnapshot } from '@taucad/chat';
import type { FileTreeEntry } from '@taucad/types';
import { useProject } from '#hooks/use-project.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';

/**
 * Hook to get the current chat snapshot for message context.
 * This provides the LLM with awareness of what the user is currently working on.
 *
 * The snapshot includes:
 * - fileTree: Cached/partial project file tree via `getCachedFileItems()` (memoized, invalidated on tree change)
 * - activeFile: The file currently being rendered by the CAD engine
 * - openFiles: The files currently open in editor tabs
 *
 * Each component can be toggled via user preferences (cookies).
 *
 * @returns ChatSnapshot object or undefined if no context is enabled/available
 */
export function useChatSnapshot(): ChatSnapshot | undefined {
  const projectContext = useProject({ enableNoContext: true });
  const editorRef = projectContext?.editorRef;
  const { treeService } = useFileManager();

  const [fileTree, setFileTree] = useState<FileTreeEntry[] | undefined>();

  useEffect(() => {
    if (!treeService) {
      return;
    }

    const sync = (): void => {
      const items = treeService.getCachedFileItems();
      setFileTree(
        items.map((item): FileTreeEntry => {
          const name = item.path.split('/').pop() ?? item.path;
          return item.contentKind === 'text'
            ? {
                path: item.path,
                name,
                type: 'file',
                size: item.size,
                contentKind: 'text',
                lineCount: item.lineCount,
              }
            : {
                path: item.path,
                name,
                type: 'file',
                size: item.size,
                contentKind: 'binary',
              };
        }),
      );
    };

    sync();
    const unsubscribe = treeService.subscribeTree(sync);

    return unsubscribe;
  }, [treeService]);

  const editorState = useSelector(
    editorRef,
    (state) => {
      if (!state) {
        return { activeFilePath: undefined, openFiles: [] };
      }

      const active = state.context.openFiles.find((f) => f.paneId === state.context.activePaneId);
      return {
        activeFilePath: active?.path,
        openFiles: state.context.openFiles,
      };
    },
    (previous, next) =>
      previous.activeFilePath === next.activeFilePath &&
      previous.openFiles.length === next.openFiles.length &&
      previous.openFiles.every((file, index) => file.path === next.openFiles[index]?.path),
  );

  const [includeFileSystem] = useCookie(cookieName.chatCtxFs, true);
  const [includeActiveFile] = useCookie(cookieName.chatCtxActive, true);
  const [includeOpenFiles] = useCookie(cookieName.chatCtxOpen, true);

  return useMemo((): ChatSnapshot | undefined => {
    const snapshot: ChatSnapshot = {};
    const fileByPath = new Map((fileTree ?? []).map((entry): [string, FileTreeEntry] => [entry.path, entry]));
    const enrichFileReference = (path: string, fallbackName: string): NonNullable<ChatSnapshot['activeFile']> => {
      const entry = fileByPath.get(path);
      if (entry?.type !== 'file') {
        return { path, name: fallbackName };
      }
      return entry.contentKind === 'text'
        ? {
            path,
            name: fallbackName,
            size: entry.size,
            contentKind: 'text',
            lineCount: entry.lineCount,
          }
        : {
            path,
            name: fallbackName,
            size: entry.size,
            contentKind: 'binary',
          };
    };

    if (includeFileSystem && fileTree) {
      snapshot.fileTree = fileTree;
    }

    if (includeActiveFile && editorState.activeFilePath) {
      snapshot.activeFile = enrichFileReference(
        editorState.activeFilePath,
        editorState.activeFilePath.split('/').pop() ?? editorState.activeFilePath,
      );
    }

    if (includeOpenFiles && editorState.openFiles.length > 0) {
      snapshot.openFiles = editorState.openFiles.map((file) => enrichFileReference(file.path, file.name));
    }

    if (Object.keys(snapshot).length === 0) {
      return undefined;
    }

    return snapshot;
  }, [
    includeFileSystem,
    fileTree,
    includeActiveFile,
    editorState.activeFilePath,
    includeOpenFiles,
    editorState.openFiles,
  ]);
}
