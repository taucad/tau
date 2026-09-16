/**
 * The one HTTP client Tau's git transport speaks through (S24, review 3 F5/F9/F16).
 *
 * `isomorphic-git` ships two clients of its own and neither can do the three
 * things this program needs, which is why there is a Tau one and only one:
 *
 * - **`keepalive`** — the close flush sends its last POST from `pagehide`, when
 *   the document is already going away and a normal `fetch` is cancelled with
 *   it. `keepalive` is the only way a request outlives the document, and it is
 *   capped by the platform at 64 KiB of body, so the cap is enforced here
 *   rather than discovered as a silent drop (A32, A39).
 * - **`signal`** — opening a project pulls under a bound (3 s render, 10 s
 *   abort). The library exposes no signal, so the deadline has to live in the
 *   client the library calls.
 * - **Two credentials, two headers.** `Authorization` is Tau's own — the
 *   browser session, or a bearer token on a disk host. A request that goes
 *   through the API's CORS proxy to a third-party remote carries *that* remote's
 *   credential in `x-tau-proxy-authorization` instead, because forwarding
 *   `Authorization` would hand a Tau session to GitHub (W11a §9.3). Both are
 *   headers resolved by the host at request time, never query strings, never
 *   written under a project (I8).
 *
 * Nothing here knows what a revision is: it is a `fetch` with three rules.
 */

/*
 * The chunk type the git HTTP contract is written in.
 *
 * `isomorphic-git` declares its request and response bodies as
 * `AsyncIterableIterator<Uint8Array>` — that is, `ArrayBufferLike` — and a
 * client whose parameter were narrower would not be assignable to its
 * `HttpClient` at all. This is the one place in Tau that has to say so; every
 * buffer this module *creates* is still `ArrayBuffer`-backed.
 */
/* Both rules fire on this one token and they contradict each other — one wants
 * the `ArrayBuffer` argument, the other wants no argument at all — so the
 * declaration the library's type forces us into needs both off, here and
 * nowhere else. They are oxlint rules; ESLint has neither. */
/* oxlint-disable enforce-uint8array-arraybuffer/enforce-uint8array-arraybuffer -- mirrors `isomorphic-git`'s own `GitHttpRequest.body`. */
// oxlint-disable-next-line no-unnecessary-type-arguments -- the argument is the point: it is wider than the default.
type GitChunk = Uint8Array<ArrayBufferLike>;
/* oxlint-enable enforce-uint8array-arraybuffer/enforce-uint8array-arraybuffer -- back to the workspace rule. */

/** Where one request's credential comes from, asked at request time. @public */
export type RevisionAuthorization = (url: string) => string | undefined | Promise<string | undefined>;

/** Configuration for one Tau git HTTP client. @public */
export type RevisionHttpClientOptions = Readonly<{
  /**
   * The host's credential resolver (I8).
   *
   * Returns the whole header value (`Bearer …`), so the shape of the credential
   * stays the host's business. Returning `undefined` sends no header, which is
   * what an anonymous read of a public repository wants.
   */
  authorization?: RevisionAuthorization;
  /**
   * The *remote's* credential, for a request that goes through the API's proxy.
   *
   * Sent as `x-tau-proxy-authorization`, which is the only header the proxy
   * forwards to the target. `Authorization` never reaches the target: it is the
   * Tau session, and the proxy refuses to leak it (W11a §9.3).
   */
  proxyAuthorization?: RevisionAuthorization;
  /** Applies to every request that does not carry its own. */
  signal?: AbortSignal;
  /**
   * Send under `fetch(..., { keepalive: true })`.
   *
   * Only the `pagehide` flush sets this, and only for a body the caller has
   * already bounded: a request over {@link keepaliveLimitBytes} is refused here
   * instead of being dropped by the platform.
   */
  keepalive?: boolean;
  /**
   * Whether the browser sends its cookies with the request.
   *
   * The Tau session in the page *is* a cookie, and the API is a different
   * origin, so `'include'` is how "the browser is signed in" reaches the git
   * server without Tau copying a token anywhere (I8).
   */
  credentials?: RequestCredentials;
  /** Refuse a response body after this many bytes, per request URL. */
  maximumResponseBytes?: number | ((url: string) => number | undefined);
  /** Injected in tests and on hosts whose `fetch` is not the global one. */
  fetch?: typeof globalThis.fetch;
}>;

