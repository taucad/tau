import { useEffect, useState, useCallback } from 'react';
import { useSelector } from '@xstate/react';
import type { PaneviewApi } from 'dockview-react';
import type { chatTabs } from '#routes/w.$workspace.$project/chat-interface-nav.js';
import { useProject } from '#hooks/use-project.js';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { mobileDrawerSnapPoints } from '#constants/editor.constants.js';
import type { PaneviewPanelState, PanelState } from '#types/editor.types.js';

export type ChatInterfaceState = {
  // Loading state
  /** Whether the editor state has been loaded from storage (ready for rendering) */
  isEditorReady: boolean;

  activeTab: (typeof chatTabs)[number]['id'];
  setActiveTab: (value: (typeof chatTabs)[number]['id']) => void;
  // Mobile drawer state
  drawerOpen: boolean;
  handleDrawerChange: (value: boolean) => void;
  snapPoints: Array<number | string>;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Vaul API
  activeSnapPoint: number | string | null;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Vaul API
  handleSnapChange: (value: number | string | null) => void;
  // Actions
  handleTabChange: (value: string) => void;
};

/**
 * Custom hook to manage chat interface state
 * Extracted from chat-interface.tsx to improve maintainability
 */
export function useChatInterfaceState(): ChatInterfaceState {
  const { editorRef } = useProject();
  const isMobile = useIsMobile();

  // Defer the mobile drawer until its persisted active surface is available.
  const isEditorReady = useSelector(editorRef, (state) => state.matches('ready'));

  const mobileActiveTab = useSelector(editorRef, (state) => state.context.panelState.mobileActiveTab);

  const activeTab = mobileActiveTab;

  const setActiveTab = useCallback(
    (value: (typeof chatTabs)[number]['id']) => {
      editorRef.send({ type: 'setPanelState', panelState: { mobileActiveTab: value } });
    },
    [editorRef],
  );

  const [drawerOpen, setDrawerOpen] = useState<boolean>(activeTab !== 'viewer');
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Vaul API
  const [snapPoint, setSnapPoint] = useState<number | string | null>(mobileDrawerSnapPoints[0]!);

  // Opening a non-viewer tab via editor machine (e.g. header Export) must raise the drawer; tab changes
  // from the bottom nav already sync drawer via handleTabChange.
  useEffect(() => {
    if (!isMobile || activeTab === 'viewer' || drawerOpen) {
      return;
    }

    setDrawerOpen(true);
  }, [isMobile, activeTab, drawerOpen]);

  const handleDrawerChange = useCallback(
    (value: boolean): void => {
      if (!value && activeTab !== 'viewer') {
        setActiveTab('viewer');
      }

      setDrawerOpen(value);
    },
    [activeTab, setActiveTab],
  );

  const handleTabChange = useCallback(
    (value: string): void => {
      setActiveTab(value as (typeof chatTabs)[number]['id']);

      if (!drawerOpen && value !== 'viewer') {
        // When the drawer is closed and the new tab is not the model tab, open the drawer
        setDrawerOpen(true);
      } else if (drawerOpen && value === 'viewer') {
        // When the drawer is open and the new tab is the model tab, close the drawer
        setDrawerOpen(false);
      }
    },
    [drawerOpen, setActiveTab],
  );

  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Vaul API
  const handleSnapChange = useCallback((value: number | string | null): void => {
    setSnapPoint(value);
  }, []);

  return {
    isEditorReady,
    activeTab,
    setActiveTab,
    drawerOpen,
    handleDrawerChange,
    activeSnapPoint: snapPoint,
    snapPoints: mobileDrawerSnapPoints,
    handleSnapChange,
    handleTabChange,
  };
}

// ---------------------------------------------------------------------------
// Paneview persistence hook
// ---------------------------------------------------------------------------

type PaneviewKey = 'kernelPaneview' | 'modelPaneview' | 'parametersPaneview' | 'consolePaneview';

/**
 * Reads the saved paneview panel state for a given panel ID, returning
 * `isExpanded` and `size` for use as initial `addPanel` options.
 */
export function getInitialPanelOptions(
  saved: Record<string, PaneviewPanelState>,
  panelId: string,
  defaults: { isExpanded: boolean; size?: number },
): { isExpanded: boolean; size?: number } {
  const entry = saved[panelId];
  if (!entry) {
    return defaults;
  }
  return { isExpanded: entry.isExpanded, size: entry.size };
}

/**
 * Persists PaneviewReact panel states (expansion + size) through the editor
 * machine.
 *
 * Call `connectApi` inside the PaneviewReact `onReady` callback so the hook
 * can subscribe to `onDidLayoutChange` and snapshot panel state on every change.
 */
export function usePaneviewPersistence(paneviewKey: PaneviewKey): {
  savedState: Record<string, PaneviewPanelState>;
  connectApi: (api: PaneviewApi) => void;
} {
  const { editorRef } = useProject();
  const savedState = useSelector(editorRef, (state) => state.context.panelState[paneviewKey]);
  const [api, setApi] = useState<PaneviewApi | undefined>(undefined);

  const connectApi = useCallback((paneviewApi: PaneviewApi) => {
    setApi(paneviewApi);
  }, []);

  useEffect(() => {
    if (!api) {
      return;
    }

    const disposable = api.onDidLayoutChange(() => {
      const record: Record<string, PaneviewPanelState> = {};
      for (const panel of api.panels) {
        record[panel.id] = {
          isExpanded: panel.api.isExpanded,
          size: panel.height,
        };
      }

      const panelState: Partial<PanelState> = { [paneviewKey]: record };
      editorRef.send({ type: 'setPanelState', panelState });
    });

    return () => {
      disposable.dispose();
    };
  }, [editorRef, paneviewKey, api]);

  return { savedState, connectApi };
}
