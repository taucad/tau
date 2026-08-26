import { useState } from 'react';
import { Globe } from 'lucide-react';
import { safeCreateFaviconUrl } from '#utils/url.utils.js';
import { cn } from '#utils/ui.utils.js';

type FaviconLoadState = 'pending' | 'ok' | 'fallback';

export function WebFavicon({
  url,
  alt,
  className = 'size-3.5 shrink-0 rounded-sm',
}: {
  readonly url: string;
  readonly alt?: string;
  readonly className?: string;
}): React.JSX.Element {
  const faviconHref = safeCreateFaviconUrl(url);
  const [state, setState] = useState<FaviconLoadState>('pending');

  if (!faviconHref) {
    return <Globe className={cn(className, 'text-muted-foreground')} aria-hidden />;
  }

  if (state === 'fallback') {
    return <Globe className={cn(className, 'text-muted-foreground')} aria-hidden />;
  }

  return (
    <img
      src={faviconHref}
      alt={alt ?? ''}
      className={cn(className, state === 'pending' && 'opacity-0', state === 'ok' && 'opacity-100 transition-opacity')}
      onError={() => {
        setState('fallback');
      }}
      onLoad={(event) => {
        const element = event.currentTarget;
        if (element.naturalWidth <= 1) {
          setState('fallback');
          return;
        }

        setState('ok');
      }}
    />
  );
}
