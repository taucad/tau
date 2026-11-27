import { beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation } from 'react-router';
import { ChatErrorUnauthorized } from '#routes/w.$workspace.$project/chat-error-unauthorized.js';

const continueChat = vi.fn();
const regenerate = vi.fn();
const identity = vi.hoisted(() => ({ state: 'signed-out' as 'verified' | 'unverified' | 'signed-out' | 'unknown' }));

vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => ({ continueChat, regenerate }),
}));

vi.mock('#hooks/use-identity.js', () => ({
  useIdentity: () => ({ state: identity.state, user: undefined }),
}));

const standing = vi.hoisted(() => ({ value: undefined as { isEmpty: boolean } | undefined }));
vi.mock('#hooks/use-credit-standing.js', () => ({ useCreditStanding: () => standing.value }));

/* The credits card has its own suite; here it only has to be the card shown. */
vi.mock('#routes/w.$workspace.$project/chat-error-credits.js', () => ({
  ChatErrorCredits: (props: Readonly<Record<string, unknown>>) => (
    <p data-testid='credits-card' data-resumable={String(props['resumable'])} />
  ),
}));

/* The paused-turn card's model picker is not this suite's subject. */
vi.mock('#components/chat/chat-model-selector.js', () => ({ ChatModelSelector: () => null }));

/* The real hook only percent-encodes what it is handed; this suite asserts the
 * return URL the card arms, so the mock keeps it readable. */
vi.mock('#hooks/use-auth-links.js', () => ({
  useAuthLinks: (options?: { readonly redirectTo?: string }) => ({
    signIn: `/auth/sign-in?redirectTo=${options?.redirectTo ?? ''}`,
    signUp: `/auth/sign-up?redirectTo=${options?.redirectTo ?? ''}`,
  }),
}));

function LocationProbe(): React.JSX.Element {
  const { pathname, search } = useLocation();
  return <output data-testid='location'>{`${pathname}${search}`}</output>;
}

const renderAt = (entry: string, resumable = true) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <ChatErrorUnauthorized resumable={resumable} />
      <LocationProbe />
    </MemoryRouter>,
  );

describe('ChatErrorUnauthorized', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    identity.state = 'signed-out';
    standing.value = undefined;
  });

  /* N-4: back from sign-up with a zero balance, the send would be refused, so the card says what it takes now. */
  it('should show the credits card at once for a new account with no credits', () => {
    identity.state = 'verified';
    standing.value = { isEmpty: true };
    renderAt('/w/home/p?chat=chat_1', false);

    expect(screen.getByTestId('credits-card')).toHaveAttribute('data-resumable', 'false');
    expect(screen.queryByText('You’re signed in')).not.toBeInTheDocument();
  });

  it('should invite the send once signed in with credits to spend', () => {
    identity.state = 'verified';
    standing.value = { isEmpty: false };
    renderAt('/w/home/p?chat=chat_1', false);

    expect(screen.getByText('You’re signed in')).toBeInTheDocument();
    expect(screen.queryByTestId('credits-card')).not.toBeInTheDocument();
  });

  it('should offer sign-in first and account creation second', () => {
    renderAt('/w/home/p');

    expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
    expect(screen.getByText('Your turn is paused. Sign in and Tau resumes where it stopped.')).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Sign in', 'Create account']);
  });

  it('should let the keyboard reach both recovery links in order', async () => {
    const user = userEvent.setup();
    renderAt('/w/home/p');

    await user.tab();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveFocus();
  });

  it.each([
    { label: 'Sign in', path: '/auth/sign-in' },
    { label: 'Create account', path: '/auth/sign-up' },
  ])('should keep $label named while its destination loads', async ({ label, path }) => {
    const user = userEvent.setup();
    const destination = Promise.withResolvers<void>();
    const router = createMemoryRouter(
      [
        { path: '/w/home/p', element: <ChatErrorUnauthorized resumable /> },
        {
          path,
          loader: async () => {
            await destination.promise;
            return null;
          },
          element: <p>Authentication</p>,
        },
      ],
      { initialEntries: ['/w/home/p'] },
    );
    const view = render(<RouterProvider router={router} />);

    try {
      await user.click(screen.getByRole('link', { name: label }));
      expect(router.state.navigation.state).toBe('loading');
      expect(screen.getByRole('link', { name: label })).toHaveTextContent(label);
    } finally {
      await act(async () => {
        destination.resolve();
        await destination.promise;
      });
      view.unmount();
      router.dispose();
    }
  });

  it('should arm a resume on the sign-in return URL, keeping the search it already carries', () => {
    renderAt('/w/home/p?chat=chat_1');

    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/auth/sign-in?redirectTo=/w/home/p?chat=chat_1&chatResume=1');
    expect(links[1]).toHaveAttribute('href', '/auth/sign-up?redirectTo=/w/home/p?chat=chat_1&chatResume=1');
    expect(continueChat).not.toHaveBeenCalled();
  });

  /* Launch audit N-2: the card used to resume from its own mount effect, on every mount, and to navigate to the URL
   * it was on. The resume after sign-in has one owner, `ChatSignInReturn`. */
  it('should neither resume nor navigate when it mounts on a return URL', () => {
    renderAt('/w/home/p?chat=chat_1&chatResume=1');

    expect(continueChat).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/w/home/p?chat=chat_1&chatResume=1');
  });

  it('should promise no resume and arm none for a turn that never started', () => {
    renderAt('/w/home/p?chat=chat_1&chatResume=1', false);

    expect(screen.getByText('Create an account to send this')).toBeInTheDocument();
    expect(screen.getByText('Your message stays here. Sign up free, then send it.')).toBeInTheDocument();
    expect(screen.queryByText(/resumes where it stopped/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/credit/iu)).not.toBeInTheDocument();
    // A first prompt is almost always a new person's: Create account leads.
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/auth/sign-up?redirectTo=/w/home/p?chat=chat_1');
    expect(links[1]).toHaveAttribute('href', '/auth/sign-in?redirectTo=/w/home/p?chat=chat_1');
  });

  it.each(['unknown', 'unverified'] as const)('should keep offering sign-in while the identity is %s', (state) => {
    identity.state = state;
    renderAt('/w/home/p');

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['Sign in', 'Create account']);
  });

  /* The failure can be older than the session: the sign-in page sends a signed-in person straight back. */
  it('should offer Resume, and no sign-in, to a person who is signed in', async () => {
    const user = userEvent.setup();
    identity.state = 'verified';
    renderAt('/w/home/p?chat=chat_1');

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign in to continue')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resume' }));

    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it('should ask a signed-in person only to send, for a turn that never started', () => {
    identity.state = 'verified';
    renderAt('/w/home/p?chat=chat_1', false);

    expect(screen.getByText('Send your message to continue.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
