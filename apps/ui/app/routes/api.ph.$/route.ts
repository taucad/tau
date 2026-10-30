import type { Route } from './+types/route.js';
import { getEnvironment } from '#environment.config.js';

/**
 * Proxy route for PostHog analytics.
 * Forwards requests to PostHog API and asset servers while preserving client anonymity.
 *
 * Routes:
 *   - /api/ph/* → PostHog API (us.i.posthog.com)
 *   - /api/ph/static/* → PostHog assets (us-assets.i.posthog.com)
 */

export async function loader({ request }: Route.LoaderArgs): Promise<Response> {
  return posthogProxy(request);
}

export async function action({ request }: Route.ActionArgs): Promise<Response> {
  return posthogProxy(request);
}

const extractHostname = (host: string): string => {
  // Handle both "hostname.com" and "https://hostname.com" formats
  if (host.includes('://')) {
    return new URL(host).hostname;
  }

  return host;
};

export const posthogProxy = async (request: Request): Promise<Response> => {
  if (request.headers.get('Sec-GPC') === '1') {
    return new Response(null, { status: 204 });
  }

  const environment = await getEnvironment();
  const url = new URL(request.url);
  const rawHost = url.pathname.startsWith('/api/ph/static/')
    ? environment.POSTHOG_ASSET_HOST
    : environment.POSTHOG_API_HOST;

  const hostname = extractHostname(rawHost);

  const newUrl = new URL(url);
  newUrl.protocol = 'https';
  newUrl.hostname = hostname;
  newUrl.port = '443';
  // Remove the expected `/api/ph` prefix to forward to PostHog's root path
  newUrl.pathname = newUrl.pathname.replace(/^\/api\/ph/, '');

  const headers = new Headers();
  for (const name of ['accept', 'content-type']) {
    const value = request.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  // PostHog's browser SDK gzips capture payloads and labels them `text/plain`. Something on the hosted path
  // decodes a textual body as text and re-encodes it, which destroys those bytes: PostHog then
  // answers `invalid GZIP data`, so every capture is dropped. A body declared as binary survives,
  // so forward a gzip payload under its true type. Buffering also removes the streamed `duplex`
  // body, which the same path handles less predictably than a known-length one.
  const body = hasBody ? new Uint8Array(await request.arrayBuffer()) : null;
  if (body !== null && body.length > 1 && body[0] === 0x1f && body[1] === 0x8b) {
    headers.set('content-type', 'application/octet-stream');
  }

  const response = await fetch(newUrl, {
    method: request.method,
    headers,
    body,
  });

  const responseHeaders = new Headers(response.headers);
  // RFC 9110 §7.6.1: fields nominated by Connection are hop-by-hop and must not be forwarded.
  const nominated = (response.headers.get('connection') ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => /^[!#$%&'*+.^_`|~\dA-Za-z-]+$/u.test(name));
  for (const name of [
    ...nominated,
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
  ]) {
    responseHeaders.delete(name);
  }

  // Null body statuses (204, 205, 304) cannot have a response body per HTTP spec
  const nullBodyStatuses = [204, 205, 304];
  const isNullBodyStatus = nullBodyStatuses.includes(response.status);

  const data = isNullBodyStatus ? null : await response.arrayBuffer();

  return new Response(data, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
};
