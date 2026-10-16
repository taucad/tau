// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { OfflineShell } from '#offline/offline-shell.js';

const register = vi.fn<(scriptUrl: string) => Promise<ServiceWorkerRegistration>>();
let readyState: DocumentReadyState = 'loading';

const renderShell = (): void => {
  const router = createMemoryRouter([{ path: '/', element: <OfflineShell /> }]);
  render(<RouterProvider router={router} />);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('PROD', true);
  vi.stubEnv('TAU_OFFLINE_SHELL', 'enabled');
  register.mockReset().mockResolvedValue(mock<ServiceWorkerRegistration>());
  readyState = 'loading';
  vi.spyOn(document, 'readyState', 'get').mockImplementation(() => readyState);
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    value: { register, addEventListener: vi.fn(), removeEventListener: vi.fn() },
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
  it('should wait for the page to load before installing the offline worker', async () => {
    renderShell();
    await vi.runAllTimersAsync();

    expect(register).not.toHaveBeenCalled();

    readyState = 'complete';
    globalThis.dispatchEvent(new Event('load'));
    await vi.runAllTimersAsync();

    expect(register).toHaveBeenCalledExactlyOnceWith('/offline-shell-worker.js');
  });

  it('should install once idle when the page has already loaded', async () => {
    readyState = 'complete';

    renderShell();
    await vi.runAllTimersAsync();

    expect(register).toHaveBeenCalledExactlyOnceWith('/offline-shell-worker.js');
  });

  it('should not install after it unmounts before the page loads', async () => {
    renderShell();
    cleanup();

    readyState = 'complete';
    globalThis.dispatchEvent(new Event('load'));
    await vi.runAllTimersAsync();

    expect(register).not.toHaveBeenCalled();
  });
});
