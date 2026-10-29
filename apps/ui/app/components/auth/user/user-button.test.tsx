// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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
});
