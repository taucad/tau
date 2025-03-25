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
import { ChatTextarea, ChatTextareaProperties } from '@/components/chat/chat-textarea';
import { Model } from '@/hooks/use-models';
import { ComingSoon } from '@/components/ui/coming-soon';
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { InfoTooltip } from '@/components/info-tooltip';
import { SvgIcon } from '@/components/icons/svg-icon';
import { ModelProvider } from '@/types/cad';

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
      className={cn(
        'group/message flex w-full flex-row items-start',
        isUser && 'flex-row-reverse gap-2 space-x-reverse',
      )}
    >
      <div
        className={cn(
          'flex flex-col space-y-2 overflow-y-auto',
          // Only make the text area full when editing.
          isEditing && 'w-full',
          // Only the assistant messages should take up the full width.
          !isUser && 'w-full',
        )}
      >
        {/* @ts-expect-error - FIXME: message.toolCalls is always defined */}
        {message.toolCalls?.length > 0 && relevantSources && (
          <>
            <div className="flex flex-row items-center gap-2">
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
                      className="flex cursor-pointer flex-row items-center gap-1 rounded-full transition-transform duration-200 ease-in-out select-none hover:bg-neutral/10 data-[active=true]:bg-neutral/20 data-[active=true]:hover:bg-neutral/30"
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
                    className="flex cursor-pointer flex-row items-center gap-1 rounded-full transition-transform duration-200 ease-in-out select-none hover:bg-neutral/10 data-[active=true]:bg-neutral/20 data-[active=true]:hover:bg-neutral/30"
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
              <p className="text-sm text-foreground/50 italic">No sources, expand your search</p>
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
                      <a href={source.link} target="_blank" rel="noreferrer">
                        <div
                          key={source.title}
                          className="flex h-24 flex-col justify-between rounded-md bg-neutral/5 p-2 hover:bg-neutral/10"
                        >
                          <p className="line-clamp-3 text-xs font-medium">{source.title}</p>
                          <div className="flex flex-row items-center gap-2">
                            <img src={sourceFaviconUrl.href} alt={sourceDomain} className="size-4 rounded-full" />
                            <p className="truncate text-xs font-medium text-foreground/50">{sourceDomain}</p>
                          </div>
                        </div>
                      </a>
                    </HoverCardTrigger>
                    <HoverCardContent className="flex flex-col space-y-2">
                      <div className="flex flex-row items-center gap-2">
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
                  <SheetTrigger className="flex h-24 flex-col justify-between rounded-md bg-neutral/5 p-2 hover:bg-neutral/10">
                    <div className="flex flex-row flex-wrap items-center gap-px">
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
                            className="size-4 rounded-full sm:h-5 sm:w-5"
                          />
                        );
                      })}
                      {relevantSources.length > 9 && (
                        <div className="flex size-4 items-center justify-center rounded-full bg-neutral/20 text-[8px] font-medium text-foreground/50 sm:h-5 sm:w-5 sm:text-[8px]">
                          +{relevantSources.length - 9}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-row items-center font-medium text-foreground/50">
                      <p className="text-xs">Show all</p>
                      <ChevronRight className="size-4" />
                    </div>
                  </SheetTrigger>
                  <SheetContent>
                    <SheetHeader>
                      <SheetTitle>{relevantSources.length} Sources</SheetTitle>
                    </SheetHeader>
                    <SheetDescription asChild>
                      <div className="grid grid-cols-1 flex-wrap items-center gap-2 overflow-y-scroll p-4 pt-0">
                        {relevantSources.map((source) => {
                          const sourceUrl = new URL(source.link);
                          const sourceDomain = sourceUrl.hostname.replace('www.', '').split('.').slice(0, -1).join('.');
                          const sourceFaviconUrl = new URL(
                            'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=128',
                          );
                          sourceFaviconUrl.searchParams.set('url', source.link);
                          return (
                            <a href={source.link} target="_blank" key={source.link} className="w-full" rel="noreferrer">
                              <div
                                key={source.title}
                                className="flex w-full flex-col space-y-2 rounded-md bg-neutral/5 p-2 hover:bg-neutral/10"
                              >
                                <p className="text-sm font-medium text-foreground">{source.title}</p>
                                <div className="flex flex-row items-center gap-2">
                                  <img src={sourceFaviconUrl.href} alt={sourceDomain} className="size-4 rounded-full" />
                                  <p className="text-xs font-medium text-foreground/50">{sourceDomain}</p>
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
        <div className={cn(isUser ? 'rounded-xl bg-neutral/20' : 'pt-[6px]', isEditing && 'rounded-lg')}>
          {/* Thinking content section with animation */}
          {/* TODO: remove trim when backend is fixed to trim thinking tags */}
          {!isUser && message.thinking?.trim() && (
            <div
              className={cn(
                'overflow-hidden transition-[margin-bottom,opacity] duration-300 ease-out',
                isTransitioning && 'translate-y-0 animate-in opacity-100 fade-in slide-in-from-bottom-2',
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
                    className="-ml-3 font-medium text-foreground/60 hover:bg-transparent hover:text-foreground/80"
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
                    'mb-2 text-sm font-medium text-foreground/60 transition-all duration-300 ease-out',
                    isTransitioning && 'translate-y-2 opacity-0',
                  )}
                >
                  Thinking...
                </div>
              )}

              {/* Always render thinking content, but conditionally show it */}
              <div
                ref={thinkingContentReference}
                className={cn(
                  'border-l border-foreground/20 pl-5 text-sm whitespace-pre-wrap text-foreground/60 italic',
                  'origin-top transition-all duration-300 ease-in-out',
                  message.content[0].type === 'text' && message.content[0].text.length > 0 && !isThinkingExpanded
                    ? 'max-h-0 scale-y-95 transform opacity-0'
                    : 'max-h-[2000px] scale-y-100 transform opacity-100',
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
                          alt="Chat message"
                          className="ml-auto h-16 w-auto cursor-zoom-in rounded-md border bg-muted object-cover"
                        />
                      </HoverCardTrigger>
                      <HoverCardContent className="size-auto max-w-screen overflow-hidden p-0">
                        <img src={content.image_url.url} alt="Chat message zoomed" className="h-48 md:h-96" />
                      </HoverCardContent>
                    </HoverCard>
                  );
                }

                if (content.type === 'text') {
                  const model = models.find((model) => model.id === message.model);
                  return (
                    <Fragment key={content.text}>
                      <MarkdownViewer
                        onCodeApply={isUser ? undefined : onCodeApply}
                      >{`${content.text}${!isUser && message.status === MessageStatus.Pending ? '●' : ''}`}</MarkdownViewer>

                      {!isUser && message.status === MessageStatus.Success && (
                        <div className="mt-2 flex flex-row items-center justify-start gap-2 text-foreground/50">
                          <CopyButton size="xs" text={content.text} tooltip="Copy message" />
                          {message.usage && (
                            <HoverCard openDelay={100} closeDelay={100}>
                              <HoverCardTrigger className="flex flex-row items-center">
                                <Badge
                                  variant="outline"
                                  className="cursor-help font-medium text-inherit hover:bg-neutral/20"
                                >
                                  {formatCurrency(message.usage.totalCost)}
                                </Badge>
                              </HoverCardTrigger>
                              <HoverCardContent className="w-auto p-2">
                                <div className="flex flex-col space-y-1">
                                  <div className="flex flex-row items-baseline justify-between gap-4 p-2 pb-0">
                                    <h4 className="font-medium">Usage Details</h4>
                                    {model && (
                                      <div className="flex items-baseline gap-2 text-xs">
                                        <SvgIcon
                                          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- model.provider is always defined
                                          id={model.provider as ModelProvider}
                                          className="size-4 translate-y-[0.25em]"
                                        />
                                        <span className="font-mono">{model.name}</span>
                                      </div>
                                    )}
                                  </div>
                                  <Table className="overflow-clip rounded-md">
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Metric</TableHead>
                                        <TableHead>Tokens</TableHead>
                                        <TableHead>Cost</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      <TableRow>
                                        <TableCell className="flex flex-row items-center gap-1">
                                          <span>Input</span>
                                          <InfoTooltip tooltip="The number of tokens in the input prompt. This includes the user prompt, system message, and any previous messages." />
                                        </TableCell>
                                        <TableCell>{formatTokens(message.usage.inputTokens)}</TableCell>
                                        <TableCell>{formatCurrency(message.usage.inputTokensCost)}</TableCell>
                                      </TableRow>
                                      <TableRow>
                                        <TableCell className="flex flex-row items-center gap-1">
                                          <span>Output</span>
                                          <InfoTooltip tooltip="The number of tokens in the output response." />
                                        </TableCell>
                                        <TableCell>{formatTokens(message.usage.outputTokens)}</TableCell>
                                        <TableCell>{formatCurrency(message.usage.outputTokensCost)}</TableCell>
                                      </TableRow>
                                      {message.usage.cachedReadTokens > 0 && (
                                        <TableRow>
                                          <TableCell className="flex flex-row items-center gap-1">
                                            <span>Cached Read</span>
                                            <InfoTooltip tooltip="The number of tokens read from the prompt cache. This improves performance by avoiding re-processing the same prompt." />
                                          </TableCell>
                                          <TableCell>{formatTokens(message.usage.cachedReadTokens)}</TableCell>
                                          <TableCell>{formatCurrency(message.usage.cachedReadTokensCost)}</TableCell>
                                        </TableRow>
                                      )}
                                      {message.usage.cachedWriteTokens > 0 && (
                                        <TableRow>
                                          <TableCell className="flex flex-row items-center gap-1">
                                            <span>Cached Write</span>
                                            <InfoTooltip tooltip="The number of tokens written to the prompt cache. This improves performance by avoiding re-processing the same prompt." />
                                          </TableCell>
                                          <TableCell>{formatTokens(message.usage.cachedWriteTokens)}</TableCell>
                                          <TableCell>{formatCurrency(message.usage.cachedWriteTokensCost)}</TableCell>
                                        </TableRow>
                                      )}
                                    </TableBody>
                                    <TableFooter className="overflow-clip rounded-b-md">
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

                // eslint-disable-next-line unicorn/no-null -- null is required by React
                return null;
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
                className="rounded-full opacity-0 transition-opacity group-hover/message:opacity-100 focus:opacity-100"
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
