import { useEffect, useState } from 'react';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import type { chatTabs } from '#routes/builds_.$id/chat-interface-nav.js';
import { useViewContext } from '#routes/builds_.$id/chat-interface-view-context.js';
/**
 * Minimum panel size constants for the chat interface layout (in pixels)
 * Used for both default sizes and minimum constraints on panes
 */

/** Minimum width for standard side panels (Chat History, Explorer, Parameters, Converter, Git, Details) */
export const panelMinSizeStandard = 200;

/** Minimum width for the Editor panel (larger due to KCL code editing requirements) */
export const panelMinSizeEditor = 400;

/** Minimum width for the Viewer/center panel (main 3D CAD visualization area) */
export const panelMinSizeViewer = 416;

/** Default width for the Viewer/center panel (main 3D CAD visualization area) */
export const panelSizeViewer = 420;

/**
 * Default panel sizes for the chat interface layout (in pixels)
 * Maps to the pane order: [ChatHistory, FileTree, Explorer, Viewer, Parameters, Editor, Converter, Git, Details]
 */
const defaultChatInterfaceSizes = [
  // Left-side panels
  panelMinSizeStandard, // Chat History panel: displays conversation history and file navigation
  panelMinSizeStandard, // File Tree panel: shows project file structure and file management
  panelMinSizeStandard, // Explorer panel: shows 3D model structure and navigation tree
  // Center panel
  panelSizeViewer, // Viewer panel: main 3D CAD visualization and content area
  // Right-side panels
  panelMinSizeStandard, // Parameters panel: LLM and generation parameters configuration
  panelMinSizeStandard, // Editor panel: KCL code editor for design modifications
  panelMinSizeStandard, // Converter panel: file format conversion utilities
  panelMinSizeStandard, // Git panel: version control and git operations
  panelMinSizeStandard, // Details panel: additional object details and metadata
];

export const mobileDrawerSnapPoints: Array<number | string> = [0.7, 1];

export type ChatInterfaceState = {
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
  isConverterOpen: boolean;
  setIsConverterOpen: (value: boolean | ((previous: boolean) => boolean)) => void;
  isGitOpen: boolean;
  setIsGitOpen: (value: boolean | ((previous: boolean) => boolean)) => void;
  isDetailsOpen: boolean;
  setIsDetailsOpen: (value: boolean | ((previous: boolean) => boolean)) => void;

  // Cookie state
  chatResize: number[];
  setChatResize: (value: readonly number[]) => void;
  activeTab: (typeof chatTabs)[number]['id'];
  setActiveTab: (value: (typeof chatTabs)[number]['id']) => void;
  isFullHeightPanel: boolean;
  setIsFullHeightPanel: (value: boolean | ((previous: boolean) => boolean)) => void;

  // Mobile drawer state
  drawerOpen: boolean;
  handleDrawerChange: (value: boolean) => void;
  snapPoints: Array<number | string>;
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- Vaul API
  activeSnapPoint: number | string | null;
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- Vaul API
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
  const [chatResize, setChatResize] = useCookie(cookieName.chatRsInterface, defaultChatInterfaceSizes);
  const [activeTab, setActiveTab] = useCookie<(typeof chatTabs)[number]['id']>(cookieName.chatInterfaceTab, 'chat');
  const [isFullHeightPanel, setIsFullHeightPanel] = useCookie(cookieName.chatInterfaceFullHeight, false);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(activeTab !== 'model');
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- Vaul API
  const [snapPoint, setSnapPoint] = useState<number | string | null>(mobileDrawerSnapPoints[0]!);

  const handleDrawerChange = (value: boolean): void => {
    console.log('handleDrawerChange', value);
    if (!value && activeTab !== 'model') {
      console.log('setting active tab to model');
      setActiveTab('model');
    }

    setDrawerOpen(value);
  };

  const handleTabChange = (value: string): void => {
    console.log('handleTabChange', value);
    setActiveTab(value as (typeof chatTabs)[number]['id']);

    if (!drawerOpen && value !== 'model') {
      // When the drawer is closed and the new tab is not the model tab, open the drawer
      setDrawerOpen(true);
      console.log('opening drawer');
    } else if (drawerOpen && value === 'model') {
      // When the drawer is open and the new tab is the model tab, close the drawer
      setDrawerOpen(false);
      console.log('closing drawer');
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- Vaul API
  const handleSnapChange = (value: number | string | null): void => {
    console.log('handleSnapChange', value);
    setSnapPoint(value);
  };

  const toggleFullHeightPanel = (): void => {
    setIsFullHeightPanel((previous) => !previous);
  };

  return {
    ...viewContext,
    chatResize,
    setChatResize(value) {
      setChatResize(value as number[]);
    },
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

type UsePanePositionObserverOptions = {
  isChatOpen: boolean;
  isFileTreeOpen: boolean;
  isParametersOpen: boolean;
  isEditorOpen: boolean;
  isExplorerOpen: boolean;
  isConverterOpen: boolean;
  isGitOpen: boolean;
  isDetailsOpen: boolean;
};

/**
 * Custom hook to observe and update pane positions for desktop layout
 * Updates position attributes on visible panes for performant CSS selectors
 */
export function usePanePositionObserver(
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- allowable for `ref`
  allotmentRef: React.RefObject<HTMLDivElement | null>,
  options: UsePanePositionObserverOptions,
): void {
  const {
    isChatOpen,
    isFileTreeOpen,
    isParametersOpen,
    isEditorOpen,
    isExplorerOpen,
    isConverterOpen,
    isGitOpen,
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
    isConverterOpen,
    isGitOpen,
    isDetailsOpen,
  ]);
}
