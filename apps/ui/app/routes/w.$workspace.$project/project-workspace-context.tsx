import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import { useProject } from '#hooks/use-project.js';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import type { MobilePanelId } from '#constants/editor.constants.js';
import type { PanelState } from '#types/editor.types.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { useLocation } from 'react-router';
import { useSelector } from '@xstate/react';
import type { WorkbenchLayoutController } from '#routes/w.$workspace.$project/workbench-layout-controller.js';
import type { WorkbenchLaneNode } from '@taucad/workbench';
import { searchParameterName } from '#constants/search-parameter.constants.js';
import { flagParameter } from '#utils/search-parameter.codecs.js';

export const projectWorkspaceKeyCombinations = {
  files: { key: 'f', ctrlKey: true },
  model: { key: 'a', ctrlKey: true },
  parameters: { key: 'x', ctrlKey: true },
  kinematics: { key: 'm', ctrlKey: true },
  editor: { key: 'e', ctrlKey: true },
  details: { key: 'i', ctrlKey: true },
  export: { key: 'd', ctrlKey: true },
} as const;

export type WorkbenchPanelId =
  | 'parameters'
  | 'kinematics'
  | 'files'
  | 'model'
  | 'print'
  | 'revisions'
  | 'agents'
  | 'jobs'
  | 'export'
  | 'share'
  | 'details'
  | 'kernel'
  | 'console';
export type WorkbenchUtilityPanelId = Exclude<WorkbenchPanelId, 'files'>;

type ProjectWorkspaceContextValue = {
  openPanel: (panelId: WorkbenchPanelId) => void;
  setWorkbenchOpen: (open: boolean) => void;
  setChatOpen: (open: boolean) => void;
  connectWorkbench: (openPanel: (panelId: WorkbenchPanelId) => void) => () => void;
  registerLayoutController: (controller: WorkbenchLayoutController) => () => void;
  layoutController: WorkbenchLayoutController;
};

const ProjectWorkspaceContext = createContext<ProjectWorkspaceContextValue | undefined>(undefined);

/** The pane a file was opened from, so its tab can offer one way back (the Print pane's G-code preview). */
export type FileReturn = Readonly<{ path: string; panel: WorkbenchUtilityPanelId }>;

type FileReturnContextValue = Readonly<{
  returnTo: FileReturn | undefined;
  /** Open a file as the user would, remembering the pane to go back to. */
  openFileFrom: (path: string, panel: WorkbenchUtilityPanelId) => void;
  /** Go back to that pane; the way back is spent. */
  back: () => void;
}>;

const FileReturnContext = createContext<FileReturnContextValue | undefined>(undefined);

/**
 * The way back from a file a pane opened; separate from {@link useProjectWorkspace} so its changes
 * re-render only the breadcrumbs that show it.
 *
 * @returns The way back, or undefined outside a project workspace.
 */
export const useFileReturn = (): FileReturnContextValue | undefined => useContext(FileReturnContext);

export function resolveCompactAuxiliary(layout: PanelState['desktopLayout']): 'chat' | 'workbench' | undefined {
  if (layout[layout.compactAuxiliary === 'chat' ? 'chatOpen' : 'workbenchOpen']) {
    return layout.compactAuxiliary;
  }
  const other = layout.compactAuxiliary === 'chat' ? 'workbench' : 'chat';
  return layout[other === 'chat' ? 'chatOpen' : 'workbenchOpen'] ? other : undefined;
}

/** Which desktop lanes are on screen, after the compact rule has picked one auxiliary. */
export type WorkspaceLanes = Readonly<{ chat: boolean; workbench: boolean }>;

/**
 * Lane visibility, provided by `ChatInterfaceDesktop`, the one owner that
 * measures the width the compact rule depends on. Undefined outside it: mobile
 * and shared pages have no lanes.
 */
export const WorkspaceLanesContext = createContext<WorkspaceLanes | undefined>(undefined);

