/**
 * Proxies PostHog at the edge, so a capture reaches PostHog as the browser sent it.
 *
 * `apps/ui/app/routes/api.ph.$/route.ts` does the same job for local development and for any request that
 * reaches the app, but on Netlify that route runs inside the SSR Lambda, and the adapter decides from the
 * request's `Content-Type` whether the body is text or binary. `posthog-js` labels its gzip capture payloads
 * `text/plain`, so the adapter handed the function a string: lossless for text, fatal to a gzip stream. PostHog
 * answered `invalid GZIP data` and dropped every capture, and no route-level repair was possible because the
 * damage was already done before the route ran. An edge function never crosses that boundary, so the body
 * arrives intact and compression can stay on.
 *
 * Only `accept` and `content-type` are forwarded, as the app route does: nothing identifying the visitor is
 * passed upstream. A `Sec-GPC: 1` request is answered 204 without contacting PostHog.
 */

/** The part of Netlify's edge runtime global (Deno) this function reads. */
type NetlifyRuntime = { env: { get: (name: string) => string | undefined } };

/** PostHog's own hosts, overridable per site by the same variables the app route reads. */
const defaultApiHost = 'us.i.posthog.com';
const defaultAssetHost = 'us-assets.i.posthog.com';

/** Response fields that describe one hop and must not be forwarded (RFC 9110 §7.6.1). */
const hopByHopHeaders = [
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'set-cookie',
  'set-cookie2',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

/** Statuses that cannot carry a body. */
const nullBodyStatuses = new Set([204, 205, 304]);

function readSiteVariable(name: string): string | undefined {
  const runtime = Reflect.get(globalThis, 'Netlify') as NetlifyRuntime | undefined;
  return runtime?.env.get(name);
}

/** A site variable may name the host alone or as a URL; PostHog is always reached over HTTPS. */
export function extractHostname(host: string): string {
  return host.includes('://') ? new URL(host).hostname : host;
}

/**
 * Where one proxied request goes upstream. Static assets come from PostHog's asset host, everything else from
 * its API host, and the `/api/ph` prefix is dropped.
 *
 * @param requestUrl - The URL the browser asked for.
 * @param apiHost - The API host, as a hostname or a URL.
 * @param assetHost - The asset host, as a hostname or a URL.
 * @returns The upstream URL.
 */
export function resolveUpstreamUrl(requestUrl: URL, apiHost: string, assetHost: string): URL {
  const upstream = new URL(requestUrl);
  upstream.protocol = 'https:';
  upstream.hostname = extractHostname(requestUrl.pathname.startsWith('/api/ph/static/') ? assetHost : apiHost);
  upstream.port = '';
  upstream.pathname = upstream.pathname.replace(/^\/api\/ph/u, '');
  return upstream;
}

/** PostHog's answer, with the fields that describe our hop to it removed. */
export function forwardResponse(response: Response, body?: BodyInit): Response {
  const headers = new Headers(response.headers);
  const nominated = (response.headers.get('connection') ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => /^[!#$%&'*+.^_`|~\dA-Za-z-]+$/u.test(name));
  for (const name of [...nominated, ...hopByHopHeaders]) {
    headers.delete(name);
  }
  return new Response(body ?? null, { status: response.status, statusText: response.statusText, headers });
}

export default async function posthog(request: Request): Promise<Response> {
  if (request.headers.get('Sec-GPC') === '1') {
    return new Response(null, { status: 204 });
  }

  const upstream = resolveUpstreamUrl(
    new URL(request.url),
    readSiteVariable('POSTHOG_API_HOST') ?? defaultApiHost,
    readSiteVariable('POSTHOG_ASSET_HOST') ?? defaultAssetHost,
  );

  const headers = new Headers();
  for (const name of ['accept', 'content-type']) {
    const value = request.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  // Read the body to bytes rather than streaming it: the length is then known, and a gzip payload crosses
  // unexamined and unaltered, which is the whole point of answering here instead of in the SSR function.
  const body = hasBody ? await request.arrayBuffer() : undefined;

  const response = await fetch(upstream, { method: request.method, headers, body });
  return forwardResponse(response, nullBodyStatuses.has(response.status) ? undefined : await response.arrayBuffer());
}

export const config = { path: '/api/ph/*' };
