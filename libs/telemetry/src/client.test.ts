import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createIngestReporter,
  isCloudHost,
  reporterBounds,
  resolveTelemetryConsent,
  toLateEntry,
  toRuntimeEntry,
  toViewerEntry,
  verifyEntry,
} from '#client.js';
import type {
  CachedTelemetryPolicy,
  IngestReporterInput,
  ReportingConsent,
  RuntimeIngestEntry,
  RuntimeObservationInput,
  RuntimeOperationEntry,
  TauIdentity,
  TelemetryPolicyStore,
} from '#client.js';
import { ingestBatchSchema, parseRuntimeEntry } from '#runtime-entry.js';

const context = { route: 'browser', caller: 'editor', release: '0123abc' } as const;
const observation = (overrides: Partial<RuntimeObservationInput> = {}): RuntimeObservationInput => ({
  operation: 'render',
  kernel: 'replicad',
  outcome: { type: 'succeeded' },
  transport: 'web-worker',
  adaptations: [],
  limit: undefined,
  format: undefined,
  plugin: undefined,
  duration: 250,
  worker: undefined,
  facts: 'none',
  ...overrides,
});

describe('resolveTelemetryConsent', () => {
  const granted = { globalPrivacyControl: false, analytics: 'accepted', device: 'unset', server: 'none' } as const;

  it.each([
    ['GPC', { globalPrivacyControl: true }],
    ['a declined analytics decision', { analytics: 'declined' }],
    ['a device off', { device: 'off' }],
    ['a server false', { server: false }],
    ['a denied renderer', { renderer: 'denied' }],
  ] as const)('should deny on %s', (_label, input) => {
    expect(resolveTelemetryConsent({ ...granted, ...input })).toBe('denied');
  });

  it('should be unknown while the server preference loads or before the renderer reports', () => {
    expect(resolveTelemetryConsent({ ...granted, server: undefined })).toBe('unknown');
    expect(resolveTelemetryConsent({ ...granted, renderer: undefined })).toBe('unknown');
    expect(resolveTelemetryConsent({ ...granted, renderer: 'unknown' })).toBe('unknown');
  });

  it('should grant by default and with a granted renderer', () => {
    expect(resolveTelemetryConsent(granted)).toBe('granted');
    expect(resolveTelemetryConsent({ ...granted, server: true, renderer: 'granted' })).toBe('granted');
  });
});

describe('isCloudHost', () => {
  const host = { cloudBuild: false, selfHostServing: false, signedIn: false, ci: false, explicitOptIn: false };

  it('should qualify a cloud build, a signed-in host and an explicit opt-in', () => {
    expect(isCloudHost({ ...host, cloudBuild: true })).toBe(true);
    expect(isCloudHost({ ...host, signedIn: true })).toBe(true);
    expect(isCloudHost({ ...host, ci: true, explicitOptIn: true })).toBe(true);
  });

  it('should never qualify a self-hosted serving process, CI without opt-in, or nothing', () => {
    expect(isCloudHost({ ...host, cloudBuild: true, selfHostServing: true, explicitOptIn: true })).toBe(false);
    expect(isCloudHost({ ...host, cloudBuild: true, ci: true })).toBe(false);
    expect(isCloudHost(host)).toBe(false);
  });
});

