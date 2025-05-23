import { MessageCircle, Settings2, LayoutGrid, Rows } from 'lucide-react';
import { memo, useCallback } from 'react';
import { ChatHistory } from '~/routes/builds_.$id/chat-history.js';
import { ChatViewTabs } from '~/routes/builds_.$id/chat-view-tabs.js';
import { ChatViewSplit } from '~/routes/builds_.$id/chat-view-split.js';
import { Button } from '~/components/ui/button.js';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '~/components/ui/resizable.js';
import { cn } from '~/utils/ui.js';
import { ChatParameters } from '~/routes/builds_.$id/chat-parameters.js';
import { useCookie } from '~/hooks/use-cookie.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { useKeydown } from '~/hooks/use-keydown.js';
import { Drawer, DrawerContent } from '~/components/ui/drawer.js';
import { useIsMobile } from '~/hooks/use-mobile.js';
import { KeyShortcut } from '~/components/ui/key-shortcut.js';
import type { KeyCombination } from '~/utils/keys.js';
import { ChatControls } from '~/routes/builds_.$id/chat-controls.js';

export const chatHistoryOpenCookieName = 'chat-history-open';
export const chatParametersOpenCookieName = 'chat-parameters-open';
export const chatResizeMainCookieName = 'chat-resize-main';
export const chatViewModeCookieName = 'chat-view-mode';
type ViewMode = 'tabs' | 'split';

const toggleChatKeyCombination = {
  key: 'c',
  ctrlKey: true,
} satisfies KeyCombination;

const toggleParametersKeyCombination = {
  key: 'p',
  ctrlKey: true,
} satisfies KeyCombination;

const toggleViewModeKeyCombination = {
  key: 't',
  ctrlKey: true,
} satisfies KeyCombination;

export const ChatInterface = memo(function () {
  const [isChatOpen, setIsChatOpen] = useCookie(chatHistoryOpenCookieName, true);
  const [isParametersOpen, setIsParametersOpen] = useCookie(chatParametersOpenCookieName, true);
  const [chatResizeMain, setChatResizeMain] = useCookie(chatResizeMainCookieName, [25, 60, 15]);
  const [viewMode, setViewMode] = useCookie<ViewMode>(chatViewModeCookieName, 'tabs');

  const toggleChatOpen = useCallback(() => {
    setIsChatOpen((previous) => !previous);
  }, [setIsChatOpen]);

  const toggleParametersOpen = useCallback(() => {
    setIsParametersOpen((previous) => !previous);
  }, [setIsParametersOpen]);

  const toggleViewMode = useCallback(() => {
    setViewMode((previous) => (previous === 'tabs' ? 'split' : 'tabs'));
  }, [setViewMode]);

  const { formattedKeyCombination: formattedParametersKeyCombination } = useKeydown(
    toggleParametersKeyCombination,
    toggleParametersOpen,
  );

  const { formattedKeyCombination: formattedChatKeyCombination } = useKeydown(toggleChatKeyCombination, toggleChatOpen);

  const { formattedKeyCombination: formattedToggleViewModeKeyCombination } = useKeydown(
    toggleViewModeKeyCombination,
    toggleViewMode,
  );

  const isMobile = useIsMobile();

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="group/chat-layout relative flex flex-1 bg-background"
      autoSaveId={chatResizeMainCookieName}
      data-chat-open={isChatOpen}
      data-parameters-open={isParametersOpen}
      data-view-mode={viewMode}
      onLayout={setChatResizeMain}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="overlay"
            className="absolute top-0 left-0 z-30 m-2 text-muted-foreground"
            onClick={toggleChatOpen}
          >
            <MessageCircle
              className={cn(
                'transition-transform duration-200 ease-in-out',
                'group-data-[chat-open=true]/chat-layout:-rotate-90',
                'group-data-[chat-open=true]/chat-layout:text-primary',
              )}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isChatOpen ? 'Close' : 'Open'} Chat{' '}
          <KeyShortcut variant="tooltip" className="ml-1">
            {formattedChatKeyCombination}
          </KeyShortcut>
        </TooltipContent>
      </Tooltip>

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
        {viewMode === 'tabs' ? <ChatViewTabs /> : <ChatViewSplit />}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="overlay"
              size="icon"
              className={cn(
                'group absolute top-0 right-0 z-30 m-2 text-muted-foreground',
                'hidden md:flex',
                // Shift the view mode button to the left when the parameters are closed
                'group-data-[parameters-open=false]/chat-layout:mr-12',
              )}
              onClick={() => {
                setViewMode(viewMode === 'tabs' ? 'split' : 'tabs');
              }}
            >
              <span className="relative size-4">
                <Rows className="absolute scale-0 rotate-90 transition-transform duration-200 ease-in-out group-data-[view-mode=tabs]/chat-layout:scale-100" />
                <LayoutGrid className="absolute scale-0 transition-transform duration-200 ease-in-out group-data-[view-mode=split]/chat-layout:scale-100" />
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Open {viewMode === 'tabs' ? 'Split' : 'Tabs'} View{' '}
            <KeyShortcut variant="tooltip" className="ml-1">
              {formattedToggleViewModeKeyCombination}
            </KeyShortcut>
          </TooltipContent>
        </Tooltip>
      </ResizablePanel>

      <ResizableHandle className={cn('hidden group-data-[parameters-open=true]/chat-layout:md:flex')} />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="overlay"
            className={cn(
              'absolute top-0 right-0 z-30 m-2 flex text-muted-foreground',
              // Hide on mobile when chat is open
              'group-data-[chat-open=true]/chat-layout:max-md:hidden',
            )}
            onClick={toggleParametersOpen}
          >
            <span className="size-4">
              <Settings2
                className={cn(
                  'transition-transform duration-200 ease-in-out',
                  'group-data-[parameters-open=true]/chat-layout:-rotate-90',
                  'group-data-[parameters-open=true]/chat-layout:text-primary',
                )}
              />
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isParametersOpen ? 'Close' : 'Open'} Parameters{' '}
          <KeyShortcut variant="tooltip" className="ml-1">
            {formattedParametersKeyCombination}
          </KeyShortcut>
        </TooltipContent>
      </Tooltip>
      <ChatControls />

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

      {/* TODO: revisit if a drawer is the best UX here. */}
      {isMobile && !isChatOpen ? (
        <Drawer open={isParametersOpen} onOpenChange={setIsParametersOpen}>
          <DrawerContent className={cn('flex h-[60dvh] flex-col text-sm', 'md:hidden')}>
            <ChatParameters />
          </DrawerContent>
        </Drawer>
      ) : null}
    </ResizablePanelGroup>
  );
});
