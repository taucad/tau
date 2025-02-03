import { useState, useRef, Fragment, useEffect } from 'react';
import {
  Mic,
  Eye,
  Code,
  Terminal,
  ArrowRight,
  ArrowDown,
  ChevronDown,
  Globe,
  CircuitBoard,
  Box,
  MessageSquareReply,
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
import { CodeViewer } from '@/components/code-viewer';
import { mockCode } from '@/components/mock-code';
import { CopyButton } from './copy-button';
import { DownloadButton } from './download-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { When } from './ui/utils/when';
import { useModels } from '@/hooks/use-models';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { useRouteLoaderData } from '@remix-run/react';
import { loader } from '@/root';

export const CHAT_COOKIE_NAME = 'tau-chat-open';
export const CHAT_RESIZE_COOKIE_NAME_HISTORY = 'tau-chat-history-resize';
export const CHAT_RESIZE_COOKIE_NAME_MAIN = 'tau-chat-main-resize';
export const CHAT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export default function ChatInterface() {
  const [inputText, setInputText] = useState('');
  const { sendMessage, messages, editMessage } = useChat();
  const [model, setModel] = useState('gpt-4o-mini');
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

      document.cookie = `${CHAT_COOKIE_NAME}=${open}; path=/; max-age=${CHAT_COOKIE_MAX_AGE}`;
      return open;
    });
  };

  // eslint-disable-next-line unicorn/consistent-function-scoping
  const onLayoutChange = (sizes: number[], name: string): void => {
    document.cookie = `${name}=${JSON.stringify(sizes)}; path=/; max-age=${CHAT_COOKIE_MAX_AGE}`;
  };

  const providerModels = models.reduce((accumulator, model) => {
    accumulator[model.provider] = accumulator[model.provider] || [];
    accumulator[model.provider].push(model);
    return accumulator;
  }, {});

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="relative flex h-[calc(100dvh-48px)] bg-background"
      onLayout={(sizes) => {
        onLayoutChange(sizes, CHAT_RESIZE_COOKIE_NAME_MAIN);
      }}
    >
      <Button
        size={'icon'}
        variant="outline"
        onClick={toggleChatOpen}
        className="group absolute top-2 right-2 z-50 text-muted-foreground"
        data-state={isChatOpen ? 'open' : 'closed'}
      >
        <span className="relative w-4 h-4">
          <Box className="absolute scale-0 group-data-[state=open]:scale-100 transition-transform duration-200 ease-in-out" />
          <MessageSquareReply className="scale-100 group-data-[state=open]:scale-0 transition-transform duration-200 ease-in-out" />
        </span>
      </Button>
      {/* Left Pane - Chat History */}
      <When condition={isChatOpen}>
        <ResizablePanel
          id="chat-history"
          order={1}
          minSize={30}
          maxSize={50}
          defaultSize={data?.resize.chatMain[0]}
          className="flex flex-col"
        >
          <ResizablePanelGroup
            direction="vertical"
            onLayout={(sizes) => {
              onLayoutChange(sizes, CHAT_RESIZE_COOKIE_NAME_HISTORY);
            }}
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
            {/* Input Area */}
            <ResizablePanel
              id="chat-input"
              order={2}
              minSize={15}
              maxSize={50}
              defaultSize={data?.resize.chatHistory[1]}
              className="p-4"
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
                <div className="absolute left-2 bottom-2 flex flex-row items-center gap-2">
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" className="group h-6 px-2" variant="ghost">
                            <span className="text-xs">{model}</span>
                            <span className="relative flex w-4 h-4">
                              <ChevronDown className="absolute group-hover:scale-0 transition-transform duration-200 ease-in-out" />
                              <CircuitBoard className="absolute scale-0 group-hover:scale-100 transition-transform duration-200 ease-in-out" />
                            </span>
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Select a model</p>
                      </TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent side="top">
                      <DropdownMenuRadioGroup value={model} onValueChange={setModel}>
                        {Object.entries(providerModels).map(([provider, models]) => (
                          <Fragment key={provider}>
                            <DropdownMenuLabel>{provider}</DropdownMenuLabel>
                            {models.map((model) => (
                              <DropdownMenuRadioItem
                                className="group flex flex-row items-center gap-2 justify-between text-xs"
                                key={model.model}
                                value={model.model}
                              >
                                <span className="font-mono p-1 bg-neutral-100 rounded-sm">{model.model}</span>
                                <Badge variant="outline" className="group-hover:bg-background">
                                  {model.details.parameterSize}
                                </Badge>
                              </DropdownMenuRadioItem>
                            ))}
                          </Fragment>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
        <ResizableHandle className="hidden lg:flex" />
      </When>

      <ResizablePanel
        id="chat-main"
        order={2}
        data-state={isChatOpen ? 'open' : 'closed'}
        defaultSize={data?.resize.chatMain[1]}
        className="flex-1 h-full flex-col data-[state=open]:hidden data-[state=open]:lg:flex"
      >
        <Tabs defaultValue="preview" className="flex flex-col h-full relative">
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
          <TabsContent value="code" className="h-full mt-0">
            <div className="flex flex-row justify-between items-center px-4 pb-2 mt-2 mr-9">
              <span className="text-sm font-medium">main.kcl</span>
              <div className="flex flex-row items-center gap-2">
                <CopyButton variant="outline" size="icon" text={mockCode} />
                <DownloadButton variant="outline" size="icon" text={mockCode} />
              </div>
            </div>
            <div className="flex-1 bg-neutral-100 rounded-md m-2">
              <CodeViewer
                className="text-xs"
                showLineNumbers
                showInlineLineNumbers
                children={mockCode}
                language="typescript"
              />
            </div>
          </TabsContent>
        </Tabs>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
