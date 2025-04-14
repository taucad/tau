import type { ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import { LoaderCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge.js';
import { createFaviconUrl, extractDomainFromUrl } from '@/utils/url.js';
import { AnimatedShinyText } from '@/components/magicui/animated-shiny-text.js';

export function ChatMessageToolWebBrowser({ part }: { readonly part: ToolInvocationUIPart }) {
  const url = part.toolInvocation.args.url as string;
  const faviconUrl = createFaviconUrl(url);
  const domain = extractDomainFromUrl(url, { includeTld: true });

  switch (part.toolInvocation.state) {
    case 'call': {
      return (
        <Badge variant="outline">
          <AnimatedShinyText className="flex max-w-full flex-row items-center gap-2">
            <LoaderCircle className="size-3 animate-spin text-inherit" />
            <span className="truncate">Visiting {domain}...</span>
          </AnimatedShinyText>
        </Badge>
      );
    }

    case 'result': {
      return (
        <Badge variant="outline" className="flex max-w-full flex-row items-center gap-2 text-neutral">
          <img src={faviconUrl} alt={domain} className="size-3 rounded-full" />
          <span className="truncate">Visited {domain}</span>
        </Badge>
      );
    }

    case 'partial-call': {
      throw new Error('Unexpected partial call for web browser tool');
    }
  }
}
