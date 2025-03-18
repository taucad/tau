import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ChevronRight, Edit, Globe2, History, NotebookIcon, Projector } from 'lucide-react';
import { CopyButton } from '@/components/copy-button';
import { Button } from '@/components/ui/button';
import { Message, MessageRole, MessageStatus, SourceOrigin } from '@/types/chat';
import { cn } from '@/utils/ui';
import { MarkdownViewer } from '@/components/markdown-viewer';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import { Sheet, SheetDescription, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect, useRef, Fragment } from 'react';
import { When } from '@/components/ui/utils/when';
import { Avatar, AvatarImage } from '@/components/ui/avatar';
import { ChatTextarea, ChatTextareaProperties } from '@/components/chat/chat-textarea';
import { Model } from '@/hooks/use-models';
import { ComingSoon } from '@/components/ui/coming-soon';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from '@/components/ui/table';
import { InfoTooltip } from '@/components/info-tooltip';

const MAX_TITLE_LENGTH = 50;

const SOURCE_TOOLS = [
  { icon: Globe2, key: 'web' },
  { icon: NotebookIcon, key: 'notion' },
  { icon: History, key: 'history' },
  { icon: Projector, key: 'projects' },
] as const satisfies { icon: React.ElementType; key: SourceOrigin }[];

type ChatMessageProperties = {
  message: Message;
  onEdit: ChatTextareaProperties['onSubmit'];
  models: Model[];
  onCodeApply?: (code: string) => void;
};

/**
 * Format a number as a currency string, uses USD as the currency
 * @param value - The number to format
 * @returns A formatted currency string
 */
const formatCurrency = (value: number) => {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 6,
  });
};

const formatTokens = (value: number) => {
  return value.toLocaleString();
};

