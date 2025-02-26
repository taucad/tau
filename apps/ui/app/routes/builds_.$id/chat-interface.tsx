import { useRef, useEffect, useState } from 'react';
import { Eye, Code, Terminal, ArrowDown, MessageCircle, Settings2, LayoutGrid, Rows } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChat } from '@/contexts/use-chat';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useScroll } from '@/hooks/use-scroll';
import { ChatMessage } from '@/routes/builds_.$id/chat-message';
import { ChatViewer } from '@/routes/builds_.$id/chat-viewer';
import { cn } from '@/utils/ui';
import { ChatTextarea, ChatTextareaProperties } from '@/components/chat/chat-textarea';
import { Parameters } from '@/components/geometry/kernel/replicad/parameters';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useModels } from '@/hooks/use-models';
import { ChatCode } from './chat-code';
import { useCookie } from '@/utils/cookies';
import { MessageRole, MessageStatus } from '@/types/chat';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useKeydown } from '@/hooks/use-keydown';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { KeyShortcut } from '@/components/ui/key-shortcut';
import { ChatConsole } from './chat-console';
import { KeyCombination } from '@/utils/keys';

export const CHAT_COOKIE_NAME = 'tau-chat-open';
export const PARAMETERS_COOKIE_NAME = 'tau-parameters-open';
export const CHAT_RESIZE_COOKIE_NAME_HISTORY = 'tau-chat-history-resize';
export const CHAT_RESIZE_COOKIE_NAME_MAIN = 'tau-chat-main-resize';
export const PARAMETERS_RESIZE_COOKIE_NAME = 'tau-parameters-resize';
export const CHAT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
export const VIEW_MODE_COOKIE_NAME = 'tau-view-mode';
export const VIEW_MODE_CODE_COOKIE_NAME = 'tau-view-mode-code';
export const VIEW_MODE_CONSOLE_COOKIE_NAME = 'tau-view-mode-console';
export const CHAT_TAB_COOKIE_NAME = 'tau-chat-tab';
type ViewMode = 'tabs' | 'split';

const parseResizeCookie = (cookie: string): [number, number] => {
  try {
    return JSON.parse(cookie);
  } catch {
    return [40, 60];
  }
};

const stringifyResizeCookie = (sizes: [number, number]): string => {
  return JSON.stringify(sizes);
};

const resizeCookieOptions = {
  parse: parseResizeCookie,
  stringify: stringifyResizeCookie,
};

const toggleChatKeyCombination = {
  key: 'c',
  ctrlKey: true,
} satisfies KeyCombination;

const toggleParametersKeyCombination = {
  key: 'p',
  ctrlKey: true,
} satisfies KeyCombination;

const openPreviewKeyCombination = {
  key: 'p',
  ctrlKey: true,
  shiftKey: true,
  requireAllModifiers: true,
} satisfies KeyCombination;

const openCodeKeyCombination = {
  key: 'c',
  ctrlKey: true,
  shiftKey: true,
  requireAllModifiers: true,
} satisfies KeyCombination;

const openConsoleKeyCombination = {
  key: 't',
  ctrlKey: true,
  shiftKey: true,
  requireAllModifiers: true,
} satisfies KeyCombination;

const tabs = [
  {
    value: 'preview',
    icon: Eye,
    label: 'Preview',
    keyCombination: openPreviewKeyCombination,
  },
  {
    value: 'code',
    icon: Code,
    label: 'Code',
    keyCombination: openCodeKeyCombination,
  },
  {
    value: 'console',
    icon: Terminal,
    label: 'Console',
    keyCombination: openConsoleKeyCombination,
  },
] as const;

type ChatTabs = (typeof tabs)[number]['value'];

