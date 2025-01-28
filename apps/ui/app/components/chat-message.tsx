import { Avatar } from '@radix-ui/react-avatar';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ChevronRight, Edit } from 'lucide-react';
import { CopyButton } from '@/components/copy-button';
import { Taucad } from '@/components/icons/taucad';
import { Button } from '@/components/ui/button';
import { MessageSchema, MessageRole, MessageStatus } from '@/hooks/use-chat';
import { cn } from '@/utils/ui';
import { MarkdownViewer } from './markdown-viewer';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import { Sheet, SheetDescription, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';

const MAX_TITLE_LENGTH = 50;

export function ChatMessage({ message }: { message: MessageSchema }) {
  const isUser = message.role === MessageRole.User;

  return (
    <article className={cn('group flex flex-row space-x-2 items-start', isUser && 'space-x-reverse flex-row-reverse')}>
      <Avatar className="w-8 h-8 bg-neutral-200 rounded-full flex items-center justify-center">
        {message.role === MessageRole.Assistant ? <Taucad /> : <img src="/avatar-sample.png" alt="User" />}
      </Avatar>
      <div className="flex flex-col space-y-2">
        {message.toolCall && (
          <>
            <p className="text-lg">Sources</p>
            <div className="grid grid-cols-4 gap-2">
              {message.toolCall.output.slice(0, 3).map((source) => {
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
                          className="flex flex-col bg-neutral-50 hover:bg-neutral-100 p-2 justify-between rounded-md h-24"
                        >
                          <p className="text-xs font-medium line-clamp-3">{source.title}</p>
                          <div className="flex flex-row items-center space-x-2">
                            <img src={sourceFaviconUrl.href} alt={sourceDomain} className="w-4 h-4 rounded-full" />
                            <p className="text-xs text-foreground-500 font-medium truncate">{sourceDomain}</p>
                          </div>
                        </div>
                      </a>
                    </HoverCardTrigger>
                    <HoverCardContent className="flex flex-col space-y-2">
                      <div className="flex flex-row items-center space-x-2">
                        <img src={sourceFaviconUrl.href} alt={sourceDomain} className="w-4 h-4 rounded-full" />
                        <p className="text-sm text-foreground-500">{sourceDomain}</p>
                      </div>
                      <p className="text-sm font-medium">{source.title}</p>
                      <p className="text-sm">{source.snippet}</p>
                    </HoverCardContent>
                  </HoverCard>
                );
              })}
              {message.toolCall.output.length > 3 && (
                <Sheet>
                  <SheetTrigger className="flex flex-col bg-neutral-50 hover:bg-neutral-100 p-2 justify-between rounded-md h-24">
                    <div className="flex flex-row items-center space-x-[1px] flex-wrap">
                      {message.toolCall.output.slice(3).map((source) => {
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
                            className="w-5 h-5 rounded-full"
                          />
                        );
                      })}
                    </div>
                    <div className="flex flex-row items-center text-foreground-500 font-medium">
                      <p className="text-xs">Show all</p>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </SheetTrigger>
                  <SheetContent className="overflow-y-scroll">
                    <SheetHeader>
                      <SheetTitle>{message.toolCall.output.length} Sources</SheetTitle>
                    </SheetHeader>
                    <SheetDescription asChild>
                      <div className="flex flex-col items-center space-y-2 flex-wrap mt-2 overflow-y-scroll">
                        {message.toolCall.output.map((source) => {
                          const sourceUrl = new URL(source.link);
                          const sourceDomain = sourceUrl.hostname.replace('www.', '').split('.').slice(0, -1).join('.');
                          const sourceFaviconUrl = new URL(
                            'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=128',
                          );
                          sourceFaviconUrl.searchParams.set('url', source.link);
                          return (
                            <a href={source.link} target="_blank" key={source.title}>
                              <div
                                key={source.title}
                                className="w-full bg-neutral-50 hover:bg-neutral-100 p-2 rounded-md flex flex-col space-y-2"
                              >
                                <p className="text-sm font-medium text-foreground">{source.title}</p>
                                <div className="flex flex-row items-center space-x-2">
                                  <img
                                    src={sourceFaviconUrl.href}
                                    alt={sourceDomain}
                                    className="w-4 h-4 rounded-full"
                                  />
                                  <p className="text-xs text-foreground-500 font-medium">{sourceDomain}</p>
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
        <div className={cn(isUser ? 'bg-neutral-200 p-2 rounded-xl' : 'pt-[6px]')}>
          <MarkdownViewer>{`${message.content}${message.status === MessageStatus.Pending ? '●' : ''}`}</MarkdownViewer>
        </div>
        {!isUser && message.status === MessageStatus.Success && (
          <div className="flex flex-row justify-start items-center text-foreground-500">
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
            >
              <Edit className="w-4 h-4" />
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
