// @vitest-environment jsdom
import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import * as Cookies from 'es-cookie';
import { mock } from 'vitest-mock-extended';
import type { PostHog } from 'posthog-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consentCookieName } from '@taucad/consent';
import { connectRemoteFlags, disconnectRemoteFlags } from '#flags/remote-flags.js';
import type * as PostHogLib from '#lib/posthog.lib.js';

/*
 * F2c: a direct load of `/welcome?step=viewer` behind the real web analytics boundary. The boundary, the consent hook
 * and the flag modules are real; PostHog is a stand-in that answers for flags when the test says so, and the setup
 * page is stubbed. The route must stay on the step through hydration, admission, the flag answer and any re-run or
 * remount of the boundary.
 */
vi.mock('#components/onboarding/setup-flow.js', () => ({
  SetupFlow: ({ initialStep }: { readonly initialStep?: string }) => (
    <div data-testid='setup-flow'>{initialStep ?? 'first'}</div>
  ),
}));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ connectWorkspace: vi.fn() }) }));
vi.mock('#components/tour/tour-menu.js', () => ({ useTourReplay: () => undefined }));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('@better-auth-ui/react', () => ({ useSession: () => ({ data: undefined, isPending: false }) }));
vi.mock('#lib/posthog.lib.js', async (importOriginal) => ({
  ...(await importOriginal<typeof PostHogLib>()),
  posthogConfig: { apiKey: 'phc_test_key', options: {} },
}));

/* One PostHog singleton for the file, as the provider keeps the first SDK module it loads. */
const flags = vi.hoisted(() => ({
  variants: undefined as Record<string, boolean> | undefined,
  /** Whether the last flags callback reported a failed load (`errorsLoading`). */
  errorsLoading: false,
  listeners: new Set<() => void>(),
  client: undefined as unknown,
}));
const client = mock<PostHog>({ __loaded: false });
client.init.mockImplementation(() => {
  (client as { __loaded: boolean }).__loaded = true;
  return client;
});
client.has_opted_out_capturing.mockReturnValue(false);
client.onFeatureFlags.mockImplementation((listener) => {
  const callback = (): void => {
    listener(Object.keys(flags.variants ?? {}), flags.variants ?? {}, { errorsLoading: flags.errorsLoading });
  };
  flags.listeners.add(callback);
  // As posthog-js does, a listener added once flags have loaded is called back at once.
  if (flags.variants !== undefined) {
    callback();
  }
  return () => {
    flags.listeners.delete(callback);
  };
});
Object.defineProperty(client, 'featureFlags', { value: { getFlagVariants: () => flags.variants ?? {} } });
flags.client = client;
vi.mock('posthog-js', () => ({
  get posthog() {
    return flags.client;
  },
}));

const { WebAnalyticsProvider } = await import('#providers/web-analytics-provider.js');
const { default: WelcomeRoute } = await import('#routes/welcome/route.js');

const answerFlags = (variants: Record<string, boolean>, errorsLoading = false): void => {
  flags.variants = variants;
  flags.errorsLoading = errorsLoading;
  for (const listener of flags.listeners) {
    listener();
  }
};

const app = (boundaryKey: string): ReactNode => (
  <MemoryRouter initialEntries={['/welcome?step=viewer']}>
    <WebAnalyticsProvider key={boundaryKey}>
      <Routes>
        <Route path='/welcome' element={<WelcomeRoute />} />
        <Route path='/' element={<div data-testid='home' />} />
      </Routes>
    </WebAnalyticsProvider>
  </MemoryRouter>
);

/** Server-render the document, then hydrate it, as a direct load does. */
const load = async (): Promise<{ container: HTMLElement; root: Root }> => {
  const container = document.createElement('div');
  container.innerHTML = renderToString(app('boundary'));
  document.body.append(container);
  let root: Root | undefined;
  await act(async () => {
    root = hydrateRoot(container, app('boundary'));
  });
  // The SDK is fetched once admission is decided; let that settle.
  await act(async () => {
    await vi.waitFor(() => {
      expect(client.onFeatureFlags).toHaveBeenCalled();
    });
  });
  return { container, root: root! };
};