describe('toRuntimeEntry', () => {
  const valid = (entry: RuntimeOperationEntry): RuntimeOperationEntry => {
    expect(parseRuntimeEntry(entry), JSON.stringify(entry)).toBeDefined();
    return entry;
  };

  it('should map a succeeded render with joined, bounded worker facts', () => {
    const entry = valid(
      toRuntimeEntry(
        observation({
          facts: 'joined',
          adaptations: ['TESSELLATION_DOWNGRADED', 'TESSELLATION_DOWNGRADED', 'NOT_A_CODE'],
          worker: {
            queue: -5,
            execution: Number.NaN,
            cold: true,
            reuse: 'cache',
            heapBytes: 2 ** 40,
            heapSource: 'kernel',
            realm: 'web-worker',
            plugin: 'assimp',
            triangles: 12.7,
            parameters: { declared: 3, modified: 1 },
            phases: { compute: 5, mesh: 2 * 3_600_000, bogus: 3, export: undefined },
            middleware: { total: 4, slowestId: 'ThirdParty', slowest: 3, ran: ['ParameterCache', 'X', 'Y'] },
            bundler: 'esbuild',
          },
        }),
        { ...context, device: 'standard', platform: 'chromium', os: 'plan9' },
      ),
    );
    expect(entry.detail).toMatchObject({
      operation: 'render',
      outcome: 'succeeded',
      kernel: 'replicad',
      transport: 'web-worker',
      device: 'standard',
      platform: 'chromium',
      os: '_OTHER',
      adaptations: ['TESSELLATION_DOWNGRADED', '_OTHER'],
      worker: {
        queue: 0,
        execution: 0,
        heapBytes: 64 * 2 ** 30,
        triangles: 12,
        phases: { compute: 5, mesh: 3_600_000 },
        middleware: { slowestId: '_OTHER', ran: ['ParameterCache', '_OTHER'] },
        bundler: 'esbuild',
      },
    });
    expect(entry.detail.worker).not.toHaveProperty('parameters');
    expect(entry.detail).not.toHaveProperty('code');
  });

  it('should keep parameter facts and the entry format on evaluate', () => {
    const entry = valid(
      toRuntimeEntry(
        observation({
          operation: 'evaluate',
          kernel: undefined,
          entryFormat: 'ts',
          facts: 'joined',
          worker: {
            queue: 0,
            execution: 1,
            cold: false,
            reuse: 'nonsense',
            triangles: Number.POSITIVE_INFINITY,
            parameters: {
              declared: 5000,
              modified: 2,
              unknown: 1,
              truncated: true,
              features: ['units', 'units', 'array', 'decimal', 'structured', 'extra'],
            },
            middleware: { total: 1, slowestId: 'ParameterUnits', slowest: 1 },
          },
        }),
        context,
      ),
    );
    expect(entry.detail).toMatchObject({
      entryFormat: 'ts',
      worker: {
        reuse: '_OTHER',
        parameters: {
          declared: 1000,
          modified: 2,
          unknown: 1,
          truncated: true,
          features: ['units', 'array', 'decimal', 'structured'],
        },
      },
    });
    expect(entry.detail).not.toHaveProperty('kernel');
    expect(entry.detail.worker).not.toHaveProperty('triangles');
  });

  it('should read non-finite parameter counts as zero and leave absent facts absent', () => {
    const entry = valid(
      toRuntimeEntry(
        observation({
          operation: 'evaluate',
          facts: 'joined',
          worker: {
            queue: 0,
            execution: 0,
            cold: false,
            reuse: 'off',
            parameters: { declared: Number.NaN, modified: Number.POSITIVE_INFINITY },
            middleware: { total: 1, slowestId: 'GeometryCache', slowest: 1, ran: ['GeometryCache'] },
          },
        }),
        context,
      ),
    );
    expect(entry.detail.worker?.parameters).toEqual({ declared: 0, modified: 0 });
    expect(entry.detail.worker?.middleware).toEqual({
      total: 1,
      slowestId: 'GeometryCache',
      slowest: 1,
      ran: ['GeometryCache'],
    });
    const plain = valid(
      toRuntimeEntry(
        observation({ facts: 'joined', worker: { queue: 0, execution: 0, cold: false, reuse: 'none' } }),
        context,
      ),
    );
    expect(plain.detail.worker).toEqual({ queue: 0, execution: 0, cold: false, reuse: 'none' });
  });

  it('should keep the format, plugin and source format on a transcoder-routed export', () => {
    const entry = valid(
      toRuntimeEntry(
        observation({
          operation: 'export',
          format: 'glb',
          plugin: 'assimp',
          sourceFormat: 'fbx',
          entryFormat: 'ts',
          facts: 'missing-worker-gone',
          worker: { queue: 0, execution: 0, cold: false, reuse: 'none' },
        }),
        context,
      ),
    );
    expect(entry.detail).toMatchObject({
      format: 'glb',
      plugin: 'assimp',
      sourceFormat: 'fbx',
      factsMissing: 'missing-worker-gone',
    });
    expect(entry.detail).not.toHaveProperty('worker');
    expect(entry.detail).not.toHaveProperty('entryFormat');
  });

  it('should drop facets an operation does not carry', () => {
    const entry = valid(
      toRuntimeEntry(
        observation({ format: 'stl', plugin: 'assimp', sourceFormat: 'stl', facts: 'missing-timeout' }),
        context,
      ),
    );
    expect(entry.detail).not.toHaveProperty('format');
    expect(entry.detail).not.toHaveProperty('plugin');
    expect(entry.detail).not.toHaveProperty('sourceFormat');
  });

  const limit = {
    limit: 'occt.export.triangles',
    unit: '{triangle}',
    maximum: 10,
    demand: { kind: 'measured', value: 12 },
    origin: 'default',
  } as const;

  it.each([
    [{ type: 'issue', code: 'RESOURCE_LIMIT' }, 'RESOURCE_LIMIT'],
    [{ type: 'timed-out', phase: 'render' }, 'RUNTIME_OPERATION_TIMEOUT'],
    [{ type: 'terminated', close: 'wire-failure', detail: undefined }, 'TRANSPORT_FAILED'],
    [{ type: 'terminated', close: 'operation-timeout', detail: undefined }, 'TIMEOUT_RECOVERY'],
    [{ type: 'terminated', close: 'host-exit', detail: { phase: 'boot' } }, 'HOST_BOOT_FAILED'],
    [{ type: 'terminated', close: 'host-exit', detail: { phase: 'session' } }, 'HOST_EXITED'],
    [{ type: 'terminated', close: 'host-exit', detail: undefined }, 'HOST_EXITED'],
    [{ type: 'discarded', code: 'UNKNOWN' }, 'UNKNOWN'],
    [{ type: 'failed', code: 'secret message' }, '_OTHER'],
  ] as const)('should map %j to the code %s', (outcome, code) => {
    expect(valid(toRuntimeEntry(observation({ outcome }), context)).detail.code).toBe(code);
  });

  it('should record a supervisor kill for a limit as HOST_LIMIT_EXCEEDED with the limit', () => {
    const entry = valid(
      toRuntimeEntry(
        observation({
          outcome: { type: 'terminated', close: 'host-exit', detail: { phase: 'session', exceeded: limit } },
        }),
        context,
      ),
    );
    expect(entry.detail).toMatchObject({
      code: 'HOST_LIMIT_EXCEEDED',
      limit: { id: 'occt.export.triangles', maximum: 10, demand: { kind: 'measured', value: 12 } },
    });
  });

  it.each([
    ['an id off the allowlist', { ...limit, limit: 'customer.secret' }],
    ['a unit off the list', { ...limit, unit: 'parsecs' }],
    ['a non-finite maximum', { ...limit, maximum: Number.NaN }],
    ['a negative maximum', { ...limit, maximum: -1 }],
    ['a negative demand', { ...limit, demand: { kind: 'estimated', value: -1 } }],
  ] as const)('should send %s as _OTHER alone', (_label, details) => {
    const entry = valid(
      toRuntimeEntry(observation({ outcome: { type: 'issue', code: 'RESOURCE_LIMIT' }, limit: details }), context),
    );
    expect(entry.detail.limit).toEqual({ id: '_OTHER' });
  });

  it('should keep an unknown demand', () => {
    const entry = toRuntimeEntry(
      observation({
        outcome: { type: 'issue', code: 'RESOURCE_LIMIT' },
        limit: { ...limit, demand: { kind: 'unknown' } },
      }),
      context,
    );
    expect(entry.detail.limit).toMatchObject({ demand: { kind: 'unknown' } });
  });

  it('should carry no code on cancelled, superseded and abandoned', () => {
    for (const outcome of [
      { type: 'cancelled' },
      { type: 'superseded' },
      { type: 'abandoned', reason: 'closed' },
    ] as const) {
      expect(valid(toRuntimeEntry(observation({ outcome }), context)).detail).not.toHaveProperty('code');
    }
  });
});

