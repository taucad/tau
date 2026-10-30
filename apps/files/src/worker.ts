/**
 * The files Worker's fetch handler: `files.<zone>` serves API-signed links to private LFS objects from R2 (blueprint §3).
 *
 * The API decides who may read an object and mints a short-lived HMAC link
 * bound to one object, one size, one expiry and one key id. This Worker only
 * checks that link and streams the bytes. It reads the bucket and never
 * writes it, never buffers a body, and never logs a URL.
 */

/* eslint-disable @typescript-eslint/naming-convention -- R2 binding names (tau-cloud's contract) and HTTP header names are spelled by their owners. */

import { fileLinkObjectKey, verifyFileLink } from '@taucad/file-links';
import type { VerifiedFileLink } from '@taucad/file-links';
import { allowedOrigins, applyCors, preflight } from '#cors.js';
import { verifyKeys } from '#environment.js';
import type { FilesEnvironment } from '#environment.js';
import { resolveRange } from '#range.js';
import {
  jsonResponse,
  methodNotAllowedCode,
  notModified,
  notModifiedHeaders,
  objectHeaders,
  refusal,
} from '#respond.js';
import type { FilesErrorReason } from '#respond.js';

/** One request's structured log line: no URL, query, signature, owner or project. */
export type FilesLogLine = Readonly<{
  event: 'files.request';
  method: string;
  route: 'lfs' | 'lfs-legacy' | 'healthz' | 'other';
  status: number;
  error?: FilesErrorReason | 'method';
  /** The first 12 hex digits of the oid, enough to correlate with a client report. */
  oid?: string;
  /** Bytes the response carries (its `Content-Length`). */
  bytes?: number;
  range?: boolean;
  colo?: string;
  durationMilliseconds: number;
}>;

/** Where log lines go; Workers Logs reads `console.log`. */
export type FilesLogger = (line: FilesLogLine) => void;

/** Test seams: the clock and the log sink. */
export type FilesWorkerOptions = Readonly<{ now?: () => number; log?: FilesLogger }>;

// oxlint-disable-next-line typescript/no-restricted-types -- `Response` takes `null` for no body.
type Parts = Readonly<{ status: number; headers: Headers; body: BodyInit | null }>;
type Outcome = Readonly<{
  parts: Parts;
  error?: FilesLogLine['error'];
  link?: VerifiedFileLink;
  bytes?: number;
  range?: boolean;
}>;

const routeOf = (path: string): FilesLogLine['route'] => {
  if (path === '/healthz') {
    return 'healthz';
  }
  if (path.startsWith('/v1/lfs/')) {
    return 'lfs';
  }
  return path.startsWith('/v1/lfs-legacy/') ? 'lfs-legacy' : 'other';
};

const refuse = (reason: FilesErrorReason, link?: VerifiedFileLink): Outcome => ({
  parts: refusal(reason, link?.size),
  error: reason,
  ...(link === undefined ? {} : { link }),
});

/**
 * Serve one verified link: `If-None-Match` first (no storage call), then the
 * range against the signed size, then one R2 read whose stream is the body.
 *
 * @param request - The request.
 * @param environment - The bindings.
 * @param link - The verified link.
 * @returns The response parts.
 */
