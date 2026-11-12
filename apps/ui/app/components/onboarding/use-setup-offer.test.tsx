// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, Link, RouterProvider, useSearchParams } from 'react-router';
import { useEffect } from 'react';

const flags = vi.hoisted(() => ({ onboarding: true, onboardingAutoOpen: true }));
vi.mock('#flags/use-feature.js', () => ({ useFeature: (flag: keyof typeof flags) => flags[flag] }));
const session = vi.hoisted(() => ({
  state: { data: undefined as { user: { createdAt: Date } } | undefined, isPending: true },
  listeners: new Set<() => void>(),
}));
vi.mock('@better-auth-ui/react', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useSession: () =>
      useSyncExternalStore(
        (listener: () => void) => {
          session.listeners.add(listener);
          return () => session.listeners.delete(listener);
        },
        () => session.state,
      ),
  };
});
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));

const { useSetupOffer } = await import('#components/onboarding/use-setup-offer.js');
const { SetupInvite } = await import('#components/onboarding/setup-invite.js');
const { personRecordStores, deviceRecordStore } = await import('#preferences/person-record.store.js');

const setSession = (data: { user: { createdAt: Date } } | undefined, isPending = false): void => {
  act(() => {
    session.state = { data, isPending };
    for (const listener of session.listeners) {
      listener();
    }
  });
};

/** Home as the app has it: it drops its `?app` marker, then decides. */
function Home(): React.JSX.Element {
  const [parameters, setParameters] = useSearchParams();
  const hasApp = parameters.has('app');
  useEffect(() => {
    if (hasApp) {
      setParameters(new URLSearchParams(), { replace: true });
    }
  }, [hasApp, setParameters]);
  useSetupOffer({ isDesktopFirstRun: false });
  return (
    <>
      <p>Home</p>
      <textarea aria-label='Composer' />
      <SetupInvite />
    </>
  );
}

function DesktopHome(): React.JSX.Element {
  useSetupOffer({ isDesktopFirstRun: true });
  return <p>Home</p>;
}

const renderAt = (path: string, element = <Home />): ReturnType<typeof createMemoryRouter> => {
  const router = createMemoryRouter(
    [
      { path: '/', element },
      { path: '/welcome', element: <p>Setup</p> },
      { path: '/auth/sign-in', element: <Link to='/'>Signed in</Link> },
      { path: '/settings', element: <p>Settings</p> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
};

const newAccount = (): { user: { createdAt: Date } } => ({ user: { createdAt: new Date(Date.now() - 60_000) } });

describe('useSetupOffer (E1)', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    flags.onboarding = true;
    flags.onboardingAutoOpen = true;
    session.state = { data: undefined, isPending: true };
  });

  it('opens once a new account session arrives on home (OAuth callback, magic link, verification)', async () => {
    const router = renderAt('/');
    expect(router.state.location.pathname).toBe('/');
    setSession(newAccount());
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/welcome');
    });
    expect(router.state.location.search).toBe('?entry=signup');
    expect(personRecordStores.onboarding.read().setup?.status).toBe('offered');
  });

  it('opens after the auth route navigates home (password sign-in), ignoring keys typed before home', async () => {
    const user = userEvent.setup();
    session.state = { data: newAccount(), isPending: false };
    const router = renderAt('/auth/sign-in');
    await user.keyboard('password');
    await user.click(screen.getByRole('link', { name: 'Signed in' }));
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/welcome');
    });
  });

  it('opens at /?app once home has dropped the marker', async () => {
    session.state = { data: newAccount(), isPending: false };
    const router = renderAt('/?app');
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/welcome');
    });
  });

  it('does not open again on a reload once offered is stored', () => {
    personRecordStores.onboarding.write({ setupStatus: 'offered' });
    session.state = { data: newAccount(), isPending: false };
    const router = renderAt('/');
    expect(router.state.location.pathname).toBe('/');
  });

  it('does not open for a settings deep link', () => {
    session.state = { data: newAccount(), isPending: false };
    const router = renderAt('/?settings=billing');
    expect(router.state.location.pathname).toBe('/');
  });

  it('does not open after composer focus on home', async () => {
    const user = userEvent.setup();
    const router = renderAt('/');
    await user.click(screen.getByRole('textbox', { name: 'Composer' }));
    setSession(newAccount());
    expect(router.state.location.pathname).toBe('/');
  });

  it('does not open with onboardingAutoOpen off, and shows the invite instead', () => {
    flags.onboardingAutoOpen = false;
    session.state = { data: newAccount(), isPending: false };
    const router = renderAt('/');
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByTestId('setup-invite')).toBeInTheDocument();
  });

  it('opens on the desktop first run with no account', async () => {
    session.state = { data: undefined, isPending: false };
    const router = renderAt('/', <DesktopHome />);
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/welcome');
    });
    expect(router.state.location.search).toBe('?entry=first_launch');
  });
});

describe('SetupInvite (E2)', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    flags.onboarding = true;
    flags.onboardingAutoOpen = false;
    session.state = { data: undefined, isPending: false };
  });

  it('opens /welcome from "Set up"', async () => {
    const user = userEvent.setup();
    const router = renderAt('/');
    await user.click(screen.getByRole('link', { name: 'Set up' }));
    expect(router.state.location.pathname).toBe('/welcome');
    expect(router.state.location.search).toBe('?entry=invite');
  });

  it('stores dismissal on the device, and it survives a reload', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('setup-invite')).not.toBeInTheDocument();
    expect(deviceRecordStore.read().inviteDismissed).toBe(true);
    cleanup();
    renderAt('/');
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.queryByTestId('setup-invite')).not.toBeInTheDocument();
  });

  it('is absent with onboarding off', () => {
    flags.onboarding = false;
    renderAt('/');
    expect(screen.queryByTestId('setup-invite')).not.toBeInTheDocument();
  });

  it('is absent once the device has a setup record', () => {
    personRecordStores.onboarding.write({ setupStatus: 'skipped' });
    renderAt('/');
    expect(screen.queryByTestId('setup-invite')).not.toBeInTheDocument();
  });
});
