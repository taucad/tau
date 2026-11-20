// @vitest-environment jsdom
/* oxlint-disable typescript/no-restricted-types -- `ServiceWorkerRegistration.waiting` and `installing` are `null` when absent; the double models the platform. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerVerdict } from '#filesystem/build-skew.js';
import { activateIfBuildMessageType, skipWaitingMessageType } from '#offline/pwa-messages.js';

import {
  failedInstallLimit,
  failedInstallsKey,
  recordInstallOutcome,
  startServiceWorker,
  updateAction,
} from '#offline/pwa-registration.js';

const skew = {
  verdict: 'unknown' as ServerVerdict,
  listeners: new Set<() => void>(),
  queryLiveBuild: vi.fn<() => Promise<void>>(),
};

const verdict = {
  readServerVerdict: () => skew.verdict,
  subscribeServerVerdict: (listener: () => void) => {
    skew.listeners.add(listener);
    return () => {
      skew.listeners.delete(listener);
    };
  },
  queryLiveBuild: skew.queryLiveBuild,
};

const setVerdict = (next: ServerVerdict): void => {
  skew.verdict = next;
  for (const listener of skew.listeners) {
    listener();
  }
};

/** A registration double whose waiting worker and install events the test controls. */
const createRegistration = (): {
  registration: ServiceWorkerRegistration;
  waiting: { postMessage: ReturnType<typeof vi.fn> } | null;
  active: { scriptURL: string } | null;
  update: ReturnType<typeof vi.fn>;
  unregister: ReturnType<typeof vi.fn>;
  installNewWorker: () => void;
  failNewInstall: () => void;
} => {
  const updateListeners: Array<() => void> = [];
  const state = {
    waiting: null as { postMessage: ReturnType<typeof vi.fn> } | null,
    active: null as { scriptURL: string } | null,
    installing: null as EventTarget | null,
  };
  const update = vi.fn().mockResolvedValue(undefined);
  const unregister = vi.fn().mockResolvedValue(true);
  const registration = {
    unregister,
    get waiting() {
      return state.waiting;
    },
    get installing() {
      return state.installing;
    },
    get active() {
      return state.active;
    },
    update,
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'updatefound') {
        updateListeners.push(listener);
      }
    },
  } as unknown as ServiceWorkerRegistration;
  return {
    registration,
    get waiting() {
      return state.waiting;
    },
    set waiting(value) {
      state.waiting = value;
    },
    get active() {
      return state.active;
    },
    set active(value) {
      state.active = value;
    },
    update,
    unregister,
    failNewInstall: () => {
      // A worker whose install started and ended `redundant` without reaching `installed`.
      const worker = Object.assign(new EventTarget(), { state: 'installing' as ServiceWorkerState });
      state.installing = worker;
      for (const listener of updateListeners) {
        listener();
      }
      state.installing = null;
      worker.state = 'redundant';
      worker.dispatchEvent(new Event('statechange'));
    },
    installNewWorker: () => {
      const worker = Object.assign(new EventTarget(), { state: 'installed' as ServiceWorkerState });
      state.installing = worker;
      for (const listener of updateListeners) {
        listener();
      }
      state.installing = null;
      state.waiting = { postMessage: vi.fn() };
      worker.dispatchEvent(new Event('statechange'));
    },
  };
};

let current: ReturnType<typeof createRegistration>;
let registered: boolean;
const onInstallStatus = vi.fn();
const register = vi.fn<(url: string) => Promise<ServiceWorkerRegistration>>();
const cacheNames = new Set<string>();
const cacheStorage = {
  keys: vi.fn(async () => [...cacheNames]),
  delete: vi.fn(async (name: string) => cacheNames.delete(name)),
};

beforeEach(() => {
  vi.useFakeTimers();
  skew.verdict = 'unknown';
  skew.listeners.clear();
  skew.queryLiveBuild.mockReset().mockResolvedValue(undefined);
  current = createRegistration();
  registered = true;
  cacheNames.clear();
  globalThis.localStorage.clear();
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: cacheStorage });
  register.mockReset().mockImplementation(async () => {
    registered = true;
    return current.registration;
  });
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register,
      getRegistration: async () => (registered ? current.registration : undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- removing the jsdom test double.
  delete (globalThis.navigator as { serviceWorker?: unknown }).serviceWorker;
  // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- removing the jsdom test double.
  delete (globalThis as { caches?: unknown }).caches;
});

