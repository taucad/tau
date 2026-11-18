// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { OfflineShell } from '#offline/offline-shell.js';

const register = vi.fn<(scriptUrl: string) => Promise<ServiceWorkerRegistration>>();
const getRegistration = vi.fn<() => Promise<ServiceWorkerRegistration | undefined>>();
let readyState: DocumentReadyState = 'loading';

const renderShell = (path = '/'): ReturnType<typeof createMemoryRouter> => {
  const router = createMemoryRouter([{ path: '*', element: <OfflineShell /> }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
};

/** Runs the idle start, waits for the registration module's dynamic import, then lets the registration run. */
const settle = async (): Promise<void> => {
  await vi.runAllTimersAsync();
  await vi.dynamicImportSettled();
  await vi.runAllTimersAsync();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('PROD', true);
  vi.stubEnv('TAU_SERVICE_WORKER', 'enabled');
  register.mockReset().mockResolvedValue(mock<ServiceWorkerRegistration>({ installing: null, waiting: null }));
  getRegistration.mockReset().mockResolvedValue(undefined);
  readyState = 'loading';
  vi.spyOn(document, 'readyState', 'get').mockImplementation(() => readyState);
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    value: { register, getRegistration, addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- removing the jsdom test double.
  delete (globalThis.navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe('OfflineShell', () => {
  it('should wait for the page to load before installing the service worker', async () => {
    renderShell();
    await settle();

    expect(register).not.toHaveBeenCalled();

    readyState = 'complete';
    globalThis.dispatchEvent(new Event('load'));
    await settle();

    expect(register).toHaveBeenCalledExactlyOnceWith('/service-worker.js');
  });

  it('should install once idle when the page has already loaded', async () => {
    readyState = 'complete';

    renderShell();
    await settle();

    expect(register).toHaveBeenCalledExactlyOnceWith('/service-worker.js');
  });

  it('should not install after it unmounts before the page loads', async () => {
    renderShell();
    cleanup();

    readyState = 'complete';
    globalThis.dispatchEvent(new Event('load'));
    await settle();

    expect(register).not.toHaveBeenCalled();
  });

  /* B-27, D-UI-26: the precache download competed with the kernel, WASM and
   * editor downloads of an opening project. */
  it('should not install while a project workspace is open, and install once the reader leaves it', async () => {
    readyState = 'complete';

    const router = renderShell('/w/acme/bracket');
    await settle();

    expect(register).not.toHaveBeenCalled();
    // It only looks for a worker an earlier page installed, to apply the update rule.
    expect(getRegistration).toHaveBeenCalledOnce();

    await act(async () => {
      await router.navigate('/projects');
    });
    await settle();

    expect(register).toHaveBeenCalledExactlyOnceWith('/service-worker.js');
  });

  it('should say so when the usage page cannot be saved for offline use', async () => {
    readyState = 'complete';
    let onMessage: ((event: MessageEvent) => void) | undefined;
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register,
        getRegistration,
        addEventListener: (_type: string, listener: (event: MessageEvent) => void) => {
          onMessage = listener;
        },
        removeEventListener: vi.fn(),
      },
    });

    renderShell('/usage');
    await settle();
    act(() => {
      onMessage?.(new MessageEvent('message', { data: { type: 'tau-service-worker', status: 'quota-exceeded' } }));
    });

    expect(document.body.textContent).toContain('Not enough storage to save this page for offline use.');
  });

  /* The kill switch (TAU_SERVICE_WORKER_KILL_SWITCH=true): pages register nothing and ask an installed worker's
   * registration to fetch the retiring one, inside a project workspace too. */
  it('should only ask an installed registration for the retiring worker in a kill switch build', async () => {
    vi.stubEnv('TAU_SERVICE_WORKER', 'retired');
    const update = vi.fn<() => Promise<ServiceWorkerRegistration>>();
    const registration = mock<ServiceWorkerRegistration>({ update });
    update.mockResolvedValue(registration);
    getRegistration.mockResolvedValue(registration);
    readyState = 'complete';

    renderShell('/w/acme/bracket');
    await settle();

    expect(register).not.toHaveBeenCalled();
    expect(getRegistration).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  it('should do nothing in a kill switch build when no worker is installed', async () => {
    vi.stubEnv('TAU_SERVICE_WORKER', 'retired');
    readyState = 'complete';

    renderShell();
    await settle();

    expect(register).not.toHaveBeenCalled();
    expect(getRegistration).toHaveBeenCalledOnce();
  });

  it('should register nothing outside a production web build', async () => {
    vi.stubEnv('TAU_SERVICE_WORKER', undefined);
    readyState = 'complete';

    renderShell();
    await settle();

    expect(register).not.toHaveBeenCalled();
  });
});
