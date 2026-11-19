// @vitest-environment jsdom
/**
 * `/invitations` — the invitee's half of D27. The link lands on
 * `/invitations/<token>`, which holds the token and redirects here (#2290).
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
vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({ createProject: mockCreateProject, getProjects: async () => [] }),
}));
/* eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names. */
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test' } }));

const { default: AcceptInvitation } = await import('#routes/invitations._index/route.js');
const { holdPendingInvitation, readPendingInvitation } = await import('#lib/pending-invitation.lib.js');

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
      <MemoryRouter initialEntries={['/invitations']}>
        <Routes>
          <Route path='/invitations' element={<AcceptInvitation />} />
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
    globalThis.sessionStorage.clear();
    // The desktop host's hold; the web cookie is read by the same function (`pending-invitation.lib.test.ts`).
    holdPendingInvitation('tok_abcdef');
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
    expect(queryClient.getQueryData(['cloud-projects', 'user_1'])).toStrictEqual([
      {
        id: 'proj_shared00000000000000',
        name: 'Shared Housing',
        role: 'write',
        canDeleteCloud: false,
        cloudState: 'active',
      },
    ]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.test/v1/invitations/accept',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ token: 'tok_abcdef' }),
      }),
    );
    /* No request line carries the token: access logs record paths, not bodies. */
    for (const [input] of vi.mocked(globalThis.fetch).mock.calls) {
      const address = input instanceof Request ? input.url : input.toString();
      expect(address).not.toContain('tok_abcdef');
    }
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

    expect(await screen.findByText('Couldn’t accept the invitation')).toBeDefined();
  });

  /* N6: a spinner with no name is a spinner a screen reader cannot report. */
  it('names the loader it shows while the session is still resolving', () => {
    mockSession.mockReturnValue({ data: undefined, isPending: true });
    mountRoute();

    expect(screen.getByRole('status', { name: 'Checking your account' })).toBeDefined();
  });

  /* The token waits where `/invitations/<token>` held it, not in the address:
     the sign-in round trip returns to `/invitations` and the route runs again
     on the way back. On the desktop build the same hold is what "signed out
     when the link arrived" means — main loads the link, and the token waits in
     session storage across the browser sign-in (R4). #2290: no `redirectTo`
     carries the token any more. */
  it('asks a signed-out visitor to sign in and come back here', async () => {
    mockSession.mockReturnValue({ data: undefined, isPending: false });
    mountRoute();

    expect(await screen.findByText('Sign in to accept this invitation')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/auth/sign-in?redirectTo=%2Finvitations',
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(document.body.innerHTML).not.toContain('tok_abcdef');
    expect(readPendingInvitation()).toBe('tok_abcdef');
  });

  it('says there is nothing to open when no token is held', async () => {
    globalThis.sessionStorage.clear();
    mountRoute();

    expect(await screen.findByText('There is no invitation to open.')).toBeDefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('forgets the token once the invitation is accepted', async () => {
    mountRoute();

    await waitFor(() => {
      expect(screen.getByTestId('pathname').textContent).toBe('/w/home/shared-housing');
    });
    expect(readPendingInvitation()).toBeUndefined();
  });

  it('forgets a spent token', async () => {
    answerWith({ status: 404, body: { code: 'INVITATION_NOT_FOUND' } });
    mountRoute();
    expect(await screen.findByText('This invitation link is no longer valid.')).toBeDefined();
    expect(readPendingInvitation()).toBeUndefined();
  });

  it('keeps the token when the signed-in account is the wrong one', async () => {
    answerWith({ status: 403, body: { code: 'INVITATION_EMAIL_MISMATCH' } });
    mountRoute();

    expect(await screen.findByText('This invitation was sent to a different email address.')).toBeDefined();
    expect(readPendingInvitation()).toBe('tok_abcdef');
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
