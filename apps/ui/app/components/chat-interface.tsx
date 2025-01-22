import { useState, useEffect, useRef } from 'react';
import { Mic, Eye, Code, Terminal, ArrowRight, ArrowDown } from 'lucide-react';
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

export default function ChatInterface() {
  const [inputText, setInputText] = useState('');
  const { sendMessage, messages } = useChat();
  const chatEndReference = useRef<HTMLDivElement | null>(null);
  const { isScrolledTo, scrollTo } = useScroll({ reference: chatEndReference });

  const onSubmit = async () => {
    setInputText('');
    await sendMessage({
      content: inputText,
      role: MessageRole.User,
      status: MessageStatus.Success,
    });
  };

  useEffect(() => {
    if (!isScrolledTo) {
      scrollTo();
    }
  }, [messages]);

  return (
    <ResizablePanelGroup direction="horizontal" className="flex h-[calc(100vh-48px)] bg-background">
      {/* Left Pane - Chat History */}
      <ResizablePanel minSize={30} maxSize={50} defaultSize={40} className="flex flex-col">
        <ResizablePanelGroup direction="vertical">
          <ResizablePanel defaultSize={85} style={{ overflowY: 'auto' }} className="relative flex-1 p-4 pb-0">
            <div className="space-y-4">
              {messages.map((message, index) => (
                <ChatMessage message={message} key={index} />
              ))}
            </div>
            <div className={cn('sticky flex justify-center bottom-2', isScrolledTo && 'opacity-0')}>
              <Button size="icon" variant="outline" className={cn('rounded-full')} onClick={scrollTo}>
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
              <Button size="icon" variant="ghost" className="absolute right-2 bottom-3">
                <Mic className="w-4 h-4" />
              </Button>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ResizableHandle className="hidden lg:flex" />

      <ResizablePanel defaultSize={60} className="flex-1 flex-col hidden lg:flex">
        <Tabs defaultValue="preview" className="flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-3 m-2">
            <TabsTrigger value="preview">
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="code">
              <Code className="w-4 h-4 mr-2" />
              Code
            </TabsTrigger>
            <TabsTrigger value="console">
              <Terminal className="w-4 h-4 mr-2" />
              Console
            </TabsTrigger>
          </TabsList>
          <TabsContent value="preview">
            <ChatViewer />
          </TabsContent>
          <TabsContent value="code">
            <CodeViewer
              className="text-sm"
              showLineNumbers
              showInlineLineNumbers
              children={mockCode}
              language="javascript"
            />
          </TabsContent>
        </Tabs>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
