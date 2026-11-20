// @vitest-environment jsdom
/* oxlint-disable typescript/no-restricted-types -- `ServiceWorkerRegistration.waiting` and `installing` are `null` when absent; the double models the platform. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerVerdict } from '#filesystem/build-skew.js';
import { skipWaitingMessageType, workerBuildMessageType } from '#offline/pwa-messages.js';

import {
  countInstall,
  installFailureLimit,
  installFailuresKey,
  startServiceWorker,
  updateAction,
} from '#offline/pwa-registration.js';

const skew = {
  verdict: 'unknown' as ServerVerdict,
  listeners: new Set<() => void>(),
  queryLiveBuild: vi.fn<() => Promise<void>>(),
};

const verdict = {
  // No build id: the page never asks a waiting worker's build, so only the verdict decides (FP3 rows set one).
  buildId: 0,
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
  installNewWorker: () => void;
  failInstall: () => void;
} => {
  const updateListeners: Array<() => void> = [];
  const state = {
    waiting: null as { postMessage: ReturnType<typeof vi.fn> } | null,
    active: null as { scriptURL: string } | null,
    installing: null as EventTarget | null,
  };
  const update = vi.fn().mockResolvedValue(undefined);
  const registration = {
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
    installNewWorker: () => {
      const worker = new EventTarget();
      state.installing = worker;
      for (const listener of updateListeners) {
        listener();
      }
      state.installing = null;
      state.waiting = { postMessage: vi.fn() };
      worker.dispatchEvent(new Event('statechange'));
    },
    failInstall: () => {
      const worker = Object.assign(new EventTarget(), { state: 'installing' });
      state.installing = worker;
      for (const listener of updateListeners) {
        listener();
      }
      state.installing = null;
      worker.state = 'redundant';
      worker.dispatchEvent(new Event('statechange'));
    },
  };
};

let current: ReturnType<typeof createRegistration>;
const onInstallStatus = vi.fn();
const register = vi.fn<(url: string) => Promise<ServiceWorkerRegistration>>();

beforeEach(() => {
  vi.useFakeTimers();
  skew.verdict = 'unknown';
  skew.listeners.clear();
  skew.queryLiveBuild.mockReset().mockResolvedValue(undefined);
  current = createRegistration();
  register.mockReset().mockImplementation(async () => current.registration);
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register,
      getRegistration: async () => current.registration,
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
});

describe('countInstall (FP3 fleet rule)', () => {
  it('should count installs that ended redundant in a row, reset on one that installed, and retire at the limit', () => {
    expect(countInstall(0, 'redundant')).toStrictEqual({ failures: 1, retire: false });
    expect(countInstall(1, 'redundant')).toStrictEqual({ failures: 2, retire: false });
    expect(countInstall(installFailureLimit - 1, 'redundant')).toStrictEqual({
      failures: installFailureLimit,
      retire: true,
    });
    expect(countInstall(2, 'installed')).toStrictEqual({ failures: 0, retire: false });
  });
});

describe('startServiceWorker (FP3)', () => {
  /** A waiting worker that reports `build` on the port of a build question. */
  const reportingWorker = (build: number): { postMessage: ReturnType<typeof vi.fn> } => ({
    postMessage: vi.fn((message: { type: string }, ports?: readonly MessagePort[]) => {
      if (message.type === workerBuildMessageType) {
        ports?.[0]?.postMessage({ build });
      }
    }),
  });

  it('should activate a waiting worker of this page’s own build while the server names this build', async () => {
    vi.useRealTimers();
    const waiting = reportingWorker(42);
    current.waiting = waiting;
    skew.verdict = 'live';
    const stop = startServiceWorker({ inWorkspace: false, verdict: { ...verdict, buildId: 42 }, onInstallStatus });

    await vi.waitFor(() => {
      expect(waiting.postMessage).toHaveBeenCalledWith({ type: skipWaitingMessageType });
    });
    stop();
  });

  it('should keep a waiting worker of another build waiting while the server names this build', async () => {
    vi.useRealTimers();
    const waiting = reportingWorker(41);
    current.waiting = waiting;
    skew.verdict = 'live';
    const stop = startServiceWorker({ inWorkspace: false, verdict: { ...verdict, buildId: 42 }, onInstallStatus });

    await vi.waitFor(() => {
      expect(waiting.postMessage).toHaveBeenCalledWith({ type: workerBuildMessageType }, expect.any(Array));
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(waiting.postMessage).not.toHaveBeenCalledWith({ type: skipWaitingMessageType });
    stop();
  });

  it('should retire the registration and its caches after installs keep failing, and never count anything else', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    Object.assign(current.registration, { unregister });
    const deleted: string[] = [];
    vi.stubGlobal('caches', {
      keys: async () => ['tau-precache-v3', 'tau-assets', 'other-cache'],
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
    });
    globalThis.localStorage.removeItem(installFailuresKey);
    const stop = startServiceWorker({ inWorkspace: false, verdict, onInstallStatus });
    await vi.runAllTimersAsync();

    for (let attempt = 0; attempt < installFailureLimit; attempt += 1) {
      current.failInstall();
      // oxlint-disable-next-line no-await-in-loop -- One install at a time, as the browser runs them.
      await vi.runAllTimersAsync();
    }

    expect(unregister).toHaveBeenCalledOnce();
    expect(deleted.toSorted()).toStrictEqual(['tau-assets', 'tau-precache-v3']);
    expect(onInstallStatus).toHaveBeenCalledWith('failed');
    expect(globalThis.localStorage.getItem(installFailuresKey)).toBeNull();
    stop();
    vi.unstubAllGlobals();
  });

  it('should delete orphan worker caches when there is no registration, before registering', async () => {
    const order: string[] = [];
    vi.stubGlobal('caches', {
      keys: async () => ['tau-precache-v3', 'other-cache'],
      delete: async (name: string) => {
        order.push(`delete ${name}`);
        return true;
      },
    });
    Object.assign(globalThis.navigator.serviceWorker, { getRegistration: async () => undefined });
    register.mockImplementation(async () => {
      order.push('register');
      return current.registration;
    });
    const stop = startServiceWorker({ inWorkspace: false, verdict, onInstallStatus });
    await vi.runAllTimersAsync();

    expect(order).toStrictEqual(['delete tau-precache-v3', 'register']);
    stop();
    vi.unstubAllGlobals();
  });
});
