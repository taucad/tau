// @vitest-environment jsdom
/**
 * `/invitations/:token` — the invitee's half of D27.
 *
 * There is no invitation email, so this link is the whole of what an invitee
 * receives. Every branch it can land in is a sentence a stranger has to act on
 * with no other context: the address it was sent to, the account they are in,
 * and whether the link still works.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The session and library the route reads, typed so the doubles are not `any`. */
type SessionAnswer = Readonly<{
  // oxlint-disable-next-line typescript/no-restricted-types -- better-auth answers `null` for a signed-out session, which is the whole of F2.
  data: Readonly<{ user: Readonly<{ id: string; email: string }> }> | undefined | null;
  isPending: boolean;
}>;
type ProjectsAnswer = Readonly<{ projects: ReadonlyArray<Readonly<{ id: string }>> }>;

const { mockCreateProject, mockSession, mockProjects } = vi.hoisted(() => ({
  mockCreateProject: vi.fn(),
  mockSession: vi.fn<() => SessionAnswer>(),
  mockProjects: vi.fn<() => ProjectsAnswer>(),
}));

vi.mock('@better-auth-ui/react', () => ({ useSession: () => mockSession() }));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('#hooks/use-projects.js', () => ({ useProjects: () => mockProjects() }));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ createProject: mockCreateProject }) }));
/* eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names. */
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test' } }));

const { default: AcceptInvitation } = await import('#routes/invitations.$token/route.js');

/** Where the route left the router. */
function Where(): React.JSX.Element {
  const location = useLocation();
  return <span data-testid='pathname'>{location.pathname}</span>;
}

let queryClient: QueryClient;

const mountRoute = (): void => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient = client;
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/invitations/tok_abcdef']}>
        <Routes>
          <Route path='/invitations/:token' element={<AcceptInvitation />} />
          <Route path='*' element={<span>elsewhere</span>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

/** One `fetch` double for both calls the route makes: the accept, then the listing. */
const answerWith = (accept: { status: number; body: unknown }): void => {
  const reply = (
    status: number,
    body: unknown,
  ): Readonly<{ ok: boolean; status: number; json: () => Promise<unknown> }> => ({
    ok: status < 400,
    status,
    json: async () => body,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.includes('/v1/invitations/')
        ? reply(accept.status, accept.body)
        : reply(200, [{ id: 'proj_shared00000000000000', name: 'Shared Housing', role: 'write' }]),
    ),
  );
};

describe('AcceptInvitation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockReturnValue({
      data: { user: { id: 'user_1', email: 'invitee@example.test' } },
      isPending: false,
    });
    mockProjects.mockReturnValue({ projects: [] });
    mockCreateProject.mockResolvedValue({
      id: 'proj_shared00000000000000',
      slugs: { workspaceSlug: 'home', projectSlug: 'shared-housing' },
    });
    answerWith({ status: 201, body: { projectId: 'proj_shared00000000000000', role: 'write' } });
  });

  it('posts the token and opens the project it grants', async () => {
    mountRoute();

    await waitFor(() => {
      expect(screen.getByTestId('pathname').textContent).toBe('/w/home/shared-housing');
    });
    /* N2: the listing this accept just joined is the listing the project route
       reads its role from. Dropping it made the opened project's Sync region
       ask again from scratch, which is a frame with no role at all. */
    expect(queryClient.getQueryData(['cloud-projects'])).toStrictEqual([
      { id: 'proj_shared00000000000000', name: 'Shared Housing', role: 'write' },
    ]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.test/v1/invitations/tok_abcdef',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'proj_shared00000000000000', files: {} }),
    );
  });

  /* F2: `useSession().data` is `null` when signed out, not `undefined`. The
     old `=== undefined` guard let a signed-out visitor spend their token on an
     unauthenticated POST and then read "could not be accepted". */
  it('fires nothing at all when the session answered null', async () => {
    mockSession.mockReturnValue({ data: null, isPending: false });
    mountRoute();

    expect(await screen.findByText('Sign in to accept this invitation')).toBeDefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('names the signed-in account when the invitation was sent elsewhere', async () => {
    answerWith({ status: 403, body: { code: 'INVITATION_EMAIL_MISMATCH' } });
    mountRoute();

    expect(await screen.findByText('This invitation was sent to a different email address.')).toBeDefined();
    expect(
      screen.getByText('You are signed in as invitee@example.test. Sign in with the invited address to accept it.'),
    ).toBeDefined();
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it('says a revoked or expired link is spent', async () => {
    answerWith({ status: 404, body: { code: 'INVITATION_NOT_FOUND' } });
    mountRoute();

    expect(await screen.findByText('This invitation link is no longer valid.')).toBeDefined();
    expect(screen.getByText('It was revoked or it has expired. Ask the project owner for a new one.')).toBeDefined();
  });

  /* W3 a2 split `403` in two: an account with no verified address at all is not
     an account at the wrong address, and only one of them is fixed by signing
     in somewhere else. */
  it('asks an unverified account to verify rather than to switch accounts', async () => {
    answerWith({ status: 403, body: { code: 'INVITATION_EMAIL_UNVERIFIED' } });
    mountRoute();

    expect(await screen.findByText('Verify your email address, then open this link again.')).toBeDefined();
    expect(screen.queryByText('This invitation was sent to a different email address.')).toBeNull();
  });

  it('falls back to a generic line for a refusal it does not recognise', async () => {
    answerWith({ status: 403, body: { code: 'SOMETHING_NEW' } });
    mountRoute();

    expect(await screen.findByText('The invitation could not be accepted.')).toBeDefined();
  });

  /* N6: a spinner with no name is a spinner a screen reader cannot report. */
  it('names the loader it shows while the session is still resolving', () => {
    mockSession.mockReturnValue({ data: undefined, isPending: true });
    mountRoute();

    expect(screen.getByRole('status', { name: 'Checking your account' })).toBeDefined();
  });

  /* The hold is the app's own `redirectTo`: the link survives the round trip
     through sign-in and the route runs again on the way back. On the desktop
     build the same mechanism is what "signed out when the link arrived" means
     — main loads this route, and it holds the token across the browser
     sign-in (R4). */
  it('asks a signed-out visitor to sign in and come back here', async () => {
    mockSession.mockReturnValue({ data: undefined, isPending: false });
    mountRoute();

    expect(await screen.findByText('Sign in to accept this invitation')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/auth/sign-in?redirectTo=%2Finvitations%2Ftok_abcdef',
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  /* The page does its own job first and offers the app second (R4): the offer
     is beside the sign-in hold, never instead of it. */
  it('offers Tau Desktop beside the sign-in hold without replacing it', async () => {
    mockSession.mockReturnValue({ data: undefined, isPending: false });
    mountRoute();

    expect(await screen.findByText('Sign in to accept this invitation')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Open in Tau Desktop' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeDefined();
  });
});
