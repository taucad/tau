import type { UIToolInvocation } from 'ai';
import { LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MyTools } from '@taucad/chat';
import { Badge } from '#components/ui/badge.js';
import { createFaviconUrl, extractDomainFromUrl } from '#utils/url.utils.js';
import { AnimatedShinyText } from '#components/magicui/animated-shiny-text.js';

export function ChatMessageToolWebBrowser({
  part,
}: {
  readonly part: UIToolInvocation<MyTools['webBrowser']>;
}): ReactNode | undefined {
  switch (part.state) {
    case 'input-available':
    case 'output-available': {
      const { input } = part;
      const { url } = input;
      const faviconUrl = createFaviconUrl(url);
      const domain = extractDomainFromUrl(url, { includeTld: true });

      if (part.state === 'input-available') {
        return (
          <Badge variant="outline">
            <AnimatedShinyText className="flex max-w-full flex-row items-center gap-2">
              <LoaderCircle className="size-3 animate-spin text-inherit" />
              <span className="truncate">Visiting {domain}...</span>
            </AnimatedShinyText>
          </Badge>
        );
      }

      return (
        <Badge variant="outline" className="flex max-w-full flex-row items-center gap-2 text-neutral">
          <img src={faviconUrl} alt={domain} className="size-3 rounded-full" />
          <span className="truncate">Visited {domain}</span>
        </Badge>
      );
    }

    case 'input-streaming': {
      return null;
    }

    case 'output-error': {
      return <div>Web browser failed</div>;
    }
  }
}