describe('toLateEntry', () => {
  it('should map a late reply', () => {
    const entry = toLateEntry(
      { operation: 'render', settledAs: 'cancelled', after: 1200 },
      { ...context, caller: 'nope' },
    );
    expect(entry).toEqual({
      name: 'runtime.late',
      duration: 1200,
      detail: { operation: 'render', settledAs: 'cancelled', route: 'browser', caller: '_OTHER' },
    });
    expect(parseRuntimeEntry(entry)).toBeDefined();
  });
});

describe('toViewerEntry', () => {
  it('should map a viewer event to an admissible entry with closed values and no caller', () => {
    const entry = toViewerEntry(
      { event: 'first-frame', backend: 'webgpu', duration: 7_200_000, triangles: 12 },
      { ...context, device: 'standard', platform: 'chromium' },
    );

    expect(entry).toEqual({
      name: 'runtime.viewer',
      duration: 3_600_000,
      detail: {
        event: 'first-frame',
        backend: 'webgpu',
        route: 'browser',
        release: '0123abc',
        device: 'standard',
        platform: 'chromium',
        triangles: 12,
      },
    });
    expect(() => parseRuntimeEntry(entry)).not.toThrow();
  });

  it('should carry a format only on a download, closed to the export vocabulary', () => {
    expect(toViewerEntry({ event: 'download', backend: 'webgl', format: 'glb' }, context).detail.format).toBe('glb');
    expect(toViewerEntry({ event: 'download', backend: 'webgl', format: 'secret' }, context).detail.format).toBe(
      '_OTHER',
    );
    expect(
      toViewerEntry({ event: 'context-lost', backend: 'webgl', format: 'glb' }, context).detail,
    ).not.toHaveProperty('format');
  });
});

