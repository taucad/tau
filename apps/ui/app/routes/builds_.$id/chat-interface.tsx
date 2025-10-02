import { memo, useRef, useMemo } from 'react';
import { ChatHistory, ChatHistoryTrigger } from '#routes/builds_.$id/chat-history.js';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '#components/ui/resizable.js';
import { ChatParameters, ChatParametersTrigger } from '#routes/builds_.$id/chat-parameters.js';
import { useViewContext } from '#routes/builds_.$id/chat-interface-controls.js';
import { cookieName } from '#constants/cookie.constants.js';
import { ChatViewer } from '#routes/builds_.$id/chat-viewer.js';
import { ChatEditorLayout, ChatEditorLayoutTrigger } from '#routes/builds_.$id/chat-editor-layout.js';
import { SettingsControl } from '#components/geometry/cad/settings-control.js';
import { ChatViewerStatus } from '#routes/builds_.$id/chat-viewer-status.js';
import { ChatViewerControls } from '#routes/builds_.$id/chat-viewer-controls.js';
import { ChatStackTrace } from '#routes/builds_.$id/chat-stack-trace.js';
import { ChatExplorerTree, ChatExplorerTrigger } from '#routes/builds_.$id/chat-editor-explorer.js';
import { ChatEditorDetails, ChatEditorDetailsTrigger } from '#routes/builds_.$id/chat-editor-details.js';
import { cn } from '#utils/ui.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useResizeObserver } from '#hooks/use-resize-observer.js';

/**
 * The spacing/gap between the panels in pixels.
 */
const spacing = 8;

