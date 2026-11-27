/**
 * Safe mode's departure from the web app's service worker (FP5): the controlling worker is told to stop writing caches
 * and confirms first, then every registration is unregistered and the worker caches are swept once.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { leaveServiceWorker, stopWorkerCaching } from '#offline/use-pwa.js';
import { stopCachingMessageType } from '#offline/pwa-messages.js';

const install = (controller: Pick<ServiceWorker, 'postMessage'> | undefined) => {
  const names = new Set(['tau-assets-v3', 'tau-precache-v3-http://localhost/', 'another-app']);
  const steps: string[] = [];
  const unregister = vi.fn(async () => {
    steps.push('unregister');
    return true;
  });
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    // oxlint-disable-next-line unicorn/no-null -- the browser's own value for an uncontrolled page.
    value: { getRegistrations: async () => [{ unregister }], controller: controller ?? null },
  });
  vi.stubGlobal('caches', {
    keys: async () => [...names],
    delete: async (name: string) => {
      steps.push(`delete ${name}`);
      return names.delete(name);
    },
  });
  return { names, steps };
};

/** A worker that confirms the stop on the message's port, as `service-worker.ts` does. */
const confirmingWorker = (steps: string[]): Pick<ServiceWorker, 'postMessage'> => ({
  postMessage: (message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) => {
    steps.push(`message ${(message as { type: string }).type}`);
    const [port] = (Array.isArray(transfer) ? transfer : []) as MessagePort[];
    port?.postMessage({ type: stopCachingMessageType });
  },
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- removing the jsdom test double.
  delete (globalThis.navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe('leaveServiceWorker (FP5)', () => {
  it('should stop the controlling worker before it unregisters and sweeps once', async () => {
    const steps: string[] = [];
    const { names, steps: recorded } = install(confirmingWorker(steps));
    await leaveServiceWorker();
    expect([...names]).toStrictEqual(['another-app']);
    expect(steps).toStrictEqual([`message ${stopCachingMessageType}`]);
    expect(recorded[0]).toBe('unregister');
  });

  it('should unregister and sweep with no controlling worker', async () => {
    const { names } = install(undefined);
    await leaveServiceWorker();
    expect([...names]).toStrictEqual(['another-app']);
  });
});

describe('stopWorkerCaching (FP5)', () => {
  it('should resolve true on the worker’s confirmation', async () => {
    await expect(stopWorkerCaching(confirmingWorker([]))).resolves.toBe(true);
  });

  it('should give up at the timeout on a worker that predates the message', async () => {
    vi.useFakeTimers();
    const silent = { postMessage: vi.fn() };
    const stopped = stopWorkerCaching(silent, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(stopped).resolves.toBe(false);
  });
});
