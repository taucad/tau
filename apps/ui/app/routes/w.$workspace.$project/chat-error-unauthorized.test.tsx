import { beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation } from 'react-router';
import { ChatErrorUnauthorized } from '#routes/w.$workspace.$project/chat-error-unauthorized.js';

const continueChat = vi.fn();

vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => ({ continueChat }),
}));

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

const renderAt = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <ChatErrorUnauthorized />
      <LocationProbe />
    </MemoryRouter>,
  );

describe('ChatErrorUnauthorized', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        { path: '/w/home/p', element: <ChatErrorUnauthorized /> },
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

  it('should resume the paused turn on return from sign-in and strip the armed parameter', () => {
    renderAt('/w/home/p?chat=chat_1&chatResume=1');

    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('location')).toHaveTextContent('/w/home/p?chat=chat_1');
    expect(screen.getByTestId('location').textContent).not.toContain('chatResume');
  });
});
