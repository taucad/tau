import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import { useProject } from '#hooks/use-project.js';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import type { PanelState } from '@taucad/ui-core/types/editor.types';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import { NavigationType, useLocation, useNavigationType } from 'react-router';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { WorkbenchLayoutController } from '#routes/w.$workspace.$project/workbench-layout-controller.js';
import { createWorkbenchLayoutControllerShim } from '#routes/w.$workspace.$project/workbench-layout-controller.shim.js';
import { mobilePanelByWorkbenchPanel } from '#routes/w.$workspace.$project/project-workspace-context.panels.js';
import type {
  WorkbenchPanelId,
  WorkbenchUtilityPanelId,
} from '#routes/w.$workspace.$project/project-workspace-context.panels.js';
import { searchParameterName } from '@taucad/ui-core/constants/search-parameter.constants';
import { flagParameter } from '@taucad/ui-core/utils/search-parameter.codecs';
import { isSurfaceShipped } from '#workbench-records/surface-availability.js';
import type { PaneIntentSource } from '#workbench-records/pane-intents.js';
import { selectWorkbenchLayoutRef } from '#runtime/project-runtime.js';
import type { ProjectRuntime } from '#runtime/project-runtime.js';
import { sendPaneIntent } from '#runtime/project-runtime.layout.js';
import type { ProjectLayoutFacts, ProjectShellHandlers, WorkbenchLayoutRef } from '#runtime/project-runtime.layout.js';
import type { editorMachine } from '#machines/editor.machine.js';

export const projectWorkspaceKeyCombinations = {
  files: { key: 'f', ctrlKey: true },
  model: { key: 'a', ctrlKey: true },
  parameters: { key: 'x', ctrlKey: true },
  kinematics: { key: 'm', ctrlKey: true },
  editor: { key: 'e', ctrlKey: true },
  details: { key: 'i', ctrlKey: true },
  export: { key: 'd', ctrlKey: true },
} as const;

