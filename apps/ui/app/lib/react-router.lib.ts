import { redirect } from 'react-router';
import {
  browserRevalidateCacheControl,
  cacheTagResponseHeader,
  cdnCacheControlResponseHeader,
  cdnVaryQueryEmptyAllowlist,
  cdnVaryQueryResponseHeader,
  edgeDurableSsrRouteCacheControl,
  edgeShortLivedSsrRouteCacheControl,
} from '@taucad/ui-core/constants/cache.constants';

/**
 * Application-defined cache tags identifying SSR route classes for
 * {@link cdnBackedSsrRouteHeaders}. These are semantic identifiers (not
 * CDN-vendor strings) used for granular purge APIs — adding a new prerendered
 * route class is a one-line addition here.
 */
export const cacheTag = {
  homepage: 'homepage',
  publicationViewer: 'publication-viewer',
} as const;

type CacheTagValue = (typeof cacheTag)[keyof typeof cacheTag];

export type CdnBackedSsrTtl = 'short' | 'long';

/**
 * HTTP headers for SSR routes that are safe to store in the edge CDN with a
 * long `s-maxage` while the browser keeps `must-revalidate`. Centralizes
 * provider-specific header names (today Netlify) so a hosting change is a
 * single-file remap.
 */
export function cdnBackedSsrRouteHeaders(tag: CacheTagValue, ttl: CdnBackedSsrTtl = 'long'): Record<string, string> {
  const edgeCacheControl = ttl === 'short' ? edgeShortLivedSsrRouteCacheControl : edgeDurableSsrRouteCacheControl;
  return {
    'Cache-Control': browserRevalidateCacheControl,
    [cdnCacheControlResponseHeader]: edgeCacheControl,
    [cacheTagResponseHeader]: tag,
    [cdnVaryQueryResponseHeader]: cdnVaryQueryEmptyAllowlist,
  };
}

/**
 * Redirects requests from a subdomain to the apex domain if the subdomain matches.
 * Throws a redirect Response if the subdomain matches, otherwise does nothing.
 *
 * Takes the loader's `url` argument, not `request.url`: a client navigation's request is
 * `<path>.data?_routes=…`, which must not become the redirect target (blueprint B4).
 *
 * @param url - The page URL the loader serves (its `url` argument)
 * @param subdomain - The subdomain to redirect from (e.g., 'www')
 * @param statusCode - HTTP status code for the redirect (default: 301 permanent)
 * @throws {Response} Redirect response if subdomain matches
 *
 * @example
 * // In a loader, redirect www.example.com to example.com
 * throwRedirectIfSubdomain(url, 'www');
 */
export function throwRedirectIfSubdomain(url: URL, subdomain: string, statusCode = 301): void {
  const hostnameParts = url.hostname.split('.');

  if (hostnameParts[0] === subdomain) {
    const target = new URL(url);
    target.hostname = hostnameParts.slice(1).join('.');
    // oxlint-disable-next-line @typescript-eslint/only-throw-error -- React Router pattern: throwing Response is valid
    throw redirect(target.toString(), statusCode);
  }
}
