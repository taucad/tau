import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ChevronRight, Edit, Globe2, History, NotebookIcon, Projector } from 'lucide-react';
import { CopyButton } from '@/components/copy-button';
import { Button } from '@/components/ui/button';
import { MessageSchema, MessageRole, MessageStatus, SourceOrigin } from '@/hooks/use-chat';
import { cn } from '@/utils/ui';
import { MarkdownViewer } from '@/components/markdown-viewer';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import { Sheet, SheetDescription, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect, useRef } from 'react';
import { When } from '@/components/ui/utils/when';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarImage } from '@/components/ui/avatar';

const MAX_TITLE_LENGTH = 50;

const SOURCE_TOOLS = [
  { icon: Globe2, key: 'web' },
  { icon: NotebookIcon, key: 'notion' },
  { icon: History, key: 'history' },
  { icon: Projector, key: 'projects' },
] as const satisfies { icon: React.ElementType; key: SourceOrigin }[];

type ChatMessageProperties = {
  message: MessageSchema;
  onEdit: (content: string) => void;
};

export function ChatMessage({ message, onEdit }: ChatMessageProperties) {
  const isUser = message.role === MessageRole.User;
  const [content, setContent] = useState(message.content);
  const [activeSources, setActiveSources] = useState<SourceOrigin[]>(['web']);
  const [isEditing, setIsEditing] = useState(false);
  const textareaReference = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (isEditing && textareaReference.current) {
      const length = textareaReference.current.value.length;
      textareaReference.current.setSelectionRange(0, length);
    }
  }, [isEditing]);

  const relevantSources = message.toolCalls
    ?.filter((toolCall) => activeSources.includes(toolCall.origin))
    .flatMap((toolCall) => toolCall.output.map((source) => ({ ...source, origin: toolCall.origin })));

  return (
    <article className={cn('group flex flex-row space-x-2 items-start', isUser && 'space-x-reverse flex-row-reverse')}>
      <When condition={message.role === MessageRole.User}>
        <Avatar className="w-8 h-8 bg-neutral/20 rounded-full flex items-center justify-center">
          <AvatarImage src="/avatar-sample.png" alt="User" />
        </Avatar>
      </When>
      <div className="flex flex-col space-y-2">
        {message.toolCalls?.length > 0 && relevantSources && (
          <>
            <div className="flex flex-row items-center space-x-2">
              <p className="text-lg">Sources</p>
              {SOURCE_TOOLS.filter((source) => message.toolCalls?.some((s) => s.origin === source.key)).map(
                (source) => {
                  const sourceCount = relevantSources.filter((s) => s.origin === source.key).length;
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
                      className="rounded-full hover:bg-neutral/10 data-[active=true]:bg-neutral/20 data-[active=true]:hover:bg-neutral/30 flex flex-row items-center space-x-1 cursor-pointer select-none transition-all duration-200 ease-in-out"
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
                    className="rounded-full hover:bg-neutral/10 data-[active=true]:bg-neutral/20 data-[active=true]:hover:bg-neutral/30 flex flex-row items-center space-x-1 cursor-pointer select-none transition-all duration-200 ease-in-out"
                  >
                    <p className="text-xs">+</p>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Add sources</p>
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
        <div className={cn(isUser ? 'bg-neutral/20 rounded-xl' : 'pt-[6px]')}>
          <When condition={isUser && isEditing}>
            <Textarea
              ref={textareaReference}
              className="p-2 shadow-none border-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-none text-sm md:text-md"
              autoFocus
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  onEdit(content);
                  setIsEditing(false);
                }
                if (event.key === 'Escape') {
                  setIsEditing(false);
                }
              }}
            />
          </When>
          <When condition={!isEditing}>
            <div className={cn(isUser && 'p-2')}>
              <MarkdownViewer>{`${message.content}${message.status === MessageStatus.Pending ? '●' : ''}`}</MarkdownViewer>
            </div>
          </When>
        </div>
        {!isUser && message.status === MessageStatus.Success && (
          <div className="flex flex-row justify-start items-center text-foreground/50">
            <CopyButton size="sm" text={message.content} />
          </div>
        )}
      </div>
      {isUser && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full transition-opacity group-hover:opacity-100 opacity-0"
              onClick={() => {
                setIsEditing((editing) => !editing);
              }}
            >
              <Edit className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Edit</p>
          </TooltipContent>
        </Tooltip>
      )}
    </article>
  );
}
