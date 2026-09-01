import { memo, useRef, useState, useEffect } from 'react';
import type { AllotmentHandle } from 'allotment';
import { Allotment, LayoutPriority } from 'allotment';
import { ChatHistory, ChatHistoryTrigger } from '#routes/projects_.$id/chat-history.js';
import { ChatHistoryGate, ChatInterfaceSessionGate } from '#routes/projects_.$id/focused-chat-gate.js';
import { ChatFileTree, ChatFileTreeTrigger } from '#routes/projects_.$id/chat-file-tree.js';
import { ChatParameters, ChatParametersTrigger } from '#routes/projects_.$id/chat-parameters.js';
import { ViewerDockview } from '#routes/projects_.$id/chat-viewer-dockview.js';
import { ChatEditorLayout, ChatEditorLayoutTrigger } from '#routes/projects_.$id/chat-editor-layout.js';
import { ChatExplorerTree, ChatExplorerTrigger } from '#routes/projects_.$id/chat-explorer.js';
import { ChatKernel, ChatKernelTrigger } from '#routes/projects_.$id/chat-kernel.js';
import { ChatDetails, ChatDetailsTrigger } from '#routes/projects_.$id/chat-details.js';
import { ChatConverter, ChatConverterTrigger } from '#routes/projects_.$id/chat-converter.js';
import { ProjectUnavailableOverlay } from '#routes/projects_.$id/project-unavailable-overlay.js';
import { cn } from '#utils/ui.utils.js';
import { SidebarOffset } from '#components/layout/sidebar-offset.js';
import { useChatInterfaceState, usePanePositionObserver } from '#routes/projects_.$id/use-chat-interface-state.js';
import { useFeature } from '#flags/use-feature.js';
import {
  allotmentPanelOrder,
  panelMinSizeStandard,
  panelMinSizeEditor,
  panelMinSizeViewer,
  panelMinSizeChat,
} from '#constants/editor.constants.js';
import type { PanelId } from '#constants/editor.constants.js';

