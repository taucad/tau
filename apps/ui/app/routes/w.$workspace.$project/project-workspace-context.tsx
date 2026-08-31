import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useProject } from '#hooks/use-project.js';
import { useIsMobile } from '#hooks/use-mobile.js';
import type { MobilePanelId } from '#constants/editor.constants.js';
import type { PanelState } from '#types/editor.types.js';
import { useKeybinding } from '#hooks/use-keyboard.js';

export const projectWorkspaceKeyCombinations = {
  files: { key: 'f', ctrlKey: true },
  model: { key: 'a', ctrlKey: true },
  parameters: { key: 'x', ctrlKey: true },
  editor: { key: 'e', ctrlKey: true },
  details: { key: 'i', ctrlKey: true },
  export: { key: 'd', ctrlKey: true },
} as const;

export type WorkbenchPanelId =
  | 'parameters'
  | 'files'
  | 'model'
  | 'revisions'
  | 'share'
  | 'export'
  | 'details'
  | 'kernel'
  | 'console';
export type WorkbenchUtilityPanelId = Exclude<WorkbenchPanelId, 'files'>;

type ProjectWorkspaceContextValue = {
  openPanel: (panelId: WorkbenchPanelId) => void;
  setWorkbenchOpen: (open: boolean) => void;
  setChatOpen: (open: boolean) => void;
  connectWorkbench: (openPanel: (panelId: WorkbenchPanelId) => void) => () => void;
};

const ProjectWorkspaceContext = createContext<ProjectWorkspaceContextValue | undefined>(undefined);

export function resolveCompactAuxiliary(layout: PanelState['desktopLayout']): 'chat' | 'workbench' | undefined {
  if (layout[layout.compactAuxiliary === 'chat' ? 'chatOpen' : 'workbenchOpen']) {
    return layout.compactAuxiliary;
  }
  const other = layout.compactAuxiliary === 'chat' ? 'workbench' : 'chat';
  return layout[other === 'chat' ? 'chatOpen' : 'workbenchOpen'] ? other : undefined;
}

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

const mobilePanelByWorkbenchPanel: Partial<Record<WorkbenchPanelId, MobilePanelId>> = {
  parameters: 'parameters',
  files: 'files',
  export: 'converter',
  share: 'share',
  details: 'details',
};

export function ProjectWorkspaceProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const { editorRef, mainEntryPath } = useProject();
  const isMobile = useIsMobile();
  const openerRef = useRef<((panelId: WorkbenchPanelId) => void) | undefined>(undefined);
  const queuedPanelRef = useRef<WorkbenchPanelId | undefined>(undefined);

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

  const setWorkbenchOpen = useCallback(
    (open: boolean) => {
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
      } else {
        queuedPanelRef.current = panelId;
      }
    },
    [editorRef, isMobile, setWorkbenchOpen],
  );

  const connectWorkbench = useCallback((opener: (panelId: WorkbenchPanelId) => void) => {
    openerRef.current = opener;
    const queued = queuedPanelRef.current;
    queuedPanelRef.current = undefined;
    if (queued) {
      opener(queued);
    }
    return () => {
      if (openerRef.current === opener) {
        openerRef.current = undefined;
      }
    };
  }, []);

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

  useEffect(() => {
    const subscription = editorRef.on('fileOpened', (event) => {
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
    return () => {
      modelSubscription.unsubscribe();
    };
  }, [editorRef, openPanel]);

  const value = useMemo(
    () => ({ openPanel, setWorkbenchOpen, setChatOpen, connectWorkbench }),
    [connectWorkbench, openPanel, setChatOpen, setWorkbenchOpen],
  );
  return <ProjectWorkspaceContext.Provider value={value}>{children}</ProjectWorkspaceContext.Provider>;
}
