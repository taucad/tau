/**
 * `@taucad/utils/origin-answer`: a per-API-origin, `maxAge`-bounded cache of a public, sessionless answer an API
 * publishes (the telemetry policy, the deployment answer), and the resolver that reads it in the order fresh cache,
 * network, stale cached answer within a grace window, `unknown`. Generic over the answer: the caller passes the parse
 * function, so this module knows no contract. Browser-safe: no Node import.
 */

/** A cached answer and the epoch milliseconds it stops being fresh. @public */
export type CachedAnswer<A> = Readonly<{ answer: A; expiresAt: number }>;

/** Where a host keeps one origin's cached entry (the browser: `localStorage` by origin; Node: memory). @public */
export type AnswerStore<E> = Readonly<{
  read(): E | undefined;
  write(value: E): void;
}>;

/** The part of the Web Storage API an {@link AnswerStore} uses (`localStorage` satisfies it). @public */
export type AnswerStorage = Readonly<{
  /** The stored string; anything else (the Web Storage `null`) reads as empty. */
  getItem(key: string): unknown;
  setItem(key: string, value: string): void;
}>;

/** Inclusive bounds, in seconds, on the `maxAge` an API may set. @public */
export type MaxAgeBounds = Readonly<{ minimum: number; maximum: number }>;

/** Why a request produced no answer. @public */
export type AnswerFailure = 'status' | 'malformed' | 'network' | 'timeout';

/** The classified outcome of one answer request. @public */
export type AnswerResponse<B> =
  | Readonly<{ kind: 'answer'; body: B }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'failed'; reason: AnswerFailure }>;

/** What {@link OriginAnswerResolver.resolve} returns; the caller refuses on `unknown`. @public */
export type OriginAnswer<A> =
  | Readonly<{ state: 'known'; answer: A; source: 'cache' | 'network' | 'absent' | 'stale' }>
  | Readonly<{ state: 'unknown'; reason: AnswerFailure }>;

/** Input to {@link createOriginAnswerResolver}. @public */
export type OriginAnswerResolverInput<A> = Readonly<{
  /** The route on each origin, such as `/v1/deployment`. */
  path: string;
  /** The answer and its `maxAge` in seconds from a JSON body, or `undefined` when the body is not one. */
  parse: (body: unknown) => Readonly<{ answer: A; maxAgeSeconds: number }> | undefined;
  /** Bounds on the answer's `maxAge`; an absent answer is cached for the minimum. */
  maxAgeBounds: MaxAgeBounds;
  /** Seconds past expiry a cached answer may still stand in when the network fails. */
  staleGraceSeconds: number;
  /**
   * The answer an HTTP `404` reads as (an API that predates the route). Only a `404` maps to it; a timeout, other
   * status, malformed body or refused connection never does. Omitted, a `404` is a failure like any other status.
   */
  absent?: A;
  /** Milliseconds before a request is abandoned; defaults to {@link originAnswerDefaults.requestTimeout}. */
  requestTimeout?: number;
  /** One origin's store; defaults to memory, one entry per origin. */
  store?: (origin: string) => AnswerStore<CachedAnswer<A>>;
  fetch?: typeof globalThis.fetch;
  /** The clock, epoch milliseconds; defaults to `Date.now`. */
  now?: () => number;
}>;

/** Resolves an origin's answer; concurrent resolves of one origin share one request. @public */
export type OriginAnswerResolver<A> = Readonly<{
  /**
   * Resolve the answer for the origin of `url`. Rejects with a `TypeError` only when `url` has no origin.
   *
   * @param url - An origin or any URL on it; only its origin is used.
   */
  resolve(url: string): Promise<OriginAnswer<A>>;
}>;

/** Resolver defaults. @public */
export const originAnswerDefaults = {
  /** Milliseconds before a request is abandoned. */
  requestTimeout: 10_000,
} as const;

/**
 * Whether a cached entry is still fresh at `now`.
 *
 * @param entry - The entry, if any.
 * @param now - Epoch milliseconds.
 * @returns Whether it is fresh.
 * @public
 */
export const isAnswerFresh = <E extends Readonly<{ expiresAt: number }>>(
  entry: E | undefined,
  now: number,
): entry is E => entry !== undefined && now < entry.expiresAt;

/**
 * Clamp an answer's `maxAge` into its bounds.
 *
 * @param maxAgeSeconds - The answer's `maxAge`.
 * @param bounds - The bounds.
 * @returns Seconds.
 * @public
 */
export const boundMaxAge = (maxAgeSeconds: number, bounds: MaxAgeBounds): number =>
  Math.min(Math.max(maxAgeSeconds, bounds.minimum), bounds.maximum);

/**
 * An in-memory store: the Node default.
 *
 * @returns The store.
 * @public
 */
export const createMemoryAnswerStore = <E>(): AnswerStore<E> => {
  let value: E | undefined;
  return {
    read: () => value,
    write: (next) => {
      value = next;
    },
  };
};

/**
 * A Web Storage store under one key, as JSON. Never throws: an unavailable, blocked or corrupt store reads as empty
 * and drops writes.
 *
 * @param input - The storage accessor, the key (one per origin) and the entry parser.
 * @returns The store.
 * @public
 */
export const createStorageAnswerStore = <E>(
  input: Readonly<{ storage: () => AnswerStorage | undefined; key: string; parse: (value: unknown) => E | undefined }>,
): AnswerStore<E> => ({
  read: () => {
    try {
      const raw = input.storage()?.getItem(input.key);
      return typeof raw === 'string' ? input.parse(JSON.parse(raw) as unknown) : undefined;
    } catch {
      return undefined;
    }
  },
  write: (value) => {
    try {
      input.storage()?.setItem(input.key, JSON.stringify(value));
    } catch {
      /* Best effort: a blocked store asks the network next time. */
    }
  },
});

