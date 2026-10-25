import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reporterBounds } from '@taucad/telemetry/client';
import type { DevicePreference, RuntimeLateInput, RuntimeObservationInput } from '@taucad/telemetry/client';
import {
  createPageTelemetry,
  heldAtUnloadKey,
  pageHoldBound,
  pageHoldDrainAfter,
  pageReprobe,
} from '#telemetry/page-telemetry.js';
import type { ObservedRuntimeClient, PageTelemetryDependencies } from '#telemetry/page-telemetry.js';

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

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const urlOf = (url: string | URL | Request): string =>
  typeof url === 'string' ? url : 'href' in url ? url.href : url.url;

type Posted = { reason: string; entries: Array<{ name: string; detail?: Record<string, unknown> }> };

/** A runtime client that settles attempts on demand. */
const fakeClient = () => {
  const operation = new Set<(value: RuntimeObservationInput) => void>();
  const late = new Set<(value: RuntimeLateInput) => void>();
  const client = {
    on: ((event: 'operation' | 'operation-late', handler: (value: never) => void) => {
      const set = (event === 'operation' ? operation : late) as Set<(value: never) => void>;
      set.add(handler);
      return () => set.delete(handler);
    }) as ObservedRuntimeClient['on'],
    observe: vi.fn<(mode: 'facts' | 'off') => void>(),
    terminate: vi.fn(),
  };
  return {
    client,
    settle: (overrides: Partial<RuntimeObservationInput> = {}): void => {
      for (const handler of operation) {
        handler(observation(overrides));
      }
    },
    listeners: (): number => operation.size + late.size,
  };
};

const harness = (overrides: Partial<PageTelemetryDependencies> = {}, policy: 'on' | 'off' = 'on') => {
  const storage = new Map<string, string>();
  let device: DevicePreference = 'unset';
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (init?.method === 'GET' && urlOf(url).endsWith('/v1/telemetry/policy')) {
      return json({ policy, maxAge: 60 });
    }
    return json({ recorded: 1, rejected: 0, duplicate: 0, disabled: 0, policy });
  });
  const notifyDesktopMain = vi.fn();
  const writeDevicePreference = vi.fn((value: DevicePreference) => {
    device = value;
  });
  const page = createPageTelemetry({
    cloudBuild: true,
    isDesktop: false,
    apiUrl: () => 'https://api.test',
    release: () => 'abcdef012345',
    device: () => 'standard',
    platform: () => 'chromium',
    os: () => 'linux',
    globalPrivacyControl: () => false,
    readDevicePreference: () => device,
    writeDevicePreference,
    storage: () => ({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
      removeItem: (key) => {
        storage.delete(key);
      },
    }),
    notifyDesktopMain,
    fetch: fetch as typeof globalThis.fetch,
    ...overrides,
  });
  const posts = (): Posted[] =>
    fetch.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([, init]) => JSON.parse(init?.body as string) as Posted);
  const operations = (): number =>
    posts().flatMap((post) => post.entries.filter((entry) => entry.name === 'runtime.operation')).length;
  return {
    page,
    fetch,
    posts,
    operations,
    storage,
    notifyDesktopMain,
    writeDevicePreference,
    setDevice: (value: DevicePreference) => {
      device = value;
    },
  };
};

