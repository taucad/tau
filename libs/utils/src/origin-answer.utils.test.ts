import { describe, expect, it, vi } from 'vitest';
import {
  boundMaxAge,
  createMemoryAnswerStore,
  createOriginAnswerResolver,
  createStorageAnswerStore,
  isAnswerFresh,
  requestAnswer,
} from '#origin-answer.utils.js';
import type { AnswerStorage, CachedAnswer, OriginAnswerResolverInput } from '#origin-answer.utils.js';

// ===========================================================================
// Helpers
// ===========================================================================

type Funded = Readonly<{ funded: boolean }>;

const bounds = { minimum: 60, maximum: 3600 } as const;

const parseFunded = (body: unknown): Readonly<{ answer: Funded; maxAgeSeconds: number }> | undefined => {
  if (
    typeof body === 'object' &&
    body !== null &&
    'funded' in body &&
    typeof body.funded === 'boolean' &&
    'maxAgeSeconds' in body &&
    typeof body.maxAgeSeconds === 'number'
  ) {
    return { answer: { funded: body.funded }, maxAgeSeconds: body.maxAgeSeconds };
  }
  return undefined;
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let outerResolve!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    outerResolve = resolve;
  });
  return { promise, resolve: outerResolve };
};

/** A response that never settles. */
const never = async (): Promise<Response> =>
  new Promise<Response>(() => {
    /* Never settles. */
  });

const harness = (
  responses: Array<Response | Error | (() => Promise<Response>)>,
  overrides: Partial<OriginAnswerResolverInput<Funded>> = {},
) => {
  let clock = 1_000_000;
  const fetch = vi.fn(async (_url: string, _init?: RequestInit): Promise<Response> => {
    const next = responses.shift();
    if (next === undefined) {
      throw new Error('no response scripted');
    }
    if (next instanceof Error) {
      throw next;
    }
    return typeof next === 'function' ? next() : next;
  });
  const resolver = createOriginAnswerResolver<Funded>({
    path: '/v1/deployment',
    parse: parseFunded,
    maxAgeBounds: bounds,
    staleGraceSeconds: 600,
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => clock,
    ...overrides,
  });
  return {
    resolver,
    fetch,
    advance: (milliseconds: number) => {
      clock += milliseconds;
    },
    now: () => clock,
  };
};

// ===========================================================================
// Primitives
// ===========================================================================

describe('isAnswerFresh', () => {
  it('should be fresh strictly before expiry and never for a missing entry', () => {
    expect(isAnswerFresh({ expiresAt: 10 }, 9)).toBe(true);
    expect(isAnswerFresh({ expiresAt: 10 }, 10)).toBe(false);
    expect(isAnswerFresh(undefined, 0)).toBe(false);
  });
});

describe('boundMaxAge', () => {
  it('should clamp seconds into the bounds', () => {
    expect(boundMaxAge(5, bounds)).toBe(60);
    expect(boundMaxAge(300, bounds)).toBe(300);
    expect(boundMaxAge(99_999, bounds)).toBe(3600);
  });
});

describe('createMemoryAnswerStore', () => {
  it('should read back what it wrote', () => {
    const store = createMemoryAnswerStore<CachedAnswer<number>>();
    expect(store.read()).toBeUndefined();
    store.write({ answer: 1, expiresAt: 2 });
    expect(store.read()).toEqual({ answer: 1, expiresAt: 2 });
  });
});

describe('createStorageAnswerStore', () => {
  const memoryStorage = (): AnswerStorage & { items: Map<string, string> } => {
    const items = new Map<string, string>();
    return {
      items,
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => {
        items.set(key, value);
      },
    };
  };
  const parsePolicy = (value: unknown): { policy: 'on' | 'off'; expiresAt: number } | undefined =>
    typeof value === 'object' &&
    value !== null &&
    'policy' in value &&
    (value.policy === 'on' || value.policy === 'off') &&
    'expiresAt' in value &&
    typeof value.expiresAt === 'number'
      ? { policy: value.policy, expiresAt: value.expiresAt }
      : undefined;

  it('should write the entry as JSON under exactly the given key', () => {
    const storage = memoryStorage();
    const store = createStorageAnswerStore({
      storage: () => storage,
      key: 'tau-telemetry-policy:https://api.test',
      parse: parsePolicy,
    });
    store.write({ policy: 'on', expiresAt: 42 });
    expect([...storage.items]).toEqual([['tau-telemetry-policy:https://api.test', '{"policy":"on","expiresAt":42}']]);
    expect(store.read()).toEqual({ policy: 'on', expiresAt: 42 });
  });

  it('should read nothing from a missing, corrupt, invalid or throwing store', () => {
    const storage = memoryStorage();
    const store = createStorageAnswerStore({ storage: () => storage, key: 'k', parse: parsePolicy });
    expect(store.read()).toBeUndefined();
    storage.items.set('k', '{not json');
    expect(store.read()).toBeUndefined();
    storage.items.set('k', '{"policy":"maybe","expiresAt":1}');
    expect(store.read()).toBeUndefined();
    expect(createStorageAnswerStore({ storage: () => undefined, key: 'k', parse: parsePolicy }).read()).toBeUndefined();
    const throwing: AnswerStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const blocked = createStorageAnswerStore({ storage: () => throwing, key: 'k', parse: parsePolicy });
    expect(blocked.read()).toBeUndefined();
    expect(() => {
      blocked.write({ policy: 'off', expiresAt: 1 });
    }).not.toThrow();
  });
});

