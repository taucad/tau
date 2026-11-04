/* eslint-disable @typescript-eslint/naming-convention -- Environment variable names. */
import { execFile } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reporterBounds, toRuntimeEntry } from '#client.js';
import type { RuntimeObservationInput, TauIdentity } from '#client.js';
import { createNodeHostTelemetry, createTauIdentityReader, nodeHoldBounds, nodeShutdownWait } from '#node-host.js';
import type { NodeHostTelemetryInput, NodeObservedClient, TauTokenRead } from '#node-host.js';

const observation = (): RuntimeObservationInput => ({
  operation: 'export',
  kernel: 'replicad',
  outcome: { type: 'succeeded' },
  transport: 'node-worker',
  adaptations: [],
  limit: undefined,
  format: 'stl',
  plugin: undefined,
  duration: 50,
  worker: undefined,
  facts: 'none',
});

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const urlOf = (url: string | URL | Request): string =>
  typeof url === 'string' ? url : 'href' in url ? url.href : url.url;

const harness = (overrides: Partial<NodeHostTelemetryInput> = {}, identity?: TauIdentity) => {
  let current: TauIdentity = identity ?? { kind: 'signed-out' };
  const fetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const target = urlOf(url);
    if (target.endsWith('/v1/telemetry/policy')) {
      return json({ policy: 'on', maxAge: 900 });
    }
    if (target.endsWith('/v1/privacy')) {
      return json({ allowsAiTraining: false, allowsUsageMetrics: true });
    }
    return json({ recorded: 1, rejected: 0, duplicate: 0, disabled: 0, policy: 'on' });
  });
  const firstRunNotice = vi.fn();
  const telemetry = createNodeHostTelemetry({
    route: 'cli',
    release: '1.2.3',
    apiOrigin: 'https://api.test',
    configDir: mkdtempSync(path.join(tmpdir(), 'tau-telemetry-')),
    env: {},
    cloudBuild: false,
    readIdentity: async () => current,
    platform: 'linux',
    firstRunNotice,
    fetch: fetch as typeof globalThis.fetch,
    ...overrides,
  });
  const posts = () =>
    fetch.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([, init]) => ({
        headers: init?.headers as Record<string, string> | undefined,
        body: JSON.parse(init?.body as string) as { entries: Array<{ name: string; detail: Record<string, unknown> }> },
      }));
  return {
    telemetry,
    fetch,
    posts,
    firstRunNotice,
    setIdentity: (next: TauIdentity) => {
      current = next;
    },
  };
};

const signedIn: TauIdentity = { kind: 'signed-in', authorization: 'Bearer secret-token', principalId: 'account-1' };

