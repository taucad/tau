import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Allotment, LayoutPriority } from 'allotment';
import { useSelector } from '@xstate/react';
import { ChatHistory } from '#routes/w.$workspace.$project/chat-history.js';
import { ChatHistoryGate, ChatInterfaceSessionGate } from '#routes/w.$workspace.$project/focused-chat-gate.js';
import { ViewerDockview } from '#routes/w.$workspace.$project/chat-viewer-dockview.js';
import { WorkbenchDockview } from '#routes/w.$workspace.$project/chat-workbench-dockview.js';
import { WorkbenchToggle } from '#routes/w.$workspace.$project/project-workspace-actions.js';
import { ProjectUnavailableOverlay } from '#routes/w.$workspace.$project/project-unavailable-overlay.js';
import { WorkspaceSkeleton } from '#routes/w.$workspace.$project/workspace-skeleton.js';
import { ChatContextInsertionProvider } from '#components/chat/chat-context-insertion.js';
import { useSidebar } from '#components/ui/sidebar.js';
import { useProject } from '#hooks/use-project.js';
import { useResizeObserver } from '#hooks/use-resize-observer.js';
import {
  resolveCompactAuxiliary,
  useProjectWorkspace,
} from '#routes/w.$workspace.$project/project-workspace-context.js';
import { panelMinSizeChat, panelMinSizeViewer, panelMinSizeWorkbench } from '#constants/editor.constants.js';
import { cn } from '@taucad/ui/utils/cn';

export const compactWorkspaceWidth = 1120;

/**
 * Reserve the titlebar-controls width in front of the top-left group's tab
 * bar only: a group inside any non-first `.dv-view` sits below or right of
 * another one. A `::before` flex item rather than padding so the tab bar's
 * bottom border, which the children draw, continues under the controls.
 */
const topLeftTabBarInset = [
  "[&_.dv-tabs-and-actions-container:not(.dv-view:not(:first-child)_*)]:before:content-['']",
  '[&_.dv-tabs-and-actions-container:not(.dv-view:not(:first-child)_*)]:before:w-(--titlebar-controls-width)',
  '[&_.dv-tabs-and-actions-container:not(.dv-view:not(:first-child)_*)]:before:shrink-0',
  '[&_.dv-tabs-and-actions-container:not(.dv-view:not(:first-child)_*)]:before:border-b',
  '[&_.dv-tabs-and-actions-container:not(.dv-view:not(:first-child)_*)]:before:border-b-border',
].join(' ');

export const ChatInterfaceDesktop = memo(function (): React.JSX.Element {
  const { editorRef } = useProject();
  const { open: sidebarOpen } = useSidebar();
  const { setChatOpen, setWorkbenchOpen } = useProjectWorkspace();
  const containerRef = useRef<HTMLDivElement>(null);
  const { width } = useResizeObserver({ ref: containerRef });
  const [isClient, setIsClient] = useState(false);
  const isEditorReady = useSelector(editorRef, (state) => state.matches('ready'));
  const desktopLayout = useSelector(editorRef, (state) => state.context.panelState.desktopLayout);
  const isCompact = width !== undefined && width < compactWorkspaceWidth;
  const compactAuxiliary = isCompact ? resolveCompactAuxiliary(desktopLayout) : undefined;
  const chatVisible = desktopLayout.chatOpen && (!isCompact || compactAuxiliary === 'chat');
  const workbenchVisible = desktopLayout.workbenchOpen && (!isCompact || compactAuxiliary === 'workbench');

  useEffect(() => {
    queueMicrotask(() => {
      setIsClient(true);
    });
  }, []);

  const persistWidths = useCallback(
    (sizes: readonly number[]) => {
      const chatWidth = sizes[0];
      const workbenchWidth = sizes[2];
      editorRef.send({
        type: 'setPanelState',
        panelState: {
          desktopLayout: {
            ...(chatWidth !== undefined && chatWidth > 0 ? { chatWidth } : {}),
            ...(workbenchWidth !== undefined && workbenchWidth > 0 ? { workbenchWidth } : {}),
          },
        },
      });
    },
    [editorRef],
  );

  return (
    <ChatContextInsertionProvider>
      <div
        ref={containerRef}
        className='relative size-full overflow-hidden bg-background'
        data-project-workspace
        data-compact={isCompact}
      >
        {isClient && isEditorReady ? (
          <div className='absolute top-1 right-1 z-10 flex gap-1'>
            <WorkbenchToggle isOpen={workbenchVisible} onOpenChange={setWorkbenchOpen} />
          </div>
        ) : null}
        {/* Until the editor state has loaded and the focused chat exists, the
            lanes stand in at their default widths rather than a blank page. */}
        <ChatInterfaceSessionGate fallback={<WorkspaceSkeleton />}>
          {isClient && isEditorReady ? (
            <Allotment
              separator={false}
              proportionalLayout={false}
              /* The lanes land rather than snap in: the skeleton they replace holds the same
                 background, so a short fade reads as the workspace resolving (soft land). */
              className='size-full animate-in duration-200 fade-in-50 [--focus-border:var(--primary)] [--sash-hover-transition-duration:0.1s] motion-reduce:animate-none [&_.sash:before]:[transition-delay:0.5s] [&_.split-view-view:not(:last-child)]:border-r [&_.split-view-view:not(:last-child)]:border-border'
              onDragEnd={persistWidths}
            >
              <Allotment.Pane
                key='chat'
                minSize={panelMinSizeChat}
                preferredSize={desktopLayout.chatWidth}
                priority={LayoutPriority.Low}
                visible={chatVisible}
              >
                <ChatHistoryGate>
                  <ChatHistory
                    className={cn(
                      !sidebarOpen &&
                        '[&>[data-slot=floating-panel-content]>[data-slot=floating-panel-content-header]]:pl-(--titlebar-controls-width) [&>[data-slot=floating-panel-content]>[data-slot=floating-panel-content-header]]:[app-region:no-drag]',
                    )}
                    isExpanded={desktopLayout.chatOpen}
                    setIsExpanded={(value) => {
                      setChatOpen(typeof value === 'function' ? value(desktopLayout.chatOpen) : value);
                    }}
                  />
                </ChatHistoryGate>
              </Allotment.Pane>

              <Allotment.Pane key='viewer' minSize={panelMinSizeViewer} priority={LayoutPriority.High}>
                <div
                  className={cn(
                    '@container/viewer relative size-full overflow-hidden',
                    !sidebarOpen && !chatVisible && topLeftTabBarInset,
                  )}
                >
                  <ViewerDockview />
                  <ProjectUnavailableOverlay />
                </div>
              </Allotment.Pane>

              <Allotment.Pane
                key='workbench'
                minSize={panelMinSizeWorkbench}
                preferredSize={desktopLayout.workbenchWidth}
                priority={LayoutPriority.Low}
                visible={workbenchVisible}
              >
                <WorkbenchDockview />
              </Allotment.Pane>
            </Allotment>
          ) : (
            <WorkspaceSkeleton />
          )}
        </ChatInterfaceSessionGate>
      </div>
    </ChatContextInsertionProvider>
  );
});