const timedOut = Symbol('timed-out');

/**
 * `GET` an answer without credentials and classify it: `404` is `absent`; another non-2xx status, a body that is not
 * JSON or that `parse` refuses, a thrown fetch, an abort and a timeout are `failed`. Never throws.
 *
 * @param input - The fetch, the URL, the body parser, an optional timeout in milliseconds, an optional HTTP cache mode
 *   (the fetch default when omitted; a page reader passes `no-store` so it never reads an old answer) and an optional
 *   signal the caller aborts the request with.
 * @returns The classified response.
 * @public
 */
export const requestAnswer = async <B>(
  input: Readonly<{
    fetch: typeof globalThis.fetch;
    url: string;
    parse: (body: unknown) => B | undefined;
    requestTimeout?: number;
    cache?: RequestCache;
    signal?: AbortSignal;
  }>,
): Promise<AnswerResponse<B>> => {
  const exchange = async (signal: AbortSignal | undefined): Promise<AnswerResponse<B>> => {
    let response: Response;
    try {
      response = await input.fetch(input.url, {
        method: 'GET',
        credentials: 'omit',
        ...(input.cache === undefined ? {} : { cache: input.cache }),
        ...(signal === undefined ? {} : { signal }),
      });
    } catch {
      return { kind: 'failed', reason: 'network' };
    }
    if (response.status === 404) {
      return { kind: 'absent' };
    }
    if (!response.ok) {
      return { kind: 'failed', reason: 'status' };
    }
    try {
      const body = input.parse((await response.json()) as unknown);
      return body === undefined ? { kind: 'failed', reason: 'malformed' } : { kind: 'answer', body };
    } catch {
      return { kind: 'failed', reason: 'malformed' };
    }
  };
  if (input.requestTimeout === undefined) {
    return exchange(input.signal);
  }
  const controller = new AbortController();
  const forward = (): void => {
    controller.abort();
  };
  if (input.signal?.aborted === true) {
    controller.abort();
  } else {
    input.signal?.addEventListener('abort', forward, { once: true });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof timedOut>((resolve) => {
    timer = setTimeout(() => {
      resolve(timedOut);
    }, input.requestTimeout);
    (timer as { unref?: () => void }).unref?.();
  });
  try {
    const outcome = await Promise.race([exchange(controller.signal), deadline]);
    if (outcome === timedOut) {
      controller.abort();
      return { kind: 'failed', reason: 'timeout' };
    }
    return outcome;
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', forward);
  }
};

/**
 * Create a resolver of a public per-origin answer. Order: a fresh cached answer, then the network, then a stale cached
 * answer within `staleGraceSeconds` of its expiry (only when the network failed), then `unknown`. Answers are keyed by
 * exact origin (scheme, host and port) and never shared across origins; failures are never cached.
 *
 * @param input - The route, parser, bounds, grace, optional absent value and injectable fetch, clock and store.
 * @returns The resolver.
 * @public
 */
export const createOriginAnswerResolver = <A>(input: OriginAnswerResolverInput<A>): OriginAnswerResolver<A> => {
  const now = input.now ?? Date.now;
  const send = input.fetch ?? globalThis.fetch.bind(globalThis);
  const requestTimeout = input.requestTimeout ?? originAnswerDefaults.requestTimeout;
  const memory = new Map<string, AnswerStore<CachedAnswer<A>>>();
  const storeOf =
    input.store ??
    ((origin: string): AnswerStore<CachedAnswer<A>> => {
      const existing = memory.get(origin) ?? createMemoryAnswerStore<CachedAnswer<A>>();
      memory.set(origin, existing);
      return existing;
    });
  const inFlight = new Map<string, Promise<OriginAnswer<A>>>();

  const fromNetwork = async (origin: string): Promise<OriginAnswer<A>> => {
    const store = storeOf(origin);
    const response = await requestAnswer({
      fetch: send,
      url: new URL(input.path, origin).href,
      parse: input.parse,
      requestTimeout,
    });
    if (response.kind === 'answer') {
      const seconds = boundMaxAge(response.body.maxAgeSeconds, input.maxAgeBounds);
      store.write({ answer: response.body.answer, expiresAt: now() + seconds * 1000 });
      return { state: 'known', answer: response.body.answer, source: 'network' };
    }
    if (response.kind === 'absent' && input.absent !== undefined) {
      store.write({ answer: input.absent, expiresAt: now() + input.maxAgeBounds.minimum * 1000 });
      return { state: 'known', answer: input.absent, source: 'absent' };
    }
    const stale = store.read();
    if (stale !== undefined && now() < stale.expiresAt + input.staleGraceSeconds * 1000) {
      return { state: 'known', answer: stale.answer, source: 'stale' };
    }
    return { state: 'unknown', reason: response.kind === 'failed' ? response.reason : 'status' };
  };

  return {
    resolve: async (url) => {
      const { origin } = new URL(url);
      if (origin === 'null') {
        throw new TypeError(`No origin in ${url}`);
      }
      const cached = storeOf(origin).read();
      if (isAnswerFresh(cached, now())) {
        return { state: 'known', answer: cached.answer, source: 'cache' };
      }
      const pending = inFlight.get(origin);
      if (pending !== undefined) {
        return pending;
      }
      const request = (async (): Promise<OriginAnswer<A>> => {
        try {
          return await fromNetwork(origin);
        } finally {
          inFlight.delete(origin);
        }
      })();
      inFlight.set(origin, request);
      return request;
    },
  };
};
