// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- registers DOM matchers for this test module
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActiveSessions } from '#components/auth/settings/security/active-sessions.js';

const authState = vi.hoisted(() => ({
  listSessions: vi.fn<(...arguments_: unknown[]) => unknown>(),
  refetch: vi.fn<() => Promise<unknown>>(),
  revokeSession: vi.fn(),
}));

vi.mock('@better-auth-ui/react', () => ({
  useAuth: () => ({
    authClient: {},
    basePaths: { auth: '/auth' },
    localization: {
      auth: { signOut: 'Sign out' },
      settings: {
        activeSessions: 'Active sessions',
        currentSession: 'Current session',
        revoke: 'Revoke',
        revokeSession: 'Revoke session',
        revokeSessionSuccess: 'Session revoked',
      },
    },
    Link: ({ href, children, ...properties }: React.ComponentProps<'a'> & { readonly href: string }) => (
      <a {...properties} href={href} rel='noreferrer'>
        {children}
      </a>
    ),
    navigate: vi.fn(),
    viewPaths: { auth: { signOut: 'sign-out' } },
  }),
  useListSessions: (...arguments_: unknown[]): unknown => authState.listSessions(...arguments_),
  useRevokeSession: () => ({ mutate: authState.revokeSession, isPending: false }),
  useSession: () => ({
    data: { session: { id: 'current-id', token: 'current-token' }, user: { id: 'user-id' } },
  }),
}));

const session = {
  id: 'current-id',
  token: 'current-token',
  userId: 'user-id',
  userAgent: 'Mozilla/5.0 Chrome/120.0',
  ipAddress: '127.0.0.1',
  createdAt: new Date('2026-09-11T00:00:00Z'),
  updatedAt: new Date('2026-09-11T00:00:00Z'),
  expiresAt: new Date('2026-09-18T00:00:00Z'),
};

const renderSessions = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={['/home/project?settings=security']}>
      <ActiveSessions />
    </MemoryRouter>,
  );

describe('ActiveSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.refetch.mockResolvedValue(undefined);
  });

  it('should show the current session when the session list succeeds', () => {
    authState.listSessions.mockReturnValue({
      data: [session],
      error: null,
      isError: false,
      isFetching: false,
      isPending: false,
      refetch: authState.refetch,
    });

    renderSessions();

    expect(screen.getByText('Current session')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(authState.listSessions).toHaveBeenCalledWith({}, { meta: { handlesErrorLocally: true } });
  });

  it('should ask the user to sign in again when the session is not fresh', () => {
    authState.listSessions.mockReturnValue({
      data: undefined,
      error: { error: { code: 'SESSION_NOT_FRESH', message: 'Session is not fresh' } },
      isError: true,
      isFetching: false,
      isPending: false,
      refetch: authState.refetch,
    });

    renderSessions();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'For your security, sign in again to view and manage active sessions.',
    );
    expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/auth/sign-in?redirectTo=%2Fhome%2Fproject%3Fsettings%3Dsecurity',
    );
    expect(screen.queryByText('No active sessions found.')).not.toBeInTheDocument();
  });

  it('should retry an unexpected session-list failure', async () => {
    authState.listSessions.mockReturnValue({
      data: undefined,
      error: { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal error' } },
      isError: true,
      isFetching: false,
      isPending: false,
      refetch: authState.refetch,
    });

    renderSessions();
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load your active sessions.");

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(authState.refetch).toHaveBeenCalledOnce();
  });

  it('should expose the pending session list as busy status', () => {
    authState.listSessions.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isFetching: true,
      isPending: true,
      refetch: authState.refetch,
    });

    renderSessions();

    expect(screen.getByRole('status', { name: 'Loading active sessions' })).toHaveAttribute('aria-busy', 'true');
  });
});
