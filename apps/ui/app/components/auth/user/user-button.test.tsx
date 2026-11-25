// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResponsiveSurfaceProvider } from '@taucad/ui/hooks/use-mobile';

const session = vi.hoisted(() => ({ data: undefined as unknown, isPending: true }));

vi.mock('@better-auth-ui/react', () => ({
  useAuth: () => ({
    authClient: {},
    basePaths: { auth: '/auth', settings: '/settings' },
    viewPaths: { auth: { signIn: 'sign-in', signOut: 'sign-out' }, settings: { account: 'account' } },
    localization: {
      auth: { account: 'Account', signIn: 'Sign in', signOut: 'Sign out' },
      settings: { settings: 'Settings' },
    },
    plugins: [],
    Link: ({ href, children }: { readonly href: string; readonly children?: React.ReactNode }) => (
      <a href={href}>{children}</a>
    ),
  }),
  useSession: () => session,
}));

const { UserButton } = await import('#components/auth/user/user-button.js');
const { writeIdentityRecord } = await import('#hooks/use-identity.js');

describe('UserButton', () => {
  beforeEach(() => {
    localStorage.clear();
    session.data = undefined;
    session.isPending = true;
  });

  /* W9 D1 (R1): offline, a failed or paused check is not a sign-out. */
  it('shows the last-known person on an offline launch, quietly unverified, and never offers "Sign in"', async () => {
    writeIdentityRecord({
      id: 'user-1',
      name: 'Ada Lovelace',
      email: 'ada@example.test',
    });
    render(<UserButton size='default' />);

    const trigger = screen.getByRole('button', { name: /Ada Lovelace/u });
    expect(within(trigger).queryByText('Account')).not.toBeInTheDocument();

    await userEvent.click(trigger);

    expect(await screen.findByText('Can’t reach Tau')).toBeInTheDocument();
    expect(screen.getByText('Sign out')).toBeInTheDocument();
    expect(screen.queryByText('Sign in')).not.toBeInTheDocument();
  });

  it('should keep the trigger named while the session loads', () => {
    render(<UserButton size='sm' />);

    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
  });

  it('renders avatar and name skeletons while the session loads, never the signed-out row', () => {
    session.isPending = true;
    const pending = renderToString(<UserButton size='sm' />);
    session.isPending = false;
    const signedOut = renderToString(<UserButton size='sm' />);

    expect(pending).not.toBe(signedOut);
    expect(pending).toContain('data-slot="skeleton"');
    expect(signedOut).not.toContain('data-slot="skeleton"');
  });

  it('names the signed-out way in "Sign in", the word every other sign-in entry uses (I6)', async () => {
    session.isPending = false;
    render(<UserButton size='sm' />);

    await userEvent.click(screen.getByRole('button', { name: 'Account' }));

    const signIn = await screen.findByText('Sign in');
    expect(signIn.closest('a')).toHaveAttribute('href', '/auth/sign-in');
    expect(screen.queryByText('Log in')).not.toBeInTheDocument();
  });

  it('should open the account menu in a drawer above the sidebar sheet on a phone', async () => {
    session.isPending = false;
    // Vaul reads the media query when a drawer opens; jsdom has none.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    render(
      <ResponsiveSurfaceProvider isMobile container={undefined}>
        <UserButton size='sm' />
      </ResponsiveSurfaceProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Account' }));

    const drawer = await screen.findByRole('dialog', { name: 'Account' });
    expect(within(drawer).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/sign-in');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
