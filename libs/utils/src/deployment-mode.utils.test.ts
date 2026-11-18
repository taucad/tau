import { describe, expect, it, vi } from 'vitest';
import {
  createDeploymentModeResolver,
  deploymentAnswerKeyPrefix,
  deploymentModeDefaults,
  deploymentModeOf,
} from '#deployment-mode.utils.js';
import type { DeploymentModeResolverInput } from '#deployment-mode.utils.js';
import type { AnswerStorage } from '#origin-answer.utils.js';

// ===========================================================================
// Helpers
// ===========================================================================

const cloud = {
  version: 1,
  edition: 'cloud',
  billing: { funded: true, environment: 'staging' },
  maxAgeSeconds: 300,
} as const;
const selfHost = { version: 1, edition: 'self-host', billing: { funded: false }, maxAgeSeconds: 300 } as const;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Scripted = Response | Error | (() => Promise<Response>);

const harness = (
  byOrigin: Record<string, Scripted[]>,
  overrides: Partial<Omit<DeploymentModeResolverInput, 'fetch' | 'now'>> = {},
) => {
  let clock = 1_000_000;
  const fetch = vi.fn<typeof globalThis.fetch>(async (request) => {
    const url = request instanceof Request ? request.url : request.toString();
    const next = byOrigin[new URL(url).origin]?.shift();
    if (next === undefined) {
      throw new Error(`no response scripted for ${url}`);
    }
    if (next instanceof Error) {
      throw next;
    }
    return typeof next === 'function' ? next() : next;
  });
  const resolver = createDeploymentModeResolver({
    fetch,
    now: () => clock,
    ...overrides,
  });
  return {
    resolver,
    fetch,
    advance: (seconds: number) => {
      clock += seconds * 1000;
    },
  };
};

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

const api = 'https://api.example.test';
const other = 'https://api.other.test';

// ===========================================================================
// Modes
// ===========================================================================

