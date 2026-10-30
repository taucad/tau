import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import { useProject } from '#hooks/use-project.js';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import type { MobilePanelId } from '#constants/editor.constants.js';
import type { PanelState } from '#types/editor.types.js';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import { useLocation } from 'react-router';
import { useSelector } from '@xstate/react';
import type { WorkbenchLayoutController } from '#routes/w.$workspace.$project/workbench-layout-controller.js';
import type { WorkbenchLaneNode } from '@taucad/workbench';
import { searchParameterName } from '#constants/search-parameter.constants.js';
import { flagParameter } from '#utils/search-parameter.codecs.js';
import { holdUnheardFileReveal, holdUnheardReveal } from '#routes/w.$workspace.$project/workbench-reveal.js';
import { isSurfaceShipped } from '#workbench-records/surface-availability.js';

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
  | 'browser'
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
  | 'console'
  | 'terminal';
export type WorkbenchUtilityPanelId = Exclude<WorkbenchPanelId, 'files'>;

type ProjectWorkspaceContextValue = {
  /** Survives Dockview header replacement during reviewed layout recovery. */
  registerRecordRecoveryFocus: React.RefCallback<HTMLButtonElement>;
  restoreRecordRecoveryFocus: () => void;
  openPanel: (panelId: WorkbenchPanelId) => void;
  setWorkbenchOpen: (open: boolean) => void;
  setChatOpen: (open: boolean) => void;
  connectWorkbench: (
    openPanel: (panelId: WorkbenchPanelId) => void,
    activateFile?: (path: string) => void,
  ) => () => void;
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

/**
 * The phone surface each Workbench surface opens as. Total over `WorkbenchPanelId`, so a pane added to the desktop
 * registry does not compile until it has a phone surface, and `openPanel` never no-ops on a phone (I1). A surface the
 * desktop gates (Print behind Machines, Telemetry and Console behind debug mode) still opens: its body shows the same
 * refusal the desktop pane does.
 */
export const mobilePanelByWorkbenchPanel = {
  browser: 'browser',
  parameters: 'parameters',
  kinematics: 'kinematics',
  files: 'files',
  model: 'model-tree',
  print: 'print',
  revisions: 'revisions',
  agents: 'agents',
  jobs: 'jobs',
  export: 'converter',
  share: 'share',
  details: 'details',
  kernel: 'kernel',
  console: 'console',
  terminal: 'terminal',
} as const satisfies Record<WorkbenchPanelId, MobilePanelId>;

export function ProjectWorkspaceProvider({
  children,
  workbenchMode = 'responsive',
  onWorkbenchOpen,
}: {
  readonly children: React.ReactNode;
  readonly workbenchMode?: 'responsive' | 'pane';
  readonly onWorkbenchOpen?: () => void;
}): React.JSX.Element {
  const { editorRef, mainEntryPath } = useProject();
  const providerActiveRef = useRef(true);
  const recordRecoveryFocusRef = useRef<HTMLButtonElement>(null);
  const pendingRecordRecoveryFocus = useRef(false);
  const recordRecoveryHadFocus = useRef(false);
  useEffect(() => {
    const trackFocus = (event: FocusEvent): void => {
      recordRecoveryHadFocus.current = event.target === recordRecoveryFocusRef.current;
    };
    // Dockview may detach a portal container before React releases its refs.
    document.addEventListener('focusin', trackFocus);
    return () => {
      document.removeEventListener('focusin', trackFocus);
    };
  }, []);
  // oxlint-disable-next-line no-restricted-types -- React callback refs receive null on detach.
  const registerRecordRecoveryFocus = useCallback((node: HTMLButtonElement | null): void => {
    if (
      !node &&
      (recordRecoveryFocusRef.current === document.activeElement ||
        (recordRecoveryHadFocus.current && document.activeElement === document.body))
    ) {
      pendingRecordRecoveryFocus.current = true;
    }
    recordRecoveryFocusRef.current = node;
    if (node && pendingRecordRecoveryFocus.current) {
      pendingRecordRecoveryFocus.current = false;
      // Header replacement may briefly leave focus on body. Respect any focus the person moved elsewhere.
      if (document.activeElement === document.body && !node.closest('[inert]')) {
        node.focus();
      }
    }
  }, []);
  const restoreRecordRecoveryFocus = useCallback((): void => {
    if (!providerActiveRef.current) {
      return;
    }
    const target = recordRecoveryFocusRef.current;
    pendingRecordRecoveryFocus.current = !target?.isConnected;
    if (target?.isConnected && !target.closest('[inert]')) {
      target.focus();
    }
  }, []);
  const location = useLocation();
  const routeKey = location.key;
  const isMobile = useIsMobile();
  const isEditorReady = useSelector(editorRef, (snapshot) => snapshot.matches('ready'));
  const openerRef = useRef<((panelId: WorkbenchPanelId) => void) | undefined>(undefined);
  const pendingFilesRef = useRef<string | undefined>(undefined);
  const fileActivationRef = useRef<{ activate: (path: string) => void } | undefined>(undefined);
  const pendingUserFileRef = useRef<{ route: string; path: string } | undefined>(undefined);
  const committedEditorRef = useRef(editorRef);
  const pendingPreviewPanel = useRef<{ route: string; panel: WorkbenchPanelId } | undefined>(undefined);
  const committedRouteKeyRef = useRef(routeKey);
  useLayoutEffect(() => {
    if (committedRouteKeyRef.current !== routeKey || committedEditorRef.current !== editorRef) {
      pendingFilesRef.current = undefined;
      pendingPreviewPanel.current = undefined;
      openerRef.current = undefined;
      committedRouteKeyRef.current = routeKey;
      committedEditorRef.current = editorRef;
      fileActivationRef.current = undefined;
      pendingUserFileRef.current = undefined;
      pendingRecordRecoveryFocus.current = false;
      recordRecoveryHadFocus.current = false;
    }
  }, [editorRef, routeKey]);
  useLayoutEffect(() => {
    providerActiveRef.current = true;
    return () => {
      providerActiveRef.current = false;
      pendingRecordRecoveryFocus.current = false;
      recordRecoveryHadFocus.current = false;
      pendingPreviewPanel.current = undefined;
      pendingFilesRef.current = undefined;
      fileActivationRef.current = undefined;
      pendingUserFileRef.current = undefined;
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
      personWorkbenchChanged: (node, unapplied) => layoutControllerRef.current?.personWorkbenchChanged(node, unapplied),
      // Without a record host there is no record to wait for.
      ready: () => layoutControllerRef.current?.ready() ?? true,
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
        pendingUserFileRef.current = undefined;
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
      if (!isSurfaceShipped(panelId)) {
        return;
      }
      pendingFilesRef.current = undefined;
      pendingUserFileRef.current = undefined;
      if (workbenchMode === 'pane') {
        onWorkbenchOpen?.();
        if (openerRef.current) {
          openerRef.current(panelId);
        } else {
          pendingPreviewPanel.current = { route: routeKey, panel: panelId };
        }
        return;
      }
      if (isMobile) {
        editorRef.send({
          type: 'setPanelState',
          panelState: { mobileActiveTab: mobilePanelByWorkbenchPanel[panelId] },
        });
        return;
      }
      setWorkbenchOpen(true);
      // Before the layout record's first read, a pane opened straight into the workbench is replaced by the record's
      // arrangement when the read lands (a Share deep link would show Share, then lose it). It is asked for as a change
      // instead, applied on top of the saved arrangement once that is read, whatever the saved arrangement holds.
      if (openerRef.current && (panelId === 'files' || layoutController.ready())) {
        openerRef.current(panelId);
      } else if (panelId === 'files') {
        pendingFilesRef.current = routeKey;
      } else {
        // When the record cannot take the change, the pane opens straight into the workbench, or once it connects.
        layoutController.personWorkbenchChanged(
          (node) => addPane(node, panelId),
          () => {
            // The record answers after its first read; the route may have changed since.
            if (!providerActiveRef.current || committedRouteKeyRef.current !== routeKey) {
              return;
            }
            if (openerRef.current) {
              openerRef.current(panelId);
            } else {
              pendingPreviewPanel.current = { route: routeKey, panel: panelId };
            }
          },
        );
      }
    },
    [editorRef, isMobile, layoutController, setWorkbenchOpen, routeKey, workbenchMode, onWorkbenchOpen],
  );

  const connectWorkbench = useCallback(
    (opener: (panelId: WorkbenchPanelId) => void, activateFile?: (path: string) => void) => {
      if (
        !providerActiveRef.current ||
        committedRouteKeyRef.current !== routeKey ||
        committedEditorRef.current !== editorRef
      ) {
        return () => undefined;
      }
      openerRef.current = opener;
      const activation = activateFile ? { activate: activateFile } : undefined;
      fileActivationRef.current = activation;
      const pendingPreview = pendingPreviewPanel.current;
      pendingPreviewPanel.current = undefined;
      if (pendingPreview?.route === routeKey) {
        opener(pendingPreview.panel);
      }
      const pendingFiles = pendingFilesRef.current;
      pendingFilesRef.current = undefined;
      if (pendingFiles !== undefined && pendingFiles === routeKey) {
        opener('files');
      }
      const pendingFile = pendingUserFileRef.current;
      if (activation && pendingFile?.route === routeKey) {
        // Claim before delivery: reconnects and reentrant opens cannot replay this intent.
        pendingUserFileRef.current = undefined;
        if (editorRef.getSnapshot().context.openFiles.some((file) => file.path === pendingFile.path)) {
          activation.activate(pendingFile.path);
        }
      }
      return () => {
        if (openerRef.current === opener) {
          openerRef.current = undefined;
        }
        if (fileActivationRef.current === activation) {
          fileActivationRef.current = undefined;
        }
      };
    },
    [editorRef, routeKey],
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
    // Ctrl+A selects editable text on Windows and Linux.
    { enabled: !isMobile, ignoreInputs: true },
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
    // CodeMirror binds Ctrl+M on Windows and Linux to toggle Tab focus mode.
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
      if (
        !providerActiveRef.current ||
        committedRouteKeyRef.current !== routeKey ||
        committedEditorRef.current !== editorRef
      ) {
        return;
      }
      /* Another file opening ends the way back; the preview's own open may report after the code editor loads it.
       * ponytail: reopening the same file from the tree keeps it, until back or another file. */
      setReturnTo((current) => (current === undefined || current.path === event.path ? current : undefined));
      if (event.source !== 'user') {
        return;
      }
      // This owner survives the lazy Editor mount that the open itself requests.
      const activation = fileActivationRef.current;
      if (activation) {
        pendingUserFileRef.current = undefined;
        activation.activate(event.path);
      } else {
        pendingUserFileRef.current = { route: routeKey, path: event.path };
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
  }, [editorRef, isMobile, routeKey, setWorkbenchOpen]);

  useEffect(() => {
    // The pane may mount only because of this reveal, after the emit: hold it for that pane's first subscribe.
    const fileSubscription = editorRef.on('fileRevealRequested', (event) => {
      holdUnheardFileReveal(editorRef, event);
    });
    const modelSubscription = editorRef.on('modelComponentRevealRequested', (event) => {
      holdUnheardReveal(editorRef, 'model', event);
      openPanel('model');
    });
    const kinematicsSubscription = editorRef.on('kinematicsRevealRequested', (event) => {
      holdUnheardReveal(editorRef, 'kinematics', event);
      openPanel('kinematics');
    });
    return () => {
      fileSubscription.unsubscribe();
      modelSubscription.unsubscribe();
      kinematicsSubscription.unsubscribe();
    };
  }, [editorRef, openPanel]);

  const value = useMemo(
    () => ({
      openPanel,
      setWorkbenchOpen,
      setChatOpen,
      connectWorkbench,
      registerLayoutController,
      layoutController,
      registerRecordRecoveryFocus,
      restoreRecordRecoveryFocus,
    }),
    [
      connectWorkbench,
      layoutController,
      openPanel,
      registerLayoutController,
      setChatOpen,
      setWorkbenchOpen,
      registerRecordRecoveryFocus,
      restoreRecordRecoveryFocus,
    ],
  );
  return (
    <ProjectWorkspaceContext.Provider value={value}>
      <FileReturnContext.Provider value={fileReturn}>{children}</FileReturnContext.Provider>
    </ProjectWorkspaceContext.Provider>
  );
}
