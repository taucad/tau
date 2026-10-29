// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('UserButton', () => {
  it('should keep the trigger named while the session loads', () => {
    render(<UserButton size='sm' />);

    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
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
    expect(drawer).toHaveClass('z-110');
    expect(within(drawer).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/sign-in');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
