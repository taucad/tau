/**
 * Serves the static marketing site (`apps/www`) on the app's own hostname.
 *
 * A full page load of `/` without an app preference and of marketing pages is proxied to the
 * marketing deploy named by the `MARKETING_ORIGIN` site variable. Every app
 * route, the app's own `/` with a query (`/?settings=…`, OAuth `/?code=…`) and
 * client-side navigation inside the app are untouched. With the variable
 * unset the function passes every request through, so deploying it changes
 * nothing until the site opts in.
 */

/** The part of Netlify's edge runtime global (Deno) this function reads. */
type NetlifyRuntime = { env: { get: (name: string) => string | undefined } };

type EdgeContext = { next: () => Promise<Response> };

/** Marketing page prefixes owned by apps/www; `/vision` stays with the app. */
const marketingPrefixes = ['/product', '/use-cases', '/pricing', '/contact', '/download', '/blog', '/privacy', '/_www'];

/** Query parameters a shared marketing link may carry without leaving `/`. */
const campaignParameters = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref']);

/**
 * Resolve the marketing URL for a request, or `undefined` when the app
 * should answer it.
 */
export function resolveMarketingUrl(requestUrl: URL, method: string, origin: string | undefined): URL | undefined {
  if (!origin || (method !== 'GET' && method !== 'HEAD')) {
    return undefined;
  }

  const { pathname, searchParams } = requestUrl;
  if (pathname === '/') {
    for (const name of searchParams.keys()) {
      if (!campaignParameters.has(name) && name !== 'website') {
        return undefined;
      }
    }
  } else if (!marketingPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return undefined;
  }

  return new URL(pathname, origin);
}

/**
 * Keep a marketing redirect (Netlify's `/pricing` → `/pricing/`) on the
 * requesting hostname instead of the marketing deploy's own.
 */
export function rewriteLocation(location: string, upstream: URL, requestUrl: URL): string {
  const target = new URL(location, upstream);
  if (target.origin !== upstream.origin) {
    return location;
  }

  return new URL(`${target.pathname}${target.search}${target.hash}`, requestUrl.origin).toString();
}

function readSiteVariable(name: string): string | undefined {
  const runtime = Reflect.get(globalThis, 'Netlify') as NetlifyRuntime | undefined;
  return runtime?.env.get(name);
}

export default async function marketing(request: Request, context: EdgeContext): Promise<Response> {
  const requestUrl = new URL(request.url);
  // Presentation only: the API still authorizes every protected operation.
  // Ambiguous duplicate cookies do not select the app.
  const entries = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('tau-entry='));
  const prefersApp = entries.length === 1 && entries[0] === 'tau-entry=app';
  const upstream =
    requestUrl.pathname === '/' && prefersApp && !requestUrl.searchParams.has('website')
      ? undefined
      : resolveMarketingUrl(requestUrl, request.method, readSiteVariable('MARKETING_ORIGIN'));
  if (!upstream) {
    const response = await context.next();
    return requestUrl.pathname === '/' ? privateDocument(response) : response;
  }

  const response = await fetch(upstream, {
    method: request.method,
    headers: { accept: request.headers.get('accept') ?? '*/*' },
    redirect: 'manual',
  });
  const location = response.headers.get('location');
  if (!location) {
    const document = await stagingDownloadLinks(response, requestUrl);
    return requestUrl.pathname === '/' ? privateDocument(document) : document;
  }

  const headers = new Headers(response.headers);
  headers.set('location', rewriteLocation(location, upstream, requestUrl));
  const rewritten = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  return requestUrl.pathname === '/' ? privateDocument(rewritten) : rewritten;
}

/** Select staging downloads in the shared static HTML before client scripts run. */
async function stagingDownloadLinks(response: Response, requestUrl: URL): Promise<Response> {
  if (
    requestUrl.hostname !== 'taucad.dev' ||
    response.body === null ||
    !response.headers.get('content-type')?.toLowerCase().startsWith('text/html')
  ) {
    return response;
  }

  const html = await response.clone().text();
  // Match our emitted anchors; keep complete script blocks byte-identical for CSP hashes.
  const rewritten = html.replaceAll(
    /<script\b[^>]*>[\s\S]*?<\/script\s*>|(<a\b[^>]*\shref=")https:\/\/downloads\.tau\.new(\/latest\/[^"]*")/giu,
    (match: string, anchor: string | undefined, path: string | undefined) =>
      anchor === undefined ? match : `${anchor}https://downloads.taucad.dev${path}`,
  );
  if (rewritten === html) {
    return response;
  }
  const headers = new Headers(response.headers);
  for (const name of ['content-length', 'content-encoding', 'etag', 'last-modified']) {
    headers.delete(name);
  }
  return new Response(rewritten, { status: response.status, statusText: response.statusText, headers });
}

/** Keep both root variants out of shared and browser document caches. */
function privateDocument(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'private, no-store');
  headers.set('cdn-cache-control', 'no-store');
  headers.set('netlify-cdn-cache-control', 'no-store');
  headers.delete('netlify-vary');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const config = {
  path: ['/', ...marketingPrefixes.flatMap((prefix) => [prefix, `${prefix}/*`])],
};
