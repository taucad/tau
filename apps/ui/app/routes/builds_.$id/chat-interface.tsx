import { memo } from 'react';
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
import { ChatEditorObjectTree, ChatEditorObjectTreeTrigger } from '#routes/builds_.$id/chat-editor-object-tree.js';
import { ChatEditorDetails, ChatEditorDetailsTrigger } from '#routes/builds_.$id/chat-editor-details.js';
import { cn } from '#utils/ui.js';
import { useCookie } from '#hooks/use-cookie.js';

export const ChatInterface = memo(function () {
  const { isChatOpen, toggleChatOpen, isParametersOpen, toggleParametersOpen, isEditorOpen, toggleEditorOpen, isExplorerOpen, toggleExplorerOpen, isDetailsOpen, toggleDetailsOpen } = useViewContext();
  const [chatResizeLeft, setChatResizeLeft] = useCookie(cookieName.chatRsLeft, [30, 20, 50]);
  const [chatResizeRight, setChatResizeRight] = useCookie(cookieName.chatRsRight, [50, 30, 20, 0]);

  return (
    <div className="group/chat-layout relative size-full flex flex-col">
      {/* Viewer - inset completely to occupy the background fully */}
      <div className="absolute inset-0 size-full">
        <ChatViewer />
      </div>

      {/* Left-side ResizablePanelGroup */}
      <ResizablePanelGroup direction="horizontal" autoSaveId={cookieName.chatRsLeft} className="absolute gap-1 top-(--header-height) left-2 md:left-(--sidebar-width-current) h-[calc(100dvh-(--spacing(14)))]! w-[50%]! md:w-[calc(50%-0.25rem)]! transition-all duration-200 ease-linear overflow-visible! pointer-events-none" onLayout={setChatResizeLeft}
      >
        <ResizablePanel style={{ ...(!isChatOpen ? { display: 'none' } : {}) }} order={1} id="history" minSize={25} defaultSize={chatResizeLeft[0]} className='pointer-events-auto'>
          <ChatHistory />
        </ResizablePanel>

        <ResizableHandle variant='floating' className={cn(isChatOpen ? 'hover:after:opacity-100' : 'hidden')} />

        <ResizablePanel style={{ ...(!isExplorerOpen ? { display: 'none' } : {}) }} order={2} id="object-tree" minSize={20} maxSize={30} defaultSize={chatResizeLeft[1]} className='pointer-events-auto'>
          <ChatEditorObjectTree />
        </ResizablePanel>

        <ResizableHandle variant='floating' className={cn(isExplorerOpen ? 'hover:after:opacity-100' : 'hidden')} />

        <ResizablePanel order={3} id="spacer" defaultSize={chatResizeLeft[2]} minSize={0} className='relative overflow-visible!'>
          {/* Top-left Content */}
          <div className='absolute top-0 left-0 flex flex-col gap-2 pointer-events-auto'>
            <ChatHistoryTrigger
              isOpen={isChatOpen}
              onToggle={toggleChatOpen}
            />
            <ChatEditorObjectTreeTrigger
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
        <ResizablePanel style={{ ...(!isParametersOpen ? { display: 'none' } : {}) }} order={2} id="parameters" minSize={20} maxSize={40} defaultSize={chatResizeRight[1]} className='pointer-events-auto'>
          <ChatParameters />
        </ResizablePanel>

        <ResizableHandle variant='floating' className={cn(isEditorOpen ? 'hover:after:opacity-100' : 'hidden')} />
        <ResizablePanel style={{ ...(!isEditorOpen ? { display: 'none' } : {}) }} order={3} id="editor-layout" minSize={25} maxSize={50} defaultSize={chatResizeRight[2]} className='pointer-events-auto'>
          <ChatEditorLayout />
        </ResizablePanel>

        <ResizableHandle variant='floating' className={cn(isDetailsOpen ? 'hover:after:opacity-100' : 'hidden')} />
        <ResizablePanel style={{ ...(!isDetailsOpen ? { display: 'none' } : {}) }} order={4} id="details" minSize={20} maxSize={35} defaultSize={chatResizeRight[3]} className='pointer-events-auto'>
          <ChatEditorDetails />
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Centered Content */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 md:top-[90%] md:left-[50%] md:-translate-x-[50%] md:-translate-y-[90%]">
        <ChatViewerStatus />
      </div>
    </div>
  );
});
