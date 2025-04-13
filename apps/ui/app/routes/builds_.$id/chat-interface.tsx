import { MessageCircle, Settings2, LayoutGrid, Rows } from 'lucide-react';
import { useCallback } from 'react';
import { ChatHistory } from './chat-history';
import { ChatViewTabs } from './chat-view-tabs';
import { ChatViewSplit } from './chat-view-split';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { cn } from '@/utils/ui.js';
import { ChatParameters } from '@/routes/builds_.$id/chat-parameters';
import { useCookie } from '@/hooks/use-cookie';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useKeydown } from '@/hooks/use-keydown';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { KeyShortcut } from '@/components/ui/key-shortcut';
import type { KeyCombination } from '@/utils/keys';

export const CHAT_HISTORY_OPEN_COOKIE_NAME = 'chat-history-open';
export const CHAT_PARAMETERS_OPEN_COOKIE_NAME = 'chat-parameters-open';
export const CHAT_RESIZE_MAIN_COOKIE_NAME = 'chat-resize-main';
export const CHAT_VIEW_MODE_COOKIE_NAME = 'chat-view-mode';
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

export function ChatInterface() {
  const [isChatOpen, setIsChatOpen] = useCookie(CHAT_HISTORY_OPEN_COOKIE_NAME, true);
  const [isParametersOpen, setIsParametersOpen] = useCookie(CHAT_PARAMETERS_OPEN_COOKIE_NAME, true);
  const [chatResizeMain, setChatResizeMain] = useCookie(CHAT_RESIZE_MAIN_COOKIE_NAME, [25, 60, 15]);
  const [viewMode, setViewMode] = useCookie<ViewMode>(CHAT_VIEW_MODE_COOKIE_NAME, 'tabs');

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
      autoSaveId={CHAT_RESIZE_MAIN_COOKIE_NAME}
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

      <ResizablePanel
        order={3}
        minSize={10}
        maxSize={30}
        defaultSize={chatResizeMain[2]}
        className={cn(
          'hidden w-64 shrink-0 flex-col gap-3 text-sm xl:w-96',
          'group-data-[parameters-open=true]/chat-layout:md:flex',
        )}
        id="chat-parameters"
      >
        <span className="m-2 mb-0 font-mono text-lg font-bold">Parameters</span>
        <div className="flex flex-col gap-2 overflow-y-auto p-2 pt-0">
          <ChatParameters />
        </div>
      </ResizablePanel>

      {/* TODO: revisit if a drawer is the best UX here. */}
      {isMobile && !isChatOpen ? (
        <Drawer open={isParametersOpen} onOpenChange={setIsParametersOpen}>
          <DrawerContent className={cn('flex flex-col justify-between gap-2 text-sm', 'md:hidden')}>
            <span className="px-4 text-lg font-bold">Parameters</span>
            <div className="grid grid-cols-2 gap-2 overflow-y-auto p-4">
              <ChatParameters />
            </div>
          </DrawerContent>
        </Drawer>
      ) : null}
    </ResizablePanelGroup>
  );
}