const isHome = (container: HTMLElement): boolean => container.querySelector('[data-testid="home"]') !== null;

/* Each test is a fresh page, where nothing has answered for the flags yet. */
beforeEach(() => {
  connectRemoteFlags({ onFeatureFlags: () => undefined });
});

afterEach(() => {
  document.body.replaceChildren();
  Cookies.remove(consentCookieName);
  flags.variants = undefined;
  flags.errorsLoading = false;
  flags.listeners.clear();
  client.onFeatureFlags.mockClear();
  disconnectRemoteFlags();
  localStorage.clear();
});

describe('WelcomeRoute behind the real web analytics boundary', () => {
  it('should stay on the requested step through hydration, admission and the flag answer', async () => {
    Cookies.set(consentCookieName, JSON.stringify({ status: 'accepted', version: 1 }));
    const { container, root } = await load();

    expect(isHome(container)).toBe(false);
    expect(container.querySelector('[role="status"]')).toHaveAttribute('aria-busy', 'true');

    act(() => {
      answerFlags({ onboarding: true, 'viewer-controls': true });
    });

    expect(isHome(container)).toBe(false);
    expect(container.querySelector('[data-testid="setup-flow"]')).toHaveTextContent('viewer');
    act(() => {
      root.unmount();
    });
  });

  it('should stay on the step when the analytics boundary remounts after the flags answered on', async () => {
    Cookies.set(consentCookieName, JSON.stringify({ status: 'accepted', version: 1 }));
    // A client render, so only the remount is under test.
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(app('boundary'));
    });
    await act(async () => {
      await vi.waitFor(() => {
        expect(client.onFeatureFlags).toHaveBeenCalled();
      });
    });
    act(() => {
      answerFlags({ onboarding: true, 'viewer-controls': true });
    });
    expect(container.querySelector('[data-testid="setup-flow"]')).toHaveTextContent('viewer');

    await act(async () => {
      root.render(app('remounted'));
      await Promise.resolve();
    });

    expect(isHome(container)).toBe(false);
    expect(container.querySelector('[data-testid="setup-flow"]')).toHaveTextContent('viewer');
    act(() => {
      root.unmount();
    });
  });

  /* F2d: posthog-js reports `errorsLoading` once `/flags` timed out on its retry too (3 s each, staging run). */
  it('should show the requested step when the flag load fails, and keep it when a later refresh answers off', async () => {
    Cookies.set(consentCookieName, JSON.stringify({ status: 'accepted', version: 1 }));
    const { container, root } = await load();

    act(() => {
      answerFlags({}, true);
    });

    expect(isHome(container)).toBe(false);
    expect(container.querySelector('[data-testid="setup-flow"]')).toHaveTextContent('viewer');

    act(() => {
      answerFlags({ onboarding: false });
    });

    expect(isHome(container)).toBe(false);
    expect(container.querySelector('[data-testid="setup-flow"]')).toHaveTextContent('viewer');
    act(() => {
      root.unmount();
    });
  });

  it('should keep PostHog storage from an earlier visit when a consenting visitor loads the page', async () => {
    Cookies.set(consentCookieName, JSON.stringify({ status: 'accepted', version: 1 }));
    localStorage.setItem('ph_phc_test_key_posthog', '{"distinct_id":"returning"}');

    const { root } = await load();

    expect(localStorage.getItem('ph_phc_test_key_posthog')).toBe('{"distinct_id":"returning"}');
    act(() => {
      root.unmount();
    });
  });

  it('should redirect home once the visitor is known not to have consented', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(app('boundary'));
    document.body.append(container);

    await act(async () => {
      hydrateRoot(container, app('boundary'));
    });

    expect(isHome(container)).toBe(true);
  });
});