// oxlint-disable-next-line complexity -- coordinates many independent panels; extracted hooks still share one render
export const ChatInterfaceDesktop = memo(function (): React.JSX.Element {
  const {
    isEditorReady,
    isChatOpen,
    setIsChatOpen,
    isFileTreeOpen,
    setIsFileTreeOpen,
    isParametersOpen,
    setIsParametersOpen,
    isEditorOpen,
    setIsEditorOpen,
    isExplorerOpen,
    setIsExplorerOpen,
    isKernelOpen,
    setIsKernelOpen,
    isConverterOpen,
    setIsConverterOpen,
    isDetailsOpen,
    setIsDetailsOpen,
    panelSizes,
    setChatResize,
  } = useChatInterfaceState();

  const isTauDebugEnabled = useFeature('tauDebug');
  const isExplorerPaneVisible = isTauDebugEnabled && isExplorerOpen;
  const isKernelPaneVisible = isTauDebugEnabled && isKernelOpen;

  const allotmentRef = useRef<HTMLDivElement>(null);
  const allotmentInstanceRef = useRef<AllotmentHandle>(null);
  const [isClient, setIsClient] = useState(false);
  const [isLayoutReady, setIsLayoutReady] = useState(false);

  // Set isClient to true after hydration to avoid SSR mismatch
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Determine if any left/right panels are open for center pane edge treatment
  const isAnyLeftPanelOpen = isChatOpen || isFileTreeOpen || isExplorerPaneVisible || isKernelPaneVisible;
  const isAnyRightPanelOpen = isParametersOpen || isEditorOpen || isConverterOpen || isDetailsOpen;

  // Map panel IDs to their visibility states
  // Viewer is always visible, toggleable panes use their respective state
  const panelVisibility: Record<PanelId, boolean> = {
    chat: isChatOpen,
    files: isFileTreeOpen,
    explorer: isExplorerPaneVisible,
    kernel: isKernelPaneVisible,
    viewer: true, // Always visible
    parameters: isParametersOpen,
    editor: isEditorOpen,
    converter: isConverterOpen,
    details: isDetailsOpen,
  };

  // Apply saved panel sizes after Allotment has completed its initial layout.
  // We must call resize() with sizes that sum to the container width, otherwise
  // Allotment will redistribute the difference to visible panes.
  // The viewer (center panel) absorbs any extra space beyond the saved sizes.
  useEffect(() => {
    if (!isClient || !isEditorReady) {
      setIsLayoutReady(false);
      return;
    }

    let cancelled = false;

    // Use double-rAF pattern to ensure Allotment is fully initialized:
    // - Frame 1: React commits DOM, Allotment starts initializing its views
    // - Frame 2: Allotment's viewItems are fully populated, safe to call resize()
    requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }

      requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }

        if (!allotmentInstanceRef.current || !allotmentRef.current) {
          setIsLayoutReady(true);
          return;
        }

        // Get container width to ensure sizes sum correctly
        const containerWidth = allotmentRef.current.offsetWidth;

        // Build sizes array: visible panes get their saved size, invisible get 0
        let visibleSizesSum = 0;
        const sizesArray = allotmentPanelOrder.map((panelId) => {
          if (panelVisibility[panelId]) {
            visibleSizesSum += panelSizes[panelId];
            return panelSizes[panelId];
          }

          return 0;
        });

        // Calculate extra space and add it to the viewer so sizes sum to container width.
        // This prevents Allotment from redistributing extra space to other panes.
        const extraSpace = containerWidth - visibleSizesSum;
        const viewerIndex = allotmentPanelOrder.indexOf('viewer');
        if (extraSpace > 0 && viewerIndex !== -1) {
          sizesArray[viewerIndex] = (sizesArray[viewerIndex] ?? 0) + extraSpace;
        }

        allotmentInstanceRef.current.resize(sizesArray);
        setIsLayoutReady(true);
      });
    });

    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- panelVisibility is derived from visibility states
  }, [
    isClient,
    isEditorReady,
    panelSizes,
    isChatOpen,
    isFileTreeOpen,
    isExplorerPaneVisible,
    isKernelPaneVisible,
    isParametersOpen,
    isEditorOpen,
    isConverterOpen,
    isDetailsOpen,
  ]);

  // Update position attributes on visible panes for performant CSS selectors
  // Only run when the actual Allotment is rendered (client-side and editor ready)
  usePanePositionObserver(isClient && isEditorReady ? allotmentRef : { current: null }, {
    isChatOpen,
    isFileTreeOpen,
    isParametersOpen,
    isEditorOpen,
    isExplorerOpen: isExplorerPaneVisible,
    isKernelOpen: isKernelPaneVisible,
    isConverterOpen,
    isDetailsOpen,
  });

  // Return placeholder during SSR or while editor state is loading from IndexedDB
  // This ensures preferredSize props receive the correct saved panel sizes on mount
  if (!isClient || !isEditorReady) {
    return <div className='hidden size-full md:flex' />;
  }

  // Use inline style for opacity to ensure it's applied immediately without CSS transition issues
  // CSS transitions on newly mounted elements can cause a flash because the browser may render
  // the element at full opacity before applying the transition to the target opacity.
  const opacityValue = isLayoutReady ? 1 : 0;

  return (
    <ChatInterfaceSessionGate fallback={<div className='hidden size-full md:flex' />}>
      <div
        ref={allotmentRef}
        className='size-full'
        style={{ opacity: opacityValue, transition: isLayoutReady ? 'opacity 150ms' : 'none' }}
      >
        <SidebarOffset asChild via='padding'>
          <Allotment
            ref={allotmentInstanceRef}
            separator={false}
            proportionalLayout={false}
            className={cn(
              'size-full',

              // Pad the sash container to the top of the header height.
              'pt-(--header-height)',
              'pb-2',

              // Set the height of the sash to the height of the content.
              '[&_.sash.sash-vertical:before]:h-[calc(100dvh-var(--header-height)-var(--spacing)*2)]!',

              // ── Sash (resize handles) — match Dockview primary-on-hover styling ──
              '[--focus-border:var(--primary)]',
              '[--sash-hover-transition-duration:0.1s]',
              '[&_.sash:before]:[transition-delay:0.5s]',

              // Apply top+bottom border to the floating panels.
              '**:data-[slot=floating-panel]:border-y',

              // Left side: First pane styling
              '[&_.rs-left.split-view-view-visible[data-first]]:pl-2',
              '[&_.rs-left.split-view-view-visible[data-first]_[data-slot=floating-panel]]:rounded-l-md',

              // Left side: Last pane styling
              '[&_.rs-left.split-view-view-visible[data-last]_[data-slot=floating-panel]]:rounded-r-none',
              '[&_.rs-left.split-view-view-visible[data-last]_[data-slot=floating-panel]]:border-r',

              // Left side: All visible panes get left border
              '[&_.rs-left.split-view-view-visible_[data-slot=floating-panel]]:border-l',

              // Right side: First pane styling (leftmost visually)
              '[&_.rs-right.split-view-view-visible[data-first]_[data-slot=floating-panel]]:rounded-l-none',
              '[&_.rs-right.split-view-view-visible[data-first]_[data-slot=floating-panel]]:border-l',

              // Right side: Last pane styling (rightmost visually, needs right padding)
              '[&_.rs-right.split-view-view-visible[data-last]]:pr-2',
              '[&_.rs-right.split-view-view-visible[data-last]_[data-slot=floating-panel]]:rounded-r-md',

              // Right side: All visible panes get right border
              '[&_.rs-right.split-view-view-visible_[data-slot=floating-panel]]:border-r',

              // Allow the viewer to appear behind the floating panels.
              '[&_.split-view-view]:overflow-visible!',
            )}
            onDragEnd={(sizes) => {
              setChatResize(sizes);
            }}
          >
            {/* Left panels - Low priority so they keep their preferred size */}
            <Allotment.Pane
              className='rs-left z-10'
              minSize={panelMinSizeChat}
              preferredSize={panelSizes.chat}
              priority={LayoutPriority.Low}
              visible={isChatOpen}
            >
              <ChatHistoryGate>
                <ChatHistory isExpanded={isChatOpen} setIsExpanded={setIsChatOpen} />
              </ChatHistoryGate>
            </Allotment.Pane>

            <Allotment.Pane
              className='rs-left z-10'
              minSize={panelMinSizeStandard}
              preferredSize={panelSizes.files}
              priority={LayoutPriority.Low}
              visible={isFileTreeOpen}
            >
              <ChatFileTree isExpanded={isFileTreeOpen} setIsExpanded={setIsFileTreeOpen} />
            </Allotment.Pane>

            <Allotment.Pane
              className='rs-left z-10'
              minSize={panelMinSizeStandard}
              preferredSize={panelSizes.explorer}
              priority={LayoutPriority.Low}
              visible={isExplorerPaneVisible}
            >
              <ChatExplorerTree isExpanded={isExplorerPaneVisible} setIsExpanded={setIsExplorerOpen} />
            </Allotment.Pane>

            <Allotment.Pane
              className='rs-left z-10'
              minSize={panelMinSizeStandard}
              preferredSize={panelSizes.kernel}
              priority={LayoutPriority.Low}
              visible={isKernelPaneVisible}
            >
              <ChatKernel isExpanded={isKernelPaneVisible} setIsExpanded={setIsKernelOpen} />
            </Allotment.Pane>

            {/* Center viewer - High priority so it absorbs all extra space from collapsed panels */}
            <Allotment.Pane
              className='rs-center'
              minSize={panelMinSizeViewer}
              preferredSize={panelSizes.viewer}
              priority={LayoutPriority.High}
            >
              {/* Top-left Content */}
              <div className={cn('absolute top-10 z-10 flex flex-col gap-2', isAnyLeftPanelOpen ? 'left-2' : 'left-4')}>
                <ChatHistoryTrigger
                  isOpen={isChatOpen}
                  onToggle={() => {
                    setIsChatOpen((previous) => !previous);
                  }}
                />
                <ChatFileTreeTrigger
                  isOpen={isFileTreeOpen}
                  onToggle={() => {
                    setIsFileTreeOpen((previous) => !previous);
                  }}
                />
                {isTauDebugEnabled ? (
                  <>
                    <ChatExplorerTrigger
                      isOpen={isExplorerOpen}
                      onToggle={() => {
                        setIsExplorerOpen((previous) => !previous);
                      }}
                    />
                    <ChatKernelTrigger
                      isOpen={isKernelOpen}
                      onToggle={() => {
                        setIsKernelOpen((previous) => !previous);
                      }}
                    />
                  </>
                ) : null}
              </div>

              {/* Top-right Content - positioned above gizmo */}
              <div
                className={cn(
                  'absolute top-10 z-20 flex flex-col gap-2 overflow-hidden!',
                  isAnyRightPanelOpen ? 'right-2' : 'right-4',
                )}
              >
                <ChatParametersTrigger
                  isOpen={isParametersOpen}
                  onToggle={() => {
                    setIsParametersOpen((previous) => !previous);
                  }}
                />
                <ChatEditorLayoutTrigger
                  isOpen={isEditorOpen}
                  onToggle={() => {
                    setIsEditorOpen((previous) => !previous);
                  }}
                />
                <ChatConverterTrigger
                  isOpen={isConverterOpen}
                  onToggle={() => {
                    setIsConverterOpen((previous) => !previous);
                  }}
                />
                <ChatDetailsTrigger
                  isOpen={isDetailsOpen}
                  onToggle={() => {
                    setIsDetailsOpen((previous) => !previous);
                  }}
                />
              </div>

              {/* Viewer - DockviewReact manages tabs, splits, and per-view overlays */}
              <div
                className={cn(
                  'absolute inset-y-0 overflow-hidden border-y',
                  isAnyLeftPanelOpen ? 'left-0' : 'left-2 rounded-l-md border-l',
                  isAnyRightPanelOpen ? 'right-0' : 'right-2 rounded-r-md border-r',
                )}
              >
                <ViewerDockview />
              </div>

              {/* Renders ProjectNotFound / FileManagerError / WorkspaceUnavailableRecovery
                depending on which gate has failed. See Audit R8 for rationale. */}
              <ProjectUnavailableOverlay />
            </Allotment.Pane>

            {/* Right panels - Low priority so they keep their preferred size */}
            <Allotment.Pane
              className='rs-right'
              minSize={panelMinSizeStandard}
              preferredSize={panelSizes.parameters}
              priority={LayoutPriority.Low}
              visible={isParametersOpen}
            >
              <ChatParameters isExpanded={isParametersOpen} setIsExpanded={setIsParametersOpen} />
            </Allotment.Pane>

            <Allotment.Pane
              className='rs-right'
              minSize={panelMinSizeEditor}
              preferredSize={panelSizes.editor}
              priority={LayoutPriority.Low}
              visible={isEditorOpen}
            >
              <ChatEditorLayout isExpanded={isEditorOpen} setIsExpanded={setIsEditorOpen} />
            </Allotment.Pane>

            <Allotment.Pane
              className='rs-right'
              minSize={panelMinSizeStandard}
              preferredSize={panelSizes.converter}
              priority={LayoutPriority.Low}
              visible={isConverterOpen}
            >
              <ChatConverter isExpanded={isConverterOpen} setIsExpanded={setIsConverterOpen} />
            </Allotment.Pane>

            <Allotment.Pane
              className='rs-right'
              minSize={panelMinSizeStandard}
              preferredSize={panelSizes.details}
              priority={LayoutPriority.Low}
              visible={isDetailsOpen}
            >
              <ChatDetails isExpanded={isDetailsOpen} setIsExpanded={setIsDetailsOpen} />
            </Allotment.Pane>
          </Allotment>
        </SidebarOffset>
      </div>
    </ChatInterfaceSessionGate>
  );
});
