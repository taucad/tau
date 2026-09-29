import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useSelector } from '@xstate/react';
import type { ChatSnapshot } from '@taucad/chat';
import type { WorkbenchEntries, WorkbenchNode, WorkbenchTab, WorkbenchView } from '@taucad/workbench';
import type { FileEntry } from '@taucad/types';
import { useProject } from '#hooks/use-project.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import type { WorkbenchLayoutSnapshot } from '#routes/w.$workspace.$project/workbench-layout-controller.js';
import { viewName } from '#workbench-records/projection.js';
import { useFeature } from '#flags/use-feature.js';

const emptyLayoutSnapshot = (): undefined => undefined;
const emptyLayoutSubscribe = (): (() => void) => () => undefined;

const activeTabs = (node: WorkbenchNode): WorkbenchTab[] =>
  node.kind === 'group'
    ? node.tabs.length === 0
      ? []
      : [node.tabs[node.active ?? node.tabs.length - 1]!]
    : node.children.flatMap(activeTabs);

/** Portable, bounded facts from the page's applied record state. */
export const projectWorkbenchSnapshot = ({
  current,
  viewRecords,
  entriesRecord,
  isTauDebugEnabled,
}: Readonly<{
  current: WorkbenchLayoutSnapshot | undefined;
  viewRecords: ReadonlyMap<string, WorkbenchView> | undefined;
  entriesRecord: WorkbenchEntries | undefined;
  isTauDebugEnabled: boolean;
}>): ChatSnapshot['workbench'] => {
  if (!current) {
    return undefined;
  }
  const { layout, refused, layoutDigest } = current;
  const views = [...(viewRecords ?? new Map<string, WorkbenchView>())].slice(0, 16).map(([id, view]) => ({
    id,
    name: viewName(view),
    entryPath: view.entryPath,
    camera: view.camera.kind === 'preset' ? view.camera.preset : view.camera.kind,
  }));
  const entries = Object.entries(entriesRecord?.entries ?? {})
    .slice(0, 16)
    .map(([path, settings]) => ({
      path,
      ...(settings.renderTimeout === undefined ? {} : { renderTimeout: settings.renderTimeout }),
      hidden: settings.components?.hidden.length ?? 0,
    }));
  const visible = [...activeTabs(layout.viewer), ...(layout.lanes.workbench ? activeTabs(layout.workbench) : [])].slice(
    0,
    32,
  );
  const boundedRefused = refused.slice(0, 16);
  const unavailable: NonNullable<ChatSnapshot['workbench']>['unavailable'] = isTauDebugEnabled
    ? []
    : ['kernel', 'console'];
  return { layoutDigest, lanes: layout.lanes, visible, views, entries, unavailable, refused: boundedRefused };
};

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
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- chat can mount without the project workspace provider.
  const layoutController = useProjectWorkspace({ enableNoContext: true })?.layoutController;
  const layoutSnapshot = useSyncExternalStore(
    layoutController?.subscribe ?? emptyLayoutSubscribe,
    layoutController?.snapshot ?? emptyLayoutSnapshot,
    emptyLayoutSnapshot,
  );
  const isTauDebugEnabled = useFeature('tauDebug');
  const editorRef = projectContext?.editorRef;
  const { treeService } = useFileManager();

  const [fileTree, setFileTree] = useState<NonNullable<ChatSnapshot['fileTree']> | undefined>();

  useEffect(() => {
    if (!treeService) {
      return;
    }

    const sync = (): void => {
      /* The snapshot tells the model what the *project* holds. The pane composes
       * read-only overlays into the same tree (W2), and advertising several
       * hundred system skill bundle files as project context is exactly the noise the
       * Exclusion Matrix keeps out, so the rows are filtered on provenance. */
      const items = [...treeService.getTreeSnapshot().values()].filter(
        (entry): entry is Extract<FileEntry, { type: 'file' }> =>
          entry.type === 'file' && (entry.provenance === undefined || entry.provenance.source === 'project'),
      );
      setFileTree(
        items.map((item): NonNullable<ChatSnapshot['fileTree']>[number] => {
          const name = item.path.split('/').pop() ?? item.path;
          return item.contentKind === 'text'
            ? item.lineCount === undefined
              ? { path: item.path, name, type: 'file', size: item.size }
              : {
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
    const fileByPath = new Map(
      (fileTree ?? []).map((entry): [string, NonNullable<ChatSnapshot['fileTree']>[number]] => [entry.path, entry]),
    );
    const enrichFileReference = (path: string, fallbackName: string): NonNullable<ChatSnapshot['activeFile']> => {
      const entry = fileByPath.get(path);
      if (entry?.type !== 'file') {
        return { path, name: fallbackName };
      }
      if (!('contentKind' in entry)) {
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

    const workbench = projectWorkbenchSnapshot({
      current: layoutSnapshot,
      viewRecords: projectContext?.viewRecords,
      entriesRecord: projectContext?.entriesRecord,
      isTauDebugEnabled,
    });
    if (workbench) {
      snapshot.workbench = workbench;
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
    layoutSnapshot,
    projectContext?.viewRecords,
    projectContext?.entriesRecord,
    isTauDebugEnabled,
  ]);
}