const noLanes: WorkspaceLanes = { chat: false, workbench: false };

/**
 * Reads which desktop lanes are on screen.
 *
 * @returns Whether the chat and workbench lanes are visible; neither outside the desktop layout.
 */
export const useWorkspaceLanes = (): WorkspaceLanes => useContext(WorkspaceLanesContext) ?? noLanes;

export function useProjectWorkspace(): ProjectWorkspaceContextValue;
export function useProjectWorkspace(options: {
  readonly enableNoContext: true;
}): ProjectWorkspaceContextValue | undefined;
export function useProjectWorkspace(options?: {
  readonly enableNoContext?: boolean;
}): ProjectWorkspaceContextValue | undefined {
  const context = useContext(ProjectWorkspaceContext);
  if (!context && !options?.enableNoContext) {
    throw new Error('useProjectWorkspace must be used within ProjectWorkspaceProvider');
  }
  return context;
}

/** The page-owned Restore/snapshot API used by the arrangement card and chat snapshot. */
export function useWorkbenchLayoutController(): WorkbenchLayoutController {
  return useProjectWorkspace().layoutController;
}

const containsPane = (node: WorkbenchLaneNode, pane: WorkbenchUtilityPanelId): boolean =>
  node.kind === 'group'
    ? node.tabs.some((tab) => tab.kind === 'pane' && tab.pane === pane)
    : node.children.some((child) => containsPane(child, pane));

const addPane = (node: WorkbenchLaneNode, pane: WorkbenchUtilityPanelId): WorkbenchLaneNode => {
  if (node.kind === 'group') {
    const index = node.tabs.findIndex((tab) => tab.kind === 'pane' && tab.pane === pane);
    return index === -1
      ? { ...node, tabs: [...node.tabs, { kind: 'pane', pane }], active: node.tabs.length }
      : { ...node, active: index };
  }
  const childIndex = Math.max(
    0,
    node.children.findIndex((child) => containsPane(child, pane)),
  );
  return {
    ...node,
    children: node.children.map((child, index) => (index === childIndex ? addPane(child, pane) : child)),
  };
};

const mobilePanelByWorkbenchPanel: Partial<Record<WorkbenchPanelId, MobilePanelId>> = {
  parameters: 'parameters',
  files: 'files',
  export: 'converter',
  share: 'share',
  details: 'details',
  revisions: 'revisions',
};

