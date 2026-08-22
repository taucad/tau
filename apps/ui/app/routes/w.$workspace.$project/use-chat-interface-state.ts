import { useEffect, useState, useCallback } from 'react';
import { useSelector } from '@xstate/react';
import type { PaneviewApi } from 'dockview-react';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import type { chatTabs } from '#routes/w.$workspace.$project/chat-interface-nav.js';
import { useViewContext } from '#routes/w.$workspace.$project/chat-interface-view-context.js';
import { useProject } from '#hooks/use-project.js';
import { useIsMobile } from '#hooks/use-mobile.js';
import type { PanelId } from '#constants/editor.constants.js';
import { allotmentPanelOrder, mobileDrawerSnapPoints } from '#constants/editor.constants.js';
import type { PaneviewPanelState, PanelState } from '#types/editor.types.js';

export type ChatInterfaceState = {
  // Loading state
  /** Whether the editor state has been loaded from storage (ready for rendering) */
  isEditorReady: boolean;

  // View context state
  isChatOpen: boolean;
  setIsChatOpen: (value: boolean | ((previous: boolean) => boolean)) => void;
  isFileTreeOpen: boolean;
  setIsFileTreeOpen: (value: boolean | ((previous: boolean) => boolean)) => void;
  isParametersOpen: boolean;
  setIsParametersOpen: (value: boolean | ((previous: boolean) => boolean)) => void;
  isEditorOpen: boolean;
  setIsEditorOpen: (value: boolean | ((previous: boolean) => boolean)) => void;
  isExplorerOpen: boolean;
  setIsExplorerOpen: (value: boolean | ((previous: boolean) => boolean)) => void;
  isKernelOpen: boolean;
  setIsKernelOpen: (value: boolean | ((previous: boolean) => boolean)) => void;
  isConverterOpen: boolean;
  setIsConverterOpen: (value: boolean | ((previous: boolean) => boolean)) => void;
  isDetailsOpen: boolean;
  setIsDetailsOpen: (value: boolean | ((previous: boolean) => boolean)) => void;

  // Panel sizes state
  /** Individual panel sizes for preferredSize props (keyed by panel ID) */
  panelSizes: Record<PanelId, number>;
  /** Set panel sizes from Allotment's onDragEnd callback (array format) */
  setChatResize: (value: readonly number[]) => void;
  activeTab: (typeof chatTabs)[number]['id'];
  setActiveTab: (value: (typeof chatTabs)[number]['id']) => void;
  isFullHeightPanel: boolean;
  setIsFullHeightPanel: (value: boolean | ((previous: boolean) => boolean)) => void;

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
  toggleFullHeightPanel: () => void;
};

/**
 * Custom hook to manage chat interface state
 * Extracted from chat-interface.tsx to improve maintainability
 */
export function useChatInterfaceState(): ChatInterfaceState {
  const viewContext = useViewContext();
  const { editorRef } = useProject();
  const isMobile = useIsMobile();

  // Check if editor state has been loaded from IndexedDB
  // This is used to defer Allotment rendering until saved panel sizes are available
  const isEditorReady = useSelector(editorRef, (state) => state.matches('ready'));

  // Read panel sizes and mobile tab from machine
  // (panelState is always initialized with defaultPanelState in the machine context)
  const panelSizes = useSelector(editorRef, (state) => state.context.panelState.panelSizes);
  const mobileActiveTab = useSelector(editorRef, (state) => state.context.panelState.mobileActiveTab);

  const setChatResize = useCallback(
    (sizes: readonly number[]) => {
      // When onDragEnd fires, invisible panes have size 0 in the sizes array.
      // We must NOT overwrite our saved sizes with these 0 values, otherwise
      // when the pane becomes visible again, it would start with size 0.
      // Only update sizes for panes that are currently visible (size > 0).
      const mergedSizes = { ...panelSizes };
      for (const [index, panelId] of allotmentPanelOrder.entries()) {
        const newSize = sizes[index];
        // Only update if the pane was visible (size > 0)
        if (newSize !== undefined && newSize > 0) {
          mergedSizes[panelId] = newSize;
        }
      }

      editorRef.send({ type: 'setPanelState', panelState: { panelSizes: mergedSizes } });
    },
    [editorRef, panelSizes],
  );

  // Cast to the expected tab type
  const activeTab = mobileActiveTab as (typeof chatTabs)[number]['id'];

  const setActiveTab = useCallback(
    (value: (typeof chatTabs)[number]['id']) => {
      editorRef.send({ type: 'setPanelState', panelState: { mobileActiveTab: value } });
    },
    [editorRef],
  );

  // Keep isFullHeightPanel in cookies (user preference, not per-build)
  const [isFullHeightPanel, setIsFullHeightPanel] = useCookie(cookieName.chatInterfaceFullHeight, false);

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

  const toggleFullHeightPanel = useCallback((): void => {
    setIsFullHeightPanel((previous) => !previous);
  }, [setIsFullHeightPanel]);

  return {
    isEditorReady,
    ...viewContext,
    panelSizes,
    setChatResize,
    activeTab,
    setActiveTab,
    isFullHeightPanel,
    setIsFullHeightPanel,
    drawerOpen,
    handleDrawerChange,
    activeSnapPoint: snapPoint,
    snapPoints: mobileDrawerSnapPoints,
    handleSnapChange,
    handleTabChange,
    toggleFullHeightPanel,
  };
}