describe('verifyEntry', () => {
  const run = { kernel: 'replicad', selected: 4, passed: 4, failed: 0, duration: 900 } as const;

  it('should record a passing run as succeeded under the geospec caller', () => {
    const entry = verifyEntry({ status: 'completed', ...run }, { ...context, caller: 'agent' });
    expect(entry.detail).toEqual({
      operation: 'verify',
      outcome: 'succeeded',
      kernel: 'replicad',
      verify: { selected: 4, passed: 4, failed: 0 },
      caller: 'geospec',
      route: 'browser',
      release: '0123abc',
    });
    expect(parseRuntimeEntry(entry)).toBeDefined();
  });

  it('should record failed tests, an empty discovery, a refused config and a work-unit limit by their codes', () => {
    const failed = verifyEntry({ status: 'completed', ...run, passed: 3, failed: 1 }, context);
    const empty = verifyEntry({ status: 'no-files', duration: 3 }, context);
    const refused = verifyEntry({ status: 'refused', code: 'GEOSPEC_CONFIG_NOT_APPLIED', duration: 1 }, context);
    const limited = verifyEntry(
      { status: 'limit', ...run, passed: 3, failed: 1, maximum: 1000, demand: 1500, origin: 'host-option' },
      context,
    );
    expect(failed.detail).toMatchObject({ outcome: 'issue', code: 'GEOSPEC_TESTS_FAILED' });
    expect(empty.detail).toMatchObject({
      outcome: 'refused',
      code: 'GEOSPEC_NO_TEST_FILES',
      verify: { selected: 0, passed: 0, failed: 0 },
    });
    expect(refused.detail).toMatchObject({ outcome: 'refused', code: 'GEOSPEC_CONFIG_NOT_APPLIED' });
    expect(refused.detail).not.toHaveProperty('verify');
    expect(limited.detail).toMatchObject({
      outcome: 'issue',
      code: 'RESOURCE_LIMIT',
      limit: {
        id: 'geospec.work.units',
        unit: '{unit}',
        maximum: 1000,
        demand: { kind: 'measured', value: 1500 },
        origin: 'host-option',
      },
    });
    for (const entry of [failed, empty, refused, limited]) {
      expect(parseRuntimeEntry(entry)).toMatchObject({ detail: { code: entry.detail.code } });
    }
  });
});

/* ------------------------------------------------------------------------------------------------ */

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const policy = (value: 'on' | 'off', maxAge = 900): Response => json({ policy: value, maxAge });
const receipt = (overrides: Record<string, unknown> = {}): Response =>
  json({ recorded: 1, rejected: 0, duplicate: 0, disabled: 0, policy: 'on', ...overrides });
const settled = (outcome: 'succeeded' | 'superseded' = 'succeeded', kernel = 'replicad'): RuntimeIngestEntry =>
  toRuntimeEntry(observation({ outcome: { type: outcome }, kernel }), context);

type Reply = Response | Error | Promise<Response>;
/** A posted batch as the test reads it back. */
type Posted = {
  batch: string;
  reason: string;
  entries: Array<{ name: string; detail?: Record<string, unknown> }>;
};
type DeliveryDetail = { dropped: Record<string, number>; oldest: number; spansDropped?: number };

/** A reporter over a scripted fetch; unscripted calls answer an `on` receipt. */
const harness = (replies: Reply[], options: Partial<IngestReporterInput> = {}) => {
  const state: { principal: string | undefined; consent: ReportingConsent } = {
    principal: 'user-1',
    consent: 'granted',
  };
  const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const next = replies.shift() ?? receipt();
    if (next instanceof Error) {
      throw next;
    }
    return next;
  });
  const reporter = createIngestReporter({
    endpoint: 'https://api.test/v1/telemetry/ingest',
    policyEndpoint: 'https://api.test/v1/telemetry/policy',
    route: 'browser',
    identity: () => state.principal,
    consent: () => state.consent,
    fetch: fetch as typeof globalThis.fetch,
    jitter: () => 1,
    ...options,
  });
  const posts = (): Posted[] =>
    fetch.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([, init]) => JSON.parse(init?.body as string) as Posted);
  const delivery = (index = -1): DeliveryDetail | undefined =>
    posts().at(index)?.entries.at(-1)?.detail as DeliveryDetail | undefined;
  return { reporter, fetch, state, posts, delivery };
};

