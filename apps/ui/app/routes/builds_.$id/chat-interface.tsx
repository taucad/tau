import { memo } from 'react';
import { ChatHistory } from '#routes/builds_.$id/chat-history.js';
import { ChatViewTabs } from '#routes/builds_.$id/chat-view-tabs.js';
import { ChatViewSplit } from '#routes/builds_.$id/chat-view-split.js';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '#components/ui/resizable.js';
import { cn } from '#utils/ui.js';
import { ChatParameters } from '#routes/builds_.$id/chat-parameters.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useViewContext } from '#routes/builds_.$id/chat-interface-controls.js';
import { cookieName } from '#constants/cookie.constants.js';

export const ChatInterface = memo(function () {
  const [chatResizeMain, setChatResizeMain] = useCookie(cookieName.chatResizeMain, [25, 60, 15]);
  const { isChatOpen, isParametersOpen, viewMode } = useViewContext();

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="group/chat-layout relative flex flex-1 bg-background"
      autoSaveId={cookieName.chatResizeMain}
      data-chat-open={isChatOpen}
      data-parameters-open={isParametersOpen}
      data-view-mode={viewMode}
      onLayout={setChatResizeMain}
    >
      <ResizablePanel
        order={1}
        minSize={15}
        maxSize={50}
        defaultSize={chatResizeMain[0]}
        className={cn('group-data-[chat-open=false]/chat-layout:hidden')}
        id="chat-history"
      >
        <ChatHistory />
      </ResizablePanel>

      <ResizableHandle className={cn('hidden', 'group-data-[chat-open=true]/chat-layout:md:flex')} />

      <ResizablePanel
        order={2}
        defaultSize={chatResizeMain[1]}
        className={cn(
          'relative h-full flex-col',
          'group-data-[chat-open=true]/chat-layout:hidden',
          'group-data-[chat-open=true]/chat-layout:md:flex',
        )}
        id="chat-main"
      >
        {viewMode === 'tabs' ? (
          <>
            <div className={cn('relative h-full', isParametersOpen && 'max-md:h-[40%] max-md:border-b')}>
              <ChatViewTabs />
            </div>
            {isParametersOpen ? (
              <div className="hidden max-md:block max-md:h-[60%] max-md:overflow-y-auto">
                <ChatParameters />
              </div>
            ) : null}
          </>
        ) : (
          <ChatViewSplit />
        )}
      </ResizablePanel>

      <ResizableHandle className={cn('hidden group-data-[parameters-open=true]/chat-layout:md:flex')} />

      <ResizablePanel
        order={3}
        minSize={10}
        maxSize={30}
        defaultSize={chatResizeMain[2]}
        className={cn(
          'hidden w-64 shrink-0 flex-col text-sm xl:w-96',
          'group-data-[parameters-open=true]/chat-layout:md:flex',
        )}
        id="chat-parameters"
      >
        <ChatParameters />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
});
