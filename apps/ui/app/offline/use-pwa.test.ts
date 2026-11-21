/**
 * Safe mode's departure from the web app's service worker (FP5): it unregisters, deletes the worker caches, and, while
 * the unregistered worker still controls the page, sweeps again once the page settles, because a chunk the page loads
 * later is cached again on first use.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { leaveServiceWorker } from '#offline/use-pwa.js';

/** `controlled`: whether a worker still controls the page (the browser's `controller` is then non-null). */
const install = (controlled: boolean) => {
  const names = new Set(['tau-assets-v3', 'tau-precache-v3-http://localhost/', 'another-app']);
  const unregister = vi.fn(async () => true);
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    // oxlint-disable-next-line unicorn/no-null -- the browser's own value for an uncontrolled page.
    value: { getRegistrations: async () => [{ unregister }], controller: controlled ? {} : null },
  });
  vi.stubGlobal('caches', {
    keys: async () => [...names],
    delete: async (name: string) => names.delete(name),
  });
  return { names, unregister };
};

afterEach(() => {
  vi.unstubAllGlobals();
  // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- removing the jsdom test double.
  delete (globalThis.navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe('leaveServiceWorker (FP5)', () => {
  it('should sweep again after the page settles while the old worker still controls it', async () => {
    const { names, unregister } = install(true);
    const sweeps: Array<() => void> = [];
    await leaveServiceWorker((sweep) => {
      sweeps.push(sweep);
    });
    expect(unregister).toHaveBeenCalledOnce();
    expect([...names]).toStrictEqual(['another-app']);
    names.add('tau-assets-v3'); // A later chunk load through the old worker.
    expect(sweeps).toHaveLength(1);
    sweeps[0]?.();
    await vi.waitFor(() => {
      expect([...names]).toStrictEqual(['another-app']);
    });
  });

  it('should not sweep again once no worker controls the page', async () => {
    install(false);
    const settle = vi.fn();
    await leaveServiceWorker(settle);
    expect(settle).not.toHaveBeenCalled();
  });
});