describe('createIngestReporter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should probe the policy first, entry-free and without credentials, then send after the interval', async () => {
    const { reporter, fetch, posts } = harness([policy('on')]);
    const seen: string[] = [];
    reporter.onPolicy((value) => seen.push(value));
    reporter.record(settled());
    expect(fetch).toHaveBeenCalledWith('https://api.test/v1/telemetry/policy', { method: 'GET', credentials: 'omit' });
    await vi.advanceTimersByTimeAsync(reporterBounds.interval);
    const [batch] = posts();
    expect(ingestBatchSchema.safeParse(batch).success).toBe(true);
    expect(batch?.reason).toBe('interval');
    expect(batch?.entries.map((entry) => entry.name)).toEqual(['runtime.operation', 'telemetry.delivery']);
    expect(seen).toEqual(['on']);
    const init = fetch.mock.calls[1]?.[1];
    expect(init).toMatchObject({ method: 'POST', keepalive: false, credentials: 'include' });
    await reporter.dispose();
  });

  it('should batch immediately at 50 entries', async () => {
    const { reporter, posts } = harness([policy('on')]);
    reporter.record(settled());
    await vi.advanceTimersByTimeAsync(0);
    for (let index = 0; index < 50; index += 1) {
      reporter.record(settled());
    }
    await vi.advanceTimersByTimeAsync(1);
    expect(posts()[0]?.entries).toHaveLength(52);
  });

  it('should drop the hold as policy-off, count later entries without a request, and re-probe after 15 minutes', async () => {
    const { reporter, fetch, posts, delivery } = harness([policy('off'), policy('on')]);
    reporter.record(settled());
    await vi.advanceTimersByTimeAsync(0);
    reporter.record(settled());
    reporter.record(settled());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await reporter.flush({ reason: 'interval' })).toBeUndefined();
    await vi.advanceTimersByTimeAsync(reporterBounds.reprobe);
    reporter.record(settled());
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(reporterBounds.interval);
    expect(posts()).toHaveLength(1);
    expect(delivery()?.dropped).toEqual({ 'policy-off': 3 });
  });

  it('should read a 404 from an older API as off', async () => {
    const { reporter, fetch } = harness([new Response('', { status: 404 })]);
    const seen: string[] = [];
    reporter.onPolicy((value) => seen.push(value));
    reporter.record(settled());
    await vi.advanceTimersByTimeAsync(reporterBounds.interval);
    expect(seen).toEqual(['off']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should retry a failed probe with backoff and hold meanwhile', async () => {
    const { reporter, fetch, posts } = harness([
      new Error('offline'),
      new Response('nope', { status: 500 }),
      json({ policy: 'maybe' }),
      policy('on'),
    ]);
    reporter.record(settled());
    await vi.advanceTimersByTimeAsync(reporterBounds.probeRetry);
    await vi.advanceTimersByTimeAsync(reporterBounds.probeRetry * 2);
    await vi.advanceTimersByTimeAsync(reporterBounds.probeRetry * 4);
    expect(fetch).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(reporterBounds.interval);
    expect(posts()).toHaveLength(1);
  });

  it('should drop the hold as policy-unknown at unload and wait on an interval flush', async () => {
    let answer: (response: Response) => void = () => undefined;
    const { reporter, posts, delivery } = harness([
      new Promise<Response>((resolve) => {
        answer = resolve;
      }),
    ]);
    reporter.record(settled());
    reporter.record(settled());
    expect(await reporter.flush({ reason: 'interval' })).toBeUndefined();
    expect(await reporter.flush({ reason: 'pagehide' })).toBeUndefined();
    answer(policy('on'));
    await vi.advanceTimersByTimeAsync(0);
    reporter.record(settled());
    await reporter.flush({ reason: 'shutdown' });
    expect(posts()[0]?.reason).toBe('shutdown');
    expect(delivery()?.dropped).toEqual({ 'policy-unknown': 2 });
  });

  it('should use a fresh cached answer instead of probing, and announce it', async () => {
    const store = {
      read: vi.fn((): CachedTelemetryPolicy => ({ policy: 'on', expiresAt: Date.now() + 60_000 })),
      write: vi.fn(),
    };
    const { reporter, fetch } = harness([], { policyStore: store });
    const seen: string[] = [];
    const unsubscribe = reporter.onPolicy((value) => seen.push(value));
    unsubscribe();
    reporter.record(settled());
    await reporter.flush({ reason: 'interval' });
    expect(seen).toEqual(['on']);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['https://api.test/v1/telemetry/ingest']);
    expect(store.write).toHaveBeenCalled();
  });

  it('should keep delivering when a policy handler throws', async () => {
    const { reporter, posts } = harness([policy('on')]);
    reporter.onPolicy(() => {
      throw new Error('host bug');
    });
    reporter.record(settled());
    await vi.advanceTimersByTimeAsync(reporterBounds.interval);
    expect(posts()).toHaveLength(1);
    expect(() =>
      reporter.onPolicy(() => {
        throw new Error('late host bug');
      }),
    ).not.toThrow();
  });

  describe('consent and identity', () => {
    it('should drop the queue when consent is withdrawn, at enqueue or at send', async () => {
      const { reporter, state, delivery } = harness([policy('on')]);
      reporter.record(settled());
      reporter.record(settled());
      state.consent = 'denied';
      reporter.record(settled());
      state.consent = 'granted';
      reporter.record(settled());
      await vi.advanceTimersByTimeAsync(0);
      state.consent = 'denied';
      await reporter.flush({ reason: 'interval' });
      state.consent = 'granted';
      reporter.record(settled());
      await reporter.flush({ reason: 'interval' });
      expect(delivery()?.dropped).toEqual({ 'consent-withdrawn': 3 });
    });

    it('should hold while consent is unknown and drop the hold after 15 minutes as consent-unresolved', async () => {
      let clock = 0;
      const { reporter, state, posts, delivery } = harness([policy('on', 86_400)], { now: () => clock });
      state.consent = 'unknown';
      reporter.record(settled());
      await vi.advanceTimersByTimeAsync(0);
      await reporter.flush({ reason: 'interval' });
      clock = reporterBounds.expiry;
      await reporter.flush({ reason: 'interval' });
      state.consent = 'granted';
      reporter.record(settled());
      await reporter.flush({ reason: 'interval' });
      expect(posts()).toHaveLength(1);
      expect(delivery()?.dropped).toEqual({ 'consent-unresolved': 1 });
    });

    it('should never send an entry under a different principal, and expire entries after 15 minutes', async () => {
      let clock = 0;
      const { reporter, state, posts, delivery } = harness([policy('on', 86_400)], { now: () => clock });
      reporter.record(settled());
      await vi.advanceTimersByTimeAsync(0);
      state.principal = undefined;
      reporter.record(settled());
      state.principal = 'user-2';
      await reporter.flush({ reason: 'interval' });
      expect(posts()).toHaveLength(0);
      reporter.record(settled());
      clock = reporterBounds.expiry;
      await reporter.flush({ reason: 'interval' });
      reporter.record(settled());
      await reporter.flush({ reason: 'interval' });
      expect(delivery()?.dropped).toEqual({ 'identity-changed': 2, expired: 1 });
    });

    it('should read the send-time identity on Node hosts and defer while it is unresolved', async () => {
      let clock = 0;
      const identities: Array<TauIdentity | Error> = [
        { kind: 'unresolved', reason: 'offline' },
        new Error('provider bug'),
        { kind: 'signed-in', authorization: 'Bearer x', principalId: 'user-1' },
        { kind: 'unresolved', reason: 'keyring-error' },
        { kind: 'unresolved', reason: 'keyring-error' },
        { kind: 'signed-out' },
      ];
      const identityAtSend = vi.fn(async () => {
        const next = identities.shift()!;
        if (next instanceof Error) {
          throw next;
        }
        return next;
      });
      const { reporter, state, posts, delivery } = harness([policy('on', 86_400)], {
        now: () => clock,
        identityAtSend,
      });
      reporter.record(settled());
      await vi.advanceTimersByTimeAsync(0);
      await reporter.flush({ reason: 'interval' });
      await reporter.flush({ reason: 'interval' });
      expect(posts()).toHaveLength(0);
      await reporter.flush({ reason: 'interval' });
      expect(posts()).toHaveLength(1);
      reporter.record(settled());
      await reporter.flush({ reason: 'interval' });
      clock = reporterBounds.expiry;
      await reporter.flush({ reason: 'interval' });
      state.principal = undefined;
      reporter.record(settled());
      await reporter.flush({ reason: 'interval' });
      expect(posts()).toHaveLength(2);
      expect(delivery()?.dropped).toEqual({ 'identity-unresolved': 1 });
    });
  });

  describe('delivery', () => {
    const ready = async (replies: Reply[], options: Partial<IngestReporterInput> = {}) => {
      const context = harness([policy('on', 86_400), ...replies], options);
      context.reporter.record(settled());
      await vi.advanceTimersByTimeAsync(0);
      return context;
    };

    it('should retry 425, 429, 5xx and network faults with the same batch id, honouring Retry-After', async () => {
      const { reporter, posts } = await ready([
        new Response('', { status: 425, headers: { 'retry-after': '2' } }),
        new Response('', { status: 503 }),
        new Error('reset'),
        receipt(),
      ]);
      const flushed = reporter.flush({ reason: 'interval' });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await flushed).toMatchObject({ recorded: 1 });
      const ids = new Set(posts().map((post) => post.batch));
      expect(posts()).toHaveLength(4);
      expect(ids.size).toBe(1);
    });

    it('should give up after three retries as retry-exhausted and report the loss with the next batch', async () => {
      const { reporter, posts, delivery } = await ready([
        new Response('', { status: 429 }),
        new Response('', { status: 429 }),
        new Response('', { status: 429 }),
        new Response('', { status: 429 }),
      ]);
      reporter.noteSpansDropped(7);
      reporter.noteSpansDropped(-3);
      const flushed = reporter.flush({ reason: 'interval' });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(await flushed).toBeUndefined();
      reporter.record(settled());
      await reporter.flush({ reason: 'interval' });
      expect(posts()).toHaveLength(5);
      expect(delivery()).toMatchObject({ dropped: { 'retry-exhausted': 1 }, spansDropped: 7 });
    });

    it('should stop retrying when the next wait would pass the 60 s budget', async () => {
      const { reporter, posts } = await ready([
        new Response('', { status: 429, headers: { 'retry-after': '40' } }),
        new Response('', { status: 429, headers: { 'retry-after': '40' } }),
      ]);
      const flushed = reporter.flush({ reason: 'interval' });
      await vi.advanceTimersByTimeAsync(60_000);
      await flushed;
      expect(posts()).toHaveLength(2);
    });

    it('should not retry a 400 or another 4xx, counting the entries rejected', async () => {
      const { reporter, delivery } = await ready([
        new Response('', { status: 400 }),
        new Response('', { status: 401 }),
      ]);
      reporter.record(settled('succeeded', 'zoo'));
      await reporter.flush({ reason: 'interval' });
      reporter.record(settled());
      await reporter.flush({ reason: 'interval' });
      reporter.record(settled());
      await reporter.flush({ reason: 'interval' });
      expect(delivery()?.dropped).toEqual({ rejected: 3 });
    });

    it('should split once on 413 and reject what is still too large', async () => {
      const { reporter, posts, delivery } = await ready([
        new Response('', { status: 413 }),
        receipt(),
        new Response('', { status: 413 }),
        new Response('', { status: 413 }),
      ]);
      reporter.record(settled());
      reporter.record(settled());
      await reporter.flush({ reason: 'interval' });
      expect(posts().map((post) => post.entries.length)).toEqual([4, 3, 2]);
      reporter.record(settled());
      await reporter.flush({ reason: 'interval' });
      reporter.record(settled());
      await reporter.flush({ reason: 'interval' });
      expect(delivery()?.dropped).toEqual({ rejected: 2 });
    });

    it('should send pagehide once, keepalive, without retrying', async () => {
      const { reporter, posts, fetch } = await ready([new Response('', { status: 429 })]);
      expect(await reporter.flush({ reason: 'pagehide' })).toBeUndefined();
      expect(posts()).toHaveLength(1);
      expect(posts()[0]?.reason).toBe('pagehide');
      expect(fetch.mock.calls.at(-1)?.[1]).toMatchObject({ keepalive: true });
    });

    it('should sleep when a receipt answers policy off', async () => {
      const { reporter, posts } = await ready([receipt({ policy: 'off', disabled: 1, recorded: 0 })]);
      const seen: string[] = [];
      reporter.onPolicy((value) => seen.push(value));
      expect(await reporter.flush({ reason: 'interval' })).toMatchObject({ policy: 'off' });
      reporter.record(settled());
      await reporter.flush({ reason: 'interval' });
      expect(posts()).toHaveLength(1);
      expect(seen).toEqual(['on', 'off']);
    });

    it('should accept a 204 or an unreadable 200 as delivered without a receipt', async () => {
      const { reporter } = await ready([new Response(undefined, { status: 204 }), new Response('{', { status: 200 })]);
      expect(await reporter.flush({ reason: 'interval' })).toBeUndefined();
      reporter.record(settled());
      expect(await reporter.flush({ reason: 'interval' })).toBeUndefined();
    });

    it('should count the host hold and drop an entry that alone exceeds the body bound', async () => {
      const heldDropped = vi.fn(() => 4);
      const { reporter, posts, delivery } = await ready([], { heldDropped });
      reporter.noteHeldDropped(2);
      reporter.noteDropped('held-at-unload', 3);
      reporter.noteDropped('renderer-gone', Number.NaN);
      const huge = settled() as RuntimeOperationEntry;
      reporter.record({ ...huge, detail: { ...huge.detail, release: 'x'.repeat(70_000) } });
      reporter.record({ ...huge, detail: { ...huge.detail, release: 'y'.repeat(40_000) } });
      reporter.record({ ...huge, detail: { ...huge.detail, release: 'z'.repeat(40_000) } });
      await reporter.flush({ reason: 'interval' });
      await reporter.flush({ reason: 'interval' });
      expect(heldDropped).toHaveBeenCalledTimes(1);
      expect(posts().map((post) => post.entries.length)).toEqual([3, 2]);
      expect(posts()[0]?.entries.at(-1)?.detail).toMatchObject({
        dropped: { 'queue-full': 6, 'held-at-unload': 3, 'payload-too-large': 1 },
      });
      expect(delivery()?.dropped).toEqual({});
    });

    it('should send more than one batch when the queue holds more than a body', async () => {
      const { reporter, posts } = await ready([]);
      for (let index = 0; index < 255; index += 1) {
        reporter.record(settled());
      }
      await reporter.flush({ reason: 'shutdown' });
      expect(posts().map((post) => post.entries.length)).toEqual([256, 2]);
    });

    it('should share one flush in flight', async () => {
      const { reporter, posts } = await ready([]);
      const [first, second] = [reporter.flush({ reason: 'interval' }), reporter.flush({ reason: 'interval' })];
      expect(await first).toEqual(await second);
      expect(posts()).toHaveLength(1);
    });
  });

  describe('bounds', () => {
    it('should drop the oldest held entry while the policy is unknown', async () => {
      let answer: (response: Response) => void = () => undefined;
      const { reporter, posts, delivery } = harness([
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
      ]);
      for (let index = 0; index <= reporterBounds.queue; index += 1) {
        reporter.record(settled('succeeded', index === 0 ? 'zoo' : 'replicad'));
      }
      answer(policy('on'));
      await vi.advanceTimersByTimeAsync(0);
      await reporter.flush({ reason: 'shutdown' });
      const kernels = posts().flatMap((post) => post.entries.map((entry) => entry.detail?.['kernel']));
      expect(kernels).not.toContain('zoo');
      expect(kernels.filter((kernel) => kernel === 'replicad')).toHaveLength(reporterBounds.queue);
      expect(delivery(0)?.dropped).toEqual({ 'queue-full': 1 });
    });

    it('should drop the newest entry once sending', async () => {
      const store: TelemetryPolicyStore = {
        read: () => ({ policy: 'on', expiresAt: Number.MAX_SAFE_INTEGER }),
        write: () => undefined,
      };
      const { reporter, posts, delivery } = harness([], { policyStore: store });
      for (let index = 0; index <= reporterBounds.queue; index += 1) {
        reporter.record(settled('succeeded', index === reporterBounds.queue ? 'zoo' : 'replicad'));
      }
      await vi.advanceTimersByTimeAsync(0);
      const kernels = posts().flatMap((post) => post.entries.map((entry) => entry.detail?.['kernel']));
      expect(kernels).not.toContain('zoo');
      expect(delivery(0)?.dropped).toEqual({ 'queue-full': 1 });
    });

    it('should coalesce identical merged outcomes above half the bound, per principal', async () => {
      const { reporter, state, posts } = harness([policy('on')], { merge: 'default' });
      for (let index = 0; index <= reporterBounds.queue / 2; index += 1) {
        reporter.record(settled());
      }
      reporter.record(settled('superseded'));
      reporter.record(settled('superseded'));
      reporter.record(settled('superseded'));
      state.principal = 'user-2';
      reporter.record(settled('superseded'));
      state.principal = 'user-1';
      await vi.advanceTimersByTimeAsync(0);
      await reporter.flush({ reason: 'shutdown' });
      const merged = posts()
        .flatMap((post) => post.entries)
        .filter((entry) => entry.detail?.['outcome'] === 'superseded');
      expect(merged).toHaveLength(1);
      expect(merged[0]?.detail?.['count']).toBe(3);
    });

    it('should never throw into the host', async () => {
      const { reporter } = harness([policy('on')], {
        identity: () => {
          throw new Error('broken');
        },
      });
      expect(() => {
        reporter.record(settled());
      }).not.toThrow();
      const broken = harness([], {
        consent: () => {
          throw new Error('broken');
        },
        policyStore: { read: () => ({ policy: 'on', expiresAt: Number.MAX_SAFE_INTEGER }), write: () => undefined },
      });
      expect(await broken.reporter.flush({ reason: 'interval' })).toBeUndefined();
    });

    it('should do nothing after dispose', async () => {
      const { reporter, fetch } = harness([policy('on')]);
      await reporter.dispose();
      reporter.record(settled());
      expect(await reporter.flush({ reason: 'shutdown' })).toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should default its fetch, clock and jitter', async () => {
      const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(policy('off'));
      const reporter = createIngestReporter({
        endpoint: 'https://api.test/v1/telemetry/ingest',
        policyEndpoint: 'https://api.test/v1/telemetry/policy',
        route: 'cli',
        identity: () => undefined,
        consent: () => 'granted',
      });
      reporter.record(settled());
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);
      fetch.mockRestore();
    });
  });
});
