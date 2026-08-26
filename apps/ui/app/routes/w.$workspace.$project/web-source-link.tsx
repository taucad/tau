import { ExternalLink } from '#components/external-link.js';
import { extractDomainFromUrl } from '#utils/url.utils.js';
import { WebFavicon } from '#routes/w.$workspace.$project/web-favicon.js';

export function WebSourceLink({ url, title }: { readonly url: string; readonly title?: string }): React.JSX.Element {
  const domain = extractDomainFromUrl(url);

  return (
    <ExternalLink
      href={url}
      arrowSize='xs'
      className='flex w-full min-w-0 items-center gap-2 py-0.5 text-xs text-muted-foreground no-underline hover:text-foreground hover:underline'
    >
      <WebFavicon url={url} alt={domain} />
      {title === undefined ? (
        <span className='min-w-0 truncate font-medium'>{domain}</span>
      ) : (
        <>
          <span className='shrink-0 font-medium'>{domain}</span>
          <span className='text-muted-foreground/50'>-</span>
          <span className='min-w-0 truncate'>{title}</span>
        </>
      )}
    </ExternalLink>
  );
}
