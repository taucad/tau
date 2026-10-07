import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { DockviewApi } from 'dockview-react';
import { LayoutPriority } from 'allotment';
import { Allotment } from '#components/panes/allotment.js';
import { useSelector } from '@xstate/react';
import { ChatHistory } from '#routes/w.$workspace.$project/chat-history.js';
import { ChatHistoryGate, ChatInterfaceSessionGate } from '#routes/w.$workspace.$project/focused-chat-gate.js';
import { ViewerDockview } from '#routes/w.$workspace.$project/chat-viewer-dockview.js';
import { getWorkbenchTabIcon, WorkbenchDockview } from '#routes/w.$workspace.$project/chat-workbench-dockview.js';
import { WorkbenchToggle } from '#routes/w.$workspace.$project/workbench-toggle.js';
import { ProjectUnavailableOverlay } from '#routes/w.$workspace.$project/project-unavailable-overlay.js';
import { ProjectManifestIssueBanner } from '#routes/w.$workspace.$project/project-manifest-issue-banner.js';
import { WorkspaceSkeleton } from '#routes/w.$workspace.$project/workspace-skeleton.js';
import { ChatContextInsertionProvider } from '#components/chat/chat-context-insertion.js';
import { useSidebar } from '#components/ui/sidebar.js';
import { useProject } from '#hooks/use-project.js';
import {
  resolveCompactAuxiliary,
  useProjectWorkspace,
  WorkspaceLanesContext,
} from '#routes/w.$workspace.$project/project-workspace-context.js';
import { panelMinSizeChat, panelMinSizeViewer, panelMinSizeWorkbench } from '#constants/editor.constants.js';
import { cn } from '@taucad/ui/utils/cn';

export const compactWorkspaceWidth = 1120;

/**
 * Reserve the titlebar-controls width in front of the top-left group's tab
 * bar only: a group inside any non-first `.dv-view` sits below or right of
 * another one. A `::before` flex item rather than padding so the tab bar's
 * bottom border, which the children draw, continues under the controls.
 *
 * The inset stops one spacing step short because the chat lane toggle leads
 * the tab bar with `pl-1`: the toggle then lands on the pixel it holds at the
 * head of the chat pane header, which starts at the full controls width.
 */
const topLeftTabBarInset = [
  "[&_.dv-tabs-and-actions-container:not(.dv-view:not(:first-child)_*)]:before:content-['']",
  '[&_.dv-tabs-and-actions-container:not(.dv-view:not(:first-child)_*)]:before:w-[calc(var(--titlebar-controls-width)-var(--spacing))]',
  '[&_.dv-tabs-and-actions-container:not(.dv-view:not(:first-child)_*)]:before:shrink-0',
  '[&_.dv-tabs-and-actions-container:not(.dv-view:not(:first-child)_*)]:before:border-b',
  '[&_.dv-tabs-and-actions-container:not(.dv-view:not(:first-child)_*)]:before:border-b-border',
].join(' ');

export const ChatInterfaceDesktop = memo(function (): React.JSX.Element {
  const { editorRef } = useProject();
  const { open: sidebarOpen } = useSidebar();
  const { setChatOpen, setWorkbenchOpen } = useProjectWorkspace();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState<boolean>();
  const isClient = isCompact !== undefined;
  const [workbenchApi, setWorkbenchApi] = useState<DockviewApi>();
  const isEditorReady = useSelector(editorRef, (state) => state.matches('ready'));
  const desktopLayout = useSelector(editorRef, (state) => state.context.panelState.desktopLayout);
  const compactAuxiliary = isCompact ? resolveCompactAuxiliary(desktopLayout) : undefined;
  const chatVisible = desktopLayout.chatOpen && (!isCompact || compactAuxiliary === 'chat');
  const workbenchVisible = desktopLayout.workbenchOpen && (!isCompact || compactAuxiliary === 'workbench');
  const lanes = useMemo(() => ({ chat: chatVisible, workbench: workbenchVisible }), [chatVisible, workbenchVisible]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    // Resolve the initial lanes before mounting their layout engines. Pixel
    // changes within the same mode must not rerender the workspace subtree.
    let compact = container.getBoundingClientRect().width < compactWorkspaceWidth;
    setIsCompact(compact);
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      const nextCompact = entry.contentRect.width < compactWorkspaceWidth;
      if (nextCompact === compact) {
        return;
      }
      compact = nextCompact;
      // ResizeObserver runs before paint; commit the lane change in that same
      // delivery instead of letting concurrent React show an intermediate mode.
      flushSync(() => {
        setIsCompact(nextCompact);
      });
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
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
      <WorkspaceLanesContext.Provider value={lanes}>
        <div
          ref={containerRef}
          className='relative size-full overflow-hidden bg-background'
          data-project-workspace
          data-compact={isCompact}
        >
          {isClient && isEditorReady ? (
            <div className='absolute top-1 right-1 z-10 flex gap-1'>
              <WorkbenchToggle
                isOpen={workbenchVisible}
                api={workbenchApi}
                getIcon={getWorkbenchTabIcon}
                onOpenChange={setWorkbenchOpen}
              />
            </div>
          ) : null}
          {/* Until the editor state has loaded and the focused chat exists, the
              lanes stand in at their default widths rather than a blank page. */}
          <ChatInterfaceSessionGate fallback={<WorkspaceSkeleton />}>
            {isClient && isEditorReady ? (
              <Allotment
                paneLabels={['Chat', 'Viewer', 'Workbench']}
                separator={false}
                proportionalLayout={false}
                /* The lanes land rather than snap in: the skeleton they replace holds the same
                   background, so a short fade reads as the workspace resolving (soft land). */
                className='size-full animate-in duration-200 fade-in-50 motion-reduce:animate-none [&_.split-view-view:not(:last-child)]:border-r [&_.split-view-view:not(:last-child)]:border-border'
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
                      /* The chat lane toggle leads the header on the pixel it holds at the head of the
                         viewer's tab bar while the lane is closed: one step in from the lane's edge, or
                         straight after the host's controls. */
                      className={cn(
                        sidebarOpen
                          ? '[&>[data-slot=floating-panel-content]>[data-slot=floating-panel-content-header]]:pl-1'
                          : '[&>[data-slot=floating-panel-content]>[data-slot=floating-panel-content-header]]:pl-(--titlebar-controls-width) [&>[data-slot=floating-panel-content]>[data-slot=floating-panel-content-header]]:[app-region:no-drag]',
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
                    <ProjectManifestIssueBanner />
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
                  <WorkbenchDockview onApiChange={setWorkbenchApi} />
                </Allotment.Pane>
              </Allotment>
            ) : (
              <WorkspaceSkeleton />
            )}
          </ChatInterfaceSessionGate>
        </div>
      </WorkspaceLanesContext.Provider>
    </ChatContextInsertionProvider>
  );
});