type ProjectWorkspaceContextValue = {
  /** Survives Dockview header replacement during reviewed layout recovery. */
  registerRecordRecoveryFocus: React.RefCallback<HTMLButtonElement>;
  restoreRecordRecoveryFocus: () => void;
  /** Open a Workbench surface: a pane intent from `source` (the person, unless named) on a live project's layout. */
  openPanel: (panelId: WorkbenchPanelId, source?: PaneIntentSource) => void;
  setWorkbenchOpen: (open: boolean) => void;
  setChatOpen: (open: boolean) => void;
  connectWorkbench: (
    openPanel: (panelId: WorkbenchPanelId) => void,
    activateFile?: (path: string) => void,
  ) => () => void;
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

type EditorRef = ActorRefFrom<typeof editorMachine>;

/** Without a live project's layout there is no record to wait for, and nothing is registered. */
const noLayoutController: WorkbenchLayoutController = {
  snapshot: () => undefined,
  subscribe: () => () => undefined,
  restorePreviousArrangement: async () => false,
  registerViewer: () => () => undefined,
  registerWorkbench: () => () => undefined,
  personViewerChanged: () => undefined,
  personWorkbenchChanged: () => undefined,
  ready: () => true,
};

/** A live project's layout actor; it is spawned with the runtime and never replaced, so one read is enough. */
const selectProjectLayout = (runtime: ProjectRuntime | undefined): WorkbenchLayoutRef | undefined =>
  runtime === undefined ? undefined : selectWorkbenchLayoutRef(runtime.actor.getSnapshot());

/** The paths of the editor's open files now. */
const selectOpenFilePaths = (editorRef: EditorRef): readonly string[] =>
  editorRef.getSnapshot().context.openFiles.map((file) => file.path);

/** The path of the editor's active file now, if any. */
const selectActiveFilePath = (editorRef: EditorRef): string | undefined => {
  const { openFiles, activePaneId } = editorRef.getSnapshot().context;
  return openFiles.find((file) => file.paneId === activePaneId)?.path;
};

export function ProjectWorkspaceProvider({
  children,
  workbenchMode = 'responsive',
  onWorkbenchOpen,
}: {
  readonly children: React.ReactNode;
  readonly workbenchMode?: 'responsive' | 'pane';
  readonly onWorkbenchOpen?: () => void;
}): React.JSX.Element {
  const { editorRef, mainEntryPath, projectRuntime } = useProject();
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
  const navigationType = useNavigationType();
  const routeKey = location.key;
  const isMobile = useIsMobile();
  const isEditorReady = useSelector(editorRef, (snapshot) => snapshot.matches('ready'));

  /* The route key a pane intent is queued under (rule 6). A replace, such as a route intent's own parameter cleanup or
   * the focused chat's URL correction, corrects its navigation rather than starting one, so it keeps the key: an
   * intent survives it (I11, A0.1 row 2). A push or a pop is a new navigation and drops what is still queued. */
  const [intentRoute, setIntentRoute] = useState({ locationKey: routeKey, intentKey: routeKey });
  const intentRouteKey =
    intentRoute.locationKey === routeKey || navigationType === NavigationType.Replace
      ? intentRoute.intentKey
      : routeKey;
  if (intentRoute.locationKey !== routeKey) {
    setIntentRoute({ locationKey: routeKey, intentKey: intentRouteKey });
  }
  const facts = useMemo<ProjectLayoutFacts>(
    () => ({ routeKey: intentRouteKey, device: isMobile ? 'phone' : 'desktop' }),
    [intentRouteKey, isMobile],
  );

  /* A live project's layout: the runtime's child, which outlives this provider (A8b). */
  const layoutHost = workbenchMode === 'responsive' ? projectRuntime.layout : undefined;
  const layoutRef = layoutHost === undefined ? undefined : selectProjectLayout(projectRuntime);
  const layoutShim = useMemo(
    () =>
      layoutRef === undefined || layoutHost === undefined
        ? undefined
        : createWorkbenchLayoutControllerShim({ layout: layoutRef, editor: editorRef, host: layoutHost }),
    [editorRef, layoutHost, layoutRef],
  );
  const layoutController = layoutShim ?? noLayoutController;
  /* The shell's facts reach the runtime as a value before any passive effect of this commit sends an intent. */
  useLayoutEffect(() => {
    layoutHost?.setFacts(facts);
  }, [facts, layoutHost]);

  const openerRef = useRef<((panelId: WorkbenchPanelId) => void) | undefined>(undefined);
  const fileActivationRef = useRef<{ activate: (path: string) => void } | undefined>(undefined);
  /* Without a layout (a preview's pane mode), the one pane and the one file asked for before the workbench connects. */
  const pendingUserFileRef = useRef<{ route: string; path: string } | undefined>(undefined);
  const pendingPreviewPanel = useRef<{ route: string; panel: WorkbenchPanelId } | undefined>(undefined);
  const committedEditorRef = useRef(editorRef);
  const committedRouteKeyRef = useRef(routeKey);
  useLayoutEffect(() => {
    if (committedRouteKeyRef.current !== routeKey || committedEditorRef.current !== editorRef) {
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
      fileActivationRef.current = undefined;
      pendingUserFileRef.current = undefined;
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
      if (!open && isMobile && layoutRef !== undefined) {
        // A phone has no Workbench lane: closing its last pane leaves the desktop lane, and the intents queued for the
        // workbench, as they are (A8b, spec-la round 4).
        return;
      }
      if (!open) {
        // Rule 7: a lane close drops the file intents, held Files among them; any other pane waits for the lane.
        pendingUserFileRef.current = undefined;
        if (pendingPreviewPanel.current?.panel === 'files') {
          pendingPreviewPanel.current = undefined;
        }
      }
      editorRef.send({
        type: 'setPanelState',
        panelState: {
          desktopLayout: { workbenchOpen: open, ...(open ? { compactAuxiliary: 'workbench' } : {}) },
        },
      });
    },
    [editorRef, isMobile, layoutRef],
  );

  const openPanel = useCallback(
    (panelId: WorkbenchPanelId, source: PaneIntentSource = 'person') => {
      if (!isSurfaceShipped(panelId)) {
        return;
      }
      if (workbenchMode === 'pane') {
        onWorkbenchOpen?.();
        if (openerRef.current) {
          openerRef.current(panelId);
        } else {
          // ponytail: one slot, the latest pane asked for before the preview's workbench connects (named in A8b).
          pendingPreviewPanel.current = { route: routeKey, panel: panelId };
        }
        return;
      }
      if (layoutRef !== undefined) {
        // A pane intent: the layout applies it once its record is read and the workbench shows, opens the lane for it,
        // or shows the phone's tab, and accounts for it either way (I11).
        if (!isMobile) {
          setWorkbenchOpen(true);
        }
        sendPaneIntent(layoutRef, facts, { source, target: { kind: 'pane', adapter: 'workbench', pane: panelId } });
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
      if (openerRef.current) {
        openerRef.current(panelId);
      } else {
        pendingPreviewPanel.current = { route: routeKey, panel: panelId };
      }
    },
    [editorRef, facts, isMobile, layoutRef, onWorkbenchOpen, routeKey, setWorkbenchOpen, workbenchMode],
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
      const disconnectIntents = layoutShim?.connectIntents({
        openPanel: opener,
        ...(activateFile === undefined ? {} : { activateFile }),
      });
      const pendingPreview = pendingPreviewPanel.current;
      pendingPreviewPanel.current = undefined;
      if (pendingPreview?.route === routeKey) {
        opener(pendingPreview.panel);
      }
      const pendingFile = pendingUserFileRef.current;
      if (activation && pendingFile?.route === routeKey) {
        // Claim before delivery: reconnects and reentrant opens cannot replay this intent.
        pendingUserFileRef.current = undefined;
        if (selectOpenFilePaths(editorRef).includes(pendingFile.path)) {
          activation.activate(pendingFile.path);
        }
      }
      return () => {
        disconnectIntents?.();
        if (openerRef.current === opener) {
          openerRef.current = undefined;
        }
        if (fileActivationRef.current === activation) {
          fileActivationRef.current = undefined;
        }
      };
    },
    [editorRef, layoutShim, routeKey],
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
      const path = selectActiveFilePath(editorRef) ?? mainEntryPath;
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

  /* What this workspace does with the editor's opens and reveals. The runtime's bridge, the editor's sibling, calls
   * these handlers (A8b); the provider subscribes to nothing. */
  const shellHandlers = useMemo<ProjectShellHandlers>(
    () => ({
      openPanel: (panelId, source) => {
        openPanel(panelId, source);
      },
      fileOpened: (path, source) => {
        if (
          !providerActiveRef.current ||
          committedRouteKeyRef.current !== routeKey ||
          committedEditorRef.current !== editorRef
        ) {
          return;
        }
        /* Another file opening ends the way back; the preview's own open may report after the code editor loads it.
         * ponytail: reopening the same file from the tree keeps it, until back or another file. */
        setReturnTo((current) => (current === undefined || current.path === path ? current : undefined));
        if (source !== 'user') {
          return;
        }
        if (layoutRef !== undefined) {
          // A file intent: shown in the workbench lane's editor once the workbench connects, or on the phone's editor
          // tab, and dropped with a reason if the lane closes or the route moves first (I11).
          if (!isMobile) {
            setWorkbenchOpen(true);
          }
          sendPaneIntent(layoutRef, facts, { source: 'person', target: { kind: 'file', path } });
          return;
        }
        // This owner survives the lazy Editor mount that the open itself requests.
        const activation = fileActivationRef.current;
        if (activation) {
          pendingUserFileRef.current = undefined;
          activation.activate(path);
        } else {
          pendingUserFileRef.current = { route: routeKey, path };
        }
        if (isMobile) {
          editorRef.send({ type: 'setPanelState', panelState: { mobileActiveTab: 'editor' } });
        } else {
          setWorkbenchOpen(true);
        }
      },
    }),
    [editorRef, facts, isMobile, layoutRef, openPanel, routeKey, setWorkbenchOpen],
  );
  useLayoutEffect(() => {
    projectRuntime.shell.set(shellHandlers);
    return () => {
      projectRuntime.shell.release(shellHandlers);
    };
  }, [projectRuntime, shellHandlers]);

  const value = useMemo(
    () => ({
      openPanel,
      setWorkbenchOpen,
      setChatOpen,
      connectWorkbench,
      layoutController,
      registerRecordRecoveryFocus,
      restoreRecordRecoveryFocus,
    }),
    [
      connectWorkbench,
      layoutController,
      openPanel,
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
