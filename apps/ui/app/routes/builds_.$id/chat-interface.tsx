import { useRef, useEffect, useState } from 'react';
import { Eye, Code, Terminal, ArrowDown, MessageCircle, Settings2 } from 'lucide-react';
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

export const CHAT_COOKIE_NAME = 'tau-chat-open';
export const PARAMETERS_COOKIE_NAME = 'tau-parameters-open';
export const CHAT_RESIZE_COOKIE_NAME_HISTORY = 'tau-chat-history-resize';
export const CHAT_RESIZE_COOKIE_NAME_MAIN = 'tau-chat-main-resize';
export const PARAMETERS_RESIZE_COOKIE_NAME = 'tau-parameters-resize';
export const CHAT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

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
  const [chatResizeMain, setChatResizeMain] = useCookie(CHAT_RESIZE_COOKIE_NAME_MAIN, [15, 65, 20], {
    parse: (cookie: string): [number, number, number] => {
      try {
        return JSON.parse(cookie);
      } catch {
        return [15, 65, 20];
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

  useKeydown({
    key: 'p',
    callback: toggleParametersOpen,
    ctrlKey: true,
    requireAllModifiers: true,
  });
  useKeydown({
    key: 'c',
    callback: toggleChatOpen,
    ctrlKey: true,
    requireAllModifiers: true,
  });

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
            className="group absolute top-0 left-0 text-muted-foreground m-[0.5625rem] z-10"
            data-state={isChatOpen ? 'open' : 'closed'}
          >
            <span className="size-4">
              <MessageCircle className="scale-100 transition-transform duration-200 ease-in-out group-data-[state=open]:-rotate-90 group-data-[state=open]:text-foreground" />
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isChatOpen ? 'Close' : 'Open'} Chat (Ctrl + C)</p>
        </TooltipContent>
      </Tooltip>

      <ResizablePanel
        order={1}
        minSize={15}
        maxSize={30}
        defaultSize={chatResizeMain[0]}
        className={cn(!isChatOpen && 'hidden')}
      >
        <ResizablePanelGroup
          direction="vertical"
          onLayout={(sizes) => {
            setChatResizeHistory(sizes as [number, number]);
          }}
          autoSaveId={CHAT_RESIZE_COOKIE_NAME_HISTORY}
        >
          <ResizablePanel
            id="chat-history-content"
            order={1}
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
                    editMessage(message.id, content);
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
          <ResizablePanel
            id="chat-input"
            order={2}
            minSize={15}
            maxSize={50}
            defaultSize={chatResizeHistory[1]}
            className="p-2"
          >
            <ChatTextarea onSubmit={onSubmit} models={models ?? []} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>

      <ResizableHandle className={cn('hidden', isChatOpen && 'md:flex')} />

      <ResizablePanel
        order={2}
        defaultSize={chatResizeMain[1]}
        className={cn('h-full flex-col', isMobile && isChatOpen && 'hidden')}
      >
        <Tabs defaultValue="preview" className="flex flex-col h-full">
          <TabsList
            className={cn(
              'grid grid-cols-3 absolute m-2 bg-background border md:h-[2.375rem] z-10 [&>*]:data-[state=active]:bg-accent/50',
              (!isChatOpen || isMobile) && 'ml-13',
            )}
          >
            <TabsTrigger value="preview" className="gap-2">
              <Eye className="size-4" />
              <span className="hidden md:block">Preview</span>
            </TabsTrigger>
            <TabsTrigger value="code" className="gap-2">
              <Code className="size-4" />
              <span className="hidden md:block">Code</span>
            </TabsTrigger>
            <TabsTrigger value="console" className="gap-2">
              <Terminal className="size-4" />
              <span className="hidden md:block">Console</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="preview" className="h-full w-full mt-0">
            <ChatViewer />
          </TabsContent>
          <TabsContent value="code" className="h-full mt-0 flex flex-1 w-full">
            <ChatCode />
          </TabsContent>
        </Tabs>
      </ResizablePanel>

      <ResizableHandle className={cn('hidden', isParametersOpen && 'md:flex')} />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size={'icon'}
            variant="outline"
            onClick={toggleParametersOpen}
            className={cn(
              'group absolute top-0 right-0 text-muted-foreground m-[0.5625rem] z-10',
              isMobile && isChatOpen && 'hidden',
            )}
            data-state={isParametersOpen ? 'open' : 'closed'}
          >
            <span className="size-4">
              <Settings2 className="scale-100 group-data-[state=open]:-rotate-90 group-data-[state=open]:text-foreground transition-transform duration-200 ease-in-out" />
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isParametersOpen ? 'Close' : 'Open'} Parameters (Ctrl + P)</p>
        </TooltipContent>
      </Tooltip>

      <ResizablePanel
        order={3}
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
