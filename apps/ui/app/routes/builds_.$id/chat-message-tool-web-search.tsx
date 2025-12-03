import { ChevronRight } from 'lucide-react';
import type { UIToolInvocation } from 'ai';
import type { MyTools } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { Sheet, SheetDescription, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '#components/ui/sheet.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '#components/ui/hover-card.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { Button } from '#components/ui/button.js';
import { extractDomainFromUrl, createFaviconUrl } from '#utils/url.utils.js';

export function ChatMessageToolWebSearch({
  part,
}: {
  readonly part: UIToolInvocation<MyTools[typeof toolName.webSearch]>;
}): React.JSX.Element | undefined {
  switch (part.state) {
    case 'input-available':
    case 'input-streaming': {
      const { input } = part;
      return (
        <div className="flex flex-col gap-2">
          <p className="text-lg">Sources</p>
          <p className="border-l pl-2 text-sm text-foreground/50 italic">{input?.query ?? ''}</p>
        </div>
      );
    }

    case 'output-error': {
      return <div>Web search failed</div>;
    }

    case 'output-available': {
      const { input } = part;
      const relevantSources = part.output;
      return (
        <>
          <div className="flex flex-col">
            <Collapsible>
              <div className="flex flex-row items-baseline gap-2">
                <p className="text-lg">Sources</p>
                <CollapsibleTrigger asChild>
                  <Button variant="link" className="p-0 text-xs">
                    Show query
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <p className="border-l pl-2 text-sm text-foreground/50 italic">{JSON.stringify(input.query)}</p>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {relevantSources.slice(0, 3).map((source, index) => {
              const sourceDomain = extractDomainFromUrl(source.url);
              const sourceFaviconUrl = createFaviconUrl(source.url);

              return (
                // eslint-disable-next-line react/no-array-index-key -- the array order is stable so using the index is safe
                <HoverCard key={`${source.title}-${index}`} openDelay={100} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <a href={source.url} target="_blank" rel="noreferrer">
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
                  <HoverCardContent className="flex max-h-40 flex-col space-y-2 overflow-y-auto">
                    <div className="flex flex-row items-center gap-2">
                      <img src={sourceFaviconUrl} alt={sourceDomain} className="size-4 rounded-full" />
                      <p className="text-sm text-foreground/50">{sourceDomain}</p>
                    </div>
                    <p className="text-sm font-medium">{source.title}</p>
                    <p className="text-sm">{source.content}</p>
                  </HoverCardContent>
                </HoverCard>
              );
            })}
            {relevantSources.length > 3 && (
              <Sheet>
                <SheetTrigger className="flex h-24 flex-col justify-between rounded-md bg-neutral/5 p-2 hover:bg-neutral/10">
                  <div className="flex flex-row flex-wrap items-center gap-px">
                    {relevantSources.slice(3, 9).map((source) => {
                      const sourceDomain = extractDomainFromUrl(source.url);
                      const sourceFaviconUrl = createFaviconUrl(source.url);

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
                        const sourceDomain = extractDomainFromUrl(source.url);
                        const sourceFaviconUrl = createFaviconUrl(source.url);

                        return (
                          <a key={source.url} href={source.url} target="_blank" className="w-full" rel="noreferrer">
                            <div
                              key={source.title}
                              className="flex w-full flex-col space-y-2 rounded-md bg-neutral/5 p-2 hover:bg-neutral/10"
                            >
                              <p className="text-sm font-medium text-foreground">{source.title}</p>
                              <div className="flex flex-row items-center gap-2">
                                <img src={sourceFaviconUrl} alt={sourceDomain} className="size-4 rounded-full" />
                                <p className="text-xs font-medium text-foreground/50">{sourceDomain}</p>
                              </div>
                              <p className="text-xs text-foreground">{source.content}</p>
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
