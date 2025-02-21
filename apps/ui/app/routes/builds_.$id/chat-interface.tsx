import { useRef, useEffect } from 'react';
import { Eye, Code, Terminal, ArrowDown, Box, MessageSquareReply } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageRole, MessageStatus, useChat } from '@/hooks/use-chat';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useScroll } from '@/hooks/use-scroll';
import { ChatMessage } from '@/routes/builds_.$id/chat-message';
import { ChatViewer } from '@/routes/builds_.$id/chat-viewer';
import { cn } from '@/utils/ui';
import { ChatTextarea } from '@/components/chat/chat-textarea';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useModels } from '@/hooks/use-models';
import { ChatCode } from './chat-code';
import { useCookie } from '@/utils/cookies';

export const CHAT_COOKIE_NAME = 'tau-chat-open';
export const CHAT_RESIZE_COOKIE_NAME_HISTORY = 'tau-chat-history-resize';
export const CHAT_RESIZE_COOKIE_NAME_MAIN = 'tau-chat-main-resize';
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
  const [isChatOpen, setIsChatOpen] = useCookie(CHAT_COOKIE_NAME, true, {
    parse: (value) => value === 'true',
  });
  const [chatResizeMain, setChatResizeMain] = useCookie(CHAT_RESIZE_COOKIE_NAME_MAIN, [40, 60], resizeCookieOptions);
  const [chatResizeHistory, setChatResizeHistory] = useCookie(
    CHAT_RESIZE_COOKIE_NAME_HISTORY,
    [85, 15],
    resizeCookieOptions,
  );
  const { data: models } = useModels();

  const onSubmit = async (text: string, model: string) => {
    await sendMessage({
      message: {
        content: text,
        role: MessageRole.User,
        status: MessageStatus.Success,
        metadata: {},
      },
      model,
    });
  };

  useEffect(() => {
    if (!isScrolledTo) {
      scrollTo();
    }
  }, [messages]);

  const toggleChatOpen = () => {
    setIsChatOpen((previous) => {
      const open = !previous;
      setIsChatOpen(open);
      return open;
    });
  };

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="flex flex-1 bg-background"
      onLayout={(sizes) => {
        setChatResizeMain(sizes as [number, number]);
      }}
      autoSaveId={CHAT_RESIZE_COOKIE_NAME_MAIN}
    >
      <Button
        size={'icon'}
        variant="outline"
        onClick={toggleChatOpen}
        className="group absolute top-0 right-0 text-muted-foreground m-1.5"
        data-state={isChatOpen ? 'open' : 'closed'}
      >
        <span className="size-4">
          <Box className="absolute scale-0 group-data-[state=open]:scale-100 transition-transform duration-200 ease-in-out" />
          <MessageSquareReply className="scale-100 group-data-[state=open]:scale-0 transition-transform duration-200 ease-in-out" />
        </span>
      </Button>
      <ResizablePanel
        order={1}
        minSize={30}
        maxSize={50}
        defaultSize={chatResizeMain[0]}
        className={cn('hidden', isChatOpen && 'flex flex-col')}
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
      <ResizableHandle className={cn('hidden', isChatOpen && 'flex')} />

      <ResizablePanel
        order={2}
        data-state={isChatOpen ? 'open' : 'closed'}
        defaultSize={chatResizeMain[1]}
        className="h-full flex-col data-[state=open]:hidden lg:data-[state=open]:flex"
      >
        <Tabs defaultValue="preview" className="flex flex-col h-full">
          <TabsList className="grid grid-cols-3 absolute m-2 bg-background border md:h-[2.375rem] z-10 [&>*]:data-[state=active]:bg-accent/50">
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
    </ResizablePanelGroup>
  );
};
