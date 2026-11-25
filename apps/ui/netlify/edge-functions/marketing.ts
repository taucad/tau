/**
 * Serves the server-rendered marketing site (`apps/www`) on the app's own hostname, and the app's Home shell at `/`.
 *
 * A full page load of `/` without an app preference and of marketing, vision and legal pages is proxied to the
 * marketing deploy named by the `MARKETING_ORIGIN` site variable. Every app
 * route, the app's own `/` with a query (`/?settings=…`, OAuth `/?code=…`) and
 * client-side navigation inside the app are untouched. With the variable
 * unset the function proxies nothing, so deploying it serves no marketing
 * until the site opts in.
 *
 * A read of `/` with the `tau-entry=app` preference gets the prerendered Home shell (progressive loading PL4, the `home`
 * class of `app/lib/route-classes.ts`) where the React Router function rendered Home before; the two are the same
 * document (`scripts/check-static-shells.mts`). Which visitors get marketing and which get the app is unchanged.
 */

/** The part of Netlify's edge runtime global (Deno) this function reads. */
type NetlifyRuntime = { env: { get: (name: string) => string | undefined } };

/** Netlify's `context.next`: with a request of the same site, it continues the chain with that URL (a rewrite). */
type EdgeContext = { next: (request?: Request) => Promise<Response> };

/**
 * The Home shell's file, `shellDocumentFile` of the `home` class (`route-classes.test.ts` holds them equal). The edge
 * bundle imports nothing from the app, so the path is written here.
 */
export const homeShellDocument = '/__shell/home/index.html';

/**
 * The skew protection cookie's expiry, `shellSkewCookie` of `route-classes.ts` (held equal by its test). A static shell
 * cannot name its deploy's token, and an older deploy's token would pin the shell's asset requests to a deploy without
 * this build's chunks, so the Home shell expires it as the project shell's static header does (OD7).
 */
export const shellSkewCookie = 'tau_skew=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax';

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

/**
 * The root data request of `/`, by both of React Router's names: `/_root.data` from React Router 7 and `/_.data` from
 * React Router 8's trailing-slash-aware data requests. Both stay accepted while a tab of a build that sends the old
 * name can still be open (blueprint B5, RR4).
 */