export function ChatMessage({ message, onEdit, models, onCodeApply }: ChatMessageProperties) {
  const isUser = message.role === MessageRole.User;
  const [activeSources, setActiveSources] = useState<SourceOrigin[]>(['web']);
  const [isEditing, setIsEditing] = useState(false);
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
  const [previousContentLength, setPreviousContentLength] = useState(message.content.length);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const thinkingContentReference = useRef<HTMLDivElement>(null);

  // Track content length changes to trigger animation
  useEffect(() => {
    // If content was empty and now has content, trigger transition animation
    if (previousContentLength === 0 && message.content.length > 0) {
      setIsTransitioning(true);
      const timer = setTimeout(() => {
        setIsTransitioning(false);
      }, 300); // Match this to the transition duration
      return () => clearTimeout(timer);
    }
    setPreviousContentLength(message.content.length);
  }, [message.content.length, previousContentLength]);

  const relevantSources = message.toolCalls
    ?.filter((toolCall) => activeSources.includes(toolCall.origin))
    .flatMap((toolCall) => toolCall.output.map((source) => ({ ...source, origin: toolCall.origin })));

  // Toggle thinking section with animation
  const toggleThinking = () => {
    setIsThinkingExpanded(!isThinkingExpanded);
  };

  return (
    <article
      className={cn('group/message flex flex-row items-start', isUser && 'space-x-reverse space-x-2 flex-row-reverse')}
    >
      <When condition={message.role === MessageRole.User}>
        {!isEditing && (
          <Avatar className="w-8 h-8 bg-neutral/20 rounded-full flex items-center justify-center">
            <AvatarImage src="/avatar-sample.png" alt="User" />
          </Avatar>
        )}
      </When>
      <div className={cn('flex flex-col space-y-2 overflow-y-auto', isEditing && 'w-full')}>
        {/* @ts-expect-error - FIXME: message.toolCalls is always defined */}
        {message.toolCalls?.length > 0 && relevantSources && (
          <>
            <div className="flex flex-row items-center space-x-2">
              <p className="text-lg">Sources</p>
              {SOURCE_TOOLS.filter((source) => message.toolCalls?.some((s) => s.origin === source.key)).map(
                (source) => {
                  const sourceCount = relevantSources.filter((s) => s.origin === source.key)?.length;
                  return (
                    <Badge
                      variant={'outline'}
                      data-active={activeSources.includes(source.key)}
                      onClick={() => {
                        setActiveSources((previous) => {
                          if (previous.includes(source.key)) {
                            return previous.filter((s) => s !== source.key);
                          }
                          return [...previous, source.key];
                        });
                      }}
                      key={source.key}
                      className="rounded-full hover:bg-neutral/10 data-[active=true]:bg-neutral/20 data-[active=true]:hover:bg-neutral/30 flex flex-row items-center space-x-1 cursor-pointer select-none transition-transform duration-200 ease-in-out"
                    >
                      <source.icon className="size-3" />
                      <p className="text-xs">{sourceCount}</p>
                      <p className="text-xs">{source.key}</p>
                    </Badge>
                  );
                },
              )}
              <Tooltip>
                <TooltipTrigger>
                  <Badge
                    variant={'outline'}
                    className="rounded-full hover:bg-neutral/10 data-[active=true]:bg-neutral/20 data-[active=true]:hover:bg-neutral/30 flex flex-row items-center space-x-1 cursor-pointer select-none transition-transform duration-200 ease-in-out"
                  >
                    <p className="text-xs">+</p>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Add sources <ComingSoon variant="tooltip" className="ml-1" />
                </TooltipContent>
              </Tooltip>
            </div>
            <When condition={relevantSources?.length === 0}>
              <p className="italic text-foreground/50 text-sm">No sources, expand your search</p>
            </When>
            <div className="grid grid-cols-4 gap-2">
              {relevantSources.slice(0, 3).map((source) => {
                const title =
                  source.title.length > MAX_TITLE_LENGTH
                    ? source.title.slice(0, MAX_TITLE_LENGTH).trim() + '...'
                    : source.title;

                const sourceUrl = new URL(source.link);
                const sourceDomain = sourceUrl.hostname.replace('www.', '').split('.').slice(0, -1).join('.');
                const sourceFaviconUrl = new URL(
                  'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=128',
                );
                sourceFaviconUrl.searchParams.set('url', source.link);

                return (
                  <HoverCard openDelay={100} closeDelay={100} key={title}>
                    <HoverCardTrigger asChild>
                      <a href={source.link} target="_blank">
                        <div
                          key={source.title}
                          className="flex flex-col bg-neutral/5 hover:bg-neutral/10 p-2 justify-between rounded-md h-24"
                        >
                          <p className="text-xs font-medium line-clamp-3">{source.title}</p>
                          <div className="flex flex-row items-center space-x-2">
                            <img src={sourceFaviconUrl.href} alt={sourceDomain} className="size-4 rounded-full" />
                            <p className="text-xs text-foreground/50 font-medium truncate">{sourceDomain}</p>
                          </div>
                        </div>
                      </a>
                    </HoverCardTrigger>
                    <HoverCardContent className="flex flex-col space-y-2">
                      <div className="flex flex-row items-center space-x-2">
                        <img src={sourceFaviconUrl.href} alt={sourceDomain} className="size-4 rounded-full" />
                        <p className="text-sm text-foreground/50">{sourceDomain}</p>
                      </div>
                      <p className="text-sm font-medium">{source.title}</p>
                      <p className="text-sm">{source.snippet}</p>
                    </HoverCardContent>
                  </HoverCard>
                );
              })}
              {relevantSources.length > 3 && (
                <Sheet>
                  <SheetTrigger className="flex flex-col bg-neutral/5 hover:bg-neutral/10 p-2 justify-between rounded-md h-24">
                    <div className="flex flex-row items-center space-x-[1px] flex-wrap">
                      {relevantSources.slice(3, 9).map((source) => {
                        const sourceUrl = new URL(source.link);
                        const sourceDomain = sourceUrl.hostname.replace('www.', '').split('.').slice(0, -1).join('.');
                        const sourceFaviconUrl = new URL(
                          'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=128',
                        );
                        sourceFaviconUrl.searchParams.set('url', source.link);
                        return (
                          <img
                            key={source.title}
                            src={sourceFaviconUrl.href}
                            alt={sourceDomain}
                            className="size-4 sm:w-5 sm:h-5 rounded-full"
                          />
                        );
                      })}
                      {relevantSources.length > 9 && (
                        <div className="flex items-center justify-center size-4 sm:w-5 sm:h-5 rounded-full bg-neutral/20 text-[8px] sm:text-[8px] text-foreground/50 font-medium">
                          +{relevantSources.length - 9}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-row items-center text-foreground/50 font-medium">
                      <p className="text-xs">Show all</p>
                      <ChevronRight className="size-4" />
                    </div>
                  </SheetTrigger>
                  <SheetContent className="overflow-y-scroll">
                    <SheetHeader>
                      <SheetTitle>{relevantSources.length} Sources</SheetTitle>
                    </SheetHeader>
                    <SheetDescription asChild>
                      <div className="flex flex-col items-center space-y-2 flex-wrap mt-2 overflow-y-scroll">
                        {relevantSources.map((source) => {
                          const sourceUrl = new URL(source.link);
                          const sourceDomain = sourceUrl.hostname.replace('www.', '').split('.').slice(0, -1).join('.');
                          const sourceFaviconUrl = new URL(
                            'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=128',
                          );
                          sourceFaviconUrl.searchParams.set('url', source.link);
                          return (
                            <a href={source.link} target="_blank" key={source.link} className="w-full">
                              <div
                                key={source.title}
                                className="w-full bg-neutral/5 hover:bg-neutral/10 p-2 rounded-md flex flex-col space-y-2"
                              >
                                <p className="text-sm font-medium text-foreground">{source.title}</p>
                                <div className="flex flex-row items-center space-x-2">
                                  <img src={sourceFaviconUrl.href} alt={sourceDomain} className="size-4 rounded-full" />
                                  <p className="text-xs text-foreground/50 font-medium">{sourceDomain}</p>
                                </div>
                                <p className="text-xs text-foreground">{source.snippet}</p>
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    </SheetDescription>
                  </SheetContent>
                </Sheet>
              )}
            </div>
            {message.content && <p className="text-lg">Answer</p>}
          </>
        )}
        <div className={cn(isUser ? 'bg-neutral/20 rounded-xl' : 'pt-[6px]', isEditing && 'rounded-lg')}>
          {/* Thinking content section with animation */}
          {/* TODO: remove trim when backend is fixed to trim thinking tags */}
          {!isUser && message.thinking?.trim() && (
            <div
              className={cn(
                'overflow-hidden transition-[margin-bottom,opacity] duration-300 ease-out',
                isTransitioning && 'translate-y-0 opacity-100 animate-in fade-in slide-in-from-bottom-2',
                isThinkingExpanded && 'mb-2',
              )}
            >
              {/* Show the collapsible button when message has content */}
              {message.content[0].type === 'text' && message.content[0].text.length > 0 && (
                <div>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={toggleThinking}
                    className="text-foreground/60 hover:text-foreground/80 font-medium hover:bg-transparent -ml-3"
                  >
                    <ChevronRight
                      className={cn('transition-transform duration-300 ease-in-out', isThinkingExpanded && 'rotate-90')}
                    />
                    Thought Process
                  </Button>
                </div>
              )}

              {/* Show "Thinking..." label when no content */}
              {message.content[0].type === 'text' && message.content[0].text.length === 0 && (
                <div
                  className={cn(
                    'text-foreground/60 font-medium text-sm mb-2 transition-all duration-300 ease-out',
                    isTransitioning && 'opacity-0 translate-y-2',
                  )}
                >
                  Thinking...
                </div>
              )}

              {/* Always render thinking content, but conditionally show it */}
              <div
                ref={thinkingContentReference}
                className={cn(
                  'pl-5 border-l border-foreground/20 text-foreground/60 text-sm italic whitespace-pre-wrap',
                  'transition-all duration-300 ease-in-out origin-top',
                  message.content[0].type === 'text' && message.content[0].text.length > 0 && !isThinkingExpanded
                    ? 'max-h-0 opacity-0 scale-y-95 transform'
                    : 'max-h-[2000px] opacity-100 scale-y-100 transform',
                )}
              >
                {message.thinking.trim()}
              </div>
            </div>
          )}

          <When condition={isUser && isEditing}>
            <ChatTextarea
              initialContent={message.content}
              onSubmit={async (event) => {
                onEdit(event);
                setIsEditing(false);
              }}
              onEscapePressed={() => {
                setIsEditing(false);
              }}
              models={models}
            />
          </When>
          <When condition={!isEditing}>
            <div className={cn('flex flex-col gap-2', isUser && 'p-2')}>
              {message.content.map((content) => {
                if (content.type === 'image_url') {
                  return (
                    <HoverCard openDelay={100} closeDelay={100} key={content.image_url.url}>
                      <HoverCardTrigger asChild>
                        <img
                          src={content.image_url.url}
                          alt="Image in message"
                          className="h-16 w-auto object-cover rounded-md ml-auto border-[1px] cursor-zoom-in"
                        />
                      </HoverCardTrigger>
                      <HoverCardContent className="p-0 size-auto max-w-screen overflow-hidden">
                        <img src={content.image_url.url} alt="Image in message" className="h-48 md:h-96" />
                      </HoverCardContent>
                    </HoverCard>
                  );
                }

                if (content.type === 'text') {
                  return (
                    <Fragment key={content.text}>
                      <MarkdownViewer
                        onCodeApply={isUser ? undefined : onCodeApply}
                      >{`${content.text}${!isUser && message.status === MessageStatus.Pending ? '●' : ''}`}</MarkdownViewer>

                      {!isUser && message.status === MessageStatus.Success && (
                        <div className="flex flex-row justify-start items-center text-foreground/50 mt-2 space-x-2">
                          <CopyButton size="xs" text={content.text} tooltip="Copy message" />
                          {message.usage && (
                            <HoverCard openDelay={100} closeDelay={100}>
                              <HoverCardTrigger className="flex flex-row items-center">
                                <Badge
                                  variant="outline"
                                  className="cursor-help text-inherit font-medium hover:bg-neutral/20"
                                >
                                  {formatCurrency(message.usage.totalCost)}
                                </Badge>
                              </HoverCardTrigger>
                              <HoverCardContent className="w-auto p-2">
                                <div className="flex flex-col space-y-2">
                                  <h4 className="font-medium p-2 pb-0">Usage Details</h4>
                                  <Table className="">
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Metric</TableHead>
                                        <TableHead>Tokens</TableHead>
                                        <TableHead>Cost</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      <TableRow>
                                        <TableCell className="flex flex-row items-center space-x-1">
                                          <span>Input</span>
                                          <InfoTooltip tooltip="The number of tokens in the input prompt. This includes the user prompt, system message, and any previous messages." />
                                        </TableCell>
                                        <TableCell>{formatTokens(message.usage.inputTokens)}</TableCell>
                                        <TableCell>{formatCurrency(message.usage.inputTokensCost)}</TableCell>
                                      </TableRow>
                                      <TableRow>
                                        <TableCell className="flex flex-row items-center space-x-1">
                                          <span>Output</span>
                                          <InfoTooltip tooltip="The number of tokens in the output response." />
                                        </TableCell>
                                        <TableCell>{formatTokens(message.usage.outputTokens)}</TableCell>
                                        <TableCell>{formatCurrency(message.usage.outputTokensCost)}</TableCell>
                                      </TableRow>
                                      {message.usage.cachedReadTokens > 0 && (
                                        <TableRow>
                                          <TableCell className="flex flex-row items-center space-x-1">
                                            <span>Cached Read</span>
                                            <InfoTooltip tooltip="The number of tokens read from the prompt cache. This improves performance by avoiding re-processing the same prompt." />
                                          </TableCell>
                                          <TableCell>{formatTokens(message.usage.cachedReadTokens)}</TableCell>
                                          <TableCell>{formatCurrency(message.usage.cachedReadTokensCost)}</TableCell>
                                        </TableRow>
                                      )}
                                      {message.usage.cachedWriteTokens > 0 && (
                                        <TableRow>
                                          <TableCell className="flex flex-row items-center space-x-1">
                                            <span>Cached Write</span>
                                            <InfoTooltip tooltip="The number of tokens written to the prompt cache. This improves performance by avoiding re-processing the same prompt." />
                                          </TableCell>
                                          <TableCell>{formatTokens(message.usage.cachedWriteTokens)}</TableCell>
                                          <TableCell>{formatCurrency(message.usage.cachedWriteTokensCost)}</TableCell>
                                        </TableRow>
                                      )}
                                    </TableBody>
                                    <TableFooter className="rounded-b-md overflow-clip">
                                      <TableRow>
                                        <TableCell>Total</TableCell>
                                        <TableCell>
                                          {formatTokens(
                                            message.usage.inputTokens +
                                              message.usage.outputTokens +
                                              message.usage.cachedReadTokens +
                                              message.usage.cachedWriteTokens,
                                          )}
                                        </TableCell>
                                        <TableCell>{formatCurrency(message.usage.totalCost)}</TableCell>
                                      </TableRow>
                                    </TableFooter>
                                    <TableCaption>All prices are in USD</TableCaption>
                                  </Table>
                                </div>
                              </HoverCardContent>
                            </HoverCard>
                          )}
                        </div>
                      )}
                    </Fragment>
                  );
                }
              })}
            </div>
          </When>
        </div>
      </div>
      <div className="mt-auto">
        {isUser && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="rounded-full transition-opacity group-hover/message:opacity-100 opacity-0 focus:opacity-100"
                onClick={() => {
                  setIsEditing((editing) => !editing);
                }}
              >
                <Edit className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isEditing ? 'Stop editing' : 'Edit message'}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </article>
  );
}
