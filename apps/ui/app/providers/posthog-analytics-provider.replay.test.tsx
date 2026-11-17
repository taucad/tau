// @vitest-environment jsdom
/**
 * #2290: replay never runs at an address that holds a credential.
 *
 * A replay serialises the whole document and the browser resolves every
 * relative `href` against the address bar, so redaction of event properties
 * cannot reach what a page at a credential address leaks. The provider owns
 * the only call that starts recording, so it is where the address is checked.
 */
import { act, render, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { PostHog } from 'posthog-js';

/* The provider keeps the singleton it fetched for the life of the module, as the SDK's own import does, so one
   double serves every row and is cleared between them. */
const posthog = mock<PostHog>({ __loaded: true });
vi.mock('posthog-js', () => ({ posthog }));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('@better-auth-ui/react', () => ({
  useSession: () => ({ isPending: true }),
}));
vi.mock('#lib/posthog.lib.js', () => ({
  posthogConfig: { apiKey: 'test' },
  clearPostHogStorage: vi.fn(),
}));

const { PostHogAnalyticsProvider } = await import('#providers/posthog-analytics-provider.js');

const options = {};

/** An admitted, replay-enabled host whose router starts at `path`. */
const mountAt = (path: string): ReturnType<typeof createMemoryRouter> => {
  const Shell = ({ children }: { readonly children?: ReactNode }): React.JSX.Element => (
    <PostHogAnalyticsProvider isActive options={options} isReplayEnabled>
      {children}
    </PostHogAnalyticsProvider>
  );
  const router = createMemoryRouter([{ path: '*', element: <Shell /> }], {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
};

describe('session replay at a credential address', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(posthog.has_opted_out_capturing).mockReturnValue(false);
  });

  it.each([
    '/invitations/AbC-123_xyz',
    '/auth/sign-in?redirectTo=%2Finvitations%2FAbC-123_xyz',
    '/auth/reset-password?token=abc.DEF-123',
    '/auth/reset-password?%74oken=abc.DEF-123',
  ])('cannot start recording on %s', async (path) => {
    mountAt(path);

    await waitFor(() => {
      expect(posthog.stopSessionRecording).toHaveBeenCalled();
    });
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    });
    expect(posthog.startSessionRecording).not.toHaveBeenCalled();
  });

  it('records a clean address, stops on the way into a credential address, and resumes after it', async () => {
    const router = mountAt('/projects');
    await waitFor(() => {
      expect(posthog.startSessionRecording).toHaveBeenCalledOnce();
    });

    await act(async () => {
      await router.navigate('/auth/sign-in?redirectTo=%2Finvitations%2FAbC-123_xyz');
    });
    expect(posthog.stopSessionRecording).toHaveBeenCalledOnce();

    await act(async () => {
      await router.navigate('/invitations');
    });
    await waitFor(() => {
      expect(posthog.startSessionRecording).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps one recording across clean navigations', async () => {
    const router = mountAt('/projects');
    await waitFor(() => {
      expect(posthog.startSessionRecording).toHaveBeenCalledOnce();
    });

    await act(async () => {
      await router.navigate('/projects/new');
      await router.navigate('/w/home/shared-housing');
    });
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    });
    expect(posthog.startSessionRecording).toHaveBeenCalledOnce();
    expect(posthog.stopSessionRecording).not.toHaveBeenCalled();
  });
});