export const ChatInterface = () => {
  const { sendMessage, messages, editMessage } = useChat();
  const chatEndReference = useRef<HTMLDivElement | null>(null);
  const { isScrolledTo, scrollTo } = useScroll({ reference: chatEndReference });
  const lastMessageReference = useRef<string | undefined>(undefined);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [isChatOpen, setIsChatOpen] = useCookie(CHAT_COOKIE_NAME, true, {
    parse: (value) => value === 'true',
  });
  const [isParametersOpen, setIsParametersOpen] = useCookie(PARAMETERS_COOKIE_NAME, true, {
    parse: (value) => value === 'true',
  });
  const [chatResizeMain, setChatResizeMain] = useCookie(CHAT_RESIZE_COOKIE_NAME_MAIN, [25, 60, 15], {
    parse: (cookie: string): [number, number, number] => {
      try {
        return JSON.parse(cookie);
      } catch {
        return [25, 60, 15];
      }
    },
    stringify: (sizes: [number, number, number]): string => {
      return JSON.stringify(sizes);
    },
  });
  const [chatResizeHistory, setChatResizeHistory] = useCookie(
    CHAT_RESIZE_COOKIE_NAME_HISTORY,
    [85, 15],
    resizeCookieOptions,
  );
  const { data: models } = useModels();
  const [consoleSize, setConsoleSize] = useCookie(VIEW_MODE_CONSOLE_COOKIE_NAME, [85, 15], resizeCookieOptions);
  const [codeSize, setCodeSize] = useCookie(VIEW_MODE_CODE_COOKIE_NAME, [60, 40], resizeCookieOptions);

  const [viewMode, setViewMode] = useCookie<ViewMode>(VIEW_MODE_COOKIE_NAME, 'tabs');
  const [chatTab, setChatTab] = useCookie<ChatTabs>(CHAT_TAB_COOKIE_NAME, 'preview');

  useEffect(() => {
    // Get the last message if there are any messages
    const lastMessage = messages.at(-1);

    // Determine if this is a new message
    const isNewMessage = lastMessage?.id !== lastMessageReference.current;
    const isStreaming = lastMessage?.status === MessageStatus.Pending;

    // Auto-scroll if:
    // 1. Message is currently streaming
    // 2. It's a new message AND we're already near bottom (isScrolledTo)
    // 3. It's a new message AND it's from the user (shouldAutoScroll is true)
    // 4. Chat was just opened (isChatOpen changed to true)
    if (lastMessage && (isStreaming || (isNewMessage && (isScrolledTo || shouldAutoScroll))) && isChatOpen) {
      scrollTo();
      // Only reset shouldAutoScroll if the message is complete
      if (!isStreaming) {
        setShouldAutoScroll(false);
      }
    }

    // Update the last message reference
    lastMessageReference.current = lastMessage?.id;
  }, [messages, isChatOpen, isScrolledTo, scrollTo]);

  const onSubmit: ChatTextareaProperties['onSubmit'] = async ({ content, model, metadata }) => {
    setShouldAutoScroll(true);
    await sendMessage({
      message: {
        content,
        role: MessageRole.User,
        status: MessageStatus.Success,
        metadata: metadata ?? { systemHints: [] },
        model,
      },
      model,
    });
  };

  const toggleChatOpen = () => {
    setIsChatOpen((previous) => {
      const open = !previous;
      setIsChatOpen(open);
      return open;
    });
  };

  const toggleParametersOpen = () => {
    setIsParametersOpen((previous) => {
      const open = !previous;
      setIsParametersOpen(open);
      return open;
    });
  };

  const { formattedKeyCombination: formattedParametersKeyCombination } = useKeydown(
    toggleParametersKeyCombination,
    toggleParametersOpen,
  );

  const { formattedKeyCombination: formattedChatKeyCombination } = useKeydown(toggleChatKeyCombination, toggleChatOpen);

  const { formattedKeyCombination: formattedToggleViewModeKeyCombination } = useKeydown(
    {
      key: 't',
      ctrlKey: true,
      requireAllModifiers: true,
    },
    () => setViewMode((previous) => (previous === 'tabs' ? 'split' : 'tabs')),
  );

  const isMobile = useIsMobile();

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="relative flex flex-1 bg-background"
      onLayout={(sizes) => {
        setChatResizeMain(sizes as [number, number, number]);
      }}
      autoSaveId={CHAT_RESIZE_COOKIE_NAME_MAIN}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size={'icon'}
            variant="outline"
            onClick={toggleChatOpen}
            className="group absolute top-0 left-0 text-muted-foreground m-2 z-30"
            data-state={isChatOpen ? 'open' : 'closed'}
          >
            <span className="size-4">
              <MessageCircle className="scale-100 transition-transform duration-200 ease-in-out group-data-[state=open]:-rotate-90 group-data-[state=open]:text-primary" />
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {isChatOpen ? 'Close' : 'Open'} Chat{' '}
            <KeyShortcut variant="tooltip" className="ml-1">
              {formattedChatKeyCombination}
            </KeyShortcut>
          </p>
        </TooltipContent>
      </Tooltip>

      <ResizablePanel minSize={15} maxSize={30} defaultSize={chatResizeMain[0]} className={cn(!isChatOpen && 'hidden')}>
        <ResizablePanelGroup
          direction="vertical"
          onLayout={(sizes) => {
            setChatResizeHistory(sizes as [number, number]);
          }}
          autoSaveId={CHAT_RESIZE_COOKIE_NAME_HISTORY}
        >
          <ResizablePanel
            id="chat-history-content"
            defaultSize={chatResizeHistory[0]}
            style={{ overflowY: 'auto' }}
            className="relative flex-1 p-4 pb-0"
          >
            <div className="space-y-4">
              {messages.map((message, index) => (
                <ChatMessage
                  message={message}
                  key={index}
                  onEdit={(content) => {
                    editMessage({ messageId: message.id, content, model: message.model });
                  }}
                />
              ))}
            </div>
            <Button
              size="icon"
              variant="outline"
              className={cn(
                'sticky flex justify-center bottom-2 left-1/2 -translate-x-1/2 rounded-full',
                isScrolledTo && 'opacity-0 select-none pointer-events-none',
              )}
              tabIndex={isScrolledTo ? -1 : 0}
              onClick={scrollTo}
            >
              <ArrowDown className="size-4" />
            </Button>
            <div ref={chatEndReference} className="mb-px" />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="chat-input" minSize={15} maxSize={50} defaultSize={chatResizeHistory[1]} className="p-2">
            <ChatTextarea onSubmit={onSubmit} models={models ?? []} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>

      <ResizableHandle className={cn('hidden', isChatOpen && 'md:flex')} />

      <ResizablePanel
        defaultSize={chatResizeMain[1]}
        className={cn('h-full flex-col', isMobile && isChatOpen && 'hidden')}
      >
        <div className="relative flex flex-col h-full">
          {viewMode === 'tabs' ? (
            <Tabs
              defaultValue={chatTab}
              className="h-full w-full flex-1"
              onValueChange={(value) => {
                setChatTab(value as ChatTabs);
              }}
            >
              <TabsList
                defaultValue="code"
                className={cn(
                  '[&>*]:data-[state=active]:bg-accent/50 [&>*]:hover:bg-accent/30 bg-transparent m-2 gap-2 z-30',
                  !isChatOpen && 'ml-13',
                  chatTab === 'preview' && 'absolute top-0 left-0 ',
                )}
              >
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className={'gap-2 border-[1px] md:border-none size-9 md:h-9 md:w-auto px-1 md:px-3'}
                  >
                    <tab.icon className="size-4" />
                    <span className="hidden md:block">{tab.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="preview" className="h-full mt-0 flex flex-1 w-full">
                <ChatViewer />
              </TabsContent>
              <TabsContent value="code" className="h-full mt-0 flex flex-1 w-full">
                <ChatCode />
              </TabsContent>
              <TabsContent value="console" className="h-full mt-0 flex flex-1 w-full p-2">
                <ChatConsole />
              </TabsContent>
            </Tabs>
          ) : (
            <ResizablePanelGroup
              autoSaveId={VIEW_MODE_CODE_COOKIE_NAME}
              direction="horizontal"
              className="h-full"
              onLayout={(sizes) => setCodeSize(sizes as [number, number])}
            >
              <ResizablePanel defaultSize={codeSize[0]}>
                <ChatViewer />
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel defaultSize={codeSize[1]}>
                <ResizablePanelGroup
                  direction="vertical"
                  autoSaveId={VIEW_MODE_CONSOLE_COOKIE_NAME}
                  onLayout={(sizes) => setConsoleSize(sizes as [number, number])}
                >
                  <ResizablePanel defaultSize={consoleSize[0]}>
                    <div className="flex flex-row justify-between items-center top-0 right-0 absolute my-2 mr-13 gap-1.5"></div>
                    <div className="pt-14 overflow-y-scroll dark:bg-[rgb(30,_30,_30)] w-full">
                      <ChatCode />
                    </div>
                  </ResizablePanel>
                  <ResizableHandle />
                  <ResizablePanel defaultSize={consoleSize[1]} minSize={5} className="p-2">
                    <ChatConsole />
                  </ResizablePanel>
                </ResizablePanelGroup>
              </ResizablePanel>
            </ResizablePanelGroup>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  'group absolute top-0 right-0 text-muted-foreground m-2 z-30 hidden md:flex',
                  isMobile && isChatOpen && 'hidden',
                  !isParametersOpen && 'mr-13',
                )}
                onClick={() => setViewMode(viewMode === 'tabs' ? 'split' : 'tabs')}
                data-state={viewMode === 'split' ? 'open' : 'closed'}
              >
                <span className="size-4 relative group" data-state={viewMode}>
                  <Rows className="rotate-90 absolute scale-0 group-data-[state=tabs]:scale-100 transition-transform duration-200 ease-in-out" />
                  <LayoutGrid className="absolute scale-0 group-data-[state=split]:scale-100 transition-transform duration-200 ease-in-out" />
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                Open {viewMode === 'tabs' ? 'Split' : 'Tabs'} View{' '}
                <KeyShortcut variant="tooltip" className="ml-1">
                  {formattedToggleViewModeKeyCombination}
                </KeyShortcut>
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
      </ResizablePanel>

      <ResizableHandle className={cn('hidden', isParametersOpen && 'md:flex')} />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size={'icon'}
            variant="outline"
            onClick={toggleParametersOpen}
            className={cn(
              'group absolute top-0 right-0 text-muted-foreground m-2 z-30',
              isMobile && isChatOpen && 'hidden',
            )}
            data-state={isParametersOpen ? 'open' : 'closed'}
          >
            <span className="size-4">
              <Settings2 className="scale-100 group-data-[state=open]:-rotate-90 group-data-[state=open]:text-primary transition-transform duration-200 ease-in-out" />
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {isParametersOpen ? 'Close' : 'Open'} Parameters{' '}
            <KeyShortcut variant="tooltip" className="ml-1">
              {formattedParametersKeyCombination}
            </KeyShortcut>
          </p>
        </TooltipContent>
      </Tooltip>

      <ResizablePanel
        minSize={15}
        maxSize={30}
        defaultSize={chatResizeMain[2]}
        className={cn(
          'hidden',
          isParametersOpen && 'md:flex w-64 xl:w-96 shrink-0 p-4 gap-2 text-sm flex-col',
          isMobile && isChatOpen && 'hidden',
        )}
      >
        <span className="font-bold text-lg">Parameters</span>
        <Parameters />
      </ResizablePanel>

      {isMobile && !isChatOpen && (
        <Drawer open={isParametersOpen} onOpenChange={setIsParametersOpen}>
          <DrawerContent className="p-4 pt-0 text-sm flex flex-col gap-2 justify-between">
            <span className="font-bold text-lg">Parameters</span>
            <div className="grid grid-cols-2 gap-2">
              <Parameters />
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </ResizablePanelGroup>
  );
};
