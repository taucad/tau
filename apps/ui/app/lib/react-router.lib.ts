import { redirect } from 'react-router';

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
