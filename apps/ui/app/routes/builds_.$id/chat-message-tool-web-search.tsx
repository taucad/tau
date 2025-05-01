import { ChevronRight } from 'lucide-react';
import type { ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import type { JSX } from 'react';
import { Sheet, SheetDescription, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet.js';
import { Badge } from '@/components/ui/badge.js';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip.js';
import { ComingSoon } from '@/components/ui/coming-soon.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible.js';
import { Button } from '@/components/ui/button.js';
import { extractDomainFromUrl, createFaviconUrl } from '@/utils/url.js';

// Const SOURCE_TOOLS = [
//   { icon: Globe2, key: 'web' },
//   { icon: NotebookIcon, key: 'notion' },
//   { icon: History, key: 'history' },
//   { icon: Projector, key: 'projects' },
// ] as const satisfies { icon: React.ElementType; key: SourceOrigin }[];

export function ChatMessageToolWebSearch({ part }: { readonly part: ToolInvocationUIPart }): JSX.Element {
  switch (part.toolInvocation.state) {
    case 'call':
    case 'partial-call': {
      return (
        <div className="flex flex-col gap-2">
          <p className="text-lg">Sources</p>
          <p className="border-l pl-2 text-sm text-foreground/50 italic">{part.toolInvocation.args?.input}</p>
        </div>
      );
    }

    case 'result': {
      // Const [activeSources, setActiveSources] = useState<SourceOrigin[]>(['web']);

      const relevantSources = part.toolInvocation.result as Array<{
        title: string;
        link: string;
        snippet: string;
      }>;
      return (
        <>
          <div className="flex flex-col">
            <Collapsible>
              <div className="flex flex-row items-center gap-2">
                <p className="text-lg">Sources</p>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge
                      variant="outline"
                      className="flex cursor-pointer flex-row items-center gap-1 rounded-full transition-transform duration-200 ease-in-out select-none hover:bg-neutral/10 data-[active=true]:bg-neutral/20 data-[active=true]:hover:bg-neutral/30"
                    >
                      <p className="text-xs">+</p>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Add sources <ComingSoon variant="tooltip" className="ml-1" />
                  </TooltipContent>
                </Tooltip>
                <CollapsibleTrigger asChild>
                  <Button variant="link" className="p-0 text-xs">
                    Show query
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <p className="border-l pl-2 text-sm text-foreground/50 italic">{part.toolInvocation.args.input}</p>
              </CollapsibleContent>
            </Collapsible>
            {/* {SOURCE_TOOLS.filter((source) => part.toolCalls?.some((s) => s.origin === source.key)).map((source) => {
            {/* {SOURCE_TOOLS.filter((source) => part.toolCalls?.some((s) => s.origin === source.key)).map((source) => {
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
        })} */}
          </div>
          {/* <When condition={relevantSources?.length === 0}>
        <p className="text-sm text-foreground/50 italic">No sources, expand your search</p>
      </When> */}
          <div className="grid grid-cols-4 gap-2">
            {relevantSources.slice(0, 3).map((source, index) => {
              const sourceDomain = extractDomainFromUrl(source.link);
              const sourceFaviconUrl = createFaviconUrl(source.link);

              return (
                // eslint-disable-next-line react/no-array-index-key -- the array order is stable so using the index is safe
                <HoverCard key={`${source.title}-${index}`} openDelay={100} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <a href={source.link} target="_blank" rel="noreferrer">
                      <div
                        key={source.title}
                        className="flex h-24 flex-col justify-between rounded-md bg-neutral/5 p-2 hover:bg-neutral/10"
                      >
                        <p className="line-clamp-3 text-xs font-medium">{source.title}</p>
                        <div className="flex flex-row items-center gap-2">
                          <img src={sourceFaviconUrl} alt={sourceDomain} className="size-4 rounded-full" />
                          <p className="truncate text-xs font-medium text-foreground/50">{sourceDomain}</p>
                        </div>
                      </div>
                    </a>
                  </HoverCardTrigger>
                  <HoverCardContent className="flex flex-col space-y-2">
                    <div className="flex flex-row items-center gap-2">
                      <img src={sourceFaviconUrl} alt={sourceDomain} className="size-4 rounded-full" />
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
                      const sourceDomain = extractDomainFromUrl(source.link);
                      const sourceFaviconUrl = createFaviconUrl(source.link);

                      return (
                        <img
                          key={source.title}
                          src={sourceFaviconUrl}
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
                        const sourceDomain = extractDomainFromUrl(source.link);
                        const sourceFaviconUrl = createFaviconUrl(source.link);

                        return (
                          <a key={source.link} href={source.link} target="_blank" className="w-full" rel="noreferrer">
                            <div
                              key={source.title}
                              className="flex w-full flex-col space-y-2 rounded-md bg-neutral/5 p-2 hover:bg-neutral/10"
                            >
                              <p className="text-sm font-medium text-foreground">{source.title}</p>
                              <div className="flex flex-row items-center gap-2">
                                <img src={sourceFaviconUrl} alt={sourceDomain} className="size-4 rounded-full" />
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
          <p className="text-lg">Answer</p>
        </>
      );
    }
  }
}