const serve = async (request: Request, environment: FilesEnvironment, link: VerifiedFileLink): Promise<Outcome> => {
  const { oid } = link.location;
  if (notModified(request.headers.get('If-None-Match') ?? undefined, oid)) {
    return { parts: { status: 304, headers: notModifiedHeaders(oid), body: null }, link };
  }
  const range = resolveRange(request.headers.get('Range') ?? undefined, link.size);
  if (range.kind === 'unsatisfiable') {
    return refuse('range', link);
  }
  const key = fileLinkObjectKey(link.location);
  const partial = range.kind === 'partial' ? { offset: range.offset, length: range.length } : undefined;
  const length = partial?.length ?? link.size;
  const headers = objectHeaders(oid, length, partial === undefined ? undefined : { ...partial, size: link.size });
  const status = partial === undefined ? 200 : 206;
  try {
    if (request.method === 'HEAD') {
      const stored = await environment.BUCKET.head(key);
      if (stored === null) {
        return refuse('missing', link);
      }
      if (stored.size !== link.size) {
        return refuse('size', link);
      }
      return { parts: { status, headers, body: null }, link, bytes: length, range: partial !== undefined };
    }
    const object = await environment.BUCKET.get(key, partial === undefined ? {} : { range: partial });
    if (object === null) {
      return refuse('missing', link);
    }
    if (object.size !== link.size) {
      await object.body.cancel();
      return refuse('size', link);
    }
    return { parts: { status, headers, body: object.body }, link, bytes: length, range: partial !== undefined };
  } catch {
    return refuse('storage', link);
  }
};

const handle = async (request: Request, environment: FilesEnvironment, now: number): Promise<Outcome> => {
  const url = new URL(request.url);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const { status, headers, body } = jsonResponse(
      405,
      { code: methodNotAllowedCode },
      { Allow: 'GET, HEAD, OPTIONS' },
    );
    return { parts: { status, headers, body }, error: 'method' };
  }
  if (url.pathname === '/healthz') {
    const { status, headers, body } = jsonResponse(200, { status: 'ok', keys: verifyKeys(environment).size });
    return { parts: { status, headers, body: request.method === 'HEAD' ? null : body } };
  }
  /* Only this Worker's own Custom Domain serves objects: never a `*.workers.dev` path around the WAF. */
  if (url.host !== environment.FILES_AUDIENCE) {
    return refuse('malformed');
  }
  const keys = verifyKeys(environment);
  const verdict = await verifyFileLink({
    path: url.pathname,
    search: url.search,
    audience: environment.FILES_AUDIENCE,
    now: Math.floor(now / 1000),
    keyFor: (kid) => keys.get(kid),
  });
  return verdict.ok ? serve(request, environment, verdict.link) : refuse(verdict.reason);
};

/**
 * Build the Worker's fetch handler.
 *
 * @param options - The clock and the log sink; both default to the runtime's.
 * @returns The `fetch` handler.
 */
export const createFilesWorker = (
  options: FilesWorkerOptions = {},
): ((request: Request, environment: FilesEnvironment) => Promise<Response>) => {
  const now = options.now ?? ((): number => Date.now());
  const log =
    options.log ??
    ((line: FilesLogLine): void => {
      console.log(JSON.stringify(line));
    });
  return async (request, environment) => {
    const startedAt = now();
    const origin = request.headers.get('Origin') ?? undefined;
    const allowed = allowedOrigins(environment.FILES_ALLOWED_ORIGINS);
    const outcome: Outcome =
      request.method === 'OPTIONS'
        ? { parts: { ...preflight(origin, allowed), body: null } }
        : await handle(request, environment, startedAt);
    const { status, headers, body } = outcome.parts;
    if (request.method !== 'OPTIONS') {
      applyCors(headers, origin, allowed);
    }
    const colo = (request as Request & { cf?: Readonly<{ colo?: unknown }> }).cf?.colo;
    log({
      event: 'files.request',
      method: request.method,
      route: routeOf(new URL(request.url).pathname),
      status,
      ...(outcome.error === undefined ? {} : { error: outcome.error }),
      ...(outcome.link === undefined ? {} : { oid: outcome.link.location.oid.slice(0, 12) }),
      ...(outcome.bytes === undefined ? {} : { bytes: outcome.bytes }),
      ...(outcome.range === undefined ? {} : { range: outcome.range }),
      ...(typeof colo === 'string' ? { colo } : {}),
      durationMilliseconds: Math.max(0, now() - startedAt),
    });
    return new Response(request.method === 'HEAD' ? null : body, { status, headers });
  };
};
