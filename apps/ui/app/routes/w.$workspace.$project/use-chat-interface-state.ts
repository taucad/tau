import { useEffect, useRef, useState, useCallback } from 'react';
import { useSelector } from '@xstate/react';
import type { PaneviewApi } from 'dockview-react';
import { useProject } from '#hooks/use-project.js';
import { mobileDrawerOpenSnapPoint, mobileDrawerSnapPoints, mobilePanelIds } from '#constants/editor.constants.js';
import type { MobilePanelId } from '#constants/editor.constants.js';
import type { PaneviewPanelState, PanelState } from '#types/editor.types.js';
import { isSurfaceShipped } from '#workbench-records/surface-availability.js';

export type ChatInterfaceState = {
  // Loading state
  /** Whether the editor state has been loaded from storage (ready for rendering) */
  isEditorReady: boolean;

  activeTab: MobilePanelId;
  setActiveTab: (value: MobilePanelId) => void;
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

/** Vaul's close transition, after which it resets to its first snap point (with margin). Milliseconds. */
const vaulCloseResetMilliseconds = 700;

/**
 * Custom hook to manage chat interface state
 * Extracted from chat-interface.tsx to improve maintainability
 */
export function useChatInterfaceState(): ChatInterfaceState {
  'use no memo';

  const { editorRef } = useProject();

  // Defer the mobile drawer until its persisted active surface is available.
  const isEditorReady = useSelector(editorRef, (state) => state.matches('ready'));

  const mobileActiveTab = useSelector(editorRef, (state) => state.context.panelState.mobileActiveTab);

  // A surface persisted by a build that no longer has it falls back to the model rather than an empty sheet.
  const activeTab: MobilePanelId =
    (mobilePanelIds as readonly string[]).includes(mobileActiveTab) && isSurfaceShipped(mobileActiveTab)
      ? mobileActiveTab
      : 'viewer';

  const setActiveTab = useCallback(
    (value: MobilePanelId) => {
      editorRef.send({ type: 'setPanelState', panelState: { mobileActiveTab: value } });
    },
    [editorRef],
  );

  /* The drawer is open exactly while a panel other than the model is active. Deriving it keeps the
   * two from drifting apart: a separate flag seeded at mount stayed open on an empty panel when the
   * persisted Viewer surface was hydrated after the route mounted, and the Model tab could not close
   * it because selecting the already active tab is not a change. */
  const drawerOpen = activeTab !== 'viewer';
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Vaul API
  const [snapPoint, setSnapPoint] = useState<number | string | null>(
    activeTab === 'editor' ? 1 : mobileDrawerOpenSnapPoint,
  );
  const [previousTab, setPreviousTab] = useState(activeTab);

  /* Every collapse, whichever action caused it, returns the drawer to half height, so the next panel never reopens
   * over the whole viewer. A file opens at full height (WB-07). */
  if (previousTab !== activeTab) {
    setPreviousTab(activeTab);
    if (activeTab === 'editor') {
      setSnapPoint(1);
    } else if (previousTab === 'viewer' || activeTab === 'viewer') {
      setSnapPoint(mobileDrawerOpenSnapPoint);
    }
  }

  /* Vaul returns to its first snap point 500ms after a close it makes (a drag down, Escape, Close). The hook owns the
   * height a surface reopens at, so such a close arms a one-shot guard that drops that one reset, whether it lands while
   * closed or after a quick reopen. An app-driven close (the Model destination) goes through vaul's controlled `open`
   * and arms nothing. The guard lapses after the reset's window, so a skipped reset never swallows a later move. */
  const vaulResetDeadlineRef = useRef(Number.NEGATIVE_INFINITY);
  const handleDrawerChange = useCallback(
    (value: boolean): void => {
      if (!value) {
        vaulResetDeadlineRef.current = performance.now() + vaulCloseResetMilliseconds;
        setActiveTab('viewer');
      }
    },
    [setActiveTab],
  );

  const handleTabChange = useCallback(
    (value: string): void => {
      setActiveTab(value as MobilePanelId);
    },
    [setActiveTab],
  );

  // A snap change while closed has nothing to move.
  const isOpenRef = useRef(drawerOpen);
  useEffect(() => {
    isOpenRef.current = drawerOpen;
  }, [drawerOpen]);

  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Vaul API
  const handleSnapChange = useCallback((value: number | string | null): void => {
    if (value === mobileDrawerSnapPoints[0] && performance.now() < vaulResetDeadlineRef.current) {
      vaulResetDeadlineRef.current = Number.NEGATIVE_INFINITY;
      return;
    }
    if (!isOpenRef.current) {
      return;
    }
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
