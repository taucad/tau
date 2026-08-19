/**
 * Wire-shaped helpers shared by the WebSocket transport's browser-safe
 * client and its Node host: the transport id, the two socket routes, the
 * URL join, the origin allowlist check, the close-code → close-cause map,
 * and the session pairing slot.
 *
 * Deliberately socket-free — nothing here imports `ws` or touches a
 * `WebSocketLike`, so both sides can unit-test the decisions without a
 * server (`docs/research/runtime-websocket-transport-blueprint.md`,
 * Finding 7).
 *
 * @internal
 */

import type { RuntimeTransportCloseResult } from '#transport/runtime-transport.types.js';

/** Literal transport id carried by the descriptor and the plugin. */
export const webSocketId = 'web-socket';

/** Literal-typed alias of {@link webSocketId}. */
export type WebSocketId = typeof webSocketId;

/** The two routes the host serves and the client dials. */
export type WebSocketRoute = 'runtime' | 'fs';

/** RFC 6455 close codes this transport produces or interprets. */
export const webSocketCloseCode = {
  normal: 1000,
  goingAway: 1001,
  policyViolation: 1008,
  messageTooBig: 1009,
  internalError: 1011,
  abnormal: 1006,
} as const;

/** Reason a `/runtime` socket is closed with when its `/fs` peer never arrives. */
export const pairingTimeoutCloseReason = 'no /fs socket paired for this session';

/** Reason a `/runtime` socket is closed with when its paired `/fs` socket dies before serving. */
export const fileSystemSocketLostCloseReason = '/fs socket closed before the filesystem bridge was ready';

/** Reason a `/fs` socket is closed with when the host already owns a filesystem. */
export const unexpectedFileSystemSocketCloseReason = 'host owns its filesystem; /fs socket is not accepted';

/**
 * Transport-private pairing id. `crypto.randomUUID` is secure-context-only in
 * browsers, so a plain-`http` LAN page falls back to `getRandomValues` — the id
 * only has to be unguessable and unique per host, never durable.
 *
 * @returns A fresh session id.
 */
export const randomSessionId = (): string => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Join a consumer-supplied base URL with one of the transport's routes and
 * the pairing session id. A base with or without a trailing slash, and a
 * base mounted under a path prefix, all produce the same suffix.
 *
 * @param base - Consumer-supplied `url` option.
 * @param route - Route to dial.
 * @param session - Transport-private pairing id.
 * @returns Absolute socket URL.
 */
export const buildSocketUrl = (base: string | URL, route: WebSocketRoute, session: string): string => {
  const url = new URL(typeof base === 'string' ? base : base.href);
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${route}`;
  url.searchParams.set('session', session);
  return url.href;
};

/**
 * Classify an inbound upgrade path against the host's mount prefix. Matching
 * is **exact** — `${prefix}/runtime` and `${prefix}/fs` and nothing else — so
 * a host sharing an HTTP server never claims a foreign service's path
 * (`/agent/fs` is not ours; `/rt/fs` is ours only under prefix `/rt`).
 *
 * @param pathname - Upgrade request pathname.
 * @param pathPrefix - Consumer-supplied mount prefix; slashes are normalised. Defaults to `/`.
 * @returns The route, or `undefined` when the path is not ours.
 */
export const routeOf = (pathname: string, pathPrefix = '/'): WebSocketRoute | undefined => {
  const trimmed = pathPrefix.replaceAll(/^\/+|\/+$/gu, '');
  const base = trimmed === '' ? '/' : `/${trimmed}/`;
  const segment = pathname.startsWith(base) ? pathname.slice(base.length) : '';
  return segment === 'runtime' || segment === 'fs' ? segment : undefined;
};

/**
 * Origin allowlist. A browser always sends `Origin`; a Node client never
 * does, so an absent header is admitted and the default empty allowlist
 * denies every browser.
 *
 * Re-exported from `@taucad/runtime/transport/websocket-host` so a consumer
 * writing its own upgrade handler applies the same rule.
 *
 * @param origin - The request's `Origin` header, if any.
 * @param allowedOrigins - Exact-match allowlist.
 * @returns Whether the upgrade may proceed.
 * @public
 */
export const isOriginAllowed = (origin: string | undefined, allowedOrigins: readonly string[]): boolean =>
  origin === undefined || allowedOrigins.includes(origin);

/**
 * Map a socket close into the transport's terminal cause. An orderly close
 * (`1000`/`1001`) is the host going away; anything else — including the
 * `1006` a dropped TCP peer produces — is a wire failure.
 *
 * Re-exported from `@taucad/runtime/transport/websocket-host` so a consumer
 * classifies a socket close exactly as this transport's client does.
 *
 * @param code - Close code, if the socket reported one.
 * @param reason - Close reason, if the socket reported one.
 * @returns The close result to settle `closed` with.
 * @public
 */
export const closeCauseFor = (code: number | undefined, reason?: string): RuntimeTransportCloseResult => {
  if (code === webSocketCloseCode.normal || code === webSocketCloseCode.goingAway) {
    return { cause: 'host-exit' };
  }
  const detail = reason ? `${String(code)}: ${reason}` : String(code);
  return { cause: 'wire-failure', error: new Error(`web-socket closed (${detail})`) };
};

/** Correlates the two sockets of one client session on the host. @internal */
export type SessionPairing<T> = {
  /** Record an arrived `/fs` socket, handing it to a waiting `/runtime` if there is one. */
  offer(session: string, value: T): void;
  /** Wait for this session's `/fs` socket; rejects once the pairing bound elapses. */
  claim(session: string): Promise<T>;
  /** Drop a parked offer whose socket died before anyone claimed it. */
  revoke(session: string): void;
  /** Reject every waiter and drop every unclaimed offer. */
  dispose(): void;
};

/**
 * Session pairing slot. Either socket may arrive first: an early `/fs` is
 * parked until its `/runtime` claims it, and an early `/runtime` waits.
 *
 * ponytail: pairing by URL query, one slot per session, no reuse — promote
 * to a hello-carried id if a multiplexer ever lands.
 *
 * @param pairingTimeout - How long a `/runtime` connection waits for its peer. Milliseconds.
 * @returns The pairing slot.
 */
export const createSessionPairing = <T>(pairingTimeout: number): SessionPairing<T> => {
  const offered = new Map<string, T>();
  const waiting = new Map<string, { resolve: (value: T) => void; reject: (error: Error) => void; timer: unknown }>();

  return {
    offer(session, value) {
      const waiter = waiting.get(session);
      if (!waiter) {
        offered.set(session, value);
        return;
      }
      waiting.delete(session);
      clearTimeout(waiter.timer as Parameters<typeof clearTimeout>[0]);
      waiter.resolve(value);
    },
    async claim(session) {
      if (offered.has(session)) {
        const value = offered.get(session) as T;
        offered.delete(session);
        return value;
      }
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          waiting.delete(session);
          reject(new Error(pairingTimeoutCloseReason));
        }, pairingTimeout);
        waiting.set(session, { resolve, reject, timer });
      });
    },
    revoke(session) {
      offered.delete(session);
    },
    dispose() {
      for (const waiter of waiting.values()) {
        clearTimeout(waiter.timer as Parameters<typeof clearTimeout>[0]);
        waiter.reject(new Error('webSocketHost: closed while waiting for a /fs socket'));
      }
      waiting.clear();
      offered.clear();
    },
  };
};
