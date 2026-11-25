import type { ComponentProps } from 'react';
import { Link, useLocation } from 'react-router';
import { cn } from '@taucad/ui/utils/cn';
import { ExternalLink } from '#components/external-link.js';

/**
 * Checks if a URL is an external link (starts with http:// or https://).
 */
export function isExternalLink(href: string | undefined): boolean {
  return Boolean(href?.startsWith('http://')) || Boolean(href?.startsWith('https://'));
}

const urlSchemeRegex = /^(?:[a-z][\d+.a-z-]*:|#)/i;

/**
 * File extensions that point at react-router resource routes (loader-only, no
 * default Component). Client-side `<Link>` navigation to these URLs would
 * fetch the loader but render no UI, leaving the previous page's layout
 * visible while the address bar shows the new URL. Forcing a full document
 * navigation lets the browser render the loader's text/* response directly.
 */
const resourceRouteExtensions = new Set(['.txt', '.webmanifest']);

/**
 * Returns true when `href` resolves to a path whose final segment ends in a
 * known resource-route extension; the caller should request a full document
 * navigation rather than client-side routing.
 */
export function isResourceRouteHref(href: string): boolean {
  const pathOnly = href.split('?')[0]?.split('#')[0] ?? href;
  const lastSegment = pathOnly.slice(pathOnly.lastIndexOf('/') + 1);
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex <= 0) {
    return false;
  }
  return resourceRouteExtensions.has(lastSegment.slice(dotIndex).toLowerCase());
}

/**
 * Resolves a possibly-relative href to an absolute URL path using standard
 * RFC 3986 / WHATWG URL resolution -- the same semantics the browser would
 * apply to an `<a href>` tag. React Router's `<Link relative='path'>` quirk
 * (only pops a single segment per `..`) is intentionally bypassed: a link
 * `../foo` from `/guides/live-rendering` resolves to `/foo`, not
 * `/guides/foo`. Absolute, anchor-only, and scheme links are returned
 * unchanged.
 */
export function resolveRelativeHref(href: string, locationPathname: string): string {
  if (urlSchemeRegex.test(href) || href.startsWith('/') || href === '') {
    return href;
  }
  const base = `https://_${locationPathname.startsWith('/') ? locationPathname : `/${locationPathname}`}`;
  const resolved = new URL(href, base);
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

/**
 * Markdown link component that opens external links in a new tab.
 * Internal links (relative paths, anchor links) open in the same tab.
 */
export function MarkdownHyperlink({
  children,
  className,
  href,
  target: _target,
  // oxlint-disable-next-line unicorn-js/prevent-abbreviations -- relative position shorthand
  rel: _rel,
  ...rest
}: ComponentProps<'a'>): React.JSX.Element {
  const location = useLocation();
  const isExternal = isExternalLink(href);

  if (isExternal && href) {
    return (
      <ExternalLink href={href} className={className} arrowSize='xs' isArrowOnHoverOnly={false}>
        {children}
      </ExternalLink>
    );
  }

  const to = href === undefined ? '' : resolveRelativeHref(href, location.pathname);

  return (
    <Link
      {...rest}
      to={to}
      reloadDocument={isResourceRouteHref(to)}
      className={cn(
        className,
        'text-primary underline underline-offset-3 transition-all duration-200 hover:underline hover:underline-offset-4',
      )}
    >
      {children}
    </Link>
  );
}
