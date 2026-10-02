import { useState } from 'react';
import { ChevronRight, Globe } from 'lucide-react';
import type { ToolInvocation } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
  ChatToolCardContent,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { WebFavicon } from '#routes/projects_.$id/web-favicon.js';
import { WebSourceLink } from '#routes/projects_.$id/web-source-link.js';
import { cn } from '#utils/ui.utils.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';

const maxVisibleSources = 5;

type WebSource = {
  url: string;
  title: string;
  content: string;
};

function SourcesList({ sources }: { readonly sources: WebSource[] }): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);

  const visibleSources = sources.slice(0, maxVisibleSources);
  const hiddenSources = sources.slice(maxVisibleSources);
  const hasMoreSources = hiddenSources.length > 0;

  return (
    <div className='flex flex-col'>
      {/* Always visible sources */}
      {visibleSources.map((source) => (
        <WebSourceLink key={source.url} url={source.url} title={source.title} />
      ))}

      {/* Expandable section for additional sources */}
      {hasMoreSources ? (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger className='group flex w-full items-center gap-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground'>
            <ChevronRight
              className={cn('size-3 shrink-0 transition-transform duration-200', isExpanded && 'rotate-90')}
            />
            <span>...and {hiddenSources.length} more</span>
            <div className='flex items-center gap-0.5'>
              {hiddenSources.slice(0, 6).map((source) => (
                <WebFavicon key={source.url} url={source.url} className='size-3.5 rounded-sm opacity-60' />
              ))}
              {hiddenSources.length > 6 ? (
                <span className='ml-0.5 text-[10px] text-muted-foreground/50'>+{hiddenSources.length - 6}</span>
              ) : undefined}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className='flex flex-col pl-4'>
              {hiddenSources.map((source) => (
                <WebSourceLink key={source.url} url={source.url} title={source.title} />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : undefined}
    </div>
  );
}

export function ChatMessageToolWebSearch({
  part,
}: {
  readonly part: ToolInvocation<typeof toolName.webSearch>;
}): React.JSX.Element | undefined {
  switch (part.state) {
    case 'input-available':
    case 'input-streaming': {
      const query = part.input?.query ?? '';

      return (
        <ChatToolCard variant='minimal' status='loading' isDefaultOpen={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={Globe} />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Searching web'>
                {query ? (
                  <ChatToolDescription>
                    <span className='italic'>{query}</span>
                  </ChatToolDescription>
                ) : undefined}
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
        </ChatToolCard>
      );
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} icon={Globe} noun='web search' />;
    }

    case 'output-available': {
      const sources = part.output;
      const { query } = part.input;

      if (sources.length === 0) {
        return (
          <ChatToolCard variant='minimal' status='ready' isCollapsible={false}>
            <ChatToolCardHeader>
              <ChatToolCardIcon icon={Globe} />
              <ChatToolCardTitle>
                <ChatToolLabel verb='Found'>
                  <ChatToolDescription>no sources</ChatToolDescription>
                </ChatToolLabel>
              </ChatToolCardTitle>
            </ChatToolCardHeader>
          </ChatToolCard>
        );
      }

      return (
        <ChatToolCard variant='minimal' status='ready' isDefaultOpen={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={Globe} />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Searched'>
                <ChatToolDescription>
                  <span className='italic'>{query}</span>
                </ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
          <ChatToolCardContent className='border-l-0'>
            <div className='border-l border-foreground/20 pl-4'>
              <SourcesList sources={sources} />
            </div>
          </ChatToolCardContent>
        </ChatToolCard>
      );
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.webSearch} state: ${part.state}`);
    }
  }
}