export function ProjectWorkspaceProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const { editorRef, mainEntryPath } = useProject();
  const location = useLocation();
  const routeKey = location.key;
  const isMobile = useIsMobile();
  const isEditorReady = useSelector(editorRef, (snapshot) => snapshot.matches('ready'));
  const openerRef = useRef<((panelId: WorkbenchPanelId) => void) | undefined>(undefined);
  const pendingFilesRef = useRef<string | undefined>(undefined);
  const committedRouteKeyRef = useRef(routeKey);
  useLayoutEffect(() => {
    if (committedRouteKeyRef.current !== routeKey) {
      pendingFilesRef.current = undefined;
      openerRef.current = undefined;
      committedRouteKeyRef.current = routeKey;
    }
  }, [routeKey]);
  const providerActiveRef = useRef(true);
  useLayoutEffect(() => {
    providerActiveRef.current = true;
    return () => {
      providerActiveRef.current = false;
      pendingFilesRef.current = undefined;
    };
  }, []);

  const layoutControllerRef = useRef<WorkbenchLayoutController | undefined>(undefined);
  const layoutListenersRef = useRef(new Set<() => void>());
  const layoutController = useMemo<WorkbenchLayoutController>(
    () => ({
      snapshot: () => layoutControllerRef.current?.snapshot(),
      subscribe: (listener) => {
        layoutListenersRef.current.add(listener);
        return () => {
          layoutListenersRef.current.delete(listener);
        };
      },
      restorePreviousArrangement: async (expected) =>
        layoutControllerRef.current?.restorePreviousArrangement(expected) ?? false,
      registerViewer: (apply) => layoutControllerRef.current?.registerViewer(apply) ?? (() => undefined),
      registerWorkbench: (apply) => layoutControllerRef.current?.registerWorkbench(apply) ?? (() => undefined),
      personViewerChanged: (node) => layoutControllerRef.current?.personViewerChanged(node),
      personWorkbenchChanged: (node) => layoutControllerRef.current?.personWorkbenchChanged(node),
    }),
    [],
  );
  const registerLayoutController = useCallback((controller: WorkbenchLayoutController) => {
    layoutControllerRef.current = controller;
    const unsubscribe = controller.subscribe(() => {
      for (const listener of layoutListenersRef.current) {
        listener();
      }
    });
    for (const listener of layoutListenersRef.current) {
      listener();
    }
    return () => {
      if (layoutControllerRef.current === controller) {
        layoutControllerRef.current = undefined;
      }
      unsubscribe();
    };
  }, []);

  const setChatOpen = useCallback(
    (open: boolean) => {
      editorRef.send({
        type: 'setPanelState',
        panelState: { desktopLayout: { chatOpen: open, ...(open ? { compactAuxiliary: 'chat' } : {}) } },
      });
      if (isMobile && open) {
        editorRef.send({ type: 'setPanelState', panelState: { mobileActiveTab: 'chat' } });
      }
    },
    [editorRef, isMobile],
  );

  const shouldOpenChat = location.state?.openChat === true || location.state?.focusChatComposer === true;
  const isArchiveOpen = flagParameter.parse(
    new URLSearchParams(location.search).get(searchParameterName.archivedChats) ?? undefined,
  );
  useEffect(() => {
    if (isEditorReady && isArchiveOpen) {
      setChatOpen(true);
    }
  }, [isArchiveOpen, isEditorReady, setChatOpen]);
  const navigationKey = routeKey;
  /* Each sidebar click is its own navigation, even onto the selected chat, so the
   * pane opens once per navigation and a pane the user closes afterwards stays closed. */
  const openedForNavigationRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (isEditorReady && shouldOpenChat && openedForNavigationRef.current !== navigationKey) {
      openedForNavigationRef.current = navigationKey;
      setChatOpen(true);
    }
  }, [isEditorReady, navigationKey, setChatOpen, shouldOpenChat]);

  const setWorkbenchOpen = useCallback(
    (open: boolean) => {
      if (!open) {
        pendingFilesRef.current = undefined;
      }
      editorRef.send({
        type: 'setPanelState',
        panelState: {
          desktopLayout: { workbenchOpen: open, ...(open ? { compactAuxiliary: 'workbench' } : {}) },
        },
      });
    },
    [editorRef],
  );

  const openPanel = useCallback(
    (panelId: WorkbenchPanelId) => {
      pendingFilesRef.current = undefined;
      if (isMobile) {
        const mobilePanel = mobilePanelByWorkbenchPanel[panelId];
        if (mobilePanel) {
          editorRef.send({ type: 'setPanelState', panelState: { mobileActiveTab: mobilePanel } });
        }
        return;
      }
      setWorkbenchOpen(true);
      if (openerRef.current) {
        openerRef.current(panelId);
      } else if (panelId === 'files') {
        pendingFilesRef.current = routeKey;
      } else {
        layoutController.personWorkbenchChanged((node) => addPane(node, panelId));
      }
    },
    [editorRef, isMobile, layoutController, setWorkbenchOpen, routeKey],
  );

  const connectWorkbench = useCallback(
    (opener: (panelId: WorkbenchPanelId) => void) => {
      if (!providerActiveRef.current || committedRouteKeyRef.current !== routeKey) {
        return () => undefined;
      }
      openerRef.current = opener;
      const pendingFiles = pendingFilesRef.current;
      pendingFilesRef.current = undefined;
      if (pendingFiles !== undefined && pendingFiles === routeKey) {
        opener('files');
      }
      return () => {
        if (openerRef.current === opener) {
          openerRef.current = undefined;
        }
      };
    },
    [routeKey],
  );

  useKeybinding(
    projectWorkspaceKeyCombinations.files,
    () => {
      openPanel('files');
    },
    { enabled: !isMobile },
  );
  useKeybinding(
    projectWorkspaceKeyCombinations.model,
    () => {
      openPanel('model');
    },
    { enabled: !isMobile },
  );
  useKeybinding(
    projectWorkspaceKeyCombinations.parameters,
    () => {
      openPanel('parameters');
    },
    { enabled: !isMobile },
  );
  useKeybinding(
    projectWorkspaceKeyCombinations.kinematics,
    () => {
      openPanel('kinematics');
    },
    // Monaco binds Ctrl+M on Windows and Linux to "Toggle Tab Key Moves Focus", its way out of the Tab trap.
    { enabled: !isMobile, ignoreInputs: true },
  );
  useKeybinding(
    projectWorkspaceKeyCombinations.details,
    () => {
      openPanel('details');
    },
    { enabled: !isMobile },
  );
  useKeybinding(
    projectWorkspaceKeyCombinations.export,
    () => {
      openPanel('export');
    },
    { enabled: !isMobile },
  );
  useKeybinding(
    projectWorkspaceKeyCombinations.editor,
    () => {
      const snapshot = editorRef.getSnapshot();
      const activePath = snapshot.context.openFiles.find((file) => file.paneId === snapshot.context.activePaneId)?.path;
      const path = activePath ?? mainEntryPath;
      if (path) {
        editorRef.send({ type: 'openFile', path, source: 'user' });
      }
    },
    { enabled: !isMobile },
  );

  const [returnTo, setReturnTo] = useState<FileReturn>();
  const openFileFrom = useCallback(
    (path: string, panel: WorkbenchUtilityPanelId) => {
      editorRef.send({ type: 'openFile', path, source: 'user' });
      setReturnTo({ path, panel });
    },
    [editorRef],
  );
  const back = useCallback(() => {
    if (returnTo) {
      openPanel(returnTo.panel);
      setReturnTo(undefined);
    }
  }, [openPanel, returnTo]);
  const fileReturn = useMemo(() => ({ returnTo, openFileFrom, back }), [back, openFileFrom, returnTo]);

  useEffect(() => {
    const subscription = editorRef.on('fileOpened', (event) => {
      /* Another file opening ends the way back; the preview's own open may report after Monaco loads it.
       * ponytail: reopening the same file from the tree keeps it, until back or another file. */
      setReturnTo((current) => (current === undefined || current.path === event.path ? current : undefined));
      if (event.source !== 'user') {
        return;
      }
      if (isMobile) {
        editorRef.send({ type: 'setPanelState', panelState: { mobileActiveTab: 'editor' } });
      } else {
        setWorkbenchOpen(true);
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [editorRef, isMobile, setWorkbenchOpen]);

  useEffect(() => {
    const modelSubscription = editorRef.on('modelComponentRevealRequested', () => {
      openPanel('model');
    });
    const kinematicsSubscription = editorRef.on('kinematicsRevealRequested', () => {
      openPanel('kinematics');
    });
    return () => {
      modelSubscription.unsubscribe();
      kinematicsSubscription.unsubscribe();
    };
  }, [editorRef, openPanel]);

  const value = useMemo(
    () => ({ openPanel, setWorkbenchOpen, setChatOpen, connectWorkbench, registerLayoutController, layoutController }),
    [connectWorkbench, layoutController, openPanel, registerLayoutController, setChatOpen, setWorkbenchOpen],
  );
  return (
    <ProjectWorkspaceContext.Provider value={value}>
      <FileReturnContext.Provider value={fileReturn}>{children}</FileReturnContext.Provider>
    </ProjectWorkspaceContext.Provider>
  );
}