/**
 * One request, in `isomorphic-git`'s own shape.
 *
 * The chunk type is `Uint8Array<ArrayBufferLike>` because that is what the
 * library declares (`GitHttpRequest.body`), and a client whose parameter were
 * narrower would not be assignable to its `HttpClient` at all. Tau's own
 * buffers are `ArrayBuffer`-backed and satisfy it.
 *
 * @public
 */
export type RevisionHttpRequest = Readonly<{
  url: string;
  method?: string;
  headers?: Readonly<Record<string, string>>;
  body?: AsyncIterableIterator<GitChunk>;
  /**
   * Abort *this* request, merged with the client-wide one (W13 review 2 P36).
   *
   * A client-wide `signal` is the only bound the transport had, and it cannot
   * express "this pull has ten seconds": aborting it would abort every other
   * request the same client is making. One operation that has a deadline of its
   * own carries it here, and the socket ends when it fires rather than being
   * left running behind a host that stopped waiting (S24, F16).
   *
   * Typed as the library types it (`GitHttpRequest.signal?: object`, "reserved
   * for future use"), so this client stays assignable to `HttpClient`; only a
   * real `AbortSignal` bounds anything, and anything else is ignored rather than
   * handed to `fetch`, which would throw.
   */
  // oxlint-disable-next-line typescript/no-restricted-types -- the library declares `GitHttpRequest.signal` as `object`; a narrower parameter would make this client unassignable to its `HttpClient`.
  signal?: AbortSignal | object;
}>;

/** One response, in `isomorphic-git`'s own shape. @public */
export type RevisionHttpResponse = Readonly<{
  url: string;
  method: string;
  headers: Readonly<Record<string, string>>;
  body: AsyncIterableIterator<GitChunk>;
  statusCode: number;
  statusMessage: string;
}>;

/**
 * What `isomorphic-git` binds as its `http` argument.
 *
 * Declared here rather than imported so that nothing above this module depends
 * on the library's types.
 *
 * @public
 */
export type RevisionHttpClient = Readonly<{ request: (request: RevisionHttpRequest) => Promise<RevisionHttpResponse> }>;

/**
 * The platform's cap on a `keepalive` body, and therefore Tau's.
 *
 * 64 KiB across all in-flight keepalive requests; over it the browser fails the
 * request without telling the page why (A39).
 *
 * @public
 */
export const keepaliveLimitBytes = 64 * 1024;