describe('requestAnswer', () => {
  const parse = (body: unknown): Funded | undefined => parseFunded(body)?.answer;

  it('should GET without credentials and return the parsed body', async () => {
    const fetch = vi.fn(async () => json({ funded: true, maxAgeSeconds: 60 }));
    const result = await requestAnswer({
      fetch: fetch as unknown as typeof globalThis.fetch,
      url: 'https://api.test/v1/x',
      parse,
    });
    expect(result).toEqual({ kind: 'answer', body: { funded: true } });
    expect(fetch).toHaveBeenCalledWith('https://api.test/v1/x', { method: 'GET', credentials: 'omit' });
  });

  it('should classify 404, other statuses, malformed bodies and thrown fetches', async () => {
    const run = async (response: Response | Error) =>
      requestAnswer({
        fetch: (async () => {
          if (response instanceof Error) {
            throw response;
          }
          return response;
        }) as typeof globalThis.fetch,
        url: 'https://api.test/v1/x',
        parse,
      });
    expect(await run(new Response('', { status: 404 }))).toEqual({ kind: 'absent' });
    expect(await run(new Response('', { status: 503 }))).toEqual({ kind: 'failed', reason: 'status' });
    expect(await run(new Response('{bad', { status: 200 }))).toEqual({ kind: 'failed', reason: 'malformed' });
    expect(await run(json({ funded: 'yes' }))).toEqual({ kind: 'failed', reason: 'malformed' });
    expect(await run(new TypeError('fetch failed'))).toEqual({ kind: 'failed', reason: 'network' });
  });

  it('should time out a request that never settles and abort it', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const pending = requestAnswer({
        fetch: (async (_url: string, init?: RequestInit) => {
          signal = init?.signal ?? undefined;
          return never();
        }) as typeof globalThis.fetch,
        url: 'https://api.test/v1/x',
        parse,
        requestTimeout: 1000,
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(await pending).toEqual({ kind: 'failed', reason: 'timeout' });
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should pass a cache mode and add nothing else to the request when asked', async () => {
    const fetch = vi.fn(async () => json({ funded: true, maxAgeSeconds: 60 }));
    await requestAnswer({
      fetch: fetch as unknown as typeof globalThis.fetch,
      url: 'https://api.test/v1/x',
      parse,
      cache: 'no-store',
    });
    expect(fetch).toHaveBeenCalledWith('https://api.test/v1/x', {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
    });
  });

  it("should abort the request with the caller's signal, with or without a timeout", async () => {
    for (const requestTimeout of [undefined, 10_000]) {
      const controller = new AbortController();
      let seen: AbortSignal | undefined;
      const pending = requestAnswer({
        fetch: (async (_url: string, init?: RequestInit) => {
          seen = init?.signal ?? undefined;
          return new Promise<Response>((_resolve, reject) => {
            seen?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          });
        }) as typeof globalThis.fetch,
        url: 'https://api.test/v1/x',
        parse,
        signal: controller.signal,
        ...(requestTimeout === undefined ? {} : { requestTimeout }),
      });
      controller.abort();
      // oxlint-disable-next-line no-await-in-loop -- each case settles before the next starts.
      expect(await pending).toEqual({ kind: 'failed', reason: 'network' });
      expect(seen?.aborted).toBe(true);
    }
  });
});

// ===========================================================================
// The per-origin resolver
// ===========================================================================

describe('createOriginAnswerResolver', () => {
  it('should fetch the path on the exact origin and then serve the fresh cache', async () => {
    const { resolver, fetch } = harness([json({ funded: true, maxAgeSeconds: 300 })]);
    expect(await resolver.resolve('https://api.test')).toEqual({
      state: 'known',
      answer: { funded: true },
      source: 'network',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.test/v1/deployment');
    expect(await resolver.resolve('https://api.test')).toEqual({
      state: 'known',
      answer: { funded: true },
      source: 'cache',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should key by origin, so a URL with a path shares its origin entry', async () => {
    const { resolver, fetch } = harness([json({ funded: true, maxAgeSeconds: 300 })]);
    await resolver.resolve('https://api.test/some/path?q=1');
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.test/v1/deployment');
    const shared = await resolver.resolve('https://api.test');
    expect(shared.state).toBe('known');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should never share an answer across origins (scheme, host and port differ)', async () => {
    const { resolver, fetch } = harness([
      json({ funded: true, maxAgeSeconds: 300 }),
      json({ funded: false, maxAgeSeconds: 300 }),
      json({ funded: false, maxAgeSeconds: 300 }),
      json({ funded: false, maxAgeSeconds: 300 }),
    ]);
    expect(await resolver.resolve('https://api.test')).toMatchObject({ answer: { funded: true } });
    expect(await resolver.resolve('http://api.test')).toMatchObject({ answer: { funded: false } });
    expect(await resolver.resolve('https://api.test:8443')).toMatchObject({ answer: { funded: false } });
    expect(await resolver.resolve('https://other.test')).toMatchObject({ answer: { funded: false } });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://api.test/v1/deployment',
      'http://api.test/v1/deployment',
      'https://api.test:8443/v1/deployment',
      'https://other.test/v1/deployment',
    ]);
    expect(await resolver.resolve('https://api.test')).toEqual({
      state: 'known',
      answer: { funded: true },
      source: 'cache',
    });
  });

  it('should use one store per origin from the injected factory', async () => {
    const stores = new Map<string, ReturnType<typeof createMemoryAnswerStore<CachedAnswer<Funded>>>>();
    const store = vi.fn((origin: string) => {
      const existing = stores.get(origin) ?? createMemoryAnswerStore<CachedAnswer<Funded>>();
      stores.set(origin, existing);
      return existing;
    });
    const { resolver, now } = harness([json({ funded: true, maxAgeSeconds: 300 })], { store });
    await resolver.resolve('https://api.test/x');
    expect([...stores.keys()]).toEqual(['https://api.test']);
    expect(stores.get('https://api.test')?.read()).toEqual({ answer: { funded: true }, expiresAt: now() + 300_000 });
  });

  it('should expire the cache after its bounded maxAge and ask the network again', async () => {
    const { resolver, fetch, advance } = harness([
      json({ funded: true, maxAgeSeconds: 5 }),
      json({ funded: false, maxAgeSeconds: 300 }),
    ]);
    await resolver.resolve('https://api.test');
    advance(59_999);
    expect(await resolver.resolve('https://api.test')).toMatchObject({ source: 'cache', answer: { funded: true } });
    advance(1);
    expect(await resolver.resolve('https://api.test')).toEqual({
      state: 'known',
      answer: { funded: false },
      source: 'network',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should prefer the network over a stale answer when the network answers', async () => {
    const { resolver, advance } = harness([
      json({ funded: true, maxAgeSeconds: 60 }),
      json({ funded: false, maxAgeSeconds: 60 }),
    ]);
    await resolver.resolve('https://api.test');
    advance(61_000);
    expect(await resolver.resolve('https://api.test')).toEqual({
      state: 'known',
      answer: { funded: false },
      source: 'network',
    });
  });

  it('should serve a stale answer within the grace window only when the network fails', async () => {
    const { resolver, advance } = harness([
      json({ funded: true, maxAgeSeconds: 60 }),
      new Response('', { status: 503 }),
      new TypeError('fetch failed'),
    ]);
    await resolver.resolve('https://api.test');
    advance(60_000 + 599_999);
    expect(await resolver.resolve('https://api.test')).toEqual({
      state: 'known',
      answer: { funded: true },
      source: 'stale',
    });
    advance(1);
    expect(await resolver.resolve('https://api.test')).toEqual({ state: 'unknown', reason: 'network' });
  });

  describe('404 reads as the absent value (I2)', () => {
    it('should map a 404 to the absent value and cache it for the minimum maxAge', async () => {
      const { resolver, fetch, advance } = harness(
        [new Response('', { status: 404 }), json({ funded: true, maxAgeSeconds: 300 })],
        { absent: { funded: false } },
      );
      expect(await resolver.resolve('https://api.test')).toEqual({
        state: 'known',
        answer: { funded: false },
        source: 'absent',
      });
      advance(59_999);
      expect(await resolver.resolve('https://api.test')).toMatchObject({ source: 'cache', answer: { funded: false } });
      advance(1);
      expect(await resolver.resolve('https://api.test')).toMatchObject({ source: 'network', answer: { funded: true } });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should read a 404 as unknown when no absent value is supplied', async () => {
      const { resolver } = harness([new Response('', { status: 404 })]);
      expect(await resolver.resolve('https://api.test')).toEqual({ state: 'unknown', reason: 'status' });
    });
  });

  describe('failures never read as the absent value (I2)', () => {
    const failures: ReadonlyArray<[string, () => Response | Error | (() => Promise<Response>), string]> = [
      ['a 5xx', () => new Response('', { status: 500 }), 'status'],
      ['a 503', () => new Response('', { status: 503 }), 'status'],
      ['a malformed body', () => new Response('<html>', { status: 200 }), 'malformed'],
      ['a body of the wrong shape', () => json({ version: 2 }), 'malformed'],
      ['a refused connection', () => new TypeError('fetch failed'), 'network'],
    ];

    it.each(failures)('should read %s as unknown with no cache', async (_name, response, reason) => {
      const { resolver } = harness([response()], { absent: { funded: false } });
      expect(await resolver.resolve('https://api.test')).toEqual({ state: 'unknown', reason });
    });

    it.each(failures)('should read %s as the stale answer within grace', async (_name, response) => {
      const { resolver, advance } = harness([json({ funded: true, maxAgeSeconds: 60 }), response()], {
        absent: { funded: false },
      });
      await resolver.resolve('https://api.test');
      advance(120_000);
      expect(await resolver.resolve('https://api.test')).toEqual({
        state: 'known',
        answer: { funded: true },
        source: 'stale',
      });
    });

    it('should read a timeout as unknown, never the absent value', async () => {
      vi.useFakeTimers();
      try {
        const { resolver } = harness([never], {
          absent: { funded: false },
          requestTimeout: 2000,
        });
        const pending = resolver.resolve('https://api.test');
        await vi.advanceTimersByTimeAsync(2000);
        expect(await pending).toEqual({ state: 'unknown', reason: 'timeout' });
      } finally {
        vi.useRealTimers();
      }
    });

    it('should read a timeout as the stale answer within grace', async () => {
      vi.useFakeTimers();
      try {
        const { resolver, advance } = harness([json({ funded: true, maxAgeSeconds: 60 }), never], {
          absent: { funded: false },
          requestTimeout: 2000,
        });
        await resolver.resolve('https://api.test');
        advance(120_000);
        const pending = resolver.resolve('https://api.test');
        await vi.advanceTimersByTimeAsync(2000);
        expect(await pending).toEqual({ state: 'known', answer: { funded: true }, source: 'stale' });
      } finally {
        vi.useRealTimers();
      }
    });

    it('should not cache a failure', async () => {
      const { resolver, fetch } = harness([
        new Response('', { status: 500 }),
        json({ funded: true, maxAgeSeconds: 60 }),
      ]);
      const failed = await resolver.resolve('https://api.test');
      expect(failed.state).toBe('unknown');
      expect(await resolver.resolve('https://api.test')).toMatchObject({ source: 'network' });
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  it('should share one request between concurrent resolves of one origin', async () => {
    const gate = deferred<Response>();
    const { resolver, fetch } = harness([async () => gate.promise, json({ funded: false, maxAgeSeconds: 60 })]);
    const first = resolver.resolve('https://api.test');
    const second = resolver.resolve('https://api.test/other');
    const elsewhere = resolver.resolve('https://other.test');
    gate.resolve(json({ funded: true, maxAgeSeconds: 60 }));
    expect(await first).toEqual({ state: 'known', answer: { funded: true }, source: 'network' });
    expect(await second).toEqual({ state: 'known', answer: { funded: true }, source: 'network' });
    expect(await elsewhere).toMatchObject({ answer: { funded: false } });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should send a request again after a shared request settles', async () => {
    const { resolver, fetch } = harness([new TypeError('fetch failed'), new TypeError('fetch failed')]);
    await Promise.all([resolver.resolve('https://api.test'), resolver.resolve('https://api.test')]);
    await resolver.resolve('https://api.test');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should reject an input that has no origin', async () => {
    const { resolver } = harness([]);
    await expect(resolver.resolve('not a url')).rejects.toThrow(TypeError);
    await expect(resolver.resolve('data:text/plain,x')).rejects.toThrow(TypeError);
  });
});
