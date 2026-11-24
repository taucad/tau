// @vitest-environment jsdom
import { act } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectRemoteFlags, disconnectRemoteFlags } from '#flags/remote-flags.js';
import type { RemoteFlagClient } from '#flags/remote-flags.js';

/*
 * F2d: `/welcome?step=viewer` with the real flag modules and the real setup page. When the flag load fails, the deep
 * link fails open on the step it names, not on step 1, and a later PostHog answer does not take that step away.
 */
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ connectWorkspace: vi.fn() }) }));
vi.mock('#hooks/use-analytics.js', () => ({ useAnalytics: () => ({ capture: vi.fn() }) }));
vi.mock('#components/onboarding/webgl-support.js', () => ({ canCreateWebGl: () => false }));
/* "Take it again" reads the project listing; this suite has no project. */
vi.mock('#hooks/use-projects.js', () => ({ useProjects: () => ({ projects: [] }) }));

const { default: WelcomeRoute } = await import('#routes/welcome/route.js');

/** A PostHog client that answers, or reports a failed load, when the test says so. */
const createPendingClient = (): {
  client: RemoteFlagClient;
  answer: (variants: Record<string, boolean>) => void;
  failLoad: () => void;
} => {
  let variants: Record<string, boolean> = {};
  let callback: Parameters<RemoteFlagClient['onFeatureFlags']>[0] | undefined;
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
      callback?.([], next, { errorsLoading: false });
    },
    failLoad() {
      callback?.([], variants, { errorsLoading: true });
    },
  };
};

const renderViewerLink = (): void => {
  const router = createMemoryRouter(
    [
      { path: '/welcome', element: <WelcomeRoute /> },
      { path: '/', element: <p data-testid='home' /> },
    ],
    { initialEntries: ['/welcome?step=viewer'] },
  );
  render(<RouterProvider router={router} />);
};

const viewerHeading = (): HTMLElement | undefined =>
  screen.queryByRole('heading', { level: 1, name: 'Make the viewer feel like home' }) ?? undefined;

afterEach(() => {
  cleanup();
  disconnectRemoteFlags();
  globalThis.localStorage.clear();
});

describe('setup on a viewer-step link when the flag load fails', () => {
  it('should open the viewer step it names', () => {
    const posthog = createPendingClient();
    connectRemoteFlags(posthog.client);
    renderViewerLink();

    act(() => {
      posthog.failLoad();
    });

    expect(screen.queryByTestId('home')).toBeNull();
    expect(viewerHeading()).toBeInTheDocument();
  });

  it('should keep the viewer step when a later PostHog refresh answers viewerControls off', () => {
    const posthog = createPendingClient();
    connectRemoteFlags(posthog.client);
    renderViewerLink();
    act(() => {
      posthog.failLoad();
    });

    act(() => {
      posthog.answer({ onboarding: true, 'viewer-controls': false });
    });

    expect(viewerHeading()).toBeInTheDocument();
  });

  it('should leave the viewer step out when PostHog answers viewerControls off before setup is shown', () => {
    const posthog = createPendingClient();
    connectRemoteFlags(posthog.client);
    renderViewerLink();

    act(() => {
      posthog.answer({ onboarding: true, 'viewer-controls': false });
    });

    expect(viewerHeading()).toBeUndefined();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
  });
});
