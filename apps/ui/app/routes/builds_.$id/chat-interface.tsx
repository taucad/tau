import { MessageCircle, Settings2, LayoutGrid, Rows } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { cn } from '@/utils/ui';
import { ChatParameters } from '@/routes/builds_.$id/chat-parameters';

import { useCookie } from '@/utils/cookies';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useKeydown } from '@/hooks/use-keydown';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { KeyShortcut } from '@/components/ui/key-shortcut';
import { KeyCombination } from '@/utils/keys';
import { ChatHistory } from './chat-history';
import { ChatViewTabs } from './chat-view-tabs';
import { ChatViewSplit } from './chat-view-split';
import { useCallback } from 'react';

export const CHAT_HISTORY_OPEN_COOKIE_NAME = 'tau-chat-history-open';
export const CHAT_PARAMETERS_OPEN_COOKIE_NAME = 'tau-chat-parameters-open';
export const CHAT_RESIZE_COOKIE_NAME_MAIN = 'tau-chat-main-resize';
export const CHAT_VIEW_MODE_COOKIE_NAME = 'tau-chat-view-mode';
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

export const ChatInterface = () => {
  const [isChatOpen, setIsChatOpen] = useCookie(CHAT_HISTORY_OPEN_COOKIE_NAME, true);
  const [isParametersOpen, setIsParametersOpen] = useCookie(CHAT_PARAMETERS_OPEN_COOKIE_NAME, true);
  const [chatResizeMain, setChatResizeMain] = useCookie(CHAT_RESIZE_COOKIE_NAME_MAIN, [25, 60, 15]);
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
      className="relative flex flex-1 bg-background"
      onLayout={setChatResizeMain}
      autoSaveId={CHAT_RESIZE_COOKIE_NAME_MAIN}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size={'icon'}
            variant="outline"
            onClick={toggleChatOpen}
            className="group absolute top-0 left-0 z-30 m-2 text-muted-foreground"
            data-state={isChatOpen ? 'open' : 'closed'}
          >
            <MessageCircle className="scale-100 transition-transform duration-200 ease-in-out group-data-[state=open]:-rotate-90 group-data-[state=open]:text-primary" />
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
        className={cn(!isChatOpen && 'hidden')}
        id="chat-history"
      >
        <ChatHistory />
      </ResizablePanel>

      <ResizableHandle className={cn('hidden', isChatOpen && 'md:flex')} />

      <ResizablePanel
        order={2}
        defaultSize={chatResizeMain[1]}
        className={cn('relative h-full flex-col', isChatOpen && 'hidden md:flex')}
        id="chat-main"
      >
        {viewMode === 'tabs' ? <ChatViewTabs isChatOpen={isChatOpen} /> : <ChatViewSplit />}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={cn(
                'group absolute top-0 right-0 z-30 m-2 text-muted-foreground',
                'hidden md:flex',
                isChatOpen && 'hidden',
                !isParametersOpen && 'mr-12',
              )}
              onClick={() => setViewMode(viewMode === 'tabs' ? 'split' : 'tabs')}
              data-state={viewMode === 'split' ? 'open' : 'closed'}
            >
              <span className="group relative size-4" data-state={viewMode}>
                <Rows className="absolute scale-0 rotate-90 transition-transform duration-200 ease-in-out group-data-[state=tabs]:scale-100" />
                <LayoutGrid className="absolute scale-0 transition-transform duration-200 ease-in-out group-data-[state=split]:scale-100" />
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

      <ResizableHandle className={cn('hidden', isParametersOpen && 'md:flex')} />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size={'icon'}
            variant="outline"
            onClick={toggleParametersOpen}
            className={cn(
              'group absolute top-0 right-0 z-30 m-2 text-muted-foreground',
              'flex', // Show by default
              isChatOpen && 'hidden md:flex', // Hide on mobile when chat is open, show on desktop always
            )}
            data-state={isParametersOpen ? 'open' : 'closed'}
          >
            <span className="size-4">
              <Settings2 className="scale-100 transition-transform duration-200 ease-in-out group-data-[state=open]:-rotate-90 group-data-[state=open]:text-primary" />
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
          'hidden',
          isParametersOpen && 'w-64 shrink-0 flex-col gap-3 text-sm md:flex xl:w-96',
          isMobile && isChatOpen && 'hidden',
        )}
        id="chat-parameters"
      >
        <span className="m-2 mb-0 font-mono text-lg font-bold">Parameters</span>
        <div className="flex flex-col gap-2 overflow-y-auto p-2 pt-0">
          <ChatParameters />
        </div>
      </ResizablePanel>

      {isMobile && !isChatOpen && (
        <Drawer open={isParametersOpen} onOpenChange={setIsParametersOpen}>
          <DrawerContent className={cn('flex flex-col justify-between gap-2 text-sm', 'md:hidden')}>
            <span className="px-4 text-lg font-bold">Parameters</span>
            <div className="grid grid-cols-2 gap-2 overflow-y-auto p-4">
              <ChatParameters />
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </ResizablePanelGroup>
  );
};
