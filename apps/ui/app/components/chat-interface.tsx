import { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import { Mic, ChevronLeft, ChevronRight, RotateCcw, Eye, Code, Terminal, ArrowRight, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Viewer from '@/components/viewer';
import { MessageRole, MessageSchema, MessageStatus, useChat } from '@/hooks/use-chat';
import { Avatar } from '@/components/ui/avatar';
import { Taucad } from '@/components/icons/taucad';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Textarea } from '@/components/ui/textarea';
import { useScroll } from '@/hooks/use-scroll';
import { cn } from '@/utils/ui';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CopyButton } from '@/components/copy-button';
// import { dark } from 'react-syntax-highlighter/dist/esm/styles/prism/index.js'

function ChatMessage({ message }: { message: MessageSchema }) {
  const isUser = message.role === MessageRole.User;

  return (
    <div className={cn('group flex flex-row space-x-2', isUser ? 'space-x-reverse flex-row-reverse' : '')}>
      <Avatar className="w-8 h-8 bg-neutral-200 flex items-center justify-center">
        {message.role === MessageRole.Assistant ? <Taucad /> : <img src="/avatar-sample.png" alt="User" />}
      </Avatar>
      <div
        className={cn(
          'text-sm prose prose-pre:p-0 prose-pre:ps-0 prose-pre:pe-0',
          isUser ? 'bg-neutral-200 p-2 rounded-xl text-right' : 'pt-[6px]',
        )}
      >
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: (properties) => {
              const { children, ...rest } = properties;
              return (
                <a {...rest} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              );
            },
            code: (properties) => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { children, className, ref, node, style, ...rest } = properties;
              const match = /language-(\w+)/.exec(className || '');
              const language = match ? match[1] : 'text';

              const text = String(children).replace(/\n$/, '');

              return match ? (
                <div className="flex flex-col border border-neutral-200 rounded-md font-sans">
                  <div className="flex flex-row justify-between items-center px-3 pt-1 text-foreground-500">
                    <div className="text-xs">{language}</div>
                    <CopyButton className="flex rounded-sm [&_svg]:size-3 hover:bg-neutral-50" text={text} />
                  </div>
                  <div className="overflow-x-scroll">
                    <SyntaxHighlighter
                      {...rest}
                      ref={ref as React.Ref<SyntaxHighlighter>}
                      PreTag="div"
                      children={text}
                      language={language}
                    />
                  </div>
                </div>
              ) : (
                <code {...rest} className={className}>
                  {children}
                </code>
              );
            },
          }}
        >
          {`${message.content}${message.status === MessageStatus.Pending ? '●' : ''}`}
        </Markdown>
        {!isUser && message.status === MessageStatus.Success && (
          <div className="flex flex-row justify-start items-center pt-1 text-foreground-500">
            <CopyButton showText={false} text={message.content} />
          </div>
        )}
      </div>
      {isUser && (
        <Tooltip>
          <TooltipTrigger>
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full transition-opacity group-hover:opacity-100 opacity-0"
            >
              <Edit className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

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
          <ResizablePanel
            defaultSize={85}
            style={{ overflowY: 'auto' }}
            className="relative flex-1 p-4 text-primary-foreground"
          >
            <div className="flex flex-col space-y-4">
              {messages.map((message, index) => (
                <ChatMessage message={message} key={index} />
              ))}
            </div>
            {/* {!isScrolledTo && (
              <Button
                size="icon"
                variant="outline"
                className="sticky bottom-0 left-1/2 rounded-full"
                onClick={scrollTo}
              >
                <ArrowDown className="w-4 h-4" />
              </Button>
            )} */}
            <div ref={chatEndReference} />
          </ResizablePanel>
          <ResizableHandle />
          {/* Input Area */}
          <ResizablePanel minSize={15} maxSize={50} defaultSize={15} className="p-4 text-primary-foreground">
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

      {/* Right Pane - Main Chat Area */}
      <ResizablePanel defaultSize={60} className="flex-1 flex-col hidden lg:flex">
        {/* Header */}
        <div className="border-b p-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ChevronLeft className="w-4 h-4" />
            <ChevronRight className="w-4 h-4" />
            <RotateCcw className="w-4 h-4" />
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="sm">
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
            <Button variant="ghost" size="sm">
              <Code className="w-4 h-4 mr-2" />
              Code
            </Button>
            <Button variant="ghost" size="sm">
              <Terminal className="w-4 h-4 mr-2" />
              Console
            </Button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-auto">
          <Viewer />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
