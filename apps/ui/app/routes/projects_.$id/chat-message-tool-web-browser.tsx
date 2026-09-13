import { Globe } from 'lucide-react';
import type { ToolInvocation } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { extractDomainFromUrl, safeExtractDomainFromUrl } from '#utils/url.utils.js';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
  ChatToolCardContent,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';
import { WebFavicon } from '#routes/projects_.$id/web-favicon.js';
import { WebSourceLink } from '#routes/projects_.$id/web-source-link.js';

export function ChatMessageToolWebBrowser({
  part,
}: {
  readonly part: ToolInvocation<typeof toolName.webBrowser>;
}): React.JSX.Element | undefined {
  switch (part.state) {
    case 'input-available':
    case 'input-streaming': {
      const urls = (part.input?.urls ?? []).filter((url): url is string => typeof url === 'string');
      const domains = urls
        .map((url) => safeExtractDomainFromUrl(url, { includeTld: true }))
        .filter((domain): domain is string => domain !== undefined);

      return (
        <ChatToolCard variant='minimal' status='loading' isDefaultOpen={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={Globe} />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Visiting pages'>
                {domains.length > 0 ? <ChatToolDescription>{domains.join(', ')}</ChatToolDescription> : undefined}
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
        </ChatToolCard>
      );
    }

    case 'output-available': {
      const { input } = part;
      const { urls } = input;
      const firstUrl = urls[0]!;
      const firstDomain = extractDomainFromUrl(firstUrl, { includeTld: true });
      const remainingCount = urls.length - 1;

      return (
        <ChatToolCard variant='minimal' status='ready' isDefaultOpen={false}>
          <ChatToolCardHeader>
            <WebFavicon url={firstUrl} alt={firstDomain} className='size-3 shrink-0 rounded-sm' />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Visited'>
                <ChatToolDescription>
                  {firstDomain}
                  {remainingCount > 0 && (
                    <>
                      {' '}
                      and {remainingCount} other {remainingCount === 1 ? 'page' : 'pages'}
                    </>
                  )}
                </ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
          {urls.length > 0 && (
            <ChatToolCardContent className='border-l-0'>
              <div className='border-l border-foreground/20 pl-4'>
                <div className='flex flex-col'>
                  {urls.map((url) => (
                    <WebSourceLink key={url} url={url} />
                  ))}
                </div>
              </div>
            </ChatToolCardContent>
          )}
        </ChatToolCard>
      );
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} icon={Globe} noun='web visit' />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.webBrowser} state: ${part.state}`);
    }
  }
}