describe('createDeploymentModeResolver', () => {
  it('should answer funded for a Cloud answer and request the route without credentials', async () => {
    const { resolver, fetch } = harness({ [api]: [json(cloud)] });

    await expect(resolver.mode(`${api}/v1/llm`)).resolves.toBe('funded');
    expect(fetch).toHaveBeenCalledWith(`${api}/v1/deployment`, expect.objectContaining({ credentials: 'omit' }));
  });

  it('should answer unfunded for an explicit self-host answer', async () => {
    const { resolver } = harness({ [api]: [json(selfHost)] });

    await expect(resolver.mode(api)).resolves.toBe('unfunded');
  });

  it('should answer unfunded for a 404, an API that predates the route (I2, I7)', async () => {
    const { resolver } = harness({ [api]: [json({ message: 'Not Found' }, 404)] });

    await expect(resolver.resolve(api)).resolves.toMatchObject({ state: 'known', source: 'absent' });
    await expect(resolver.mode(api)).resolves.toBe('unfunded');
  });

  it.each([
    ['a 500', (): Scripted => json({ message: 'boom' }, 500)],
    ['a 503', (): Scripted => json({ message: 'unavailable' }, 503)],
    ['a 401', (): Scripted => json({ message: 'no' }, 401)],
    ['a malformed body', (): Scripted => json({ version: 2, edition: 'cloud' })],
    ['a self-host answer claiming funding', (): Scripted => json({ ...selfHost, billing: { funded: true } })],
    ['a body that is not JSON', (): Scripted => new Response('<html>', { status: 200 })],
    ['a refused connection', (): Scripted => new TypeError('fetch failed')],
  ])('should answer unknown, never unfunded, for %s (I2)', async (_name, response) => {
    const { resolver } = harness({ [api]: [response()] });

    await expect(resolver.mode(api)).resolves.toBe('unknown');
  });

  it('should answer unknown when the request times out (I2)', async () => {
    const { resolver } = harness(
      {
        [api]: [
          async () =>
            new Promise<Response>(() => {
              /* Never settles. */
            }),
        ],
      },
      { requestTimeout: 5 },
    );

    await expect(resolver.resolve(api)).resolves.toEqual({ state: 'unknown', reason: 'timeout' });
    await expect(resolver.mode(api)).resolves.toBe('unknown');
  });

  it('should answer unknown for a URL with no origin rather than reject', async () => {
    const { resolver, fetch } = harness({});

    await expect(resolver.mode('not a url')).resolves.toBe('unknown');
    expect(fetch).not.toHaveBeenCalled();
  });

  // ===========================================================================
  // Cache
  // ===========================================================================

  it('should reuse a fresh answer and ask again once it expires', async () => {
    const { resolver, fetch, advance } = harness({ [api]: [json(cloud), json(selfHost)] });

    await expect(resolver.mode(api)).resolves.toBe('funded');
    advance(299);
    await expect(resolver.mode(api)).resolves.toBe('funded');
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(2);
    await expect(resolver.mode(api)).resolves.toBe('unfunded');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should clamp the answer maxAge into the documented bounds', async () => {
    const { resolver, fetch, advance } = harness({
      [api]: [json({ ...cloud, maxAgeSeconds: 0 }), json({ ...cloud, maxAgeSeconds: 999_999 }), json(cloud)],
    });

    await resolver.mode(api);
    advance(deploymentModeDefaults.maxAgeBounds.minimum - 1);
    await resolver.mode(api);
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(1);
    await resolver.mode(api);
    expect(fetch).toHaveBeenCalledTimes(2);
    advance(deploymentModeDefaults.maxAgeBounds.maximum);
    await resolver.mode(api);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('should let a stale answer stand in within the grace window only when the request fails', async () => {
    const { resolver, advance } = harness({
      [api]: [json(cloud), json({}, 503), json({}, 503)],
    });

    await expect(resolver.mode(api)).resolves.toBe('funded');
    advance(300 + deploymentModeDefaults.staleGraceSeconds - 1);
    await expect(resolver.resolve(api)).resolves.toMatchObject({ state: 'known', source: 'stale' });
    advance(2);
    await expect(resolver.mode(api)).resolves.toBe('unknown');
  });

  /* I2: only a 404 means "no route"; once that reading expires, a later failure never stands in for it. */
  it.each([
    ['in memory', undefined],
    ['in storage', 'storage'],
  ] as const)('should never let an expired 404 answer stand in for a failure (%s)', async (_name, kind) => {
    const storage = memoryStorage();
    const first = harness(
      { [api]: [json({}, 404), json({}, 503)] },
      kind === undefined ? {} : { storage: () => storage },
    );

    await expect(first.resolver.mode(api)).resolves.toBe('unfunded');
    first.advance(deploymentModeDefaults.maxAgeBounds.minimum + 1);
    await expect(first.resolver.mode(api)).resolves.toBe('unknown');

    if (kind === 'storage') {
      /* A reloaded page reads the stored 404 entry: fresh, it still answers; expired, a failure is unknown. */
      const second = harness({ [api]: [json({}, 503)] }, { storage: () => storage });
      second.advance(deploymentModeDefaults.maxAgeBounds.minimum + 1);
      await expect(second.resolver.mode(api)).resolves.toBe('unknown');
    }
  });

  /* The agent host bounds its deployment ask at 10 s; the request must give up first so a stale answer can stand in. */
  it('should let a stale funded answer stand in for a hanging request before the agent host gives up at 10 s', async () => {
    vi.useFakeTimers();
    try {
      const { resolver, advance } = harness({
        [api]: [
          json(cloud),
          async () =>
            new Promise<Response>(() => {
              /* Never settles. */
            }),
        ],
      });
      await expect(resolver.mode(api)).resolves.toBe('funded');
      advance(300 + 1);

      const pending = resolver.mode(api);
      await vi.advanceTimersByTimeAsync(9000);

      await expect(Promise.race([pending, Promise.resolve('still waiting')])).resolves.toBe('funded');
      expect(deploymentModeDefaults.requestTimeout).toBeLessThan(9000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should still let an explicit self-host answer stand in within the grace window', async () => {
    const { resolver, advance } = harness({ [api]: [json(selfHost), json({}, 503)] });

    await expect(resolver.mode(api)).resolves.toBe('unfunded');
    advance(301);
    await expect(resolver.resolve(api)).resolves.toMatchObject({ state: 'known', source: 'stale' });
  });

  it('should keep each origin to its own answer (I5)', async () => {
    const { resolver, fetch } = harness({ [api]: [json(cloud)], [other]: [json({}, 404)] });

    await expect(resolver.mode(api)).resolves.toBe('funded');
    await expect(resolver.mode(other)).resolves.toBe('unfunded');
    await expect(resolver.mode(`${api}/v1/llm`)).resolves.toBe('funded');
    /* Another scheme is another origin: nothing cached for it, and its failed request reads unknown. */
    await expect(resolver.mode('http://api.example.test')).resolves.toBe('unknown');
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      `${api}/v1/deployment`,
      `${other}/v1/deployment`,
      'http://api.example.test/v1/deployment',
    ]);
  });

  it('should store the answer under one key per origin and read it back in a new resolver', async () => {
    const storage = memoryStorage();
    const first = harness({ [api]: [json(cloud)], [other]: [json(selfHost)] }, { storage: () => storage });

    await first.resolver.mode(api);
    await first.resolver.mode(other);
    expect([...storage.items.keys()].sort()).toEqual([
      `${deploymentAnswerKeyPrefix}${api}`,
      `${deploymentAnswerKeyPrefix}${other}`,
    ]);

    const second = harness({}, { storage: () => storage });
    await expect(second.resolver.mode(api)).resolves.toBe('funded');
    await expect(second.resolver.mode(other)).resolves.toBe('unfunded');
    expect(second.fetch).not.toHaveBeenCalled();
  });

  it('should read a corrupt or tampered stored entry as empty and ask the network', async () => {
    const storage = memoryStorage();
    storage.items.set(`${deploymentAnswerKeyPrefix}${api}`, '{not json');
    storage.items.set(
      `${deploymentAnswerKeyPrefix}${other}`,
      JSON.stringify({ answer: { ...selfHost, billing: { funded: true } }, expiresAt: Number.MAX_SAFE_INTEGER }),
    );
    const { resolver, fetch } = harness(
      { [api]: [json(selfHost)], [other]: [json(selfHost)] },
      {
        storage: () => storage,
      },
    );

    await expect(resolver.mode(api)).resolves.toBe('unfunded');
    await expect(resolver.mode(other)).resolves.toBe('unfunded');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should cache in memory when storage is unavailable or throws', async () => {
    const throwing = harness(
      { [api]: [json(cloud)] },
      {
        storage: () => {
          throw new Error('SecurityError');
        },
      },
    );
    await throwing.resolver.mode(api);
    await expect(throwing.resolver.mode(api)).resolves.toBe('funded');
    expect(throwing.fetch).toHaveBeenCalledTimes(1);

    const absent = harness({ [api]: [json(cloud)] }, { storage: () => undefined });
    await absent.resolver.mode(api);
    await expect(absent.resolver.mode(api)).resolves.toBe('funded');
    expect(absent.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('deploymentModeOf', () => {
  it('should map each resolution to a mode', () => {
    expect(deploymentModeOf({ state: 'known', answer: cloud, source: 'network' })).toBe('funded');
    expect(deploymentModeOf({ state: 'known', answer: selfHost, source: 'cache' })).toBe('unfunded');
    expect(deploymentModeOf({ state: 'unknown', reason: 'status' })).toBe('unknown');
  });
});
