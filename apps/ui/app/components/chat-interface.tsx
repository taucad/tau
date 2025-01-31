import { useState, useEffect, useRef } from 'react';
import { Mic, Eye, Code, Terminal, ArrowRight, ArrowDown, ChevronDown, ChevronLeft } from 'lucide-react';
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { When } from './ui/utils/when';

const MODELS = ['gpt-o3-mini','gpt-4o-mini', 'gpt-4o', 'llama3.2'] as const;

export default function ChatInterface() {
  const [inputText, setInputText] = useState('');
  const { sendMessage, messages, editMessage } = useChat();
  const [model, setModel] = useState('gpt-4o-mini');
  const chatEndReference = useRef<HTMLDivElement | null>(null);
  const { isScrolledTo, scrollTo } = useScroll({ reference: chatEndReference });
  const [isChatOpen, setIsChatOpen] = useState(true);

  const onSubmit = async () => {
    setInputText('');
    await sendMessage({
      message: {
        content: inputText,
        role: MessageRole.User,
        status: MessageStatus.Success,
      },
      model,
    });
  };

  useEffect(() => {
    if (!isScrolledTo) {
      scrollTo();
    }
  }, [messages]);

  console.log(messages);

  return (
    <ResizablePanelGroup direction="horizontal" className="relative flex h-[calc(100vh-48px)] bg-background">
      <Button
        size={'icon'}
        variant='outline'
        onClick={() => setIsChatOpen((prev) => !prev)}
        className="absolute top-1.5 left-2 z-50"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>
      {/* Left Pane - Chat History */}
      <When condition={isChatOpen}>
        <ResizablePanel minSize={30} maxSize={50} defaultSize={40} className="flex flex-col">
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel defaultSize={85} style={{ overflowY: 'auto' }} className="relative flex-1 p-4 pb-0">
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
            <ResizablePanel minSize={15} maxSize={50} defaultSize={15} className="p-4">
              <div className="relative h-full">
                <Textarea
                  className="bg-background w-full p-3 pr-12 rounded-lg border h-full resize-none"
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="absolute left-2 bottom-2">
                      <p className="text-xs">{model}</p>
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top">
                    <DropdownMenuRadioGroup value={model} onValueChange={setModel}>
                      {MODELS.map((model) => (
                        <DropdownMenuRadioItem key={model} value={model}>
                          {model}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
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

      <ResizablePanel data-state={isChatOpen ? 'open' : 'closed'} defaultSize={60} className="flex-1 h-full flex-col data-[state=open]:hidden data-[state=open]:lg:flex">
        <Tabs defaultValue="preview" className="flex flex-col h-full relative">
          <TabsList className="grid grid-cols-3 m-2 absolute top-1 left-0 bg-background">
            <TabsTrigger
              value="preview"
              className="data-[state=active]:bg-neutral-100 data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              <Eye className="w-4 h-4 mr-2" />
              <span>Preview</span>
            </TabsTrigger>
            <TabsTrigger
              value="code"
              className="data-[state=active]:bg-neutral-100 data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              <Code className="w-4 h-4 mr-2" />
              <span>Code</span>
            </TabsTrigger>
            <TabsTrigger
              value="console"
              className="data-[state=active]:bg-neutral-100 data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              <Terminal className="w-4 h-4 mr-2" />
              <span>Console</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="preview" className="h-full mt-0">
            <ChatViewer />
          </TabsContent>
          <TabsContent value="code" className="h-full mt-0">
            <div className="flex flex-row justify-between items-center px-4 pb-2">
              <span className="text-sm font-medium">main.kcl</span>
              <div className="flex flex-row items-center">
                <CopyButton size="icon" text={mockCode} />
                <DownloadButton size="icon" text={mockCode} />
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