describe('createNodeHostTelemetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should compose nothing for an anonymous CLI without an explicit opt-in', async () => {
    const { telemetry, fetch } = harness();
    telemetry.startIdentityBootstrap();
    telemetry.record(toRuntimeEntry(observation(), telemetry.context('host')));
    await vi.advanceTimersByTimeAsync(reporterBounds.interval * 2);

    expect(fetch).not.toHaveBeenCalled();
    expect(telemetry.status()).toMatchObject({ cloudHost: false, preference: 'unset', source: 'default' });
  });

  it('should hold entries until identity resolves, then report a signed-in CLI with the bearer on the POST only', async () => {
    const { telemetry, fetch, posts, firstRunNotice } = harness({}, signedIn);
    telemetry.record(toRuntimeEntry(observation(), telemetry.context('host')));
    telemetry.startIdentityBootstrap();
    await vi.advanceTimersByTimeAsync(reporterBounds.interval);

    expect(firstRunNotice).toHaveBeenCalledTimes(1);
    const [post] = posts();
    expect(post?.headers?.['authorization']).toBe('Bearer secret-token');
    expect(post?.body.entries[0]).toMatchObject({
      name: 'runtime.operation',
      detail: { route: 'cli', caller: 'host', os: 'linux' },
    });
    const policy = fetch.mock.calls.find(([url]) => urlOf(url).endsWith('/v1/telemetry/policy'));
    expect(policy?.[1]).toEqual({ method: 'GET', credentials: 'omit' });
    expect(fetch.mock.calls.every(([url]) => urlOf(url).startsWith('https://api.test/'))).toBe(true);
  });

  it('should never compose under TAU_SERVE_ROLE, but compose a cloud host container on its marker', async () => {
    const selfHost = harness({ env: { TAU_SERVE_ROLE: 'daemon' } }, signedIn);
    selfHost.telemetry.startIdentityBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(selfHost.telemetry.ensureReporter()).toBeUndefined();

    const cloud = harness({ route: 'cloud', env: { TAU_SERVE_ROLE: 'daemon', TAU_CLOUD_HOST: '1' } });
    cloud.telemetry.startIdentityBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(cloud.telemetry.ensureReporter()).toBeDefined();
  });

  it('should honour TAU_TELEMETRY=0 and DO_NOT_TRACK=1 as off', () => {
    expect(harness({ env: { TAU_TELEMETRY: '0', TAU_AUTH_TOKEN: 'x' } }).telemetry.status()).toMatchObject({
      preference: 'off',
      source: 'env',
      consent: 'denied',
    });
    expect(harness({ env: { DO_NOT_TRACK: '1' } }).telemetry.status()).toMatchObject({ source: 'do-not-track' });
  });

  it('should compose an anonymous CLI after tau telemetry on', async () => {
    const { telemetry } = harness();
    await telemetry.setPreference('on');
    telemetry.startIdentityBootstrap();
    await vi.advanceTimersByTimeAsync(0);

    expect(telemetry.status()).toMatchObject({
      preference: 'on',
      source: 'config',
      cloudHost: true,
      consent: 'granted',
    });
  });

  it('should keep holding while identity is unresolved, bounded, and never throw', async () => {
    const { telemetry, fetch } = harness({}, { kind: 'unresolved', reason: 'offline' });
    telemetry.startIdentityBootstrap();
    for (let index = 0; index < nodeHoldBounds.entries + 3; index += 1) {
      telemetry.record(toRuntimeEntry(observation(), telemetry.context('host')));
    }
    await vi.advanceTimersByTimeAsync(nodeHoldBounds.backoffCap);

    expect(telemetry.droppedBeforeIdentity()).toBe(3);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should survive a provider that throws', async () => {
    const { telemetry } = harness({
      readIdentity: async () => {
        throw new Error('bug');
      },
    });

    expect(() => {
      telemetry.startIdentityBootstrap();
    }).not.toThrow();
    await vi.advanceTimersByTimeAsync(nodeHoldBounds.backoffFirst * 4);
  });

  it('should leave a client it cannot subscribe to unobserved instead of throwing', () => {
    const { telemetry } = harness();
    const client: NodeObservedClient = {
      on: (): never => {
        throw new Error('no events');
      },
    };

    expect(() => {
      telemetry.observe(client, 'agent')();
    }).not.toThrow();
  });

  it('should ask a client for facts only once the policy is on, and tell it off on unsubscribe', async () => {
    const { telemetry } = harness({ env: { TAU_CLOUD_HOST: '1' }, route: 'cloud' });
    telemetry.startIdentityBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    const observe = vi.fn();
    const handlers: Array<(value: RuntimeObservationInput) => void> = [];
    const client: NodeObservedClient = {
      observe,
      on: ((event: string, handler: (value: RuntimeObservationInput) => void) => {
        if (event === 'operation') {
          handlers.push(handler);
        }
        return () => undefined;
      }) as NodeObservedClient['on'],
    };

    const stop = telemetry.observe(client, 'agent');
    for (const handler of handlers) {
      handler(observation());
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(observe).toHaveBeenCalledWith('facts');

    stop();
    expect(observe).toHaveBeenLastCalledWith('off');
  });

  it('should read the renderer consent on desktop: denied denies', () => {
    const { telemetry } = harness({ route: 'desktop', cloudBuild: true, rendererConsent: () => 'denied' });

    expect(telemetry.status().consent).toBe('denied');
  });

  it('should flush at shutdown within the bound', async () => {
    const { telemetry, posts } = harness({ env: { TAU_CLOUD_HOST: '1' }, route: 'cloud' });
    telemetry.startIdentityBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    telemetry.record(toRuntimeEntry(observation(), telemetry.context('agent')));
    await vi.advanceTimersByTimeAsync(0);

    const done = telemetry.shutdown();
    await vi.advanceTimersByTimeAsync(2000);
    await done;
    expect(posts().length).toBeGreaterThan(0);
  });
});

/** Whether `promise` has settled by now, without waiting for it. */
const hasSettled = async (promise: Promise<unknown>): Promise<boolean> => {
  const pending = Symbol('pending');
  return (await Promise.race([promise, Promise.resolve(pending)])) !== pending;
};