describe('createPageTelemetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should hold entries while the identity is unresolved and send them once it resolves', async () => {
    const { page, fetch, operations } = harness();
    const { client, settle } = fakeClient();
    page.observeRuntimeClient(client, 'editor');

    settle();
    settle();
    expect(page.heldCount()).toBe(2);
    expect(fetch).not.toHaveBeenCalled();

    page.setServerPreference(true);
    page.setIdentity({ kind: 'signed-in', accountId: 'account-1' });
    expect(page.heldCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(reporterBounds.interval);
    expect(operations()).toBe(2);
  });

  it('should bound the hold at 256, dropping the oldest', () => {
    const { page } = harness();
    const { client, settle } = fakeClient();
    page.observeRuntimeClient(client, 'editor');

    for (let index = 0; index < pageHoldBound + 4; index += 1) {
      settle();
    }

    expect(page.heldCount()).toBe(pageHoldBound);
  });

  it('should drain an identity that never resolves as signed-out after 15 minutes', async () => {
    const { page, operations } = harness();
    const { client, settle } = fakeClient();
    page.observeRuntimeClient(client, 'editor');
    settle();

    await vi.advanceTimersByTimeAsync(pageHoldDrainAfter);
    expect(page.heldCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(reporterBounds.interval);
    expect(operations()).toBe(1);
  });

  it('should compose nothing on a self-host build for a signed-out page, and keep nothing', async () => {
    const { page, fetch } = harness({ cloudBuild: false });
    const { client, settle } = fakeClient();
    page.observeRuntimeClient(client, 'editor');
    settle();

    page.setIdentity({ kind: 'signed-out' });
    settle();
    await vi.advanceTimersByTimeAsync(reporterBounds.interval * 2);

    expect(page.heldCount()).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(page.workerContext()).toBeUndefined();
  });

  it('should report a self-host build for a signed-in page, to its own API only', async () => {
    const { page, fetch } = harness({ cloudBuild: false });
    const { client, settle } = fakeClient();
    page.observeRuntimeClient(client, 'editor');
    page.setIdentity({ kind: 'signed-in', accountId: 'account-1' });
    settle();
    await vi.advanceTimersByTimeAsync(reporterBounds.interval);

    expect(fetch.mock.calls.every(([url]) => urlOf(url).startsWith('https://api.test/'))).toBe(true);
    expect(fetch).toHaveBeenCalledWith('https://api.test/v1/telemetry/policy', { method: 'GET', credentials: 'omit' });
  });

  it('should ask clients for worker facts only once the policy is on', async () => {
    const { page } = harness();
    const { client, settle } = fakeClient();
    page.observeRuntimeClient(client, 'editor');
    expect(client.observe).not.toHaveBeenCalled();

    page.setIdentity({ kind: 'signed-out' });
    settle();
    await vi.advanceTimersByTimeAsync(0);

    expect(client.observe).toHaveBeenCalledWith('facts');
    const late = fakeClient();
    page.observeRuntimeClient(late.client, 'converter');
    expect(late.client.observe).toHaveBeenCalledWith('facts');
  });

  it('should stop listening on policy off and listen again once the cached answer expires (FR-22)', async () => {
    const { page } = harness({}, 'off');
    const { client, settle, listeners } = fakeClient();
    page.observeRuntimeClient(client, 'editor');
    page.setIdentity({ kind: 'signed-out' });
    settle();
    await vi.advanceTimersByTimeAsync(0);

    expect(client.observe).toHaveBeenCalledWith('off');
    expect(listeners()).toBe(0);

    await vi.advanceTimersByTimeAsync(pageReprobe.first);
    expect(listeners()).toBe(2);
  });

  it('should mirror a server false into the device store on the transition, never while an update is pending', () => {
    const { page, writeDevicePreference } = harness();
    page.setIdentity({ kind: 'signed-in', accountId: 'account-1' });

    page.setServerPreference(false);
    page.onConsentInputsChanged({ updatePending: true });
    expect(writeDevicePreference).not.toHaveBeenCalled();

    page.setServerPreference(true);
    page.onConsentInputsChanged({ updatePending: false });
    page.setServerPreference(false);
    page.onConsentInputsChanged({ updatePending: false });
    page.onConsentInputsChanged({ updatePending: false });
    expect(writeDevicePreference).toHaveBeenCalledTimes(1);
    expect(writeDevicePreference).toHaveBeenCalledWith('off');
    expect(page.consent()).toBe('denied');
  });

  it('should tell desktop main the resolved consent on every change, and only on change', () => {
    const { page, notifyDesktopMain, setDevice } = harness({ isDesktop: true });

    page.setIdentity({ kind: 'signed-out' });
    page.onConsentInputsChanged({ updatePending: false });
    page.onConsentInputsChanged({ updatePending: false });
    setDevice('off');
    page.onConsentInputsChanged({ updatePending: false });

    expect(notifyDesktopMain.mock.calls).toEqual([['granted'], ['denied']]);
    expect(page.context()).toMatchObject({ route: 'desktop', platform: 'electron' });
  });

  it('should deny on GPC and on a declined analytics decision', () => {
    const gpc = harness({ globalPrivacyControl: () => true });
    gpc.page.setIdentity({ kind: 'signed-out' });
    expect(gpc.page.consent()).toBe('denied');

    const declined = harness();
    declined.page.setIdentity({ kind: 'signed-out' });
    expect(declined.page.consent()).toBe('granted');
    declined.page.setAnalyticsDecision('declined');
    expect(declined.page.consent()).toBe('denied');
  });

  it('should settle clients and carry the held count to the next page at unload', async () => {
    const first = harness();
    const { client, settle } = fakeClient();
    first.page.observeRuntimeClient(client, 'editor');
    settle();
    settle();

    first.page.pageHide(false);
    expect(client.terminate).toHaveBeenCalledTimes(1);
    expect(first.storage.get(heldAtUnloadKey)).toBe('2');

    const next = harness({
      storage: () => ({
        getItem: (key) => first.storage.get(key) ?? null,
        setItem: (key, value) => {
          first.storage.set(key, value);
        },
        removeItem: (key) => {
          first.storage.delete(key);
        },
      }),
    });
    next.page.setIdentity({ kind: 'signed-out' });
    next.page.record({
      name: 'runtime.viewer',
      duration: 0,
      detail: { event: 'context-lost', backend: 'webgl', route: 'browser', release: 'abcdef012345' },
    });
    await vi.advanceTimersByTimeAsync(reporterBounds.interval);

    const delivery = next.posts()[0]?.entries.find((entry) => entry.name === 'telemetry.delivery');
    expect(delivery?.detail?.['dropped']).toMatchObject({ 'held-at-unload': 2 });
    expect(first.storage.has(heldAtUnloadKey)).toBe(false);
  });

  it('should keep clients alive across a back/forward cache entry', () => {
    const { page } = harness();
    const { client } = fakeClient();
    page.observeRuntimeClient(client, 'editor');

    page.pageHide(true);

    expect(client.terminate).not.toHaveBeenCalled();
  });

  it('should record forwarded worker entries and ignore anything else', async () => {
    const { page, posts } = harness();
    page.setIdentity({ kind: 'signed-out' });
    page.recordForwarded({ name: 'not.an.entry', detail: {} });
    page.recordForwarded('garbage');
    page.recordForwarded(undefined);
    page.recordForwarded({
      name: 'runtime.operation',
      duration: 1,
      detail: {
        operation: 'verify',
        outcome: 'succeeded',
        caller: 'geospec',
        route: 'browser',
        release: 'abcdef012345',
      },
    });
    await vi.advanceTimersByTimeAsync(reporterBounds.interval);

    const names = posts().flatMap((post) => post.entries.map((entry) => entry.name));
    expect(names.filter((name) => name !== 'telemetry.delivery')).toEqual(['runtime.operation']);
  });

  it('should record a closed viewer event with no scene data', async () => {
    const { page, posts } = harness();
    page.setIdentity({ kind: 'signed-out' });
    page.recordViewerEvent({ event: 'first-frame', backend: 'webgpu', duration: 120, triangles: 5000 });
    page.recordViewerEvent({ event: 'download', backend: 'webgl', format: 'glb' });
    await vi.advanceTimersByTimeAsync(reporterBounds.interval);

    const viewer = posts()
      .flatMap((post) => post.entries)
      .filter((entry) => entry.name === 'runtime.viewer');
    expect(viewer.map((entry) => entry.detail)).toEqual([
      expect.objectContaining({ event: 'first-frame', backend: 'webgpu', triangles: 5000, route: 'browser' }),
      expect.objectContaining({ event: 'download', backend: 'webgl', format: 'glb' }),
    ]);
  });

  it('should hand workers its context, without a caller', () => {
    const { page } = harness();

    expect(page.workerContext()).toEqual({
      route: 'browser',
      release: 'abcdef012345',
      device: 'standard',
      platform: 'chromium',
      os: 'linux',
    });
  });
});
