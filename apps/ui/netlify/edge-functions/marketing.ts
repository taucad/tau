/**
 * Serves the server-rendered marketing site (`apps/www`) on the app's own hostname.
 *
 * A full page load of `/` without an app preference and of marketing, vision and legal pages is proxied to the
 * marketing deploy named by the `MARKETING_ORIGIN` site variable. Every app
 * route, the app's own `/` with a query (`/?settings=…`, OAuth `/?code=…`) and
 * client-side navigation inside the app are untouched. With the variable
 * unset the function passes every request through, so deploying it changes
 * nothing until the site opts in.
 */

/** The part of Netlify's edge runtime global (Deno) this function reads. */
type NetlifyRuntime = { env: { get: (name: string) => string | undefined } };

type EdgeContext = { next: () => Promise<Response> };

/** Page prefixes owned by apps/www, including the legal documents the app links to. */
const marketingPrefixes = [
  '/product',
  '/use-cases',
  '/pricing',
  '/contact',
  '/download',
  '/blog',
  '/privacy',
  '/vision',
  '/legal',
  '/_www',
];

/** Single files owned by apps/www: its sitemap, served under another name, and the agent page. */
const marketingFiles = new Set(['/sitemap-marketing.xml', '/llms.txt']);

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
  } else if (pathname === '/_root.data') {
    const routes = searchParams.get('_routes')?.split(',');
    if (!routes?.length || !routes.every((route) => route === 'www-home')) {
      return undefined;
    }
  } else if (
    !marketingFiles.has(pathname) &&
    !marketingPrefixes.some(
      (prefix) => pathname === prefix || pathname === `${prefix}.data` || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return undefined;
  }

  const target = new URL(pathname === '/sitemap-marketing.xml' ? '/sitemap.xml' : pathname, origin);
  // Only router protocol parameters reach SSR; campaign/auth data stays on the visitor's URL.
  if (pathname.endsWith('.data')) {
    for (const name of ['_routes']) {
      const value = searchParams.get(name);
      if (value !== null) {
        target.searchParams.set(name, value);
      }
    }
  }
  return target;
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
  const origin = readSiteVariable('MARKETING_ORIGIN');
  // Keep app crawl exclusions authoritative; advertise marketing only when routing is enabled.
  if (requestUrl.pathname === '/robots.txt') {
    const response = await context.next();
    if (!origin || request.method !== 'GET' || requestUrl.hostname !== 'tau.new' || response.status !== 200) {
      return response;
    }
    const body = await response.text();
    if (!body.includes('Sitemap: https://tau.new/sitemap.xml')) {
      return new Response(body, response);
    }
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    return new Response(`${body.trimEnd()}\nSitemap: https://tau.new/sitemap-marketing.xml\n`, { headers });
  }
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
      : resolveMarketingUrl(requestUrl, request.method, origin);
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
    const document = await stagingLinks(response, requestUrl);
    return requestUrl.pathname === '/' ? privateDocument(document) : document;
  }

  const headers = new Headers(response.headers);
  headers.set('location', rewriteLocation(location, upstream, requestUrl));
  const rewritten = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  return requestUrl.pathname === '/' ? privateDocument(rewritten) : rewritten;
}

/**
 * Select staging downloads and name staging's own agent page in the shared static HTML, so a visitor and an agent
 * reading the raw HTML both get staging's links before any client script runs.
 */
async function stagingLinks(response: Response, requestUrl: URL): Promise<Response> {
  if (
    requestUrl.hostname !== 'taucad.dev' ||
    response.body === null ||
    !response.headers.get('content-type')?.toLowerCase().startsWith('text/html')
  ) {
    return response;
  }

  const html = await response.clone().text();
  // Match our emitted anchors and the hero's agent prompt; keep complete script blocks byte-identical for CSP hashes.
  const rewritten = html.replaceAll(
    /<script\b[^>]*>[\s\S]*?<\/script\s*>|(<a\b[^>]*\shref=")https:\/\/downloads\.tau\.new(\/latest\/[^"]*")|(<code id="agent-prompt-text">Install the Tau plugin from )https:\/\/tau\.new(\/llms\.txt<\/code>)/giu,
    (match: string, ...groups: Array<string | undefined>) => {
      const [anchor, path, prompt, page] = groups;
      if (anchor !== undefined) {
        return `${anchor}https://downloads.taucad.dev${path}`;
      }
      return prompt === undefined ? match : `${prompt}https://taucad.dev${page}`;
    },
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
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const config = {
  path: [
    '/',
    '/_root.data',
    '/sitemap-marketing.xml',
    '/llms.txt',
    '/robots.txt',
    ...marketingPrefixes.flatMap((prefix) => [prefix, `${prefix}.data`, `${prefix}/*`]),
  ],
};