describe('T19: createNodeHostTelemetry shutdown of a short-lived command', () => {
  it('T19: should deliver an entry recorded right before shutdown, waiting for the identity read and the policy probe', async () => {
    const { telemetry, posts, fetch } = harness({}, signedIn);
    telemetry.startIdentityBootstrap();
    telemetry.record(toRuntimeEntry(observation(), telemetry.context('host')));

    await telemetry.shutdown();

    expect(posts()).toHaveLength(1);
    expect(posts()[0]?.body.entries.filter(({ name }) => name === 'runtime.operation')).toHaveLength(1);
    expect(fetch.mock.calls.some(([url]) => urlOf(url).endsWith('/v1/telemetry/policy'))).toBe(true);
  });

  it('T19: should deliver it when the account answers usage metrics only after shutdown began', async () => {
    const answers = harness({}, signedIn);
    const slow = vi.fn(async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      if (urlOf(url).endsWith('/v1/privacy')) {
        await new Promise((resolve) => {
          setTimeout(resolve, 200);
        });
      }
      return answers.fetch(url, init);
    });
    const { telemetry } = harness({ fetch: slow as typeof globalThis.fetch }, signedIn);
    telemetry.startIdentityBootstrap();
    telemetry.record(toRuntimeEntry(observation(), telemetry.context('host')));

    await telemetry.shutdown();

    expect(slow.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('T19: should return at once and send nothing when nothing was recorded', async () => {
    vi.useFakeTimers();
    try {
      const { telemetry, fetch } = harness({}, signedIn);
      telemetry.startIdentityBootstrap();
      await vi.advanceTimersByTimeAsync(0);
      expect(telemetry.ensureReporter()).toBeDefined();
      const done = telemetry.shutdown();
      await vi.advanceTimersByTimeAsync(0);

      expect(await hasSettled(done)).toBe(true);
      expect(fetch.mock.calls.some(([url]) => urlOf(url).endsWith('/v1/telemetry/policy'))).toBe(false);
      expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [
      'an API that never answers',
      async () =>
        new Promise<Response>(() => {
          /* Never settles. */
        }),
    ],
    [
      'an API that refuses every connection',
      async () => {
        throw new TypeError('fetch failed');
      },
    ],
  ])('T19: should return within the shutdown bound with %s', async (_why, unreachable) => {
    vi.useFakeTimers();
    try {
      const { telemetry } = harness({ fetch: vi.fn(unreachable) as unknown as typeof globalThis.fetch }, signedIn);
      telemetry.startIdentityBootstrap();
      telemetry.record(toRuntimeEntry(observation(), telemetry.context('host')));
      const done = telemetry.shutdown();
      await vi.advanceTimersByTimeAsync(nodeShutdownWait - 1);
      const before = await hasSettled(done);
      await vi.advanceTimersByTimeAsync(1);

      /* No policy answer ever arrives, so shutdown holds for the whole bound and not a millisecond longer. */
      expect(before).toBe(false);
      expect(await hasSettled(done)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('T19: a Node process awaiting shutdown', () => {
  it('T19: should exit 0 within the bound while its identity read is still pending, never 13 from a drained loop', async () => {
    const fixture = fileURLToPath(new URL('node-host-exit.fixture.ts', import.meta.url));
    const started = Date.now();

    const { stdout } = await promisify(execFile)(process.execPath, [fixture], { timeout: 20_000 });

    expect(stdout).toBe('shutdown-returned\n');
    expect(Date.now() - started).toBeLessThan(nodeShutdownWait + 5000);
  }, 30_000);
});

describe('createTauIdentityReader', () => {
  const session = (status: number) =>
    vi.fn(async (): Promise<Response> => json({ user: { id: 'account-1', email: 'a@example.test' } }, status));

  it('should resolve the principal once per token and reuse it', async () => {
    const fetch = session(200);
    const read = createTauIdentityReader({
      apiOrigin: 'https://api.test',
      readToken: async () => ({ kind: 'token', token: 't1' }),
      fetch: fetch as typeof globalThis.fetch,
    });

    expect(await read()).toEqual({ kind: 'signed-in', authorization: 'Bearer t1', principalId: 'account-1' });
    await read();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.test/v1/auth/get-session',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  const none: TauTokenRead = async () => ({ kind: 'none' });
  const unavailable: TauTokenRead = async () => ({ kind: 'unavailable' });
  const throwing: TauTokenRead = async () => {
    throw new Error('locked');
  };
  const token: TauTokenRead = async () => ({ kind: 'token', token: 't' });
  it.each([
    { label: 'no credential', readToken: none, fetch: session(200), expected: { kind: 'signed-out' } },
    {
      label: 'a keyring fault',
      readToken: unavailable,
      fetch: session(200),
      expected: { kind: 'unresolved', reason: 'keyring-error' },
    },
    {
      label: 'a throwing keyring',
      readToken: throwing,
      fetch: session(200),
      expected: { kind: 'unresolved', reason: 'keyring-error' },
    },
    { label: 'a dead credential', readToken: token, fetch: session(401), expected: { kind: 'signed-out' } },
    {
      label: 'a server error',
      readToken: token,
      fetch: session(503),
      expected: { kind: 'unresolved', reason: 'session-failed' },
    },
  ])('should never reject on $label', async ({ readToken, fetch, expected }) => {
    const read = createTauIdentityReader({
      apiOrigin: 'https://api.test',
      readToken,
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(read()).resolves.toEqual(expected);
  });

  it('should answer offline when the API cannot be reached', async () => {
    const read = createTauIdentityReader({
      apiOrigin: 'https://api.test',
      readToken: async () => ({ kind: 'token', token: 't' }),
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof globalThis.fetch,
    });

    await expect(read()).resolves.toEqual({ kind: 'unresolved', reason: 'offline' });
  });
});
