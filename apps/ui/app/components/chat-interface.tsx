import { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Eye,
  Code,
  Terminal,
  ArrowRight,
  ArrowDown,
  Globe,
  Box,
  MessageSquareReply,
  ChevronDown,
  CircuitBoard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageRole, MessageStatus, useChat } from '@/hooks/use-chat';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Textarea } from '@/components/ui/textarea';
import { useScroll } from '@/hooks/use-scroll';
import { ChatMessage } from '@/components/chat-message';
import { ChatViewer } from '@/components/chat-viewer';
import { cn } from '@/utils/ui';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Model, useModels } from '@/hooks/use-models';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { useRouteLoaderData } from '@remix-run/react';
import type { loader } from '@/root';
import { ComboBoxResponsive } from '@/components/ui/combobox-responsive';
import { ChatCode } from './chat-code';

export const CHAT_COOKIE_NAME = 'tau-chat-open';
export const CHAT_RESIZE_COOKIE_NAME_HISTORY = 'tau-chat-history-resize';
export const CHAT_RESIZE_COOKIE_NAME_MAIN = 'tau-chat-main-resize';
export const CHAT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export default function ChatInterface() {
  const [inputText, setInputText] = useState('');
  const { sendMessage, messages, editMessage } = useChat();
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const chatEndReference = useRef<HTMLDivElement | null>(null);
  const { isScrolledTo, scrollTo } = useScroll({ reference: chatEndReference });
  const data = useRouteLoaderData<typeof loader>('root');
  const [isChatOpen, setIsChatOpen] = useState(data?.chatOpen);
  const { data: models } = useModels();
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const textareaReference = useRef<HTMLTextAreaElement | null>(null);

  const onSubmit = async () => {
    setInputText('');
    await sendMessage({
      message: {
        content: inputText,
        role: MessageRole.User,
        status: MessageStatus.Success,
        metadata: {
          systemHints: [...(isSearching ? ['search'] : [])],
        },
      },
      model: selectedModel,
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

      // eslint-disable-next-line unicorn/no-document-cookie
      document.cookie = `${CHAT_COOKIE_NAME}=${open}; path=/; max-age=${CHAT_COOKIE_MAX_AGE}`;
      return open;
    });
  };

  // eslint-disable-next-line unicorn/consistent-function-scoping
  const onLayoutChange = (sizes: number[], name: string): void => {
    // eslint-disable-next-line unicorn/no-document-cookie
    document.cookie = `${name}=${JSON.stringify(sizes)}; path=/; max-age=${CHAT_COOKIE_MAX_AGE}`;
  };

  const providerModelsMap = models.reduce((map, model) => {
    if (!map.has(model.provider)) {
      map.set(model.provider, []);
    }
    map.get(model.provider)!.push(model);
    return map;
  }, new Map<string, Model[]>());

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="flex flex-1 bg-background"
      onLayout={(sizes) => {
        onLayoutChange(sizes, CHAT_RESIZE_COOKIE_NAME_MAIN);
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
        <span className="w-4 h-4">
          <Box className="absolute scale-0 group-data-[state=open]:scale-100 transition-transform duration-200 ease-in-out" />
          <MessageSquareReply className="scale-100 group-data-[state=open]:scale-0 transition-transform duration-200 ease-in-out" />
        </span>
      </Button>
      <ResizablePanel
        order={1}
        minSize={30}
        maxSize={50}
        defaultSize={data?.resize.chatMain[0]}
        className={cn('hidden', isChatOpen && 'flex flex-col')}
      >
        <ResizablePanelGroup
          direction="vertical"
          onLayout={(sizes) => {
            onLayoutChange(sizes, CHAT_RESIZE_COOKIE_NAME_HISTORY);
          }}
          autoSaveId={CHAT_RESIZE_COOKIE_NAME_HISTORY}
        >
          <ResizablePanel
            id="chat-history-content"
            order={1}
            defaultSize={data?.resize.chatHistory[0]}
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
            <div className={cn('sticky flex justify-center bottom-2', isScrolledTo && 'opacity-0')}>
              <Button
                size="icon"
                variant="outline"
                className={cn('rounded-full', isScrolledTo && 'select-none pointer-events-none')}
                tabIndex={isScrolledTo ? -1 : 0}
                onClick={scrollTo}
              >
                <ArrowDown className="w-4 h-4" />
              </Button>
            </div>
            <div ref={chatEndReference} className="mb-px" />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel
            id="chat-input"
            order={2}
            minSize={15}
            maxSize={50}
            defaultSize={data?.resize.chatHistory[1]}
            className="p-2"
          >
            <div className="relative h-full">
              <div
                data-state={isFocused ? 'active' : 'inactive'}
                onClick={() => {
                  textareaReference.current?.focus();
                }}
                className="flex flex-col h-full border shadow-md rounded-lg data-[state=active]:border-primary w-full resize-none overflow-auto"
              >
                <Textarea
                  onFocus={() => {
                    setIsFocused(true);
                  }}
                  onBlur={() => {
                    setIsFocused(false);
                  }}
                  ref={textareaReference}
                  className="border-none shadow-none ring-0 p-4 pr-10 pb-0 mb-8 focus-visible:ring-0 focus-visible:outline-none w-full resize-none h-full"
                  rows={3}
                  value={inputText}
                  onChange={(event) => setInputText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault(); // Prevents adding a new line
                      onSubmit();
                    }
                  }}
                  placeholder="Type your message..."
                />
              </div>
              <div className="absolute left-2 bottom-2 flex flex-row items-center">
                <ComboBoxResponsive
                  className="group text-xs w-[initial] px-2 h-6 border-none flex items-center justify-between gap-2"
                  popoverContentClassName="w-[300px]"
                  groupedItems={[...providerModelsMap.entries()].map(([provider, models]) => ({
                    name: provider,
                    items: models,
                  }))}
                  renderLabel={(item) => (
                    <span className="text-xs flex items-center justify-between w-full">
                      <span className="font-mono">{item.model}</span>
                      <Badge variant="outline" className="bg-background">
                        {item.details.parameterSize}
                      </Badge>
                    </span>
                  )}
                  renderButtonContents={(item) => (
                    <>
                      <span className="text-xs">{item.model}</span>
                      <span className="relative flex w-4 h-4">
                        <ChevronDown className="absolute group-hover:scale-0 transition-transform duration-200 ease-in-out" />
                        <CircuitBoard className="absolute scale-0 group-hover:scale-100 transition-transform duration-200 ease-in-out" />
                      </span>
                    </>
                  )}
                  getValue={(item) => item.model}
                  onSelect={(selectedModel) => {
                    setSelectedModel(selectedModel);
                  }}
                  placeholder="Select a model"
                  defaultValue={models.find((model) => model.model === selectedModel)}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      data-state={isSearching ? 'active' : 'inactive'}
                      size="xs"
                      variant="ghost"
                      className="group data-[state=active]:bg-neutral-100 data-[state=active]:text-primary data-[state=active]:shadow transition-all duration-200"
                      onClick={() => {
                        setIsSearching((previous) => !previous);
                      }}
                    >
                      <span className="text-xs">Search</span>
                      <Globe className="w-4 h-4 group-hover:rotate-180 transition-transform duration-200 ease-in-out" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Search the web</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-2 top-2"
                onClick={() => {
                  onSubmit();
                }}
                disabled={inputText.length === 0}
              >
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" className="absolute right-2 bottom-2">
                <Mic className="w-4 h-4" />
              </Button>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ResizableHandle className={cn('hidden', isChatOpen && 'flex')} />

      <ResizablePanel
        order={2}
        data-state={isChatOpen ? 'open' : 'closed'}
        defaultSize={data?.resize.chatMain[1]}
        className="h-full flex-col data-[state=open]:hidden lg:data-[state=open]:flex"
      >
        <Tabs defaultValue="preview" className="flex flex-col h-full">
          <TabsList className="grid grid-cols-3 absolute m-2 bg-background z-10 border md:h-[2.375rem]">
            <TabsTrigger
              value="preview"
              className="gap-2 data-[state=active]:bg-neutral-100 data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              <Eye className="w-4 h-4" />
              <span className="hidden md:block">Preview</span>
            </TabsTrigger>
            <TabsTrigger
              value="code"
              className="gap-2 data-[state=active]:bg-neutral-100 data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              <Code className="w-4 h-4" />
              <span className="hidden md:block">Code</span>
            </TabsTrigger>
            <TabsTrigger
              value="console"
              className="gap-2 data-[state=active]:bg-neutral-100 data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              <Terminal className="w-4 h-4" />
              <span className="hidden md:block">Console</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="preview" className="h-full mt-0">
            <ChatViewer />
          </TabsContent>
          <TabsContent value="code" className="h-full mt-0 flex flex-1 w-full">
            <ChatCode />
          </TabsContent>
        </Tabs>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
