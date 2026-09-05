import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Allotment, LayoutPriority } from 'allotment';
import { useSelector } from '@xstate/react';
import { ChatHistory } from '#routes/w.$workspace.$project/chat-history.js';
import { ChatHistoryGate, ChatInterfaceSessionGate } from '#routes/w.$workspace.$project/focused-chat-gate.js';
import { ViewerDockview } from '#routes/w.$workspace.$project/chat-viewer-dockview.js';
import { WorkbenchDockview } from '#routes/w.$workspace.$project/chat-workbench-dockview.js';
import { WorkbenchToggle } from '#routes/w.$workspace.$project/project-workspace-actions.js';
import { ProjectUnavailableOverlay } from '#routes/w.$workspace.$project/project-unavailable-overlay.js';
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
        <ChatInterfaceSessionGate fallback={<div className='size-full' />}>
          {isClient && isEditorReady ? (
            <Allotment
              separator={false}
              proportionalLayout={false}
              className='size-full [--focus-border:var(--primary)] [--sash-hover-transition-duration:0.1s] [&_.sash:before]:[transition-delay:0.5s] [&_.split-view-view:not(:last-child)]:border-r [&_.split-view-view:not(:last-child)]:border-border'
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
                    !sidebarOpen && !chatVisible && '[&_.dv-tabs-and-actions-container]:pl-(--titlebar-controls-width)',
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
          ) : null}
        </ChatInterfaceSessionGate>
      </div>
    </ChatContextInsertionProvider>
  );
});