/* Collect the library's async-iterator body into the one buffer `fetch` takes. */
const collect = async (
  body: AsyncIterableIterator<GitChunk> | undefined,
): Promise<Uint8Array<ArrayBuffer> | undefined> => {
  if (body === undefined) {
    return undefined;
  }
  const chunks: GitChunk[] = [];
  let length = 0;
  for await (const chunk of body) {
    chunks.push(chunk);
    length += chunk.byteLength;
  }
  const collected = new Uint8Array(new ArrayBuffer(length));
  let offset = 0;
  for (const chunk of chunks) {
    collected.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return collected;
};

/* The response body as the library reads it: one async iterator of chunks. */
const iterate = (response: Response, maximumBytes?: number): AsyncIterableIterator<GitChunk> => {
  const reader = response.body?.getReader();
  let received = 0;
  type Chunk = IteratorResult<GitChunk>;
  const iterator: AsyncIterableIterator<GitChunk> = {
    next: async (): Promise<Chunk> => {
      if (reader === undefined) {
        return { done: true, value: undefined };
      }
      const read = await reader.read();
      if (read.done) {
        return { done: true, value: undefined };
      }
      received += read.value.byteLength;
      if (maximumBytes !== undefined && received > maximumBytes) {
        await reader.cancel();
        throw new Error(`A Git response may carry at most ${String(maximumBytes)} bytes.`);
      }
      return { done: false, value: read.value };
    },
    return: async (): Promise<Chunk> => {
      await reader?.cancel();
      return { done: true, value: undefined };
    },
    [Symbol.asyncIterator]: (): AsyncIterableIterator<GitChunk> => iterator,
  };
  return iterator;
};

/**
 * The bound on one request: the client's, this request's, or both.
 *
 * @param client - The signal every request of this client carries.
 * @param request - The signal this one request carries.
 * @returns The signal to pass `fetch`, or `undefined` when there is no bound.
 */
const signalFor = (client: AbortSignal | undefined, request: unknown): AbortSignal | undefined => {
  const own = request instanceof AbortSignal ? request : undefined;
  if (client === undefined || own === undefined) {
    return client ?? own;
  }
  return AbortSignal.any([client, own]);
};

/**
 * Create the HTTP client Tau's git transport uses on every host.
 *
 * @param options - Credential resolver, deadline, `keepalive`, and the `fetch` to use.
 * @returns A client `isomorphic-git` accepts as its `http` argument.
 * @public
 *
 * @example <caption>The browser leg, with the session credential</caption>
 * ```typescript
 * import { createRevisionHttpClient } from '@taucad/revisions';
 *
 * const token = 'a-session-token';
 * const http = createRevisionHttpClient({
 *   authorization: () => `Bearer ${token}`,
 *   signal: AbortSignal.timeout(10_000),
 * });
 * ```
 */
export const createRevisionHttpClient = (options: RevisionHttpClientOptions = {}): RevisionHttpClient => {
  const call = options.fetch ?? globalThis.fetch.bind(globalThis);
  return Object.freeze({
    request: async (request: RevisionHttpRequest): Promise<RevisionHttpResponse> => {
      const body = await collect(request.body);
      if (options.keepalive === true && (body?.byteLength ?? 0) > keepaliveLimitBytes) {
        throw new Error(
          `A keepalive request may carry at most ${String(keepaliveLimitBytes)} bytes; this one carries ${String(body?.byteLength ?? 0)}.`,
        );
      }
      const [authorization, proxyAuthorization] = await Promise.all([
        options.authorization?.(request.url),
        options.proxyAuthorization?.(request.url),
      ]);
      const headers = new Headers(request.headers as Record<string, string> | undefined);
      if (authorization !== undefined) {
        /* A header, never `?token=`: a URL is logged by every proxy and every
         * server between here and the remote (I8). */
        headers.set('Authorization', authorization);
      }
      if (proxyAuthorization !== undefined) {
        headers.set('x-tau-proxy-authorization', proxyAuthorization);
      }
      const method = request.method ?? 'GET';
      const signal = signalFor(options.signal, request.signal);
      const maximumBytes =
        typeof options.maximumResponseBytes === 'function'
          ? options.maximumResponseBytes(request.url)
          : options.maximumResponseBytes;
      if (maximumBytes !== undefined && (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0)) {
        throw new TypeError('maximumResponseBytes must be a positive safe integer.');
      }
      const response = await call(request.url, {
        method,
        headers,
        ...(body === undefined || method === 'GET' || method === 'HEAD' ? {} : { body }),
        ...(options.keepalive === true ? { keepalive: true } : {}),
        ...(options.credentials === undefined ? {} : { credentials: options.credentials }),
        /* Either bound ends the request: `AbortSignal.any` is the platform's own
         * answer to "whichever fires first". */
        ...(signal === undefined ? {} : { signal }),
      });
      const declaredLength = Number(response.headers.get('content-length'));
      if (maximumBytes !== undefined && Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
        await response.body?.cancel();
        throw new Error(`A Git response may carry at most ${String(maximumBytes)} bytes.`);
      }
      return Object.freeze({
        url: response.url === '' ? request.url : response.url,
        method,
        headers: Object.fromEntries(response.headers.entries()),
        body: iterate(response, maximumBytes),
        statusCode: response.status,
        statusMessage: response.statusText,
      });
    },
  });
};