export const ChatInterface = memo(function (): React.JSX.Element {
  const { isChatOpen, toggleChatOpen, isParametersOpen, toggleParametersOpen, isEditorOpen, toggleEditorOpen, isExplorerOpen, toggleExplorerOpen, isDetailsOpen, toggleDetailsOpen } = useViewContext();
  const [chatResizeLeft, setChatResizeLeft] = useCookie(cookieName.chatRsLeft, [30, 20, 50]);
  const [chatResizeRight, setChatResizeRight] = useCookie(cookieName.chatRsRight, [50, 30, 20, 0]);

  // Refs for each individual panel
  const historyPanelRef = useRef<HTMLDivElement>(null);
  const explorerPanelRef = useRef<HTMLDivElement>(null);
  const parametersPanelRef = useRef<HTMLDivElement>(null);
  const editorPanelRef = useRef<HTMLDivElement>(null);
  const detailsPanelRef = useRef<HTMLDivElement>(null);

  // Track width of each panel
  const historySize = useResizeObserver({ ref: historyPanelRef as React.RefObject<HTMLElement> });
  const explorerSize = useResizeObserver({ ref: explorerPanelRef as React.RefObject<HTMLElement> });
  const parametersSize = useResizeObserver({ ref: parametersPanelRef as React.RefObject<HTMLElement> });
  const editorSize = useResizeObserver({ ref: editorPanelRef as React.RefObject<HTMLElement> });
  const detailsSize = useResizeObserver({ ref: detailsPanelRef as React.RefObject<HTMLElement> });

  // Calculate total widths for each side
  const leftPanelWidth = useMemo(() => {
    const historyWidth = isChatOpen ? (historySize.width ?? 0) + spacing : 0;
    const explorerWidth = isExplorerOpen ? (explorerSize.width ?? 0) + spacing : 0;
    return historyWidth + explorerWidth;
  }, [historySize.width, explorerSize.width, isChatOpen, isExplorerOpen]);

  const rightPanelWidth = useMemo(() => {
    const parametersWidth = isParametersOpen ? (parametersSize.width ?? 0) + spacing : 0;
    const editorWidth = isEditorOpen ? (editorSize.width ?? 0) + spacing : 0;
    const detailsWidth = isDetailsOpen ? (detailsSize.width ?? 0) + spacing : 0;
    return parametersWidth + editorWidth + detailsWidth;
  }, [parametersSize.width, editorSize.width, detailsSize.width, isParametersOpen, isEditorOpen, isDetailsOpen]);

  return (
    <div
      className="group/chat-layout relative size-full flex flex-col"
      style={
        {
          '--left-panel-size': `${leftPanelWidth}px`,
          '--right-panel-size': `${rightPanelWidth}px`,
        } as React.CSSProperties
      }
    >
      {/* Viewer - inset completely to occupy the background fully */}
      {/* The calculation is to center the viewer within the container */}
      <div className="absolute inset-0 h-full w-full left-1/2 -translate-x-[calc((100%-var(--sidebar-width-current)+var(--right-panel-size)-var(--left-panel-size))/2)] transition-all duration-200 ease-in-out">
        <ChatViewer />
      </div>

      {/* Left-side ResizablePanelGroup */}
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId={cookieName.chatRsLeft}
        className="absolute gap-1 top-(--header-height) left-2 md:left-(--sidebar-width-current) h-[calc(100dvh-(--spacing(14)))]! w-[50%]! md:w-[calc(50%-0.25rem)]! transition-all duration-200 ease-linear overflow-visible! pointer-events-none"
        onLayout={setChatResizeLeft}
      >
        <ResizablePanel style={{ ...(!isChatOpen ? { display: 'none' } : {}) }} order={1} id="history" minSize={25} defaultSize={chatResizeLeft[0]} className='pointer-events-auto overflow-visible!'>
          <div ref={historyPanelRef} className="size-full">
            <ChatHistory />
          </div>
        </ResizablePanel>

        <ResizableHandle variant='floating' className={cn(isChatOpen ? 'hover:after:opacity-100' : 'hidden')} />

        <ResizablePanel style={{ ...(!isExplorerOpen ? { display: 'none' } : {}) }} order={2} id="object-tree" minSize={20} maxSize={30} defaultSize={chatResizeLeft[1]} className='pointer-events-auto overflow-visible!'>
          <div ref={explorerPanelRef} className="size-full">
            <ChatExplorerTree />
          </div>
        </ResizablePanel>

        <ResizableHandle variant='floating' className={cn(isExplorerOpen ? 'hover:after:opacity-100' : 'hidden')} />

        <ResizablePanel order={3} id="spacer" defaultSize={chatResizeLeft[2]} minSize={0} className='relative overflow-visible!'>
          {/* Top-left Content */}
          <div className='absolute top-0 left-0 flex flex-col gap-2 pointer-events-auto'>
            <ChatHistoryTrigger
              isOpen={isChatOpen}
              onToggle={toggleChatOpen}
            />
            <ChatExplorerTrigger
              isOpen={isExplorerOpen}
              onToggle={toggleExplorerOpen}
            />
          </div>

          {/* Bottom-left Content */}
          <div className='absolute bottom-0 left-0 flex flex-col gap-2 pointer-events-auto'>
            <ChatStackTrace />
            <ChatViewerControls />
          </div>

        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Right-side ResizablePanelGroup */}
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId={cookieName.chatRsRight}
        className="absolute gap-1 top-(--header-height) right-2 h-[calc(100dvh-(--spacing(14)))]! w-[50%]! md:w-[calc(50%-0.25rem)]! transition-all duration-200 ease-linear overflow-visible! pointer-events-none"
        onLayout={setChatResizeRight}
      >
        {/* Spacer panel for open buttons */}
        <ResizablePanel order={1} id="spacer-right" defaultSize={chatResizeRight[0]} minSize={0} className='relative overflow-visible!'>
          {/* Top-right Content */}
          <div className='absolute top-0 right-0 flex flex-col gap-2 pointer-events-auto'>
            <SettingsControl />
            <ChatParametersTrigger
              isOpen={isParametersOpen}
              onToggle={toggleParametersOpen}
            />
            <ChatEditorLayoutTrigger
              isOpen={isEditorOpen}
              onToggle={toggleEditorOpen}
            />
            <ChatEditorDetailsTrigger
              isOpen={isDetailsOpen}
              onToggle={toggleDetailsOpen}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle variant='floating' className={cn(isParametersOpen ? 'hover:after:opacity-100' : 'hidden')} />
        <ResizablePanel style={{ ...(!isParametersOpen ? { display: 'none' } : {}) }} order={2} id="parameters" minSize={20} maxSize={40} defaultSize={chatResizeRight[1]} className='pointer-events-auto overflow-visible!'>
          <div ref={parametersPanelRef} className="size-full">
            <ChatParameters />
          </div>
        </ResizablePanel>

        <ResizableHandle variant='floating' className={cn(isEditorOpen ? 'hover:after:opacity-100' : 'hidden')} />
        <ResizablePanel style={{ ...(!isEditorOpen ? { display: 'none' } : {}) }} order={3} id="editor-layout" minSize={25} maxSize={50} defaultSize={chatResizeRight[2]} className='pointer-events-auto overflow-visible!'>
          <div ref={editorPanelRef} className="size-full">
            <ChatEditorLayout />
          </div>
        </ResizablePanel>

        <ResizableHandle variant='floating' className={cn(isDetailsOpen ? 'hover:after:opacity-100' : 'hidden')} />
        <ResizablePanel style={{ ...(!isDetailsOpen ? { display: 'none' } : {}) }} order={4} id="details" minSize={20} maxSize={35} defaultSize={chatResizeRight[3]} className='pointer-events-auto overflow-visible!'>
          <div ref={detailsPanelRef} className="size-full">
            <ChatEditorDetails />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Centered Content */}
      <div className="absolute top-1/2 left-1/2 -translate-x-[calc((100%-var(--sidebar-width-current)+var(--right-panel-size)-var(--left-panel-size))/2)] -translate-y-1/2 md:top-[90%] md:-translate-y-[90%] transition-all duration-200 ease-in-out">
        <ChatViewerStatus />
      </div>
    </div>
  );
});
