import type { Route } from './+types/route.js';
import { getEnvironment } from '#environment.config.js';
import { sentryEnvelopeUrl } from '#lib/sentry-event.lib.js';

/**
 * Same-origin tunnel for Sentry envelopes (browser observability SB5), so a content blocker that
 * refuses the Sentry ingest host does not drop UI errors. Both delivery paths post here on the web
 * (the SDK's `tunnel` option and `sendSentryEventDirectly`); desktop posts to the DSN directly.
 *
 * It forwards only envelopes whose header names the configured `SENTRY_DSN`'s host and project, to
 * that DSN's own ingest endpoint, with only `Content-Type`: no cookies, no client IP, no other
 * header. Bodies are capped ({@link tunnelBodyLimit}) and each client address is rate limited
 * ({@link tunnelRateLimit}). Unlike the PostHog proxy it does not drop on `Sec-GPC`: error reporting
 * is not tracking (D1).
 */

/** Largest envelope forwarded, in bytes: Sentry's own limit for one event (1 MiB). */
export const tunnelBodyLimit = 1024 * 1024;

/** Envelopes one client address may send per window, and the window in milliseconds. */
export const tunnelRateLimit = { envelopes: 60, windowMilliseconds: 60_000 } as const;

/** Client addresses tracked at once, at most; the oldest window is forgotten first. */
const trackedClientLimit = 10_000;

/** A fixed-window counter per client address, bounded in the addresses it remembers. */
export type TunnelRateLimiter = (client: string, now: number) => boolean;

/**
 * Create a per-client fixed-window limiter.
 *
 * @param limit - Envelopes per window and the window's length.
 * @returns `true` while a client is within its window's allowance.
 */
export const createTunnelRateLimiter = (
  limit: Readonly<{ envelopes: number; windowMilliseconds: number }> = tunnelRateLimit,
): TunnelRateLimiter => {
  const windows = new Map<string, { start: number; count: number }>();
  return (client, now) => {
    const current = windows.get(client);
    if (current === undefined || now - current.start >= limit.windowMilliseconds) {
      windows.delete(client);
      if (windows.size >= trackedClientLimit) {
        const oldest = windows.keys().next();
        if (oldest.done !== true) {
          windows.delete(oldest.value);
        }
      }
      windows.set(client, { start: now, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= limit.envelopes;
  };
};

/** The address a request came from: Netlify's client connection IP, else the first forwarded hop. */
const clientOf = (request: Request): string =>
  request.headers.get('x-nf-client-connection-ip') ??
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
  'unknown';

/** The host, path prefix and project of a DSN, as the envelope endpoint is built from them. */
const dsnTarget = (dsn: string): { readonly host: string; readonly path: string } | undefined => {
  try {
    const url = new URL(dsn);
    return url.username === '' ? undefined : { host: url.host, path: url.pathname.replace(/\/+$/u, '') };
  } catch {
    return undefined;
  }
};

/**
 * Whether an envelope's header DSN names the configured DSN's host and project (its key may
 * differ: Sentry checks it).
 *
 * @param body - The envelope as posted.
 * @param configured - The configured `SENTRY_DSN`.
 * @returns `true` when the envelope is for the configured project on the configured host.
 */
export const isEnvelopeForDsn = (body: string, configured: string): boolean => {
  const newline = body.indexOf('\n');
  const headerLine = newline === -1 ? body : body.slice(0, newline);
  let header: unknown;
  try {
    header = JSON.parse(headerLine);
  } catch {
    return false;
  }
  if (typeof header !== 'object' || header === null || !('dsn' in header) || typeof header.dsn !== 'string') {
    return false;
  }
  const expected = dsnTarget(configured);
  const actual = dsnTarget(header.dsn);
  if (expected === undefined || actual === undefined) {
    return false;
  }
  return expected.host === actual.host && expected.path === actual.path;
};

/** Read a body up to `limit` bytes; `undefined` once it is larger. */
const readCapped = async (request: Request, limit: number): Promise<string | undefined> => {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    return undefined;
  }
  if (request.body === null) {
    return '';
  }
  const reader = request.body.getReader();
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let size = 0;
  // oxlint-disable no-await-in-loop -- A stream is read in order, one chunk at a time.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  // oxlint-enable no-await-in-loop
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
};

/** Response headers the SDK reads from Sentry's answer (its rate limits). */
const forwardedResponseHeaders = ['content-type', 'retry-after', 'x-sentry-rate-limits'] as const;

type TunnelOptions = Readonly<{
  dsn: string | undefined;
  isAllowed: TunnelRateLimiter;
  now?: () => number;
  fetchUpstream?: typeof fetch;
}>;

/**
 * Validate and forward one envelope.
 *
 * @param request - The browser's request.
 * @param options - The configured DSN, the limiter, and stand-ins for tests.
 * @returns Sentry's answer, or this route's refusal.
 */
export const sentryTunnel = async (
  request: Request,
  { dsn, isAllowed, now = Date.now, fetchUpstream = fetch }: TunnelOptions,
): Promise<Response> => {
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { allow: 'POST' } });
  }
  const endpoint = dsn ? sentryEnvelopeUrl(dsn) : undefined;
  if (!dsn || endpoint === undefined) {
    return new Response(null, { status: 404 });
  }
  if (!isAllowed(clientOf(request), now())) {
    return new Response(null, {
      status: 429,
      headers: { 'retry-after': String(Math.ceil(tunnelRateLimit.windowMilliseconds / 1000)) },
    });
  }
  const body = await readCapped(request, tunnelBodyLimit);
  if (body === undefined) {
    return new Response(null, { status: 413 });
  }
  if (!isEnvelopeForDsn(body, dsn)) {
    return new Response(null, { status: 400 });
  }
  let upstream: Response;
  try {
    upstream = await fetchUpstream(endpoint, {
      method: 'POST',
      body,
      headers: { 'content-type': request.headers.get('content-type') ?? 'text/plain;charset=UTF-8' },
      redirect: 'error',
    });
  } catch {
    return new Response(null, { status: 502 });
  }
  const headers = new Headers();
  for (const name of forwardedResponseHeaders) {
    const value = upstream.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  // Null body statuses (204, 205, 304) cannot carry a body.
  const isNullBody = [204, 205, 304].includes(upstream.status);
  return new Response(isNullBody ? null : await upstream.text(), { status: upstream.status, headers });
};

/** This server process's limiter: per instance, so a best effort bound, not a global quota. */
const isAllowed = createTunnelRateLimiter();

export async function action({ request }: Route.ActionArgs): Promise<Response> {
  const environment = await getEnvironment();
  return sentryTunnel(request, { dsn: environment.SENTRY_DSN, isAllowed });
}

export function loader(): Response {
  return new Response(null, { status: 405, headers: { allow: 'POST' } });
}
