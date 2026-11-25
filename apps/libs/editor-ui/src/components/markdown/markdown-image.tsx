import { ImageIcon } from 'lucide-react';
import { useState } from 'react';
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

/* Server rendering has no page; any origin there treats every absolute image as remote. */
const pageUrl = (): string => ('location' in globalThis ? globalThis.location.href : 'http://localhost/');

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
  const host = source === undefined ? undefined : remoteImageHost(source, pageUrl());
  const [loaded, setLoaded] = useState(false);
  if (source === undefined || source === '') {
    return undefined;
  }
  if (host === undefined || loaded) {
    return <img {...properties} src={source} alt={alt} referrerPolicy='no-referrer' loading='lazy' />;
  }
  return (
    <button
      type='button'
      className='inline-flex max-w-full items-center gap-1.5 rounded-md border border-border px-2 py-1 align-middle text-xs text-muted-foreground hover:bg-muted'
      title={source}
      onClick={() => {
        setLoaded(true);
      }}
    >
      <ImageIcon className='size-3.5 shrink-0' aria-hidden />
      <span className='truncate'>
        {alt === undefined || alt === '' ? 'Image' : alt} from {host}: load
      </span>
    </button>
  );
}
