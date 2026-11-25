import { ImageIcon } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import type { ComponentProps } from 'react';

/**
 * The host an image source would load from, or `undefined` when it loads from this page's own origin (a relative or
 * same-origin path). A protocol-relative `//host/x` is another host.
 *
 * @param source - The image's `src`.
 * @param base - The page's URL.
 * @returns The other host, or `undefined` for this origin.
 */
export const remoteImageHost = (source: string, base: string): string | undefined => {
  try {
    const resolved = new URL(source, base);
    return resolved.origin === new URL(base).origin ? undefined : resolved.host;
  } catch {
    return 'an invalid address';
  }
};

/* Server rendering has no page: there, and in the render that hydrates it, the page is an origin no image can name, so
 * every absolute image is remote in both and they agree. The real page is read once hydrated. */
const unknownPage = 'http://server.invalid/';
const subscribeToNothing = (): (() => void) => () => undefined;
const readPageUrl = (): string => ('location' in globalThis ? globalThis.location.href : unknownPage);
const readServerPageUrl = (): string => unknownPage;

/**
 * Markdown image. Markdown here is written by a model or an agent, so an image on another host loads only when the
 * person asks for it: loading it on render would send whatever its URL carries to that host with no action of theirs.
 * An image from this origin loads as usual. A loaded remote image sends no referrer.
 */
export function MarkdownImage({
  src,
  alt,
  node: _node,
  ...properties
}: ComponentProps<'img'> & { readonly node?: unknown }): React.JSX.Element | undefined {
  const source = typeof src === 'string' ? src : undefined;
  const page = useSyncExternalStore(subscribeToNothing, readPageUrl, readServerPageUrl);
  const host = source === undefined ? undefined : remoteImageHost(source, page);
  /* The source the person approved, not a flag: a later source in the same place asks again. */
  const [approved, setApproved] = useState<string | undefined>(undefined);
  if (source === undefined || source === '') {
    return undefined;
  }
  if (host === undefined || approved === source) {
    return <img {...properties} src={source} alt={alt} referrerPolicy='no-referrer' loading='lazy' />;
  }
  return (
    <button
      type='button'
      className='inline-flex max-w-full items-center gap-1.5 rounded-md border border-border px-2 py-1 align-middle text-xs text-muted-foreground hover:bg-muted'
      title={source}
      onClick={(event) => {
        /* A linked image (a badge) sits inside its link: loading it must not also follow the link. */
        event.preventDefault();
        event.stopPropagation();
        setApproved(source);
      }}
    >
      <ImageIcon className='size-3.5 shrink-0' aria-hidden />
      <span className='truncate'>
        {alt === undefined || alt === '' ? 'Image' : alt} from {host}: load
      </span>
    </button>
  );
}
