// @vitest-environment jsdom
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectRemoteFlags, disconnectRemoteFlags } from '#flags/remote-flags.js';
import type { RemoteFlagClient } from '#flags/remote-flags.js';

/*
 * F2: a direct load of `/welcome?step=viewer` must not send the person home while the PostHog-backed `onboarding`
 * flag is still unknown. The flag modules are real; only the setup page and its route-level services are stubbed.
 */
vi.mock('#components/onboarding/setup-flow.js', () => ({
  SetupFlow: ({ initialStep }: { readonly initialStep?: string }) => (
    <div data-testid='setup-flow'>{initialStep ?? 'first'}</div>
  ),
}));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ connectWorkspace: vi.fn() }) }));
vi.mock('#components/tour/tour-menu.js', () => ({ useTourReplay: () => undefined }));

const { default: WelcomeRoute } = await import('#routes/welcome/route.js');

/** A PostHog client that answers only when the test says so, as the real one does after its flags request. */
const createPendingClient = (): { client: RemoteFlagClient; answer: (variants: Record<string, boolean>) => void } => {
  let variants: Record<string, boolean> = {};
  let callback: (() => void) | undefined;
  return {
    client: {
      featureFlags: { getFlagVariants: () => variants },
      onFeatureFlags(listener) {
        callback = listener;
        return () => {
          callback = undefined;
        };
      },
    },
    answer(next) {
      variants = next;
      callback?.();
    },
  };
};

const app = (
  <MemoryRouter initialEntries={['/welcome?step=viewer']}>
    <Routes>
      <Route path='/welcome' element={<WelcomeRoute />} />
      <Route path='/' element={<div data-testid='home' />} />
    </Routes>
  </MemoryRouter>
);

afterEach(() => {
  cleanup();
  disconnectRemoteFlags();
});

describe('WelcomeRoute on a direct load', () => {
  it('should wait instead of redirecting home while PostHog has not answered', () => {
    const posthog = createPendingClient();
    connectRemoteFlags(posthog.client);

    render(app);

    expect(screen.queryByTestId('home')).toBeNull();
    expect(screen.queryByTestId('setup-flow')).toBeNull();
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('should open the requested step once PostHog turns onboarding on', () => {
    const posthog = createPendingClient();
    connectRemoteFlags(posthog.client);
    render(app);

    act(() => {
      posthog.answer({ onboarding: true, 'viewer-controls': true });
    });

    expect(screen.queryByTestId('home')).toBeNull();
    expect(screen.getByTestId('setup-flow')).toHaveTextContent('viewer');
  });

  it('should redirect home once PostHog answers with onboarding off', () => {
    const posthog = createPendingClient();
    connectRemoteFlags(posthog.client);
    render(app);

    act(() => {
      posthog.answer({ onboarding: false });
    });

    expect(screen.getByTestId('home')).toBeInTheDocument();
  });

  it('should redirect home when no flag answer will come (analytics not admitted)', () => {
    disconnectRemoteFlags();

    render(app);

    expect(screen.getByTestId('home')).toBeInTheDocument();
  });

  it('should not redirect while hydrating a server render, even with onboarding already on', async () => {
    const posthog = createPendingClient();
    connectRemoteFlags(posthog.client);
    posthog.answer({ onboarding: true, 'viewer-controls': true });
    const container = document.createElement('div');
    container.innerHTML = renderToString(app);
    document.body.append(container);
    expect(container.querySelector('[data-testid="home"]')).toBeNull();

    await act(async () => {
      hydrateRoot(container, app);
    });

    expect(container.querySelector('[data-testid="home"]')).toBeNull();
    expect(container.querySelector('[data-testid="setup-flow"]')).toHaveTextContent('viewer');
    container.remove();
  });
});