// ---------------------------------------------------------------------------
// Paneview persistence hook
// ---------------------------------------------------------------------------

type PaneviewKey = 'kernelPaneview' | 'parametersPaneview';

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
 * machine, following the same pattern as Allotment panel sizes.
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

type UsePanePositionObserverOptions = {
  isChatOpen: boolean;
  isFileTreeOpen: boolean;
  isParametersOpen: boolean;
  isEditorOpen: boolean;
  isExplorerOpen: boolean;
  isKernelOpen: boolean;
  isConverterOpen: boolean;
  isDetailsOpen: boolean;
};

/**
 * Custom hook to observe and update pane positions for desktop layout
 * Updates position attributes on visible panes for performant CSS selectors
 */
export function usePanePositionObserver(
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- allowable for `ref`
  allotmentRef: React.RefObject<HTMLDivElement | null>,
  options: UsePanePositionObserverOptions,
): void {
  const {
    isChatOpen,
    isFileTreeOpen,
    isParametersOpen,
    isEditorOpen,
    isExplorerOpen,
    isKernelOpen,
    isConverterOpen,
    isDetailsOpen,
  } = options;

  useEffect(() => {
    if (!allotmentRef.current) {
      return;
    }

    const updatePanePositions = (): void => {
      const leftPanes = allotmentRef.current?.querySelectorAll('.rs-left.split-view-view-visible');
      const rightPanes = allotmentRef.current?.querySelectorAll('.rs-right.split-view-view-visible');

      // Update left panes
      if (leftPanes) {
        for (const [index, pane] of [...leftPanes].entries()) {
          const element = pane as HTMLElement;
          const isFirst = index === 0;
          const isLast = index === leftPanes.length - 1;

          if (isFirst) {
            element.dataset['first'] = '';
          } else {
            delete element.dataset['first'];
          }

          if (isLast) {
            element.dataset['last'] = '';
          } else {
            delete element.dataset['last'];
          }
        }
      }

      // Update right panes
      if (rightPanes) {
        for (const [index, pane] of [...rightPanes].entries()) {
          const element = pane as HTMLElement;
          const isFirst = index === 0;
          const isLast = index === rightPanes.length - 1;

          if (isFirst) {
            element.dataset['first'] = '';
          } else {
            delete element.dataset['first'];
          }

          if (isLast) {
            element.dataset['last'] = '';
          } else {
            delete element.dataset['last'];
          }
        }
      }
    };

    updatePanePositions();

    // Use MutationObserver to detect when visibility changes
    const observer = new MutationObserver(updatePanePositions);
    observer.observe(allotmentRef.current, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [
    allotmentRef,
    isChatOpen,
    isFileTreeOpen,
    isParametersOpen,
    isEditorOpen,
    isExplorerOpen,
    isKernelOpen,
    isConverterOpen,
    isDetailsOpen,
  ]);
}