export const rootDataPaths: readonly string[] = ['/_root.data', '/_.data'];

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
  } else if (rootDataPaths.includes(pathname)) {
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

/**
 * The URL the visitor requested. Staging serves its custom domain through a router deploy that proxies every
 * request to the `staging--<site>.netlify.app` alias (`.github/actions/netlify-staging-router`), so this function
 * sees the alias hostname there; the router names the visitor's domain in `X-Tau-Public-Host`. The header is
 * honoured only on a `netlify.app` hostname, which is how the router reaches the alias, never on a custom domain.
 */
export function publicRequestUrl(request: Request): URL {
  const url = new URL(request.url);
  const publicHost = request.headers.get('x-tau-public-host');
  if (publicHost && url.hostname.endsWith('.netlify.app') && /^[a-z\d.-]+$/u.test(publicHost)) {
    url.protocol = 'https:';
    url.host = publicHost;
  }
  return url;
}

/**
 * Whether a `Cookie` header states the app preference. Presentation only: the API still authorizes every protected
 * operation. Ambiguous duplicate cookies do not select the app.
 *
 * @param cookieHeader - The request's `Cookie` header.
 * @returns `true` for exactly one `tau-entry=app`.
 */
export function prefersAppEntry(cookieHeader: string | undefined): boolean {
  const entries = (cookieHeader ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('tau-entry='));
  return entries.length === 1 && entries[0] === 'tau-entry=app';
}

/** Who answers a request: the Home shell, the app's own function and files, or the marketing deploy. */
export type Delivery =
  | Readonly<{ kind: 'home-shell' }>
  | Readonly<{ kind: 'app' }>
  | Readonly<{ kind: 'marketing'; upstream: URL }>;

/**
 * Choose who answers a request.
 *
 * `/` with the app preference and no `?website` is the app's, whatever its query, as before. Of those requests the
 * Home shell answers each read (GET and HEAD), except on a `www.` host, where the function's root loader answers with a
 * redirect to the apex, so that one stays with it. Everything else is chosen by {@link resolveMarketingUrl}, as before.
 *
 * @param request - The request as Netlify received it.
 * @param requestUrl - The URL the visitor requested ({@link publicRequestUrl}).
 * @param origin - The marketing deploy, or `undefined` when the site serves none.
 * @returns The delivery.
 */
export function selectDelivery(request: Request, requestUrl: URL, origin: string | undefined): Delivery {
  if (
    requestUrl.pathname === '/' &&
    prefersAppEntry(request.headers.get('cookie') ?? undefined) &&
    !requestUrl.searchParams.has('website')
  ) {
    const isRead = request.method === 'GET' || request.method === 'HEAD';
    // The host the function's root loader sees (`throwRedirectIfSubdomain`), not the staging router's public one.
    const isWwwAlias = new URL(request.url).hostname.split('.')[0] === 'www';
    return isRead && !isWwwAlias ? { kind: 'home-shell' } : { kind: 'app' };
  }
  const upstream = resolveMarketingUrl(requestUrl, request.method, origin);
  return upstream === undefined ? { kind: 'app' } : { kind: 'marketing', upstream };
}

/**
 * The Home shell, rewritten from this site's own static file with the request's method and headers. A rewrite stays on
 * the host Netlify received (behind the staging router, its `netlify.app` alias). The shell expires the skew cookie.
 * Should the deploy not answer the shell with a 200, the function renders Home as it did before the shell existed.
 */
async function homeShell(request: Request, context: EdgeContext): Promise<Response> {
  const shell = await context.next(new Request(new URL(homeShellDocument, request.url), request));
  if (shell.status !== 200) {
    await shell.body?.cancel();
    return context.next(request);
  }
  const headers = new Headers(shell.headers);
  headers.append('set-cookie', shellSkewCookie);
  return new Response(shell.body, { status: shell.status, statusText: shell.statusText, headers });
}

function readSiteVariable(name: string): string | undefined {
  const runtime = Reflect.get(globalThis, 'Netlify') as NetlifyRuntime | undefined;
  return runtime?.env.get(name);
}

export default async function marketing(request: Request, context: EdgeContext): Promise<Response> {
  const requestUrl = publicRequestUrl(request);
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
  const delivery = selectDelivery(request, requestUrl, origin);
  if (delivery.kind === 'home-shell') {
    return privateDocument(await homeShell(request, context));
  }
  if (delivery.kind === 'app') {
    const response = await context.next();
    return requestUrl.pathname === '/' ? privateDocument(response) : response;
  }

  const { upstream } = delivery;

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
 * Select staging downloads and docs and name staging's own agent page in the shared static HTML, so a visitor and an
 * agent reading the raw HTML both get staging's links before any client script runs. The marketing build names only
 * production API and downloads hosts in its policy, so staging's are selected here too, also when the body is unchanged.
 */
async function stagingLinks(response: Response, requestUrl: URL): Promise<Response> {
  if (
    requestUrl.hostname !== 'taucad.dev' ||
    !response.headers.get('content-type')?.toLowerCase().startsWith('text/html')
  ) {
    return response;
  }

  const policy = response.headers.get('content-security-policy');
  const stagingPolicy = policy?.replaceAll(
    /https:\/\/(api|downloads)\.tau\.new(?=[\s;]|$)/gu,
    (_match: string, host: string) => `https://${host}.taucad.dev`,
  );
  const html = response.body === null ? undefined : await response.clone().text();
  // Match our emitted download and docs anchors and the hero's agent prompt; keep complete script blocks
  // byte-identical for CSP hashes.
  const rewritten = html?.replaceAll(
    /<script\b[^>]*>[\s\S]*?<\/script\s*>|(<a\b[^>]*\shref=")https:\/\/downloads\.tau\.new(\/latest\/[^"]*")|(<a\b[^>]*\shref=")https:\/\/docs\.tau\.new([/"])|(<code id="agent-prompt-text">Install the Tau plugin from )https:\/\/tau\.new(\/llms\.txt<\/code>)/giu,
    (match: string, ...groups: Array<string | undefined>) => {
      const [anchor, path, docsAnchor, docsRest, prompt, page] = groups;
      if (anchor !== undefined) {
        return `${anchor}https://downloads.taucad.dev${path}`;
      }
      if (docsAnchor !== undefined) {
        return `${docsAnchor}https://docs.taucad.dev${docsRest}`;
      }
      return prompt === undefined ? match : `${prompt}https://taucad.dev${page}`;
    },
  );
  if (rewritten === html && stagingPolicy === policy) {
    return response;
  }
  const headers = new Headers(response.headers);
  if (stagingPolicy !== undefined) {
    headers.set('content-security-policy', stagingPolicy);
  }
  if (rewritten === html) {
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
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
  path: [
    '/',
    ...rootDataPaths,
    '/sitemap-marketing.xml',
    '/llms.txt',
    '/robots.txt',
    ...marketingPrefixes.flatMap((prefix) => [prefix, `${prefix}.data`, `${prefix}/*`]),
  ],
};