describe('updateAction (ruling OD3)', () => {
  it.each([
    ['replaced', true, 'activate'],
    ['replaced', false, 'check-for-update'],
    ['unknown', true, 'ask-server'],
    ['unknown', false, 'none'],
    ['live', true, 'none'],
    ['live', false, 'none'],
  ] as const)('should answer verdict %s with a waiting worker %s by %s', (verdict, hasWaiting, action) => {
    expect(updateAction(verdict, hasWaiting)).toBe(action);
  });

  it.each(['live', 'unknown', 'replaced'] as const)(
    'should activate a worker waiting behind the retired /usage worker at once, the verdict %s',
    (verdict) => {
      expect(updateAction(verdict, true, true)).toBe('activate');
      expect(updateAction(verdict, false, true)).toBe(updateAction(verdict, false));
    },
  );
});

describe('startServiceWorker', () => {
  it('should keep a waiting worker waiting while the server still names this build', async () => {
    current.waiting = { postMessage: vi.fn() };
    skew.verdict = 'live';
    const stop = startServiceWorker({ inWorkspace: false, verdict, onInstallStatus });
    await vi.runAllTimersAsync();

    expect(register).toHaveBeenCalledExactlyOnceWith('/service-worker.js');
    expect(current.waiting.postMessage).not.toHaveBeenCalled();
    stop();
  });

  it('should activate the waiting worker silently once the verdict is replaced', async () => {
    const waiting = { postMessage: vi.fn() };
    current.waiting = waiting;
    const stop = startServiceWorker({ inWorkspace: false, verdict, onInstallStatus });
    await vi.runAllTimersAsync();
    // A waiting worker with no verdict yet: the page asks the server now.
    expect(skew.queryLiveBuild).toHaveBeenCalledOnce();
    expect(waiting.postMessage).not.toHaveBeenCalled();

    setVerdict('replaced');

    expect(waiting.postMessage).toHaveBeenCalledExactlyOnceWith({ type: skipWaitingMessageType });
    stop();
  });

  it('should look for the new worker once when the verdict is replaced and activate it when it is installed', async () => {
    const stop = startServiceWorker({ inWorkspace: false, verdict, onInstallStatus });
    await vi.runAllTimersAsync();

    setVerdict('replaced');
    setVerdict('replaced');
    expect(current.update).toHaveBeenCalledOnce();

    current.installNewWorker();

    expect(current.waiting?.postMessage).toHaveBeenCalledExactlyOnceWith({ type: skipWaitingMessageType });
    stop();
  });

  it('should apply the rule to an existing registration inside a workspace without registering', async () => {
    const waiting = { postMessage: vi.fn() };
    current.waiting = waiting;
    skew.verdict = 'replaced';
    const stop = startServiceWorker({ inWorkspace: true, verdict, onInstallStatus });
    await vi.runAllTimersAsync();

    expect(register).not.toHaveBeenCalled();
    expect(waiting.postMessage).toHaveBeenCalledExactlyOnceWith({ type: skipWaitingMessageType });
    stop();
  });

  it('should activate the web app’s worker waiting behind the retired /usage worker while this build is live', async () => {
    const waiting = { postMessage: vi.fn() };
    current.waiting = waiting;
    current.active = { scriptURL: 'https://tau.new/offline-shell-worker.js' };
    skew.verdict = 'live';
    const stop = startServiceWorker({ inWorkspace: false, verdict, onInstallStatus });
    await vi.runAllTimersAsync();

    expect(waiting.postMessage).toHaveBeenCalledExactlyOnceWith({ type: skipWaitingMessageType });
    stop();
  });

  it('should stop following the verdict once stopped', async () => {
    const stop = startServiceWorker({ inWorkspace: false, verdict, onInstallStatus });
    await vi.runAllTimersAsync();
    stop();

    setVerdict('replaced');

    expect(current.update).not.toHaveBeenCalled();
  });

  it('should ask a waiting worker to activate if it is of this page’s build while the verdict is live (FP3)', async () => {
    const waiting = { postMessage: vi.fn() };
    current.waiting = waiting;
    skew.verdict = 'live';
    const stop = startServiceWorker({ inWorkspace: false, verdict, onInstallStatus, buildId: 1_795_000_000_000 });
    await vi.runAllTimersAsync();
    setVerdict('live');

    expect(waiting.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: activateIfBuildMessageType,
      buildId: 1_795_000_000_000,
    });
    stop();
  });

  it('should ask a newly installed worker the same once it waits', async () => {
    skew.verdict = 'live';
    const stop = startServiceWorker({ inWorkspace: false, verdict, onInstallStatus, buildId: 42 });
    await vi.runAllTimersAsync();

    current.installNewWorker();

    expect(current.waiting?.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: activateIfBuildMessageType,
      buildId: 42,
    });
    stop();
  });

  it('should not ask when this page’s build is unknown', async () => {
    const waiting = { postMessage: vi.fn() };
    current.waiting = waiting;
    skew.verdict = 'live';
    const stop = startServiceWorker({ inWorkspace: false, verdict, onInstallStatus });
    await vi.runAllTimersAsync();

    expect(waiting.postMessage).not.toHaveBeenCalled();
    stop();
  });

  it('should delete the worker caches no registration owns before registering (FP3)', async () => {
    registered = false;
    for (const name of ['tau-assets', 'tau-precache-v3-http://localhost/', 'another-app']) {
      cacheNames.add(name);
    }
    const stop = startServiceWorker({ inWorkspace: false, verdict, onInstallStatus });
    await vi.runAllTimersAsync();

    expect([...cacheNames]).toStrictEqual(['another-app']);
    expect(register).toHaveBeenCalledOnce();
    expect(onInstallStatus).not.toHaveBeenCalled();
    stop();
  });

  it('should keep the worker caches a registration owns', async () => {
    cacheNames.add('tau-assets-v3');
    const stop = startServiceWorker({ inWorkspace: false, verdict, onInstallStatus });
    await vi.runAllTimersAsync();

    expect([...cacheNames]).toStrictEqual(['tau-assets-v3']);
    stop();
  });

  it('should unregister and delete the worker caches after the limit of failed installs in a row (fleet rule)', async () => {
    cacheNames.add('tau-precache-v3-http://localhost/');
    const stop = startServiceWorker({ inWorkspace: false, verdict, onInstallStatus });
    await vi.runAllTimersAsync();

    for (let failure = 1; failure < failedInstallLimit; failure += 1) {
      current.failNewInstall();
    }
    await vi.runAllTimersAsync();
    expect(current.unregister).not.toHaveBeenCalled();

    current.failNewInstall();
    await vi.runAllTimersAsync();
    expect(current.unregister).toHaveBeenCalledOnce();
    expect([...cacheNames]).toStrictEqual([]);
    stop();
  });

  it('should count no failure for an update check that starts no install, nor for a completed one', async () => {
    const stop = startServiceWorker({ inWorkspace: false, verdict, onInstallStatus });
    await vi.runAllTimersAsync();
    current.failNewInstall();
    current.installNewWorker();
    for (let failure = 1; failure < failedInstallLimit; failure += 1) {
      current.failNewInstall();
    }
    await vi.runAllTimersAsync();

    expect(current.unregister).not.toHaveBeenCalled();
    stop();
  });
});

describe('recordInstallOutcome (fleet rule)', () => {
  it('should count failed installs in a row across loads and reset on a completed one', () => {
    const store = globalThis.localStorage;
    expect(recordInstallOutcome(store, 'failed')).toBe(false);
    expect(store.getItem(failedInstallsKey)).toBe('1');
    expect(recordInstallOutcome(store, 'installed')).toBe(false);
    expect(store.getItem(failedInstallsKey)).toBeNull();
    const outcomes = Array.from({ length: failedInstallLimit }, () => recordInstallOutcome(store, 'failed'));
    expect(outcomes.at(-1)).toBe(true);
    expect(outcomes.slice(0, -1).every((outcome) => !outcome)).toBe(true);
    expect(store.getItem(failedInstallsKey)).toBeNull();
  });

  it('should count nothing without storage, or when it throws', () => {
    expect(recordInstallOutcome(undefined, 'failed')).toBe(false);
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(recordInstallOutcome(throwing, 'failed')).toBe(false);
  });
});
